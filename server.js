require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");

const app = express();
app.use(express.json());

console.log("🔥 SERVER START");

// ROOT
app.get("/", (req, res) => {
    res.send("✅ SERVER HIDUP");
});

// DB
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("✅ MongoDB connected"))
.catch(err => console.log(err));

// VERIFY
app.get("/whatsapp", (req, res) => {
    const VERIFY_TOKEN = "rama123";

    if (
        req.query["hub.mode"] === "subscribe" &&
        req.query["hub.verify_token"] === VERIFY_TOKEN
    ) {
        console.log("✅ WEBHOOK VERIFIED");
        return res.status(200).send(req.query["hub.challenge"]);
    }

    res.sendStatus(403);
});

// TERIMA PESAN
app.post("/whatsapp", async (req, res) => {
    console.log("📥 BODY:", JSON.stringify(req.body));

    try {
        const value = req.body.entry?.[0]?.changes?.[0]?.value;

        if (!value?.messages) {
            return res.sendStatus(200);
        }

        const msg = value.messages[0].text.body;
        const from = value.messages[0].from;

        console.log("📩 PESAN:", msg);

        const response = await fetch(`https://graph.facebook.com/v19.0/${process.env.PHONE_NUMBERS_ID}/messages`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                messaging_product: "whatsapp",
                to: from,
                type: "text",
                text: { body: "Halo dari bot 🚀" }
            })
        });

        const data = await response.text();
        console.log("📤 RESPONSE WA:", data);

        res.sendStatus(200);

    } catch (err) {
        console.log("❌ ERROR:", err);
        res.sendStatus(200);
    }
});

// PORT
const PORT = process.env.PORT;

console.log("PORT DARI RAILWAY:", PORT);

app.listen(PORT, "0.0.0.0", () => {
    console.log("🚀 Server jalan di port " + PORT);
});