/* Wash & Clean Up — ฟอร์มแจ้งปัญหาการใช้งาน (ฝั่งนักศึกษา)
 * 4 ขั้น: เลือกเครื่อง → อาการ/ความรุนแรง → รูป/รายละเอียด → ผู้แจ้ง → ตรวจสอบก่อนส่ง
 * หลังส่งแล้วติดตามสถานะได้ในส่วน "การแจ้งของฉัน" (อัปเดตเองเมื่อแอดมินดำเนินการ)
 * script.js เรียก: rfOpen(machineUid?) ตอนเปิดหน้า, rfTick() ทุก 1 วินาทีระหว่างเปิดหน้านี้
 */

const RF_LABEL = { washer: "เครื่องซักผ้า", iron: "เตารีด" };
const RF_MAX_PHOTOS = 3;
const RF_COOLDOWN_MIN = 5;
const RF_KEYS = { mine: "wcu:my-reports", studentId: "wcu:student-id", lastReport: "wcu_last_report" };
const RF_STEPS = ["machine", "issue", "photo", "reporter"];
const RF_STATUS = { new: "รอตรวจสอบ", in_progress: "กำลังซ่อม", resolved: "ซ่อมเสร็จ" };

const rf = {
  type: "washer",
  machineUid: "",
  issues: new Set(),
  severity: "",
  when: "",
  lost: false,
  money: 10,
  refund: true,
  photos: [],
  touched: false,
  mineSig: "",
  pickerSig: "",
};

const rfEl = (id) => document.getElementById(id);
const rfEsc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const rfPad = (n) => String(n).padStart(2, "0");
const rfMonths = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
function rfDate(ts) {
  const d = new Date(ts);
  return `${d.getDate()} ${rfMonths[d.getMonth()]} ${String(d.getFullYear() + 543).slice(-2)} · ${rfPad(d.getHours())}:${rfPad(d.getMinutes())} น.`;
}
function rfCode(id) { return `#${String(id).slice(-6).toUpperCase()}`; }
function rfStore(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (e) { return fallback; } }

// 1. เลือกเครื่อง

function rfMachineStatusText(m) {
  if (m.status === "broken") return "มีคนแจ้งแล้ว";
  if (m.status === "busy") return m.category === "iron" ? "เสียบปลั๊กอยู่" : "กำลังใช้งาน";
  return "ว่าง";
}

function rfRenderPicker(force = false) {
  const machines = wcuGetMachines();
  const sig = JSON.stringify(machines.map((m) => [m.uid, m.id, m.category, m.status])) + rf.type + rf.machineUid + wcuLoadingText("");
  if (!force && sig === rf.pickerSig) return;
  rf.pickerSig = sig;

  ["washer", "iron"].forEach((t) => {
    const list = machines.filter((m) => m.category === t);
    rfEl(`rf-count-${t}`).textContent = list.length;
  });
  document.querySelectorAll(".rf-type").forEach((b) => b.classList.toggle("active", b.dataset.type === rf.type));

  const list = machines.filter((m) => m.category === rf.type)
    .sort((a, b) => String(a.id).localeCompare(String(b.id), "th", { numeric: true }));
  const grid = rfEl("rf-machine-grid");
  if (!list.length) {
    grid.innerHTML = `<p class="rf-empty">${wcuLoadingText(`ยังไม่มี${RF_LABEL[rf.type]}ในระบบ`)}</p>`;
    return;
  }
  grid.innerHTML = list.map((m) => {
    const selected = m.uid === rf.machineUid;
    const icon = m.category === "iron" ? WcuIcon.iron("", m.status) : WcuIcon.washer("", m.status);
    return `
      <button type="button" class="rf-machine st-${m.status}${selected ? " selected" : ""}" data-uid="${rfEsc(m.uid)}"
        ${m.status === "broken" ? "disabled" : ""} aria-pressed="${selected}" aria-label="${rfEsc(`${RF_LABEL[m.category]} ${m.id} ${rfMachineStatusText(m)}`)}">
        <span class="rf-machine-check" aria-hidden="true">✓</span>
        <span class="rf-machine-icon">${icon}</span>
        <strong>เครื่อง ${rfEsc(m.id)}</strong>
        <small>${rfMachineStatusText(m)}</small>
      </button>`;
  }).join("");
}

