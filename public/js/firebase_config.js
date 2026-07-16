// กรุณานำ config นี้มาจาก Firebase Console -> Project Settings -> General -> Your apps
// สังเกตที่หัวข้อ SDK setup and configuration เลือก Config
const firebaseConfig = {
    apiKey: "AIzaSyD7YDuFXz0PHBGQRhaNUPg21fiznbC9vIE",
    authDomain: "wangbarber1.firebaseapp.com",
    projectId: "wangbarber1",
    storageBucket: "wangbarber1.firebasestorage.app",
    messagingSenderId: "81979309296",
    appId: "1:81979309296:web:0d1ea171924a52fe469635",
    measurementId: "G-XBHCS0GY2Z"
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
