const express = require('express');
const axios = require('axios');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
require('dotenv').config();

// Firebase Admin Setup
const { db } = require('./config/firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');

const app = express();
const port = process.env.PORT || 3000;

// ตั้งค่า EJS engine สำหรับ Template
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware พื้นฐาน
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ตั้งค่าการอ่านไฟล์ Static จากโฟลเดอร์ public
app.use(express.static(path.join(__dirname, 'public')));

// Dynamic Firebase Config Script Route
app.get('/js/firebase_config.js', (req, res) => {
    res.type('application/javascript');
    res.send(`
// Dynamic Firebase Config from Environment Variables
// ⚠️ วาง firebaseConfig ของโปรเจกต์ใหม่ "wangbarbershop .shwfh" ไว้ใน Environment Variables (.env หรือ Render.com) ⚠️
const firebaseConfig = {
    apiKey: "${process.env.FIREBASE_API_KEY || ''}",
    authDomain: "${process.env.FIREBASE_AUTH_DOMAIN || ''}",
    projectId: "${process.env.FIREBASE_PROJECT_ID || ''}",
    storageBucket: "${process.env.FIREBASE_STORAGE_BUCKET || ''}",
    messagingSenderId: "${process.env.FIREBASE_MESSAGING_SENDER_ID || ''}",
    appId: "${process.env.FIREBASE_APP_ID || ''}",
    measurementId: "${process.env.FIREBASE_MEASUREMENT_ID || ''}"
};

let db = null;
let auth = null;

try {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    db = firebase.firestore();
    auth = firebase.auth();
    console.log("🔥 Firebase initialized successfully!");
} catch (error) {
    console.error("❌ Firebase initialization error: ", error);
}
    `);
});

// -------------------------------------------------------------
// Routes แสดงผลหน้าเว็บ (Frontend)
// -------------------------------------------------------------
app.get('/', (req, res) => res.render('index', { title: 'Wang Barber' }));
app.get('/tv', (req, res) => res.render('tv'));
app.get('/login', (req, res) => res.render('login', { title: 'เข้าสู่ระบบพนักงาน' }));
app.get('/admin', (req, res) => res.render('admin/dashboard', { title: 'Dashboard (Admin)' }));
app.get('/barber', (req, res) => res.render('barber/queue', { title: 'จัดการคิว (Barber)' }));

// -------------------------------------------------------------
// API Routes สำหรับจัดการ LINE Webhook & Notify
// -------------------------------------------------------------

// 1. Webhook ของ LINE (จัดการโดย webhook.js)
const webhookRouter = require('./src/routes/webhook');
app.use('/api/webhook', webhookRouter);

// 2. API ย่อยสำหรับการจองคิวและเรียกคิว (จัดการโดย api.js)
const apiRouter = require('./src/routes/api');
app.use('/api', apiRouter);

// 3. API สำหรับให้หน้า Admin Dashboard ทดสอบ Token 
app.post('/api/testLineConnection', async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) return res.status(400).json({ success: false, message: "Missing token" });

        const response = await axios.get("https://api.line.me/v2/bot/info", {
            headers: { "Authorization": `Bearer ${token}` }
        });

        if (response.status === 200) {
            res.status(200).json({ success: true, message: "Connection OK", data: response.data });
        } else {
            res.status(400).json({ success: false, message: "Invalid Token" });
        }
    } catch (error) {
        const errorMsg = error.response ? error.response.data.message : error.message;
        console.error("Test Connection Error:", errorMsg);
        res.status(400).json({ success: false, message: errorMsg });
    }
});