function rfSelectMachine(uid) {
  const m = wcuGetMachines().find((x) => x.uid === uid);
  if (!m || m.status === "broken") return;
  const typeChanged = m.category !== rf.type;
  rf.machineUid = m.uid;
  rf.type = m.category;
  rfEl("fb-machine").value = m.uid;
  if (typeChanged) {
    // อาการของเครื่องซักกับเตารีดไม่เหมือนกัน เก็บไว้เฉพาะข้อที่มีในทั้งสองแบบ
    const allowed = new Set(WCU_ISSUES[rf.type].map((i) => i.value));
    rf.issues = new Set([...rf.issues].filter((i) => allowed.has(i)));
  }
  rfRenderPicker(true);
  rfRenderIssues();
  rfUpdate();
}

// 2. อาการ / ความรุนแรง / เงินที่เสีย

function rfRenderIssues() {
  rfEl("rf-issue-grid").innerHTML = WCU_ISSUES[rf.type].map((i) => {
    const on = rf.issues.has(i.value);
    return `<button type="button" class="rf-issue${on ? " on" : ""}${i.danger ? " danger" : ""}" data-issue="${rfEsc(i.value)}" aria-pressed="${on}">
      <span class="rf-issue-icon tone-${i.tone || "slate"}" aria-hidden="true">${WcuIcon.ui(i.icon)}</span><span>${rfEsc(i.value)}</span></button>`;
  }).join("");
  rfEl("rf-money").hidden = rf.type !== "washer";
}

function rfHasDangerIssue() {
  return WCU_ISSUES[rf.type].some((i) => i.danger && rf.issues.has(i.value));
}

function rfSetSeverity(value) {
  rf.severity = value;
  document.querySelectorAll('input[name="severity"]').forEach((r) => { r.checked = r.value === value; });
}

// 3. รูปถ่าย

function rfCompress(file, maxWidth = 1024, quality = 0.8) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) { reject(new Error("ไม่ใช่ไฟล์รูป")); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("อ่านไฟล์ไม่ได้"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("เปิดรูปนี้ไม่ได้ (ลองเป็น JPG/PNG)"));
      img.onload = () => resolve(rfDrawScaled(img, maxWidth, quality));
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
function rfDrawScaled(img, maxWidth, quality) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const scale = Math.min(1, maxWidth / w);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}
function rfShrinkDataUrl(src, maxWidth, quality) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(rfDrawScaled(img, maxWidth, quality));
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

function rfRenderPhotos() {
  const wrap = rfEl("rf-photos");
  wrap.querySelectorAll(".rf-photo").forEach((el) => el.remove());
  const add = rfEl("rf-photo-add");
  rf.photos.forEach((src, i) => {
    const fig = document.createElement("figure");
    fig.className = "rf-photo";
    fig.innerHTML = `<img src="${src}" alt="รูปที่ ${i + 1}"><button type="button" class="rf-photo-remove" data-remove="${i}" aria-label="ลบรูปที่ ${i + 1}">&times;</button>${i === 0 ? `<span class="rf-photo-main">รูปหลัก</span>` : ""}`;
    wrap.insertBefore(fig, add);
  });
  rfEl("rf-photo-count").textContent = `${rf.photos.length}/${RF_MAX_PHOTOS}`;
  add.hidden = rf.photos.length >= RF_MAX_PHOTOS;
}

// ความคืบหน้า + ตรวจความถูกต้อง

function rfStudentId() { return rfEl("fb-studentid").value.trim(); }

function rfStepState() {
  return {
    machine: !!rf.machineUid && !!wcuGetMachines().find((m) => m.uid === rf.machineUid && m.status !== "broken"),
    issue: rf.issues.size > 0 && !!rf.severity,
    photo: rf.photos.length > 0,
    reporter: /^\d{8}$/.test(rfStudentId()),
  };
}

