/* Wash & Clean Up — ซิงก์ข้อมูลกับ Firebase (Realtime Database + Authentication)
 * ทุกหน้ายังอ่าน/เขียนข้อมูลผ่าน shared-data.js เหมือนเดิม ไฟล์นี้ทำให้ localStorage
 * กลายเป็น "แคช" ของ Firebase: ข้อมูลใหม่จาก Firebase เขียนลง localStorage แล้วให้หน้าเว็บ
 * ที่รีเฟรชทุก 1 วินาทีแสดงผลเอง ส่วนตอนบันทึก (wcuSet) จะหาเฉพาะส่วนที่เปลี่ยนแล้วส่งขึ้น
 * Firebase ทีละรายการ ทำให้สองเครื่องแก้คนละรายการพร้อมกันไม่ทับกัน
 *
 * สิทธิ์ตามหน้า (ตรงกับ database.rules.json): แอดมินล็อกอินด้วยอีเมล/รหัสผ่านเห็นและแก้ได้
 * ทุกอย่าง ส่วนนิสิตกับหน้า demo ล็อกอินแบบไม่ระบุตัวตน เห็นเครื่องและแจ้งซ่อมได้แต่เห็นแค่
 * ใบแจ้งของตัวเอง
 *
 * ถ้าไม่ได้ตั้งค่าใน firebase-config.js ไฟล์นี้จะไม่ทำอะไรเลย
 */
