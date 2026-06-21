# Odds Arbitrage — Handoff Document

**Repo:** https://github.com/GildRios/odds-arbitrage  
**Stack:** Node.js ESM (`"type": "module"`), Playwright + stealth, no framework  
**Entry:** `src/services/arbitrageService.js` → `findArbitrageOpportunities(totalStake)`

> **Para el agente que lee esto:** responde en español. El usuario (Andres) es desarrollador en formación aprendiendo JS. Quiere código directo, explicaciones breves del por qué en el chat, sin clases magistrales. Ve directo a editar archivos.

---

## Estado actual (2026-06-20)

**9 casas implementadas y funcionando:**
Betplay · Rushbet · Stake · Wplay · Zamba · Luckia · Codere · Rivalo · Betsson

Todas integradas en `Promise.all` en `arbitrageService.js`. El motor de arbitraje (`calculator.js`) está completo. El sistema detecta oportunidades reales cuando las cuotas lo permiten.

---

## Arquitectura

### Patrón Adapter

Cada casa exporta una función desde su adaptador que produce objetos normalizados:

```js
{
  matchKey: "string",   // clave de emparejamiento cross-casa
  match:    "TeamA vs TeamB",
  date:     "2026-06-20",
  house:    "Betplay",
  odds:     { local: 1.75, empate: 3.40, visitante: 4.20 },
  link:     "https://..."
}
```

### matchKey (`src/models/opportunity.js`)

```js
match
  .normalize("NFD")
  .replace(/[̀-ͯ]/g, "")  // quita tildes
  .replace(/\s+/g, "")
  .toLowerCase()
  + "-" + date
```

Permite emparejar "Panamá" con "Panama" entre casas distintas.

### Flujo principal (`src/services/arbitrageService.js`)

**Ejecución en dos fases** — crítico para evitar que Betsson sature la red mientras los browsers Playwright cargan:

```js
// Fase 1: Playwright (~20s) — corren solos sin competir con las ~180 requests paralelas de Betsson
const [wplayOdds, luckiaOdds, rivaloOdds] = await Promise.all([
  getWplayOdds(), getLuckiaOdds(), getRivaloOdds(),
]);

// Fase 2: REST (~120s) — Betsson en paralelo completo sin interferir con browsers
const [betplayOdds, rushbetOdds, stakeOdds, zambaOdds, codereOdds, betssonOdds] = await Promise.all([
  getBetplayOdds(), getRushbetOdds(), getStakeOdds(), getZambaOdds(), getCodereOdds(), getBetssonOdds(),
]);
// agrupa por matchKey, toma la mejor cuota de cada resultado entre todas las casas
// si sum(1/local + 1/empate + 1/visitante) < 1 → arbitraje garantizado
```

⚠️ Si se añade una nueva casa Playwright (browser), va en Fase 1. Si es REST/fetch, va en Fase 2.

### Stealth Playwright (instancia única)

`chromium.use(stealth())` se llama **una sola vez** a nivel de módulo en `oddsService.js`. No volver a llamarlo en otros archivos. Lo usan: Wplay, Luckia, Rivalo.

---

## Casas implementadas — APIs en detalle

---

### Betplay (`src/adapters/betplayAdapter.js`)
**Plataforma:** Kambi  
**Método:** REST fetch directo  

**Flujo en `oddsService.js → getKambiOdds("betplay", "Betplay")`:**

1. Fetch del índice de competiciones:
   ```
   GET https://us.offering-api.kambicdn.com/offering/v2018/betplay/listView/football/all/all/all/matches.json
       ?lang=es_CO&market=CO&client_id=200&channel_id=1
   ```
   Responde con `{ events: [...] }`. Se extraen los paths únicos de competición desde `event.path[1].termKey` / `event.path[2].termKey`, filtrando los que empiezan por `"esports"`.

2. Fetch paralelo por cada competición:
   ```
   GET .../listView/football/{level1}/{level2}/all/matches.json  (si hay 2 niveles)
   GET .../listView/football/{level1}/all/all/matches.json       (si hay 1 nivel)
   ```
   Cada respuesta tiene `{ events: [...] }`. Se deduplica por `event.event.id`.

