/* Wash & Clean Up — หน้ารายรับ / รายจ่าย ของแอดมิน
 * ข้อมูลทั้งหมดมาจาก shared-data.js
 *   wcu:usage     ประวัติการใช้งาน (รายรับ)
 *   wcu:expenses  รายการรายจ่าย
 *   wcu:machines  รายชื่อเครื่อง
 * script_ad.js เรียกใช้: setupFinance(), renderRevenueView(force), renderExpensesView(force)
 * (ใช้ formatBaht / escapeHtml / showToast / setText / CATEGORY_LABEL จาก script_ad.js)
 */

const FIN_DAY = 24 * 60 * 60 * 1000;
const FIN_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const FIN_DOW = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

// สีข้อมูล: โทนเดียวกับธีม (ผ่านการตรวจสีสำหรับผู้มีภาวะตาบอดสีแล้ว)
const FIN_COLORS = { income: "#2bb8d6", expense: "#e8678a", muted: "#cbd5e1" };
const EXPENSE_COLORS = { water: "#2bb8d6", electricity: "#e0930f", repair: "#e8678a", cleaning: "#5a63c4", other: "#b4bfcf" };

const PERIOD_TEXT = { today: "วันนี้", "7d": "7 วันล่าสุด", "30d": "30 วันล่าสุด", all: "ทั้งหมด" };
const PREV_TEXT = { today: "เมื่อวานช่วงเวลาเดียวกัน", "7d": "7 วันก่อนหน้า", "30d": "30 วันก่อนหน้า" };
const TXN_PAGE = 20;

const finState = {
  period: "30d",
  revSort: "id",
  txnLimit: TXN_PAGE,
  expFilter: "all",
  editingExpenseId: null,
  openTables: {},
  sig: { revenue: "", expenses: "" },
};

// Helpers: วันที่ / ตัวเลข

const finPad = (n) => String(n).padStart(2, "0");

function finStartOfDay(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
function finAddDays(ts, n) { const d = new Date(ts); d.setDate(d.getDate() + n); return d.getTime(); }
function finDateKeyToTs(key) {
  const [y, m, d] = String(key).split("-").map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1).getTime();
}
function finDate(ts, opts = {}) {
  const d = new Date(ts);
  let s = `${d.getDate()} ${FIN_MONTHS[d.getMonth()]}`;
  if (opts.year !== false) s += ` ${String(d.getFullYear() + 543).slice(-2)}`;
  if (opts.dow) s = `${FIN_DOW[d.getDay()]} ${s}`;
  return s;
}
function finTime(ts) { const d = new Date(ts); return `${finPad(d.getHours())}:${finPad(d.getMinutes())}`; }
function finMonthLabel(y, m) { return `${FIN_MONTHS[m]} ${String(y + 543).slice(-2)}`; }

function finDayLabel(ts) {
  const today = finStartOfDay(Date.now());
  const day = finStartOfDay(ts);
  if (day === today) return `วันนี้ · ${finDate(ts, { year: false })}`;
  if (day === finAddDays(today, -1)) return `เมื่อวาน · ${finDate(ts, { year: false })}`;
  return finDate(ts, { dow: true });
}

