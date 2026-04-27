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
const userState = {};

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
// VERIFY
// ==========================
app.get("/whatsapp", (req, res) => {
    if (
        req.query["hub.mode"] === "subscribe" &&
        req.query["hub.verify_token"] === "rama123"
    ) {
        return res.send(req.query["hub.challenge"]);
    }
    res.sendStatus(403);
});

// ==========================
// SEND WA
// ==========================
async function sendWA(to, text) {
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

    console.log(await res.json());
}

// ==========================
// SEND QR
// ==========================
async function sendQR(to) {
    await fetch(`https://graph.facebook.com/v19.0/${process.env.PHONE_NUMBERS_ID}/messages`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            messaging_product: "whatsapp",
            to,
            type: "image",
            image: {
                link: "https://i.ibb.co/zWZVGbxy/Whats-App-Image-2026-04-27-at-10-26-45.jpg",
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
        const msgData = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        if (!msgData) return res.sendStatus(200);

        const from = msgData.from;
        const msg = msgData.text?.body?.toLowerCase();

        console.log("📩", msg);

        if (!msg) return res.sendStatus(200);

        // ==========================
        // MENU
        // ==========================
        if (msg.includes("menu")) {

            userState[from] = "MENU";

            await sendWA(from, `Halo! 👋

📋 Menu:
☕ Latte — Rp20.000  
☕ Cappuccino — Rp22.000  
☕ Americano — Rp18.000  

Contoh pesan:
latte 2`);

            return res.sendStatus(200);
        }

        // ==========================
        // ORDER
        // ==========================
        if (msg.match(/latte|cappuccino|americano/)) {

            let total = 0;
            let detail = "";
            let items = [];

            for (let key in menu) {
                if (msg.includes(key)) {
                    const qty = parseInt(msg.match(/\d+/)) || 1;
                    const subtotal = menu[key] * qty;

                    total += subtotal;
                    detail += `- ${key} x${qty} = Rp${subtotal}\n`;

                    items.push({ nama: key, qty, harga: menu[key] });
                }
            }

            if (total > 0) {
                const order = await Order.create({
                    user: from,
                    items,
                    total
                });

                paymentChoice[from] = order._id;
                userState[from] = "WAITING_PAYMENT";

                await sendWA(from, `🧾 Pesanan:
${detail}
💰 Total: Rp${total}

Pilih pembayaran:
1. QRIS
2. Transfer

Ketik 1 atau 2`);
            }

            return res.sendStatus(200);
        }

        // ==========================
        // PILIH PEMBAYARAN (FIX)
        // ==========================
        if (msg === "1" || msg === "2") {

            // ✅ FIX: boleh kalau masih di flow
            if (
                userState[from] !== "WAITING_PAYMENT" &&
                userState[from] !== "WAITING_CONFIRM"
            ) {
                await sendWA(from, "Pesan dulu ya 😊 ketik *menu*");
                return res.sendStatus(200);
            }

            if (msg === "1") {
                await sendWA(from, "Metode: QRIS dipilih 👍");
                await sendQR(from);
            }

            if (msg === "2") {
                await sendWA(from, `Metode: Transfer 👍

Bank BCA
1234567890

Ketik *sudah bayar* setelah transfer`);
            }

            // ✅ FIX: jangan overwrite terus
            if (userState[from] === "WAITING_PAYMENT") {
                userState[from] = "WAITING_CONFIRM";
            }

            return res.sendStatus(200);
        }

        // ==========================
        // SUDAH BAYAR
        // ==========================
        if (msg.includes("sudah bayar")) {

            if (userState[from] !== "WAITING_CONFIRM") {
                await sendWA(from, "Kamu belum masuk tahap pembayaran 😊");
                return res.sendStatus(200);
            }

            await sendWA(from, `🙏 Terima kasih!

Pembayaran sedang kami cek.

☕ Pesanan segera diproses ya 😊`);

            userState[from] = "DONE";

            return res.sendStatus(200);
        }

        // ==========================
        // DEFAULT
        // ==========================
        await sendWA(from, "Halo 😊 ketik *menu* untuk mulai");

        return res.sendStatus(200);

    } catch (err) {
        console.log("❌ ERROR:", err);
        res.sendStatus(200);
    }
});

// ==========================
app.listen(process.env.PORT || 3000, () => {
    console.log("🚀 RUNNING");
});