# Contexto del proyecto: App de arbitraje de cuotas deportivas

> Documento de traspaso para Claude Code. Si eres otro asistente leyendo esto: aquí está todo lo necesario para continuar el proyecto sin perder el hilo. **Lee la sección "Cómo trabajar conmigo" antes que nada.**

---

## 1. Cómo trabajar conmigo

- **Respóndeme en español.**
- **Aquí sí quiero que tú escribas el código directamente.** Este proyecto lo vengo desarrollando con guía paso a paso en otro entorno (donde yo escribo todo el código a mano para aprender). En Claude Code el objetivo es distinto: avanzar rápido en la implementación. Así que ve directo a editar archivos y escribir código real, no me preguntes si quiero escribirlo yo.
- Sí quiero que me **expliques brevemente el QUÉ y el POR QUÉ** de cada cambio importante (en el chat, no como comentarios excesivos en el código), para que pueda seguir el hilo y aprender de lo que haces — pero sin convertir eso en una clase paso a paso. Resume, no me hagas escribir.
- No te extiendas en cosas triviales de setup. Ve al grano.
- Trabajo el proyecto **como si fuera una empresa**: arquitectura limpia, código mantenible, commits siguiendo Conventional Commits, sin atajos sucios.
- Cuando haya una decisión de arquitectura no trivial (ej. nueva fuente de datos, cambio de estructura), coméntame las opciones y su trade-off antes de implementar, pero no te detengas a preguntar por decisiones menores de implementación.
- **Verifica contra evidencia real, no asumas estructuras de JSON.** Este proyecto ha tenido varios bugs por asumir un campo o un formato sin mirar la respuesta real de la API. Si vas a tocar un adaptador, confirma la estructura real del JSON antes (con un `console.log` de prueba si hace falta) en lugar de inferir del código viejo.

## 2. Mi perfil

- Desarrollador en formación. Sé **Java básico**. Estoy aprendiendo **JavaScript** y luego **TypeScript**.
- Trabajo en **Ubuntu Linux**.
- Usuario de GitHub: **GildRios**.
- Tengo otras 2 ideas de proyecto en cola (no empezadas): una herramienta de animación pixel-art con IA, y **Ceci**, una app de gestión de tienda por voz. El proyecto **actual** es el de arbitraje.

---

## 3. Qué es el proyecto

Una app que detecta **oportunidades de arbitraje** en cuotas deportivas: cuando varias casas de apuestas ofrecen cuotas distintas para el mismo partido, a veces existe una combinación de apuestas que garantiza ganancia pase lo que pase. La app trae las cuotas 1X2 (local/empate/visitante) de 11 casas colombianas, las normaliza a un formato común, las empareja por partido, y calcula si hay arbitraje.

Tiene un **backend Node.js** (servidor HTTP + lógica de scraping) y un **frontend Vue 3** que consume la API y muestra las oportunidades.

---

## 4. Entorno

- **Node v24.16.0**, npm 11.13.0, Git 2.53.0, VS Code, GitHub CLI (`gh`) autenticado.
- `package.json` raíz con **`"type": "module"`** → ESM puro (`import`/`export`, no `require`).
- **Conventional Commits**: `feat:`, `fix:`, `docs:`, `chore:`.
- Repo `odds-arbitrage` en `~/odds-arbitrage`.

### Cómo correr el proyecto

**Siempre usar `npm start`**, no `node index.js` directo. El script en `package.json` incluye flags críticos de memoria:

```bash
# Desde ~/odds-arbitrage
npm start
# → node --expose-gc --max-old-space-size=1536 index.js
```

El servidor queda en `http://localhost:3000`. El frontend (Vite dev server) corre en paralelo en `http://localhost:5173` y hace proxy de `/api/*` al backend.

### Estructura del proyecto

