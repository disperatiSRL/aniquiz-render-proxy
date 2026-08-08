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
   PROXY FUNCTION
========================= */

async function proxySite(req, res, siteKey, path = "/") {

    const targetBase = SITES[siteKey];

    if (!targetBase) {
        return res.status(404).send("Unknown site");
    }


    /*
     * Normalizziamo il path.
     */
    if (!path.startsWith("/")) {
        path = "/" + path;
    }


    /*
     * Query string.
     */
    const query =
        new URLSearchParams(req.query).toString();


    const targetURL =
        targetBase +
        path +
        (query ? "?" + query : "");


    console.log(
        `[${siteKey}] ${req.method} ${targetURL}`
    );


    try {

        const headers = {};


        /*
         * Browser User-Agent
         */
        if (req.headers["user-agent"]) {
            headers["User-Agent"] =
                req.headers["user-agent"];
        }


        /*
         * Accept
         */
        if (req.headers["accept"]) {
            headers["Accept"] =
                req.headers["accept"];
        }


        /*
         * Language
         */
        if (req.headers["accept-language"]) {
            headers["Accept-Language"] =
                req.headers["accept-language"];
        }


        /*
         * Cookie
         */
        if (req.headers["cookie"]) {
            headers["Cookie"] =
                req.headers["cookie"];
        }


        const response = await fetch(
            targetURL,
            {
                method: req.method,
                headers,
                redirect: "manual"
            }
        );


        console.log(
            `[${siteKey}] RESPONSE ${response.status}`
        );


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
                response.headers.get("location");


            if (location) {

                try {

                    const redirectURL =
                        new URL(
                            location,
                            targetBase
                        );


                    /*
                     * Redirect interno
                     */
                    if (
                        redirectURL.origin ===
                        new URL(targetBase).origin
                    ) {

                        return res.redirect(
                            response.status,

                            "/" +
                            siteKey +
                            redirectURL.pathname +
                            redirectURL.search
                        );

                    }


                    /*
                     * Redirect esterno
                     */
                    return res.redirect(
                        response.status,
                        location
                    );

                } catch {

                    return res.redirect(
                        response.status,
                        location
                    );
                }
            }
        }


        /*
         * Content-Type
         */
        const contentType =
            response.headers.get(
                "content-type"
            ) || "";


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


            const host =
                new URL(
                    targetBase
                ).host;


            const proxyPrefix =
                "/" + siteKey;


            /*
             * Elimina CSP META
             */
            html = html.replace(
                /<meta[^>]*http-equiv\s*=\s*["']?Content-Security-Policy["']?[^>]*>/gi,
                ""
            );


            /*
             * Elimina X-Frame-Options META
             */
            html = html.replace(
                /<meta[^>]*http-equiv\s*=\s*["']?X-Frame-Options["']?[^>]*>/gi,
                ""
            );


            /*
             * Elimina <base>
             */
            html = html.replace(
                /<base\b[^>]*>/gi,
                ""
            );


            /*
             * URL assoluti
             *
             * https://jujutsudle.com/foo
             *
             * ->
             *
             * /jujutsu/foo
             */
            html = html.split(origin).join(
                proxyPrefix
            );


            /*
             * URL //
             */
            html = html.split(
                "//" + host
            ).join(
                proxyPrefix
            );


            /*
             * URL root-relative
             *
             * src="/foo.js"
             *
             * ->
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
             * Attributi senza virgolette
             */
            html = html.replace(
                /(src|href|action|poster)\s*=\s*\/(?!\/)/gi,

                (match, attribute) => {

                    return (
                        attribute +
                        "=" +
                        proxyPrefix +
                        "/"
                    );

                }
            );


            /*
             * Header
             */
            res.status(
                response.status
            );


            res.set(
                "Content-Type",
                "text/html; charset=utf-8"
            );


            /*
             * IMPORTANTE:
             * non mandiamo X-Frame-Options.
             */
            res.removeHeader(
                "X-Frame-Options"
            );


            res.removeHeader(
                "Content-Security-Policy"
            );


            res.removeHeader(
                "Permissions-Policy"
            );


            res.send(html);

            return;
        }


        /*
         * =========================
         * FILE / RISORSE
         * =========================
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


        /*
         * CORS
         */
        res.set(
            "Access-Control-Allow-Origin",
            "*"
        );


        res.send(buffer);


    } catch (error) {

        console.error(
            `[${siteKey}] ERROR`,
            error
        );


        res.status(502).json({

            error:
                "Bad Gateway",

            message:
                error.message,

            target:
                targetURL

        });
    }
}


/* =========================
   ROUTES
========================= */

for (const siteKey of Object.keys(SITES)) {

    /*
     * /jujutsu
     */
    app.get(
        "/" + siteKey,
        (req, res) => {

            proxySite(
                req,
                res,
                siteKey,
                "/"
            );

        }
    );


    /*
     * /jujutsu/
     */
    app.get(
        "/" + siteKey + "/",
        (req, res) => {

            proxySite(
                req,
                res,
                siteKey,
                "/"
            );

        }
    );


    /*
     * /jujutsu/qualcosa
     */
    app.get(
        "/" + siteKey + "/*",
        (req, res) => {

            const prefix =
                "/" + siteKey + "/";


            let path =
                req.path.substring(
                    prefix.length - 1
                );


            if (!path.startsWith("/")) {
                path = "/" + path;
            }


            proxySite(
                req,
                res,
                siteKey,
                path
            );

        }
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
            `AniQuiz Proxy running on ${PORT}`
        );

    }
);
