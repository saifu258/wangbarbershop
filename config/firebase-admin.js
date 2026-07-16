const { initializeApp, getApps, cert, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
require('dotenv').config();

const fs = require('fs');
const path = require('path');

// ป้องกันการ Initialize ซ้ำซ้อน (App already exists error)
if (getApps().length === 0) {
    try {
        const renderSecretPath = '/etc/secrets/firebase-key.json';
        const localSecretPath = path.join(__dirname, '..', 'firebase-key.json'); // เผื่อรัน local วางไฟล์ไว้ที่โฟลเดอร์หลัก

        if (fs.existsSync(renderSecretPath)) {
            // 1. รันบน Production (Render) - อ่านจาก Secret File
            const serviceAccount = require(renderSecretPath);
            initializeApp({
                credential: cert(serviceAccount),
                projectId: process.env.FIREBASE_PROJECT_ID || 'wangbarbershop'
            });
            console.log("✅ Firebase Admin Initialized (Production: Render Secret File)");

        } else if (fs.existsSync(localSecretPath)) {
            // 2. รันแบบ Local - อ่านจากไฟล์ firebase-key.json ในเครื่อง (ถ้ามี)
            const serviceAccount = require(localSecretPath);
            initializeApp({
                credential: cert(serviceAccount),
                projectId: process.env.FIREBASE_PROJECT_ID || 'wangbarbershop'
            });
            console.log("✅ Firebase Admin Initialized (Local: firebase-key.json file)");

        } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
            // 3. รันแบบ Local - ใช้ Environment Variable เดิม (ถ้ามี)
            try {
                const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
                initializeApp({
                    credential: cert(serviceAccount),
                    projectId: process.env.FIREBASE_PROJECT_ID || 'wangbarbershop'
                });
                console.log("✅ Firebase Admin Initialized (Environment Variable)");
            } catch (parseError) {
                console.error("❌ Failed to parse FIREBASE_SERVICE_ACCOUNT JSON.");
            }
        } else {
            // 4. Fallback - ใช้ Application Default Credentials (ต้องใช้คำสั่ง gcloud auth login ในเครื่อง)
            initializeApp({
                credential: applicationDefault(),
                projectId: process.env.FIREBASE_PROJECT_ID || 'wangbarbershop'
            });
            console.log("✅ Firebase Admin Initialized (Application Default Credentials)");
        }
    } catch (error) {
        console.error("❌ Firebase Admin Initialization Error:", error);
    }
}

const { getAuth } = require('firebase-admin/auth');

let db = null;

try {
    // ลองดึง Firestore
    db = getFirestore();
} catch (error) {
    console.error("❌ Cannot initialize Firestore. Check your Firebase Admin credentials.");
}

module.exports = { db, getAuth };