function finRelative(ts) {
  if (!ts) return "";
  const diff = Date.now() - ts;
  if (diff < 60 * 1000) return "เมื่อสักครู่";
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} นาทีที่แล้ว`;
  if (diff < FIN_DAY) return `${Math.floor(diff / 3600000)} ชม.ที่แล้ว`;
  if (diff < 7 * FIN_DAY) return `${Math.floor(diff / FIN_DAY)} วันที่แล้ว`;
  return finDate(ts);
}

function finPercent(part, whole) {
  if (!whole) return 0;
  return (part / whole) * 100;
}
function finPctText(p) {
  if (!p) return "0%";
  return `${p < 10 ? p.toFixed(1).replace(/\.0$/, "") : Math.round(p)}%`;
}

// ตัวเลขแกนกราฟแบบย่อ (฿12k)
function finCompactBaht(v) {
  if (v >= 1e6) return `฿${(v / 1e6).toFixed(v % 1e6 ? 1 : 0)}M`;
  if (v >= 1e4) return `฿${(v / 1e3).toFixed(v % 1e3 ? 1 : 0)}k`;
  return `฿${v.toLocaleString("th-TH")}`;
}

function finSum(list) {
  return list.reduce((a, x) => a + Math.max(0, Number(x.amount) || 0), 0);
}

// เวลาที่เกิดความเคลื่อนไหวล่าสุดของรายการ (เหรียญล่าสุด / จ่ายครบ / ใช้งาน)
function finActivityTs(u) {
  return Number(u.lastCoinAt || u.paidAt || u.at) || 0;
}

/* แถบบอกที่มาของรายรับ + ปุ่มลบข้อมูลตัวอย่าง */
function renderSourceBanner() {
  const sample = wcuGetSampleSummary();
  const hasSample = sample.usageCount > 0 || sample.expenseCount > 0;
  const note = document.getElementById("rev-sample-note");
  const btn = document.getElementById("rev-remove-sample");
  if (!note || !btn) return;
  note.textContent = hasSample
    ? `ตอนนี้มีข้อมูลตัวอย่างปนอยู่: รายรับ ${formatBaht(sample.usageAmount)} (${sample.usageCount} รายการ) · รายจ่าย ${formatBaht(sample.expenseAmount)} (${sample.expenseCount} รายการ)`
    : "ตัวเลขทั้งหมดมาจากการใช้งานจริงในหน้า demo";
  btn.hidden = !hasSample;
}

function askRemoveSampleData() {
  const sample = wcuGetSampleSummary();
  askConfirm({
    title: "ลบข้อมูลตัวอย่าง?",
    desc: `จะลบรายรับตัวอย่าง ${sample.usageCount} รายการ (${formatBaht(sample.usageAmount)}) และรายจ่ายตัวอย่าง ${sample.expenseCount} รายการ (${formatBaht(sample.expenseAmount)}) รายการที่เกิดจากหน้า demo และที่แอดมินเพิ่มเองจะยังอยู่ครบ`,
    okText: "ลบข้อมูลตัวอย่าง",
    onConfirm: () => {
      wcuRemoveSampleData();
      showToast("ลบข้อมูลตัวอย่างแล้ว", "ตอนนี้รายรับมาจากหน้า demo อย่างเดียว", "success");
      renderVisibleFinance(true);
    },
  });
}

function finMachineMap() {
  return new Map(wcuGetMachines().map((m) => [m.uid, m]));
}

// ชื่อเครื่องจาก uid (ถ้าเครื่องถูกลบไปแล้วใช้ชื่อที่บันทึกไว้ตอนใช้งาน)
function finMachineName(uid, snapshotCategory, snapshotId, machineMap) {
  const m = machineMap.get(uid);
  if (m) return { name: `${CATEGORY_LABEL[m.category]} ${m.id}`, short: `เครื่อง ${m.id}`, category: m.category, deleted: false };
  const cat = snapshotCategory === "iron" ? "iron" : "washer";
  const id = snapshotId === undefined || snapshotId === null ? "-" : String(snapshotId);
  return { name: `${CATEGORY_LABEL[cat]} ${id}`, short: `เครื่อง ${id}`, category: cat, deleted: true };
}

// ช่วงเวลา (ตัวกรองด้านบนของทั้งสองหน้า)

function finGetRange(period) {
  const now = Date.now();
  const today = finStartOfDay(now);
  if (period === "today") {
    return { period, start: today, end: now, days: 1, prevStart: finAddDays(today, -1), prevEnd: finAddDays(now, -1) };
  }
  if (period === "7d" || period === "30d") {
    const n = period === "7d" ? 7 : 30;
    const start = finAddDays(today, -(n - 1));
    return { period, start, end: now, days: n, prevStart: finAddDays(start, -n), prevEnd: finAddDays(now, -n) };
  }
  // ทั้งหมด: ตั้งแต่ข้อมูลแรกสุด
  let earliest = today;
  wcuGetUsage().forEach((u) => { if (Number(u.at) < earliest) earliest = Number(u.at); });
  wcuGetExpenses().forEach((e) => { const t = finDateKeyToTs(e.date); if (t < earliest) earliest = t; });
  const start = finStartOfDay(earliest);
  const days = Math.round((today - start) / FIN_DAY) + 1;
  return { period: "all", start, end: now, days, prevStart: null, prevEnd: null };
}

function finRangeCaption(range) {
  if (range.period === "today") return `วันนี้ ${finDate(range.start)} · 00:00–${finTime(range.end)} น.`;
  return `${finDate(range.start)} – ${finDate(range.end)} · ${range.days.toLocaleString("th-TH")} วัน`;
}

function finUsageIn(start, end, usage) {
  return usage.filter((u) => Number(u.at) >= start && Number(u.at) <= end);
}
function finExpensesIn(start, end, expenses) {
  return expenses.filter((e) => { const t = finDateKeyToTs(e.date); return t >= start && t <= end; });
}

// ข้อความเทียบกับช่วงก่อนหน้า (ลูกศร + ตัวเลข ไม่ใช้สีอย่างเดียว)
function finDeltaText(cur, prev, range, noun) {
  if (range.prevStart === null) return "";
  const prevText = PREV_TEXT[range.period];
  if (!prev && !cur) return "";
  if (!prev) return `ใหม่ · ${prevText} ไม่มี${noun}`;
  const pct = ((cur - prev) / prev) * 100;
  if (Math.abs(pct) < 0.5) return `เท่ากับ ${prevText} (${formatBaht(prev)})`;
  return `${pct > 0 ? "▲" : "▼"} ${finPctText(Math.abs(pct))} เทียบกับ ${prevText} (${formatBaht(prev)})`;
}

// กราฟแท่ง (SVG) + tooltip + ตาราง

function finNiceStep(x, integer) {
  if (!(x > 0)) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(x)));
  const f = x / exp;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  const step = nf * exp;
  return integer ? Math.max(1, Math.round(step)) : step;
}

function finLabelEvery(n, plotW, unit) {
  const w = { hour: 22, day: 22, week: 46, month: 40 }[unit] || 30;
  const maxLabels = Math.max(2, Math.floor(plotW / w));
  const every = Math.ceil(n / maxLabels);
  const snaps = unit === "hour" ? [1, 2, 3, 4, 6, 12] : unit === "day" ? [1, 2, 3, 5, 7, 10, 15] : [1, 2, 3, 4, 6, 12];
  return snaps.find((s) => s >= every) || every;
}

/*
 * cfg: { buckets:[{label, full, value}], unit, format(v), tickFormat(v), integer,
 *        colorFor(i, maxIdx), ariaLabel, emptyText }
 */
function finColumnChart(hostId, cfg) {
  const host = document.getElementById(hostId);
  if (!host) return;
  const buckets = cfg.buckets;
  const n = buckets.length;
  const max = buckets.reduce((a, b) => Math.max(a, b.value), 0);
  if (!n || max <= 0) {
    host.innerHTML = `<div class="chart-empty">${escapeHtml(cfg.emptyText)}</div>`;
    host._chart = null;
    return;
  }

  const W = Math.max(240, Math.round(host.clientWidth || 300));
  const H = 184, top = 22, axisH = 22, right = 4;
  const step = finNiceStep(max / 3, cfg.integer);
  const yMax = Math.ceil(max / step) * step;
  const ticks = [];
  for (let t = 0; t <= yMax + step / 1000; t += step) ticks.push(t);
  const tickLabels = ticks.map(cfg.tickFormat);
  const left = Math.max(...tickLabels.map((s) => s.length)) * 6 + 10;
  const plotW = W - left - right;
  const plotH = H - top - axisH;
  const base = top + plotH;
  const slot = plotW / n;
  const bw = Math.max(2, Math.min(24, slot - 2)); // แท่งบางไม่เกิน 24px เว้นช่องไฟ 2px
  const y = (v) => base - (v / yMax) * plotH;
  const every = finLabelEvery(n, plotW, cfg.unit);
  const maxIdx = buckets.findIndex((b) => b.value === max);

  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${escapeHtml(cfg.ariaLabel)}">`;
  ticks.forEach((t, i) => {
    const yy = Math.round(y(t)) + 0.5;
    svg += `<line class="grid" x1="${left}" x2="${W - right}" y1="${yy}" y2="${yy}"/>`;
    svg += `<text class="tick" x="${left - 6}" y="${yy + 3.5}" text-anchor="end">${escapeHtml(tickLabels[i])}</text>`;
  });

  const positions = [];
  buckets.forEach((b, i) => {
    const x = left + i * slot + (slot - bw) / 2;
    const cx = left + i * slot + slot / 2;
    positions.push({ cx, top: b.value > 0 ? y(b.value) : base });
    if (b.value > 0) {
      const yt = y(b.value);
      const r = Math.min(4, bw / 2, base - yt);
      svg += `<path class="bar" data-i="${i}" fill="${cfg.colorFor(i, maxIdx)}" d="M${x},${base}V${yt + r}Q${x},${yt} ${x + r},${yt}H${x + bw - r}Q${x + bw},${yt} ${x + bw},${yt + r}V${base}Z"/>`;
    }
    const showLabel = cfg.unit === "hour" ? i % every === 0 : (n - 1 - i) % every === 0;
    if (showLabel) svg += `<text class="tick" x="${cx}" y="${H - 6}" text-anchor="middle">${escapeHtml(b.label)}</text>`;
  });

  // ป้ายค่าเฉพาะแท่งสูงสุด (ไม่ใส่ตัวเลขทุกแท่ง)
  const px = Math.min(Math.max(positions[maxIdx].cx, left + 18), W - 18);
  svg += `<text class="peak" x="${px}" y="${y(max) - 7}" text-anchor="middle">${escapeHtml(cfg.format(max))}</text>`;

  buckets.forEach((b, i) => {
    svg += `<rect class="hit" data-i="${i}" x="${left + i * slot}" y="${top - 18}" width="${slot}" height="${plotH + 18}" tabindex="0" aria-label="${escapeHtml(`${b.full}: ${cfg.format(b.value)}`)}"/>`;
  });
  svg += `</svg><div class="chart-tip" hidden><strong></strong><span></span></div>`;

  host.innerHTML = svg;
  host._chart = { buckets, positions, format: cfg.format, W };
  finBindChartHover(host);
}

function finBindChartHover(host) {
  if (host.dataset.hoverBound) return;
  host.dataset.hoverBound = "1";

  const hide = () => {
    const tip = host.querySelector(".chart-tip");
    if (tip) tip.hidden = true;
    host.querySelectorAll(".bar.is-hover").forEach((el) => el.classList.remove("is-hover"));
  };
  const show = (hit) => {
    const c = host._chart;
    const tip = host.querySelector(".chart-tip");
    if (!c || !hit || !tip) return;
    const i = Number(hit.dataset.i);
    const b = c.buckets[i];
    const p = c.positions[i];
    tip.querySelector("strong").textContent = c.format(b.value);
    tip.querySelector("span").textContent = b.full;
    tip.hidden = false;
    const half = tip.offsetWidth / 2;
    tip.style.left = `${Math.min(Math.max(p.cx, half), c.W - half)}px`;
    tip.style.top = `${Math.max(p.top - 8, tip.offsetHeight)}px`;
    host.querySelectorAll(".bar.is-hover").forEach((el) => el.classList.remove("is-hover"));
    const bar = host.querySelector(`.bar[data-i="${i}"]`);
    if (bar) bar.classList.add("is-hover");
  };
  const fromEvent = (e) => (e.target && e.target.closest ? e.target.closest(".hit") : null);

  host.addEventListener("pointermove", (e) => { const hit = fromEvent(e); if (hit) show(hit); });
  host.addEventListener("pointerdown", (e) => { const hit = fromEvent(e); if (hit) show(hit); });
  host.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") hide(); });
  host.addEventListener("focusin", (e) => { const hit = fromEvent(e); if (hit) show(hit); });
  host.addEventListener("focusout", hide);
  // จอสัมผัส: แตะที่อื่นเพื่อปิด tooltip
  document.addEventListener("pointerdown", (e) => { if (!host.contains(e.target)) hide(); });
}

