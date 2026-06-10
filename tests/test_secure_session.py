import pytest
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from custom_components.varco.crypto import (
    SecureServerSession,
    b64url_decode,
    b64url_encode,
    canonical_json,
    challenge_payload,
    generate_authority_keypair,
    sign_authenticate,
    sign_challenge,
    verify_authenticate,
    verify_signature,
)


def _client_hello(authority):
    client_private = ec.generate_private_key(ec.SECP256R1())
    client_pub_der = client_private.public_key().public_bytes(
        serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo
    )
    session, hello = SecureServerSession.from_client_hello(
        authority["private_key"], authority["authority_id"], b64url_encode(client_pub_der)
    )
    server_public = serialization.load_der_public_key(b64url_decode(hello["server_pub"]))
    shared = client_private.exchange(ec.ECDH(), server_public)
    salt = b64url_decode(authority["authority_id"])

    def hkdf(info):
        return HKDF(algorithm=hashes.SHA256(), length=32, salt=salt, info=info).derive(shared)

    client_keys = {
        "send": hkdf(b"varco-session-c2s-v1"),
        "recv": hkdf(b"varco-session-s2c-v1"),
        "binding": b64url_encode(hkdf(b"varco-channel-binding-v1")),
    }
    return session, hello, client_keys


def test_directions_use_independent_keys():
    authority = generate_authority_keypair()
    session, _, client_keys = _client_hello(authority)
    assert client_keys["send"] != client_keys["recv"]

    envelope = session.encrypt({"hello": "world"})
    nonce = b64url_decode(envelope["nonce"])
    body = b64url_decode(envelope["body"])
    assert AESGCM(client_keys["recv"]).decrypt(nonce, body, None) == b'{"hello":"world"}'
    with pytest.raises(Exception):
        AESGCM(client_keys["send"]).decrypt(nonce, body, None)


def test_client_and_server_derive_same_channel_binding():
    authority = generate_authority_keypair()
    session, _, client_keys = _client_hello(authority)
    assert session.channel_binding == client_keys["binding"]


def test_channel_bindings_differ_per_session():
    authority = generate_authority_keypair()
    session_a, _, _ = _client_hello(authority)
    session_b, _, _ = _client_hello(authority)
    assert session_a.channel_binding != session_b.channel_binding


def test_authenticate_bound_to_session_rejects_replay_in_new_session():
    authority = generate_authority_keypair()
    consumer = generate_authority_keypair()
    session_a, _, _ = _client_hello(authority)
    session_b, _, _ = _client_hello(authority)
    nonce = "client-chosen-nonce"
    signature = sign_authenticate(consumer["private_key"], nonce, session_a.channel_binding)
    assert verify_authenticate(consumer["public_key"], nonce, signature, session_a.channel_binding)
    assert not verify_authenticate(consumer["public_key"], nonce, signature, session_b.channel_binding)


def test_challenge_signature_is_domain_separated():
    authority = generate_authority_keypair()
    nonce = b64url_encode(b"\x02" * 32)
    signature = sign_challenge(authority["private_key"], nonce)
    assert verify_signature(authority["public_key"], signature, challenge_payload(nonce))
    assert not verify_signature(authority["public_key"], signature, b64url_decode(nonce))
    assert not verify_signature(
        authority["public_key"],
        signature,
        b"varco-server-hello-v1\0" + b64url_decode(nonce),
    )


def test_server_hello_signature_covers_handshake_transcript():
    authority = generate_authority_keypair()
    client_private = ec.generate_private_key(ec.SECP256R1())
    client_pub_der = client_private.public_key().public_bytes(
        serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo
    )
    _, hello = SecureServerSession.from_client_hello(
        authority["private_key"], authority["authority_id"], b64url_encode(client_pub_der)
    )
    assert hello["type"] == "server_hello"
    transcript = b"varco-server-hello-v1\0" + client_pub_der + b"\0" + b64url_decode(hello["server_pub"])
    assert verify_signature(authority["public_key"], hello["signature"], transcript)
    other_client = ec.generate_private_key(ec.SECP256R1()).public_key().public_bytes(
        serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo
    )
    swapped = b"varco-server-hello-v1\0" + other_client + b"\0" + b64url_decode(hello["server_pub"])
    assert not verify_signature(authority["public_key"], hello["signature"], swapped)


def test_decrypt_rejects_tampered_ciphertext():
    authority = generate_authority_keypair()
    session, _, client_keys = _client_hello(authority)
    nonce = (0).to_bytes(12, "big")
    body = bytearray(AESGCM(client_keys["send"]).encrypt(nonce, b'{"a":1}', None))
    body[0] ^= 0xFF
    envelope = {
        "type": "ciphertext",
        "nonce": b64url_encode(nonce),
        "body": b64url_encode(bytes(body)),
    }
    with pytest.raises(Exception):
        session.decrypt(envelope)


def test_decrypt_rejects_replayed_envelope():
    authority = generate_authority_keypair()
    session, _, client_keys = _client_hello(authority)
    nonce = (0).to_bytes(12, "big")
    envelope = {
        "type": "ciphertext",
        "nonce": b64url_encode(nonce),
        "body": b64url_encode(AESGCM(client_keys["send"]).encrypt(nonce, b'{"a":1}', None)),
    }
    assert session.decrypt(envelope) == {"a": 1}
    with pytest.raises(ValueError):
        session.decrypt(envelope)


def test_roundtrip_large_payloads_advance_counters():
    authority = generate_authority_keypair()
    session, _, client_keys = _client_hello(authority)
    aes = AESGCM(client_keys["send"])
    for counter in range(2):
        payload = {"data": "x" * 200_000, "seq": counter}
        nonce = counter.to_bytes(12, "big")
        envelope = {
            "type": "ciphertext",
            "nonce": b64url_encode(nonce),
            "body": b64url_encode(aes.encrypt(nonce, canonical_json(payload), None)),
        }
        assert session.decrypt(envelope) == payload
        reply = session.encrypt(payload)
        assert b64url_decode(reply["nonce"]) == nonce
        decrypted = AESGCM(client_keys["recv"]).decrypt(
            b64url_decode(reply["nonce"]), b64url_decode(reply["body"]), None
        )
        assert decrypted == canonical_json(payload)


def test_decrypt_rejects_out_of_order_nonce():
    authority = generate_authority_keypair()
    session, _, client_keys = _client_hello(authority)
    aes = AESGCM(client_keys["send"])
    nonce = (1).to_bytes(12, "big")
    envelope = {
        "type": "ciphertext",
        "nonce": b64url_encode(nonce),
        "body": b64url_encode(aes.encrypt(nonce, b'{"a":1}', None)),
    }
    with pytest.raises(ValueError):
        session.decrypt(envelope)
