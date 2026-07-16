const express = require('express');
const { FieldValue } = require('firebase-admin/firestore');
const { db } = require('../../config/firebase-admin');
const { pushFlexMessage, getBookingSuccessFlex, getCallQueueFlex } = require('../services/lineNotify');

const router = express.Router();

// 1. สร้างคิวใหม่
router.post('/bookings', async (req, res) => {
    try {
        const { firstName, lastName, phone, serviceName, servicePrice, barberId, barber } = req.body;
        
        if (!firstName || !phone || !serviceName || !barberId) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        if (!db) {
            return res.status(500).json({ success: false, message: 'Database not initialized' });
        }

        // ใช้ Transaction ในการดึงและอัปเดตหมายเลขคิวล่าสุด
        const counterRef = db.collection('settings').doc('queueCounter');
        let queueId = 'A001';
        let newBookingData = {};

        await db.runTransaction(async (transaction) => {
            const counterDoc = await transaction.get(counterRef);
            let newNumber = 1;
            
            if (counterDoc.exists) {
                newNumber = (counterDoc.data().currentNumber || 0) + 1;
            }
            
            queueId = 'A' + String(newNumber).padStart(3, '0');
            
            transaction.set(counterRef, {
                currentNumber: newNumber,
                lastUpdated: FieldValue.serverTimestamp()
            }, { merge: true });

            // ตรวจสอบว่าเบอร์โทรศัพท์นี้เคยผูก LINE ไว้หรือไม่
            let lineUserId = null;
            const customerDoc = await transaction.get(db.collection('customers').doc(phone));
            if (customerDoc.exists && customerDoc.data().lineUserId) {
                lineUserId = customerDoc.data().lineUserId;
            }

            newBookingData = {
                queueId: queueId,
                firstName: firstName,
                lastName: lastName || '',
                phone: phone,
                serviceName: serviceName,
                servicePrice: Number(servicePrice),
                barberId: barberId,
                barber: barber,
                status: 'pending',
                createdAt: FieldValue.serverTimestamp(),
                ...(lineUserId && { lineUserId }) // ถ้ามี lineUserId ให้แนบไปด้วย
            };

            const newBookingRef = db.collection('bookings').doc();
            transaction.set(newBookingRef, newBookingData);
        });

        // ส่ง Push Notification แจ้งเตือนการจองสำเร็จทันทีถ้ามี lineUserId
        if (newBookingData.lineUserId) {
            const flexContents = getBookingSuccessFlex({
                customerName: `${firstName} ${lastName || ''}`.trim(),
                service: serviceName,
                barber: barber,
                queueNumber: queueId
            });
            await pushFlexMessage(newBookingData.lineUserId, "ยืนยันการจองคิว Wang Barber", flexContents);
        }

        res.status(201).json({ success: true, queueId, data: newBookingData });

    } catch (error) {
        console.error("Create Booking Error:", error);
        res.status(500).json({ success: false, message: "Failed to create booking: " + error.message });
    }
});

// 2. แจ้งเตือนเมื่อเรียกคิว
router.post('/call-queue', async (req, res) => {
    try {
        const { queueNumber, lineUserId, barberName } = req.body;
        
        if (!queueNumber || !lineUserId || !barberName) {
            // ถ้าไม่มี lineUserId ระบบจะไม่สามารถส่ง LINE ได้ 
            return res.status(200).json({ success: true, mock: true, message: "No lineUserId provided" });
        }

        const flexContents = getCallQueueFlex({
            queueNumber,
            barber: barberName
        });

        await pushFlexMessage(lineUserId, `🚨 ถึงคิวของท่านแล้ว! คิวหมายเลข ${queueNumber}`, flexContents);
        
        res.status(200).json({ success: true });
    } catch (error) {
        console.error("Call Queue Error:", error);
        res.status(500).json({ success: false, message: "Failed to send notification" });
    }
});

// 3. ตรวจสอบสิทธิ์ผู้ใช้และ Auto-Provisioning (สำหรับหน้า Login)
router.post('/verify-role', async (req, res) => {
    try {
        const { uid, email } = req.body;
        
        if (!uid || !email) {
            return res.status(400).json({ success: false, message: "Missing uid or email" });
        }

        if (!db) {
            console.error("[VerifyRole] Database not initialized");
            return res.status(500).json({ success: false, message: "Database not initialized" });
        }

        console.log(`[VerifyRole] Checking role for UID: ${uid}, Email: ${email}`);
        
        const userRef = db.collection('users').doc(uid);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            console.log(`[VerifyRole] User not found. Auto-provisioning manager role for ${email}...`);
            const newUserData = {
                email: email,
                name: 'Admin',
                role: 'manager',
                createdAt: FieldValue.serverTimestamp()
            };
            await userRef.set(newUserData);
            console.log(`[VerifyRole] Auto-provisioning completed for ${email}`);
            
            return res.status(200).json({ success: true, role: 'manager', isNewUser: true });
        }

        const role = userDoc.data().role;
        console.log(`[VerifyRole] User found. Role is: ${role}`);
        
        // แนะนำการตั้งค่าปิด Cache กรณีปัญหาบน Render
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        
        return res.status(200).json({ success: true, role: role });

    } catch (error) {
        // ดึง uid มาแสดงใน Log หากมี เพื่อให้ง่ายต่อการ Debug
        const errorUid = (req && req.body && req.body.uid) ? req.body.uid : 'Unknown UID';
        console.error(`[VerifyRole] Error verifying role for UID: ${errorUid} -`, error);
        res.status(500).json({ success: false, message: "Internal server error: " + error.message });
    }
});

module.exports = router;
