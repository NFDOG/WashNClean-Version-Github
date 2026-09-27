/* Wash & Clean Up — shared data layer
   หน้า landing, /student และ /admin ทุกหน้าโหลดไฟล์นี้ (path แบบ relative) จึงอ่าน/เขียน
   ข้อมูลเครื่อง/ใบแจ้งซ่อม/บัญชีแอดมินชุดเดียวกันเสมอ ทุกอย่างเก็บอยู่ใน localStorage

   ถ้าตั้งค่า Firebase ไว้ใน firebase-config.js ไฟล์ firebase-sync.js จะทำให้ localStorage
   กลายเป็นแคชของ Firebase Realtime Database แทน (ทุกเครื่องเห็นข้อมูลชุดเดียวกันแบบเรียลไทม์)
   โดยหน้าเว็บอื่นไม่ต้องเปลี่ยนโค้ด ยังอ่าน/เขียนผ่านฟังก์ชันในไฟล์นี้เหมือนเดิม */

/* ข้อความตอนรายการว่าง: โหมด Firebase ที่ยังโหลดไม่เสร็จจะบอกว่ากำลังโหลด แทนการบอกว่า "ไม่มีเครื่อง" */
function wcuLoadingText(emptyText) {
  const c = typeof window !== "undefined" ? window.WCU_CLOUD : null;
  if (!c || !c.enabled || c.ready) return emptyText;
  return c.error ? "เชื่อมต่อฐานข้อมูลไม่ได้ ลองรีเฟรชหน้านี้อีกครั้ง" : "กำลังโหลดสถานะเครื่อง…";
}

/* เวลาปัจจุบันที่ทุกเครื่องใช้ร่วมกัน: โหมด Firebase จะปรับตามนาฬิกาเซิร์ฟเวอร์ (.info/serverTimeOffset)
   กันมือถือที่ตั้งเวลาเพี้ยนนับถอยหลังผิด หรือจบรอบซักของคนอื่นก่อนเวลา */
function wcuNow() {
  const offset = typeof window !== "undefined" ? Number(window.WCU_TIME_OFFSET) || 0 : 0;
  return Date.now() + offset;
}

/* เปิดโหมดออนไลน์ (Firebase) เมื่อมี config ครบใน firebase-config.js */
function wcuCloudEnabled() {
  const c = typeof window !== "undefined" ? window.WCU_FIREBASE_CONFIG : null;
  return !!(c && typeof c === "object" && c.apiKey && c.databaseURL);
}

const WCU_KEYS = {
  machines: "wcu:machines",
  reports: "wcu:reports",
  admins: "wcu:admins",
  usage: "wcu:usage", // ประวัติการใช้งานแต่ละครั้ง (ใช้คำนวณหน้ารายรับ)
  expenses: "wcu:expenses", // รายการรายจ่าย (หน้ารายจ่าย)
  seedVersion: "wcu:seed-version",
  session: "wcu:session", // sessionStorage, not localStorage
};

/* ---------- ข้อมูลประกอบใบแจ้งซ่อม (ใช้ร่วมกันฝั่งนักศึกษาและแอดมิน) ---------- */
/* icon = ชื่อไอคอนเส้นใน icons.js (WcuIcon.ui), tone = สีพื้นไอคอนในฟอร์มแจ้งปัญหา */
const WCU_ISSUES = {
  washer: [
    { value: "เครื่องไม่ทำงาน", icon: "power", tone: "red" },
    { value: "หยอดเหรียญแล้วเครื่องไม่ทำงาน", icon: "coin", tone: "amber" },
    { value: "น้ำไม่ไหล", icon: "drop-off", tone: "blue" },
    { value: "น้ำไม่ระบาย / น้ำขัง", icon: "tub", tone: "blue" },
    { value: "ปั่นไม่หมาด", icon: "spin", tone: "indigo" },
    { value: "เครื่องมีเสียงดัง", icon: "volume", tone: "indigo" },
    { value: "น้ำรั่วซึม", icon: "drop", tone: "blue" },
    { value: "ฝาเปิด / ปิดไม่ได้", icon: "lid", tone: "slate" },
    { value: "มีกลิ่น / ถังสกปรก", icon: "odor", tone: "green" },
    { value: "ไฟรั่ว / ไฟช็อต", icon: "zap", tone: "red", danger: true },
    { value: "อื่นๆ", icon: "pencil", tone: "slate" },
  ],
  iron: [
    { value: "เตารีดไม่ร้อน", icon: "snow", tone: "blue" },
    { value: "ร้อนเกินไป / ผ้าไหม้", icon: "flame", tone: "orange" },
    { value: "ปลั๊กหลวม / สายชำรุด", icon: "plug", tone: "indigo" },
    { value: "ไอน้ำไม่ออก / น้ำรั่ว", icon: "steam", tone: "blue" },
    { value: "แผ่นความร้อนสกปรก", icon: "sparkle", tone: "green" },
    { value: "ไฟรั่ว / ไฟช็อต", icon: "zap", tone: "red", danger: true },
    { value: "อื่นๆ", icon: "pencil", tone: "slate" },
  ],
};
const WCU_SEVERITY = {
  minor: { label: "ผิดปกติเล็กน้อย", hint: "ยังพอใช้งานได้", rank: 1 },
  unusable: { label: "ใช้งานไม่ได้", hint: "เครื่องทำงานไม่ได้เลย", rank: 2 },
  danger: { label: "อันตราย", hint: "ไฟรั่ว ควัน กลิ่นไหม้", rank: 3 },
};
const WCU_OCCURRED = { before: "ก่อนเริ่มใช้งาน", during: "ระหว่างใช้งาน", after: "หลังใช้งานเสร็จ" };