3. `adaptBetplayEvent(event, house)`:
   - **Filtra** si `event.event.state !== "NOT_STARTED"` → solo prematch
   - **Filtra** si `event.event.path` contiene `{ termKey: "esports_football" }` → descarta eSports
   - Busca `event.betOffers.find(bo => bo.criterion.label === "Resultado Final")`
   - Dentro de ese betOffer: `outcomes.find(o => o.label === "1"/"X"/"2")`
   - **Cuotas en milliodds** → dividir por 1000 (ej. `2480 → 2.48`)
   - `event.event.start` → ISO `"2026-06-20T23:00:00Z"` → `.split("T")[0]`

**Link directo:** `https://betplay.com.co/deportes#/event/{id}`

---

### Rushbet (`src/adapters/betplayAdapter.js` — compartido)
**Plataforma:** Kambi (mismo adaptador que Betplay)  
**Método:** REST fetch directo  

Idéntico a Betplay, solo cambia el client ID:
```
GET https://us.offering-api.kambicdn.com/offering/v2018/rsico/listView/...
```
`getKambiOdds("rsico", "Rushbet")` — el adaptador recibe `house` como parámetro.  
**Link directo:** `https://rushbet.co/?page=sportsbook#/event/{id}`

---

### Stake (`src/adapters/stakeAdapter.js`)
**Plataforma:** websbkt.com (propia)  
**Método:** REST fetch directo con headers obligatorios  

**Endpoint:**
```
GET https://pre-115o-sp.websbkt.com/cache/115/es/co/America-Havana/events-by-path.json
    ?path=football&hidenseek=d6d9299bb73c3d6d6cb879ec1d912306d51b95a1&date=YYYY-MM-DD
```

**Headers obligatorios:**
```
Referer: https://stake.com.co/          ← SIN esto devuelve 406
User-Agent: Mozilla/5.0 ...Chrome/149...
```

**Flujo:** Se consultan 10 fechas consecutivas en paralelo (hoy + 9 días) y se deduplica por `event.id`.

**Estructura del evento:**
```js
{
  id: 123,
  teams: { home: "Brasil", away: "Haiti" },
  date_start: "2026-06-20T20:00:00Z",
  main_odds: {
    main: {                    // objeto, no array → Object.values()
      "abc": { odd_code: "ODD_S1", odd_value: 1.75 },  // local
      "def": { odd_code: "ODD_SX", odd_value: 3.40 },  // empate
      "ghi": { odd_code: "ODD_S2", odd_value: 4.20 },  // visitante
    }
  }
}
```
**Cuotas:** decimales directos en `odd_value` (sin dividir).  
**Odd codes:** `ODD_S1` (local), `ODD_SX` (empate), `ODD_S2` (visitante).

---

### Zamba (`src/adapters/zambaAdapter.js`)
**Plataforma:** Orenes Tech (GraphQL)  
**Método:** REST fetch directo (GraphQL POST)  

**Endpoint:**
```
POST https://online-nio3-sportsbook-zamba.orenes.tech/offermanager/graphql
```

**Headers obligatorios:**
```
Content-Type: application/json
X-API-Key: h640tsLa4fUxEucHUBr3v88mEd
x-tenant: 031a9bbf-eaa5-4ae3-9668-8a01db9464a3
```

**Query GraphQL con paginación por cursor:**
```graphql
query ($after: String) {
  events(
    filter: { tenantId: "031a9bbf-...", status: Prematch, types: [Fixture],
               ended: false, isOffered: true, sportKeys: [1] }
    first: 100
    after: $after
  ) {
    edges {
      node {
        ... on Fixture {
          eventId  utcStartDate  hasEnded  isLive  offerActive
          competitors { homeAway  competitorName }
          markets {
            marketDefaultName
            selections { selectionDefaultName  price  status }
          }
        }
      }
    }
    pageInfo { hasNextPage  endCursor }
  }
}
```

**Flujo:** paginación do/while con `pageInfo.endCursor` hasta `hasNextPage = false`.

**Lógica del adaptador:**
- Filtra si `hasEnded`, `isLive` o `!offerActive`
- Busca `competitors` con `homeAway === "Home"/"Away"`
- Busca market `marketDefaultName === "Match winner"` con exactamente 3 selections
- Filtra selections con `status === "Active"` y `price > 0`
- Identifica local/visitante por nombre (coincide con `competitorName`), empate = el que no coincide con ninguno
- **Cuotas:** decimales directos en `price`

**Link directo:** `https://www.zamba.co/es/sports/event/{eventId}`

---

### Luckia (`src/adapters/luckiaAdapter.js`)
**Plataforma:** SBTech  
**Método:** Playwright headless + DOM scraping  

