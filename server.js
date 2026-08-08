import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

const app = express();
const PORT = Number(process.env.PORT) || 10000;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

const SITES = {
  jujutsu: "https://jujutsudle.com",
  naruto: "https://narutodle.org",
  bleach: "https://bleachdle.org",
  kimetsu: "https://kimetsudle.com",
  jojo: "https://jojodle.com",
  bluelock: "https://bluelockdle.com",
  clover: "https://cloverdle.com"
};

app.disable("x-powered-by");
app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/", (_req, res) => res.type("text").send("AniQuiz AniDle proxy is running."));

function rewriteHtml(html, siteKey) {
  const origin = SITES[siteKey];
  const proxyBase = `/${siteKey}`;
  const escaped = origin.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
  const host = new URL(origin).host.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");

  html = html.replace(/<base\\b[^>]*>/gi, "");
  html = html.replace(/<meta[^>]+http-equiv\\s*=\\s*["']?content-security-policy["']?[^>]*>/gi, "");
  html = html.replace(new RegExp(escaped, "gi"), proxyBase);
  html = html.replace(new RegExp(`//${host}`, "gi"), proxyBase);
  html = html.replace(/\\b(href|src|action|poster)\\s*=\\s*(["'])\\/(?!\\/)/gi, `$1=$2${proxyBase}/`);
  return html;
}

function proxyFor(siteKey) {
  const target = SITES[siteKey];
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    secure: true,
    ws: true,
    selfHandleResponse: true,
    pathRewrite: (path) => {
      const prefix = `/${siteKey}`;
      let p = path.startsWith(prefix) ? path.slice(prefix.length) : path;
      return p || "/";
    },
    on: {
      proxyReq(proxyReq) {
        proxyReq.removeHeader("host");
        proxyReq.setHeader("origin", target);
        proxyReq.setHeader("referer", `${target}/`);
      },
      proxyRes: async (proxyRes, req, res) => {
        const headers = { ...proxyRes.headers };
        delete headers["x-frame-options"];
        delete headers["content-security-policy"];
        delete headers["content-length"];
        delete headers["content-encoding"];

        if (headers["set-cookie"]) {
          headers["set-cookie"] = headers["set-cookie"].map(c =>
            c.replace(/;\\s*Domain=[^;]*/gi, "")
             .replace(/;\\s*SameSite=None/gi, "; SameSite=Lax")
          );
        }

        const type = headers["content-type"] || "";
        if (type.includes("text/html")) {
          const chunks = [];
          proxyRes.on("data", c => chunks.push(c));
          proxyRes.on("end", () => {
            const html = rewriteHtml(Buffer.concat(chunks).toString("utf8"), siteKey);
            res.writeHead(proxyRes.statusCode || 200, {
              ...headers,
              "content-type": "text/html; charset=utf-8",
              "access-control-allow-origin": ALLOWED_ORIGIN
            });
            res.end(html);
          });
          return;
        }

        res.writeHead(proxyRes.statusCode || 200, {
          ...headers,
          "access-control-allow-origin": ALLOWED_ORIGIN
        });
        proxyRes.pipe(res);
      },
      error(err, req, res) {
        if (!res.headersSent) res.writeHead(502, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Upstream proxy error", message: err.message }));
      }
    }
  });
}

for (const key of Object.keys(SITES)) app.use(`/${key}`, proxyFor(key));

app.listen(PORT, "0.0.0.0", () => console.log(`AniQuiz proxy listening on ${PORT}`));