```
odds-arbitrage/
├── index.js                        ← Servidor HTTP Node (API + sirve el frontend buildeado)
├── package.json                    ← "start": "node --expose-gc --max-old-space-size=1536 index.js"
├── src/
│   ├── models/opportunity.js       ← normalizeOddsData() — fábrica del formato común
│   ├── adapters/                   ← un archivo por casa (11 adaptadores)
│   │   ├── betplayAdapter.js
│   │   ├── stakeAdapter.js
│   │   ├── wplayAdapter.js
│   │   ├── zambaAdapter.js
│   │   ├── luckiaAdapter.js
│   │   ├── codereAdapter.js
│   │   ├── rivaloAdapter.js
│   │   ├── betssonAdapter.js
│   │   ├── sportiumAdapter.js
│   │   └── bwinAdapter.js
│   ├── services/
│   │   ├── oddsService.js          ← una función get*Odds() por casa
│   │   └── arbitrageService.js     ← findArbitrageOpportunities() — orquesta todo
│   └── utils/calculator.js         ← hasArbitrage() + calculateStakeDistribution()
└── frontend/                       ← Vue 3 + Vite + Tailwind
    ├── src/
    │   ├── App.vue
    │   ├── components/
    │   ├── composables/
    │   ├── stores/
    │   └── utils/
    └── dist/                       ← build producción, servido por index.js
```

---

## 5. Arquitectura (DECIDIDA Y ESTABLE)

**Patrón Adapter.** Flujo:

```
Cada casa → su Adapter → formato común → agrupar por matchKey → Motor de arbitraje (calculator.js)
```

Hay dos tipos de fuente:
- **REST/WS directo**: Betplay, Rushbet, Stake, Zamba, Codere, Betsson, Sportium, Bwin — usan `fetch` o WebSocket nativo.
- **Playwright (navegador headless)**: Wplay, Luckia, Rivalo — sitios con Cloudflare o DOM scraping. Corren SIEMPRE al final, en serie, porque cada browser Chromium consume ~500MB de RAM.

### Formato común (contrato que todo adaptador debe producir)

```javascript
{
  matchKey: "belgicavsiran-2026-06-21",   // normalizado: sin tildes, sin espacios, + fecha
  match:    "Bélgica vs Irán",
  date:     "2026-06-21",
  house:    "Betsson",
  odds:     { local: 1.42, empate: 4.7, visitante: 8.3 },
  link:     "https://www.betsson.co/apuestas-deportivas/futbol/belgium-iran"
}
```

`matchKey` se genera en `normalizeOddsData()` con `normalize("NFD")` para quitar tildes, lo que permite emparejar "Bélgica" de una casa con "Belgica" de otra.

### Respuesta de la API

`GET /api/opportunities?stake=1000000` devuelve:

```json
{
  "ok": true,
  "count": 3,
  "cached": false,
  "opportunities": [{
    "match": "Bélgica vs Irán",
    "date": "2026-06-21",
    "profitPct": 1.23,
    "guaranteed": 12300,
    "total": 1000000,
    "bets": [
      { "outcome": "local",     "house": "Betsson", "odds": 1.42, "stake": 430000, "link": "..." },
      { "outcome": "empate",    "house": "Betplay", "odds": 4.70, "stake": 130000, "link": "..." },
      { "outcome": "visitante", "house": "Rushbet", "odds": 8.30, "stake": 440000, "link": "..." }
    ]
  }]
}
```

---

## 6. Gestión de memoria (CRÍTICO — leer antes de tocar oddsService o arbitrageService)

El proyecto tuvo crashes de OOM (heap de hasta 4GB) durante el desarrollo. Están resueltos, pero los patrones que los causaron son fáciles de repetir.

### Regla principal: fuentes en serie, nunca en paralelo

`arbitrageService.js` ejecuta las 11 fuentes **una por una** con un bucle `for...of`:

```javascript
for (const [fn, name] of [
  [getBetplayOdds, "Betplay"], [getRushbetOdds, "Rushbet"], ...
]) {
  const odds = await safeCall(fn, name);
  allOdds.push(...odds);
  if (typeof globalThis.gc === "function") globalThis.gc(); // ayuda al GC a liberar el JSON crudo
}
```

