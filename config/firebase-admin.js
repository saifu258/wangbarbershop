const { initializeApp, getApps, cert, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
require('dotenv').config();

// ป้องกันการ Initialize ซ้ำซ้อน (App already exists error)
if (getApps().length === 0) {
    try {
        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
            try {
                // ⚠️ วาง JSON ของ Service Account จากโปรเจกต์ "wangbarbershop .shwfh" ไว้ใน Environment Variable นี้ ⚠️
                // แปลงค่า JSON string จาก Environment Variable เป็น Object
                const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
                initializeApp({
                    credential: cert(serviceAccount),
                    projectId: process.env.FIREBASE_PROJECT_ID || 'wangbarbershop'
                });
                console.log("✅ Firebase Admin Initialized with Environment Variable (FIREBASE_SERVICE_ACCOUNT)");
            } catch (parseError) {
                console.error("❌ Failed to parse FIREBASE_SERVICE_ACCOUNT. Please ensure it's a valid JSON string.");
                console.error(parseError);
            }
        } else {
            // หากไม่มี ENV จะพยายามใช้ Application Default Credentials
            initializeApp({
                credential: applicationDefault(),
                projectId: process.env.FIREBASE_PROJECT_ID || 'wangbarber1'
            });
            console.log("✅ Firebase Admin Initialized with Application Default Credentials");
        }
    } catch (error) {
        console.error("❌ Firebase Admin Initialization Error:", error);
    }
}

const { getAuth } = require('firebase-admin/auth');

const db = getFirestore();

module.exports = { db, getAuth };
