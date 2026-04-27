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
    status: { type: String, default: "pending" }, // pending, waiting_confirmation, paid, rejected
    waktu: { type: Date, default: Date.now }
}));

// ==========================
// MEMORY
// ==========================
const lastOrderMap = {};
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
// SEND TEXT
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
            text: { body: text }
        })
    });
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

        console.log("📩 INCOMING:", message.type);

        // ==========================
        // OWNER COMMAND (ACC / TOLAK)
        // ==========================
        if (from === process.env.OWNER_NUMBER && message.type === "text") {
            const msg = message.text.body.toLowerCase();

            if (msg.startsWith("acc")) {
                const orderId = msg.split(" ")[1];

                const order = await Order.findById(orderId);
                if (!order) {
                    await sendWA(from, "Order tidak ditemukan");
                    return res.sendStatus(200);
                }

                await Order.findByIdAndUpdate(orderId, { status: "paid" });

                await sendWA(order.user, "✅ Pembayaran diterima, pesanan diproses ☕");
                await sendWA(from, "✅ Order di-ACC");

                return res.sendStatus(200);
            }

            if (msg.startsWith("tolak")) {
                const orderId = msg.split(" ")[1];

                const order = await Order.findById(orderId);
                if (!order) {
                    await sendWA(from, "Order tidak ditemukan");
                    return res.sendStatus(200);
                }

                await Order.findByIdAndUpdate(orderId, { status: "rejected" });

                await sendWA(order.user, "❌ Pembayaran ditolak");
                await sendWA(from, "❌ Order ditolak");

                return res.sendStatus(200);
            }
        }

        // ==========================
        // HANDLE IMAGE (BUKTI TRANSFER)
        // ==========================
        if (message.type === "image") {
            const orderId = lastOrderMap[from];

            if (!orderId) {
                await sendWA(from, "Tidak ada transaksi 😅");
                return res.sendStatus(200);
            }

            await Order.findByIdAndUpdate(orderId, {
                status: "waiting_confirmation"
            });

            await sendWA(from, "⏳ Bukti diterima, sedang dicek admin");

            const imageId = message.image.id;

            const resImg = await fetch(`https://graph.facebook.com/v19.0/${imageId}`, {
                headers: {
                    Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`
                }
            });

            const imgData = await resImg.json();

            await fetch(`https://graph.facebook.com/v19.0/${process.env.PHONE_NUMBERS_ID}/messages`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    messaging_product: "whatsapp",
                    to: process.env.OWNER_NUMBER,
                    type: "image",
                    image: {
                        link: imgData.url,
                        caption: `📥 Bukti transfer

User: ${from}
Order: ${orderId}

Ketik:
ACC ${orderId}
atau
TOLAK ${orderId}`
                    }
                })
            });

            return res.sendStatus(200);
        }

        // ==========================
        // TEXT MESSAGE
        // ==========================
        if (message.type === "text") {
            const msg = message.text.body.toLowerCase();

            console.log("📩 PESAN:", msg);

            // ==========================
            // PILIH PEMBAYARAN
            // ==========================
            if (msg === "1" || msg === "2") {
                const orderId = paymentChoice[from];

                if (!orderId) {
                    await sendWA(from, "Tidak ada pesanan 😅");
                    return res.sendStatus(200);
                }

                // QRIS
                if (msg === "1") {
                    await sendQR(from);
                }

                // TRANSFER
                if (msg === "2") {
                    await sendWA(from, `🏦 Transfer ke:

Bank BCA
No Rek: 1234567890
A/N: Cafe Kamu

Setelah transfer, kirim bukti screenshot di sini 📸`);
                }

                return res.sendStatus(200);
            }

            // ==========================
            // RIWAYAT
            // ==========================
            if (msg.includes("riwayat")) {
                const orders = await Order.find({ user: from })
                    .sort({ waktu: -1 })
                    .limit(5);

                let reply = orders.length
                    ? "🧾 Riwayat:\n\n"
                    : "Belum ada pesanan 😅";

                orders.forEach((o, i) => {
                    reply += `Pesanan ${i + 1}\n`;
                    o.items.forEach(item => {
                        reply += `- ${item.nama} x${item.qty}\n`;
                    });
                    reply += `💰 Rp${o.total}\n\n`;
                });

                await sendWA(from, reply);
                return res.sendStatus(200);
            }

            // ==========================
            // MENU
            // ==========================
            if (msg.includes("menu")) {
                await sendWA(from, "☕ latte 20k\ncappuccino 22k\namericano 18k");
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
                    const newOrder = await Order.create({
                        user: from,
                        items: itemsDB,
                        total
                    });

                    lastOrderMap[from] = newOrder._id;
                    paymentChoice[from] = newOrder._id;

                    const reply = `🧾 Pesanan:
${detail}
💰 Total: Rp${total}

💳 Metode pembayaran:
1. QRIS
2. Transfer Bank

Ketik: 1 atau 2`;

                    await sendWA(from, reply);
                }

                return res.sendStatus(200);
            }

            // DEFAULT
            await sendWA(from, "Ketik *menu* ya ☕");
            return res.sendStatus(200);
        }

        res.sendStatus(200);

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