**Por qué:** cuando se corren en paralelo, todos los JSON crudos de respuesta están en memoria al mismo tiempo. Con `--expose-gc` y ejecución serial, el GC libera el JSON crudo de cada fuente antes de cargar la siguiente. La data adaptada (los objetos pequeños del formato común) es insignificante: ~50MB para las 1,131 cuotas de las 7 fuentes REST.

**No revertir a `Promise.all` de fuentes**, aunque parezca más rápido. Con cache de 5 minutos, el scan solo ocurre una vez cada 5 minutos — el tiempo extra no importa.

### Cache y coalescing (en index.js)

```javascript
let activePromise = null;
let cache = null; // { stake, data, at }
const CACHE_MS = 5 * 60 * 1000;
```

Si llega una segunda solicitud mientras hay un scan activo, se engancha al mismo `activePromise` en vez de lanzar un segundo scan. Los resultados se cachean 5 minutos.

### El caso Betsson: parámetro de paginación y filtro de mercado

**Dos gotchas críticos:**

1. **El parámetro de paginación es `page`, no `pageNumber`.** El query param `&pageNumber=N` es ignorado por la API — siempre devuelve la página 1. El correcto es `&page=N`. El API sí devuelve `totalPages` en el response, así que se puede hacer `Promise.all` de todas las páginas en paralelo:

```javascript
const first = await fetchBetssonPage(1);             // trae totalPages
const rest  = await Promise.all(
  Array.from({ length: first.totalPages - 1 }, (_, i) => fetchBetssonPage(i + 2))
);
```

Esto va de ~74 s (100 páginas secuenciales) a ~2 s (8 páginas en paralelo).

2. **La URL DEBE incluir `&marketTemplateIds=MW3W`** (filtro al mercado 1X2). Sin ese parámetro cada página pesa ~367 MB (780 mercados por evento). Se intentó streaming JSON para evitar el OOM, pero incluso en streaming secuencial son >11 GB de descarga total → 22+ minutos → inviable. Con MW3W cada página pesa ~2 MB.

**URL correcta:** `https://www.betsson.co/api/sb/v1/events?categoryId=1&marketTemplateIds=MW3W&page=N`

El filtro MW3W NO reduce eventos útiles: filtra en la API lo que el adaptador filtraría de todas formas (los eventos sin cuota 1X2 no sirven para arbitraje). Durante temporada normal: ~300-400 eventos. Durante Mundial 2026: ~300 eventos prematch (los que están en juego no aparecen en prematch).

---

## 7. Estado de cada fuente de datos

| Casa | Mecanismo | Estado | Gotchas clave |
|---|---|---|---|
| **Betplay** | Kambi REST (`listView`) | ✅ Funciona | Cuotas ÷1000. Filtrar `termKey === "esports_football"`. Buscar betOffer con `criterion.label === "Resultado Final"` |
| **Rushbet** | Kambi REST (mismo que Betplay) | ✅ Funciona | Mismo adaptador que Betplay, `house = "Rushbet"`, URL usa cliente `rsico` |
| **Stake** | REST propio | ✅ Funciona | Requiere `Referer: "https://stake.com.co/"`. Fetcha 10 días (hoy + 9). Cuotas directas (no ÷1000) |
| **Zamba** | GraphQL paginado | ✅ Funciona | Paginación con cursor. `marketDefaultName === "Resultado Final"` |
| **Codere** | REST + navegación por ligas | ✅ Funciona | Primero fetcha ligas por fecha, luego eventos de cada liga en batches de 15 |
| **Betsson** | REST paginado | ✅ Funciona | **CRÍTICO: URL debe tener `&marketTemplateIds=MW3W`** y paginación es `&page=N` (no `&pageNumber=N`). `totalPages` viene en el response → `Promise.all` de todas. ~2s |
| **Sportium** | WebSocket STOMP | ⚠️ Intermitente | Cierra con código 1002 frecuentemente. `safeCall` lo maneja devolviendo `[]`. Si falla, el scan sigue |
| **Bwin** | REST paginado | ✅ Funciona | Tiene `offerCategories=Gridable` → respuestas pequeñas. Páginas secuenciales |
| **Wplay** | Playwright (DOM scraping) | ✅ Funciona | Cloudflare. Lee eventos del DOM del SPA. Corre al final, en serie |
| **Luckia** | Playwright (DOM scraping) | ✅ Funciona | Espera `[data-pick="1"]`. Parseo de fecha en español |
| **Rivalo** | Playwright (network intercept) | ✅ Funciona | Intercepta `/api/offer/v4/competitions` que emite al cargar la página |

