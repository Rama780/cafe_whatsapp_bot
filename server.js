require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");

const app = express();
app.use(express.json());

console.log("🔥 SERVER START");

// ==========================
// DB
// ==========================
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("✅ MongoDB connected"))
.catch(err => console.log("❌ DB ERROR:", err.message));

// ==========================
// SCHEMA
// ==========================
const Order = mongoose.model("Order", new mongoose.Schema({
    user: String,
    items: Array,
    total: Number,
    status: { type: String, default: "pending" },
    waktu: { type: Date, default: Date.now }
}));

// ==========================
// MEMORY
// ==========================
const lastOrderMap = {};

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
// WEBHOOK VERIFY
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
// WEBHOOK
// ==========================
app.post("/whatsapp", async (req, res) => {
    try {
        const value = req.body.entry?.[0]?.changes?.[0]?.value;
        if (!value?.messages) return res.sendStatus(200);

        const msg = value.messages[0].text.body.toLowerCase();
        const from = value.messages[0].from;

        console.log("📩", msg);

        let reply;

        // ==========================
        // MENU
        // ==========================
        if (msg.includes("menu")) {
            reply = "☕ latte 20k\ncappuccino 22k\namericano 18k";
        }

        // ==========================
        // ORDER
        // ==========================
        else if (
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

                const paymentLink = `https://your-payment-link.com/pay/${newOrder._id}`;

                reply = `🧾 Pesanan:\n${detail}\n💰 Total: Rp${total}

💳 Bayar:
${paymentLink}

Ketik: sudah bayar`;
            }
        }

        // ==========================
        // KONFIRMASI BAYAR
        // ==========================
        else if (msg.includes("sudah bayar")) {
            const orderId = lastOrderMap[from];

            if (!orderId) {
                reply = "Tidak ada transaksi 😅";
            } else {
                await Order.findByIdAndUpdate(orderId, { status: "paid" });
                reply = "✅ Pembayaran diterima!";
            }
        }

        // ==========================
        // DEFAULT
        // ==========================
        else {
            reply = "Ketik *menu* ya ☕";
        }

        // ==========================
        // SEND WA
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
                text: { body: reply }
            })
        });

        res.sendStatus(200);

    } catch (err) {
        console.log("❌ ERROR:", err);
        res.sendStatus(200);
    }
});

// ==========================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("🚀 Jalan di port", PORT);
});