**URL:**
```
https://www.luckia.co/apuestas/futbol/51/?date=sve
```
(El parámetro `date=sve` muestra todos los eventos próximos, no solo hoy.)

**Flujo en `oddsService.js → getLuckiaOdds()`:**
1. Playwright lanza Chromium headless + stealth
2. `page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 })` + 12 segundos extra de espera
   - ⚠️ NO usar `waitUntil: "networkidle"` — la SPA nunca llega a ese estado (polling de fondo infinito → timeout)
   - Los 12s extra son necesarios para que el framework JS hidrate el DOM con los eventos
3. `page.evaluate()` scraping DOM:
   - Selectores: `[data-event-url]` por evento
   - Equipos: `.lp-event__team-name-text` (2 elementos: home y away)
   - Fecha: `.lp-event__extra-date` → texto "20 jun" → parser español de meses
   - Cuotas: `[data-pick="1"]`, `[data-pick="X"]`, `[data-pick="2"]` → `.lp-event__pick-content`
   - Cuotas con coma → `replace(",", ".")` antes de `parseFloat`
4. `parseLuckiaDOM(events)` en el adaptador construye el formato común

**Parser de fechas:** diccionario `ene→1, feb→2, ...dic→12`. Año: si el mes ya pasó este año → año siguiente.  
**Cuotas:** decimales directos (ya vienen parseadas del DOM).

---

### Codere (`src/adapters/codereAdapter.js`)
**Plataforma:** NavigationService + SBS (propia)  
**Método:** REST fetch directo (2 pasos)  

**Paso 1 — Obtener IDs de ligas por fecha:**
```
GET https://m.codere.com.co/NavigationService/Home/GetCountriesByDate
    ?sportHandle=soccer&date=YYYY-MM-DD
```
Responde con array de países → `country.Leagues[].NodeId`. Se consultan 9 fechas (hoy + 8) en paralelo.

**Paso 2 — Eventos por liga:**
```
GET https://codere-sbs-co.azurewebsites.net/leagues/{NodeId}/1/GetEventsByLeagueAndMarketId
```
Responde con array de eventos. Se deduplica por `event.NodeId`.

**Headers:**
```
User-Agent: Mozilla/5.0 ...Chrome/120...
Referer: https://m.codere.com.co/deportesCol/
```

**Estructura del evento:**
```js
{
  NodeId: 456,
  isLive: false,
  ParticipantHome: "Brasil",
  ParticipantAway: "Haiti",
  StartDateFormatted: "20/06/2026 20:00:00",   // DD/MM/YYYY
  SportHandle: "soccer",
  Games: [{
    Results: [
      { SortOrder: 1, Odd: 1.75 },   // local
      { SortOrder: 2, Odd: 3.40 },   // empate
      { SortOrder: 3, Odd: 4.20 },   // visitante
    ]
  }]
}
```
**Lógica:** `Games[0].Results` se ordena por `SortOrder` → `[r1, rX, r2]`.  
**Fecha:** `"DD/MM/YYYY HH:MM:SS"` → `split(" ")[0]` → `split("/")` → reordenar a `YYYY-MM-DD`.  
**Cuotas:** decimales directos en `Odd`.

**Link directo:** `https://www.codere.com.co/eventos-deportivos/{SportHandle}/{NodeId}`

---

### Rivalo (`src/adapters/rivaloAdapter.js`)
**Plataforma:** API propia (Sportradar-based)  
**Método:** Playwright + intercepción de request de red  

**Flujo en `oddsService.js → getRivaloOdds()`:**
1. Playwright lanza Chromium headless + stealth
2. `Promise.all([page.waitForResponse(...), page.goto(...)])` — registra el listener ANTES del goto para no perderse la respuesta
3. Intercepta la primera respuesta a:
   ```
   https://www.rivalo.co/api/offer/v4/competitions  (URL real con params: ?ids=&enriched=2&sport=Football)
   ```
   Filtro: `.includes("/api/offer/v4/competitions")` — captura la URL con cualquier query string.  
   Timeout: 60000ms (la API puede tardar según la carga del servidor).
4. `response.json()` → `data.enriched` → array de competiciones → `comp.fixtures` se aplana en un array de fixtures