/* ไอคอน SVG ของอาการ (คืนค่าเป็น HTML — ใช้ใน innerHTML เท่านั้น) */
function wcuIssueInfo(value) {
  return WCU_ISSUES.washer.concat(WCU_ISSUES.iron).find((i) => i.value === value) || null;
}
function wcuIssueIcon(value, cls = "") {
  const hit = wcuIssueInfo(value);
  if (typeof WcuIcon === "undefined" || !WcuIcon.ui) return "";
  return WcuIcon.ui(hit ? hit.icon : "dot", cls);
}
function wcuLogEntry(text, by = "admin", at = Date.now()) {
  return { at, by, text };
}
function wcuAdminPhone() {
  const admin = wcuGet(WCU_KEYS.admins)[0];
  return admin && admin.adminTel ? admin.adminTel : "";
}

/* หมวดรายจ่าย (ลำดับนี้ตรงกับลำดับสีในกราฟ ห้ามสลับ) */
const WCU_EXPENSE_CATEGORIES = [
  { key: "water", label: "ค่าน้ำประปา" },
  { key: "electricity", label: "ค่าไฟฟ้า" },
  { key: "repair", label: "ค่าซ่อม/อะไหล่" },
  { key: "cleaning", label: "ทำความสะอาด/น้ำยา" },
  { key: "other", label: "อื่นๆ" },
];

/* ---------- first-run seed data (mirrors the design mock) ---------- */

function wcuSeedIfEmpty(force = false) {
  // โหมด Firebase: ข้อมูลตั้งต้นสร้างครั้งเดียวบนฐานข้อมูล (โดยแอดมินคนแรก) ไม่สร้างแยกในแต่ละเครื่อง
  if (wcuCloudEnabled() && !force) return;
  if (!localStorage.getItem(WCU_KEYS.machines)) {
    const now = Date.now();
    const machines = [
      { id: "1", category: "washer", status: "available", price: 20, startedAt: null },
      { id: "2", category: "washer", status: "available", price: 20, startedAt: null },
      { id: "3", category: "washer", status: "busy", price: 90, startedAt: now - 3 * 60 * 1000 },
      { id: "4", category: "washer", status: "available", price: 20, startedAt: null },
      { id: "5", category: "washer", status: "available", price: 20, startedAt: null },
      { id: "6", category: "washer", status: "busy", price: 20, startedAt: now - 60 * 1000 },
      { id: "1", category: "iron", status: "available", price: 15, startedAt: null },
      { id: "2", category: "iron", status: "available", price: 15, startedAt: null },
      { id: "3", category: "iron", status: "busy", price: 15, startedAt: now - 7 * 60 * 1000 },
      { id: "4", category: "iron", status: "busy", price: 15, startedAt: now - 15 * 60 * 1000 },
    ];
    // keep composite ids unique internally without changing the visible label
    machines.forEach((m, i) => (m.uid = `${m.category[0]}${m.id}-${i}`));
    localStorage.setItem(WCU_KEYS.machines, JSON.stringify(machines));
  }
  if (!localStorage.getItem(WCU_KEYS.reports)) {
    localStorage.setItem(WCU_KEYS.reports, JSON.stringify(wcuSampleReports()));
  }
  if (!localStorage.getItem(WCU_KEYS.admins)) {
    const admins = [
      { adminId: "A-01", username: "admin", password: "admin", adminTel: "098-541-6496", dormNum: 1 },
    ];
    localStorage.setItem(WCU_KEYS.admins, JSON.stringify(admins));
  } else {
    // บัญชีทดลองเดิม admin / admin1234 → เปลี่ยนเป็น admin / admin (ไม่แตะบัญชีที่ตั้งรหัสเอง)
    const admins = wcuGet(WCU_KEYS.admins);
    const def = admins.find((a) => a.adminId === "A-01" && a.username === "admin" && a.password === "admin1234");
    if (def) { def.password = "admin"; localStorage.setItem(WCU_KEYS.admins, JSON.stringify(admins)); }
  }
  wcuSeedUsageIfEmpty();
  const seedVersion = localStorage.getItem(WCU_KEYS.seedVersion);
  if (!["2", "3", "4"].includes(seedVersion)) wcuRetimeSeedUsage();
  if (!["3", "4"].includes(seedVersion)) wcuUpgradeSampleReports();
  if (seedVersion !== "4") wcuRefreshSampleReports();
  localStorage.setItem(WCU_KEYS.seedVersion, "4");
  wcuSeedExpensesIfEmpty();
}

/*
 * ใบแจ้งซ่อมตัวอย่าง: 2 ใบยังไม่ระบุเครื่อง (ให้แอดมินลองระบุ) + 2 ใบซ่อมเสร็จแล้ว
 * ที่ผูกกับค่าซ่อมตัวอย่างในหน้ารายจ่าย (E-seed-3, E-seed-8)
 */
