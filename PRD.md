# Varco - PRD

> Nome di lavoro: **Varco**: il varco controllato verso casa.

## Una riga

Varco è un prodotto/protocollo generico per dare accesso sicuro a consumer
esterni verso Home Assistant, senza esporre HA su internet e senza consegnare
token HA ai consumer. L'accesso nasce da una richiesta dichiarata dal consumer,
viene approvato dentro HA dall'owner, produce un grant legato alla chiave del
consumer, e viaggia su un tunnel E2E cifrato via relay con WebRTC opportunistico.

## Direzione prodotto

Varco non è "la Gazzetta remota" e non è una dipendenza di `ha-share-actions`.

- **Gazzetta** è il primo consumer reale da cui prendere requisiti e pattern UX.
- **ha-share-actions** è il progetto da cui copiare/adattare idee e pezzi di
  implementazione, ma Varco deve essere autonomo.
- Quando Varco sarà completo, `ha-share-actions` sarà obsoleto/deprecabile.

Confine MVP del repo:

- `custom_components/varco` - Authority Home Assistant
- `bridge/` - Cloudflare Worker/Durable Object ufficiale
- `packages/client` - libreria TypeScript ufficiale
- `examples/consumer-dashboard` - demo consumer minimale, non Gazzetta vera

## Attori

- **Owner**: possiede HA, approva/rifiuta consumer e revoca grant.
- **Consumer**: app esterna, dashboard, script o client. Ha un keypair proprio e
  un manifest. Non è un utente HA.
- **Authority**: l'installazione HA locale, implementata come custom integration.
  Autorizza, esegue, valida scope, tiene la connessione outbound verso il bridge.
- **Bridge**: relay opaco. Instrada buste cifrate, non vede contenuti applicativi.

## Non-dipendenze esplicite

Varco può leggere, copiare e adattare codice da `ha-share-actions`, ma non deve
importarlo come dipendenza runtime. Stessa cosa per Gazzetta: il client Varco deve
supportare dashboard HA-like, ma non conoscere né importare Gazzetta.

## Concetti

### Identità

- **Authority identity**: `authorityId` coincide con la public key stabile
  dell'Authority, o con un encoding/fingerprint canonico della public key.
- L'Authority firma con la private key; i consumer verificano con la public key.
- Se la chiave Authority cambia o viene persa, per i consumer è una nuova
  Authority. Nessuna rotazione trasparente nel MVP.
- **Consumer identity**: keypair generato dal consumer alla prima esecuzione e
  persistito localmente nel browser/device, per esempio IndexedDB/localStorage.
  Cambio browser o cancellazione storage significa nuovo consumer.

### Manifest

Il manifest è self-declared nel MVP. Varco non certifica che un consumer chiamato
"Gazzetta" sia davvero Gazzetta.

Il manifest dichiara:

- `name`, `icon`, `version`
- entità leggibili richieste
- subscription richieste/possibili
- history richieste
- snapshot camera richieste
- azioni richieste in scrittura

Il consumer dichiara cosa vuole fare. L'Authority non inventa permessi e non
propone scope aggiuntivi.

### Grant

Il grant è il set completo dei permessi approvati dall'owner, legato alla public
key del consumer e persistito in HA storage.

Il consenso è atomico nel MVP:

- approva tutto
- rifiuta tutto

L'owner non pota scope nel MVP. Se il manifest chiede troppo, il consumer deve
creare una nuova AccessRequest più piccola.

### Scope lettura

MVP: lista esplicita di `entity_id`.

Estensione futura: selector/pattern per domain, area, label, wildcard. Il modello
dati non deve impedirlo, ma l'MVP non lo implementa.

### Scope azioni

Il consumer dichiara nel manifest gli accessi in scrittura desiderati. MVP supporta
tre granularità:

- servizio + entity, esempio `light.turn_on@light.cucina`
- dominio servizio, esempio `light.*`
- entity con qualunque servizio, esempio `*@light.cucina`

Nessun PIN per azioni nel MVP.

## Flusso di consenso