**Estructura del fixture:**
```js
{
  id: "abc123",
  live: false,
  status: "Active",
  startTime: "2026-06-20T20:00:00Z",
  competitors: [
    { name: "Brasil" },   // índice 0 = local
    { name: "Haiti" },    // índice 1 = visitante
  ],
  markets: [{
    type: "FOOTBALL_WINNER",
    outcomes: [
      { value: "HOME", status: "Active", odds: 1.75 },
      { value: "DRAW", status: "Active", odds: 3.40 },
      { value: "AWAY", status: "Active", odds: 4.20 },
    ]
  }]
}
```
**Filtra:** `fixture.live === true` o `status !== "Active"`.  
**Cuotas:** decimales directos en `odds`.

**Link directo:** `https://www.rivalo.co/es/sportsbook/football/{fixture.id}`

---

### Betsson (`src/adapters/betssonAdapter.js`)
**Plataforma:** propia (OBG / Evolution Gaming)  
**Método:** REST fetch directo con headers de contexto  

**Endpoint con paginación:**
```
GET https://www.betsson.co/api/sb/v1/events?categoryId=1&pageNumber={n}
```

**Headers obligatorios (varios identificadores de sesión y contexto):**
```
correlationid: betsson-odds-fetch
x-obg-channel: Web
x-sb-device-type: Desktop
x-sb-type: b2b
brandid: 6a6d80b9-16ac-4387-a413-244d93a74deb
x-sb-jurisdiction: Coljuegos
x-sb-content-id: 2d543995-acff-41c1-bc73-9ec46bd70602
x-sb-segment-id: 1a68008c-4da6-4f77-acbc-0614cb030d7d
x-sb-currency-code: COP
x-sb-static-context-id: stc--55774027
x-sb-user-context-id: stc--55774027
x-sb-language-code: co
x-sb-channel: Web
marketcode: co
sessiontoken: ew0K...  (JWT anónimo hardcodeado)
x-sb-country-code: CO
x-sb-identifier: EVENTS_REQUEST
x-obg-device: Desktop
Referer: https://www.betsson.co/apuestas-deportivas
```

**Flujo:** Primera página trae `{ totalPages, events }` (~32 páginas de 50 eventos c/u). Las páginas restantes se piden en paralelo con reintentos.

**Rate limiting:** Betsson limita conexiones paralelas. El helper `fetchBetssonPage(n)` reintenta hasta 3 veces con backoff (1s, 2s, 3s) antes de devolver `[]`. Node.js ya limita a 6 conexiones simultáneas por host (HTTP/1.1), así que no se añade throttling adicional.

**Estructura del evento:**
```js
{
  phase: "Prematch",
  startDate: "2026-06-20T20:00:00Z",
  id: "evt-789",
  neutralPath: "colombia/liga-betplay/...",
  participants: [
    { side: 1, label: "Brasil" },     // local
    { side: 2, label: "Haiti" },      // visitante
  ],
  markets: [{
    marketTemplateId: "MW3W",    // "Match Winner 3-Way" = 1X2
    sortOrder: 1,
    selections: [
      { selectionTemplateId: "HOME", status: "Open", odds: 1.75 },
      { selectionTemplateId: "DRAW", status: "Open", odds: 3.40 },
      { selectionTemplateId: "AWAY", status: "Open", odds: 4.20 },
    ]
  }]
}
```
**Filtra:** `phase !== "Prematch"`.  
**Market:** `marketTemplateId === "MW3W"` y `sortOrder === 1`.  
**Selections:** `selectionTemplateId` es `"HOME"/"DRAW"/"AWAY"`, `status === "Open"`.  
**Cuotas:** decimales directos en `odds`.

**Link directo:** `https://www.betsson.co/apuestas-deportivas/futbol/{neutralPath ?? id}`

---

### Wplay (`src/adapters/wplayAdapter.js`)
**Plataforma:** PlayTech  
**Método:** Playwright headless + DOM scraping (Cloudflare Turnstile)  

**URL crítica:**
```
https://apuestas.wplay.co/es/s/FOOT/F%C3%BAtbol    ← ESTA URL (48+ partidos)
NO: https://apuestas.wplay.co/es/football           ← solo 5 partidos destacados
```

**Flujo en `oddsService.js → getWplayOdds()`:**
1. Playwright lanza Chromium headless + stealth (resuelve Cloudflare Turnstile automáticamente)
2. `page.goto(url, { waitUntil: "domcontentloaded" })` + 10 segundos de espera
3. `page.evaluate()` scraping DOM en 2 pasadas:
   - **Pasada 1 — Fechas y nombres:** elementos `[class*="ev ev-"]` → extrae `ev-{ID}` del className, `span.date`, y `a[href*="/es/e/"]` para el nombre
   - **Pasada 2 — Cuotas:** elementos `[class*="ev-"][class*="mkt-"]` (excluye `inplay`) → extrae label y precio del `innerText`
   - **Ensamblado:** para cada evento, encuentra "Empate" en el array de precios → el elemento antes es local, el de después es visitante