function wcuSampleReports() {
  const now = Date.now();
  const H = 60 * 60 * 1000;
  const D = 24 * H;
  const iso = (t) => new Date(t).toISOString();
  const find = (category, id) => wcuGetMachines(category).find((m) => String(m.id) === id);
  const washer4 = find("washer", "4");
  const iron3 = find("iron", "3");
  const t1 = now - 3 * H, t2 = now - 26 * H, t3 = now - 12 * D - 20 * H, t4 = now - 41 * D - 5 * H;
  return [
    {
      id: "R-seed-1", topic: "เครื่องซักผ้า", studentId: "68026080", issues: ["เครื่องมีเสียงดัง", "ปั่นไม่หมาด"],
      severity: "minor", occurredWhen: "during", contact: "LINE: mild_wash",
      extraDetail: "เสียงดังมากตอนปั่นหมาดช่วงท้าย เหมือนมีอะไรกระแทกในถัง (ดูเลขเครื่องได้จากสติกเกอร์ในรูป)",
      photos: [wcuSamplePhoto("noise", "No.5")], detail: "ตรวจสอบเครื่องซัก : เครื่องเสียงดังตอนซัก",
      createdAt: iso(t1), resolved: false, status: "new", source: "student",
      log: [wcuLogEntry("นิสิตแจ้งปัญหาผ่านหน้าเว็บ", "student", t1)],
    },
    {
      id: "R-seed-2", topic: "เครื่องซักผ้า", studentId: "68021210", issues: ["หยอดเหรียญแล้วเครื่องไม่ทำงาน"],
      severity: "unusable", occurredWhen: "before", contact: "0985416496",
      moneyLost: 20, refundRequested: true, refundStatus: "pending",
      extraDetail: "หยอดเหรียญครบแล้วแต่ไฟหน้าจอไม่ติด เครื่องไม่เริ่มทำงาน เงินไม่คืน",
      detail: "เครื่องรับเหรียญแล้วไฟไม่ติด", createdAt: iso(t2), resolved: false, status: "new", source: "student",
      log: [wcuLogEntry("นิสิตแจ้งปัญหาผ่านหน้าเว็บ · ขอคืนเงิน ฿20", "student", t2)],
    },
    {
      id: "R-seed-3", topic: washer4 ? "เครื่องซักผ้า · เครื่อง 4" : "เครื่องซักผ้า", machineUid: washer4 ? washer4.uid : null,
      machineLabel: washer4 ? "เครื่องซักผ้า 4" : "", studentId: "68019954", issues: ["น้ำรั่วซึม"],
      severity: "unusable", occurredWhen: "after", photos: [wcuSamplePhoto("leak", "No.4")],
      extraDetail: "มีน้ำรั่วซึมออกมาใต้เครื่อง พื้นเปียกลื่น", detail: "ผู้แจ้ง: 68019954 — อาการ: น้ำรั่วซึม",
      adminNote: "สายน้ำเข้าหลุดและกรอบยางเสื่อม เปลี่ยนสายน้ำเข้าใหม่", repairCost: 250, expenseId: "E-seed-3",
      createdAt: iso(t3), startedAt: t3 + 16 * H, resolvedAt: t3 + 20 * H, resolved: true, status: "resolved", source: "student",
      log: [
        wcuLogEntry("นิสิตแจ้งปัญหาผ่านหน้าเว็บ", "student", t3),
        wcuLogEntry("ระบุเครื่อง: เครื่องซักผ้า 4 · เปลี่ยนสถานะเป็น \"กำลังซ่อม\"", "admin", t3 + 16 * H),
        wcuLogEntry("เปลี่ยนสถานะเป็น \"ซ่อมเสร็จ\" · บันทึกค่าซ่อม ฿250", "admin", t3 + 20 * H),
      ],
    },
    {
      id: "R-seed-4", topic: iron3 ? "เตารีด · เครื่อง 3" : "เตารีด", machineUid: iron3 ? iron3.uid : null,
      machineLabel: iron3 ? "เตารีด 3" : "", studentId: "68030117", issues: ["ปลั๊กหลวม / สายชำรุด", "เตารีดไม่ร้อน"],
      severity: "unusable", occurredWhen: "during", photos: [wcuSamplePhoto("iron", "No.3")],
      extraDetail: "ปลั๊กหลวม เสียบแล้วเตารีดไม่ร้อน", detail: "ปลั๊กหลวม เสียบแล้วเตารีดไม่ร้อน",
      adminNote: "เปลี่ยนหัวปลั๊กใหม่ ทดสอบแล้วร้อนปกติ", repairCost: 120, expenseId: "E-seed-8",
      createdAt: iso(t4), startedAt: t4 + 3 * H, resolvedAt: t4 + 5 * H, resolved: true, status: "resolved", source: "student",
      log: [
        wcuLogEntry("นิสิตแจ้งปัญหาผ่านหน้าเว็บ", "student", t4),
        wcuLogEntry("เปลี่ยนสถานะเป็น \"กำลังซ่อม\"", "admin", t4 + 3 * H),
        wcuLogEntry("เปลี่ยนสถานะเป็น \"ซ่อมเสร็จ\" · บันทึกค่าซ่อม ฿120", "admin", t4 + 5 * H),
      ],
    },
  ];
}

/* รูปประกอบของใบแจ้งตัวอย่าง (วาดด้วย SVG ไม่ต้องใช้ไฟล์รูป) */
function wcuSamplePhoto(kind, label) {
  const bg = `<rect width="400" height="300" fill="#dfe7ee"/><rect y="222" width="400" height="78" fill="#b9c6d2"/>`;
  let body;
  if (kind === "iron") {
    body = `<rect x="50" y="206" width="300" height="14" rx="7" fill="#8d99ae"/>
      <path d="M100 200h180a72 72 0 0 0-72-72H100z" fill="#fff" stroke="#1c2b52" stroke-width="6" stroke-linejoin="round"/>
      <path d="M118 128v-24c0-20 96-20 96 24" fill="none" stroke="#1c2b52" stroke-width="6" stroke-linecap="round"/>
      <path d="M280 176c44 0 46 34 76 34" fill="none" stroke="#1c2b52" stroke-width="5"/>
      <rect x="346" y="192" width="28" height="30" rx="5" fill="#e2534a"/><path d="M352 188v-8M368 188v-8" stroke="#1c2b52" stroke-width="4"/>
      <rect x="150" y="150" width="54" height="22" rx="5" fill="#ffd166" stroke="#1c2b52" stroke-width="3"/>
      <text x="177" y="166" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="#1c2b52">${label}</text>`;
  } else {
    body = `<rect x="110" y="36" width="180" height="204" rx="18" fill="#fff" stroke="#1c2b52" stroke-width="6"/>
      <line x1="110" y1="80" x2="290" y2="80" stroke="#1c2b52" stroke-width="5"/>
      <circle cx="132" cy="58" r="6" fill="#1c2b52"/><circle cx="152" cy="58" r="6" fill="#1c2b52"/>
      <circle cx="200" cy="160" r="54" fill="#dff3fa" stroke="#1c2b52" stroke-width="6"/>
      <circle cx="200" cy="160" r="36" fill="#8fd3f4"/>
      <rect x="226" y="48" width="54" height="22" rx="5" fill="#ffd166" stroke="#1c2b52" stroke-width="3"/>
      <text x="253" y="64" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="#1c2b52">${label}</text>
      ${kind === "leak" ? `<ellipse cx="200" cy="262" rx="140" ry="18" fill="#8fd3f4" opacity=".85"/><path d="M160 244q4-12 8 0a4 4 0 0 1-8 0z" fill="#2bb8d6"/>` : ""}
      ${kind === "noise" ? `<path d="M312 112q14 22 0 44M330 98q26 36 0 72M88 112q-14 22 0 44M70 98q-26 36 0 72" fill="none" stroke="#e2534a" stroke-width="5" stroke-linecap="round"/>` : ""}`;
  }
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">${bg}${body}</svg>`);
}

