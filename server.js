async function sendWA(to, text) {
    try {
        console.log("📤 KIRIM KE:", to);

        const response = await fetch(`https://graph.facebook.com/v19.0/${process.env.PHONE_NUMBERS_ID}/messages`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                messaging_product: "whatsapp",
                to: to,
                type: "text",
                text: { body: text }
            })
        });

        const data = await response.json();

        console.log("✅ WA RESPONSE:", JSON.stringify(data));

        if (data.error) {
            console.log("❌ WA API ERROR:", data.error.message);
        }

    } catch (err) {
        console.log("❌ SEND ERROR:", err.message);
    }
}