4. `parseWplayDOM(events)` en el adaptador construye el formato común

**Parser de fechas:** diccionario inglés + español de meses. El año se hardcodea como `"2026-"` (⚠️ necesitará ajuste en 2027).  
**Cuotas:** decimales directos del DOM (con `replace(",", ".")` implícito en el scraping).  
**Tiempo de ejecución:** ~12 segundos.

**Link directo:** `https://apuestas.wplay.co/es/e/{evId}`

---

## Arquitectura de servicios

```
src/services/oddsService.js
  ├── getKambiOdds(client, house)   → getBetplayOdds() + getRushbetOdds()
  ├── getStakeOdds()
  ├── getZambaOdds()
  ├── getCodereOdds()
  ├── getLuckiaOdds()               → Playwright
  ├── getRivaloOdds()               → Playwright
  ├── getWplayOdds()                → Playwright
  └── getBetssonOdds()

src/services/arbitrageService.js
  └── findArbitrageOpportunities(totalStake)
        → Fase 1: Promise.all(Wplay, Luckia, Rivalo)   ← Playwright sin interferencia REST
        → Fase 2: Promise.all(Betplay, Rushbet, Stake, Zamba, Codere, Betsson)
        → groupByMatchKey
        → hasArbitrage → calculateStakeDistribution

src/utils/calculator.js
  ├── hasArbitrage(local, draw, away)   → sum(1/odds) < 1
  └── calculateStakeDistribution(...)   → distribución proporcional
```

---

## Cómo agregar una casa nueva

1. Crear `src/adapters/{casa}Adapter.js` — exportar función que recibe el evento crudo y devuelve `normalizeOddsData({match, date, house, odds, link})`
2. Agregar `get{Casa}Odds()` a `src/services/oddsService.js`
3. Agregar a la fase correcta en `src/services/arbitrageService.js`: **Fase 1** si usa Playwright, **Fase 2** si es REST/fetch
4. Testear: `node -e "import('./src/services/oddsService.js').then(m => m.get{Casa}Odds()).then(console.log)"`

---

## Casas pendientes

| Casa | Plataforma | Notas |
|---|---|---|
| **Sportium** | PlayTech (Cirsa) | No explorado |
| **Bwin** | Propia | No explorado |

---

## Gotchas y reglas importantes

- **Divisores de cuotas por casa:** Kambi (Betplay/Rushbet) → ÷1000. Todos los demás → decimal directo.
- **Stealth una sola vez:** `chromium.use(stealth())` solo en `oddsService.js` a nivel de módulo. No repetir.
- **Fail fast:** si falta una cuota, devolver `null`. Nunca inventar 0 o 1 — corrompe la matemática.
- **Headers HTTP críticos:** Stake necesita `Referer`. Betsson necesita múltiples headers de contexto. Verificar en DevTools → Network si algo devuelve 4xx.
- **Fechas dentro de la función:** calcular `new Date()` dentro de `getXOdds()`, nunca a nivel de módulo (se recalcula en cada llamada).
- **Verificar JSON real antes de tocar un adaptador:** `console.log(JSON.stringify(data, null, 2))` antes de asumir campos.
- **ESM obligatorio:** `import`/`export`, nunca `require()`.
- **matchKey con NFD:** permite emparejar "Panamá" con "Panama", "São Paulo" con "Sao Paulo".
- **Wplay año hardcodeado:** el parser de fechas de Wplay usa `"2026-"` fijo. Revisar en 2027.
- **No correr todos los browsers Playwright en paralelo con Betsson:** Betsson hace ~180 requests al mismo tiempo y satura la red, causando que Luckia y Rivalo no carguen. Por eso existe la ejecución en dos fases.
- **Luckia es sensible a la carga del sistema:** cuando otros browsers corren simultáneamente, el DOM puede no hidratarse en 12s. Si da 0 eventos de forma recurrente, considerar aumentar la espera.
- **Betsson rate-limit:** si muchas páginas consecutivas fallan y el total baja a ~36, el servidor está rate-limitando. `fetchBetssonPage` reintenta 3 veces con backoff; si aún falla, esperar unos minutos antes de volver a correr.
