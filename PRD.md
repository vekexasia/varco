# Varco — PRD

> Nome di lavoro: **Varco** (il varco controllato verso casa). Sostituibile;
> alternative scartate: ha-consent-link, ha-grant-bridge.

## Una riga

Connettività sicura a Home Assistant per consumer esterni (dashboard, app,
script), **senza esporre HA su internet**, con grant nati da un **consent flow
approvato dentro HA** (notifica con la lista permessi) invece che da un bearer
link, scope read-only di default, e data path che parte via relay opaco e può
promuoversi a WebRTC P2P.

Varco è l'evoluzione agnostica di `ha-share-actions`: quel progetto è
action-centric (condividi un bottone con link+PIN); Varco generalizza a "un
consumer qualunque chiede accesso, l'owner approva permessi specifici". La
prima dashboard consumer è la **Gazzetta** (custom card / standalone).

## Perché, e cosa cambia rispetto a ha-share-actions

`ha-share-actions` (in `~/git/personale/ha-share-actions`) ha già risolto il
trasporto e va riciclato quasi per intero:

- **Si tiene**: bridge Cloudflare Durable Object opaco (hibernation API, costo
  ~0 a riposo), identità Ed25519 dell'Authority, handshake X25519 +
  `crypto_aead_xchacha20poly1305_ietf` (PyNaCl lato HA), Authority Presence,
  relay outbound (HA non riceve connessioni in ingresso), QR transfer.
- **Cambia**: il modello di autorizzazione. Lì il grant si crea in HA e produce
  un bearer link (segreto che gira). Qui il grant nasce da una **richiesta del
  consumer** che l'owner **approva** in HA, ed è **legato alla chiave del
  consumer**, non a un segreto trasportabile.
- **Si aggiunge**: manifest+consent flow, scope engine read/act separati, data
  message types (subscribe/history/snapshot), WebRTC come ottimizzazione.
- **Resta compatibile**: il vecchio "bearer link per condividere un bottone"
  può rimanere come profilo d'uso (cancello alla famiglia), non è il primario.

## Attori

- **Owner**: possiede HA, approva/revoca i consumer e i loro scope.
- **Consumer**: app esterna (la Gazzetta è la prima). Ha un keypair proprio e un
  manifest. NON è un utente HA.
- **Authority**: l'installazione HA locale (custom integration), unica a
  autorizzare ed eseguire. Tiene la WS outbound verso il bridge.
- **Bridge**: relay Cloudflare opaco; instrada buste cifrate, non vede contenuti.

## Concetti

- **Consumer identity**: keypair (Ed25519 firma / X25519 ECDH) generato dal
  consumer alla prima esecuzione, persistito localmente (localStorage in
  browser). La public key È l'identità del consumer.
- **Manifest**: dichiarazione del consumer — `name`, `icon`, `version`, e
  `scopes` richiesti. Mostrato all'owner in fase di consenso.
- **Scope** (granulari, read-only di default):
  - `read:entities` → lista esplicita di entity_id leggibili
  - `subscribe` → push dei delta di stato delle entità in scope
  - `history` → query storico per le entità in scope
  - `camera_snapshot` → frame JPEG periodici (no streaming live in MVP)
  - `act:<domain.service>@<entity_id>` → **opt-in esplicito per singola azione**;
    set vuoto di default. Questo realizza il "ricevere dati ma non attuare nulla".
  - opzionali: `expires_at`, `pin_for_act` (PIN come 2FA solo per le azioni)
- **Grant**: scope approvati dall'owner, legati alla consumer public key.
  Vive in HA storage; revocabile dal pannello.
- **Pairing code**: 6 cifre derivate da `hash(consumer_pk ‖ authority_pk ‖
  nonce)`, mostrate IDENTICHE su consumer e nella notifica HA → difesa contro
  approvazione della richiesta sbagliata (numeric comparison stile Bluetooth).

## Flusso di consenso (il cuore del progetto)

1. Consumer alla prima apertura genera keypair + costruisce il manifest (per la
   Gazzetta gli scope `read:entities` si **derivano dalla config YAML della
   card**: la dashboard sa già quali entità le servono).
2. Pairing iniziale con l'Authority: l'owner inserisce nel consumer un
   `authorityId` (o scansiona un QR da HA). Una tantum per Authority.
3. Consumer manda **AccessRequest** via bridge: `{ manifest, consumer_pk,
   nonce }` dentro la sessione cifrata.
