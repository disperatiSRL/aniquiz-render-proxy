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


/* =========================================================
   HEALTH
========================================================= */

app.get("/health", (_req, res) => {

    res.json({
        ok: true,
        service: "AniQuiz Proxy"
    });

});


/* =========================================================
   URL REWRITE
========================================================= */

function rewriteURLs(text, siteKey, targetBase) {

    const proxyPrefix = "/" + siteKey;

    const targetURL = new URL(targetBase);

    const origin = targetURL.origin;
    const host = targetURL.host;


    /*
     * -----------------------------------------------------
     * URL ASSOLUTI
     *
     * https://jujutsudle.com/foo
     *
     * ->
     *
     * /jujutsu/foo
     * -----------------------------------------------------
     */

    text = text.split(origin).join(
        proxyPrefix
    );


    /*
     * -----------------------------------------------------
     * URL PROTOCOL RELATIVE
     *
     * //jujutsudle.com/foo
     *
     * ->
     *
     * /jujutsu/foo
     * -----------------------------------------------------
     */

    text = text.split(
        "//" + host
    ).join(
        proxyPrefix
    );


    /*
     * -----------------------------------------------------
     * HTML:
     *
     * src="/foo"
     * href="/foo"
     * action="/foo"
     * poster="/foo"
     * -----------------------------------------------------
     */

    text = text.replace(
        /((?:src|href|action|poster|content)\s*=\s*["'])\/(?!\/)/gi,
        `$1${proxyPrefix}/`
    );


    /*
     * -----------------------------------------------------
     * HTML / JS:
     *
     * url("/foo")
     *
     * -----------------------------------------------------
     */

    text = text.replace(
        /(\(\s*["'])\/(?!\/)/g,
        `$1${proxyPrefix}/`
    );


    /*
     * -----------------------------------------------------
     * JAVASCRIPT:
     *
     * "/images/foo.webp"
     * '/images/foo.webp'
     *
     * ->
     *
     * "/jujutsu/images/foo.webp"
     * -----------------------------------------------------
     */

    text = text.replace(
        /(["'`])\/(?!\/)([^"'`\s<>{}]+)/g,
        (match, quote, path) => {

            /*
             * Non modificare:
             *
             * /jujutsu/...
             */

            if (
                path.startsWith(
                    siteKey + "/"
                )
            ) {
                return match;
            }


            return (
                quote +
                proxyPrefix +
                "/" +
                path
            );
        }
    );


    /*
     * -----------------------------------------------------
     * CSS:
     *
     * url(/images/foo.webp)
     * -----------------------------------------------------
     */

    text = text.replace(
        /url\(\s*["']?\/(?!\/)([^)"']+)/gi,
        (match, path) => {

            return (
                `url(${proxyPrefix}/${path}`
            );

        }
    );


    return text;
}


/* =========================================================
   REMOVE SECURITY HEADERS
========================================================= */

function cleanHeaders(res) {

    res.removeHeader(
        "x-frame-options"
    );

    res.removeHeader(
        "content-security-policy"
    );

    res.removeHeader(
        "permissions-policy"
    );

}


/* =========================================================
   PROXY
========================================================= */

async function proxySite(
    req,
    res,
    siteKey,
    requestedPath
) {

    const targetBase =
        SITES[siteKey];


    if (!targetBase) {

        return res
            .status(404)
            .send("Unknown AniDle");

    }


    if (
        !requestedPath ||
        requestedPath === ""
    ) {

        requestedPath = "/";

    }


    if (
        !requestedPath.startsWith("/")
    ) {

        requestedPath =
            "/" + requestedPath;

    }


    /*
     * Query string
     */

    const query =
        new URLSearchParams(
            req.query
        ).toString();


    const targetURL =
        targetBase +
        requestedPath +
        (
            query
                ? "?" + query
                : ""
        );


    console.log(
        `[${siteKey}] → ${req.method} ${targetURL}`
    );


    try {

        const requestHeaders = {};


        /*
         * User-Agent
         */

        if (
            req.headers["user-agent"]
        ) {

            requestHeaders[
                "User-Agent"
            ] =
                req.headers[
                    "user-agent"
                ];

        }


        /*
         * Accept
         */

        if (
            req.headers["accept"]
        ) {

            requestHeaders[
                "Accept"
            ] =
                req.headers[
                    "accept"
                ];

        }


        /*
         * Accept-Language
         */

        if (
            req.headers[
                "accept-language"
            ]
        ) {

            requestHeaders[
                "Accept-Language"
            ] =
                req.headers[
                    "accept-language"
                ];

        }


        /*
         * Cookie
         */

        if (
            req.headers["cookie"]
        ) {

            requestHeaders[
                "Cookie"
            ] =
                req.headers[
                    "cookie"
                ];

        }


        /*
         * Referer
         */

        requestHeaders[
            "Referer"
        ] =
            targetBase + "/";


        /*
         * Origin
         */

        requestHeaders[
            "Origin"
        ] =
            targetBase;


        const response =
            await fetch(
                targetURL,
                {
                    method:
                        req.method === "HEAD"
                            ? "HEAD"
                            : "GET",

                    headers:
                        requestHeaders,

                    redirect:
                        "manual"
                }
            );


        console.log(
            `[${siteKey}] ← ${response.status}`
        );


        /*
         * =================================================
         * REDIRECT
         * =================================================
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
                        new URL(
                            targetBase
                        ).origin
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
         * =================================================
         * CONTENT TYPE
         * ================================================= */

        const contentType =
            response.headers.get(
                "content-type"
            ) || "";


        /*
         * =================================================
         * TESTO / HTML / JS / JSON / CSS
         * ================================================= */

        const shouldRewrite =
            contentType.includes(
                "text/html"
            ) ||
            contentType.includes(
                "javascript"
            ) ||
            contentType.includes(
                "application/json"
            ) ||
            contentType.includes(
                "text/css"
            ) ||
            contentType.includes(
                "text/plain"
            );


        if (shouldRewrite) {

            let body =
                await response.text();


            body =
                rewriteURLs(
                    body,
                    siteKey,
                    targetBase
                );


            /*
             * Status
             */

            res.status(
                response.status
            );


            /*
             * Content-Type
             */

            res.set(
                "Content-Type",
                contentType
            );


            /*
             * Sicurezza iframe
             */

            cleanHeaders(res);


            /*
             * Evitiamo problemi di
             * Content-Length.
             */

            res.removeHeader(
                "content-length"
            );

            res.removeHeader(
                "content-encoding"
            );


            res.send(body);

            return;

        }


        /*
         * =================================================
         * FILE BINARI
         *
         * immagini
         * font
         * video
         * ecc.
         * ================================================= */

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


        cleanHeaders(res);


        res.send(buffer);

    } catch (error) {

        console.error(
            `[${siteKey}] PROXY ERROR:`,
            error
        );


        res
            .status(502)
            .json({

                error:
                    "Bad Gateway",

                message:
                    error.message,

                target:
                    targetURL

            });

    }

}


/* =========================================================
   ROUTES
========================================================= */

for (
    const siteKey of Object.keys(SITES)
) {

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
                "/" +
                siteKey +
                "/";


            let path =
                req.path.substring(
                    prefix.length - 1
                );


            if (
                !path.startsWith("/")
            ) {

                path =
                    "/" + path;

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


/* =========================================================
   START
========================================================= */

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `AniQuiz Proxy listening on ${PORT}`
        );

    }
);
