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
.catch(err => console.log("❌ DB ERROR:", err.message));

const Order = mongoose.model("Order", new mongoose.Schema({
    user: String,
    items: [
        {
            nama: String,
            qty: Number,
            harga: Number
        }
    ],
    total: Number,
    waktu: {
        type: Date,
        default: Date.now
    }
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
// MENU
// ==========================
const menu = {
    latte: 20000,
    cappuccino: 22000,
    americano: 18000
};

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
        // HISTORY MANUAL (ANTI GAGAL AI)
        // ==========================
        if (
            msg.includes("riwayat") ||
            msg.includes("history") ||
            msg.includes("pesanan saya")
        ) {
            const orders = await Order.find({ user: from })
                .sort({ waktu: -1 })
                .limit(5);

            let reply;

            if (orders.length === 0) {
                reply = "Kamu belum punya pesanan 😅";
            } else {
                reply = "🧾 Riwayat Pesanan Kamu:\n\n";

                orders.forEach((order, index) => {
                    reply += `Pesanan ${index + 1}:\n`;

                    order.items.forEach(item => {
                        reply += `- ${item.nama} x${item.qty}\n`;
                    });

                    reply += `💰 Total: Rp${order.total}\n`;
                    reply += `🕒 ${new Date(order.waktu).toLocaleString()}\n\n`;
                });
            }

            await sendWA(from, reply);
            return res.sendStatus(200);
        }

        // ==========================
        // AI DETEKSI
        // ==========================
        let data = { intent: "unknown", items: [] };

        try {
            const ai = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: `
Ubah pesan user jadi JSON:

{
 "intent":"order/menu/jam/lokasi/history/unknown",
 "items":[{"nama":"latte","qty":2}]
}

Rules:
- hanya JSON
`
                    },
                    { role: "user", content: msg }
                ]
            });

            data = JSON.parse(ai.choices[0].message.content);

        } catch (err) {
            console.log("❌ AI ERROR:", err.message);
        }

        let reply;

        // ==========================
        // LOGIC
        // ==========================
        if (data.intent === "menu") {
            reply = "☕ latte 20k\ncappuccino 22k\namericano 18k";
        }

        else if (data.intent === "order") {
            let total = 0;
            let detail = "";
            let itemsDB = [];

            for (let item of data.items) {
                const nama = item.nama?.toLowerCase().trim();

                if (!menu[nama]) continue;

                const harga = menu[nama];
                const subtotal = harga * item.qty;

                total += subtotal;

                detail += `- ${nama} x${item.qty} = Rp${subtotal}\n`;

                itemsDB.push({
                    nama,
                    qty: item.qty,
                    harga
                });
            }

            if (total > 0) {
                reply = `🧾 Pesanan:\n${detail}\n💰 Total: Rp${total}`;

                await Order.create({
                    user: from,
                    items: itemsDB,
                    total
                });

                reply += "\n\nMau tambah lagi atau checkout? 😄";

                console.log("✅ Order tersimpan");
            } else {
                reply = "Menu tidak ditemukan 😅";
            }
        }

        else if (data.intent === "jam") {
            reply = "🕒 Jam buka: 08:00 - 22:00";
        }

        else if (data.intent === "lokasi") {
            reply = "📍 https://maps.google.com";
        }

        // ==========================
        // AI CHAT
        // ==========================
        if (!reply) {
            try {
                const aiChat = await openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [
                        {
                            role: "system",
                            content: `
Kamu admin cafe.

Menu:
- latte (20k)
- cappuccino (22k)
- americano (18k)

Tugas:
- bantu user pesan
- upsell ringan
- jawab santai
`
                        },
                        { role: "user", content: msg }
                    ]
                });

                reply = aiChat.choices[0].message.content;

            } catch (err) {
                reply = "Maaf, sistem sibuk 😅";
            }
        }

        console.log("🤖 REPLY:", reply);

        // ==========================
        // KIRIM WA
        // ==========================
        await sendWA(from, reply);

        res.sendStatus(200);

    } catch (err) {
        console.log("❌ ERROR:", err);
        res.sendStatus(200);
    }
});

// ==========================
// FUNCTION KIRIM WA
// ==========================
async function sendWA(to, text) {
    await fetch(`https://graph.facebook.com/v19.0/${process.env.PHONE_NUMBERS_ID}/messages`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            messaging_product: "whatsapp",
            to,
            type: "text",
            text: { body: text }
        })
    });
}

// ==========================
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log("🚀 Server jalan di port " + PORT);
});