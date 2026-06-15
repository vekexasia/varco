from custom_components.varco.share_links import build_bearer_share_link, build_claim_share_link


def test_bearer_share_link_keeps_private_key_in_fragment():
    link = build_bearer_share_link(
        "wss://bridge.example/ws/",
        "authority/id",
        "grant id",
        "private/key",
    )
    assert link == "https://bridge.example/ws/share/grant%20id?authority=authority%2Fid#key=private%2Fkey"
    assert "private/key" not in link.split("#", 1)[0]


def test_claim_share_link_keeps_claim_secret_in_fragment():
    link = build_claim_share_link(
        "wss://bridge.example/ws/",
        "authority/id",
        "share id",
        "claim/secret",
    )
    assert link == "https://bridge.example/ws/share/share%20id?authority=authority%2Fid#claim=claim%2Fsecret"
    assert "claim/secret" not in link.split("#", 1)[0]
