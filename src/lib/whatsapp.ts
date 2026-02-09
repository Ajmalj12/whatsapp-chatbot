export async function sendWhatsAppMessage(to: string, text: string) {
    const url = `https://graph.facebook.com/v22.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

    const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to,
        type: "text",
        text: { body: text }
    };

    console.log(`Sending WhatsApp message to ${to}: ${text}`);
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        const result = await response.json();
        console.log("WhatsApp API Response:", JSON.stringify(result, null, 2));
        if (!response.ok) {
            console.error("WhatsApp API Error:", result);
        }
        return result;
    } catch (error) {
        console.error("Failed to send WhatsApp message:", error);
        throw error;
    }
}

export async function sendWhatsAppButtons(to: string, text: string, buttons: string[]) {
    const url = `https://graph.facebook.com/v22.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    console.log(`Sending WhatsApp buttons to ${to}: ${text}`);

    // WhatsApp Cloud API interactive buttons format
    const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to,
        type: "interactive",
        interactive: {
            type: "button",
            body: { text: text },
            action: {
                buttons: buttons.slice(0, 3).map((btn, index) => ({
                    type: "reply",
                    reply: {
                        id: `btn_${index}`,
                        title: btn.substring(0, 20) // Max 20 chars for buttons
                    }
                }))
            }
        }
    };

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        const result = await response.json();
        console.log("WhatsApp Buttons API Response:", JSON.stringify(result, null, 2));
        if (!response.ok) {
            console.error("WhatsApp API Error (Buttons):", result);
        }
        return result;
    } catch (error) {
        console.error("Failed to send WhatsApp buttons:", error);
        throw error;
    }
}

export async function sendWhatsAppList(to: string, text: string, buttonText: string, sections: { title: string, rows: { id: string, title: string, description?: string }[] }[]) {
    const url = `https://graph.facebook.com/v22.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    console.log(`Sending WhatsApp list to ${to}: ${text}`);

    const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to,
        type: "interactive",
        interactive: {
            type: "list",
            body: { text: text },
            action: {
                button: buttonText,
                sections: sections
            }
        }
    };

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        const result = await response.json();
        console.log("WhatsApp List API Response:", JSON.stringify(result, null, 2));
        if (!response.ok) {
            console.error("WhatsApp API Error (List):", result);
        }
        return result;
    } catch (error) {
        console.error("Failed to send WhatsApp list:", error);
        throw error;
    }
}