function finTable(hostId, headers, rows, totalRow) {
  const host = document.getElementById(hostId);
  if (!host) return;
  const cell = (v, tag = "td") => `<${tag}>${escapeHtml(String(v))}</${tag}>`;
  host.innerHTML = `<table class="data-table">
    <thead><tr>${headers.map((h) => cell(h, "th")).join("")}</tr></thead>
    <tbody>
      ${rows.map((r) => `<tr>${r.map((c) => cell(c)).join("")}</tr>`).join("")}
      ${totalRow ? `<tr class="total">${totalRow.map((c) => cell(c)).join("")}</tr>` : ""}
    </tbody></table>`;
  host.hidden = !finState.openTables[hostId];
}

/* แบ่งช่วงเวลาเป็นแท่งกราฟ: รายชั่วโมง / รายวัน / รายสัปดาห์ / รายเดือน */
function finBuildBuckets(range) {
  const buckets = [];
  if (range.period === "today") {
    for (let h = 0; h < 24; h++) {
      buckets.push({ label: finPad(h), full: `${finPad(h)}:00–${finPad((h + 1) % 24)}:00 น.`, value: 0, count: 0, future: h > new Date(range.end).getHours() });
    }
    return { buckets, unit: "hour", unitText: "ชั่วโมง", title: "รายรับรายชั่วโมง", indexOf: (ts) => new Date(ts).getHours() };
  }
  if (range.days <= 31) {
    for (let i = 0; i < range.days; i++) {
      const t = finAddDays(range.start, i);
      buckets.push({ label: String(new Date(t).getDate()), full: finDate(t, { dow: true }), value: 0, count: 0 });
    }
    return { buckets, unit: "day", unitText: "วัน", title: "รายรับรายวัน", indexOf: (ts) => Math.round((finStartOfDay(ts) - range.start) / FIN_DAY) };
  }
  if (range.days <= 26 * 7) {
    const offset = (new Date(range.start).getDay() + 6) % 7; // เริ่มสัปดาห์วันจันทร์
    const week0 = finAddDays(range.start, -offset);
    const totalDays = Math.round((finStartOfDay(range.end) - week0) / FIN_DAY) + 1;
    const n = Math.ceil(totalDays / 7);
    for (let i = 0; i < n; i++) {
      const ws = finAddDays(week0, i * 7);
      const we = finAddDays(ws, 6);
      buckets.push({ label: finDate(ws, { year: false }), full: `สัปดาห์ ${finDate(ws, { year: false })} – ${finDate(we)}`, value: 0, count: 0 });
    }
    return { buckets, unit: "week", unitText: "สัปดาห์", title: "รายรับรายสัปดาห์", indexOf: (ts) => Math.floor(Math.round((finStartOfDay(ts) - week0) / FIN_DAY) / 7) };
  }
  const s = new Date(range.start);
  const e = new Date(range.end);
  const n = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1;
  for (let i = 0; i < n; i++) {
    const d = new Date(s.getFullYear(), s.getMonth() + i, 1);
    buckets.push({ label: FIN_MONTHS[d.getMonth()], full: finMonthLabel(d.getFullYear(), d.getMonth()), value: 0, count: 0 });
  }
  return {
    buckets, unit: "month", unitText: "เดือน", title: "รายรับรายเดือน",
    indexOf: (ts) => { const d = new Date(ts); return (d.getFullYear() - s.getFullYear()) * 12 + (d.getMonth() - s.getMonth()); },
  };
}

// CSV

function finDownloadCSV(filename, rows, dataCount) {
  const esc = (v) => {
    let s = v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s) && isNaN(Number(s))) s = `'${s}`; // กันสูตรใน Excel
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  const count = Number.isFinite(dataCount) ? dataCount : rows.length - 1;
  showToast("ดาวน์โหลดแล้ว", `${filename} · ${count.toLocaleString("th-TH")} รายการ`, "success");
}

// หน้ารายรับ

function renderRevenueView(force = false) {
  const view = document.getElementById("view-revenue");
  if (!view) return;
  const usageRaw = localStorage.getItem(WCU_KEYS.usage) || "";
  const machines = wcuGetMachines();
  const signature = [
    usageRaw,
    JSON.stringify(machines.map((m) => [m.uid, m.id, m.category])),
    finState.period, finState.revSort, finState.txnLimit,
    Math.floor(Date.now() / 60000), view.clientWidth,
  ].join("|");
  if (!force && signature === finState.sig.revenue) return;
  finState.sig.revenue = signature;

  const range = finGetRange(finState.period);
  const allUsage = wcuGetUsage();
  const machineMap = finMachineMap();
  const inRange = finUsageIn(range.start, range.end, allUsage);
  const prevList = range.prevStart !== null ? finUsageIn(range.prevStart, range.prevEnd, allUsage) : null;

  // เงิน: นับทุกเหรียญที่หยอดแล้ว (รวมรอบที่ยังจ่ายไม่ครบ) / จำนวนครั้ง: นับเฉพาะรอบที่เริ่มใช้งานจริง
  const washerRecs = inRange.filter((u) => u.category === "washer");
  const ironRecs = inRange.filter((u) => u.category === "iron");
  const completed = inRange.filter(wcuIsCompletedUse);
  const washerUses = washerRecs.filter(wcuIsCompletedUse);
  const ironUses = ironRecs.filter(wcuIsCompletedUse);
  const pendingAmount = finSum(inRange.filter((u) => !wcuIsCompletedUse(u)));
  const total = finSum(inRange);
  const washerRev = finSum(washerRecs);
  const ironRev = finSum(ironRecs);

  renderSourceBanner();

  // --- หัวสรุป
  setText("rev-period-caption", finRangeCaption(range));
  setText("rev-hero-label", `รายรับรวม · ${PERIOD_TEXT[range.period]}`);
  setText("rev-grand-total", formatBaht(total));
  const delta = finDeltaText(total, prevList ? finSum(prevList) : 0, range, "รายรับ");
  const deltaEl = document.getElementById("rev-delta");
  deltaEl.textContent = delta;
  deltaEl.hidden = !delta;

  // --- ตัวเลขสำคัญ
  setText("rev-kpi-uses", `${completed.length.toLocaleString("th-TH")} ครั้ง`);
  setText("rev-kpi-uses-sub", `ซัก ${washerUses.length.toLocaleString("th-TH")} · รีด ${ironUses.length.toLocaleString("th-TH")}`);
  setText("rev-kpi-avg", washerUses.length ? formatBaht(Math.round((finSum(washerUses) / washerUses.length) * 100) / 100) : "-");
  setText("rev-kpi-avg-sub", washerUses.length ? `จาก ${washerUses.length.toLocaleString("th-TH")} รอบซัก` : "ยังไม่มีรอบซัก");
  setText("rev-kpi-daily", formatBaht(Math.round((total / range.days) * 100) / 100));
  setText("rev-kpi-daily-sub", `เฉลี่ยจาก ${range.days.toLocaleString("th-TH")} วัน`);

  const byUid = {};
  inRange.forEach((u) => {
    const s = byUid[u.uid] || (byUid[u.uid] = { count: 0, revenue: 0, category: u.category, machineId: u.machineId });
    if (wcuIsCompletedUse(u)) s.count += 1;
    s.revenue += Math.max(0, Number(u.amount) || 0);
  });
  const topWasher = Object.entries(byUid)
    .filter(([, s]) => s.category === "washer" && s.revenue > 0)
    .sort((a, b) => b[1].revenue - a[1].revenue)[0];
  if (topWasher) {
    const info = finMachineName(topWasher[0], topWasher[1].category, topWasher[1].machineId, machineMap);
    setText("rev-kpi-top", info.short + (info.deleted ? " (ลบแล้ว)" : ""));
    setText("rev-kpi-top-sub", `${formatBaht(topWasher[1].revenue)} · ${topWasher[1].count} ครั้ง · ${finPctText(finPercent(topWasher[1].revenue, washerRev))}`);
  } else {
    setText("rev-kpi-top", "-");
    setText("rev-kpi-top-sub", "ยังไม่มีรายรับในช่วงนี้");
  }

  // --- แยกตามประเภท
  const liveWashers = machines.filter((m) => m.category === "washer").length;
  const liveIrons = machines.filter((m) => m.category === "iron").length;
  setText("rev-washer-val", formatBaht(washerRev));
  setText("rev-washer-count", `${liveWashers} เครื่อง · ใช้ ${washerUses.length.toLocaleString("th-TH")} ครั้ง${pendingAmount > 0 ? ` · เหรียญค้าง ${formatBaht(pendingAmount)}` : ""}`);
  setText("rev-iron-val", ironRev > 0 ? formatBaht(ironRev) : "ฟรี");
  setText("rev-iron-count", `${liveIrons} เครื่อง · ใช้ ${ironUses.length.toLocaleString("th-TH")} ครั้ง`);

  renderRevenueTrend(range, inRange, total);
  renderRevenueHours(range, completed);
  renderRevenueMachines(range, inRange, allUsage, machines, machineMap, washerRev, ironUses.length);
  renderRevenueTransactions(inRange, machineMap);
}

