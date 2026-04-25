console.log("🔥 SERVER WHATSAPP FINAL AKTIF");
app.use((req, res, next) => {
    console.log("🔥 ADA REQUEST MASUK:", req.method, req.url);
    next();
});

require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const OpenAI = require("openai");

const app = express();
app.use(express.json()); // WAJIB

// 🔗 CONNECT DB
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("✅ MongoDB connected"))
.catch(err => console.log(err));

// 🤖 OPENAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// 📦 MODEL
const Order = mongoose.model("Order", new mongoose.Schema({
    user: String,
    pesanan: String,
    total: Number,
    waktu: String
}));

// ==========================
// ✅ VERIFY WEBHOOK
// ==========================
app.get("/whatsapp", (req, res) => {
    const VERIFY_TOKEN = "rama123";

    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
        console.log("✅ WEBHOOK VERIFIED");
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

// ==========================
// 🤖 AI PROCESS
// ==========================
async function aiProcess(message) {
    const response = await openai.chat.completions.create({
        model: "gpt-5.4-mini",
        messages: [
            {
                role: "system",
                content: `
Kamu adalah kasir cafe.
Balas JSON saja:
{
  "intent": "order/menu/jam/lokasi/unknown",
  "items": [{"nama":"kopi","qty":2}]
}
`
            },
            {
                role: "user",
                content: message
            }
        ]
    });

    return response.choices[0].message.content;
}

// ==========================
// 📩 TERIMA PESAN META
// ==========================
app.post("/whatsapp", async (req, res) => {

    console.log("📩 RAW:", JSON.stringify(req.body));

    let msg;
    let from;

    try {
        const data = req.body.entry[0].changes[0].value;

        if (!data.messages) return res.sendStatus(200);

        msg = data.messages[0].text.body;
        from = data.messages[0].from;

    } catch {
        return res.sendStatus(200);
    }

    console.log("📩 PESAN:", msg);

    // 🤖 AI
    let aiResult = await aiProcess(msg);

    let data;
    try {
        data = JSON.parse(aiResult);
    } catch {
        return res.sendStatus(200);
    }

    // 📋 MENU
    const menu = {
        kopi: 15000,
        latte: 20000,
        cappuccino: 22000
    };

    let reply = "Ketik: menu / pesan / riwayat / jam / lokasi";

    if (data.intent === "menu") {
        reply = "☕ kopi 15k\nlatte 20k\ncappuccino 22k";
    }

    else if (data.intent === "order") {
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
    // ❗ BALAS KE WHATSAPP META
    // ==========================
    await fetch(`https://graph.facebook.com/v19.0/${process.env.PHONE_NUMBER_ID}/messages`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${process.env.WHATSAPP_TOKEN}`,
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

app.listen(PORT, () => {
    console.log("🚀 Server jalan di port " + PORT);
});