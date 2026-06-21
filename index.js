import http from "http";
import { findArbitrageOpportunities } from "./src/services/arbitrageService.js";

const PORT = process.env.PORT || 3000;

const HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, HEADERS);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === "GET" && url.pathname === "/api/opportunities") {
    const stake = parseInt(url.searchParams.get("stake") || "1000000", 10);
    console.log(`[${new Date().toISOString()}] Escaneando oportunidades con stake=${stake}...`);
    try {
      const opportunities = await findArbitrageOpportunities(stake);
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

  res.writeHead(404, HEADERS);
  res.end(JSON.stringify({ ok: false, error: "Not found" }));
});

server.timeout = 360000; // 6 minutos — el scan completo puede tardar ~3 min
server.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log(`  GET /api/opportunities?stake=1000000`);
});