function renderRevenueTrend(range, inRange, total) {
  const b = finBuildBuckets(range);
  inRange.forEach((u) => {
    const i = b.indexOf(Number(u.at));
    if (b.buckets[i]) { b.buckets[i].value += Math.max(0, Number(u.amount) || 0); if (wcuIsCompletedUse(u)) b.buckets[i].count += 1; }
  });
  setText("rev-chart-title", b.title);
  const activeBuckets = b.buckets.filter((x) => !x.future);
  const max = b.buckets.reduce((a, x) => (x.value > a.value ? x : a), { value: 0 });
  const avg = activeBuckets.length ? total / activeBuckets.length : 0;
  setText("rev-chart-sub", max.value > 0
    ? `สูงสุด ${formatBaht(max.value)} (${max.full}) · เฉลี่ย ${formatBaht(Math.round(avg))} ต่อ${b.unitText}`
    : "ยังไม่มีรายรับในช่วงนี้");

  finColumnChart("rev-trend-chart", {
    buckets: b.buckets,
    unit: b.unit,
    format: (v) => formatBaht(Math.round(v * 100) / 100),
    tickFormat: finCompactBaht,
    integer: false,
    colorFor: () => FIN_COLORS.income,
    ariaLabel: `${b.title} ${PERIOD_TEXT[range.period]}`,
    emptyText: "ยังไม่มีรายรับในช่วงนี้",
  });
  finTable("rev-trend-table", [b.unitText === "ชั่วโมง" ? "ช่วงเวลา" : b.unitText, "ครั้ง", "รายรับ"],
    b.buckets.filter((x) => !x.future).map((x) => [x.full, x.count.toLocaleString("th-TH"), formatBaht(x.value)]),
    ["รวม", activeBuckets.reduce((a, x) => a + x.count, 0).toLocaleString("th-TH"), formatBaht(total)]);
}

function renderRevenueHours(range, inRange) {
  const hours = Array.from({ length: 24 }, (_, h) => ({ label: finPad(h), full: `${finPad(h)}:00–${finPad((h + 1) % 24)}:00 น.`, value: 0 }));
  inRange.forEach((u) => { hours[new Date(Number(u.at)).getHours()].value += 1; });
  const total = inRange.length;
  const peak = hours.reduce((a, x, i) => (x.value > hours[a].value ? i : a), 0);
  const part = (from, to) => hours.filter((_, h) => (from < to ? h >= from && h < to : h >= from || h < to)).reduce((a, x) => a + x.value, 0);

  setText("rev-hours-sub", total
    ? `คนใช้มากที่สุดช่วง ${hours[peak].full} · ${hours[peak].value} ครั้ง`
    : "ยังไม่มีการใช้งานในช่วงนี้");
  setText("rev-hours-parts", total
    ? `เช้า 06–12 น. ${finPctText(finPercent(part(6, 12), total))} · บ่าย 12–17 น. ${finPctText(finPercent(part(12, 17), total))} · เย็น 17–22 น. ${finPctText(finPercent(part(17, 22), total))} · ดึก 22–06 น. ${finPctText(finPercent(part(22, 6), total))}`
    : "");

  finColumnChart("rev-hours-chart", {
    buckets: hours,
    unit: "hour",
    format: (v) => `${v.toLocaleString("th-TH")} ครั้ง`,
    tickFormat: (v) => v.toLocaleString("th-TH"),
    integer: true,
    // เน้นช่วงที่คนใช้มากที่สุด ช่วงอื่นเป็นสีเทา
    colorFor: (i, maxIdx) => (i === maxIdx ? FIN_COLORS.income : FIN_COLORS.muted),
    ariaLabel: "จำนวนครั้งที่ใช้งานแยกตามช่วงเวลา",
    emptyText: "ยังไม่มีการใช้งานในช่วงนี้",
  });
  finTable("rev-hours-table", ["ช่วงเวลา", "ครั้ง", "สัดส่วน"],
    hours.map((x) => [x.full, x.value.toLocaleString("th-TH"), finPctText(finPercent(x.value, total))]),
    ["รวม", total.toLocaleString("th-TH"), total ? "100%" : "0%"]);
}