function rfErrors() {
  const st = rfStepState();
  const errors = {};
  if (!st.machine) errors.machine = rf.machineUid ? "เครื่องนี้มีคนแจ้งซ่อมไปแล้ว กรุณาเลือกเครื่องอื่น" : "กรุณาเลือกเครื่องที่มีปัญหา";
  if (!rf.issues.size) errors.issue = "กรุณาเลือกอาการที่พบอย่างน้อย 1 ข้อ";
  else if (!rf.severity) errors.issue = "กรุณาเลือกระดับความรุนแรง";
  if (!st.photo) errors.photo = "กรุณาแนบรูปหลักฐานอย่างน้อย 1 รูป";
  if (!st.reporter) errors.reporter = rfStudentId() ? "รหัสนิสิตต้องเป็นตัวเลข 8 หลัก" : "กรุณากรอกรหัสนิสิต";
  return errors;
}

function rfUpdate() {
  const st = rfStepState();
  const done = RF_STEPS.filter((k) => st[k]).length;
  document.querySelectorAll("#rf-steps li").forEach((li) => li.classList.toggle("done", !!st[li.dataset.step]));
  document.querySelectorAll(".rf-card[data-step]").forEach((c) => c.classList.toggle("done", !!st[c.dataset.step]));
  rfEl("rf-progress-fill").style.width = `${(done / RF_STEPS.length) * 100}%`;
  rfEl("rf-progress-text").textContent = done === RF_STEPS.length ? "ครบทุกขั้นตอนแล้ว กดส่งได้เลย" : `กรอกแล้ว ${done} จาก ${RF_STEPS.length} ขั้นตอน`;

  rfEl("rf-id-ok").hidden = !st.reporter;
  rfEl("fb-studentid").classList.toggle("valid", st.reporter);
  rfEl("rf-danger").hidden = !(rf.severity === "danger" || rfHasDangerIssue());
  if (!rfEl("rf-danger").hidden) rfUpdateCall();
  rfEl("rf-money-body").hidden = !rf.lost;
  rfEl("rf-money-val").textContent = `฿${rf.money}`;
  rfEl("rf-detail-count").textContent = `${rfEl("fb-detail").value.length}/300`;

  // สรุปสั้นๆ เหนือปุ่มส่ง
  const m = wcuGetMachines().find((x) => x.uid === rf.machineUid);
  const bits = [];
  bits.push(m ? `${RF_LABEL[m.category]} ${m.id}` : "ยังไม่ได้เลือกเครื่อง");
  if (rf.issues.size) bits.push(`${rf.issues.size} อาการ`);
  if (rf.severity) bits.push(WCU_SEVERITY[rf.severity].label);
  if (rf.photos.length) bits.push(`${rf.photos.length} รูป`);
  if (rf.lost && rf.type === "washer") bits.push(`เสียเงิน ฿${rf.money}`);
  rfEl("rf-summary").textContent = bits.join(" · ");

  // ข้อความ error จะแสดงหลังจากกดส่งครั้งแรกแล้วเท่านั้น (ไม่ขึ้นแดงตั้งแต่ยังไม่ได้กรอก)
  if (rf.touched) {
    const errors = rfErrors();
    rfShowErrors(errors, false);
    const status = rfEl("feedback-status");
    const missing = Object.keys(errors).length;
    if (status.classList.contains("error") || missing) {
      status.textContent = missing ? `ยังขาดอีก ${missing} ขั้นตอน` : "";
      status.classList.toggle("error", missing > 0);
    }
  }
}

function rfShowErrors(errors, scroll) {
  RF_STEPS.forEach((k) => {
    const p = document.querySelector(`[data-error-for="${k}"]`);
    p.textContent = errors[k] || "";
    rfEl(`rf-sec-${k}`).classList.toggle("has-error", !!errors[k]);
  });
  const first = RF_STEPS.find((k) => errors[k]);
  if (scroll && first) {
    const sec = rfEl(`rf-sec-${first}`);
    sec.scrollIntoView({ behavior: "smooth", block: "center" });
    sec.classList.remove("shake");
    void sec.offsetWidth;
    sec.classList.add("shake");
  }
}