**Rendimiento medido** (ejecución serial, Mundial 2026, 2026-06-21):
- 7 fuentes REST (sin Sportium): ~56 MB heap, ~15 segundos, ~1,004 eventos
  - Betplay 71 / Rushbet 105 / Stake 175 / Zamba 166 / Codere 82 / Betsson 298 / Bwin 107
  - 201 partidos en 2+ casas, 99 en 3+, 26 en 5+, 1 partido en las 7 REST simultáneamente
- Sportium (WS): ~30s, intermitente (1002)
- 3 fuentes Playwright: ~500 MB pico por browser, ~90 segundos en total
- Total scan estimado: ~3-4 minutos

---

## 8. Código clave de referencia

### `src/models/opportunity.js`

Normalización agresiva para maximizar el emparejamiento entre casas que nombran distinto el mismo partido:

```javascript
const STRIP_PARENS = /\([^)]*\)/g;         // (KWT), (ARG), (F), (Chivilcoy)...
const CLUB_ABBREVS = /\b(ac|afc|cd|cf|ca|cs|fk|fc|sc|sd|ud|ad|rc|rcd|ce|as|us|ss|dc|bk|if|ik|sk|sfc|lfc|af|ap)\b/gi;
const NOISE_WORDS  = /\b(club|deportes|deportivo|deportiva|de|del|da|do|dos)\b/gi;

function buildMatchKey(match, date) {
  return match
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // quita tildes
    .replace(STRIP_PARENS, " ")              // (KWT) → espacio
    .replace(/[-''']/g, " ")                 // guión/apóstrofe → espacio
    .replace(CLUB_ABBREVS, " ")             // FC, CA, CS, CD... → espacio
    .replace(NOISE_WORDS, " ")              // club, de, del, deportes... → espacio
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, "")                    // colapsa espacios
    + "-" + date;
}
export function normalizeOddsData({ match, date, house, odds, link }) {
  return { matchKey: buildMatchKey(match, date), match, date, house, odds, link };
}
```

### `src/utils/calculator.js`

```javascript
export function hasArbitrage(localOdds, drawOdds, awayOdds) {
  return (1/localOdds + 1/drawOdds + 1/awayOdds) < 1;
}

export function calculateStakeDistribution(localOdds, drawOdds, awayOdds, totalStake) {
  const sum = 1/localOdds + 1/drawOdds + 1/awayOdds;
  return {
    localStake:     (totalStake / localOdds) / sum,
    drawStake:      (totalStake / drawOdds)  / sum,
    awayStake:      (totalStake / awayOdds)  / sum,
    guaranteedValue: totalStake / sum - totalStake,  // NO es totalStake - (suma stakes) → eso siempre da 0
  };
}
```

### `src/services/arbitrageService.js` (estructura actual)

```javascript
export async function findArbitrageOpportunities(totalStake) {
  const allOdds = [];
  for (const [fn, name] of [
    [getBetplayOdds, "Betplay"], [getRushbetOdds, "Rushbet"], [getStakeOdds, "Stake"],
    [getZambaOdds, "Zamba"], [getCodereOdds, "Codere"], [getBetssonOdds, "Betsson"],
    [getSportiumOdds, "Sportium"], [getBwinOdds, "Bwin"],
    [getWplayOdds, "Wplay"], [getLuckiaOdds, "Luckia"], [getRivaloOdds, "Rivalo"],
  ]) {
    const odds = await safeCall(fn, name);  // nunca lanza excepción — devuelve [] si falla
    allOdds.push(...odds);
    if (typeof globalThis.gc === "function") globalThis.gc();
  }
  // agrupar por matchKey, encontrar mejor cuota por outcome, detectar arbitraje
  // ...
}
```