/* ใบแจ้งตัวอย่างที่ยังไม่มีใครแก้ไข: เปลี่ยนเป็นชุดใหม่ที่มีข้อมูลละเอียดขึ้น (รูป, ความรุนแรง, ขอคืนเงิน, ประวัติ) */
function wcuRefreshSampleReports() {
  const fresh = wcuSampleReports();
  const reports = wcuGet(WCU_KEYS.reports).map((r) => {
    const sample = fresh.find((f) => f.id === r.id);
    if (!sample) return r;
    if (!r.updatedAt) return sample;
    const merged = { ...r };
    ["severity", "occurredWhen", "photos", "contact", "log"].forEach((k) => { if (merged[k] === undefined) merged[k] = sample[k]; });
    return merged;
  });
  wcuSet(WCU_KEYS.reports, reports);
}

/* แทนที่ใบแจ้งตัวอย่างชุดเก่า (ลงวันที่ มิ.ย. และไม่มีข้อมูลเครื่อง) — เฉพาะใบที่ยังไม่มีใครแก้ไข */
function wcuUpgradeSampleReports() {
  const oldSeedDetails = ["ตรวจสอบเครื่องซัก : เครื่องเสียงดังตอนซัก", "เครื่องรับเหรียญแล้วไฟไม่ติด", "ปลั๊กหลวม เสียบแล้วเตารีดไม่ร้อน"];
  const reports = wcuGet(WCU_KEYS.reports);
  const isOldSeed = (r) => oldSeedDetails.includes(r.detail) && !r.updatedAt && !r.status && !r.machineUid && /^2026-06-03T/.test(String(r.createdAt));
  if (!reports.some(isOldSeed)) return;
  wcuSet(WCU_KEYS.reports, reports.filter((r) => !isOldSeed(r)).concat(wcuSampleReports()));
}

/*
 * ประวัติการใช้งานตัวอย่าง (ครั้งแรกที่เปิดระบบเท่านั้น)
 * ใช้สูตรเดียวกับตัวเลขที่หน้ารายรับเคยแสดง เพื่อให้หน้าตาเริ่มต้นเหมือนเดิม
 * แต่ต่อจากนี้ข้อมูลจะถูกบันทึกจริงและไม่รีเซ็ตเมื่อรีเฟรชหน้า
 */
function wcuSeedUsageIfEmpty() {
  if (localStorage.getItem(WCU_KEYS.usage)) return;
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const usage = [];
  wcuGetMachines().forEach((m) => {
    const idNum = parseInt(String(m.id).replace(/\D/g, ""), 10) || 1;
    const count = idNum * 3 + (idNum % 5);
    for (let i = 0; i < count; i++) {
      usage.push({
        id: `U-seed-${m.uid}-${i}`,
        uid: m.uid,
        category: m.category,
        machineId: String(m.id),
        amount: wcuMachinePrice(m),
        at: now - Math.round(((i + 1) * 30 * DAY) / (count + 1)),
      });
    }
  });
  wcuSet(WCU_KEYS.usage, usage);
}

/*
 * กระจายเวลาของประวัติตัวอย่างให้เหมือนการใช้งานจริง (ย้อนหลัง 60 วัน,
 * คนใช้เยอะช่วงเช้าและหัวค่ำ, วันหยุดคึกคักกว่า) — จำนวนครั้งและยอดเงินเท่าเดิม
 * แก้เฉพาะรายการตัวอย่าง (id ขึ้นต้น U-seed-) ไม่ยุ่งกับข้อมูลจริง
 */
const WCU_HOUR_WEIGHTS = [0.6, 0.3, 0.2, 0.1, 0.1, 0.3, 1.2, 2.6, 3, 1.8, 1.3, 1.3, 1.8, 1.6, 1.3, 1.6, 2.4, 3.8, 5.2, 6, 5, 3.8, 2.6, 1.4];

function wcuHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function wcuRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function wcuRetimeSeedUsage() {
  const usage = wcuGetUsage();
  if (!usage.some((u) => String(u.id).startsWith("U-seed-"))) return;
  const now = Date.now();
  const rand = wcuRandom(wcuHash("washnclean-seed"));
  const totalWeight = WCU_HOUR_WEIGHTS.reduce((a, b) => a + b, 0);
  const pickHour = () => {
    let r = rand() * totalWeight;
    for (let h = 0; h < 24; h++) { r -= WCU_HOUR_WEIGHTS[h]; if (r <= 0) return h; }
    return 19;
  };
  usage.forEach((u) => {
    if (!String(u.id).startsWith("U-seed-")) return;
    let at = null;
    for (let tries = 0; tries < 30 && at === null; tries++) {
      const day = new Date(now);
      day.setDate(day.getDate() - Math.floor(Math.pow(rand(), 1.2) * 60));
      const weekend = day.getDay() === 0 || day.getDay() === 6;
      if (!weekend && rand() < 0.2) continue;
      day.setHours(pickHour(), Math.floor(rand() * 60), Math.floor(rand() * 60), 0);
      if (day.getTime() <= now - 60 * 1000) at = day.getTime();
    }
    u.at = at === null ? now - 24 * 60 * 60 * 1000 : at;
  });
  wcuSet(WCU_KEYS.usage, usage);
}

