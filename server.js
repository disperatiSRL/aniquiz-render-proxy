import express from "express";
import httpProxy from "http-proxy";

const app = express();

const PORT = process.env.PORT || 10000;
const TARGET = "https://jujutsudle.com";

const proxy = httpProxy.createProxyServer({
    changeOrigin: true,
    secure: true,
    xfwd: true,
    followRedirects: false,
});

app.disable("x-powered-by");

// ----------------------------------------------------
// HEALTH CHECK
// ----------------------------------------------------

app.get("/", (req, res) => {
    res.status(200).type("text/plain").send(
        "AniQuiz Render Proxy is running"
    );
});

// ----------------------------------------------------
// COSTRUZIONE QUERY STRING
// ----------------------------------------------------

function getQuery(req) {
    const index = req.originalUrl.indexOf("?");

    if (index === -1) {
        return "";
    }

    return req.originalUrl.substring(index);
}

// ----------------------------------------------------
// PATH DA PROXYARE
// ----------------------------------------------------

function getTargetPath(originalPath) {

    // -----------------------------------------------
    // /jujutsu/*
    // -----------------------------------------------

    if (
        originalPath === "/jujutsu" ||
        originalPath.startsWith("/jujutsu/")
    ) {
        let path = originalPath.substring("/jujutsu".length);

        if (!path) {
            path = "/";
        }

        return path;
    }

    // -----------------------------------------------
    // FILE / CARTELLE ROOT DEL SITO
    // -----------------------------------------------

    const rootPaths = [
        "/components/",
        "/static/",
        "/images/",
        "/icons/",
        "/_next/",
        "/css/",
        "/js/",
        "/fonts/",
        "/assets/",
        "/jujutsukaisen.html",
        "/manifest.webmanifest",
        "/favicon.ico",
        "/robots.txt",
        "/sitemap.xml"
    ];

    for (const prefix of rootPaths) {
        if (originalPath.startsWith(prefix)) {
            return originalPath;
        }
    }

    return null;
}

// ----------------------------------------------------
// PROXY
// ----------------------------------------------------

app.use((req, res, next) => {

    const originalPath = req.originalUrl.split("?")[0];

    const targetPath = getTargetPath(originalPath);

    if (targetPath === null) {
        return next();
    }

    const query = getQuery(req);

    const finalPath = targetPath + query;

    console.log(
        `[PROXY] ${req.method} ${req.originalUrl} -> ${TARGET}${finalPath}`
    );

    // IMPORTANTE:
    // http-proxy con ignorePath=true utilizza req.url
    // come path finale da inviare al target.

    req.url = finalPath;

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
                req.headers["accept"] ||
                "*/*",

            "Accept-Language":
                req.headers["accept-language"] ||
                "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7"
        }
    });
});

// ----------------------------------------------------
// RISCRITTURA RISPOSTE
// ----------------------------------------------------

proxy.on("proxyRes", (proxyRes, req, res) => {

    console.log(
        `[RESPONSE] ${req.method} ${req.url} -> ${proxyRes.statusCode}`
    );

    // -----------------------------------------------
    // REDIRECT
    // -----------------------------------------------

    const location = proxyRes.headers.location;

    if (location) {

        console.log(`[REDIRECT] ${location}`);

        // Redirect assoluto verso jujutsudle.com
        if (location.startsWith(TARGET)) {

            const newLocation =
                location.substring(TARGET.length) || "/";

            proxyRes.headers.location =
                "/jujutsu" +
                (
                    newLocation.startsWith("/")
                        ? newLocation
                        : "/" + newLocation
                );
        }

        // Redirect relativo
        else if (location.startsWith("/")) {

            // Le risorse globali devono rimanere globali.
            const globalPrefixes = [
                "/components/",
                "/static/",
                "/images/",
                "/icons/",
                "/_next/",
                "/css/",
                "/js/",
                "/fonts/",
                "/assets/",
                "/jujutsukaisen.html",
                "/manifest.webmanifest",
                "/favicon.ico"
            ];

            const isGlobal =
                globalPrefixes.some(prefix =>
                    location.startsWith(prefix)
                );

            if (!isGlobal) {
                proxyRes.headers.location =
                    "/jujutsu" + location;
            }
        }
    }

    // -----------------------------------------------
    // HEADER CHE POSSONO BLOCCARE L'EMBED
    // -----------------------------------------------

    delete proxyRes.headers["content-security-policy"];
    delete proxyRes.headers["content-security-policy-report-only"];

    delete proxyRes.headers["x-frame-options"];

    delete proxyRes.headers["cross-origin-opener-policy"];
    delete proxyRes.headers["cross-origin-embedder-policy"];
    delete proxyRes.headers["cross-origin-resource-policy"];

    // -----------------------------------------------
    // EVITA PROBLEMI CON COMPRESSIONE / REWRITE
    // -----------------------------------------------

    delete proxyRes.headers["content-length"];

});

// ----------------------------------------------------
// ERRORI PROXY
// ----------------------------------------------------

proxy.on("error", (err, req, res) => {

    console.error(
        "[PROXY ERROR]",
        err
    );

    if (!res.headersSent) {

        res.status(502).type("text/plain").send(
            "Proxy error: " + err.message
        );
    }
});

// ----------------------------------------------------
// 404
// ----------------------------------------------------

app.use((req, res) => {

    res.status(404)
        .type("text/plain")
        .send("Not Found");
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
