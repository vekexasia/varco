from __future__ import annotations

import base64
import hashlib
import json
import secrets
from typing import Any

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ed25519, ec
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF


def b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def b64url_decode(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def canonical_json(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()


def _ed_private_from_b64(private_key: str) -> ed25519.Ed25519PrivateKey:
    return ed25519.Ed25519PrivateKey.from_private_bytes(b64url_decode(private_key))


def _ed_public_from_b64(public_key: str) -> ed25519.Ed25519PublicKey:
    return ed25519.Ed25519PublicKey.from_public_bytes(b64url_decode(public_key))


def generate_authority_keypair() -> dict[str, str]:
    key = ed25519.Ed25519PrivateKey.generate()
    private = key.private_bytes(serialization.Encoding.Raw, serialization.PrivateFormat.Raw, serialization.NoEncryption())
    public = key.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    return {"private_key": b64url_encode(private), "public_key": b64url_encode(public), "authority_id": b64url_encode(public)}


def generate_consumer_keypair() -> dict[str, str]:
    return generate_authority_keypair()


def sign_challenge(private_key: str, nonce: str) -> str:
    return b64url_encode(_ed_private_from_b64(private_key).sign(b64url_decode(nonce)))


def sign_bytes(private_key: str, payload: bytes) -> str:
    return b64url_encode(_ed_private_from_b64(private_key).sign(payload))


def verify_signature(public_key: str, signature: str, payload: bytes) -> bool:
    try:
        _ed_public_from_b64(public_key).verify(b64url_decode(signature), payload)
        return True
    except (InvalidSignature, ValueError):
        return False


def access_request_payload(nonce: str, manifest: dict[str, Any]) -> bytes:
    digest = hashlib.sha256(canonical_json(manifest)).digest()
    return b"varco-access-request-v1\0" + nonce.encode() + b"\0" + digest


def sign_access_request(private_key: str, nonce: str, manifest: dict[str, Any]) -> str:
    return sign_bytes(private_key, access_request_payload(nonce, manifest))


def verify_access_request(public_key: str, nonce: str, manifest: dict[str, Any], signature: str) -> bool:
    return verify_signature(public_key, signature, access_request_payload(nonce, manifest))


def authenticate_payload(nonce: str) -> bytes:
    return b"varco-authenticate-v1\0" + nonce.encode()


def sign_authenticate(private_key: str, nonce: str) -> str:
    return sign_bytes(private_key, authenticate_payload(nonce))


def verify_authenticate(public_key: str, nonce: str, signature: str) -> bool:
    return verify_signature(public_key, signature, authenticate_payload(nonce))


def new_id(length: int = 16) -> str:
    return b64url_encode(secrets.token_bytes(length))


def pairing_code(consumer_pk: str, nonce: str) -> str:
    digest = hashlib.sha256(f"{consumer_pk}:{nonce}".encode()).digest()
    return f"{int.from_bytes(digest[:4], 'big') % 1_000_000:06d}"


class SecureServerSession:
    def __init__(self, key: bytes) -> None:
        self._key = AESGCM(key)
        self._send_nonce = 0
        self._recv_nonce = 0

    @staticmethod
    def _nonce(value: int) -> bytes:
        return value.to_bytes(12, "big")

    @classmethod
    def from_client_hello(cls, authority_private_key: str, authority_id: str, client_pub_spki: str) -> tuple["SecureServerSession", dict[str, str]]:
        server_private = ec.generate_private_key(ec.SECP256R1())
        client_public = serialization.load_der_public_key(b64url_decode(client_pub_spki))
        shared = server_private.exchange(ec.ECDH(), client_public)
        key = HKDF(algorithm=hashes.SHA256(), length=32, salt=b64url_decode(authority_id), info=b"varco-session-v1").derive(shared)
        server_pub_der = server_private.public_key().public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
        transcript = b"varco-server-hello-v1\0" + b64url_decode(client_pub_spki) + b"\0" + server_pub_der
        hello = {"type": "server_hello", "server_pub": b64url_encode(server_pub_der), "signature": sign_bytes(authority_private_key, transcript)}
        return cls(key), hello

    def encrypt(self, payload: dict[str, Any]) -> dict[str, str]:
        nonce = self._nonce(self._send_nonce)
        self._send_nonce += 1
        body = self._key.encrypt(nonce, canonical_json(payload), None)
        return {"type": "ciphertext", "nonce": b64url_encode(nonce), "body": b64url_encode(body)}

    def decrypt(self, envelope: dict[str, Any]) -> dict[str, Any]:
        nonce = b64url_decode(envelope["nonce"])
        if nonce != self._nonce(self._recv_nonce):
            raise ValueError("unexpected nonce")
        body = b64url_decode(envelope["body"])
        self._recv_nonce += 1
        return json.loads(self._key.decrypt(nonce, body, None).decode())