function renderRevenueMachines(range, inRange, allUsage, machines, machineMap, washerRev, ironCount) {
  const stats = {};
  inRange.forEach((u) => {
    const s = stats[u.uid] || (stats[u.uid] = { count: 0, revenue: 0, doneRevenue: 0, pending: 0, category: u.category, machineId: u.machineId });
    const amount = Math.max(0, Number(u.amount) || 0);
    s.revenue += amount;
    if (wcuIsCompletedUse(u)) { s.count += 1; s.doneRevenue += amount; } else s.pending += amount;
  });
  const lastUsed = {};
  allUsage.forEach((u) => { const t = finActivityTs(u); if (!lastUsed[u.uid] || t > lastUsed[u.uid]) lastUsed[u.uid] = t; });

  const rows = machines
    .filter((m) => m.category === "washer" || m.category === "iron")
    .map((m) => {
      const s = stats[m.uid] || { count: 0, revenue: 0, doneRevenue: 0, pending: 0 };
      return { uid: m.uid, category: m.category, label: String(m.id), count: s.count, revenue: s.revenue, doneRevenue: s.doneRevenue, pending: s.pending, deleted: false };
    });
  const live = new Set(rows.map((r) => r.uid));
  Object.entries(stats).forEach(([uid, s]) => {
    if (!live.has(uid) && (s.count > 0 || s.revenue > 0) && (s.category === "washer" || s.category === "iron")) {
      rows.push({ uid, category: s.category, label: String(s.machineId ?? "-"), count: s.count, revenue: s.revenue, doneRevenue: s.doneRevenue, pending: s.pending, deleted: true });
    }
  });

  const order = { washer: 0, iron: 1 };
  rows.sort((a, b) => {
    const byCat = order[a.category] - order[b.category];
    if (byCat) return byCat;
    if (finState.revSort === "revenue") {
      return (b.revenue - a.revenue) || (b.count - a.count) || compareMachineLabel(a.label, b.label);
    }
    return (Number(a.deleted) - Number(b.deleted)) || compareMachineLabel(a.label, b.label);
  });

  const html = rows.map((r) => {
    const isIron = r.category === "iron";
    const share = isIron ? finPercent(r.count, ironCount) : finPercent(r.revenue, washerRev);
    const shareText = isIron ? `${finPctText(share)} ของการใช้เตารีด` : `${finPctText(share)} ของรายรับเครื่องซัก`;
    const avg = !isIron && r.count ? ` · เฉลี่ย ${formatBaht(Math.round((r.doneRevenue / r.count) * 100) / 100)}/ครั้ง` : "";
    const lastText = lastUsed[r.uid] ? `ใช้ล่าสุด ${finRelative(lastUsed[r.uid])}` : "ยังไม่เคยมีการใช้งาน";
    const last = r.pending > 0 ? `${lastText} · มีเหรียญค้างในเครื่อง ${formatBaht(r.pending)}` : lastText;
    const amount = isIron && r.revenue === 0
      ? `<span class="rev-amount" style="color: var(--navy-soft);">- ฟรี -</span>`
      : `<span class="rev-amount">${formatBaht(r.revenue)}</span>`;
    return `
      <div class="rev-row${r.deleted ? " is-deleted" : ""}">
        <div class="rev-info">
          <span class="name">${CATEGORY_LABEL[r.category]} ${escapeHtml(r.label)}</span>
          <span class="usage">ใช้งาน ${r.count.toLocaleString("th-TH")} ครั้ง${avg}${r.deleted ? " · ลบออกจากระบบแล้ว" : ""}</span>
          <span class="rev-meta">${r.count || r.pending ? last : `ไม่มีการใช้งานในช่วงนี้ · ${last}`}</span>
        </div>
        ${amount}
        <div class="rev-share" aria-label="${escapeHtml(shareText)}">
          <div class="share-track"><div class="share-fill" style="width: ${Math.min(100, share).toFixed(2)}%"></div></div>
          <span>${shareText}</span>
        </div>
      </div>`;
  }).join("");

  const list = document.getElementById("revenue-detail-list");
  if (list) list.innerHTML = html || `<div class="empty-state">ยังไม่มีข้อมูล</div>`;
}

function renderRevenueTransactions(inRange, machineMap) {
  const list = document.getElementById("rev-txn-list");
  const moreBtn = document.getElementById("rev-txn-more");
  if (!list) return;
  // เรียง จัดกลุ่มวัน และแสดงเวลา ด้วยเวลาเดียวกัน (เวลาเริ่มหยอด = เวลาที่นับเป็นรายรับ)
  const sorted = inRange.slice().sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0));
  setText("rev-txn-count", sorted.length ? `${sorted.length.toLocaleString("th-TH")} รายการ` : "");
  if (!sorted.length) {
    list.innerHTML = `<div class="empty-state">ยังไม่มีการใช้งานในช่วงนี้</div>`;
    moreBtn.hidden = true;
    return;
  }

  const dayTotals = {};
  sorted.forEach((u) => {
    const k = wcuDateKey(u.at);
    const d = dayTotals[k] || (dayTotals[k] = { count: 0, amount: 0 });
    d.count += 1;
    d.amount += Math.max(0, Number(u.amount) || 0);
  });

  let html = "";
  let lastDay = "";
  sorted.slice(0, finState.txnLimit).forEach((u) => {
    const k = wcuDateKey(u.at);
    if (k !== lastDay) {
      lastDay = k;
      html += `<div class="txn-day"><span>${escapeHtml(finDayLabel(u.at))}</span><span>${dayTotals[k].count} รายการ · ${formatBaht(dayTotals[k].amount)}</span></div>`;
    }
    const info = finMachineName(u.uid, u.category, u.machineId, machineMap);
    const icon = info.category === "iron" ? WcuIcon.iron() : WcuIcon.washer();
    const pending = !wcuIsCompletedUse(u);
    const amount = info.category === "iron" && !(Number(u.amount) > 0)
      ? `<span class="rev-amount" style="color: var(--navy-soft);">ฟรี</span>`
      : `<span class="rev-amount">+${formatBaht(u.amount)}</span>`;
    const what = info.category === "iron" ? "เสียบปลั๊กใช้งาน"
      : pending ? `หยอดแล้ว ${formatBaht(u.amount)} จาก ${formatBaht(u.price)} · รอเหรียญครบ`
      : u.coins ? `หยอดเหรียญครบ ${u.coins} เหรียญ · เริ่มซัก` : "หยอดเหรียญครบ · เริ่มซัก";
    const tags = `${wcuIsSampleRecord(u) ? `<span class="txn-tag">ตัวอย่าง</span>` : `<span class="txn-tag live">หน้า demo</span>`}${pending ? `<span class="txn-tag wait">ยังไม่ครบ</span>` : ""}`;
    html += `
      <div class="txn-row${pending ? " is-pending" : ""}">
        <span class="txn-icon">${icon}</span>
        <div class="txn-info">
          <span class="name">${escapeHtml(info.name)} ${tags}</span>
          <span class="usage">${finTime(u.at)} น.${finActivityTs(u) - Number(u.at) >= 60000 ? ` (ล่าสุด ${finTime(finActivityTs(u))} น.)` : ""} · ${escapeHtml(what)}${info.deleted ? " · ลบออกแล้ว" : ""}</span>
        </div>
        ${amount}
      </div>`;
  });
  list.innerHTML = html;

  const remaining = sorted.length - Math.min(sorted.length, finState.txnLimit);
  moreBtn.hidden = remaining <= 0;
  moreBtn.textContent = `ดูเพิ่มอีก ${Math.min(TXN_PAGE, remaining)} รายการ (เหลือ ${remaining.toLocaleString("th-TH")})`;
}

function exportRevenueCSV() {
  const range = finGetRange(finState.period);
  const machineMap = finMachineMap();
  const list = finUsageIn(range.start, range.end, wcuGetUsage()).sort((a, b) => a.at - b.at);
  const rows = [["วันที่", "เวลา", "ประเภท", "หมายเลขเครื่อง", "สถานะ", "ที่มา", "หมายเหตุ", "จำนวนเงิน (บาท)"]];
  list.forEach((u) => {
    const info = finMachineName(u.uid, u.category, u.machineId, machineMap);
    rows.push([
      wcuDateKey(u.at), finTime(u.at), CATEGORY_LABEL[info.category], info.short.replace("เครื่อง ", ""),
      wcuIsCompletedUse(u) ? "ใช้งานแล้ว" : "หยอดเหรียญยังไม่ครบ", wcuIsSampleRecord(u) ? "ข้อมูลตัวอย่าง" : "หน้า demo",
      info.deleted ? "เครื่องถูกลบแล้ว" : "", Math.max(0, Number(u.amount) || 0),
    ]);
  });
  rows.push(["รวม", "", "", "", "", "", "", finSum(list)]);
  finDownloadCSV(`washnclean-revenue-${range.period}-${wcuDateKey(Date.now())}.csv`, rows, list.length);
}

// หน้ารายจ่าย

function finExpenseCategory(key) {
  return WCU_EXPENSE_CATEGORIES.find((c) => c.key === key) || WCU_EXPENSE_CATEGORIES[WCU_EXPENSE_CATEGORIES.length - 1];
}

