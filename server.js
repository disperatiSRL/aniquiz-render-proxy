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
});

app.disable("x-powered-by");

// ----------------------------------------------------
// HOME / HEALTH CHECK
// ----------------------------------------------------

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

// ----------------------------------------------------
// PERCORSI CHE DEVONO ESSERE PROXYATI
// ----------------------------------------------------

const proxyPrefixes = [
  "/components/",
  "/static/",
  "/images/",
  "/icons/",
  "/_next/",
  "/css/",
  "/js/",
  "/fonts/",
  "/assets/"
];

function shouldProxyRootPath(path) {
  return proxyPrefixes.some(prefix => path.startsWith(prefix));
}

// ----------------------------------------------------
// PROXY PRINCIPALE
// ----------------------------------------------------

app.use((req, res, next) => {

  const originalPath = req.originalUrl.split("?")[0];

  let targetPath = null;

  // -----------------------------------------------
  // /jujutsu/*
  // -----------------------------------------------

  if (
    originalPath === "/jujutsu" ||
    originalPath.startsWith("/jujutsu/")
  ) {

    targetPath = originalPath.substring("/jujutsu".length);

    if (!targetPath) {
      targetPath = "/";
    }
  }

  // -----------------------------------------------
  // RISORSE ROOT-RELATIVE
  // -----------------------------------------------

  else if (shouldProxyRootPath(originalPath)) {

    targetPath = originalPath;
  }

  // manifest
  else if (originalPath === "/manifest.webmanifest") {

    targetPath = "/manifest.webmanifest";
  }

  // favicon
  else if (originalPath === "/favicon.ico") {

    targetPath = "/favicon.ico";
  }

  // -----------------------------------------------
  // NON È UNA RISORSA DEL PROXY
  // -----------------------------------------------

  if (targetPath === null) {
    return next();
  }

  console.log(
    `[PROXY] ${req.method} ${req.originalUrl} -> ${TARGET}${targetPath}`
  );

  req.url =
    targetPath +
    (req.originalUrl.includes("?")
      ? "?" + req.originalUrl.split("?").slice(1).join("?")
      : "");

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

      Accept:
        req.headers.accept ||
        "*/*",

      "Accept-Language":
        req.headers["accept-language"] ||
        "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7"
    }
  });
});

// ----------------------------------------------------
// REDIRECT
// ----------------------------------------------------

proxy.on("proxyRes", (proxyRes, req, res) => {

  const location = proxyRes.headers.location;

  if (location) {

    if (location.startsWith(TARGET)) {

      const newLocation =
        location.substring(TARGET.length) || "/";

      proxyRes.headers.location =
        "/jujutsu" +
        (newLocation.startsWith("/")
          ? newLocation
          : "/" + newLocation);
    }

    else if (location.startsWith("/")) {

      proxyRes.headers.location =
        "/jujutsu" + location;
    }
  }

  // Evitiamo header che possono bloccare il proxy
  delete proxyRes.headers["content-security-policy"];

  delete proxyRes.headers["content-security-policy-report-only"];

  delete proxyRes.headers["x-frame-options"];

  delete proxyRes.headers["cross-origin-opener-policy"];

  delete proxyRes.headers["cross-origin-embedder-policy"];

  delete proxyRes.headers["cross-origin-resource-policy"];
});

// ----------------------------------------------------
// ERRORI
// ----------------------------------------------------

proxy.on("error", (err, req, res) => {

  console.error(
    "[PROXY ERROR]",
    err.message
  );

  if (!res.headersSent) {

    res.status(502).send(`
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>502 Bad Gateway</title>
</head>
<body>
<h1>502 Bad Gateway</h1>
<pre>${escapeHtml(err.message)}</pre>
</body>
</html>
`);
  }
});

// ----------------------------------------------------
// 404
// ----------------------------------------------------

app.use((req, res) => {

  res.status(404).send("Not Found");
});

// ----------------------------------------------------
// SERVER
// ----------------------------------------------------

app.listen(PORT, "0.0.0.0", () => {

  console.log(
    `AniQuiz proxy running on port ${PORT}`
  );

  console.log(
    `Target: ${TARGET}`
  );
});

// ----------------------------------------------------
// HTML ESCAPE
// ----------------------------------------------------

function escapeHtml(value) {

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
