require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");

const app = express();
app.use(express.json());

console.log("🔥 SERVER START");

// ==========================
// DATABASE
// ==========================
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("✅ MongoDB connected"))
.catch(err => console.log("❌ DB ERROR:", err.message));

// ==========================
// SCHEMA
// ==========================
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
    status: { type: String, default: "pending" },
    waktu: { type: Date, default: Date.now }
}));

// ==========================
// MEMORY
// ==========================
const paymentChoice = {};

// ==========================
// MENU
// ==========================
const menu = {
    latte: 20000,
    cappuccino: 22000,
    americano: 18000
};

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
        return res.status(200).send(req.query["hub.challenge"]);
    }

    res.sendStatus(403);
});

// ==========================
// SEND WA
// ==========================
async function sendWA(to, text) {
    try {
        console.log("📤 KIRIM:", to, text);

        const res = await fetch(`https://graph.facebook.com/v19.0/${process.env.PHONE_NUMBERS_ID}/messages`, {
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

        const data = await res.json();
        console.log("✅ WA RESPONSE:", data);

    } catch (err) {
        console.log("❌ SEND ERROR:", err.message);
    }
}

// ==========================
// SEND QR
// ==========================
async function sendQR(to) {
    const qrImage = "https://i.ibb.co/YTB9hTTn/Whats-App-Image-2026-04-27-at-10-26-45.jpg";

    await fetch(`https://graph.facebook.com/v19.0/${process.env.PHONE_NUMBERS_ID}/messages`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            messaging_product: "whatsapp",
            to: to,
            type: "image",
            image: {
                link: qrImage,
                caption: "📱 Scan QR untuk bayar\n\nSetelah bayar ketik: sudah bayar"
            }
        })
    });
}

// ==========================
// WEBHOOK
// ==========================
app.post("/whatsapp", async (req, res) => {
    try {
        const value = req.body.entry?.[0]?.changes?.[0]?.value;
        if (!value?.messages) return res.sendStatus(200);

        const message = value.messages[0];
        const from = message.from;

        if (message.type !== "text") {
            await sendWA(from, "Kirim pesan teks ya 😊");
            return res.sendStatus(200);
        }

        const msg = message.text.body.toLowerCase();

        console.log("📩 PESAN:", msg);

        // ==========================
        // MENU (LEBIH RAMAH)
        // ==========================
        if (msg.includes("menu")) {

            const greetings = [
                "Halo! 👋 Selamat datang di cafe kami ☕",
                "Hai! 😊 Mau pesan kopi hari ini?",
                "Halo kak! ☕ Siap nemenin harimu dengan kopi terbaik"
            ];

            const greet = greetings[Math.floor(Math.random() * greetings.length)];

            await sendWA(from, `${greet}

📋 *Menu Hari Ini*:
☕ Latte — Rp20.000  
☕ Cappuccino — Rp22.000  
☕ Americano — Rp18.000  

Silakan langsung pesan ya 👍
Contoh: *latte 2*`);

            return res.sendStatus(200);
        }

        // ==========================
        // ORDER
        // ==========================
        if (
            msg.includes("latte") ||
            msg.includes("cappuccino") ||
            msg.includes("americano")
        ) {
            let total = 0;
            let detail = "";
            let itemsDB = [];

            for (let key in menu) {
                if (msg.includes(key)) {
                    const qtyMatch = msg.match(/\d+/);
                    const qty = qtyMatch ? parseInt(qtyMatch[0]) : 1;

                    const harga = menu[key];
                    const subtotal = harga * qty;

                    total += subtotal;
                    detail += `- ${key} x${qty} = Rp${subtotal}\n`;

                    itemsDB.push({ nama: key, qty, harga });
                }
            }

            if (total > 0) {
                const order = await Order.create({
                    user: from,
                    items: itemsDB,
                    total
                });

                paymentChoice[from] = order._id;

                await sendWA(from, `🧾 Pesanan kamu:
${detail}
💰 Total: Rp${total}

Silakan pilih metode pembayaran ya 😊

1. QRIS 📱
2. Transfer Bank 🏦

Ketik: 1 atau 2`);
            }

            return res.sendStatus(200);
        }

        // ==========================
        // PILIH PEMBAYARAN
        // ==========================
        if (msg === "1" || msg === "2") {
            const orderId = paymentChoice[from];

            if (!orderId) {
                await sendWA(from, "Ups, belum ada pesanan 😅\nKetik *menu* dulu ya ☕");
                return res.sendStatus(200);
            }

            if (msg === "1") {
                await sendQR(from);
            }

            if (msg === "2") {
                await sendWA(from, `🏦 Silakan transfer ke:

Bank BCA
No Rek: 1234567890
A/N: Cafe Kamu

Setelah transfer, ketik *sudah bayar* ya 😊`);
            }

            return res.sendStatus(200);
        }

        // ==========================
        // SUDAH BAYAR (RAMAH)
        // ==========================
        if (msg.includes("sudah bayar")) {
            await sendWA(from, `🙏 Terima kasih ya!

Pembayaran kamu sudah kami terima (akan dicek secara manual).

☕ Pesanan sedang kami proses, mohon ditunggu sebentar 😊`);
            return res.sendStatus(200);
        }

        // ==========================
        // DEFAULT
        // ==========================
        await sendWA(from, "Halo 😊\nKetik *menu* untuk lihat daftar kopi kami ya ☕");

        return res.sendStatus(200);

    } catch (err) {
        console.log("❌ ERROR:", err);
        res.sendStatus(200);
    }
});

// ==========================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("🚀 Server jalan di port", PORT);
});
