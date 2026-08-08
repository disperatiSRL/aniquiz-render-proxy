import express from "express";

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
   PROXY
========================= */

app.use("/:site/*path", async (req, res) => {

    const siteKey = req.params.site;

    if (!SITES[siteKey]) {

        return res.status(404).send(
            "Unknown AniDle"
        );

    }


    const targetBase = SITES[siteKey];

    /*
     * Recuperiamo il path catturato.
     */
    let requestedPath = req.params.path || "";

    if (!requestedPath.startsWith("/")) {
        requestedPath = "/" + requestedPath;
    }


    /*
     * Costruiamo URL originale.
     */
    const targetURL =
        targetBase +
        requestedPath +
        (
            Object.keys(req.query).length
                ? "?" + new URLSearchParams(req.query)
                : ""
        );


    console.log(
        `${siteKey} → ${targetURL}`
    );


    try {

        const headers = {};


        /*
         * Manteniamo User-Agent.
         */
        if (req.headers["user-agent"]) {

            headers["User-Agent"] =
                req.headers["user-agent"];

        }


        /*
         * Accept.
         */
        if (req.headers["accept"]) {

            headers["Accept"] =
                req.headers["accept"];

        }


        /*
         * Accept-Language.
         */
        if (req.headers["accept-language"]) {

            headers["Accept-Language"] =
                req.headers["accept-language"];

        }


        /*
         * Cookie.
         */
        if (req.headers["cookie"]) {

            headers["Cookie"] =
                req.headers["cookie"];

        }


        const response =
            await fetch(
                targetURL,
                {
                    headers,
                    redirect: "manual"
                }
            );


        console.log(
            `${siteKey} ← ${response.status}`
        );


        /*
         * Copiamo il content-type.
         */
        const contentType =
            response.headers.get(
                "content-type"
            ) || "";


        /*
         * =========================
         * REDIRECT
         * =========================
         */

        if (
            response.status >= 300 &&
            response.status < 400
        ) {

            const location =
                response.headers.get(
                    "location"
                );


            if (location) {

                const redirectURL =
                    new URL(
                        location,
                        targetBase
                    );


                /*
                 * Redirect interno
                 * → redirect attraverso il proxy.
                 */
                if (
                    redirectURL.origin ===
                    new URL(targetBase).origin
                ) {

                    const proxyLocation =
                        "/" +
                        siteKey +
                        redirectURL.pathname +
                        redirectURL.search;


                    return res.redirect(
                        response.status,
                        proxyLocation
                    );

                }


                /*
                 * Redirect esterno.
                 */
                return res.redirect(
                    response.status,
                    location
                );
            }

        }


        /*
         * =========================
         * HTML
         * =========================
         */

        if (
            contentType.includes(
                "text/html"
            )
        ) {

            let html =
                await response.text();


            const origin =
                new URL(
                    targetBase
                ).origin;


            const proxyPrefix =
                "/" + siteKey;


            /*
             * Rimuove X-Frame-Options
             * se presente come META.
             */
            html = html.replace(
                /<meta[^>]*http-equiv=["']?X-Frame-Options["']?[^>]*>/gi,
                ""
            );


            /*
             * Rimuove CSP META.
             */
            html = html.replace(
                /<meta[^>]*http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi,
                ""
            );


            /*
             * Rimuove <base>.
             */
            html = html.replace(
                /<base\b[^>]*>/gi,
                ""
            );


            /*
             * URL assoluti.
             *
             * https://jujutsudle.com/foo
             *
             * →
             *
             * /jujutsu/foo
             */
            html = html.replaceAll(
                origin,
                proxyPrefix
            );


            /*
             * URL protocol-relative.
             *
             * //jujutsudle.com/foo
             */
            html = html.replaceAll(
                "//" +
                new URL(targetBase).host,
                proxyPrefix
            );


            /*
             * Root-relative:
             *
             * src="/foo.js"
             *
             * →
             *
             * src="/jujutsu/foo.js"
             */
            html = html.replace(
                /(src|href|action|poster)\s*=\s*(["'])\/(?!\/)/gi,
                (match, attribute, quote) => {

                    return (
                        attribute +
                        "=" +
                        quote +
                        proxyPrefix +
                        "/"
                    );

                }
            );


            /*
             * Risposta.
             */
            res.status(
                response.status
            );


            res.set(
                "Content-Type",
                "text/html; charset=utf-8"
            );


            res.set(
                "Cache-Control",
                "no-cache"
            );


            /*
             * Permette iframe.
             */
            res.removeHeader(
                "X-Frame-Options"
            );


            res.send(html);

            return;
        }


        /*
         * =========================
         * RISORSE
         * =========================
         *
         * CSS
         * JS
         * immagini
         * font
         * JSON
         * ecc.
         */

        const buffer =
            Buffer.from(
                await response.arrayBuffer()
            );


        res.status(
            response.status
        );


        if (contentType) {

            res.set(
                "Content-Type",
                contentType
            );

        }


        res.set(
            "Access-Control-Allow-Origin",
            "*"
        );


        /*
         * Restituisce il file.
         */
        res.send(buffer);


    } catch (error) {

        console.error(
            "PROXY ERROR:",
            error
        );


        res.status(502).json({

            error:
                "Unable to fetch upstream site",

            message:
                error.message

        });

    }

});


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
