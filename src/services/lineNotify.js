const line = require('@line/bot-sdk');

async function getLineClient() {
    let token = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
    let secret = process.env.LINE_CHANNEL_SECRET || '';

    try {
        const { db } = require('../../config/firebase-admin');
        if (db) {
            const shopDoc = await db.collection("settings").doc("shop").get();
            if (shopDoc.exists) {
                const data = shopDoc.data();
                if (data.lineToken) token = data.lineToken;
                if (data.lineSecret) secret = data.lineSecret;
            }
        }
    } catch (error) {
        console.error("[getLineClient] Error fetching from Firestore:", error);
    }

    return new line.messagingApi.MessagingApiClient({
        channelAccessToken: token
    });
}

// 1. ตอบกลับข้อความ
async function replyMessage(replyToken, text) {
    try {
        const client = await getLineClient();
        if (!client.config.channelAccessToken) {
            console.log("[Mock] Reply Message:", text);
            return;
        }
        await client.replyMessage({
            replyToken: replyToken,
            messages: [{ type: 'text', text: text }]
        });
    } catch (error) {
        console.error("Error replying message:", error.response?.data || error.message);
    }
}

// 2. ส่ง Push Message ด้วย Flex Message
async function pushFlexMessage(userId, altText, flexContents) {
    try {
        const client = await getLineClient();
        if (!client.config.channelAccessToken) {
            console.log("[Mock] Push Flex Message to", userId, ":", altText);
            return;
        }
        await client.pushMessage({
            to: userId,
            messages: [
                {
                    type: "flex",
                    altText: altText,
                    contents: flexContents
                }
            ]
        });
    } catch (error) {
        console.error("Error pushing flex message:", error.response?.data || error.message);
    }
}

// 3. Flex Message: การจองคิวสำเร็จ (ธีม ดำ/น้ำเงิน/ทอง)
function getBookingSuccessFlex(data) {
    return {
        type: "bubble",
        header: {
            type: "box",
            layout: "vertical",
            backgroundColor: "#0F172A",
            contents: [
                {
                    type: "text",
                    text: "✂️ WANG BARBER",
                    weight: "bold",
                    color: "#D4AF37",
                    size: "xl",
                    align: "center"
                },
                {
                    type: "text",
                    text: "จองคิวสำเร็จ",
                    weight: "bold",
                    color: "#FFFFFF",
                    size: "md",
                    align: "center",
                    margin: "sm"
                }
            ]
        },
        body: {
            type: "box",
            layout: "vertical",
            spacing: "md",
            backgroundColor: "#FFFFFF",
            contents: [
                {
                    type: "box",
                    layout: "horizontal",
                    contents: [
                        { type: "text", text: "ชื่อ:", color: "#64748B", size: "sm", flex: 3 },
                        { type: "text", text: data.customerName, color: "#0F172A", size: "sm", weight: "bold", flex: 7, wrap: true }
                    ]
                },
                {
                    type: "box",
                    layout: "horizontal",
                    contents: [
                        { type: "text", text: "บริการ:", color: "#64748B", size: "sm", flex: 3 },
                        { type: "text", text: data.service, color: "#0F172A", size: "sm", weight: "bold", flex: 7, wrap: true }
                    ]
                },
                {
                    type: "box",
                    layout: "horizontal",
                    contents: [
                        { type: "text", text: "ช่างตัดผม:", color: "#64748B", size: "sm", flex: 3 },
                        { type: "text", text: data.barber, color: "#0F172A", size: "sm", weight: "bold", flex: 7, wrap: true }
                    ]
                },
                {
                    type: "separator",
                    margin: "lg"
                },
                {
                    type: "box",
                    layout: "vertical",
                    margin: "lg",
                    spacing: "sm",
                    contents: [
                        { type: "text", text: "หมายเลขคิวของคุณ", color: "#64748B", size: "xs", align: "center" },
                        { type: "text", text: data.queueNumber, color: "#1D4ED8", size: "4xl", weight: "bold", align: "center" }
                    ]
                },
                {
                    type: "text",
                    text: "กรุณารอการเรียกคิวจากช่างตัดผม",
                    color: "#94A3B8",
                    size: "xs",
                    align: "center",
                    margin: "lg",
                    wrap: true
                }
            ]
        },
        footer: {
            type: "box",
            layout: "vertical",
            backgroundColor: "#0F172A",
            contents: [
                {
                    type: "text",
                    text: "ขอบคุณที่ใช้บริการ",
                    color: "#D4AF37",
                    size: "sm",
                    align: "center"
                }
            ]
        }
    };
}

// 4. Flex Message: เรียกคิว (ธีม แดง/ส้ม)
function getCallQueueFlex(data) {
    return {
        type: "bubble",
        header: {
            type: "box",
            layout: "vertical",
            backgroundColor: "#EF4444",
            contents: [
                {
                    type: "text",
                    text: "🚨 ถึงคิวของคุณแล้ว!",
                    weight: "bold",
                    color: "#FFFFFF",
                    size: "xl",
                    align: "center"
                }
            ]
        },
        body: {
            type: "box",
            layout: "vertical",
            spacing: "md",
            contents: [
                {
                    type: "text",
                    text: "หมายเลขคิว",
                    weight: "regular",
                    size: "md",
                    align: "center",
                    color: "#64748B"
                },
                {
                    type: "text",
                    text: data.queueNumber,
                    weight: "bold",
                    size: "5xl",
                    align: "center",
                    color: "#1F2937"
                },
                {
                    type: "separator",
                    margin: "lg"
                },
                {
                    type: "text",
                    text: `กรุณาเชิญที่ช่องบริการของช่าง ${data.barber}`,
                    wrap: true,
                    margin: "md",
                    align: "center",
                    color: "#4B5563",
                    weight: "bold",
                    size: "md"
                }
            ]
        }
    };
}

module.exports = {
    replyMessage,
    pushFlexMessage,
    getBookingSuccessFlex,
    getCallQueueFlex
};
