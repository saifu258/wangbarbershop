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
            // อนุญาตให้เฉพาะ admin@wangbarbershop.com สมัครและรับสิทธิ์แอดมินอัตโนมัติ
            if (email === 'admin@wangbarbershop.com') {
                console.log(`[VerifyRole] Admin user not found. Auto-provisioning manager role for ${email}...`);
                const newUserData = {
                    email: email,
                    name: 'System Admin',
                    role: 'manager',
                    createdAt: FieldValue.serverTimestamp()
                };
                await userRef.set(newUserData);
                console.log(`[VerifyRole] Auto-provisioning completed for ${email}`);
                
                return res.status(200).json({ success: true, role: 'manager', isNewUser: true });
            } else {
                // หากเป็นอีเมลอื่นที่แอดมินไม่ได้สร้างข้อมูลไว้ให้ล่วงหน้า ให้ปฏิเสธการเข้าถึง
                console.warn(`[VerifyRole] Unauthorized access attempt by ${email}`);
                return res.status(403).json({ 
                    success: false, 
                    message: "คุณไม่มีสิทธิ์เข้าใช้งานระบบ (Unauthorized). กรุณาติดต่อแอดมินเพื่อเพิ่มข้อมูลพนักงานให้คุณก่อนเข้าใช้งาน" 
                });
            }
        }

        const role = userDoc.data().role;
        const name = userDoc.data().name;
        console.log(`[VerifyRole] User found. Role is: ${role}`);
        
        // แนะนำการตั้งค่าปิด Cache กรณีปัญหาบน Render
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        
        return res.status(200).json({ success: true, role: role, name: name });

    } catch (error) {
        // ดึง uid มาแสดงใน Log หากมี เพื่อให้ง่ายต่อการ Debug
        const errorUid = (req && req.body && req.body.uid) ? req.body.uid : 'Unknown UID';
        console.error(`[VerifyRole] Error verifying role for UID: ${errorUid} -`, error);
        res.status(500).json({ success: false, message: "Internal server error: " + error.message });
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
            console.log(`[AddStaff] User created in Auth successfully: ${userRecord.uid}`);
        } catch (authError) {
            if (authError.code === 'auth/email-already-exists') {
                console.log(`[AddStaff] Email already exists in Auth. Switching to repair/sync mode for: ${email}`);
                userRecord = await auth.getUserByEmail(email);
                isRepairMode = true;
            } else {
                console.error(`[AddStaff] Auth Error:`, authError);
                throw authError; // Rethrow if it's not the email-already-exists error
            }
        }

        // เขียนลง Firestore
        try {
            console.log(`[AddStaff] Writing data to Firestore for UID: ${userRecord.uid}`);
            await db.collection('users').doc(userRecord.uid).set({
                name: name,
                email: email,
                role: role,
                status: 'available',
                createdAt: FieldValue.serverTimestamp()
            }, { merge: true }); // ใช้ merge เพื่อไม่เขียนทับ createdAt เดิมกรณีซ่อมแซมข้อมูล
            
            console.log(`[AddStaff] Firestore write completed successfully.`);
            return res.status(200).json({ 
                success: true, 
                message: isRepairMode ? 'ข้อมูลพนักงานถูกซิงค์เรียบร้อยแล้ว' : 'สร้างพนักงานใหม่สำเร็จ',
                uid: userRecord.uid
            });

        } catch (firestoreError) {
            console.error(`[AddStaff] Firestore Write Error:`, firestoreError);
            // หากเป็นการสร้างใหม่ (ไม่ใช่ซ่อมแซม) และเขียน Firestore พัง ให้ลบ User ใน Auth ทิ้งเพื่อป้องกัน Data Inconsistency
            if (!isRepairMode) {
                console.log(`[AddStaff] Rolling back (Deleting User from Auth) UID: ${userRecord.uid}`);
                await auth.deleteUser(userRecord.uid);
                console.log(`[AddStaff] Rollback completed.`);
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