4. HA mostra **pairing code** + **notifica** (persistent notification + push
   companion): "*La Casa Dashboard* chiede: lettura 87 entità, storico,
   snapshot 9 camere, **nessuna azione**. Codice: 482193".
5. Owner verifica che il codice combaci e approva — **può potare gli scope**
   (togliere camere, ridurre entità, negare azioni) prima di emettere.
6. HA emette il **Grant** legato a `consumer_pk`. Da qui ogni sessione si
   autentica con challenge/firma della consumer key: niente segreto nel link.
7. Revoca: pannello HA con i consumer attivi, ultimo accesso, scope; un tap
   revoca.

## Data plane (message types nuovi, tutti dentro la sessione cifrata)

Enforcement SEMPRE lato Authority (whitelist scope, rate limit, audit). Il
bridge resta opaco. Tutto deve funzionare **solo via relay**; WebRTC è
ottimizzazione.

- `get_states` → snapshot delle entità in `read:entities`
- `subscribe_states` / `state_delta` → push dei cambi (richiede `subscribe`)
- `history_query` → `history/history_during_period` proxato (richiede `history`)
- `call_service` → validato contro `act:*`; se `pin_for_act`, richiede il PIN
  nella stessa sessione cifrata (verifica offline impossibile, come oggi)
- `camera_snapshot` → JPEG ridimensionato via `auth/sign_path` lato Authority,
  reinoltrato nel tunnel (no URL firmate verso il client: HA non è raggiungibile)

## WebRTC (fase successiva, opzionale)

- Signaling SDP/ICE passa nel tunnel cifrato già esistente.
- Stabilito il DataChannel, delta/history/snapshot migrano su **P2P diretto**;
  il bridge esce di scena (resta per signaling e come fallback).
- ICE: STUN pubblico per hole punching (~85% dei casi); TURN solo per NAT
  ostili/CGNAT — da hostare (coturn) o Cloudflare Realtime. Misurare col POC
  quanto serve davvero dalle reti reali (casa/4G/ufficio).