---

## 9. Gotchas técnicos consolidados

- **Divisores de cuotas por casa:** Kambi (Betplay/Rushbet) = ÷1000. Todas las demás = decimal directo. Siempre verificar contra el JSON real.
- **Fail fast en adaptadores:** si falta una cuota → `return null`. Filtrar con `.filter(Boolean)`. Nunca inventar un 0 o un 1 como fallback — corrompería la matemática.
- **Headers HTTP obligatorios:** Stake devuelve 406 sin `Referer`. Siempre replicar los headers que capturaste en DevTools.
- **Fechas dentro de las funciones, no a nivel de módulo:** si `today` se calcula fuera de la función, JS lo evalúa una vez al cargar el módulo y nunca se actualiza.
- **`matchKey` normalizado:** `normalize("NFD")` quita tildes. Sin esto "Bélgica" y "Belgica" no emparejan.
- **Betsson: dos gotchas:** (1) Sin `&marketTemplateIds=MW3W` → 367 MB por página → crash OOM. (2) El parámetro de paginación es `&page=N`, no `&pageNumber=N` (este último es ignorado silenciosamente devolviendo siempre la página 1).
- **Playwright en serie al final:** abrirlos en paralelo con los REST o entre sí causa pico de 3-4 GB. El orden en `arbitrageService.js` es intencional.
- **Sportium usa WebSocket STOMP:** protocolo binario sobre WS. Cierra con 1002 frecuentemente (el sitio lo detecta). `safeCall` lo absorbe. Si se quiere mejorar la fiabilidad, investigar por qué el servidor cierra 1002 (posiblemente heartbeat timing).
- **Verificar estructura JSON real antes de tocar adaptadores:** `console.log(JSON.stringify(data, null, 2))` es el patrón de debugging más efectivo en este proyecto.

---

## 10. Dónde estamos y qué sigue

### Estado actual

El sistema funciona de punta a punta:
- 11 fuentes de datos scrapeando cuotas reales
- Motor de arbitraje detectando oportunidades
- API HTTP sirviendo resultados con cache
- Frontend Vue mostrando las oportunidades al usuario
- Problema de OOM **resuelto**

### Próximos pasos posibles

1. **Mejorar matching de partidos entre casas** — el `matchKey` ya tiene normalización agresiva (quita tildes, abreviaturas de club, preposiciones, paréntesis). Aún hay falsos negativos con abreviaciones muy distintas ("Man Utd" vs "Manchester United"). Se podría explorar fuzzy matching o una lista de alias.
2. **Cobertura temporal más amplia** — algunos endpoints (Kambi `listView`) solo traen ~24-48h hacia adelante. Investigar endpoints con más horizonte.
3. **Arreglar Sportium** — investiga por qué el server cierra WS con 1002. Puede ser que el heartbeat (10000ms definido en CONNECT) no se está enviando a tiempo.
4. **Persistencia de historial** — guardar oportunidades detectadas en una base de datos para analizar tendencias.
5. **Alertas** — notificar cuando aparezca una oportunidad por encima de un umbral de ganancia.
6. **TypeScript** — el usuario quiere aprender TS; migrar el proyecto sería un buen ejercicio cuando llegue el momento.

### Riesgo a tener en cuenta

Los TOS de las casas prohíben scraping automatizado y arbitraje sistemático. El riesgo de bloqueo de IP existe, especialmente con Playwright (detectable). Mantener frecuencia razonable (el cache de 5 min ya ayuda). El riesgo legal de uso personal/educativo es bajo pero no cero.
