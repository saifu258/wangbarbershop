const express = require('express');
const axios = require('axios');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
require('dotenv').config();

// Firebase Admin Setup
const admin = require('firebase-admin');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
let db;

try {
    // กำหนดให้ใช้ serviceAccountKey.json ในการรัน Local
    const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
    if (fs.existsSync(serviceAccountPath)) {
        const serviceAccount = require(serviceAccountPath);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log("✅ Firebase Admin Initialized with serviceAccountKey.json");
    } else {
        // หากไม่มีไฟล์ (เช่น รันบน Cloud/Docker ที่มีการตั้งค่า ENV ไว้แล้ว)
        admin.initializeApp();
        console.log("✅ Firebase Admin Initialized with Application Default Credentials");
    }
    db = getFirestore();
} catch (error) {
    console.error("❌ Firebase Admin Initialization Error:", error);
}

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

// 1. Webhook ของ LINE
app.post('/api/webhook', async (req, res) => {
    try {
        if (!db) return res.status(500).send("Database not initialized");

        // ดึงการตั้งค่าจาก Firestore
        const shopDoc = await db.collection("settings").doc("shop").get();
        if (!shopDoc.exists) return res.status(500).send("Configuration Missing");
        
        const lineSecret = shopDoc.data().lineSecret;
        if (!lineSecret) return res.status(500).send("LINE Channel Secret Missing");

        // ตรวจสอบ X-Line-Signature
        const signature = req.headers["x-line-signature"];
        if (!signature) return res.status(400).send("Bad Request: Missing Signature");

        const bodyStr = JSON.stringify(req.body);
        const hash = crypto.createHmac("SHA256", lineSecret).update(bodyStr).digest("base64");
        
        if (hash !== signature) {
            console.warn("Signature validation failed! Unauthorized access.");
            return res.status(401).send("Unauthorized: Invalid Signature");
        }

        console.log("Webhook verified successfully! Events:", JSON.stringify(req.body.events));
        
        // ตอบกลับ LINE ทันที
        res.status(200).send("OK");
    } catch (error) {
        console.error("Webhook Error:", error);
        res.status(500).send("Internal Server Error");
    }
});

// 2. ส่งแจ้งเตือนเมื่อเรียกคิว (ถูกเรียกจากหน้าของช่าง)
app.post('/api/notify/call', async (req, res) => {
    try {
        const { queueNumber, lineUserId } = req.body;
        
        if (!db) return res.status(500).json({ success: false, message: "Database not initialized" });

        // ดึง Token จาก Firestore
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

        res.status(200).json({ success: true });
    } catch (error) {
        console.error("Notify Call Error:", error.response?.data || error.message);
        res.status(500).json({ success: false, message: "Failed to send LINE notification" });
    }
});

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

// เริ่มต้น Server
app.listen(port, () => {
    console.log(`🚀 Server is running on http://localhost:${port}`);
});