function finExpenseMachineName(e, machineMap) {
  if (!e.machineUid) return "";
  const m = machineMap.get(e.machineUid);
  if (m) return `${CATEGORY_LABEL[m.category]} ${m.id}`;
  return e.machineLabel ? `${e.machineLabel} (ลบแล้ว)` : "";
}

function renderExpensesView(force = false) {
  const view = document.getElementById("view-expenses");
  if (!view) return;
  const usageRaw = localStorage.getItem(WCU_KEYS.usage) || "";
  const expRaw = localStorage.getItem(WCU_KEYS.expenses) || "";
  const machines = wcuGetMachines();
  const signature = [
    usageRaw, expRaw,
    JSON.stringify(machines.map((m) => [m.uid, m.id, m.category])),
    finState.period, finState.expFilter,
    Math.floor(Date.now() / 60000), view.clientWidth,
  ].join("|");
  if (!force && signature === finState.sig.expenses) return;
  finState.sig.expenses = signature;

  const range = finGetRange(finState.period);
  const machineMap = finMachineMap();
  const allExpenses = wcuGetExpenses();
  const allUsage = wcuGetUsage();
  const exps = finExpensesIn(range.start, range.end, allExpenses);
  const prevExps = range.prevStart !== null ? finExpensesIn(range.prevStart, range.prevEnd, allExpenses) : null;
  const usage = finUsageIn(range.start, range.end, allUsage);
  const total = finSum(exps);
  const income = finSum(usage);
  const profit = income - total;
  const washerRuns = usage.filter((u) => u.category === "washer" && wcuIsCompletedUse(u)).length;

  // --- หัวสรุป
  setText("exp-period-caption", finRangeCaption(range));
  setText("exp-hero-label", `รายจ่ายรวม · ${PERIOD_TEXT[range.period]}`);
  setText("exp-grand-total", formatBaht(total));
  const delta = finDeltaText(total, prevExps ? finSum(prevExps) : 0, range, "รายจ่าย");
  const deltaEl = document.getElementById("exp-delta");
  deltaEl.textContent = delta;
  deltaEl.hidden = !delta;

  // --- กำไรสุทธิ
  const profitEl = document.getElementById("exp-profit");
  profitEl.textContent = `${profit >= 0 ? "▲ กำไร" : "▼ ขาดทุน"} ${formatBaht(Math.abs(Math.round(profit * 100) / 100))}`;
  profitEl.className = profit >= 0 ? "is-profit" : "is-loss";
  const barMax = Math.max(income, total, 1);
  document.getElementById("exp-bar-income").style.width = `${(income / barMax) * 100}%`;
  document.getElementById("exp-bar-expense").style.width = `${(total / barMax) * 100}%`;
  setText("exp-income-val", formatBaht(income));
  setText("exp-expense-val", formatBaht(total));
  setText("exp-margin", income > 0
    ? `อัตรากำไร ${finPctText(Math.abs(finPercent(profit, income)))}${profit < 0 ? " (ติดลบ)" : ""} · รายจ่ายคิดเป็น ${finPctText(finPercent(total, income))} ของรายรับ`
    : (total > 0 ? "ยังไม่มีรายรับในช่วงนี้ จึงยังคำนวณอัตรากำไรไม่ได้" : "ยังไม่มีรายรับและรายจ่ายในช่วงนี้"));

  // --- ตัวเลขสำคัญ
  setText("exp-kpi-count", `${exps.length.toLocaleString("th-TH")} รายการ`);
  setText("exp-kpi-count-sub", exps.length ? `เฉลี่ย ${formatBaht(Math.round((total / exps.length) * 100) / 100)} ต่อรายการ` : "ยังไม่มีรายการ");
  setText("exp-kpi-perwash", washerRuns ? formatBaht(Math.round((total / washerRuns) * 100) / 100) : "-");
  setText("exp-kpi-perwash-sub", washerRuns ? `ต้นทุนเฉลี่ยจาก ${washerRuns.toLocaleString("th-TH")} รอบซัก` : "ยังไม่มีรอบซักในช่วงนี้");
  setText("exp-kpi-daily", formatBaht(Math.round((total / range.days) * 100) / 100));
  setText("exp-kpi-daily-sub", `เฉลี่ยจาก ${range.days.toLocaleString("th-TH")} วัน`);

  const byCat = WCU_EXPENSE_CATEGORIES.map((c) => {
    const items = exps.filter((e) => finExpenseCategory(e.category).key === c.key);
    return { ...c, color: EXPENSE_COLORS[c.key], amount: finSum(items), count: items.length };
  });
  const topCat = byCat.filter((c) => c.amount > 0).sort((a, b) => b.amount - a.amount)[0];
  setText("exp-kpi-top", topCat ? topCat.label : "-");
  setText("exp-kpi-top-sub", topCat ? `${formatBaht(topCat.amount)} · ${finPctText(finPercent(topCat.amount, total))} ของรายจ่าย` : "ยังไม่มีรายจ่าย");

  renderExpenseCategories(byCat, total);
  renderExpenseMachines(exps, usage, machineMap);
  renderExpenseMonths(range, allUsage, allExpenses);
  renderExpenseList(exps, byCat, machineMap);
}

function renderExpenseCategories(byCat, total) {
  const stack = document.getElementById("exp-stack");
  const list = document.getElementById("exp-cat-list");
  const used = byCat.filter((c) => c.amount > 0);
  if (!used.length) {
    stack.hidden = true;
    list.innerHTML = `<div class="empty-state">ยังไม่มีรายจ่ายในช่วงนี้</div>`;
    return;
  }
  stack.hidden = false;
  stack.innerHTML = used.map((c) =>
    `<div class="stack-seg" style="flex: ${c.amount} 1 0; background: ${c.color};" title="${escapeHtml(`${c.label} ${formatBaht(c.amount)} (${finPctText(finPercent(c.amount, total))})`)}"></div>`
  ).join("");
  stack.setAttribute("aria-label", used.map((c) => `${c.label} ${finPctText(finPercent(c.amount, total))}`).join(", "));
  list.innerHTML = used.map((c) => `
    <div class="cat-row">
      <span class="cat-dot" style="background: ${c.color};"></span>
      <div class="cat-name">${escapeHtml(c.label)}<small>${c.count.toLocaleString("th-TH")} รายการ</small></div>
      <div class="cat-amount">${formatBaht(c.amount)}<small>${finPctText(finPercent(c.amount, total))}</small></div>
    </div>`).join("");
}

function renderExpenseMachines(exps, usage, machineMap) {
  const card = document.getElementById("exp-machine-card");
  const list = document.getElementById("exp-machine-list");
  const groups = {};
  exps.filter((e) => e.machineUid).forEach((e) => {
    const g = groups[e.machineUid] || (groups[e.machineUid] = { uid: e.machineUid, count: 0, amount: 0, sample: e });
    g.count += 1;
    g.amount += Math.max(0, Number(e.amount) || 0);
  });
  const rows = Object.values(groups).sort((a, b) => b.amount - a.amount);
  card.hidden = !rows.length;
  if (!rows.length) { list.innerHTML = ""; return; }

  list.innerHTML = rows.map((g) => {
    const name = finExpenseMachineName(g.sample, machineMap) || "ไม่ระบุเครื่อง";
    const income = finSum(usage.filter((u) => u.uid === g.uid));
    const net = income - g.amount;
    const isIron = (machineMap.get(g.uid) || {}).category === "iron" || /^เตารีด/.test(name);
    const netText = isIron
      ? "เตารีดให้บริการฟรี (ไม่มีรายรับ)"
      : `รายรับเครื่องนี้ ${formatBaht(income)} · ${net >= 0 ? "เหลือสุทธิ" : "ขาดทุนสุทธิ"} ${formatBaht(Math.abs(net))}`;
    return `
      <div class="rev-row">
        <div class="rev-info">
          <span class="name">${escapeHtml(name)}</span>
          <span class="usage">ค่าใช้จ่าย ${g.count} รายการ</span>
          <span class="rev-meta">${escapeHtml(netText)}</span>
        </div>
        <span class="rev-amount exp-amount">${formatBaht(g.amount)}</span>
      </div>`;
  }).join("");
}