/* ---------- กันส่งถี่เกินไป ---------- */
let rfCooldownTimer = null;
function rfCooldownLeft() {
  const last = parseInt(localStorage.getItem(RF_KEYS.lastReport), 10);
  if (!last) return 0;
  return Math.max(0, RF_COOLDOWN_MIN * 60 * 1000 - (Date.now() - last));
}
function rfUpdateCooldown() {
  const btn = rfEl("submit-btn");
  const left = rfCooldownLeft();
  const machines = wcuGetMachines();
  const available = machines.some((m) => m.status !== "broken");
  if (left > 0) {
    const secs = Math.ceil(left / 1000);
    btn.disabled = true;
    btn.textContent = `ส่งได้อีกครั้งใน ${Math.floor(secs / 60)}:${rfPad(secs % 60)} นาที`;
    if (!rfCooldownTimer) rfCooldownTimer = setInterval(rfUpdateCooldown, 1000);
    return true;
  }
  if (rfCooldownTimer) { clearInterval(rfCooldownTimer); rfCooldownTimer = null; }
  btn.disabled = !available;
  btn.textContent = available ? "ตรวจสอบและส่งรายงาน" : machines.length ? "ทุกเครื่องมีคนแจ้งซ่อมแล้ว" : wcuLoadingText("ยังไม่มีเครื่องในระบบ");
  return false;
}

// ตรวจสอบก่อนส่ง → ส่ง

function rfOpenReview() {
  const m = wcuGetMachines().find((x) => x.uid === rf.machineUid);
  const icon = m.category === "iron" ? WcuIcon.iron("", m.status) : WcuIcon.washer("", m.status);
  rfEl("rv-machine").innerHTML = `<span class="rv-icon">${icon}</span><div><strong>${rfEsc(`${RF_LABEL[m.category]} ${m.id}`)}</strong><small>สถานะตอนนี้: ${rfMachineStatusText(m)}</small></div>`;
  const rows = [
    ["อาการ", { html: [...rf.issues].map((i) => `<span class="rv-issue">${wcuIssueIcon(i)}${rfEsc(i)}</span>`).join("") }],
    ["ความรุนแรง", WCU_SEVERITY[rf.severity].label],
    ["พบตอน", rf.when ? WCU_OCCURRED[rf.when] : "ไม่ระบุ"],
  ];
  if (rf.type === "washer" && rf.lost) rows.push(["เสียเงิน", `฿${rf.money}${rf.refund ? " · ขอคืนเงิน" : ""}`]);
  const detail = rfEl("fb-detail").value.trim();
  if (detail) rows.push(["รายละเอียด", detail]);
  rows.push(["รหัสนิสิต", rfStudentId()]);
  const contact = rfEl("fb-contact").value.trim();
  if (contact) rows.push(["ติดต่อกลับ", contact]);
  rfEl("rv-list").innerHTML = rows.map(([k, v]) => `<div><dt>${rfEsc(k)}</dt><dd>${v && v.html ? v.html : rfEsc(v).replace(/\n/g, "<br>")}</dd></div>`).join("");
  rfEl("rv-photos").innerHTML = rf.photos.map((src, i) => `<img src="${src}" alt="รูปที่ ${i + 1}">`).join("");
  rfEl("review-modal").hidden = false;
}

