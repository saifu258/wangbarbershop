✂️ Wang Barbershop Management System (Node.js + EJS Edition)

คู่มือฉบับนี้เป็นการสรุปโครงสร้าง แผนการพัฒนา และตรรกะการทำงานทั้งหมดของระบบจัดการร้านตัดผม ที่ถูกออกแบบมาสำหรับรันบนสภาพแวดล้อม Node.js (Express) ผสานกับ EJS Template Engine และใช้ Firebase เป็นฐานข้อมูล เพื่อความปลอดภัยระดับโปรดักชัน การซิงค์ข้อมูล Real-time 100% และการแจ้งเตือนอัจฉริยะผ่าน LINE Messaging API

🏗 1. สถาปัตยกรรมระบบและเทคโนโลยี (Tech Stack)

Backend (เซิร์ฟเวอร์ & API):

Node.js & Express.js: เป็นตัวควบคุมเซิร์ฟเวอร์หลัก (Web Server) จัดการระบบ Routing (การเปลี่ยนหน้าเว็บ) และทำหน้าที่เป็นตัวกลางในการยิง API ไปหา LINE อย่างปลอดภัย (ซ่อน Token ไม่ให้ลูกค้าเห็น)

Middleware (AuthGuard): ตรวจสอบสิทธิ์การเข้าถึงหน้าเว็บก่อนทำการ Render (ป้องกันช่างเข้าหน้าแอดมิน 100%)

Frontend (โครงสร้างและ UI):

EJS (Embedded JavaScript templating): ใช้แทน HTML/PHP เพื่อทำ Layout (แยก Header/Footer) และส่งผ่านตัวแปรจาก Node.js มาแสดงผลบนหน้าเว็บ

Tailwind CSS: จัดเลย์เอาต์ให้สวยงามและ Responsive

Vanilla JavaScript (ES6): ควบคุมหน้าบ้าน เช่น การดึง Firebase แบบ Real-time (onSnapshot), ระบบเสียงพูด (TTS) และการปรินต์ใบเสร็จ (html2canvas)

Database & Database (Google Firebase):

Firebase Firestore: ฐานข้อมูลหลักแบบ NoSQL

Firebase Authentication: ระบบล็อกอินพนักงาน

📂 2. โครงสร้างไฟล์และโฟลเดอร์สำหรับ Node.js (Directory Structure)

wangbarber_node/.js                  # รับคำสั่งจากหน้าเว็บเพื่อยิง LINE Notify
│   ├── index.js                # จัดการหน้า Public (หน้าจองคิว, หน้าจอทีวี, หน้าล็อกอิน)
│   ├── barber.js               # จัดการหน้าของช่าง (ป้องกันด้วย Middleware)
│   └── admin.js                # จัดการหน้าของผู้จัดการ (ป้องกันด้วย Middleware)
│
├── views/                      # โฟลเดอร์เก็บไฟล์หน้าเว็บ (EJS)
│   ├── partials/               # ชิ้นส่วนเว็บที่ใช้ซ้ำ
│   │   ├── header.ejs          # ส่วนหัวเว็บ (โหลด Tailwind, Firebase SDK)
│   │   └── footer.ejs          # ส่วนท้ายเว็บ
│   ├── index.ejs               # หน้าลูกค้าจองคิวออนไลน์
│   ├── tv.ejs                  # หน้าจอแสดงคิวทีวี (Real-time)
│   ├── login.ejs               # หน้าล็อกอินพนักงาน
│   ├── barber/
│   │   └── queue.ejs           # แดชบอร์ดจัดการคิวสำหรับช่าง
│   └── admin/
│       └── dashboard.ejs       # แดชบอร์ดผู้จัดการ, ตั้งค่าร้าน, ออกใบเสร็จ
│
└── public/                     # โฟลเดอร์เก็บไฟล์ Static (เข้าถึงได้โดยตรงจากเบราว์เซอร์)
    ├── css/
    ├── js/
    │   ├── firebase_config.js  # ตั้งค่าฝั่งหน้าเว็บ
    │   └── tv_sync.js          # ตรรกะเสียง TTS
    └── images/


💡 3. ตรรกะและฟีเจอร์หลัก (Core Logic)

3.1 ระบบลูกค้าจองคิว (Customer Booking) - views/index.ejs

การทำงาน:

ลูกค้าเข้าหน้าเว็บ, เลือกว่าจะตัดกับช่างคนไหน และเลือกบริการ

ข้อมูลจะถูกบันทึกลง Firestore (Collection bookings) โดยตรงจากฝั่งหน้าบ้าน

📲 การแจ้งเตือน LINE (จองคิวสำเร็จ):

│
├── .env                        # เก็บตัวแปรความลับ เช่น LINE_ACCESS_TOKEN, FIREBASE_API_KEY (ไม่เอาขึ้น Github)
├── package.json                # เก็บรายชื่อไลบรารีที่ต้องใช้ (express, ejs, axios, firebase-admin)
├── server.js                   # ไฟล์หลักสำหรับรันเซิร์ฟเวอร์ Node.js (ตั้งค่า Express, Routes พื้นฐาน)
│
├── routes/                     # โฟลเดอร์แยกการจัดการเส้นทาง (Routing)
│   ├── api
ทันทีที่ข้อมูลลง Firestore สำเร็จ หน้าเว็บจะยิง HTTP POST ไปที่ Backend ของตัวเอง (/api/notify/booking)

