from __future__ import annotations

from urllib.parse import quote


def build_claim_share_link(bridge_ws_url: str, authority_id: str, share_id: str, secret: str) -> str:
    base = _http_base(bridge_ws_url)
    return f"{base}/share/{quote(share_id, safe='')}?authority={quote(authority_id, safe='')}#claim={quote(secret, safe='')}"


def build_bearer_share_link(bridge_ws_url: str, authority_id: str, share_code: str, consumer_private_key: str) -> str:
    base = _http_base(bridge_ws_url)
    return f"{base}/share/{quote(share_code, safe='')}?authority={quote(authority_id, safe='')}#key={quote(consumer_private_key, safe='')}"


def _http_base(bridge_ws_url: str) -> str:
    base = bridge_ws_url.rstrip("/")
    if base.startswith("wss://"):
        return "https://" + base[6:]
    if base.startswith("ws://"):
        return "http://" + base[5:]
    return base