function renderExpenseMonths(range, allUsage, allExpenses) {
  const s = new Date(range.start);
  const e = new Date(range.end);
  const n = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1;
  const rows = [];
  let tIn = 0, tOut = 0;
  for (let i = n - 1; i >= 0; i--) {
    const mStart = new Date(s.getFullYear(), s.getMonth() + i, 1).getTime();
    const mEnd = new Date(s.getFullYear(), s.getMonth() + i + 1, 1).getTime() - 1;
    const from = Math.max(mStart, range.start);
    const to = Math.min(mEnd, range.end);
    const inc = finSum(finUsageIn(from, to, allUsage));
    const out = finSum(finExpensesIn(from, to, allExpenses));
    tIn += inc; tOut += out;
    const d = new Date(mStart);
    const partial = from > mStart || to < mEnd;
    rows.push({ label: finMonthLabel(d.getFullYear(), d.getMonth()) + (partial ? "*" : ""), inc, out });
  }
  const signed = (v) => `${v < 0 ? "−" : ""}${formatBaht(Math.abs(Math.round(v * 100) / 100))}`;
  const body = rows.map((r) => `<tr><td>${escapeHtml(r.label)}</td><td>${formatBaht(r.inc)}</td><td>${formatBaht(r.out)}</td><td class="${r.inc - r.out < 0 ? "neg" : ""}">${signed(r.inc - r.out)}</td></tr>`).join("");
  document.getElementById("exp-month-table").innerHTML = `
    <table class="data-table">
      <thead><tr><th>เดือน</th><th>รายรับ</th><th>รายจ่าย</th><th>กำไร</th></tr></thead>
      <tbody>${body}
        <tr class="total"><td>รวม</td><td>${formatBaht(tIn)}</td><td>${formatBaht(tOut)}</td><td class="${tIn - tOut < 0 ? "neg" : ""}">${signed(tIn - tOut)}</td></tr>
      </tbody>
    </table>`;
  setText("exp-month-note", rows.some((r) => r.label.endsWith("*"))
    ? "* นับเฉพาะวันที่อยู่ในช่วงที่เลือกด้านบน"
    : "");
}

function renderExpenseList(exps, byCat, machineMap) {
  const chips = document.getElementById("exp-filter-chips");
  const filters = [{ key: "all", label: "ทั้งหมด", count: exps.length }]
    .concat(byCat.map((c) => ({ key: c.key, label: c.label, count: c.count, color: c.color })))
    .filter((f) => f.key === "all" || f.count > 0 || f.key === finState.expFilter);
  if (!filters.some((f) => f.key === finState.expFilter)) finState.expFilter = "all";
  chips.innerHTML = filters.map((f) => `
    <button type="button" class="chip-btn${finState.expFilter === f.key ? " active" : ""}" data-exp-filter="${f.key}">
      ${f.color ? `<span class="cat-dot" style="background: ${f.color};"></span>` : ""}${escapeHtml(f.label)} ${f.count}
    </button>`).join("");

  const list = document.getElementById("exp-list");
  const shown = exps
    .filter((e) => finState.expFilter === "all" || finExpenseCategory(e.category).key === finState.expFilter)
    .sort((a, b) => (finDateKeyToTs(b.date) - finDateKeyToTs(a.date)) || (b.createdAt - a.createdAt));
  setText("exp-list-count", shown.length ? `${shown.length.toLocaleString("th-TH")} รายการ · ${formatBaht(finSum(shown))}` : "");
  if (!shown.length) {
    list.innerHTML = `<div class="empty-state">${exps.length ? "ไม่มีรายการในหมวดนี้" : "ยังไม่มีรายจ่ายในช่วงนี้ กดปุ่ม + เพื่อเพิ่ม"}</div>`;
    return;
  }

  const dayTotals = {};
  shown.forEach((e) => {
    const d = dayTotals[e.date] || (dayTotals[e.date] = { count: 0, amount: 0 });
    d.count += 1;
    d.amount += Math.max(0, Number(e.amount) || 0);
  });

  let html = "";
  let lastDay = "";
  shown.forEach((e) => {
    if (e.date !== lastDay) {
      lastDay = e.date;
      html += `<div class="txn-day"><span>${escapeHtml(finDayLabel(finDateKeyToTs(e.date)))}</span><span>${dayTotals[e.date].count} รายการ · ${formatBaht(dayTotals[e.date].amount)}</span></div>`;
    }
    const cat = finExpenseCategory(e.category);
    const color = EXPENSE_COLORS[cat.key];
    const machine = finExpenseMachineName(e, machineMap);
    const detail = [e.note, machine].filter(Boolean).join(" · ") || "ไม่มีรายละเอียด";
    html += `
      <div class="txn-row clickable" role="button" tabindex="0" data-expense-id="${escapeHtml(e.id)}" aria-label="แก้ไขรายการ ${escapeHtml(cat.label)} ${formatBaht(e.amount)}">
        <span class="txn-icon cat-icon" style="background: ${color}1f;"><span class="cat-dot" style="background: ${color};"></span></span>
        <div class="txn-info">
          <span class="name">${escapeHtml(cat.label)}</span>
          <span class="usage">${escapeHtml(detail)}</span>
        </div>
        <span class="rev-amount exp-amount">${formatBaht(e.amount)}</span>
      </div>`;
  });
  list.innerHTML = html;
}

function exportExpensesCSV() {
  const range = finGetRange(finState.period);
  const machineMap = finMachineMap();
  const list = finExpensesIn(range.start, range.end, wcuGetExpenses())
    .sort((a, b) => (finDateKeyToTs(a.date) - finDateKeyToTs(b.date)) || (a.createdAt - b.createdAt));
  const rows = [["วันที่", "หมวดหมู่", "เครื่องที่เกี่ยวข้อง", "รายละเอียด", "จำนวนเงิน (บาท)"]];
  list.forEach((e) => rows.push([e.date, finExpenseCategory(e.category).label, finExpenseMachineName(e, machineMap), e.note, e.amount]));
  rows.push(["รวม", "", "", "", finSum(list)]);
  finDownloadCSV(`washnclean-expenses-${range.period}-${wcuDateKey(Date.now())}.csv`, rows, list.length);
}

/* ---------- เพิ่ม / แก้ไข / ลบรายจ่าย ---------- */

