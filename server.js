import express from "express";

const app = express();

const PORT = process.env.PORT || 10000;

app.get("/health", (req, res) => {
    res.json({
        ok: true
    });
});

app.get("/jujutsu-test", async (req, res) => {

    try {

        const response = await fetch(
            "https://jujutsudle.com/",
            {
                method: "GET",
                headers: {
                    "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0.0.0 Safari/537.36",
                    "Accept":
                        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                    "Accept-Language":
                        "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7"
                }
            }
        );

        const body = await response.text();

        res.status(response.status);

        res.set(
            "Content-Type",
            "text/plain; charset=utf-8"
        );

        res.send(
            `STATUS: ${response.status}\n\n` +
            `HEADERS:\n${JSON.stringify(
                Object.fromEntries(
                    response.headers.entries()
                ),
                null,
                2
            )}\n\n` +
            `BODY:\n${body.substring(0, 5000)}`
        );

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: error.message,
            stack: error.stack
        });
    }
});

app.listen(
    PORT,
    "0.0.0.0",
    () => {
        console.log(
            `Server running on port ${PORT}`
        );
    }
);
