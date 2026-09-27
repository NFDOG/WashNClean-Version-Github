/* ตั้งค่า Firebase ของ Wash & Clean Up
 * วาง firebaseConfig จาก Firebase Console แทน null ด้านล่าง (Project settings → General
 * → Your apps → SDK setup and configuration) ต้องมี databaseURL ด้วย และอีเมลใน
 * WCU_ADMIN_EMAILS ต้องตรงกับบัญชีที่สร้างใน Authentication และใน database.rules.json
 *
 * ปล่อยเป็น null ไว้ = เว็บทำงานแบบเดิม เก็บข้อมูลใน localStorage ของเครื่องนี้เท่านั้น
 * ล็อกอินด้วย admin / admin (บัญชีทดลอง ไม่ผูกกับ Firebase)
 *
 * ⚠️ อย่า commit ไฟล์นี้ทับด้วยค่าจริงขึ้น GitHub — คัดลอกไปตั้งค่าในเครื่อง/บนโฮสต์ของตัวเอง
 * แทน (เช่นแก้ตรงนี้ตอน deploy) แล้วเก็บไฟล์นี้ไว้เป็น null ในที่เก็บโค้ดสาธารณะ
 */

window.WCU_FIREBASE_CONFIG = null;
/* ตัวอย่างค่าที่ต้องกรอกเอง (ดูวิธีได้ใน README.md):
window.WCU_FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://your-project-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "your-project",
  storageBucket: "your-project.firebasestorage.app",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef",
};
*/

// พิมพ์แค่ "admin" ในหน้าเข้าสู่ระบบได้เลย ระบบจะเติมเป็น admin@washnclean.app ให้
window.WCU_ADMIN_EMAILS = ["admin@washnclean.app"];
