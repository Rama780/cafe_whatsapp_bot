console.log("🔥 SERVER WHATSAPP FINAL AKTIF");

require("dotenv").config({ path: "./.env" });
const mongoose = require("mongoose");
const OpenAI = require("openai");

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});
mongoose.connect("mongodb+srv://puturamawan_db_user:YPwFqS27D8eq3eLr@cluster0.cv50ybl.mongodb.net/cafe?appName=Cluster0")
.then(() => console.log("✅ MongoDB connected"))
.catch(err => console.log(err));

const orderSchema = new mongoose.Schema({
    user: String,
    pesanan: String,
    total: Number,
    waktu: String
});

const Order = mongoose.model("Order", orderSchema);

let processedMessages = new Set();

const express = require("express");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));


// 👇 TEMPATKAN DI SINI
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

// 👇 ini endpoint POST kamu
app.post("/whatsapp", async (req, res) => {
});

app.listen(3000, () => {
    console.log("🚀 Server jalan di http://localhost:3000");
});


app.use(express.json()); // penting untuk Meta

// VERIFY WEBHOOK

app.get("/webhook", (req, res) => {

    const VERIFY_TOKEN = "rama123";

    const mode = req.query["hub.mode"];

    const token = req.query["hub.verify_token"];

    const challenge = req.query["hub.challenge"];

    if (mode && token === VERIFY_TOKEN) {

        console.log("✅ Webhook verified!");

        res.status(200).send(challenge);

    } else {

        res.sendStatus(403);

    }

});

// TERIMA PESAN

app.post("/webhook", (req, res) => {

    console.log("📩 Pesan masuk:", JSON.stringify(req.body, null, 2));

    res.sendStatus(200);

}); 

async function aiProcess(message) {
    const response = await openai.chat.completions.create({
        model: "gpt-5.4-mini",
        messages: [
            {
                role: "system",
                content: `
Kamu adalah kasir cafe.

Tugas:
Ubah pesan user jadi JSON dengan format:

{
  "intent": "order/menu/jam/lokasi/unknown",
  "items": [
    {"nama":"kopi","qty":2}
  ]
}

Aturan:
- hanya balas JSON
- tanpa penjelasan
- jika bukan order, items kosong
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

app.post("/whatsapp", async (req, res) => {

    const messageId = req.body.MessageSid;

if (processedMessages.has(messageId)) {
    console.log("⚠️ DUPLICATE MESSAGE, DIABAIKAN");
    return res.send("<Response></Response>");
}

processedMessages.add(messageId);

    console.log("📩 RAW BODY:", req.body);

    let msg = (req.body.Body || "").toString();
    msg = msg.toLowerCase().replace(/\s+/g, " ").trim();

    console.log("📩 ISI MSG:", msg);

    let reply = "";

    let aiResult = await aiProcess(msg);
console.log("🤖 AI RAW:", aiResult);

let aidata;

try {
    data = JSON.parse(aiResult);
} catch {
    reply = "Maaf, aku belum paham 😅";
}

  // 🧾 Data menu
const menu = {
    kopi: 15000,
    latte: 20000,
    cappuccino: 22000
};

// 🤖 AI RESULT
let data;

try {
    data = JSON.parse(aiResult);
} catch {
    reply = "Maaf, aku belum paham 😅";
}

// 📋 MENU
if (data.intent === "menu") {
    reply = "☕ kopi 15k\nlatte 20k\ncappuccino 22k";
}

// 🛒 ORDER
else if (data.intent === "order") {
    let total = 0;
    let detail = "";

    for (let item of data.items) {
        if (!menu[item.nama]) continue;

        let subtotal = menu[item.nama] * item.qty;
        total += subtotal;

        detail += `- ${item.nama} x${item.qty} = Rp${subtotal}\n`;
    }

    reply = `🧾 Pesanan kamu:\n${detail}\n💰 Total: Rp${total}`;

    // ✅ simpan SEKALI saja
    await Order.create({
        user: req.body.From,
        pesanan: detail,
        total: total,
        waktu: new Date().toLocaleString()
    });

    console.log("✅ Data tersimpan ke MongoDB");
}

// 📋 RIWAYAT
else if (data.intent === "riwayat") {

    const orders = await Order.find()
        .find({ user: req.body.From })
        .sort({ _id: -1 })
        .limit(5);

    if (orders.length === 0) {
        reply = "Belum ada pesanan";
    } else {
        let history = orders.map((o, i) => 
            `${i+1}. ${o.pesanan}💰 Rp${o.total}`
        ).join("\n\n");

        reply = `📋 Riwayat Pesanan Kamu:\n\n${history}`;
    }
}

// 🕒 JAM
else if (data.intent === "jam") {
    reply = "🕒 Jam buka: 08:00 - 22:00";
}

// 📍 LOKASI
else if (data.intent === "lokasi") {
    reply = "📍 https://maps.google.com";
}

// 🤖 DEFAULT
else {
    reply = "Ketik: menu / pesan / riwayat / jam / lokasi";
}

    // 🤖 DEFAULT

    console.log("📤 BALASAN:", reply);

    res.set("Content-Type", "text/xml");
    res.send(`<Response><Message>${reply}</Message></Response>`);
});

app.listen(3000, () => {
    console.log("🚀 Server jalan di http://localhost:3000");
});