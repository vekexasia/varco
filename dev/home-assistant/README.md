# Varco Home Assistant development instance

This directory contains the Docker Compose Home Assistant instance used for local Varco integration development and remote showcase deployment.

The canonical development guide is [`docs/development.md`](../../docs/development.md). It covers repository commands, local restart/verification, synthetic entities, Proxmox/LXC deployment, and CI deployment secrets.

Quick local restart from this directory:

```bash
docker compose down
docker compose up -d
docker compose ps
curl -f http://127.0.0.1:8123/
curl -f http://127.0.0.1:8123/varco
```

Open the local instance at:

```text
http://127.0.0.1:8123
```

Open the synthetic energy dashboard at:

```text
http://127.0.0.1:8123/varco-showcase/energy
```

Runtime Home Assistant storage under `config/.storage/` is local state and must not be committed.


Useful automation commands from the repository root:

```bash
npm run dev:ha:list
npm run dev:ha:smoke
npm run dev:ha:pair
npm run dev:ha:approve -- REQUEST_ID
npm run dev:ha:delete-grant -- GRANT_ID
```