function openExpenseModal(id = null) {
  const expense = id ? wcuGetExpenses().find((e) => e.id === id) : null;
  finState.editingExpenseId = expense ? expense.id : null;

  setText("expense-modal-title", expense ? "แก้ไขรายจ่าย" : "เพิ่มรายจ่าย");
  const catSel = document.getElementById("exp-category");
  catSel.innerHTML = WCU_EXPENSE_CATEGORIES.map((c) => `<option value="${c.key}">${escapeHtml(c.label)}</option>`).join("");

  const machineSel = document.getElementById("exp-machine");
  const machines = wcuGetMachines().slice().sort((a, b) =>
    (a.category === b.category ? 0 : a.category === "washer" ? -1 : 1) || compareMachineLabel(a.id, b.id));
  let options = `<option value="">ไม่ระบุ (ค่าใช้จ่ายส่วนกลาง)</option>`;
  options += machines.map((m) => `<option value="${escapeHtml(m.uid)}">${escapeHtml(`${CATEGORY_LABEL[m.category]} ${m.id}`)}</option>`).join("");
  if (expense && expense.machineUid && !machines.some((m) => m.uid === expense.machineUid)) {
    options += `<option value="${escapeHtml(expense.machineUid)}">${escapeHtml(`${expense.machineLabel || "เครื่องเดิม"} (ลบแล้ว)`)}</option>`;
  }
  machineSel.innerHTML = options;

  const today = wcuDateKey(Date.now());
  const dateInput = document.getElementById("exp-date");
  dateInput.max = today;
  catSel.value = expense ? finExpenseCategory(expense.category).key : (finState.expFilter !== "all" ? finState.expFilter : "electricity");
  document.getElementById("exp-amount").value = expense ? expense.amount : "";
  dateInput.value = expense ? expense.date : today;
  machineSel.value = expense && expense.machineUid ? expense.machineUid : "";
  document.getElementById("exp-note").value = expense ? expense.note : "";
  document.getElementById("expense-delete-row").hidden = !expense;
  document.getElementById("expense-modal").hidden = false;
  setTimeout(() => document.getElementById("exp-amount").focus(), 50);
}

function saveExpenseFromForm(e) {
  e.preventDefault();
  const amount = Number(document.getElementById("exp-amount").value);
  const date = document.getElementById("exp-date").value;
  if (!(amount > 0)) {
    showToast("บันทึกไม่ได้", "กรุณากรอกจำนวนเงินมากกว่า 0 บาท", "error");
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > wcuDateKey(Date.now())) {
    showToast("บันทึกไม่ได้", "วันที่จ่ายต้องไม่เกินวันนี้", "error");
    return;
  }
  const data = {
    category: document.getElementById("exp-category").value,
    amount,
    date,
    machineUid: document.getElementById("exp-machine").value || null,
    note: document.getElementById("exp-note").value,
  };
  const editing = finState.editingExpenseId;
  let linked = 0;
  if (editing) {
    const updated = wcuUpdateExpense(editing, data);
    // ค่าซ่อมที่ผูกกับใบแจ้งซ่อม → อัปเดตยอดในใบแจ้งให้ตรงกัน
    if (updated) linked = wcuSyncReportsAfterExpenseChange(editing, updated);
  } else wcuAddExpense(data);
  if (linked) showToast("อัปเดตใบแจ้งซ่อมด้วย", "ค่าซ่อมในใบแจ้งซ่อมที่ผูกกับรายการนี้ถูกแก้ให้ตรงกันแล้ว", "success");
  closeModal("expense-modal");
  finState.editingExpenseId = null;

  // ถ้าวันที่ที่บันทึกอยู่นอกช่วงที่เลือก แจ้งให้รู้ว่าทำไมไม่เห็นในรายการ
  const range = finGetRange(finState.period);
  const t = finDateKeyToTs(date);
  const outside = t < range.start || t > range.end;
  showToast(editing ? "แก้ไขรายจ่ายแล้ว" : "เพิ่มรายจ่ายแล้ว",
    `${finExpenseCategory(data.category).label} ${formatBaht(amount)}${outside ? ` · อยู่นอกช่วง "${PERIOD_TEXT[finState.period]}"` : ""}`, "success");
  renderExpensesView(true);
}

function askDeleteExpense() {
  const expense = wcuGetExpenses().find((e) => e.id === finState.editingExpenseId);
  if (!expense) return;
  setText("expense-delete-desc", `${finExpenseCategory(expense.category).label} ${formatBaht(expense.amount)} · ${finDate(finDateKeyToTs(expense.date))} จะถูกลบออกถาวร`);
  closeModal("expense-modal");
  document.getElementById("expense-delete-modal").hidden = false;
}

// ผูกปุ่มต่างๆ (เรียกครั้งเดียวตอนโหลดแดชบอร์ด)

function renderVisibleFinance(force) {
  const rev = document.getElementById("view-revenue");
  const exp = document.getElementById("view-expenses");
  if (rev && !rev.hidden) renderRevenueView(force);
  if (exp && !exp.hidden) renderExpensesView(force);
}

function setupFinance() {
  // ตัวเลือกช่วงเวลา (ใช้ร่วมกันทั้งหน้ารายรับและรายจ่าย)
  document.querySelectorAll("[data-period]").forEach((btn) => {
    btn.addEventListener("click", () => {
      finState.period = btn.dataset.period;
      finState.txnLimit = TXN_PAGE;
      document.querySelectorAll("[data-period]").forEach((b) => b.classList.toggle("active", b.dataset.period === finState.period));
      renderVisibleFinance(true);
    });
  });

  document.querySelectorAll("[data-rev-sort]").forEach((btn) => {
    btn.addEventListener("click", () => {
      finState.revSort = btn.dataset.revSort;
      document.querySelectorAll("[data-rev-sort]").forEach((b) => b.classList.toggle("active", b === btn));
      renderRevenueView(true);
    });
  });

  document.querySelectorAll("[data-table]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.table;
      finState.openTables[id] = !finState.openTables[id];
      const table = document.getElementById(id);
      if (table) table.hidden = !finState.openTables[id];
      btn.textContent = finState.openTables[id] ? "ซ่อนตาราง" : "ดูตาราง";
      btn.setAttribute("aria-expanded", String(!!finState.openTables[id]));
    });
  });

  document.getElementById("rev-txn-more").addEventListener("click", () => {
    finState.txnLimit += TXN_PAGE;
    renderRevenueView(true);
  });
  document.getElementById("rev-export-btn").addEventListener("click", exportRevenueCSV);
  document.getElementById("rev-remove-sample").addEventListener("click", askRemoveSampleData);
  document.getElementById("exp-export-btn").addEventListener("click", exportExpensesCSV);

  document.getElementById("exp-filter-chips").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-exp-filter]");
    if (!chip) return;
    finState.expFilter = chip.dataset.expFilter;
    renderExpensesView(true);
  });

  const expList = document.getElementById("exp-list");
  expList.addEventListener("click", (e) => {
    const row = e.target.closest("[data-expense-id]");
    if (row) openExpenseModal(row.dataset.expenseId);
  });
  expList.addEventListener("keydown", (e) => {
    const row = e.target.closest("[data-expense-id]");
    if (row && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openExpenseModal(row.dataset.expenseId); }
  });

  document.getElementById("add-expense-btn").addEventListener("click", () => openExpenseModal(null));
  document.getElementById("expense-form").addEventListener("submit", saveExpenseFromForm);
  document.getElementById("expense-cancel-btn").addEventListener("click", () => closeModal("expense-modal"));
  document.getElementById("expense-delete-btn").addEventListener("click", askDeleteExpense);
  document.getElementById("expense-delete-cancel-btn").addEventListener("click", () => {
    closeModal("expense-delete-modal");
    document.getElementById("expense-modal").hidden = false;
  });
  document.getElementById("expense-delete-confirm-btn").addEventListener("click", () => {
    let linked = 0;
    if (finState.editingExpenseId) {
      wcuDeleteExpense(finState.editingExpenseId);
      linked = wcuSyncReportsAfterExpenseChange(finState.editingExpenseId, null);
    }
    finState.editingExpenseId = null;
    closeModal("expense-delete-modal");
    showToast("ลบรายจ่ายแล้ว", linked ? "ลบค่าซ่อม/เงินคืนออกจากใบแจ้งซ่อมที่ผูกไว้ด้วย" : "รายการถูกลบออกจากบัญชีเรียบร้อย", "success");
    renderExpensesView(true);
  });

  // วาดกราฟใหม่เมื่อขนาดจอเปลี่ยน
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => renderVisibleFinance(true), 150);
  });
}
