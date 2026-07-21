const express = require('express');
const { FieldValue } = require('firebase-admin/firestore');
const { db, getAuth } = require('../../config/firebase-admin');
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
            // 1. ส่วนอ่านข้อมูล (Reads): ต้องทำก่อนเขียนข้อมูลทั้งหมด
            const counterDoc = await transaction.get(counterRef);
            const customerDoc = await transaction.get(db.collection('customers').doc(phone));
            
            // 2. ส่วนประมวลผล (Processing)
            let newNumber = 1;
            if (counterDoc.exists) {
                newNumber = (counterDoc.data().currentNumber || 0) + 1;
            }
            queueId = 'A' + String(newNumber).padStart(3, '0');
            
            let lineUserId = null;
            if (customerDoc.exists && customerDoc.data().lineUserId) {
                lineUserId = customerDoc.data().lineUserId;
            }

            const today = new Date();
            const dateStr = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, '0') + "-" + String(today.getDate()).padStart(2, '0');

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
                date: dateStr,
                createdAt: FieldValue.serverTimestamp(),
                ...(lineUserId && { lineUserId })
            };

            // 3. ส่วนเขียนข้อมูล (Writes): ต้องทำหลังจากอ่านข้อมูลเสร็จสิ้นทั้งหมด
            const newBookingRef = db.collection('bookings').doc();
            
            transaction.set(counterRef, {
                currentNumber: newNumber,
                lastUpdated: FieldValue.serverTimestamp()
            }, { merge: true });
            
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


// 4. เพิ่มพนักงาน (Staff Management)
router.post('/staff', async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        if (!name || !email || !password || !role) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        console.log(`[AddStaff] Request received to add staff: ${email}, role: ${role}`);
        const auth = getAuth();
        let userRecord;
        let isRepairMode = false;

        try {
            console.log(`[AddStaff] Attempting to create user in Auth for: ${email}`);
            userRecord = await auth.createUser({
                email: email,
                password: password,
                displayName: name,
            });
            console.log(`[AddStaff] User created in Auth successfully.`);
        } catch (authError) {
            if (authError.code === 'auth/email-already-exists') {
                console.log(`[AddStaff] Email already exists in Auth. Updating password and sync mode for: ${email}`);
                userRecord = await auth.getUserByEmail(email);
                await auth.updateUser(userRecord.uid, { password: password, displayName: name });
                isRepairMode = true;
            } else {
                console.error(`[AddStaff] Auth Error:`, authError);
                throw authError;
            }
        }

        // เขียนลง Firestore
        try {
            console.log(`[AddStaff] Writing data to Firestore for UID: ${userRecord.uid}`);
            const userData = {
                name: name,
                email: email,
                role: role,
                status: 'active',
                updatedAt: FieldValue.serverTimestamp()
            };
            
            if (!isRepairMode) {
                userData.uid = userRecord.uid; 
                userData.createdAt = FieldValue.serverTimestamp();
            }

            // Using UID as document ID to match Firestore Rules /users/{uid}
            await db.collection('users').doc(userRecord.uid).set(userData, { merge: true });
            
            console.log(`[AddStaff] Firestore write completed successfully.`);
            return res.status(200).json({ 
                success: true, 
                message: isRepairMode ? 'ข้อมูลพนักงานถูกซิงค์และอัปเดตรหัสผ่านเรียบร้อยแล้ว' : 'สร้างพนักงานใหม่สำเร็จ'
            });

        } catch (firestoreError) {
            console.error(`[AddStaff] Firestore Write Error:`, firestoreError);
            if (!isRepairMode && userRecord) {
                console.log(`[AddStaff] Rolling back (Deleting User from Auth) UID: ${userRecord.uid}`);
                await auth.deleteUser(userRecord.uid);
            }
            throw firestoreError;
        }

    } catch (error) {
        console.error(`[AddStaff] Error processing request:`, error);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error', 
            error: error.message,
            code: error.code
        });
    }
});

// 5. ดึงข้อมูลตั้งค่า LINE (LINE Settings)
router.get('/settings/line', async (req, res) => {
    try {
        if (!db) return res.status(500).json({ success: false, message: 'Database not initialized' });
        
        const doc = await db.collection('settings').doc('shop').get();
        if (doc.exists) {
            const data = doc.data();
            return res.status(200).json({
                success: true,
                lineToken: data.lineToken || '',
                lineSecret: data.lineSecret || ''
            });
        }
        return res.status(200).json({ success: true, lineToken: '', lineSecret: '' });
    } catch (error) {
        console.error("[GetLineSettings] Error:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
});

// 6. บันทึกข้อมูลตั้งค่า LINE (LINE Settings)
router.post('/settings/line', async (req, res) => {
    try {
        const { lineToken, lineSecret } = req.body;
        
        if (!db) return res.status(500).json({ success: false, message: 'Database not initialized' });

        await db.collection('settings').doc('shop').set({
            lineToken: lineToken || '',
            lineSecret: lineSecret || '',
            updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });

        res.status(200).json({ success: true, message: 'Settings saved successfully' });
    } catch (error) {
        console.error("[SaveLineSettings] Error:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
});

module.exports = router;