1. Consumer genera o recupera il proprio keypair locale.
2. Owner inserisce nel consumer l'`authorityId`, che è la public key/fingerprint
   dell'Authority.
3. Consumer apre una sessione cifrata verso l'Authority tramite bridge.
4. Consumer invia `AccessRequest` con manifest, `consumer_pk` e nonce.
5. HA mostra notifica/pannello di consenso con nome self-declared, permessi
   richiesti e pairing code.
6. Owner confronta il pairing code e approva o rifiuta l'intero manifest.
7. Se approvato, HA crea il grant legato a `consumer_pk`.
8. Ogni sessione successiva si autentica con challenge/firma della consumer key.
9. Revoca da pannello HA: il grant viene marcato revoked, le sessioni attive
   vengono chiuse, e ogni messaggio successivo viene rifiutato.

## Enforcement

Enforcement sempre lato Authority, su ogni messaggio data-plane, contro il grant
corrente. Il consumer e il bridge non sono mai trusted per i permessi.

Regole MVP:

- nessun utente HA creato per i consumer
- nessun long-lived token HA consegnato ai consumer
- revoca immediata o quasi immediata
- messaggi post-revoca rifiutati
- errori di permesso auditati
- stati/payload sensibili non loggati

## Data plane

Tutti i messaggi applicativi viaggiano dentro la sessione E2E cifrata. Il relay è
la baseline obbligatoria; WebRTC è un transport opportunistico con fallback relay.

Message types MVP:

- `get_states` - snapshot delle entità richieste, validate contro grant
- `subscribe_states` - apre subscription runtime per un set di entity_id
- `unsubscribe_states` - chiude una subscription runtime
- `state_snapshot` - snapshot iniziale obbligatoria di una subscription
- `state_delta` - delta successivi per quella subscription
- `history_query` - proxy verso history HA per entità autorizzate
- `camera_snapshot` - JPEG recuperato lato Authority e reinoltrato nel tunnel
- `call_service` - validato contro gli scope azione approvati
- `error` - errore strutturato con `request_id`/`subscription_id` quando applicabile

History e camera snapshot sono inclusi nel MVP senza limiti speciali oltre al
grant approvato. Rischio noto: carico HA, costo relay e privacy vanno osservati
durante test reali.

## Subscription runtime

Il grant rappresenta il massimo autorizzato. La subscription runtime rappresenta
solo il sottoinsieme di entity che il consumer vuole osservare in quel momento.

API concettuale:

- `subscribe(entityIds)` ritorna `subscriptionId`
- l'Authority valida tutti gli `entityIds` contro il grant
- risposta obbligatoria: snapshot iniziale delle entity richieste
- poi solo delta per quella subscription
- `unsubscribe(subscriptionId)` chiude la subscription

Il consumer gestisce il lifecycle. Può aprire 20 subscription per 20 entity, una
subscription per card, o una subscription per pagina. La libreria TypeScript può
loggare warning se la stessa istanza client apre una subscription duplicata con lo
stesso set identico di entity senza aver chiuso la precedente.

## WebRTC

WebRTC è incluso nell'MVP come ottimizzazione opportunistica del transport.

Regole:

- il consumer deve funzionare completamente via relay
- WebRTC usa lo stesso protocollo e la stessa semantica del relay
- stesso `subscribe`, stessa snapshot iniziale, stessi delta, stessi errori
- signaling SDP/ICE passa nel tunnel cifrato esistente
- se WebRTC cade o non si stabilisce, fallback relay
- STUN pubblico per hole punching; TURN da valutare dopo misure reali

WebRTC non cambia auth, grant, scope o enforcement.

## Bridge

Il bridge Cloudflare ufficiale è parte di Varco e vive nel repo.

MVP iniziale:

- bridge pubblico condiviso come percorso consigliato
- bridge aperto a qualunque Authority
- Authority configurabile con bridge URL
- bridge personale/power-user non implementato, ma il protocollo non deve
  impedirlo

Fase successiva:

- allowlist/invite/admin control per il bridge pubblico
- documentazione per bridge personale o self-hosted

