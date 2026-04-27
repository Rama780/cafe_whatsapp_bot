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
    status: {
        type: String,
        default: "pending"
    },
    waktu: {
        type: Date,
        default: Date.now
    }
}));

const Customer = mongoose.model("Customer", new mongoose.Schema({
    user: String,
    totalOrder: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    lastOrder: { type: Date, default: Date.now }
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
// HELPER
// ==========================
function getCustomerLevel(customer) {
    if (!customer) return "new";
    if (customer.totalOrder >= 5 || customer.totalSpent >= 100000) return "loyal";
    if (customer.totalOrder >= 2) return "regular";
    return "new";
}

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
// WEBHOOK
// ==========================
app.post("/whatsapp", async (req, res) => {
    try {
        const value = req.body.entry?.[0]?.changes?.[0]?.value;
        if (!value?.messages) return res.sendStatus(200);

        const msg = value.messages[0].text.body.toLowerCase();
        const from = value.messages[0].from;

        console.log("📩", from, ":", msg);

        // ==========================
        // CEK CUSTOMER
        // ==========================
        let customer = await Customer.findOne({ user: from });
        const level = getCustomerLevel(customer);

        // ==========================
        // KONFIRMASI BAYAR
        // ==========================
        if (msg.includes("sudah bayar")) {
            const orderId = lastOrderMap[from];

            if (!orderId) {
                await sendWA(from, "Tidak ada transaksi 😅");
                return res.sendStatus(200);
            }

            await Order.findByIdAndUpdate(orderId, { status: "paid" });

            await sendWA(from, "✅ Pembayaran diterima! Pesanan diproses ☕");
            return res.sendStatus(200);
        }

        // ==========================
        // RIWAYAT
        // ==========================
        if (msg.includes("riwayat")) {
            const orders = await Order.find({ user: from })
                .sort({ waktu: -1 })
                .limit(5);

            if (orders.length === 0) {
                await sendWA(from, "Belum ada pesanan 😅");
                return res.sendStatus(200);
            }

            let reply = "🧾 Riwayat:\n\n";

            orders.forEach((o, i) => {
                reply += `Pesanan ${i + 1}\n`;

                o.items.forEach(item => {
                    reply += `- ${item.nama} x${item.qty}\n`;
                });

                reply += `💰 Rp${o.total}\n`;
                reply += `🕒 ${new Date(o.waktu).toLocaleString()}\n\n`;
            });

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
Ubah ke JSON:
{ "intent":"order/menu/jam/lokasi", "items":[{"nama":"latte","qty":2}] }
`
                    },
                    { role: "user", content: msg }
                ]
            });

            data = JSON.parse(ai.choices[0].message.content);

        } catch (err) {
            console.log("AI ERROR");
        }

        let reply;

        // ==========================
        // MENU
        // ==========================
        if (data.intent === "menu") {
            reply = "☕ latte 20k\ncappuccino 22k\namericano 18k";
        }

        // ==========================
        // ORDER
        // ==========================
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

                itemsDB.push({ nama, qty: item.qty, harga });
            }

            if (total > 0) {
                const newOrder = await Order.create({
                    user: from,
                    items: itemsDB,
                    total
                });

                lastOrderMap[from] = newOrder._id;

                // update customer
                if (!customer) {
                    customer = await Customer.create({
                        user: from,
                        totalOrder: 1,
                        totalSpent: total
                    });
                } else {
                    customer.totalOrder += 1;
                    customer.totalSpent += total;
                    customer.lastOrder = new Date();
                    await customer.save();
                }

                // payment link (dummy)
                const paymentLink = `https://your-payment-link.com/pay/${newOrder._id}`;

                // personalisasi
                if (level === "loyal") {
                    reply = `👑 Pelanggan setia!\n\n`;
                } else if (level === "regular") {
                    reply = `😊 Terima kasih kembali!\n\n`;
                } else {
                    reply = "";
                }

                reply += `🧾 Pesanan:\n${detail}\n💰 Total: Rp${total}

💳 Bayar di sini:
${paymentLink}

Setelah bayar ketik: *sudah bayar*`;

            } else {
                reply = "Menu tidak ditemukan 😅";
            }
        }

        // ==========================
        // JAM & LOKASI
        // ==========================
        else if (data.intent === "jam") {
            reply = "🕒 08:00 - 22:00";
        }

        else if (data.intent === "lokasi") {
            reply = "📍 https://maps.google.com";
        }

        // ==========================
        // FALLBACK AI
        // ==========================
        if (!reply) {
            reply = "Ketik *menu* untuk lihat menu ☕";
        }

        await sendWA(from, reply);
        res.sendStatus(200);

    } catch (err) {
        console.log("❌ ERROR:", err);
        res.sendStatus(200);
    }
});

// ==========================
// SEND WA
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