/* รายจ่ายตัวอย่าง (ครั้งแรกเท่านั้น) — ย้อนหลังประมาณ 2 รอบบิล */
function wcuSeedExpensesIfEmpty() {
  if (localStorage.getItem(WCU_KEYS.expenses)) return;
  const findMachine = (category, id) => wcuGetMachines(category).find((m) => String(m.id) === id);
  const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return wcuDateKey(d.getTime()); };
  const seed = [
    [2, "electricity", 142, "ค่าไฟฟ้าห้องซักรีด (รอบบิลล่าสุด)"],
    [3, "water", 56, "ค่าน้ำประปาห้องซักรีด (รอบบิลล่าสุด)"],
    [7, "cleaning", 65, "น้ำยาล้างถังเครื่องซักผ้า"],
    [12, "repair", 250, "เปลี่ยนสายน้ำเข้า เครื่องรั่วซึม", findMachine("washer", "4")],
    [20, "repair", 89, "ปลั๊กพ่วง 4 ช่องสำหรับมุมเตารีด"],
    [32, "electricity", 118, "ค่าไฟฟ้าห้องซักรีด (รอบบิลก่อน)"],
    [33, "water", 48, "ค่าน้ำประปาห้องซักรีด (รอบบิลก่อน)"],
    [38, "cleaning", 65, "น้ำยาล้างถังเครื่องซักผ้า"],
    [41, "repair", 120, "เปลี่ยนหัวปลั๊ก (ปลั๊กหลวม ไม่ร้อน)", findMachine("iron", "3")],
    [45, "other", 40, "พิมพ์ป้ายวิธีใช้เครื่อง"],
  ];
  const expenses = seed.map(([n, category, amount, note, machine], i) =>
    wcuNormalizeExpense({
      id: `E-seed-${i}`,
      category,
      amount,
      date: daysAgo(n),
      machineUid: machine ? machine.uid : null,
      note,
      createdAt: Date.now() - n * 24 * 60 * 60 * 1000,
    })
  );
  wcuSet(WCU_KEYS.expenses, expenses);
}

/* ---------- generic read / write ---------- */

function wcuGet(key) {
  // ข้อมูลเสีย (เช่นแก้มือใน DevTools ผิด) ต้องไม่ทำทั้งเว็บพัง
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch (err) {
    console.warn(`[wcu] ข้อมูล ${key} อ่านไม่ได้ ใช้ค่าว่างแทน`, err);
    return [];
  }
}
function wcuSet(key, value) {
  const prev = localStorage.getItem(key);
  localStorage.setItem(key, JSON.stringify(value));
  // โหมด Firebase: ส่งเฉพาะส่วนที่เปลี่ยนขึ้นฐานข้อมูล (ดู firebase-sync.js)
  if (typeof window !== "undefined" && typeof window.wcuCloudPush === "function") window.wcuCloudPush(key, value, prev);
}

/* ---------- machines ---------- */

function wcuGetMachines(category) {
  const all = wcuGet(WCU_KEYS.machines);
  return category ? all.filter((m) => m.category === category) : all;
}

function wcuAddMachine(machine) {
  const machines = wcuGet(WCU_KEYS.machines);
  machine.uid = wcuNewId(machine.category[0]);
  machines.push(machine);
  wcuSet(WCU_KEYS.machines, machines);
}

function wcuDeleteMachine(uid) {
  const machines = wcuGet(WCU_KEYS.machines).filter((m) => m.uid !== uid);
  wcuSet(WCU_KEYS.machines, machines);
}

function wcuSetMachineStatus(uid, status) {
  const machines = wcuGet(WCU_KEYS.machines).map((m) => {
    if (m.uid !== uid) return m;
    // เครื่องที่มีใบแจ้งซ่อมค้าง (needsRepair) ห้ามกลับเป็น "ว่าง" เช่น แอดมินกดหยุดทำงาน / ถอดปลั๊กเตารีด
    const target = status === "available" && m.needsRepair ? "broken" : status;
    const next = { ...m, status: target, startedAt: target === "busy" ? wcuNow() : null };
    if (target !== "busy") delete next.needsRepair;
    return next;
  });
  wcuSet(WCU_KEYS.machines, machines);
}

/* ติดธงให้เครื่องที่กำลังซักอยู่: ซักเสร็จแล้วต้องไปเป็น "มีปัญหา" (มีใบแจ้งซ่อมค้าง)
   เก็บไว้ที่ตัวเครื่อง เพราะหน้า demo / หน้านิสิตในโหมด Firebase มองไม่เห็นใบแจ้งซ่อมทั้งหมด */
function wcuSetNeedsRepair(uid, value) {
  const machines = wcuGet(WCU_KEYS.machines).map((m) => {
    if (m.uid !== uid) return m;
    const next = { ...m };
    if (value) next.needsRepair = true; else delete next.needsRepair;
    return next;
  });
  wcuSet(WCU_KEYS.machines, machines);
}

function wcuSetMachinePrice(uid, price) {
  const machines = wcuGet(WCU_KEYS.machines).map((m) => (m.uid === uid ? { ...m, price } : m));
  wcuSet(WCU_KEYS.machines, machines);
}

/* ราคาต่อครั้งที่ใช้คิดเงินจริง: เตารีดให้บริการฟรี, เครื่องซักที่ไม่ได้ตั้งราคาใช้ 20 บาท
   (ใช้ ?? แทน || เพื่อให้ตั้งราคา 0 บาทได้จริง ไม่ถูกเด้งกลับเป็น 20) */
function wcuMachinePrice(machine) {
  if (!machine || machine.category === "iron") return 0;
  if (machine.price === undefined || machine.price === null || machine.price === "") return 20;
  const price = Number(machine.price);
  return Number.isFinite(price) && price > 0 ? price : 0;
}