async function rfSubmit() {
  const btn = rfEl("review-confirm");
  const machine = wcuGetMachines().find((x) => x.uid === rf.machineUid);
  if (!machine || machine.status === "broken") {
    rfEl("review-modal").hidden = true;
    rf.touched = true;
    rfRenderPicker(true);
    rfShowErrors(rfErrors(), true);
    return;
  }
  btn.disabled = true;
  btn.textContent = "กำลังส่ง...";

  const studentId = rfStudentId();
  const detail = rfEl("fb-detail").value.trim();
  const contact = rfEl("fb-contact").value.trim();
  const issues = [...rf.issues];
  const lost = rf.type === "washer" && rf.lost;
  const now = Date.now();
  const report = {
    id: wcuNewId("R"),
    machineUid: machine.uid,
    machineLabel: `${RF_LABEL[machine.category]} ${machine.id}`,
    topic: `${RF_LABEL[machine.category]} · เครื่อง ${machine.id}`,
    studentId,
    issues,
    severity: rf.severity,
    occurredWhen: rf.when || null,
    moneyLost: lost ? rf.money : 0,
    refundRequested: lost && rf.refund,
    refundStatus: lost && rf.refund ? "pending" : null,
    contact,
    extraDetail: detail,
    photos: rf.photos.slice(), // (ไม่เก็บ photo ซ้ำกับรูปแรกแล้ว เปลืองพื้นที่เป็นเท่าตัว)
    detail: `ผู้แจ้ง: ${studentId} — อาการ: ${issues.join(", ")} ${detail ? "— เพิ่มเติม: " + detail : ""}`,
    createdAt: new Date(now).toISOString(),
    resolved: false,
    status: "new",
    source: "student",
    log: [wcuLogEntry(`นิสิตแจ้งปัญหาผ่านหน้าเว็บ${lost && rf.refund ? ` · ขอคืนเงิน ฿${rf.money}` : ""}`, "student", now)],
  };

  // รูปเก็บใน localStorage (จุได้ราว 5MB): ถ้าเต็ม ลดขนาดรูปแล้วลองใหม่ → เหลือรูปเดียว → แจ้ง error
  let saved = false;
  try { wcuAddReport(report); saved = true; } catch (e) { /* ลองลดขนาด */ }
  if (!saved) {
    try {
      report.photos = await Promise.all(report.photos.map((p) => rfShrinkDataUrl(p, 640, 0.6)));
      wcuAddReport(report); saved = true;
    } catch (e) {
      try { report.photos = report.photos.slice(0, 1); wcuAddReport(report); saved = true; } catch (e2) { /* เต็มจริง */ }
    }
  }
  const resetButton = () => { btn.disabled = false; btn.textContent = "ยืนยันส่งรายงาน"; };
  const fail = (text) => {
    resetButton();
    rfEl("review-modal").hidden = true;
    const status = rfEl("feedback-status");
    status.textContent = text;
    status.classList.add("error");
  };
  if (!saved) {
    fail("พื้นที่เก็บข้อมูลในเครื่องเต็ม ส่งรายงานไม่สำเร็จ กรุณาลบรูปบางรูปแล้วลองใหม่ หรือแจ้งแอดมิน");
    return;
  }

  // โหมด Firebase: รอให้เซิร์ฟเวอร์รับใบแจ้งก่อน ค่อยบอกว่าส่งสำเร็จ
  let cloudNote = "";
  if (typeof wcuCloudWaitForWrites === "function") {
    const result = await wcuCloudWaitForWrites(10000);
    if (result.error) {
      fail(`ส่งรายงานไม่สำเร็จ: ${typeof wcuCloudErrorText === "function" ? wcuCloudErrorText(result.error) : "ลองใหม่อีกครั้ง"}`);
      return;
    }
    if (result.timeout) cloudNote = "สัญญาณอินเทอร์เน็ตอ่อน ระบบจะส่งให้เองเมื่อเชื่อมต่อได้ อย่าเพิ่งปิดหน้านี้";
  }

  // ขั้นตอนหลังบันทึกใบแจ้งแล้ว ห้ามทำให้หน้าค้าง (กดยืนยันซ้ำจะได้ใบแจ้งซ้ำ)
  try {
    // เครื่องที่กำลังซัก/รีดอยู่: ไม่ตัดรอบของคนที่ใช้อยู่ แต่ติดธงให้ปิดใช้งานเองเมื่อจบรอบ
    if (machine.status === "busy") wcuSetNeedsRepair(machine.uid, true);
    else wcuSetMachineStatus(machine.uid, "broken");
  } catch (e) { console.error(e); }
  try {
    localStorage.setItem(RF_KEYS.lastReport, String(now));
    const mine = rfStore(RF_KEYS.mine, []);
    mine.push(report.id);
    localStorage.setItem(RF_KEYS.mine, JSON.stringify(mine.slice(-30)));
    if (rfEl("rf-remember").checked) localStorage.setItem(RF_KEYS.studentId, studentId);
    else localStorage.removeItem(RF_KEYS.studentId);
  } catch (e) { console.error(e); }

  resetButton();
  rfEl("review-modal").hidden = true;
  const busyNote = machine.status === "busy" ? "เครื่องกำลังทำงานอยู่ จะปิดใช้งานเองเมื่อจบรอบนี้" : "";
  rfEl("success-ticket").innerHTML = `
    <span>หมายเลขการแจ้ง</span><strong>${rfEsc(rfCode(report.id))}</strong>
    <small>${rfEsc(`${RF_LABEL[machine.category]} ${machine.id}`)} · สถานะ: รอตรวจสอบ</small>
    ${busyNote ? `<small>${rfEsc(busyNote)}</small>` : ""}
    ${cloudNote ? `<small class="warn">${WcuIcon.ui("alert")} ${rfEsc(cloudNote)}</small>` : ""}`;
  rfEl("success-modal").hidden = false;
  rfReset();
}

