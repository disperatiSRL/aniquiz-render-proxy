import express from "express";
import httpProxy from "http-proxy";

const app = express();

const PORT = process.env.PORT || 10000;
const TARGET = "https://jujutsudle.com";

const proxy = httpProxy.createProxyServer({
  changeOrigin: true,
  secure: true,
  xfwd: true,
  followRedirects: true,
  selfHandleResponse: false,
});

// Evita che Express modifichi/analizzi il body delle richieste
app.disable("x-powered-by");

// Health check Render
app.get("/", (req, res) => {
  res.status(200).send(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>AniQuiz Proxy</title>
      </head>
      <body>
        <h1>AniQuiz Proxy Online</h1>
        <p>Jujutsudle proxy is running.</p>
      </body>
    </html>
  `);
});

// Tutto quello che arriva sotto /jujutsu viene inoltrato a jujutsudle.com
app.use("/jujutsu", (req, res) => {
  let path = req.originalUrl;

  // Rimuove /jujutsu dall'URL destinazione
  path = path.replace(/^\/jujutsu/, "");

  if (!path || path === "/") {
    path = "/";
  }

  req.url = path;

  proxy.web(req, res, {
    target: TARGET,
    changeOrigin: true,
    ignorePath: true,
    headers: {
      Host: "jujutsudle.com",
      Origin: TARGET,
      Referer: TARGET + "/",
      "User-Agent":
        req.headers["user-agent"] ||
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
      Accept: req.headers.accept || "*/*",
      "Accept-Language":
        req.headers["accept-language"] || "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
    },
  });
});

// Gestione errori proxy
proxy.on("error", (err, req, res) => {
  console.error("PROXY ERROR:", err.message);

  if (!res.headersSent) {
    res.status(502).send(`
      <!doctype html>
      <html>
        <body>
          <h1>502 Bad Gateway</h1>
          <pre>${escapeHtml(err.message)}</pre>
        </body>
      </html>
    `);
  }
});

// Riscrive i redirect del sito originale
proxy.on("proxyRes", (proxyRes, req, res) => {
  const location = proxyRes.headers.location;

  if (location) {
    if (location.startsWith(TARGET)) {
      proxyRes.headers.location =
        "/jujutsu" + location.substring(TARGET.length);
    } else if (location.startsWith("/")) {
      proxyRes.headers.location = "/jujutsu" + location;
    }
  }

  // Evita che il sito originale impedisca l'embed/proxy
  delete proxyRes.headers["content-security-policy"];
  delete proxyRes.headers["content-security-policy-report-only"];
  delete proxyRes.headers["x-frame-options"];
  delete proxyRes.headers["content-length"];

  // Alcuni header possono creare problemi passando attraverso il proxy
  delete proxyRes.headers["cross-origin-opener-policy"];
  delete proxyRes.headers["cross-origin-embedder-policy"];
  delete proxyRes.headers["cross-origin-resource-policy"];
});

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`AniQuiz proxy running on port ${PORT}`);
});