/* ---------- usage / revenue ledger ---------- */

function wcuGetUsage() {
  return wcuGet(WCU_KEYS.usage);
}

/* บันทึกการใช้งาน 1 ครั้ง (เรียกตอนหยอดเหรียญครบ / เสียบปลั๊กเตารีด)
   เก็บราคา ณ เวลานั้นไว้ในรายการ แก้ราคาภายหลังจึงไม่ย้อนไปเปลี่ยนรายรับเก่า */
function wcuRecordUsage(uid, amount) {
  const machine = wcuGetMachines().find((m) => m.uid === uid);
  if (!machine) return null;
  const paid = Number(amount);
  const record = {
    id: wcuNewId("U"),
    uid: machine.uid,
    category: machine.category,
    machineId: String(machine.id),
    amount: amount !== undefined && Number.isFinite(paid) && paid >= 0 ? paid : wcuMachinePrice(machine),
    status: "done",
    source: "demo",
    at: Date.now(),
  };
  const usage = wcuGetUsage();
  usage.push(record);
  wcuSet(WCU_KEYS.usage, usage);
  return record;
}

/* สรุปจำนวนครั้ง + รายรับสะสมของแต่ละเครื่อง (key = uid)
   รวมเครื่องที่ถูกลบไปแล้วด้วย เพื่อให้ยอดรวมไม่หายตามเครื่อง */
function wcuGetUsageStats() {
  const stats = {};
  wcuGetUsage().forEach((u) => {
    if (!u || !u.uid) return;
    const s = stats[u.uid] || (stats[u.uid] = { usageCount: 0, revenue: 0, pending: 0, category: u.category, machineId: u.machineId });
    const amount = Math.max(0, Number(u.amount) || 0);
    s.revenue += amount; // เงินที่หยอดแล้วนับเป็นรายรับทันที แม้ยังไม่ครบราคา
    if (wcuIsCompletedUse(u)) s.usageCount += 1;
    else s.pending += amount;
    if (u.category) s.category = u.category;
    if (u.machineId !== undefined) s.machineId = u.machineId;
  });
  return stats;
}

/* ---------- กล่องหยอดเหรียญ (หน้า demo) ----------
 * หยอด 1 เหรียญ = เงินเข้ารายรับทันที (เก็บเป็น "รอบที่ยังจ่ายไม่ครบ" status: "pending")
 * หยอดครบราคา = รอบนั้นเปลี่ยนเป็น "done" และเครื่องเริ่มทำงาน
 * เหรียญที่หยอดค้างไว้ถูกเก็บใน localStorage จึงไม่หายตอนรีเฟรชหน้า
 */
const WCU_COIN_VALUE = 10;

function wcuIsCompletedUse(u) {
  return !u || u.status !== "pending";
}
function wcuIsSampleRecord(record) {
  return /^[UE]-seed-/.test(String(record && record.id));
}

function wcuGetPendingSession(uid) {
  return wcuGetUsage().find((u) => u.uid === uid && u.status === "pending") || null;
}

function wcuInsertCoin(uid, coin = WCU_COIN_VALUE) {
  const machine = wcuGetMachines().find((m) => m.uid === uid);
  if (!machine) return { ok: false, reason: "ไม่พบเครื่อง" };
  if (machine.category !== "washer") return { ok: false, reason: "เตารีดไม่ต้องหยอดเหรียญ" };
  if (machine.status !== "available") return { ok: false, reason: "เครื่องไม่ว่าง" };

  const price = wcuMachinePrice(machine);
  const usage = wcuGetUsage();
  const now = Date.now();
  let session = usage.find((u) => u.uid === uid && u.status === "pending");
  if (!session) {
    session = { id: wcuNewId("U"), uid, category: "washer", machineId: String(machine.id), amount: 0, coins: 0, status: "pending", source: "demo", at: now };
    usage.push(session);
  }
  if (price > 0) {
    session.amount = (Number(session.amount) || 0) + coin;
    session.coins = (Number(session.coins) || 0) + 1;
  }
  session.price = price;
  session.machineId = String(machine.id);
  session.lastCoinAt = now;

  const started = session.amount >= price;
  if (started) {
    session.status = "done";
    session.paidAt = now;
  }
  wcuSet(WCU_KEYS.usage, usage);
  if (started) wcuSetMachineStatus(uid, "busy");
  return { ok: true, started, paid: session.amount, price, coin: price > 0 ? coin : 0, session };
}

/* เวลาซักที่ตั้งไว้ (นาที) — ใช้ค่าเดียวกับหน้าแอดมิน/นักศึกษา */
function wcuMachineDurationMs(machine) {
  return (Number(machine.duration) || 60) * 60 * 1000;
}

/* ซักเสร็จแล้วเครื่องควรเป็นสถานะอะไร: ถ้ามีใบแจ้งซ่อมค้างอยู่ต้องกลับไป "มีปัญหา" ไม่ใช่ "ว่าง" */
function wcuStatusAfterWash(uid) {
  const machine = wcuGetMachines().find((m) => m.uid === uid);
  if (machine && machine.needsRepair) return "broken";
  return wcuGet(WCU_KEYS.reports).some((r) => r.machineUid === uid && !r.resolved) ? "broken" : "available";
}

/* เครื่องซักที่ครบเวลาแล้วให้กลับเป็น "ว่าง" (หน้า demo เปิดทิ้งไว้ก็ทำงานต่อได้) */
function wcuAutoFinishWashes() {
  let changed = false;
  const now = wcuNow();
  const machines = wcuGetMachines().map((m) => {
    if (m.category === "washer" && m.status === "busy" && m.startedAt && now - Number(m.startedAt) >= wcuMachineDurationMs(m)) {
      changed = true;
      const next = { ...m, status: wcuStatusAfterWash(m.uid), startedAt: null };
      delete next.needsRepair;
      return next;
    }
    return m;
  });
  if (changed) wcuSet(WCU_KEYS.machines, machines);
  return changed;
}