Il bridge resta opaco: vede routing metadata, timing e dimensioni, non contenuti,
scope, stati, azioni o PIN.

## Libreria TypeScript

Varco include nel MVP una libreria TypeScript ufficiale.

Distribuzione:

- package npm ufficiale, per esempio `@varco/client`
- build ESM standalone importabile via URL/CDN per prototipi

Target:

- browser supportato nel MVP
- core disegnato per poter diventare isomorfo
- Node/script non promessi nel MVP

API:

- core Varco-native: pairing, sessione, grant, `getStates`, `subscribeEntities`,
  `unsubscribe`, `queryHistory`, `cameraSnapshot`, `callService`
- adapter opzionale HA-like per dashboard consumer, per esempio
  `createHassLikeClient()`

La libreria gestisce autenticazione, sessione cifrata, reconnect, fallback relay,
WebRTC opportunistico, subscription tracking e warning per subscription duplicate.

## Audit MVP

Audit minimale ma strutturato in HA storage/log:

- AccessRequest ricevuta
- approvazione/rifiuto
- connessione consumer
- revoca
- `call_service`
- errori di permesso
- errori sessione rilevanti

Non loggare stati entity, snapshot camera, history payload o contenuti sensibili.

## Riuso concreto da ha-share-actions

| Pezzo | Uso in Varco |
|---|---|
| `bridge/` DO, hibernation, presence, transfer | copiare/adattare nel bridge Varco |
| crypto/sessione Ed25519/X25519/XChaCha20 | copiare/adattare dentro Varco |
| relay outbound HA | base per Authority Varco |
| storage/models | rimodellare da ShareGrant(action) a Grant(consumer+scopes) |
| frontend panel/notify | diventa consent/management panel |
| action catalog/constraints | riusare concettualmente per validare `call_service` |
| QR transfer | fuori MVP, possibile estensione |

Nessun import runtime da `ha-share-actions`.

## Roadmap

### Fase 0 - scheletro end-to-end

- monorepo Varco autonomo
- Authority HA installabile
- bridge Cloudflare ufficiale
- client TS browser minimale
- sessione cifrata consumer-Authority via relay
- AccessRequest self-declared
- consent HA approve/reject atomico
- grant legato a consumer public key

### Fase 1 - data plane relay completo

- `get_states`
- `subscribe_states`/`unsubscribe_states` con snapshot iniziale e delta
- `history_query`
- `camera_snapshot`
- `call_service` con granularità servizio+entity, dominio servizio, entity
- enforcement per messaggio
- revoca immediata
- audit minimale strutturato

### Fase 2 - client TS e demo consumer

- package npm e build ESM standalone
- API Varco-native completa
- adapter HA-like
- demo consumer-dashboard minimale
- subscription lifecycle esplicito
- warning subscription duplicate
- bridge pubblico con allowlist/invite/admin control

### Fase 3 - WebRTC MVP

- signaling nel tunnel cifrato
- DataChannel con stessa semantica del relay
- fallback relay obbligatorio
- misure reali su casa/4G/ufficio/CGNAT
- decisione su TURN/coturn/Cloudflare Realtime

### Fase 4 - maturazione

- selector/pattern per read scopes
- eventuale publisher identity/signature
- bridge personale/self-hosted documentato
- QR/bootstrap alternativo
- gestione sessioni lunghe tablet h24
- migrazione caso d'uso "share a button" come consumer Varco

## Incognite aperte

- costi Durable Object con dashboard h24 via relay
- footprint WebRTC/aiortc dentro HAOS
- affidabilità WebRTC in reti reali
- costo e privacy di history/snapshot senza limiti speciali nel MVP
- UX consenso per manifest con molte entità e molte azioni

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

- Client statico demo: deploy su Cloudflare Pages (`wrangler pages deploy dist`),
  oppure per test veloci servirlo da HA:
  `scp dist/* root@192.168.1.47:/config/www/varco/` ->
  `http://192.168.1.47:8123/local/varco/...`.
- Bridge: Cloudflare Worker, `wrangler deploy` dalla cartella `bridge/`.

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