(function () {
  "use strict";

  if (typeof wcuCloudEnabled !== "function" || !wcuCloudEnabled()) {
    window.WCU_CLOUD = { enabled: false, state: "local" };
    return;
  }

  const CFG = window.WCU_FIREBASE_CONFIG;
  const ADMIN_EMAILS = (window.WCU_ADMIN_EMAILS || []).map((e) => String(e).trim().toLowerCase()).filter(Boolean);
  const PHOTO_REF = "wcu-photo|";
  const SCRIPT_SRC = (document.currentScript && document.currentScript.src) || location.href;
  const SDK_BASE = new URL("vendor/firebase/", SCRIPT_SRC).href;

  const path = location.pathname;
  const MODE = /\/admin\/login(\.html)?$/.test(path) ? "admin-login"
    : /\/admin\//.test(path) ? "admin"
      : /\/demo\//.test(path) ? "demo"
        : /\/student\//.test(path) ? "student" : "other";

  // หน้านิสิต / demo เห็นใบแจ้งซ่อมแค่บางส่วน จึงใช้แคชแยก ไม่ไปทับรายการเต็มของแท็บแอดมินในเบราว์เซอร์เดียวกัน
  if (MODE === "student") WCU_KEYS.reports = "wcu:reports:student";
  if (MODE === "demo") WCU_KEYS.reports = "wcu:reports:demo";

  const natural = (a, b) => String(a ?? "").localeCompare(String(b ?? ""), "th", { numeric: true });
  const ts = (v) => { const t = typeof v === "number" ? v : new Date(v).getTime(); return Number.isFinite(t) ? t : 0; };
  const COLS = {
    machines: {
      key: WCU_KEYS.machines, path: "machines", id: "uid",
      sort: (a, b) => (a.category === b.category ? 0 : a.category === "washer" ? -1 : 1) || natural(a.id, b.id) || natural(a.uid, b.uid),
    },
    reports: { key: WCU_KEYS.reports, path: "reports", id: "id", sort: (a, b) => ts(a.createdAt) - ts(b.createdAt) },
    usage: { key: WCU_KEYS.usage, path: "usage", id: "id", sort: (a, b) => ts(a.at) - ts(b.at) },
    expenses: { key: WCU_KEYS.expenses, path: "expenses", id: "id", sort: (a, b) => natural(a.date, b.date) || ts(a.createdAt) - ts(b.createdAt) },
    admins: { key: WCU_KEYS.admins, path: "admins", id: "adminId", strip: ["password"], sort: (a, b) => natural(a.adminId, b.adminId) },
  };
  const NAME_BY_KEY = {};
  Object.keys(COLS).forEach((n) => { NAME_BY_KEY[COLS[n].key] = n; });

  // แต่ละหน้าฟังข้อมูลอะไร และส่งข้อมูลอะไรขึ้นได้บ้าง
  const SUBS = {
    admin: ["machines", "reports", "usage", "expenses", "admins"],
    demo: ["machines", "usage", "admins"],
    student: ["machines", "admins", "myReports"],
    "admin-login": [], other: [],
  };
  const CAN_PUSH = {
    admin: ["machines", "reports", "usage", "expenses", "admins"],
    demo: ["machines", "usage"],
    student: ["machines", "reports"],
    "admin-login": [], other: [],
  };

  const cloud = window.WCU_CLOUD = {
    enabled: true, mode: MODE, state: "connecting", connected: false,
    user: null, isAdmin: false, ready: false, error: "",
  };
  window.WCU_PHOTO_MEM = window.WCU_PHOTO_MEM || {};

  const ready = {}; // ชุดข้อมูลที่ได้ข้อมูลรอบแรกจาก Firebase แล้ว
  const known = {}; // สถานะล่าสุดบน Firebase: ชื่อชุด → { id: item }
  const queue = []; // งานเขียนที่รอให้ล็อกอินเสร็จก่อน (ใบแจ้งซ่อมของนิสิต)
  const inflight = new Set(); // งานเขียนที่ส่งไปแล้วแต่ Firebase ยังไม่ตอบ → ใช้รอผลใน wcuCloudWaitForWrites()
  let detachers = [];
  let db = null;
  let auth = null;
  let seedChecked = false;
  let seeding = false;
  let lastNotify = 0;
  let authResolve;
  const authReady = new Promise((r) => { authResolve = r; });

  /* ---------------- ล้างแคชเก่าที่ไม่ใช่ของโปรเจกต์นี้ (เช่นข้อมูลตัวอย่างจากโหมดออฟไลน์) ---------------- */
  const MARKER = "wcu:cloud-project";
  const markerValue = `${CFG.projectId || ""}|${CFG.databaseURL}`;
  try {
    if (localStorage.getItem(MARKER) !== markerValue) {
      Object.values(COLS).forEach((c) => localStorage.removeItem(c.key));
      localStorage.setItem(MARKER, markerValue);
    }
  } catch (e) { /* storage ปิดอยู่ */ }

  /* ---------------- เครื่องมือ ---------------- */

  const safeKey = (id) => String(id).replace(/[.#$\[\]\/]/g, "_");

  // รูปแบบข้อมูลที่ Realtime Database เก็บได้: ไม่มี null/undefined/NaN และไม่มีอาร์เรย์หรืออ็อบเจกต์ว่าง
  function prune(v) {
    if (v === null || v === undefined) return undefined;
    if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
    if (typeof v === "string" || typeof v === "boolean") return v;
    if (Array.isArray(v)) {
      const a = v.map(prune).filter((x) => x !== undefined);
      return a.length ? a : undefined;
    }
    if (typeof v === "object") {
      const o = {};
      Object.keys(v).forEach((k) => { const x = prune(v[k]); if (x !== undefined) o[safeKey(k)] = x; });
      return Object.keys(o).length ? o : undefined;
    }
    return undefined;
  }
  function stable(v) {
    if (v === undefined) return "~";
    if (v === null || typeof v !== "object") return JSON.stringify(v);
    if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`;
  }
  const asArray = (v) => (Array.isArray(v) ? v : v && typeof v === "object" ? Object.keys(v).sort(natural).map((k) => v[k]) : []);

  // แปลงรายการให้พร้อมส่งขึ้น Firebase
  function forRemote(name, item) {
    const c = COLS[name];
    let out = { ...item };
    (c.strip || []).forEach((f) => { delete out[f]; });
    if (name === "reports") {
      const photos = asArray(out.photos).map(wcuResolvePhoto).filter((s) => typeof s === "string" && s && !s.startsWith(PHOTO_REF));
      if (photos.length) { out.photos = photos; delete out.photo; } else delete out.photos;
      if (typeof out.photo === "string" && out.photo.startsWith(PHOTO_REF)) {
        const resolved = wcuResolvePhoto(out.photo);
        if (resolved) out.photo = resolved; else delete out.photo;
      }
    }
    out = prune(out) || {};
    return out;
  }

  // แปลงข้อมูลจาก Firebase ลงแคช: รูปใบแจ้งซ่อมเก็บไว้ในหน่วยความจำ (localStorage จุได้แค่ ~5MB)
  function toLocal(name, item) {
    const out = { ...item };
    if (name === "reports") {
      ["issues", "log"].forEach((f) => { if (out[f] && !Array.isArray(out[f])) out[f] = asArray(out[f]); });
      const list = asArray(out.photos).length ? asArray(out.photos) : out.photo ? [out.photo] : [];
      if (list.length) {
        window.WCU_PHOTO_MEM[out.id] = list;
        out.photos = list.map((_, i) => `${PHOTO_REF}${out.id}|${i}`);
        delete out.photo;
      }
    }
    return out;
  }

  function writeCache(key, arr) {
    const json = JSON.stringify(arr);
    try {
      if (localStorage.getItem(key) === json) return;
      localStorage.setItem(key, json);
    } catch (e) {
      console.warn("[wcu-cloud] เขียนแคชไม่สำเร็จ", key, e);
    }
    window.dispatchEvent(new CustomEvent("wcu:cloud-data", { detail: { key } }));
  }

  function notify(title, msg) {
    const now = Date.now();
    if (now - lastNotify < 8000) return;
    lastNotify = now;
    if (typeof showToast === "function") { showToast(title, msg, "error"); return; }
    let el = document.getElementById("wcu-cloud-banner");
    if (!el) {
      el = document.createElement("div");
      el.id = "wcu-cloud-banner";
      el.setAttribute("role", "status");
      el.style.cssText = "position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:9999;max-width:min(420px,calc(100% - 32px));" +
        "background:#1c2b52;color:#fff;border-radius:14px;padding:10px 14px;font-size:0.82rem;line-height:1.45;box-shadow:0 10px 24px rgba(28,43,82,.25);";
      document.body.appendChild(el);
    }
    el.textContent = `${title} — ${msg}`;
    el.hidden = false;
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.hidden = true; }, 6000);
  }

  function fail(title, err) {
    const code = (err && (err.code || err.message)) || String(err);
    cloud.error = code;
    console.error(`[wcu-cloud] ${title}`, err);
    notify(title, wcuCloudErrorText(err));
    setState();
  }

  function setState() {
    cloud.state = cloud.error && (!cloud.connected || !cloud.ready) ? "error" : cloud.connected ? "online" : "connecting";
    document.documentElement.dataset.cloud = cloud.state;
    const chip = document.getElementById("cloud-chip");
    if (chip) {
      const label = { online: "เชื่อมต่อฐานข้อมูลแล้ว", connecting: "กำลังเชื่อมต่อ…", error: "เชื่อมต่อฐานข้อมูลไม่ได้" }[cloud.state];
      chip.hidden = false;
      chip.className = `cloud-chip ${cloud.state}`;
      chip.textContent = label;
      chip.title = cloud.error ? `Firebase: ${cloud.error}` : "Firebase Realtime Database";
    }
    window.dispatchEvent(new CustomEvent("wcu:cloud-state", { detail: { state: cloud.state } }));
  }

  const isAdminUser = (user) => !!(user && !user.isAnonymous && user.email && ADMIN_EMAILS.includes(String(user.email).toLowerCase()));
  const adminSession = (user) => ({ adminId: user.uid, username: user.email, cloud: true });

  /* ---------------- ส่งข้อมูลขึ้น Firebase ---------------- */

  function diffOps(name, prev, next, created) {
    const c = COLS[name];
    const ops = {};
    const byId = (list) => new Map(list.filter((x) => x && x[c.id] !== undefined && x[c.id] !== null && x[c.id] !== "").map((x) => [String(x[c.id]), x]));
    const pm = byId(prev);
    const nm = byId(next);
    pm.forEach((_, id) => { if (!nm.has(id)) ops[`${c.path}/${safeKey(id)}`] = null; });
    nm.forEach((item, id) => {
      const base = `${c.path}/${safeKey(id)}`;
      const n = forRemote(name, item);
      if (!pm.has(id)) {
        if (name === "reports" && !n.ownerUid && cloud.user) n.ownerUid = cloud.user.uid;
        ops[base] = n;
        created.push({ name, id, item: n });
        return;
      }
      const p = forRemote(name, pm.get(id));
      new Set([...Object.keys(n), ...Object.keys(p)]).forEach((f) => {
        if (stable(n[f]) !== stable(p[f])) ops[`${base}/${f}`] = n[f] === undefined ? null : n[f];
      });
    });
    return ops;
  }

  function send(name, ops, created) {
    // ใบแจ้งที่รอคิวตอนยังไม่ได้ล็อกอิน: ใส่เจ้าของตอนส่งจริง (rules บังคับ ownerUid ต้องตรงกับผู้ส่ง)
    if (name === "reports" && cloud.user) {
      created.forEach((x) => {
        const path = `${COLS.reports.path}/${safeKey(x.id)}`;
        if (ops[path] && !ops[path].ownerUid) ops[path].ownerUid = cloud.user.uid;
      });
    }
    const job = db.ref().update(ops).then(() => {
      if (MODE === "student" && name === "reports") {
        created.forEach((x) => {
          // ฟังใหม่หลังเซิร์ฟเวอร์รับแล้ว (ถ้าฟังก่อนใบแจ้งจะถูกปฏิเสธเพราะยังไม่มีอยู่จริง)
          const off = watched.get(x.id);
          if (off) { try { off(); } catch (e) { /* ignore */ } watched.delete(x.id); }
          watchReport(x.id);
        });
      }
      return { ok: true };
    }).catch((err) => {
      fail("บันทึกขึ้นฐานข้อมูลไม่สำเร็จ", err);
      if (MODE === "student" && name === "reports") created.forEach((x) => { delete pendingMine[x.id]; publishMine(); });
      return { error: err };
    });
    inflight.add(job);
    job.finally(() => inflight.delete(job));
    return job;
  }

  // ใช้ตอนส่งใบแจ้ง: รอจนเซิร์ฟเวอร์ตอบ (หรือหมดเวลา) ก่อนบอกนิสิตว่าส่งสำเร็จ
  window.wcuCloudWaitForWrites = function (timeoutMs = 10000) {
    const jobs = [...inflight, ...queue.map((q) => q.waiter)].filter(Boolean);
    if (!jobs.length) return Promise.resolve({ ok: true });
    const all = Promise.all(jobs).then((results) => results.find((r) => r && r.error) || { ok: true });
    const timeout = new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), timeoutMs));
    return Promise.race([all, timeout]);
  };

  // เรียกจาก wcuSet() ใน shared-data.js ทุกครั้งที่หน้าเว็บบันทึกข้อมูล
  window.wcuCloudPush = function (key, next, prevRaw) {
    if (seeding) return;
    const name = NAME_BY_KEY[key];
    if (!name || !CAN_PUSH[MODE].includes(name)) return;
    let prev = [];
    try { prev = JSON.parse(prevRaw || "[]"); } catch (e) { prev = []; }
    const created = [];
    const ops = diffOps(name, Array.isArray(prev) ? prev : [], Array.isArray(next) ? next : [], created);
    if (!Object.keys(ops).length) return;

    // ใบแจ้งใหม่ของนิสิต: แสดงใน "การแจ้งของฉัน" ทันทีระหว่างรอ Firebase ตอบกลับ
    if (MODE === "student" && name === "reports") created.forEach((x) => { pendingMine[x.id] = x.item; });

    if (MODE === "student" && name === "reports") {
      if (db && cloud.user) send(name, ops, created);
      else {
        const job = { name, ops, created };
        job.waiter = new Promise((resolve) => { job.resolve = resolve; });
        queue.push(job);
      }
      return;
    }
    // ข้อมูลชุดอื่นต้องได้ข้อมูลจริงจาก Firebase และยังเชื่อมต่ออยู่ กันแคชเก่าเขียนทับของจริง
    if (!db || !cloud.user || !ready[name] || !cloud.connected) {
      console.info(`[wcu-cloud] ยังไม่พร้อม/ออฟไลน์ ข้ามการบันทึก ${name} (จะใช้ข้อมูลจาก Firebase แทน)`);
      if (MODE === "admin") notify("ยังบันทึกไม่ได้", cloud.connected ? "กำลังโหลดข้อมูลจากฐานข้อมูล รอสักครู่แล้วลองใหม่" : "ขาดการเชื่อมต่ออินเทอร์เน็ต การแก้ไขนี้ยังไม่ถูกบันทึก");
      return;
    }
    send(name, ops, created);
  };

  /* ---------------- รับข้อมูลจาก Firebase ---------------- */

  function applyRemote(name, value) {
    const c = COLS[name];
    const items = Object.values(value || {}).filter((x) => x && typeof x === "object" && x[c.id] !== undefined);
    known[name] = {};
    items.forEach((x) => { known[name][String(x[c.id])] = x; });
    let arr = items.map((x) => toLocal(name, x)).sort(c.sort);
    if (name === "admins") {
      const local = wcuGet(c.key);
      arr = arr.map((a) => {
        const old = local.find((x) => x.adminId === a.adminId);
        return old && old.password ? { ...a, password: old.password } : a;
      });
    }
    writeCache(c.key, arr);
    if (!ready[name]) {
      ready[name] = true;
      afterReady();
    }
  }

  function listen(name) {
    const ref = db.ref(COLS[name].path);
    const cb = (snap) => applyRemote(name, snap.val());
    ref.on("value", cb, (err) => fail(`อ่านข้อมูล "${COLS[name].path}" ไม่ได้`, err));
    detachers.push(() => ref.off("value", cb));
  }

  /* ใบแจ้งของนิสิต: อ่านได้เฉพาะใบที่ตัวเองส่ง (ตาม rules) จึงฟังทีละใบจากรายการ wcu:my-reports */
  const watched = new Map();
  const myData = {};
  const pendingMine = {};
  function myReportIds() {
    try { return (JSON.parse(localStorage.getItem("wcu:my-reports") || "[]") || []).map(String); } catch (e) { return []; }
  }
  function publishMine() {
    Object.keys(pendingMine).forEach((id) => { if (myData[id]) delete pendingMine[id]; });
    const all = { ...pendingMine, ...myData };
    known.reports = { ...myData };
    writeCache(WCU_KEYS.reports, Object.values(all).map((x) => toLocal("reports", x)).sort(COLS.reports.sort));
  }
  function watchReport(id) {
    if (!db || !cloud.user || watched.has(id)) return;
    const ref = db.ref(`reports/${safeKey(id)}`);
    const cb = (snap) => {
      const v = snap.val();
      if (v) myData[id] = v; else delete myData[id];
      publishMine();
    };
    // ไม่มีสิทธิ์อ่าน (เช่นส่งจากเครื่องอื่น / ถูกลบ) → ไม่แสดง
    ref.on("value", cb, () => { delete myData[id]; publishMine(); });
    watched.set(id, () => ref.off("value", cb));
  }
  function syncMyWatches() {
    myReportIds().forEach(watchReport);
  }

  function afterReady() {
    const subs = SUBS[MODE].filter((n) => n !== "myReports");
    if (subs.every((n) => ready[n]) && !cloud.ready) {
      cloud.ready = true;
      cloud.error = "";
      setState();
      window.dispatchEvent(new CustomEvent("wcu:cloud-ready"));
    }
    maybeSeed();
  }

  /* ฐานข้อมูลใหม่เอี่ยม: แอดมินคนแรกที่เข้ามาจะใส่ข้อมูลตั้งต้น (เครื่อง 10 เครื่อง + ข้อมูลตัวอย่าง) ให้ครั้งเดียว */
  function maybeSeed() {
    if (MODE !== "admin" || seedChecked || !SUBS.admin.every((n) => ready[n])) return;
    seedChecked = true;
    // จองสิทธิ์สร้างข้อมูลตั้งต้นแบบ transaction: แอดมิน 2 เครื่องเปิดพร้อมกันจะไม่สร้างซ้ำ
    db.ref("meta/seededAt").transaction((v) => (v ? undefined : Date.now())).then((res) => {
      if (!res || !res.committed) return;
      const hasData = ["machines", "reports", "usage", "expenses"].some((n) => Object.keys(known[n] || {}).length);
      const updates = {};
      if (!hasData) {
        seeding = true;
        try {
          [WCU_KEYS.machines, WCU_KEYS.reports, WCU_KEYS.usage, WCU_KEYS.expenses, WCU_KEYS.seedVersion].forEach((k) => localStorage.removeItem(k));
          if (!Object.keys(known.admins || {}).length) localStorage.removeItem(WCU_KEYS.admins);
          wcuSeedIfEmpty(true);
        } finally {
          seeding = false;
        }
        ["machines", "reports", "usage", "expenses", "admins"].forEach((n) => {
          const c = COLS[n];
          if (n === "admins" && Object.keys(known.admins || {}).length) return;
          wcuGet(c.key).forEach((item) => {
            if (item && item[c.id] !== undefined) updates[`${c.path}/${safeKey(item[c.id])}`] = forRemote(n, item);
          });
        });
      }
      if (!Object.keys(updates).length) return;
      return db.ref().update(updates).then(() => {
        if (!hasData && typeof showToast === "function") {
          showToast("สร้างฐานข้อมูลเริ่มต้นแล้ว", "ใส่เครื่อง 10 เครื่องและข้อมูลตัวอย่างขึ้น Firebase ให้แล้ว", "success");
        }
      });
    }).catch((err) => fail("ตั้งค่าฐานข้อมูลเริ่มต้นไม่สำเร็จ", err));
  }

  function detachAll() {
    detachers.forEach((off) => { try { off(); } catch (e) { /* ignore */ } });
    detachers = [];
    watched.forEach((off) => { try { off(); } catch (e) { /* ignore */ } });
    watched.clear();
    Object.keys(ready).forEach((k) => { delete ready[k]; });
    cloud.ready = false;
  }

  function attach() {
    SUBS[MODE].forEach((n) => { if (n !== "myReports") listen(n); });
    if (SUBS[MODE].includes("myReports")) {
      syncMyWatches();
      publishMine();
      const t = setInterval(syncMyWatches, 1500);
      detachers.push(() => clearInterval(t));
    }
    while (queue.length) {
      const q = queue.shift();
      send(q.name, q.ops, q.created).then((r) => q.resolve && q.resolve(r));
    }
  }

  /* ---------------- ล็อกอิน ---------------- */

  let everHadUser = false;
  function onUser(user) {
    detachAll();
    cloud.user = user || null;
    cloud.isAdmin = isAdminUser(user);
    authResolve(cloud.user);

    if (MODE === "admin-login") {
      if (cloud.isAdmin) {
        wcuSetSession(adminSession(user));
        window.location.replace("dashboard.html");
      }
      return;
    }
    if (MODE === "admin") {
      if (!cloud.isAdmin) {
        wcuClearSession();
        window.location.replace("login.html");
        return;
      }
      const hadSession = !!wcuGetSession();
      wcuSetSession(adminSession(user));
      if (!hadSession) { window.location.reload(); return; }
      attach();
      return;
    }
    if (!user) {
      // นิสิต/หน้า demo ไม่ต้องสมัครสมาชิก: ใช้บัญชีไม่ระบุตัวตนของเบราว์เซอร์นี้
      signInAnon();
      if (everHadUser) console.info("[wcu-cloud] ออกจากระบบแล้ว สร้างบัญชีไม่ระบุตัวตนใหม่");
      return;
    }
    everHadUser = true;
    attach();
  }

  // ล็อกอินไม่ระบุตัวตนไม่สำเร็จ (เช่นเปิดครั้งแรกตอนไม่มีเน็ต) → ลองใหม่เรื่อยๆ และทันทีที่กลับมาออนไลน์
  let anonTimer = null;
  let anonDelay = 2000;
  function signInAnon() {
    clearTimeout(anonTimer);
    if (!auth || auth.currentUser) return;
    auth.signInAnonymously().then(() => { anonDelay = 2000; }).catch((err) => {
      fail("เข้าใช้งานฐานข้อมูลไม่ได้", err);
      anonTimer = setTimeout(signInAnon, anonDelay);
      anonDelay = Math.min(anonDelay * 2, 60000);
    });
  }
  window.addEventListener("online", () => { if (MODE === "student" || MODE === "demo") signInAnon(); });

  function toEmail(username) {
    const u = String(username || "").trim().toLowerCase();
    if (u.includes("@")) return u;
    const match = ADMIN_EMAILS.find((e) => e.split("@")[0] === u);
    if (match) return match;
    const domain = (ADMIN_EMAILS[0] || "admin@washnclean.app").split("@")[1];
    return `${u}@${domain}`;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = false;
      s.onload = resolve;
      s.onerror = () => reject(new Error(`โหลดไฟล์ไม่ได้: ${src}`));
      document.head.appendChild(s);
    });
  }

  const sdkReady = loadScript(`${SDK_BASE}firebase-app-compat.js`)
    .then(() => Promise.all([loadScript(`${SDK_BASE}firebase-auth-compat.js`), loadScript(`${SDK_BASE}firebase-database-compat.js`)]))
    .then(() => {
      const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(CFG);
      auth = firebase.auth(app);
      db = firebase.database(app);
      db.ref(".info/connected").on("value", (snap) => {
        cloud.connected = !!snap.val();
        if (cloud.connected && cloud.ready) cloud.error = "";
        setState();
      });
      // นาฬิกาเซิร์ฟเวอร์ → ใช้กับเวลานับถอยหลัง/เวลาเริ่มซัก (wcuNow ใน shared-data.js)
      db.ref(".info/serverTimeOffset").on("value", (snap) => { window.WCU_TIME_OFFSET = Number(snap.val()) || 0; });
      // โหลดไม่เสร็จใน 15 วินาที (เช่น databaseURL ผิด / Rules ไม่อนุญาต) → บอกให้ชัด แทนที่จะขึ้น "กำลังโหลด" ตลอด
      setTimeout(() => {
        if (cloud.ready || MODE === "admin-login" || MODE === "other") return;
        if (!cloud.error) cloud.error = "timeout";
        setState();
        notify("เชื่อมต่อฐานข้อมูลไม่ได้", wcuCloudErrorText({ code: "timeout" }));
      }, 15000);
      auth.onAuthStateChanged(onUser);
    });
  sdkReady.catch((err) => {
    fail("โหลด Firebase ไม่สำเร็จ", err);
    authResolve(null);
    if (MODE === "admin" && !wcuGetSession()) window.location.replace("login.html");
  });

  /* ---------------- ฟังก์ชันให้หน้าอื่นเรียกใช้ ---------------- */

  window.wcuCloudUid = () => (cloud.user ? cloud.user.uid : null);
  window.wcuCloudAuthReady = () => authReady;
  window.wcuCloudAdminLogin = function (username, password) {
    return sdkReady.then(() => auth.signInWithEmailAndPassword(toEmail(username), wcuCloudPassword(password))).then((cred) => {
      if (!isAdminUser(cred.user)) {
        return auth.signOut().then(() => {
          const e = new Error("not-admin");
          e.code = "wcu/not-admin";
          throw e;
        });
      }
      const session = adminSession(cred.user);
      wcuSetSession(session);
      return session;
    });
  };
  window.wcuCloudSignOut = () => sdkReady.then(() => auth.signOut());

  document.addEventListener("DOMContentLoaded", setState);
  setState();
})();

/* Firebase บังคับรหัสผ่านอย่างน้อย 6 ตัว: รหัสที่สั้นกว่านั้น (เช่น "admin") จะถูกต่อท้ายด้วย "-wcu" ก่อนส่ง
   → พิมพ์ admin ในหน้าเข้าสู่ระบบ = รหัส admin-wcu ใน Firebase Authentication (รหัสยาว 6 ตัวขึ้นไปส่งตามที่พิมพ์) */
const WCU_SHORT_PASSWORD_SUFFIX = "-wcu";
function wcuCloudPassword(password) {
  const p = String(password || "");
  return p.length < 6 ? p + WCU_SHORT_PASSWORD_SUFFIX : p;
}

/* ข้อความ error ภาษาไทยที่เข้าใจง่าย */
function wcuCloudErrorText(err) {
  const code = String((err && (err.code || err.message)) || err || "");
  if (/wcu\/not-admin/.test(code)) return "บัญชีนี้ไม่ใช่บัญชีแอดมิน";
  if (/invalid-credential|wrong-password|user-not-found|invalid-email|invalid-login/.test(code)) return "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง";
  if (/too-many-requests/.test(code)) return "ลองผิดหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่";
  if (/network-request-failed|โหลดไฟล์ไม่ได้/.test(code)) return "เชื่อมต่ออินเทอร์เน็ตไม่ได้ กรุณาลองใหม่";
  if (/operation-not-allowed|admin-restricted-operation/.test(code)) return "ยังไม่ได้เปิดวิธีล็อกอินนี้ใน Firebase Authentication (Email/Password และ Anonymous)";
  if (/PERMISSION_DENIED|permission[_-]denied/i.test(code)) return "ไม่มีสิทธิ์เข้าถึงข้อมูล ตรวจสอบ Rules ของ Realtime Database";
  if (/api-key-not-valid|invalid-api-key/.test(code)) return "apiKey ใน firebase-config.js ไม่ถูกต้อง";
  if (/^timeout$/.test(code)) return "โหลดข้อมูลไม่สำเร็จภายใน 15 วินาที ตรวจสอบอินเทอร์เน็ต, databaseURL และ Rules ของ Realtime Database";
  return "เกิดข้อผิดพลาด กรุณาลองใหม่";
}
