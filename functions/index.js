const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const crypto = require("crypto");
const axios = require("axios");
const express = require("express");
const cors = require("cors");

// ตั้งค่า Global ให้ Functions
setGlobalOptions({ maxInstances: 10, region: "us-central1" });

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();

// -------------------------------------------------------------
// 1. Webhook สำหรับ LINE (รับ Events จาก LINE เท่านั้น)
// -------------------------------------------------------------
exports.webhook = onRequest(async (req, res) => {
    // Webhook ของ LINE ใช้เมธอด POST เท่านั้น
    if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
    }

    try {
        // ดึง Secret จาก Firestore
        const shopDoc = await db.collection("settings").doc("shop").get();
        if (!shopDoc.exists) {
            console.error("Shop settings not found");
            res.status(500).send("Configuration Missing");
            return;
        }
        
        const lineSecret = shopDoc.data().lineSecret;
        if (!lineSecret) {
            console.error("LINE Channel Secret not configured");
            res.status(500).send("Secret Missing");
            return;
        }

        // อ่าน Signature จาก Header
        const signature = req.headers["x-line-signature"];
        if (!signature) {
            res.status(400).send("Bad Request: Missing Signature");
            return;
        }

        // ตรวจสอบ Signature (Validation) ด้วย HMAC-SHA256
        const bodyStr = JSON.stringify(req.body);
        const hash = crypto.createHmac("SHA256", lineSecret).update(bodyStr).digest("base64");
        
        if (hash !== signature) {
            console.warn("Signature validation failed! Unauthorized access.");
            res.status(401).send("Unauthorized: Invalid Signature");
            return;
        }

        // ผ่านการตรวจสอบ - ประมวลผล Webhook
        console.log("Webhook verified successfully! Events:", JSON.stringify(req.body.events));
        
        // ตัวอย่างการโต้ตอบ ถ้ามีข้อความเข้ามา (ดึง Token มาตอบกลับได้ที่นี่)
        // const lineToken = shopDoc.data().lineToken;
        
        res.status(200).send("OK");
    } catch (error) {
        console.error("Webhook Error:", error);
        res.status(500).send("Internal Server Error");
    }
});

// -------------------------------------------------------------
// 2. API Endpoint สำหรับจัดการคำสั่งต่างๆ (Test Connection, Notify)
// -------------------------------------------------------------
const apiApp = express();
apiApp.use(cors({ origin: true }));
apiApp.use(express.json());

// 2.1 ทดสอบ Token
apiApp.post('/testLineConnection', async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) {
            return res.status(400).json({ success: false, message: "Missing token" });
        }

        // ยิง API ไปที่ LINE เพื่อเช็ค Token
        const response = await axios.get("https://api.line.me/v2/bot/info", {
            headers: { "Authorization": `Bearer ${token}` }
        });

        if (response.status === 200) {
            return res.status(200).json({ success: true, message: "Connection OK", data: response.data });
        } else {
            return res.status(400).json({ success: false, message: "Invalid Token" });
        }
    } catch (error) {
        const errorMsg = error.response ? error.response.data.message : error.message;
        console.error("Test Connection Error:", errorMsg);
        return res.status(400).json({ success: false, message: errorMsg });
    }
});

// 2.2 ส่งแจ้งเตือนเมื่อเรียกคิว
apiApp.post('/notifyCall', async (req, res) => {
    try {
        const { queueNumber, lineUserId } = req.body;
        
        // ดึง Token จาก Firestore เสมอ เพื่อความปลอดภัย
        const shopDoc = await db.collection("settings").doc("shop").get();
        const lineToken = shopDoc.exists ? shopDoc.data().lineToken : null;

        if (!lineToken || !lineUserId) {
            console.log("[Mock LINE API] Notify Call:", { lineUserId, queueNumber });
            return res.status(200).json({ success: true, mock: true, message: "Mock Mode: No Token or UserId" });
        }

        const flexMessage = {
            type: "flex",
            altText: `🚨 ถึงคิวของท่านแล้ว! คิวหมายเลข ${queueNumber}`,
            contents: {
                type: "bubble",
                header: {
                    type: "box",
                    layout: "vertical",
                    backgroundColor: "#ef4444",
                    contents: [
                        { type: "text", text: "🚨 ถึงคิวของท่านแล้ว!", weight: "bold", color: "#ffffff", size: "xl", align: "center" }
                    ]
                },
                body: {
                    type: "box",
                    layout: "vertical",
                    spacing: "md",
                    contents: [
                        { type: "text", text: `หมายเลขคิว`, weight: "regular", size: "md", align: "center", color: "#666666" },
                        { type: "text", text: `${queueNumber}`, weight: "bold", size: "4xl", align: "center", color: "#1f2937" },
                        { type: "separator", margin: "lg" },
                        { type: "text", text: "กรุณาเข้าช่องบริการที่ช่างตัดผม", wrap: true, margin: "md", align: "center", color: "#4b5563" }
                    ]
                }
            }
        };

        await axios.post('https://api.line.me/v2/bot/message/push', {
            to: lineUserId,
            messages: [flexMessage]
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${lineToken}`
            }
        });

        return res.status(200).json({ success: true });
    } catch (error) {
        console.error("Notify Call Error:", error.response ? error.response.data : error.message);
        return res.status(500).json({ success: false, message: "Failed to send LINE notification" });
    }
});

exports.api = onRequest(apiApp);
