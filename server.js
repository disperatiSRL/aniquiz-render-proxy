import express from "express";
import { createProxyMiddleware, responseInterceptor } from "http-proxy-middleware";

const app = express();

const PORT = process.env.PORT || 10000;

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
   HEALTH
========================= */

app.get("/health", (req, res) => {
    res.json({
        ok: true,
        service: "AniQuiz Proxy"
    });
});


/* =========================
   HTML REWRITE
========================= */

function rewriteHTML(html, siteKey) {

    const target = SITES[siteKey];
    const proxyPrefix = "/" + siteKey;

    const targetURL = new URL(target);

    /*
     * Rimuove CSP inserita come META
     */
    html = html.replace(
        /<meta[^>]+http-equiv\s*=\s*["']?Content-Security-Policy["']?[^>]*>/gi,
        ""
    );

    /*
     * Rimuove <base>
     */
    html = html.replace(
        /<base\b[^>]*>/gi,
        ""
    );

    /*
     * URL assoluti
     *
     * https://jujutsudle.com/xxx
     *
     * ->
     *
     * /jujutsu/xxx
     */
    const escapedOrigin = target.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
    );

    html = html.replace(
        new RegExp(escapedOrigin, "gi"),
        proxyPrefix
    );

    /*
     * URL //jujutsudle.com/xxx
     */
    const escapedHost = targetURL.host.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
    );

    html = html.replace(
        new RegExp("//" + escapedHost, "gi"),
        proxyPrefix
    );

    /*
     * URL root-relative.
     *
     * src="/app.js"
     *
     * ->
     *
     * src="/jujutsu/app.js"
     */
    html = html.replace(
        /(src|href|action|poster)\s*=\s*(["'])\/(?!\/)/gi,
        (match, attr, quote) => {
            return `${attr}=${quote}${proxyPrefix}/`;
        }
    );

    return html;
}


/* =========================
   CREATE PROXY
========================= */

function createSiteProxy(siteKey) {

    const target = SITES[siteKey];

    return createProxyMiddleware({

        target,

        /*
         * IMPORTANTISSIMO:
         * usa l'host del sito originale.
         */
        changeOrigin: true,

        secure: true,

        ws: true,

        followRedirects: true,

        selfHandleResponse: true,

        /*
         * Non facciamo più pathRewrite.
         *
         * Express /jujutsu rimuove già il mount
         * prima di passare la richiesta al middleware.
         */

        on: {

            proxyReq: (proxyReq, req) => {

                /*
                 * User-Agent del browser.
                 */
                if (req.headers["user-agent"]) {

                    proxyReq.setHeader(
                        "user-agent",
                        req.headers["user-agent"]
                    );
                }

                /*
                 * Accetta HTML normale.
                 */
                proxyReq.setHeader(
                    "accept",
                    req.headers["accept"] ||
                    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
                );

                /*
                 * NON impostiamo Origin.
                 * NON impostiamo Referer.
                 *
                 * Lasciamo che il proxy gestisca
                 * la richiesta normalmente.
                 */
            },


            proxyRes: responseInterceptor(
                async (responseBuffer, proxyRes, req, res) => {

                    const headers = {
                        ...proxyRes.headers
                    };

                    /*
                     * Elimina X-Frame-Options
                     */
                    delete headers[
                        "x-frame-options"
                    ];

                    /*
                     * Elimina CSP HTTP.
                     */
                    delete headers[
                        "content-security-policy"
                    ];

                    /*
                     * Elimina Permissions-Policy
                     *
                     * Non è necessario per il proxy,
                     * ma evita i warning che stai vedendo.
                     */
                    delete headers[
                        "permissions-policy"
                    ];


                    /*
                     * Cookie
                     */
                    if (
                        headers["set-cookie"]
                    ) {

                        headers["set-cookie"] =
                            headers["set-cookie"].map(
                                cookie => {

                                    return cookie
                                        .replace(
                                            /;\s*Domain=[^;]*/gi,
                                            ""
                                        )
                                        .replace(
                                            /;\s*SameSite=None/gi,
                                            "; SameSite=Lax"
                                        );
                                }
                            );
                    }


                    /*
                     * Controlliamo il content-type.
                     */
                    const contentType =
                        headers["content-type"] ||
                        "";


                    let body =
                        responseBuffer;


                    /*
                     * HTML
                     */
                    if (
                        contentType.includes(
                            "text/html"
                        )
                    ) {

                        const html =
                            responseBuffer.toString(
                                "utf8"
                            );

                        body =
                            rewriteHTML(
                                html,
                                siteKey
                            );
                    }


                    /*
                     * Se il sito risponde con redirect,
                     * convertiamo il redirect al proxy.
                     */
                    if (
                        headers.location
                    ) {

                        try {

                            const redirectURL =
                                new URL(
                                    headers.location,
                                    target
                                );

                            if (
                                redirectURL.origin ===
                                new URL(target).origin
                            ) {

                                headers.location =
                                    "/" +
                                    siteKey +
                                    redirectURL.pathname +
                                    redirectURL.search;
                            }

                        } catch (error) {

                            console.log(
                                "Redirect non riscrivibile:",
                                headers.location
                            );
                        }
                    }


                    /*
                     * Il body è stato modificato,
                     * quindi Content-Length originale
                     * non è più valido.
                     */
                    delete headers[
                        "content-length"
                    ];

                    delete headers[
                        "content-encoding"
                    ];


                    /*
                     * CORS
                     */
                    headers[
                        "access-control-allow-origin"
                    ] = "*";


                    /*
                     * Restituisce la risposta.
                     */
                    res.writeHead(
                        proxyRes.statusCode || 200,
                        headers
                    );

                    return body;
                }
            ),


            error: (err, req, res) => {

                console.error(
                    "PROXY ERROR:",
                    err
                );

                if (!res.headersSent) {

                    res.status(502);
                }

                res.end(
                    JSON.stringify({
                        error: "Proxy error",
                        message: err.message
                    })
                );
            }
        }
    });
}


/* =========================
   REGISTER ALL SITES
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
            `AniQuiz Proxy running on port ${PORT}`
        );
    }
);