- In LAN ICE negozia il percorso locale → latenza da rete locale con lo stesso link.
- Lato HA: `aiortc` (verificare footprint dentro HAOS). Lato browser: nativo.
- go2rtc (già nell'ecosistema HA) fa WebRTC per le camere: lo streaming live è
  un progetto a parte, eventualmente integrabile dopo.

## Threat model (sintesi)

- Bridge compromesso → vede solo `authorityId`, `consumerId`, timing, dimensioni.
  Mai entità/stati/azioni/PIN/scope (E2E XChaCha20, come share-actions).
- Link/identità consumer rubata → senza la private key non si autentica; e la
  prima volta l'owner ha comunque approvato. Revoca per-consumer in HA.
- Approvazione della richiesta sbagliata → mitigata dal pairing code (numeric
  comparison): si approva solo se i 6 numeri combaciano.
- Default zero-trust: nessuna azione possibile finché non c'è un `act:` esplicito.

## Riuso concreto da ha-share-actions

| Pezzo | Riuso |
|---|---|
| `bridge/` (DO, hibernation, presence, shorten, transfer) | ~intatto; aggiungere routing per AccessRequest se serve |
| `custom_components/share_actions/crypto.py` (SecureSession, Ed25519) | intatto |
| `relay.py` (WS outbound, reconnect, challenge/sign) | base, estendere con i nuovi message types |
| `storage.py`, `models.py` | rimodellare: da ShareGrant(action) a Grant(consumer+scopes) |
| `config_flow.py`, `notify.py`, frontend panel | il panel diventa **consent/management**, non creation |
| `action_catalog.py`, `constraints.py` | riusabili per la validazione `act:` |
| QR transfer | utile per onboardare il consumer su un secondo device |

## Roadmap

- **Fase 0** — POC: AccessRequest+consent end-to-end (notifica HA finta ok),
  scope engine read-only, Gazzetta che deriva gli scope dalla config. POC
  `aiortc` isolato + misura hole punching dalle reti reali.
- **Fase 1** — Protocollo dati nel relay (get_states/subscribe/history/
  call_service/camera_snapshot) + enforcement scope + audit. Funziona via relay.
- **Fase 2** — `HassProvider` astratto nella gazzetta-card: `Ctx` accetta o
  l'`hass` di Lovelace o il client Varco. Entry point standalone su CF Pages.
  **A fine fase 2: Gazzetta remota funzionante** (relay, link+consenso+PIN).
- **Fase 3** — WebRTC data path + camere via snapshot JPEG.
- **Fase 4** — Grant per-persona (famiglia: Panoramica+Sicurezza; owner: tutto),
  gestione sessioni lunghe (tablet h24), QR transfer, rifiniture.

Incognite aperte: footprint aiortc in HAOS; costi DO con sessioni dashboard h24
via relay; quanto generalizzare il protocollo senza rompere l'MVP share-actions.

---

# Setup operativo per una nuova sessione (deploy & test su HA reale)

> Questa sezione esiste per non rifare il setup ogni volta. Vale per la HA di
> Andrea; gli agenti possono lavorare e testare subito.

## Topologia (IMPORTANTE)

- **Questo repo** (`~/git/personale/varco`) e il checkout HA
  (`~/homeassistant/homeassistant`) stanno su `192.168.1.116`. NON sono la HA
  che gira.
- **HA reale**: HAOS separato su **`192.168.1.47:8123`**. Scrivere file nel repo
  NON deploya nulla — vanno copiati sull'host .47.
- **SSH**: `root@192.168.1.47` (porta 22, chiave esistente; shell Alpine
  dell'add-on SSH HAOS — niente docker/python3/hass in quella shell, ma `ha`
  CLI c'è). Config HA in `/config`, custom components in
  `/config/custom_components/`, file statici serviti da `/config/www` → `/local/...`.

## Deploy della custom integration (Authority)

```bash
# copiare il component sull'host HA
scp -r custom_components/varco root@192.168.1.47:/config/custom_components/
# riavvio richiesto per caricare codice Python nuovo (i reload YAML non bastano)
```

Riavvio HA: via MCP `ha_restart(confirm=True)`, poi attendere con un poll:
```bash
until curl -s -m3 -o /dev/null -w '%{http_code}' http://192.168.1.47:8123/ | grep -q 200; do sleep 5; done
```
Requirements Python del component (es. PyNaCl, aiortc): dichiarati in
`manifest.json` → HA li installa in pip al primo load. aiortc è pesante:
verificare che HAOS lo installi senza problemi (potrebbe servire wheel).

## Deploy del client statico / bridge

- Client statico (es. Gazzetta standalone): deploy su Cloudflare Pages
  (`wrangler pages deploy dist`) come in share-actions, **oppure** per test
  veloci servirlo da HA: `scp dist/* root@192.168.1.47:/config/www/varco/` →
  `http://192.168.1.47:8123/local/varco/...`.
- Bridge: Cloudflare Worker, `wrangler deploy` dalla cartella `bridge/`
  (riusare l'account/config di share-actions).

## Accesso HA via API/MCP

- Il **long-lived token** è in `~/.claude.json` →
  `mcpServers["home-assistant"].env.HOMEASSISTANT_TOKEN`.
- Per script Node/Python che parlano col WS API:
  `ws://192.168.1.47:8123/api/websocket`, auth con quel token. (Pattern di
  riferimento: gli script di test della gazzetta-card.)
- MCP `home-assistant` disponibile in sessione: `ha_call_service`,
  `ha_get_state`, `ha_get_logs(source="error_log")`, `ha_restart`,
  `ha_check_config`, ecc. Cambi a dashboard/risorse via MCP si applicano subito;
  solo i file su disco vanno via scp.

## Test headless del client in browser (senza login manuale)

Pattern già rodato (vedi gazzetta-card): Chromium di Playwright
(`~/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome`) con
`--remote-debugging-port`, CDP via WebSocket (Node 22 ha `WebSocket` globale),
e per autenticare la UI HA si inietta `localStorage.hassTokens` costruito dal
long-lived token con `expires` lontano nel futuro. Per Varco invece il client
NON usa hassTokens: si testa il suo flusso di pairing/consenso puntando al
bridge di staging.

## Log e debug

- Errori component: MCP `ha_get_logs(source="error_log", search="varco")`.
- `home-assistant.log` su `/config/home-assistant.log` (host .47).
- `ha_check_config()` prima di ogni restart.

## Note di processo apprese (da gazzetta-card)

- Package HA con `!include_dir_merge_named`: il top-level del file è il NOME del
  package, non il dominio (es. `varco:` poi `sensor:`/`...`).
- Custom integration = serve restart vero, non `reload`.
- Bump della risorsa frontend (`?v=N`) ad ogni deploy o il browser cachea.
- git-shield (hook) blocca commit con chiavi/secret in chiaro: usare
  `!secret`/secrets.yaml, o `git commit --no-verify` consapevolmente.
