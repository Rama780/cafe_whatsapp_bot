console.log("🔥 SERVER WHATSAPP FINAL AKTIF");

process.on("uncaughtException", (err) => {
    console.log("❌ ERROR:", err);
});

process.on("unhandledRejection", (err) => {
    console.log("❌ PROMISE ERROR:", err);
});

require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const OpenAI = require("openai");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
    res.send("Server hidup");
});

// ==========================
// CONNECT DB
// ==========================
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("✅ MongoDB connected"))
.catch(err => console.log(err));

// ==========================
// OPENAI
// ==========================
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// ==========================
// MODEL
// ==========================
const Order = mongoose.model("Order", new mongoose.Schema({
    user: String,
    pesanan: String,
    total: Number,
    waktu: String
}));

// ==========================
// TEST ROUTE (BIAR GAK "CANNOT GET")
// ==========================
app.get("/", (req, res) => {
    res.send("✅ Server hidup");
});

// ==========================
// VERIFY WEBHOOK
// ==========================
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

// ==========================
// AI
// ==========================
async function aiProcess(message) {
    const response = await openai.chat.completions.create({
        model: "gpt-5.4-mini",
        messages: [
            {
                role: "system",
                content: `
Balas JSON:
{
  "intent": "order/menu/jam/lokasi/unknown",
  "items": [{"nama":"kopi","qty":2}]
}
`
            },
            { role: "user", content: message }
        ]
    });

    return response.choices[0].message.content;
}

// ==========================
// TERIMA PESAN
// ==========================
app.post("/whatsapp", async (req, res) => {

    console.log("📩 MASUK:", JSON.stringify(req.body));

    let msg, from;

    try {
        const value = req.body.entry?.[0]?.changes?.[0]?.value;

        if (!value?.messages) return res.sendStatus(200);

        msg = value.messages[0].text.body;
        from = value.messages[0].from;

    } catch {
        return res.sendStatus(200);
    }

    console.log("📩 PESAN:", msg);

    let reply = "Ketik: menu / pesan";

    let aiResult;
    try {
        aiResult = await aiProcess(msg);
    } catch (e) {
        console.log("❌ AI ERROR:", e);
        return res.sendStatus(200);
    }

    let data;
    try {
        data = JSON.parse(aiResult);
    } catch {
        return res.sendStatus(200);
    }

    const menu = {
        kopi: 15000,
        latte: 20000,
        cappuccino: 22000
    };

    if (data.intent === "menu") {
        reply = "☕ kopi 15k\nlatte 20k\ncappuccino 22k";
    }

    if (data.intent === "order") {
        let total = 0;
        let detail = "";

        for (let item of data.items) {
            if (!menu[item.nama]) continue;

            let subtotal = menu[item.nama] * item.qty;
            total += subtotal;
            detail += `- ${item.nama} x${item.qty} = Rp${subtotal}\n`;
        }

        reply = `🧾 Pesanan:\n${detail}\n💰 Rp${total}`;

        await Order.create({
            user: from,
            pesanan: detail,
            total,
            waktu: new Date().toLocaleString()
        });
    }

    // ==========================
    // KIRIM KE WHATSAPP
    // ==========================
    await fetch(`https://graph.facebook.com/v19.0/${process.env.PHONE_NUMBERS_ID}/messages`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            messaging_product: "whatsapp",
            to: from,
            type: "text",
            text: { body: reply }
        })
    });

    res.sendStatus(200);
});

// ==========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
    console.log("🚀 Server jalan di port " + PORT);
});