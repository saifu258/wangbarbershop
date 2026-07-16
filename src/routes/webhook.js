const express = require('express');
const crypto = require('crypto');
const { db } = require('../../config/firebase-admin');
const { replyMessage } = require('../services/lineNotify');

const router = express.Router();

router.post('/', async (req, res) => {
    try {
        const events = req.body.events;
        if (!events || events.length === 0) {
            console.log("Received empty events (Dummy Verification).");
            return res.status(200).send("OK");
        }

        const isDummyEvent = events.some(event => 
            event.replyToken === "00000000000000000000000000000000" || 
            event.replyToken === "ffffffffffffffffffffffffffffffff"
        );

        if (isDummyEvent) {
            console.log("Received dummy event with dummy replyToken (LINE Verification).");
            return res.status(200).send("OK");
        }

        if (!db) {
            console.error("Database not initialized");
            return res.status(500).end();
        }

        let lineSecret = process.env.LINE_CHANNEL_SECRET;
        if (!lineSecret) {
            const shopDoc = await db.collection("settings").doc("shop").get();
            if (shopDoc.exists) {
                lineSecret = shopDoc.data().lineSecret;
            }
        }

        if (!lineSecret) {
            console.error("LINE Channel Secret Missing");
            return res.status(500).end();
        }

        // Validate Signature
        const signature = req.headers["x-line-signature"];
        if (!signature) {
            console.warn("Bad Request: Missing Signature");
            return res.status(400).end();
        }

        const bodyStr = JSON.stringify(req.body);
        const hash = crypto.createHmac("SHA256", lineSecret).update(bodyStr).digest("base64");
        
        if (hash !== signature) {
            console.warn("Signature validation failed! Unauthorized access.");
            return res.status(401).end();
        }

        console.log("Webhook verified successfully! Processing events...");
        
        // ตอบกลับ LINE ทันที (เพื่อให้ LINE ไม่ timeout)
        res.status(200).send("OK");

        // Process Events Asynchronously
        for (const event of events) {
            if (event.type === 'message' && event.message.type === 'text') {
                const userId = event.source.userId;
                const text = event.message.text.trim().toUpperCase(); // e.g. "A012"
                
                // ค้นหาคิวที่เป็น Pending
                const bookingsRef = db.collection('bookings');
                const snapshot = await bookingsRef
                    .where('status', '==', 'pending')
                    .where('queueId', '==', text)
                    .get();

                if (!snapshot.empty) {
                    const doc = snapshot.docs[0];
                    const bookingData = doc.data();
                    
                    // อัปเดต lineUserId ใน Bookings
                    await doc.ref.update({
                        lineUserId: userId
                    });

                    // ผูกบัญชีและจำลูกค้าใน Customers (ใช้เบอร์โทรเป็น Document ID)
                    if (bookingData.phone) {
                        await db.collection('customers').doc(bookingData.phone).set({
                            phone: bookingData.phone,
                            lineUserId: userId,
                            updatedAt: new Date()
                        }, { merge: true });
                    }

                    await replyMessage(event.replyToken, `ผูกบัญชีสำเร็จ! คิวหมายเลข ${text} จะได้รับการแจ้งเตือนผ่าน LINE ทันทีที่ใกล้ถึงคิวครับ ✂️`);
                } else {
                    await replyMessage(event.replyToken, `ขออภัยครับ ไม่พบคิวหมายเลข ${text} ที่กำลังรอรับบริการ หรือรูปแบบหมายเลขไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง`);
                }
            }
        }

    } catch (error) {
        console.error("Webhook Error:", error);
        if (!res.headersSent) {
            res.status(500).end();
        }
    }
});

module.exports = router;