/* จบการซักทันที (ปุ่มข้ามเวลาในหน้า demo) */
function wcuFinishWash(uid) {
  const machine = wcuGetMachines().find((m) => m.uid === uid);
  if (!machine || machine.status !== "busy") return false;
  wcuSetMachineStatus(uid, wcuStatusAfterWash(uid));
  return true;
}

/* ข้อมูลตัวอย่างที่ระบบสร้างให้ตอนเปิดครั้งแรก (แยกจากข้อมูลจริงได้ด้วย id) */
function wcuGetSampleSummary() {
  const usage = wcuGetUsage().filter(wcuIsSampleRecord);
  const expenses = wcuGetExpenses().filter(wcuIsSampleRecord);
  const sum = (list) => list.reduce((a, x) => a + Math.max(0, Number(x.amount) || 0), 0);
  return { usageCount: usage.length, usageAmount: sum(usage), expenseCount: expenses.length, expenseAmount: sum(expenses) };
}
function wcuRemoveSampleData() {
  const removed = wcuGetExpenses().filter(wcuIsSampleRecord).map((e) => e.id);
  wcuSet(WCU_KEYS.usage, wcuGetUsage().filter((u) => !wcuIsSampleRecord(u)));
  wcuSet(WCU_KEYS.expenses, wcuGetExpenses().filter((e) => !wcuIsSampleRecord(e)));
  // ใบแจ้งซ่อมตัวอย่างที่ผูกกับค่าซ่อมตัวอย่าง: ตัดการผูกด้วย ไม่ให้ "ค่าซ่อมรวม" ค้างตัวเลขที่ลบไปแล้ว
  removed.forEach((id) => wcuSyncReportsAfterExpenseChange(id, null, "ลบข้อมูลตัวอย่าง"));
}

/* รายจ่ายที่ผูกกับใบแจ้งซ่อม (ค่าซ่อม / เงินคืนนิสิต) ถูกแก้หรือลบจากหน้ารายจ่าย → อัปเดตใบแจ้งซ่อมให้ตรงกัน
   updated = รายการที่แก้แล้ว หรือ null ถ้าถูกลบ */
function wcuSyncReportsAfterExpenseChange(expenseId, updated, reason = "หน้ารายจ่าย") {
  if (!expenseId) return 0;
  const now = Date.now();
  let count = 0;
  const reports = wcuGet(WCU_KEYS.reports).map((r) => {
    const log = Array.isArray(r.log) ? r.log.slice() : [];
    let next = null;
    if (r.expenseId === expenseId) {
      count += 1;
      if (updated) {
        if (Number(r.repairCost) === updated.amount) return r;
        next = { ...r, repairCost: updated.amount };
        log.push(wcuLogEntry(`แก้ค่าซ่อมเป็น ฿${updated.amount.toLocaleString("th-TH")} (จาก${reason})`, "admin", now));
      } else {
        next = { ...r, repairCost: 0, expenseId: null };
        log.push(wcuLogEntry(`ลบค่าซ่อมออก (จาก${reason})`, "admin", now));
      }
    } else if (r.refundExpenseId === expenseId && !updated) {
      count += 1;
      next = { ...r, refundStatus: "pending", refundedAt: null, refundExpenseId: null };
      log.push(wcuLogEntry(`รายการคืนเงินถูกลบ (จาก${reason}) · คำขอคืนเงินกลับเป็นรอดำเนินการ`, "admin", now));
    }
    return next ? { ...next, log, updatedAt: now } : r;
  });
  if (count) wcuSet(WCU_KEYS.reports, reports);
  return count;
}

/* ---------- expenses ledger ---------- */

function wcuDateKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function wcuMachineLabel(machine) {
  return `${machine.category === "iron" ? "เตารีด" : "เครื่องซักผ้า"} ${machine.id}`;
}

/* ทำให้ข้อมูลรายจ่ายอยู่ในรูปแบบเดียวกันเสมอ (กันเงินติดลบ / วันที่ผิด / หมวดไม่มีจริง) */
function wcuNormalizeExpense(raw, previous) {
  const base = { ...(previous || {}), ...raw };
  const validCategory = WCU_EXPENSE_CATEGORIES.some((c) => c.key === base.category);
  const amount = Math.round(Math.max(0, Number(base.amount) || 0) * 100) / 100;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(base.date)) ? base.date : wcuDateKey(Date.now());
  const machine = base.machineUid ? wcuGetMachines().find((m) => m.uid === base.machineUid) : null;
  return {
    id: base.id || wcuNewId("E"),
    category: validCategory ? base.category : "other",
    amount,
    date,
    machineUid: base.machineUid || null,
    // เก็บชื่อเครื่องไว้ด้วย เผื่อเครื่องถูกลบภายหลังจะยังรู้ว่าจ่ายให้เครื่องไหน
    machineLabel: machine ? wcuMachineLabel(machine) : (base.machineUid ? base.machineLabel || "" : ""),
    note: String(base.note || "").trim().slice(0, 120),
    createdAt: base.createdAt || Date.now(),
    updatedAt: previous ? Date.now() : base.updatedAt || null,
  };
}

function wcuGetExpenses() {
  return wcuGet(WCU_KEYS.expenses);
}
function wcuAddExpense(expense) {
  const record = wcuNormalizeExpense({ ...expense, id: undefined, createdAt: undefined });
  const expenses = wcuGetExpenses();
  expenses.push(record);
  wcuSet(WCU_KEYS.expenses, expenses);
  return record;
}
function wcuUpdateExpense(id, patch) {
  let updated = null;
  const expenses = wcuGetExpenses().map((e) => {
    if (e.id !== id) return e;
    updated = wcuNormalizeExpense({ ...patch, id: e.id, createdAt: e.createdAt }, e);
    return updated;
  });
  wcuSet(WCU_KEYS.expenses, expenses);
  return updated;
}
function wcuDeleteExpense(id) {
  wcuSet(WCU_KEYS.expenses, wcuGetExpenses().filter((e) => e.id !== id));
}