Node.js จะรับเรื่องและใช้ไลบรารี axios ยิง LINE Messaging API พร้อม Flex Message สวยงามไปยังลูกค้า เพื่อแจ้งหมายเลขคิว

3.2 หน้าจอแสดงคิวแบบทีวี (Live TV Queue) - views/tv.ejs

Real-time Sync: ฝั่ง EJS จะมีการฝังโค้ด onSnapshot เพื่อฟังการเปลี่ยนแปลงของคิว หากช่างกดเปลี่ยนคิว หน้าจอทีวีจะเด้งรับทันที

ระบบเสียง Text-to-Speech (TTS): มีปุ่มให้คลิก 1 ครั้งเพื่อปลดล็อกเสียง หากคิวเปลี่ยนเป็น calling จะใช้เบราว์เซอร์อ่านออกเสียง "ขอเชิญคิว A001..." (มีการเขียนตัวแปร lastSpokenQueueId กันเสียงพูดซ้ำรัวๆ)

สถานะ Walk-in (หน้าร้าน): ถ้าระบบตรวจพบว่าช่างมีสถานะ busy จอทีวีช่องช่างคนนั้นจะแสดงคำว่า "ไม่ว่าง (Busy)" ทันที

3.3 ระบบของช่างตัดผม (Barber View) - views/barber/queue.ejs

ระบบรักษาความปลอดภัย: ไฟล์ routes/barber.js จะเช็ค Session/Cookie ก่อน ถ้าไม่ใช่ช่างตัดผม ระบบจะไม่ยอม Render หน้าเว็บนี้เด็ดขาด

ปุ่มสถานะ (Busy/Available): กดแล้วอัปเดต Profile ตัวเองใน Firestore ทำให้จอทีวีเปลี่ยนเป็น "ไม่ว่าง"

การเรียกคิว (Call) & แจ้งเตือน LINE:

กดปุ่ม Call -> เปลี่ยนสถานะคิวเป็น calling (ทีวีรับทราบแล้วส่งเสียงทันที)

หน้าเว็บยิง POST ไปที่ Backend (/api/notify/call) -> Node.js ส่งข้อความ LINE แจ้งลูกค้าว่า "🚨 ถึงคิวแล้ว! กรุณาเข้าช่องบริการ..."

กดเสร็จสิ้น (Completed): คิวจะถูกเก็บเข้าประวัติรอผู้จัดการคิดเงิน

3.4 ระบบผู้จัดการ (Manager Dashboard) - views/admin/dashboard.ejs

แดชบอร์ด: คำนวณรายได้ทั้งหมด และแบ่งเปอร์เซ็นต์ (Split) ให้ช่างแต่ละคนแบบเรียลไทม์

ตั้งค่าร้าน: อัปโหลดโลโก้ร้าน (แปลงเป็น Base64) เซฟลง Firestore เพื่อให้ Navbar ของทุกหน้าเปลี่ยนตาม

ระบบใบเสร็จ: ดึงรายการที่ตัดเสร็จแล้วมาแสดง กดปุ่มเดียวระบบจะจำลองหน้าใบเสร็จเครื่องพรินต์ความร้อน และใช้ html2canvas แคปเป็นไฟล์ .jpg ให้ลูกค้า

🗄 4. โครงสร้างฐานข้อมูล (Firestore NoSQL Schema)

Collection: users (พนักงาน) -> name, role (manager/barber), status (available/busy)

Collection: bookings (คิว) -> queueNumber, customerName, phone, lineUserId, barber, status (pending/calling/completed), price

Collection: settings (ตั้งค่าร้าน) -> shopName, logoBase64, footerText

🚀 5. คู่มือการติดตั้งระบบและรันแอป (Setup Guide)

เตรียม Environment (Node.js):

เปิด Terminal ใน IDE ของคุณ (เช่น Ampt)

รันคำสั่งสร้างโปรเจกต์: npm init -y

ติดตั้งไลบรารี: npm install express ejs cors axios firebase-admin dotenv

เตรียมไฟล์ .env:

สร้างไฟล์ .env ไว้ที่ root folder ใส่ค่า:

LINE_CHANNEL_ACCESS_TOKEN=your_long_lived_token
PORT=3000


เตรียม Firebase & LINE API:

นำ SDK ของ Firebase ฝั่ง Client ไปใส่ใน public/js/firebase_config.js

หากต้องการตรวจสอบ Auth จากฝั่ง Server ให้โหลด Service Account Key (.json) จาก Firebase Console มาใช้งานคู่กับ firebase-admin

รันเซิร์ฟเวอร์:

รันคำสั่ง node server.js

ระบบพร้อมใช้งานทันที!