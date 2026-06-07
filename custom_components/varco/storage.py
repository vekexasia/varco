from __future__ import annotations

from typing import Any

from .const import STORAGE_KEY, STORAGE_VERSION
from .models import AccessRequest, AccessStatus, Grant, utcnow


class MemoryVarcoStore:
    def __init__(self) -> None:
        self._data: dict[str, Any] = {"access_requests": {}, "grants": {}, "audit": []}

    async def async_load_data(self) -> dict[str, Any]:
        self._data.setdefault("access_requests", {})
        self._data.setdefault("grants", {})
        self._data.setdefault("audit", [])
        return self._data

    async def async_save_data(self, data: dict[str, Any] | None = None) -> None:
        if data is not None:
            self._data = data

    async def async_upsert_access_request(self, request: AccessRequest) -> None:
        data = await self.async_load_data()
        data["access_requests"][request.request_id] = request.as_dict()
        await self.async_save_data(data)

    async def async_get_access_request(self, request_id: str) -> AccessRequest | None:
        raw = (await self.async_load_data())["access_requests"].get(request_id)
        return AccessRequest.from_dict(raw) if raw else None

    async def async_list_access_requests(self) -> list[AccessRequest]:
        data = await self.async_load_data()
        return [AccessRequest.from_dict(item) for item in data["access_requests"].values()]

    async def async_upsert_grant(self, grant: Grant) -> None:
        data = await self.async_load_data()
        data["grants"][grant.consumer_pk] = grant.as_dict()
        await self.async_save_data(data)

    async def async_get_grant_by_consumer(self, consumer_pk: str) -> Grant | None:
        raw = (await self.async_load_data())["grants"].get(consumer_pk)
        return Grant.from_dict(raw) if raw else None

    async def async_get_grant(self, grant_id: str) -> Grant | None:
        for raw in (await self.async_load_data())["grants"].values():
            if raw.get("grant_id") == grant_id:
                return Grant.from_dict(raw)
        return None

    async def async_list_grants(self) -> list[Grant]:
        return [Grant.from_dict(item) for item in (await self.async_load_data())["grants"].values()]

    async def async_approve_request(self, request_id: str) -> Grant:
        request = await self.async_get_access_request(request_id)
        if request is None:
            raise KeyError(request_id)
        request.status = AccessStatus.APPROVED
        request.decided_at = utcnow()
        grant = Grant(grant_id=request.request_id, consumer_pk=request.consumer_pk, manifest=request.manifest, request_id=request.request_id)
        await self.async_upsert_access_request(request)
        await self.async_upsert_grant(grant)
        return grant

    async def async_reject_request(self, request_id: str) -> None:
        request = await self.async_get_access_request(request_id)
        if request is None:
            raise KeyError(request_id)
        request.status = AccessStatus.REJECTED
        request.decided_at = utcnow()
        await self.async_upsert_access_request(request)

    async def async_revoke_grant(self, grant_id: str) -> Grant:
        grant = await self.async_get_grant(grant_id)
        if grant is None:
            raise KeyError(grant_id)
        grant.revoked = True
        grant.revoked_at = utcnow()
        await self.async_upsert_grant(grant)
        return grant

    async def async_append_audit(self, event: dict[str, Any]) -> None:
        data = await self.async_load_data()
        data["audit"].append(event)
        data["audit"] = data["audit"][-1000:]
        await self.async_save_data(data)

    async def async_audit_events(self) -> list[dict[str, Any]]:
        return list((await self.async_load_data())["audit"])


class HomeAssistantVarcoStore(MemoryVarcoStore):
    def __init__(self, hass) -> None:
        super().__init__()
        from homeassistant.helpers.storage import Store
        self._store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self._loaded = False

    async def async_load_data(self) -> dict[str, Any]:
        if not self._loaded:
            self._data = await self._store.async_load() or {"access_requests": {}, "grants": {}, "audit": []}
            self._loaded = True
        return await super().async_load_data()

    async def async_save_data(self, data: dict[str, Any] | None = None) -> None:
        await super().async_save_data(data)
        await self._store.async_save(self._data)
