// กรุณานำ config นี้มาจาก Firebase Console -> Project Settings -> General -> Your apps
// สังเกตที่หัวข้อ SDK setup and configuration เลือก Config
const firebaseConfig = {
    apiKey: "AIzaSyD4i6UoaAIQFzwiFiyc6zmC_Rqo0joE3rQ",
    authDomain: "wangbarbershop-a7116.firebaseapp.com",
    projectId: "wangbarbershop-a7116",
    storageBucket: "wangbarbershop-a7116.firebasestorage.app",
    messagingSenderId: "416966478189",
    appId: "1:416966478189:web:c51537a8257afd5d34f264",
    measurementId: "G-FS39MW1VXE"
};

// ประกาศตัวแปร global สำหรับเรียกใช้ Firebase Services
let db = null;
let auth = null;

try {
    // ป้องกันการ Initialize ซ้ำ
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }

    // ตั้งค่าตัวแปร
    db = firebase.firestore();
    auth = firebase.auth();

    console.log("🔥 Firebase initialized successfully!");
} catch (error) {
    console.error("❌ Firebase initialization error: ", error);
    console.warn("Please check your firebaseConfig object. Did you replace the placeholder values?");
}