// 4. API ดึงรายชื่อช่างตัดผม
app.get('/api/barbers', async (req, res) => {
    try {
        if (!db) return res.status(500).json({ success: false, message: "Database not initialized" });
        
        // Query Firestore: ดึงเฉพาะผู้ใช้ที่ role เป็น 'barber' และ status เป็น 'available' ตามที่ร้องขอ
        const snapshot = await db.collection('users')
            .where('role', '==', 'barber')
            .where('status', '==', 'available')
            .get();
            
        const barbers = [];
        
        snapshot.forEach(doc => {
            const data = doc.data();
            barbers.push({
                id: doc.id,
                name: data.name || doc.id
            });
        });
        
        res.status(200).json({ success: true, data: barbers });
    } catch (error) {
        console.error("Fetch Barbers Error:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
});

// 5. API จัดการบริการ (Services)
app.get('/api/services', async (req, res) => {
    try {
        if (!db) return res.status(500).json({ success: false, message: "Database not initialized" });
        
        let query = db.collection('services');
        if (req.query.all !== 'true') {
            query = query.where('status', '==', 'available');
        }
        
        const snapshot = await query.get();
        const services = [];
        snapshot.forEach(doc => {
            services.push({ id: doc.id, ...doc.data() });
        });
        return res.status(200).json({ success: true, data: services });
    } catch (error) {
        console.error("Fetch Services Error:", error);
        return res.status(500).json({ success: false, message: "Internal server error: " + error.message });
    }
});

app.post('/api/services', async (req, res) => {
    try {
        if (!db) return res.status(500).json({ success: false, message: "Database not initialized" });
        
        console.log("POST /api/services - req.body:", req.body);
        
        const { name, price, status } = req.body;
        if (!name || price === undefined) return res.status(400).json({ success: false, message: "Missing required fields" });
        
        const newService = {
            name,
            price: Number(price),
            status: status || 'available',
            createdAt: FieldValue.serverTimestamp()
        };
        const docRef = await db.collection('services').add(newService);
        return res.status(201).json({ success: true, id: docRef.id, data: newService });
    } catch (error) {
        console.error("Add Service Error:", error);
        return res.status(500).json({ success: false, message: "Internal server error: " + error.message });
    }
});

app.put('/api/services/:id', async (req, res) => {
    try {
        if (!db) return res.status(500).json({ success: false, message: "Database not initialized" });
        const { name, price, status } = req.body;
        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (price !== undefined) updateData.price = Number(price);
        if (status !== undefined) updateData.status = status;
        
        await db.collection('services').doc(req.params.id).update(updateData);
        res.status(200).json({ success: true });
    } catch (error) {
        console.error("Update Service Error:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
});

app.delete('/api/services/:id', async (req, res) => {
    try {
        if (!db) return res.status(500).json({ success: false, message: "Database not initialized" });
        // Soft delete (เปลี่ยน status เป็น unavailable)
        await db.collection('services').doc(req.params.id).update({ status: 'unavailable' });
        res.status(200).json({ success: true });
    } catch (error) {
        console.error("Delete Service Error:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
});

// Auto-Provisioning โครงสร้างฐานข้อมูล
async function autoProvisionDatabase() {
    if (!db) {
        console.error("❌ Database not initialized, skipping auto-provisioning.");
        return;
    }
    try {
        console.log("🔍 Checking database for auto-provisioning...");

        // ตรวจสอบ bookings
        const bookingsSnap = await db.collection('bookings').limit(1).get();
        if (bookingsSnap.empty) {
            console.log("⚡ กำลังสร้าง Collection 'bookings'...");
            await db.collection('bookings').doc('init').set({
                queueNumber: 'A001',
                lineUserId: 'mock-user-id',
                barber: 'ช่างตัวอย่าง',
                status: 'pending',
                service: 'ตัดผมชาย',
                createdAt: FieldValue.serverTimestamp()
            });
            console.log("✅ 'bookings' initialized.");
        }

        // ตรวจสอบ barbers
        const barbersSnap = await db.collection('barbers').limit(1).get();
        if (barbersSnap.empty) {
            console.log("⚡ กำลังสร้าง Collection 'barbers'...");
            await db.collection('barbers').doc('init').set({
                name: 'ช่างตัวอย่าง',
                status: 'ว่าง',
                createdAt: FieldValue.serverTimestamp()
            });
            console.log("✅ 'barbers' initialized.");
        }

        // ตรวจสอบ services
        const servicesSnap = await db.collection('services').limit(1).get();
        if (servicesSnap.empty) {
            console.log("⚡ กำลังสร้าง Collection 'services'...");
            await db.collection('services').doc('init').set({
                name: 'ตัดผมชาย',
                price: 150,
                status: 'available',
                createdAt: FieldValue.serverTimestamp()
            });
            console.log("✅ 'services' initialized.");
        }

        // ตรวจสอบ users
        const usersSnap = await db.collection('users').limit(1).get();
        if (usersSnap.empty) {
            console.log("⚡ กำลังสร้าง Collection 'users'...");
            await db.collection('users').doc('init_admin').set({
                name: 'System Admin',
                email: 'admin@wangbarbershop.com',
                role: 'manager',
                status: 'available',
                createdAt: FieldValue.serverTimestamp()
            });
            console.log("✅ 'users' initialized.");
        }

        console.log("🎯 Database auto-provisioning check completed.");
    } catch (error) {
        console.error("❌ Auto-provisioning error:", error);
    }
}

// เริ่มต้น Server และ Provisioning ข้อมูล
autoProvisionDatabase().then(() => {
    app.listen(port, () => {
        console.log(`🚀 Server is running on http://localhost:${port}`);
    });
});
