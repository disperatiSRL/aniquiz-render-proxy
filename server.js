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

/* =========================
   HEALTH CHECK
========================= */

app.get("/health", (_req, res) => {
    res.json({
        ok: true,
        service: "aniquiz-render-proxy"
    });
});

app.get("/", (_req, res) => {
    res.type("text").send(
        "AniQuiz AniDle proxy is running."
    );
});


/* =========================
   HTML REWRITE
========================= */

function rewriteHtml(html, siteKey) {

    const target = SITES[siteKey];

    const targetURL = new URL(target);

    const proxyBase = "/" + siteKey;


    /*
     * Rimuove eventuale CSP inserita
     * direttamente nell'HTML.
     */
    html = html.replace(
        /<meta[^>]+http-equiv\s*=\s*["']?Content-Security-Policy["']?[^>]*>/gi,
        ""
    );


    /*
     * Rimuove <base href="...">
     */
    html = html.replace(
        /<base\b[^>]*>/gi,
        ""
    );


    /*
     * URL assoluti:
     *
     * https://jujutsudle.com/foo.js
     *
     * diventa:
     *
     * /jujutsu/foo.js
     */
    const escapedOrigin =
        target.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
        );

    html = html.replace(
        new RegExp(escapedOrigin, "gi"),
        proxyBase
    );


    /*
     * URL del tipo:
     *
     * //jujutsudle.com/foo.js
     */
    const escapedHost =
        targetURL.host.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
        );

    html = html.replace(
        new RegExp(
            "//" + escapedHost,
            "gi"
        ),
        proxyBase
    );


    /*
     * Riscrive URL root-relative:
     *
     * src="/assets/app.js"
     *
     * diventa:
     *
     * src="/jujutsu/assets/app.js"
     *
     * Stessa cosa per href, action e poster.
     */
    html = html.replace(
        /(href|src|action|poster)\s*=\s*(["'])\/(?!\/)/gi,
        function (_match, attribute, quote) {

            return (
                attribute +
                "=" +
                quote +
                proxyBase +
                "/"
            );
        }
    );


    return html;
}


/* =========================
   COOKIE REWRITE
========================= */

function rewriteCookies(cookies) {

    if (!cookies) {
        return cookies;
    }

    return cookies.map(cookie => {

        return cookie
            /*
             * Elimina Domain=...
             */
            .replace(
                /;\s*Domain=[^;]*/gi,
                ""
            )

            /*
             * Il cookie appartiene al proxy.
             */
            .replace(
                /;\s*Path=[^;]*/gi,
                "; Path=/"
            );
    });
}


/* =========================
   CREA PROXY
========================= */

function createSiteProxy(siteKey) {

    const target = SITES[siteKey];

    return createProxyMiddleware({

        target,

        changeOrigin: true,

        secure: true,

        ws: true,

        xfwd: true,

        selfHandleResponse: true,


        /*
         * /jujutsu/assets/app.js
         *
         * diventa:
         *
         * /assets/app.js
         */
        pathRewrite: (path) => {

            const prefix =
                "/" + siteKey;

            let newPath;

            if (path.startsWith(prefix)) {

                newPath =
                    path.substring(
                        prefix.length
                    );

            } else {

                newPath = path;
            }


            if (!newPath) {
                newPath = "/";
            }


            return newPath;
        },


        on: {

            /* =====================
               REQUEST
            ===================== */

            proxyReq: (proxyReq) => {

                proxyReq.removeHeader(
                    "host"
                );

                proxyReq.setHeader(
                    "origin",
                    target
                );

                proxyReq.setHeader(
                    "referer",
                    target + "/"
                );
            },


            /* =====================
               RESPONSE
            ===================== */

            proxyRes: (proxyRes, req, res) => {

                const headers = {
                    ...proxyRes.headers
                };


                /*
                 * Rimuoviamo X-Frame-Options
                 */
                delete headers[
                    "x-frame-options"
                ];


                /*
                 * Rimuoviamo CSP HTTP
                 */
                delete headers[
                    "content-security-policy"
                ];


                /*
                 * Cookie
                 */
                if (
                    headers["set-cookie"]
                ) {

                    headers["set-cookie"] =
                        rewriteCookies(
                            headers["set-cookie"]
                        );
                }


                const contentType =
                    headers["content-type"] ||
                    "";


                /*
                 * HTML
                 */
                if (
                    contentType.includes(
                        "text/html"
                    )
                ) {

                    const chunks = [];


                    proxyRes.on(
                        "data",
                        chunk => {
                            chunks.push(chunk);
                        }
                    );


                    proxyRes.on(
                        "end",
                        () => {

                            let html =
                                Buffer
                                    .concat(chunks)
                                    .toString("utf8");


                            html =
                                rewriteHtml(
                                    html,
                                    siteKey
                                );


                            delete headers[
                                "content-length"
                            ];

                            delete headers[
                                "content-encoding"
                            ];


                            res.writeHead(
                                proxyRes.statusCode ||
                                    200,
                                {
                                    ...headers,

                                    "content-type":
                                        "text/html; charset=utf-8",

                                    "access-control-allow-origin":
                                        ALLOWED_ORIGIN,

                                    "access-control-allow-credentials":
                                        "true"
                                }
                            );


                            res.end(html);
                        }
                    );


                    return;
                }


                /*
                 * Tutte le altre risorse:
                 *
                 * JS
                 * CSS
                 * immagini
                 * font
                 * JSON
                 * ecc.
                 */
                res.writeHead(
                    proxyRes.statusCode ||
                        200,
                    {
                        ...headers,

                        "access-control-allow-origin":
                            ALLOWED_ORIGIN,

                        "access-control-allow-credentials":
                            "true"
                    }
                );


                proxyRes.pipe(res);
            },


            /* =====================
               ERROR
            ===================== */

            error: (err, req, res) => {

                console.error(
                    "Proxy error:",
                    err
                );


                if (
                    !res.headersSent
                ) {

                    res.writeHead(
                        502,
                        {
                            "content-type":
                                "application/json; charset=utf-8",

                            "access-control-allow-origin":
                                ALLOWED_ORIGIN
                        }
                    );
                }


                res.end(
                    JSON.stringify({
                        error:
                            "Upstream proxy error",

                        message:
                            err.message
                    })
                );
            }
        }
    });
}


/* =========================
   REGISTRA I PROXY
========================= */

for (
    const siteKey of Object.keys(SITES)
) {

    app.use(
        "/" + siteKey,
        createSiteProxy(siteKey)
    );
}


/* =========================
   START
========================= */

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `AniQuiz proxy listening on port ${PORT}`
        );
    }
);
