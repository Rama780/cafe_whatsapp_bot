app.post("/whatsapp", async (req, res) => {
    try {
        const value = req.body.entry?.[0]?.changes?.[0]?.value;
        if (!value?.messages) return res.sendStatus(200);

        const msg = value.messages[0].text.body.toLowerCase();
        const from = value.messages[0].from;

        console.log("📩", from, ":", msg);

        let customer = await Customer.findOne({ user: from });
        const level = getCustomerLevel(customer);

        let reply;

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

            let text = "🧾 Riwayat:\n\n";

            orders.forEach((o, i) => {
                text += `Pesanan ${i + 1}\n`;
                o.items.forEach(item => {
                    text += `- ${item.nama} x${item.qty}\n`;
                });
                text += `💰 Rp${o.total}\n`;
                text += `🕒 ${new Date(o.waktu).toLocaleString()}\n\n`;
            });

            await sendWA(from, text);
            return res.sendStatus(200);
        }

        // ==========================
        // MENU (MANUAL)
        // ==========================
        if (msg.includes("menu")) {
            reply = "☕ latte 20k\ncappuccino 22k\namericano 18k";
        }

        // ==========================
        // ORDER (MANUAL - ANTI AI ERROR)
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
            }
        }

        // ==========================
        // FALLBACK AI (OPSIONAL)
        // ==========================
        if (!reply) {
            try {
                const ai = await openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [
                        {
                            role: "system",
                            content: `
Kamu admin cafe.
Jawab santai & bantu user.
Jangan keluar dari menu.
`
                        },
                        { role: "user", content: msg }
                    ]
                });

                reply = ai.choices[0].message.content;

            } catch (err) {
                reply = "Maaf, aku belum paham 😅\nKetik *menu* ya ☕";
            }
        }

        await sendWA(from, reply);
        res.sendStatus(200);

    } catch (err) {
        console.log("❌ ERROR:", err);
        res.sendStatus(200);
    }
});