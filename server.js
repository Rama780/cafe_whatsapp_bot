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
// SEND WA TEXT
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
// SEND QR IMAGE
// ==========================
async function sendQR(to) {
    const qrImage = "https://i.ibb.co/your-qr-image.png"; // GANTI DENGAN QR KAMU

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

        const msg = value.messages[0].text.body.toLowerCase();
        const from = value.messages[0].from;

        console.log("📩 PESAN:", msg);

        // ==========================
        // 1. KONFIRMASI BAYAR
        // ==========================
        if (msg.includes("sudah bayar")) {
            const orderId = lastOrderMap[from];

            if (!orderId) {
                await sendWA(from, "Tidak ada transaksi 😅");
            } else {
                await Order.findByIdAndUpdate(orderId, { status: "paid" });
                await sendWA(from, "✅ Pembayaran diterima!");
            }

            return res.sendStatus(200);
        }

        // ==========================
        // 2. PILIH PEMBAYARAN
        // ==========================
        if (msg === "1" || msg === "2") {
            const orderId = paymentChoice[from];

            if (!orderId) {
                await sendWA(from, "Tidak ada pesanan 😅");
                return res.sendStatus(200);
            }

            // LINK
            if (msg === "1") {
                const link = `https://your-payment-link.com/pay/${orderId}`;
                await sendWA(from, `💳 Bayar di sini:\n${link}\n\nSetelah bayar ketik: sudah bayar`);
            }

            // QR
            if (msg === "2") {
                await sendQR(from);
            }

            return res.sendStatus(200);
        }

        // ==========================
        // 3. RIWAYAT
        // ==========================
        if (
            msg.includes("riwayat") ||
            msg.includes("history") ||
            msg.includes("pesanan")
        ) {
            const orders = await Order.find({ user: from })
                .sort({ waktu: -1 })
                .limit(5);

            let reply;

            if (orders.length === 0) {
                reply = "Belum ada pesanan 😅";
            } else {
                reply = "🧾 Riwayat:\n\n";

                orders.forEach((o, i) => {
                    reply += `Pesanan ${i + 1}\n`;

                    o.items.forEach(item => {
                        reply += `- ${item.nama} x${item.qty}\n`;
                    });

                    reply += `💰 Rp${o.total}\n`;
                    reply += `🕒 ${new Date(o.waktu).toLocaleString()}\n\n`;
                });
            }

            await sendWA(from, reply);
            return res.sendStatus(200);
        }

        // ==========================
        // 4. MENU
        // ==========================
        if (msg.includes("menu")) {
            await sendWA(from, "☕ latte 20k\ncappuccino 22k\namericano 18k");
            return res.sendStatus(200);
        }

        // ==========================
        // 5. ORDER
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

💳 Pilih pembayaran:
1. Link
2. QR

Ketik: 1 atau 2`;

                await sendWA(from, reply);
            }

            return res.sendStatus(200);
        }

        // ==========================
        // DEFAULT
        // ==========================
        await sendWA(from, "Ketik *menu* ya ☕");
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