function rfReset() {
  rf.machineUid = "";
  rf.issues = new Set();
  rf.severity = "";
  rf.when = "";
  rf.lost = false;
  rf.money = 10;
  rf.refund = true;
  rf.photos = [];
  rf.touched = false;
  rfEl("fb-machine").value = "";
  rfEl("fb-detail").value = "";
  rfEl("fb-contact").value = "";
  rfEl("fb-photo").value = "";
  rfEl("rf-lost").checked = false;
  rfEl("rf-refund").checked = true;
  document.querySelectorAll('input[name="severity"], input[name="when"]').forEach((r) => { r.checked = false; });
  rfEl("feedback-status").textContent = "";
  rfEl("feedback-status").classList.remove("error");
  rfShowErrors({}, false);
  rfRenderPicker(true);
  rfRenderIssues();
  rfRenderPhotos();
  rfUpdate();
  rfUpdateCooldown();
  rfRenderMine(true);
}

// การแจ้งของฉัน (ติดตามสถานะ)

function rfRenderMine(force = false) {
  const ids = new Set(rfStore(RF_KEYS.mine, []));
  const rememberedId = localStorage.getItem(RF_KEYS.studentId) || "";
  const raw = localStorage.getItem(WCU_KEYS.reports) || "";
  const sig = raw.length + "|" + raw.slice(-200) + [...ids].join(",") + rememberedId + Math.floor(Date.now() / 60000);
  if (!force && sig === rf.mineSig) return;
  rf.mineSig = sig;

  const machines = new Map(wcuGetMachines().map((m) => [m.uid, m]));
  const mine = wcuGetReports().filter((r) => ids.has(r.id) || (rememberedId && r.studentId === rememberedId));
  const box = rfEl("rf-mine");
  box.hidden = !mine.length;
  if (!mine.length) return;

  rfEl("rf-mine-list").innerHTML = mine.slice(0, 10).map((r) => {
    const status = wcuReportStatus(r);
    const m = machines.get(r.machineUid);
    const name = m ? `${RF_LABEL[m.category]} ${m.id}` : (r.machineLabel || r.topic || "ไม่ระบุเครื่อง");
    const cat = m ? m.category : (/เตารีด/.test(name) ? "iron" : "washer");
    const icon = cat === "iron" ? WcuIcon.iron() : WcuIcon.washer();
    const stepIdx = { new: 0, in_progress: 1, resolved: 2 }[status];
    const steps = ["แจ้งแล้ว", "กำลังซ่อม", "ซ่อมเสร็จ"].map((t, i) => `<li class="${i <= stepIdx ? "done" : ""}"><span></span>${t}</li>`).join("");
    const refund = r.refundRequested
      ? `<p class="rfm-line">${WcuIcon.ui("cash")} ขอคืนเงิน ฿${Number(r.moneyLost) || 0} · ${r.refundStatus === "refunded" ? "<b class=\"ok\">คืนเงินแล้ว</b>" : r.refundStatus === "rejected" ? "<b class=\"no\">ไม่อนุมัติ</b> (ติดต่อแอดมินได้)" : "รอแอดมินดำเนินการ"}</p>` : "";
    const note = r.adminNote ? `<p class="rfm-note">${WcuIcon.ui("message")} <b>แอดมิน:</b> ${rfEsc(r.adminNote)}</p>` : "";
    const when = status === "resolved" && r.resolvedAt ? ` · เสร็จ ${rfDate(r.resolvedAt)}` : "";
    return `
      <article class="rfm st-${status}">
        <div class="rfm-top">
          <span class="rfm-icon">${icon}</span>
          <div class="rfm-head"><strong>${rfEsc(name)}</strong><small>${rfEsc(rfCode(r.id))} · ${rfEsc(rfDate(r.createdAt))}${rfEsc(when)}</small></div>
          <span class="rfm-pill st-${status}">${RF_STATUS[status]}</span>
        </div>
        <ol class="rfm-track">${steps}</ol>
        <p class="rfm-line">${(Array.isArray(r.issues) ? r.issues : []).map((i) => `<span class="rfm-issue">${wcuIssueIcon(i)}${rfEsc(i)}</span>`).join("") || "ไม่ระบุอาการ"}</p>
        ${refund}${note}
      </article>`;
  }).join("");
}