function wcuElapsedLabel(machine) {
  if (machine.status !== "busy" || !machine.startedAt) return "00:00:00";
  const totalSeconds = Math.max(0, Math.floor((wcuNow() - machine.startedAt) / 1000));
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

/* ---------- reports ---------- */

function wcuGetReports() {
  return wcuGet(WCU_KEYS.reports).slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}
function wcuAddReport(report) {
  const reports = wcuGet(WCU_KEYS.reports);
  reports.push(report);
  wcuSet(WCU_KEYS.reports, reports);
}
function wcuDeleteReport(id) {
  wcuSet(WCU_KEYS.reports, wcuGet(WCU_KEYS.reports).filter((r) => r.id !== id));
}
function wcuToggleReportResolved(id) {
  const reports = wcuGet(WCU_KEYS.reports).map((r) => {
    if (r.id !== id) return r;
    const resolved = !r.resolved;
    return { ...r, resolved, status: resolved ? "resolved" : "new", resolvedAt: resolved ? Date.now() : null };
  });
  wcuSet(WCU_KEYS.reports, reports);
}

/* สถานะใบแจ้งซ่อม: new = รอตรวจสอบ, in_progress = กำลังซ่อม, resolved = ซ่อมเสร็จ */
function wcuReportStatus(report) {
  if (!report) return "new";
  if (report.resolved) return "resolved";
  return report.status === "in_progress" ? "in_progress" : "new";
}
function wcuGetReport(id) {
  return wcuGet(WCU_KEYS.reports).find((r) => r.id === id) || null;
}
function wcuUpdateReport(id, patch) {
  let updated = null;
  const reports = wcuGet(WCU_KEYS.reports).map((r) => {
    if (r.id !== id) return r;
    updated = { ...r, ...patch, updatedAt: Date.now() };
    return updated;
  });
  wcuSet(WCU_KEYS.reports, reports);
  return updated;
}
/* รูปทั้งหมดของใบแจ้ง (ใบเก่ามีแค่ photo เดียว ใบใหม่มี photos หลายรูป) */
function wcuReportPhotos(report) {
  if (!report) return [];
  const list = Array.isArray(report.photos) && report.photos.length ? report.photos : report.photo ? [report.photo] : [];
  // รับเฉพาะรูปแบบ data:image/... เท่านั้น (กันข้อมูลแปลกปลอมที่ถูกส่งเข้ามาถูกนำไปใส่ใน <img src>)
  return list.map(wcuResolvePhoto).filter(wcuIsSafePhoto);
}
function wcuIsSafePhoto(src) {
  return typeof src === "string" && (
    /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(src) ||
    /^data:image\/svg\+xml;charset=utf-8,[A-Za-z0-9\-_.!~*'()%]+$/.test(src));
}
/* โหมด Firebase: รูปไม่ได้เก็บใน localStorage (จุได้แค่ ~5MB) แต่เก็บในหน่วยความจำ แคชจึงเก็บเป็นตัวอ้างอิง "wcu-photo|id|ลำดับ" */
function wcuResolvePhoto(src) {
  if (typeof src !== "string" || !src.startsWith("wcu-photo|")) return src;
  const [, id, index] = src.split("|");
  const mem = typeof window !== "undefined" ? window.WCU_PHOTO_MEM : null;
  return (mem && mem[id] && mem[id][Number(index)]) || "";
}

/* ใบแจ้งซ่อมที่ยังไม่ปิดของเครื่องนี้ (ผูกด้วย uid เท่านั้น ไม่เดาจากชื่อ) */
function wcuOpenReportsForMachine(uid) {
  return wcuGetReports().filter((r) => r.machineUid === uid && !r.resolved);
}
function wcuResolveReportsForMachine(uid) {
  const now = Date.now();
  let count = 0;
  const reports = wcuGet(WCU_KEYS.reports).map((r) => {
    if (r.machineUid !== uid || r.resolved) return r;
    count += 1;
    const log = (Array.isArray(r.log) ? r.log : []).concat(wcuLogEntry("เปิดใช้งานเครื่องจากหน้าตั้งค่าเครื่อง · ปิดใบแจ้งเป็น \"ซ่อมเสร็จ\"", "admin", now));
    return { ...r, resolved: true, status: "resolved", resolvedAt: now, startedAt: r.startedAt || now, updatedAt: now, log };
  });
  wcuSet(WCU_KEYS.reports, reports);
  return count;
}

/* ---------- admin auth ---------- */

function wcuCheckAdminLogin(username, password) {
  return wcuGet(WCU_KEYS.admins).find((a) => a.username === username && a.password === password);
}
function wcuSetSession(admin) {
  sessionStorage.setItem(WCU_KEYS.session, JSON.stringify(admin));
}
function wcuGetSession() {
  const raw = sessionStorage.getItem(WCU_KEYS.session);
  return raw ? JSON.parse(raw) : null;
}
function wcuClearSession() {
  sessionStorage.removeItem(WCU_KEYS.session);
}

/* ---------- helpers ---------- */

function wcuNewId(prefix) {
  // เวลา + สุ่ม 6 ตัว (กันรหัสชนกันเมื่อหลายเครื่องบันทึกพร้อมกันในโหมด Firebase)
  let rand = "";
  try {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    rand = Array.from(bytes, (b) => (b % 36).toString(36)).join("");
  } catch (e) {
    rand = Math.random().toString(36).slice(2, 8).padEnd(6, "0");
  }
  return `${prefix}-${Date.now().toString(36)}${rand}`;
}

function wcuFormatDateThai(iso) {
  const d = new Date(iso);
  const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const day = d.getDate();
  const month = months[d.getMonth()];
  const year = String(d.getFullYear() + 543).slice(-2);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day} ${month} ${year}/${hh}:${mm}`;
}

wcuSeedIfEmpty();
