import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { findArbitrageOpportunities } from "./src/services/arbitrageService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, "frontend", "dist");

const MIME = {
  ".html": "text/html",
  ".js":   "application/javascript",
  ".css":  "text/css",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon",
  ".png":  "image/png",
  ".woff2":"font/woff2",
};

function serveStatic(req, res) {
  let filePath = path.join(DIST, req.url === "/" ? "/index.html" : req.url);
  // Strip query string
  filePath = filePath.split("?")[0];
  if (!fs.existsSync(filePath)) filePath = path.join(DIST, "index.html");
  const ext = path.extname(filePath);
  const ct = MIME[ext] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": ct });
  fs.createReadStream(filePath).pipe(res);
}

const PORT = process.env.PORT || 3000;
const CACHE_MS = 5 * 60 * 1000; // 5 minutes

const HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Prevents concurrent scans (each scan opens 3 Playwright browsers — running two in parallel causes OOM)
let activePromise = null;
let cache = null; // { stake, data, at }

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, HEADERS);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === "GET" && url.pathname === "/api/opportunities") {
    const stake = parseInt(url.searchParams.get("stake") || "1000000", 10);

    // Return cached result if still fresh
    if (cache && cache.stake === stake && Date.now() - cache.at < CACHE_MS) {
      res.writeHead(200, HEADERS);
      res.end(JSON.stringify({ ok: true, count: cache.data.length, opportunities: cache.data, cached: true }));
      return;
    }

    // Coalesce: if a scan is already running, attach to it instead of starting a new one
    if (!activePromise) {
      console.log(`[${new Date().toISOString()}] Escaneando oportunidades con stake=${stake}...`);
      activePromise = findArbitrageOpportunities(stake)
        .then(data => { cache = { stake, data, at: Date.now() }; return data; })
        .finally(() => { activePromise = null; });
    } else {
      console.log(`[${new Date().toISOString()}] Solicitud encolada — esperando scan en curso...`);
    }

    try {
      const opportunities = await activePromise;
      console.log(`[${new Date().toISOString()}] Encontradas: ${opportunities.length}`);
      res.writeHead(200, HEADERS);
      res.end(JSON.stringify({ ok: true, count: opportunities.length, opportunities }));
    } catch (err) {
      console.error("Error:", err.message);
      res.writeHead(500, HEADERS);
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  // Serve frontend for everything else
  serveStatic(req, res);
  return;
});

server.timeout = 360000; // 6 minutos — el scan completo puede tardar ~3 min
server.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log(`  GET /api/opportunities?stake=1000000`);
});