// API ให้ script.js + ผูก event

function rfOpen(machineUid) {
  const remembered = localStorage.getItem(RF_KEYS.studentId);
  if (remembered && !rfStudentId()) rfEl("fb-studentid").value = remembered;
  if (machineUid) rfSelectMachine(machineUid);
  // เครื่องที่เลือกไว้ถูกแจ้งซ่อมไปแล้วระหว่างนี้ → ยกเลิกการเลือก
  const current = wcuGetMachines().find((m) => m.uid === rf.machineUid);
  if (rf.machineUid && (!current || current.status === "broken")) { rf.machineUid = ""; rfEl("fb-machine").value = ""; }
  rfRenderPicker(true);
  rfRenderIssues();
  rfRenderPhotos();
  rfUpdate();
  rfUpdateCooldown();
  rfRenderMine(true);
}

/* เบอร์แอดมินอาจมาถึงทีหลัง (โหมด Firebase โหลดข้อมูลหลังเปิดหน้า) จึงอัปเดตทุกครั้งที่แสดงกล่องอันตราย */
function rfUpdateCall() {
  const phone = wcuAdminPhone();
  const call = rfEl("rf-call");
  call.hidden = !phone;
  if (!phone) return;
  call.href = `tel:${phone.replace(/[^\d+]/g, "")}`;
  call.textContent = `โทรหาแอดมินทันที ${phone}`;
}

function rfTick() {
  rfRenderPicker(false);
  rfRenderMine(false);
  if (!rfCooldownTimer) rfUpdateCooldown();
}

