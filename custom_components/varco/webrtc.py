from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Awaitable, Callable

_LOGGER = logging.getLogger(__name__)

MessageHandler = Callable[[dict[str, Any]], Awaitable[dict[str, Any]]]


class AioRtcPeerStack:
    def __init__(self) -> None:
        from aiortc import RTCConfiguration, RTCIceServer

        self._configuration = RTCConfiguration([RTCIceServer("stun:stun.l.google.com:19302")])
        self._peers: dict[str, Any] = {}
        self._channels: dict[str, Any] = {}

    async def create_answer(self, session_id: str, offer_sdp: str, handler: MessageHandler) -> dict[str, str]:
        from aiortc import RTCSessionDescription, RTCPeerConnection

        pc = RTCPeerConnection(configuration=self._configuration)
        old = self._peers.pop(session_id, None)
        if old is not None:
            await old.close()
        self._peers[session_id] = pc

        @pc.on("datachannel")
        def on_datachannel(channel):
            self._channels[session_id] = channel

            @channel.on("close")
            def on_close():
                current = self._channels.get(session_id)
                if current is channel:
                    self._channels.pop(session_id, None)

            @channel.on("message")
            def on_message(message):
                async def handle() -> None:
                    try:
                        payload = json.loads(message if isinstance(message, str) else message.decode())
                        response = await handler(payload)
                        channel.send(json.dumps(response, separators=(",", ":")))
                    except Exception:
                        _LOGGER.exception("Varco WebRTC datachannel message failed")
                        channel.send(json.dumps({"type": "error", "code": "webrtc_error", "message": "Internal error"}, separators=(",", ":")))

                asyncio.create_task(handle())

        @pc.on("connectionstatechange")
        async def on_connectionstatechange():
            if pc.connectionState in {"failed", "closed", "disconnected"}:
                current = self._peers.get(session_id)
                if current is pc:
                    self._peers.pop(session_id, None)
                await pc.close()

        await pc.setRemoteDescription(RTCSessionDescription(sdp=offer_sdp, type="offer"))
        answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        await self._wait_for_ice_gathering(pc)
        return {"sdp": pc.localDescription.sdp, "sdp_type": pc.localDescription.type}

    async def send_event(self, session_id: str, payload: dict[str, Any]) -> bool:
        channel = self._channels.get(session_id)
        if channel is None:
            return False
        try:
            channel.send(json.dumps(payload, separators=(",", ":")))
            return True
        except Exception:
            self._channels.pop(session_id, None)
            return False

    async def close(self, session_id: str) -> None:
        self._channels.pop(session_id, None)
        pc = self._peers.pop(session_id, None)
        if pc is not None:
            await pc.close()

    async def close_all(self) -> None:
        self._channels.clear()
        peers = list(self._peers.values())
        self._peers.clear()
        for pc in peers:
            await pc.close()

    async def _wait_for_ice_gathering(self, pc: Any) -> None:
        if pc.iceGatheringState == "complete":
            return
        done = asyncio.Event()

        @pc.on("icegatheringstatechange")
        def on_icegatheringstatechange():
            if pc.iceGatheringState == "complete":
                done.set()

        try:
            await asyncio.wait_for(done.wait(), timeout=5)
        except TimeoutError:
            pass


def create_peer_stack_or_none() -> AioRtcPeerStack | None:
    try:
        return AioRtcPeerStack()
    except Exception as err:
        _LOGGER.warning("Varco WebRTC unavailable, relay fallback only: %s", err)
        return None
