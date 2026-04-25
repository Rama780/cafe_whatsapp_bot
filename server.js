require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const OpenAI = require("openai");

const app = express();
app.use(express.json());

console.log("🔥 SERVER START");

// ==========================
// OPENAI
// ==========================
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// ==========================
// DATABASE
// ==========================
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("✅ MongoDB connected"))
.catch(err => console.log(err));

const Order = mongoose.model("Order", new mongoose.Schema({
    user: String,
    pesanan: String,
    total: Number,
    waktu: String
}));

// ==========================
// ROOT
// ==========================
app.get("/", (req, res) => {
    res.send("✅ SERVER HIDUP");
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
// TERIMA PESAN
// ==========================
app.post("/whatsapp", async (req, res) => {
    console.log("📥 BODY:", JSON.stringify(req.body));

    try {
        const value = req.body.entry?.[0]?.changes?.[0]?.value;

        if (!value?.messages) return res.sendStatus(200);

        const msg = value.messages[0].text.body.toLowerCase();
        const from = value.messages[0].from;

        console.log("📩 PESAN:", msg);

        // ==========================
        // AI PROCESS
        // ==========================
        let data;

        try {
            const ai = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: `
Kamu adalah kasir cafe.

Ubah pesan user jadi JSON:

{
  "intent": "order/menu/jam/lokasi/unknown",
  "items": [{"nama":"latte","qty":2}]
}

Aturan:
- hanya JSON
- tanpa penjelasan
- jika bukan order, items kosong
`
                    },
                    { role: "user", content: msg }
                ]
            });

            data = JSON.parse(ai.choices[0].message.content);

        } catch (err) {
            console.log("❌ AI ERROR:", err.message);
            data = { intent: "unknown", items: [] };
        }

        // ==========================
        // MENU DATA
        // ==========================
        const menu = {
            latte: 20000,
            cappuccino: 22000,
            americano: 18000
        };

        let reply = "Ketik: menu / pesan / jam / lokasi";

        // ==========================
        // LOGIC
        // ==========================

        // MENU
        if (data.intent === "menu") {
            reply = "☕ latte 20k\ncappuccino 22k\namericano 18k";
        }

        // ORDER
        else if (data.intent === "order") {
            let total = 0;
            let detail = "";

            for (let item of data.items) {
                if (!menu[item.nama]) continue;

                let subtotal = menu[item.nama] * item.qty;
                total += subtotal;

                detail += `- ${item.nama} x${item.qty} = Rp${subtotal}\n`;
            }

            if (total === 0) {
                reply = "Menu tidak ditemukan 😅";
            } else {
                reply = `🧾 Pesanan:\n${detail}\n💰 Total: Rp${total}`;

                // SIMPAN KE DB
                await Order.create({
                    user: from,
                    pesanan: detail,
                    total,
                    waktu: new Date().toLocaleString()
                });

                console.log("✅ Order tersimpan");
            }
        }

        // JAM
        else if (data.intent === "jam") {
            reply = "🕒 Jam buka: 08:00 - 22:00";
        }

        // LOKASI
        else if (data.intent === "lokasi") {
            reply = "📍 https://maps.google.com";
        }

        // ==========================
        // KIRIM KE WHATSAPP
        // ==========================
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
                text: { body: reply }
            })
        });

        const result = await response.text();
        console.log("📤 RESPONSE WA:", result);

        res.sendStatus(200);

    } catch (err) {
        console.log("❌ ERROR:", err);
        res.sendStatus(200);
    }
});

// ==========================
const PORT = process.env.PORT || 3000;

console.log("PORT:", PORT);

app.listen(PORT, "0.0.0.0", () => {
    console.log("🚀 Server jalan di port " + PORT);
});