(function rfBind() {
  rfUpdateCall();
  document.querySelectorAll("[data-ui-icon]").forEach((el) => { el.innerHTML = WcuIcon.ui(el.dataset.uiIcon); });
  document.querySelectorAll(".rf-type-icon").forEach((el) => { el.innerHTML = el.dataset.icon === "iron" ? WcuIcon.iron() : WcuIcon.washer(); });

  document.querySelector(".rf-type-toggle").addEventListener("click", (e) => {
    const b = e.target.closest("[data-type]");
    if (!b || b.dataset.type === rf.type) return;
    rf.type = b.dataset.type;
    const m = wcuGetMachines().find((x) => x.uid === rf.machineUid);
    if (m && m.category !== rf.type) { rf.machineUid = ""; rfEl("fb-machine").value = ""; }
    const allowed = new Set(WCU_ISSUES[rf.type].map((i) => i.value));
    rf.issues = new Set([...rf.issues].filter((i) => allowed.has(i)));
    rfRenderPicker(true);
    rfRenderIssues();
    rfUpdate();
  });
  rfEl("rf-machine-grid").addEventListener("click", (e) => {
    const b = e.target.closest("[data-uid]");
    if (b && !b.disabled) rfSelectMachine(b.dataset.uid);
  });

  rfEl("rf-issue-grid").addEventListener("click", (e) => {
    const b = e.target.closest("[data-issue]");
    if (!b) return;
    const v = b.dataset.issue;
    if (rf.issues.has(v)) rf.issues.delete(v); else rf.issues.add(v);
    // เลือกไฟรั่ว → ตั้งความรุนแรงเป็น "อันตราย" ให้อัตโนมัติ
    if (rfHasDangerIssue()) rfSetSeverity("danger");
    rfRenderIssues();
    rfUpdate();
  });
  document.querySelectorAll('input[name="severity"]').forEach((r) => r.addEventListener("change", () => { rf.severity = r.value; rfUpdate(); }));
  document.querySelectorAll('input[name="when"]').forEach((r) => r.addEventListener("change", () => { rf.when = r.value; rfUpdate(); }));
  rfEl("rf-lost").addEventListener("change", (e) => { rf.lost = e.target.checked; rfUpdate(); });
  rfEl("rf-refund").addEventListener("change", (e) => { rf.refund = e.target.checked; rfUpdate(); });
  rfEl("rf-money-body").addEventListener("click", (e) => {
    const b = e.target.closest("[data-money]");
    if (!b) return;
    rf.money = Math.min(500, Math.max(10, rf.money + Number(b.dataset.money)));
    rfUpdate();
  });

  rfEl("fb-photo").addEventListener("change", async (e) => {
    const files = [...e.target.files].slice(0, RF_MAX_PHOTOS - rf.photos.length);
    const status = rfEl("feedback-status");
    status.textContent = "";
    status.classList.remove("error");
    for (const f of files) {
      try { rf.photos.push(await (wcuCloudEnabled() ? rfCompress(f, 900, 0.72) : rfCompress(f))); }
      catch (err) { status.textContent = err.message; status.classList.add("error"); }
    }
    if (e.target.files.length > files.length) {
      status.textContent = `แนบได้สูงสุด ${RF_MAX_PHOTOS} รูป`;
      status.classList.add("error");
    }
    e.target.value = "";
    rfRenderPhotos();
    rfUpdate();
  });
  rfEl("rf-photos").addEventListener("click", (e) => {
    const b = e.target.closest("[data-remove]");
    if (!b) return;
    e.preventDefault();
    rf.photos.splice(Number(b.dataset.remove), 1);
    rfEl("feedback-status").textContent = "";
    rfEl("feedback-status").classList.remove("error");
    rfRenderPhotos();
    rfUpdate();
  });

  rfEl("fb-detail").addEventListener("input", rfUpdate);
  rfEl("fb-contact").addEventListener("input", rfUpdate);
  rfEl("fb-studentid").addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/\D/g, "").slice(0, 8);
    rfUpdate();
  });

  rfEl("feedback-form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (rfUpdateCooldown()) return;
    rf.touched = true;
    const errors = rfErrors();
    rfShowErrors(errors, true);
    const status = rfEl("feedback-status");
    if (Object.keys(errors).length) {
      status.textContent = `ยังขาดอีก ${Object.keys(errors).length} ขั้นตอน`;
      status.classList.add("error");
      return;
    }
    status.textContent = "";
    status.classList.remove("error");
    rfOpenReview();
  });

  rfEl("review-confirm").addEventListener("click", rfSubmit);
  rfEl("review-back").addEventListener("click", () => { rfEl("review-modal").hidden = true; });
  rfEl("review-close").addEventListener("click", () => { rfEl("review-modal").hidden = true; });
  rfEl("review-modal").addEventListener("click", (e) => { if (e.target.id === "review-modal") rfEl("review-modal").hidden = true; });
})();
