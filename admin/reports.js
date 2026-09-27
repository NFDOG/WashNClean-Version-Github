/* Wash & Clean Up — หน้ารายการแจ้งซ่อมของแอดมิน
 * สถานะใบแจ้งซ่อม 3 ขั้น: รอตรวจสอบ → กำลังซ่อม → ซ่อมเสร็จ
 * - ภาพรวม: ตัวเลขสำคัญ, สถิติอาการ/เครื่องที่เสียบ่อย/ความรุนแรง, คำขอคืนเงินที่ค้าง
 * - รายการ: ค้นหา, เรียงลำดับ, กรอง (ประเภทเครื่อง / ยังไม่ระบุเครื่อง / อันตราย / ขอคืนเงิน)
 * - รายละเอียด: รูปหลายรูป, ความรุนแรง, ช่องทางติดต่อ, ประวัติผู้แจ้งและเครื่อง, บันทึกการดำเนินการ,
 *   คัดลอกข้อความส่งช่าง, จัดการคำขอคืนเงิน, ระบุเครื่อง/สถานะ/บันทึก/ค่าซ่อม (ค่าซ่อม → หน้ารายจ่าย)
 * ใช้ฟังก์ชันจาก shared-data.js, script_ad.js (escapeHtml, formatBaht, showToast, askConfirm ...) และ finance.js (finDownloadCSV)
 */

const REPORT_STATUS = {
  new: { label: "รอตรวจสอบ", cls: "st-new" },
  in_progress: { label: "กำลังซ่อม", cls: "st-progress" },
  resolved: { label: "ซ่อมเสร็จ", cls: "st-done" },
};
const REPORT_ICONS = {
  new: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><line x1="12" y1="7.5" x2="12" y2="12.5"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`,
  in_progress: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 4.9L4 16.5V20h3.5l5.3-5.3a4 4 0 0 0 4.9-5.4l-2.6 2.6-2-2z"></path></svg>`,
  resolved: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 12.5 10 17 19 7.5"></polyline></svg>`,
};
const SEV_COLORS = { minor: "#f5a623", unusable: "#ee7d3b", danger: "#e2534a", unknown: "#cbd5e1" };
const REP_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

const repState = {
  tab: "new", filter: "all", sort: "newest", query: "",
  sig: "", openId: null, draftStatus: "new", photoIndex: 0,
  statsOpen: window.innerWidth >= 768,
};

// helpers

function repTs(value) {
  const t = typeof value === "number" ? value : new Date(value).getTime();
  return Number.isFinite(t) ? t : Date.now();
}
function repDateTime(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getDate()} ${REP_MONTHS[d.getMonth()]} ${String(d.getFullYear() + 543).slice(-2)} · ${p(d.getHours())}:${p(d.getMinutes())} น.`;
}
function repDuration(ms) {
  const mins = Math.max(0, Math.round(ms / 60000));
  if (mins < 60) return `${mins} นาที`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ชม.${mins % 60 ? ` ${mins % 60} นาที` : ""}`;
  const days = Math.floor(hours / 24);
  return `${days} วัน${hours % 24 ? ` ${hours % 24} ชม.` : ""}`;
}
function repAgo(ts) {
  const diff = Date.now() - ts;
  return diff < 60000 ? "เมื่อสักครู่" : `${repDuration(diff)}ที่แล้ว`;
}
function repCode(id) { return `#${String(id).slice(-6).toUpperCase()}`; }
function repAvg(list) { return list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0; }

// อาการ / รายละเอียด / ผู้แจ้ง (รองรับทั้งใบแจ้งแบบใหม่และข้อมูลเก่าที่เป็นข้อความล้วน)
function repIssues(r) {
  if (Array.isArray(r.issues) && r.issues.length) return r.issues.map((x) => String(x));
  const detail = typeof r.detail === "string" ? r.detail : "";
  const match = detail.match(/อาการ:\s*(.*?)(?:\s*—|$)/);
  return match && match[1] ? match[1].split(",").map((s) => s.trim()).filter(Boolean) : [];
}
function repExtra(r) {
  if (r.extraDetail) return String(r.extraDetail);
  const detail = typeof r.detail === "string" ? r.detail : "";
  if (!detail) return "";
  const extra = detail.match(/เพิ่มเติม:\s*(.*?)(?:\s*\(มีรูป|$)/);
  if (extra) return extra[1].trim();
  return /อาการ:|ผู้แจ้ง:/.test(detail) ? "" : detail;
}
function repStudent(r) {
  if (r.studentId) return String(r.studentId);
  const m = typeof r.detail === "string" && r.detail.match(/ผู้แจ้ง:\s*(\d+)/);
  return m ? m[1] : "";
}
function repSeverity(r) { return WCU_SEVERITY[r.severity] ? r.severity : "unknown"; }
function repSevRank(r) { return WCU_SEVERITY[r.severity] ? WCU_SEVERITY[r.severity].rank : 2; }
function repRefundPending(r) { return !!r.refundRequested && (r.refundStatus || "pending") === "pending"; }

// ใบแจ้งนี้เป็นของเครื่องไหน (ผูกด้วย uid เท่านั้น ไม่เดาจากชื่อ เพื่อไม่ให้จับผิดเครื่อง)
function repMachine(r, machineMap) {
  if (r.machineUid && machineMap.has(r.machineUid)) {
    const m = machineMap.get(r.machineUid);
    return { machine: m, uid: m.uid, category: m.category, name: `${CATEGORY_LABEL[m.category]} ${m.id}`, deleted: false };
  }
  if (r.machineUid) {
    const cat = /เตารีด/.test(r.machineLabel || r.topic || "") ? "iron" : "washer";
    return { machine: null, uid: r.machineUid, category: cat, name: `${r.machineLabel || r.topic || "เครื่องเดิม"} (ลบแล้ว)`, deleted: true };
  }
  const cat = /เตารีด/.test(r.topic || "") ? "iron" : /เครื่องซัก/.test(r.topic || "") ? "washer" : null;
  return { machine: null, uid: null, category: cat, name: null, deleted: false };
}

function repStatusPill(status) {
  const s = REPORT_STATUS[status];
  return `<span class="status-pill ${s.cls}">${REPORT_ICONS[status]}${s.label}</span>`;
}
function repSevBadge(r) {
  const key = repSeverity(r);
  if (key === "unknown") return "";
  return `<span class="sev-badge sev-${key}"><i style="background:${SEV_COLORS[key]}"></i>${WCU_SEVERITY[key].label}</span>`;
}
function repRefundChip(r) {
  if (!r.refundRequested) return "";
  const amount = formatBaht(Number(r.moneyLost) || 0);
  if (r.refundStatus === "refunded") return `<span class="refund-chip done">${WcuIcon.ui("cash")} คืนเงินแล้ว ${amount}</span>`;
  if (r.refundStatus === "rejected") return `<span class="refund-chip muted">${WcuIcon.ui("cash")} ไม่อนุมัติคืนเงิน</span>`;
  return `<span class="refund-chip">${WcuIcon.ui("cash")} ขอคืนเงิน ${amount}</span>`;
}

// ใช้ในหน้าต่างตั้งค่าเครื่อง: ใบแจ้งที่ยังไม่ปิดของเครื่องนี้ (ใบล่าสุด)
function findOpenReportForMachine(machine) {
  const open = wcuOpenReportsForMachine(machine.uid);
  if (open.length) return open[0];
  const exact = `${CATEGORY_LABEL[machine.category]} · เครื่อง ${machine.id}`;
  return wcuGetReports().find((r) => !r.machineUid && !r.resolved && r.topic === exact) || null;
}

function repSearchText(r, info) {
  return [repCode(r.id), r.id, info.name || "ยังไม่ระบุเครื่อง", repStudent(r), repIssues(r).join(" "), repExtra(r), r.adminNote, r.contact,
    WCU_SEVERITY[r.severity] ? WCU_SEVERITY[r.severity].label : ""].join(" ").toLowerCase();
}

// หน้ารายการ

function renderReports(force = true) {
  const view = document.getElementById("view-reports");
  if (!view) return;
  const machines = wcuGetMachines();
  const signature = [
    localStorage.getItem(WCU_KEYS.reports) || "",
    JSON.stringify(machines.map((m) => [m.uid, m.id, m.category, m.status])),
    repState.tab, repState.filter, repState.sort, repState.query, repState.statsOpen, Math.floor(Date.now() / 60000),
  ].join("|");
  if (!force && signature === repState.sig) return;
  repState.sig = signature;
  // ใบแจ้งที่ข้อมูลเสีย 1 ใบต้องไม่ทำให้ทั้งหน้าว่าง และต้องลองวาดใหม่รอบถัดไป
  try {
    repRenderList(machines);
  } catch (err) {
    repState.sig = "";
    console.error("[reports] วาดรายการไม่สำเร็จ", err);
  }
}

function repRenderList(machines) {
  const machineMap = new Map(machines.map((m) => [m.uid, m]));
  const reports = wcuGetReports();
  const all = reports.map((r) => ({ r, info: repMachine(r, machineMap), status: wcuReportStatus(r) }));

  repRenderKpis(all);
  repRenderStats(all);

  // --- แท็บสถานะ (การ์ด 3 ใบ) — ถ้ากำลังค้นหาหรือดูคำขอคืนเงิน จะแสดงผลจากทุกสถานะ
  const crossStatus = repState.query.trim() !== "" || repState.filter === "refund";
  const byStatus = { new: 0, in_progress: 0, resolved: 0 };
  all.forEach((x) => { byStatus[x.status] += 1; });
  Object.keys(byStatus).forEach((k) => setText(`rs-count-${k}`, byStatus[k].toLocaleString("th-TH")));
  document.querySelectorAll("#view-reports [data-rtab]").forEach((b) => {
    const active = !crossStatus && b.dataset.rtab === repState.tab;
    b.classList.toggle("active", active);
    b.setAttribute("aria-pressed", String(active));
  });

  // --- ข้อความสรุปสั้น
  const topIssue = repIssueCounts(all)[0];
  const openUnassigned = all.filter((x) => x.status !== "resolved" && !x.info.name).length;
  const openDanger = all.filter((x) => x.status !== "resolved" && x.r.severity === "danger").length;
  const insights = [];
  if (openDanger) insights.push(`<span class="ins danger">${WcuIcon.ui("zap")}มีเคสอันตรายค้าง ${openDanger} ใบ</span>`);
  if (openUnassigned) insights.push(`<span class="ins warn">${WcuIcon.ui("alert")}ยังไม่ระบุเครื่อง ${openUnassigned} ใบ</span>`);
  if (topIssue) insights.push(`<span class="ins">อาการที่เจอบ่อยสุด: ${escapeHtml(topIssue[0])} (${topIssue[1]} ครั้ง)</span>`);
  document.getElementById("report-insight").innerHTML = insights.join(`<span class="ins-sep">·</span>`);

  // --- ตัวกรอง
  const scope = crossStatus ? all : all.filter((x) => x.status === repState.tab);
  const filterDefs = [
    { key: "all", label: "ทั้งหมด", test: () => true },
    { key: "washer", label: "เครื่องซักผ้า", test: (x) => x.info.category === "washer" && x.info.name },
    { key: "iron", label: "เตารีด", test: (x) => x.info.category === "iron" && x.info.name },
    { key: "unassigned", label: "ยังไม่ระบุเครื่อง", test: (x) => !x.info.name },
    { key: "danger", label: `${WcuIcon.ui("zap")}อันตราย`, test: (x) => x.r.severity === "danger" },
    { key: "refund", label: `${WcuIcon.ui("cash")}ขอคืนเงิน`, test: (x) => repRefundPending(x.r) },
  ];
  document.getElementById("report-filters").innerHTML = filterDefs
    .map((f) => ({ ...f, count: (f.key === "refund" ? all : scope).filter(f.test).length }))
    .filter((f) => f.key === "all" || f.count > 0 || f.key === repState.filter)
    .map((f) => `<button type="button" class="chip-btn${repState.filter === f.key ? " active" : ""}" data-rfilter="${f.key}">${f.label} ${f.count}</button>`)
    .join("");
  const filter = filterDefs.find((f) => f.key === repState.filter) || filterDefs[0];

  // --- ค้นหา + เรียงลำดับ
  const q = repState.query.trim().toLowerCase();
  const shown = scope
    .filter(filter.test)
    .filter((x) => !q || repSearchText(x.r, x.info).includes(q))
    .sort((a, b) => {
      if (repState.sort === "severity") return (repSevRank(b.r) - repSevRank(a.r)) || (repTs(a.r.createdAt) - repTs(b.r.createdAt));
      if (repState.sort === "oldest") return repTs(a.r.createdAt) - repTs(b.r.createdAt);
      if (!crossStatus && repState.tab === "resolved") return repTs(b.r.resolvedAt || b.r.createdAt) - repTs(a.r.resolvedAt || a.r.createdAt);
      return repTs(b.r.createdAt) - repTs(a.r.createdAt);
    });

  const list = document.getElementById("report-list");
  const note = crossStatus ? `<p class="rep-scope">แสดงผลจากทุกสถานะ · พบ ${shown.length} ใบ <button type="button" class="link-btn" data-clear-scope>ล้างการค้นหา</button></p>` : "";
  if (!shown.length) {
    const empty = { new: "ไม่มีใบแจ้งซ่อมที่รอตรวจสอบ", in_progress: "ไม่มีงานที่กำลังซ่อมอยู่", resolved: "ยังไม่มีงานที่ซ่อมเสร็จ" };
    list.innerHTML = note + `<div class="empty-state">${crossStatus || repState.filter !== "all" ? "ไม่พบใบแจ้งที่ตรงกับเงื่อนไข" : empty[repState.tab]}</div>`;
    return;
  }
  list.innerHTML = note + shown.map((x, i) => repCardHtml(x.r, x.info, i)).join("");
}

function repIssueCounts(all) {
  const counts = {};
  all.forEach((x) => repIssues(x.r).forEach((i) => { counts[i] = (counts[i] || 0) + 1; }));
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function repRenderKpis(all) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const thisMonth = all.filter((x) => repTs(x.r.createdAt) >= monthStart).length;
  setText("rk-total", `${all.length.toLocaleString("th-TH")} ใบ`);
  setText("rk-total-sub", `เดือนนี้ ${thisMonth} ใบ · ยังไม่ปิด ${all.filter((x) => x.status !== "resolved").length} ใบ`);

  const response = all.filter((x) => x.r.startedAt).map((x) => repTs(x.r.startedAt) - repTs(x.r.createdAt)).filter((d) => d >= 0);
  setText("rk-response", response.length ? repDuration(repAvg(response)) : "-");
  const fix = all.filter((x) => x.status === "resolved" && x.r.resolvedAt).map((x) => repTs(x.r.resolvedAt) - repTs(x.r.createdAt)).filter((d) => d >= 0);
  setText("rk-fix", fix.length ? repDuration(repAvg(fix)) : "-");
  setText("rk-fix-sub", fix.length ? `จาก ${fix.length} ใบที่ซ่อมเสร็จ` : "ยังไม่มีงานที่ซ่อมเสร็จ");
  const costs = all.map((x) => Number(x.r.repairCost) || 0).filter((c) => c > 0);
  setText("rk-cost", formatBaht(costs.reduce((a, b) => a + b, 0)));
  setText("rk-cost-sub", costs.length ? `จาก ${costs.length} ใบ · เฉลี่ย ${formatBaht(Math.round(repAvg(costs)))}` : "ยังไม่มีค่าซ่อม");

  const refunds = all.filter((x) => repRefundPending(x.r));
  const alert = document.getElementById("refund-alert");
  alert.hidden = !refunds.length;
  if (refunds.length) {
    const sum = refunds.reduce((a, x) => a + (Number(x.r.moneyLost) || 0), 0);
    alert.innerHTML = `<span class="ra-icon">${WcuIcon.ui("cash")}</span><span class="ra-text"><b>มีคำขอคืนเงินรอดำเนินการ ${refunds.length} ใบ</b><small>รวม ${formatBaht(sum)} · แตะเพื่อดูรายการ</small></span><span class="ra-go">›</span>`;
  }
}

function repRenderStats(all) {
  const body = document.getElementById("rep-stats-body");
  const toggle = document.getElementById("rep-stats-toggle");
  body.hidden = !repState.statsOpen;
  toggle.setAttribute("aria-expanded", String(repState.statsOpen));
  toggle.classList.toggle("open", repState.statsOpen);
  if (!repState.statsOpen) return;

  const bars = (rows, max, empty) => rows.length ? rows.map((row) => `
    <div class="hbar">
      <span class="hbar-label">${row.label}</span>
      <span class="hbar-track"><span class="hbar-fill" style="width: ${Math.max(4, (row.value / max) * 100)}%"></span></span>
      <span class="hbar-value">${row.valueText}</span>
    </div>`).join("") : `<p class="chart-empty small">${empty}</p>`;

  const issues = repIssueCounts(all).slice(0, 6);
  document.getElementById("rep-issue-bars").innerHTML = bars(
    issues.map(([name, n]) => ({ label: `${wcuIssueIcon(name)} ${escapeHtml(name)}`, value: n, valueText: `${n} ครั้ง` })),
    issues.length ? issues[0][1] : 1, "ยังไม่มีข้อมูลอาการ");

  const byMachine = {};
  all.filter((x) => x.info.name).forEach((x) => {
    const m = byMachine[x.info.uid] || (byMachine[x.info.uid] = { name: x.info.name, total: 0, open: 0 });
    m.total += 1;
    if (x.status !== "resolved") m.open += 1;
  });
  const machines = Object.values(byMachine).sort((a, b) => b.total - a.total || b.open - a.open).slice(0, 5);
  document.getElementById("rep-machine-bars").innerHTML = bars(
    machines.map((m) => ({ label: escapeHtml(m.name), value: m.total, valueText: `${m.total} ครั้ง${m.open ? ` (${m.open})` : ""}` })),
    machines.length ? machines[0].total : 1, "ยังไม่มีใบแจ้งที่ระบุเครื่อง");

  const sev = { danger: 0, unusable: 0, minor: 0, unknown: 0 };
  all.forEach((x) => { sev[repSeverity(x.r)] += 1; });
  const total = all.length || 1;
  const order = ["danger", "unusable", "minor", "unknown"];
  const label = (k) => (k === "unknown" ? "ไม่ระบุ" : WCU_SEVERITY[k].label);
  const stack = document.getElementById("rep-sev-stack");
  stack.innerHTML = order.filter((k) => sev[k]).map((k) =>
    `<span style="flex: ${sev[k]} 1 0; background: ${SEV_COLORS[k]}" title="${label(k)} ${sev[k]} ใบ"></span>`).join("");
  stack.setAttribute("aria-label", order.map((k) => `${label(k)} ${sev[k]} ใบ`).join(", "));
  document.getElementById("rep-sev-legend").innerHTML = order.filter((k) => sev[k] || k !== "unknown").map((k) =>
    `<span><i style="background:${SEV_COLORS[k]}"></i>${label(k)} <b>${sev[k]}</b> <small>(${Math.round((sev[k] / total) * 100)}%)</small></span>`).join("");
}

function repCardHtml(r, info, index) {
  const status = wcuReportStatus(r);
  const created = repTs(r.createdAt);
  const issues = repIssues(r);
  const extra = repExtra(r);
  const student = repStudent(r);
  const photos = wcuReportPhotos(r);
  const icon = info.category === "iron" ? WcuIcon.iron() : WcuIcon.washer();
  const waited = status === "resolved"
    ? (r.resolvedAt ? `ซ่อมเสร็จใน ${repDuration(repTs(r.resolvedAt) - created)}` : "ซ่อมเสร็จแล้ว")
    : `รอมาแล้ว ${repDuration(Date.now() - created)}`;
  const late = status !== "resolved" && Date.now() - created > 24 * 60 * 60 * 1000;
  const quick = status === "new"
    ? `<button type="button" class="rc-action" data-quick="start">${REPORT_ICONS.in_progress}เริ่มซ่อม</button>`
    : status === "in_progress"
      ? `<button type="button" class="rc-action done" data-quick="resolve">${REPORT_ICONS.resolved}ซ่อมเสร็จ</button>`
      : `<span class="rc-link">ดูรายละเอียด ›</span>`;

  return `
    <article class="report-card ${REPORT_STATUS[status].cls}${r.severity === "danger" && status !== "resolved" ? " is-danger" : ""}" data-id="${escapeHtml(r.id)}" tabindex="0" role="button"
      aria-label="${escapeHtml(`ใบแจ้งซ่อม ${info.name || "ยังไม่ระบุเครื่อง"} ${REPORT_STATUS[status].label}`)}" style="animation-delay: ${Math.min(index, 8) * 0.04}s">
      <div class="rc-top">
        <span class="rc-icon">${icon}</span>
        <div class="rc-head">
          <h4 class="rc-machine${info.name ? "" : " unassigned"}">${escapeHtml(info.name || (info.category ? `${CATEGORY_LABEL[info.category]} · ยังไม่ระบุเครื่อง` : "ยังไม่ระบุเครื่อง"))}</h4>
          <span class="rc-time">${escapeHtml(repCode(r.id))} · แจ้งเมื่อ ${escapeHtml(repAgo(created))}</span>
        </div>
        ${repStatusPill(status)}
      </div>
      <div class="rc-body">
        <div class="rc-main">
          <div class="rc-badges">${repSevBadge(r)}${r.occurredWhen && WCU_OCCURRED[r.occurredWhen] ? `<span class="when-badge">${WcuIcon.ui("clock")}${WCU_OCCURRED[r.occurredWhen]}</span>` : ""}${repRefundChip(r)}</div>
          <div class="report-issues">
            ${issues.length ? issues.map((x) => `<span class="issue-chip${status === "resolved" ? " resolved" : ""}">${wcuIssueIcon(x)} ${escapeHtml(x)}</span>`).join("") : `<span class="issue-chip muted">ไม่ได้ระบุอาการ</span>`}
            ${info.name ? "" : `<span class="issue-chip warn">${WcuIcon.ui("alert")} ต้องระบุเครื่อง</span>`}
          </div>
          ${extra ? `<p class="rc-extra">“${escapeHtml(extra)}”</p>` : ""}
          ${r.adminNote ? `<p class="rc-note"><strong>แอดมิน:</strong> ${escapeHtml(r.adminNote)}</p>` : ""}
        </div>
        ${photos.length ? `<span class="rc-thumb-wrap"><img class="rc-thumb" src="${escapeHtml(photos[0])}" alt="รูปหลักฐาน" loading="lazy">${photos.length > 1 ? `<span class="rc-thumb-count">${WcuIcon.ui("camera")}${photos.length}</span>` : ""}</span>` : ""}
      </div>
      <div class="rc-foot">
        <span class="rc-meta${late ? " late" : ""}">${student ? `นิสิต ${escapeHtml(student)} · ` : ""}${r.contact ? `${WcuIcon.ui("phone")} · ` : ""}${escapeHtml(waited)}${r.repairCost ? ` · ค่าซ่อม ${formatBaht(r.repairCost)}` : ""}</span>
        ${quick}
      </div>
    </article>`;
}

// หน้าต่างรายละเอียด

function openReportDetail(id, opts = {}) {
  const r = wcuGetReport(id);
  if (!r) { showToast("ไม่พบใบแจ้งซ่อม", "รายการนี้อาจถูกลบไปแล้ว", "error"); renderReports(true); return; }
  if (repState.openId !== id) repState.photoIndex = 0;
  repState.openId = id;
  const machines = wcuGetMachines();
  const machineMap = new Map(machines.map((m) => [m.uid, m]));
  const info = repMachine(r, machineMap);
  const status = wcuReportStatus(r);
  const created = repTs(r.createdAt);

  repRenderGallery(r, info);
  setText("rd-title", info.name || "ยังไม่ระบุเครื่อง");
  document.getElementById("rd-title").classList.toggle("unassigned", !info.name);
  document.getElementById("rd-status-pill").innerHTML = repStatusPill(status);
  setText("rd-code", `ใบแจ้ง ${repCode(r.id)}`);
  document.getElementById("rd-badges").innerHTML = repSevBadge(r) + repRefundChip(r);

  // --- ข้อมูลผู้แจ้ง
  const student = repStudent(r);
  setText("rd-student", student || "ไม่ระบุ");
  const fromSameStudent = student ? wcuGetReports().filter((x) => repStudent(x) === student).length : 0;
  setText("rd-student-history", student ? (fromSameStudent > 1 ? `แจ้งมาแล้วทั้งหมด ${fromSameStudent} ครั้ง` : "แจ้งครั้งแรก") : "");
  const contactEl = document.getElementById("rd-contact");
  const digits = String(r.contact || "").replace(/\D/g, "");
  contactEl.innerHTML = r.contact
    ? (digits.length >= 9 && !/line/i.test(r.contact) ? `<a href="tel:${digits}">${WcuIcon.ui("phone")} ${escapeHtml(r.contact)}</a>` : escapeHtml(r.contact))
    : `<span class="muted">ไม่ได้ให้ไว้</span>`;
  setText("rd-time", repDateTime(created));
  setText("rd-ago", status === "resolved" && r.resolvedAt ? `ซ่อมเสร็จใน ${repDuration(repTs(r.resolvedAt) - created)}` : `รอมาแล้ว ${repDuration(Date.now() - created)}`);
  setText("rd-when", r.occurredWhen && WCU_OCCURRED[r.occurredWhen] ? WCU_OCCURRED[r.occurredWhen] : "ไม่ระบุ");
  const stateText = info.machine
    ? { available: "ว่าง / ใช้งานได้", busy: "กำลังใช้งาน", broken: "ปิดใช้งาน (มีปัญหา)" }[info.machine.status] || info.machine.status
    : info.deleted ? "เครื่องถูกลบออกจากระบบแล้ว" : "ยังไม่ระบุเครื่อง";
  setText("rd-machine-state", stateText);
  repRenderRefund(r);

  const issues = repIssues(r);
  document.getElementById("rd-issues").innerHTML = issues.length
    ? issues.map((x) => `<span class="issue-chip">${wcuIssueIcon(x)} ${escapeHtml(x)}</span>`).join("")
    : `<span class="issue-chip muted">ไม่ได้ระบุอาการ</span>`;
  const extra = repExtra(r);
  setText("rd-extra", extra || "ผู้แจ้งไม่ได้เขียนรายละเอียดเพิ่มเติม");
  document.getElementById("rd-extra").classList.toggle("muted", !extra);

  // --- ความคืบหน้า 3 ขั้น
  const steps = [
    { done: true, title: "แจ้งปัญหาเข้ามา", sub: `${repDateTime(created)}${student ? ` · นิสิต ${student}` : ""}` },
    { done: !!r.startedAt || status !== "new", title: "เริ่มตรวจสอบ / ซ่อม", sub: r.startedAt ? `${repDateTime(repTs(r.startedAt))} · หลังแจ้ง ${repDuration(repTs(r.startedAt) - created)}` : "ยังไม่เริ่ม" },
    { done: status === "resolved", title: "ซ่อมเสร็จ เปิดใช้งานเครื่อง", sub: r.resolvedAt ? `${repDateTime(repTs(r.resolvedAt))} · ใช้เวลารวม ${repDuration(repTs(r.resolvedAt) - created)}` : "ยังไม่เสร็จ" },
  ];
  document.getElementById("rd-timeline").innerHTML = steps.map((s) => `
    <li class="${s.done ? "done" : ""}"><span class="tl-dot"></span><div><strong>${escapeHtml(s.title)}</strong><span>${escapeHtml(s.sub)}</span></div></li>`).join("");

  // --- ประวัติของเครื่องนี้
  const hist = document.getElementById("rd-machine-history");
  if (!info.uid) {
    hist.innerHTML = `<p class="rd-empty">ระบุเครื่องด้านล่างก่อน จึงจะเห็นประวัติการแจ้งซ่อมของเครื่อง</p>`;
  } else {
    const others = wcuGetReports().filter((x) => x.machineUid === info.uid && x.id !== r.id);
    hist.innerHTML = others.length
      ? `<p class="rd-hist-sum">เครื่องนี้เคยถูกแจ้งซ่อม ${others.length} ครั้ง (ไม่รวมใบนี้)</p>` + others.slice(0, 5).map((x) => `
          <button type="button" class="rd-hist-row" data-open-report="${escapeHtml(x.id)}">
            <span class="rd-hist-date">${escapeHtml(repDateTime(repTs(x.createdAt)))}</span>
            <span class="rd-hist-issue">${escapeHtml(repIssues(x).join(", ") || repExtra(x) || "ไม่ระบุอาการ")}</span>
            ${repStatusPill(wcuReportStatus(x))}
          </button>`).join("")
      : `<p class="rd-empty">ยังไม่เคยมีการแจ้งซ่อมเครื่องนี้มาก่อน</p>`;
  }
  repRenderLog(r);

  // --- ฟอร์มของแอดมิน
  const sel = document.getElementById("rd-machine");
  const group = (cat) => machines.filter((m) => m.category === cat).sort((a, b) => compareMachineLabel(a.id, b.id))
    .map((m) => `<option value="${escapeHtml(m.uid)}">${escapeHtml(`${CATEGORY_LABEL[m.category]} ${m.id}`)}${m.status === "broken" ? " (มีปัญหา)" : ""}</option>`).join("");
  sel.innerHTML = `<option value="">— ยังไม่ระบุ —</option>
    <optgroup label="เครื่องซักผ้า">${group("washer")}</optgroup>
    <optgroup label="เตารีด">${group("iron")}</optgroup>
    ${info.deleted ? `<option value="${escapeHtml(info.uid)}">${escapeHtml(info.name)}</option>` : ""}`;
  sel.value = info.uid || "";
  document.getElementById("rd-note").value = r.adminNote || "";
  document.getElementById("rd-cost").value = r.repairCost ? r.repairCost : "";
  repSetDraftStatus(opts.status || status);
  repUpdateHints();

  const modal = document.getElementById("report-modal");
  const wasOpen = !modal.hidden;
  modal.hidden = false;
  if (!wasOpen || opts.scrollTop) document.querySelector("#report-modal .modal-card").scrollTop = 0;
  if (opts.focusCost) setTimeout(() => {
    const cost = document.getElementById("rd-cost");
    cost.scrollIntoView({ block: "center" });
    cost.focus();
  }, 80);
}

function repRenderGallery(r, info) {
  const photos = wcuReportPhotos(r);
  const box = document.getElementById("rd-photo");
  const thumbs = document.getElementById("rd-thumbs");
  if (repState.photoIndex >= photos.length) repState.photoIndex = 0;
  if (photos.length) {
    const src = photos[repState.photoIndex];
    box.innerHTML = `<img src="${escapeHtml(src)}" alt="รูปหลักฐานจากผู้แจ้ง รูปที่ ${repState.photoIndex + 1}"><span class="rd-zoom">${WcuIcon.ui("zoom")} แตะเพื่อขยาย${photos.length > 1 ? ` · ${repState.photoIndex + 1}/${photos.length}` : ""}</span>`;
    box.classList.remove("empty");
    box.dataset.src = src;
  } else {
    box.innerHTML = `<span class="rd-photo-icon">${info.category === "iron" ? WcuIcon.iron() : WcuIcon.washer()}</span><span>ผู้แจ้งไม่ได้แนบรูป</span>`;
    box.classList.add("empty");
    delete box.dataset.src;
  }
  thumbs.hidden = photos.length < 2;
  thumbs.innerHTML = photos.length < 2 ? "" : photos.map((src, i) =>
    `<button type="button" class="${i === repState.photoIndex ? "active" : ""}" data-photo-index="${i}" aria-label="ดูรูปที่ ${i + 1}"><img src="${escapeHtml(src)}" alt=""></button>`).join("");
}

function repRenderRefund(r) {
  const box = document.getElementById("rd-refund");
  const lost = Number(r.moneyLost) || 0;
  if (!r.refundRequested && !lost) { box.hidden = true; box.innerHTML = ""; return; }
  box.hidden = false;
  box.className = "rd-refund";
  if (!r.refundRequested) {
    box.innerHTML = `<div class="rr-text"><b>${WcuIcon.ui("cash")} นิสิตแจ้งว่าเสียเงิน ${formatBaht(lost)}</b><small>ไม่ได้ขอคืนเงิน</small></div>`;
    return;
  }
  const st = r.refundStatus || "pending";
  if (st === "refunded") {
    box.classList.add("done");
    box.innerHTML = `<div class="rr-text"><b>${WcuIcon.ui("check")} คืนเงิน ${formatBaht(lost)} ให้นิสิตแล้ว</b><small>${r.refundedAt ? escapeHtml(repDateTime(r.refundedAt)) : ""} · บันทึกในหน้ารายจ่ายแล้ว</small></div>
      <button type="button" class="rr-btn ghost" data-refund="undo">ยกเลิก</button>`;
  } else if (st === "rejected") {
    box.classList.add("muted");
    box.innerHTML = `<div class="rr-text"><b>ไม่อนุมัติคำขอคืนเงิน ${formatBaht(lost)}</b><small>${r.refundedAt ? escapeHtml(repDateTime(r.refundedAt)) : ""}</small></div>
      <button type="button" class="rr-btn ghost" data-refund="undo">ยกเลิก</button>`;
  } else {
    box.innerHTML = `<div class="rr-text"><b>${WcuIcon.ui("cash")} นิสิตเสียเงิน ${formatBaht(lost)} และขอคืนเงิน</b><small>หยอดเหรียญแล้วเครื่องใช้งานไม่ได้</small></div>
      <div class="rr-actions"><button type="button" class="rr-btn" data-refund="refund">คืนเงินแล้ว</button><button type="button" class="rr-btn ghost" data-refund="reject">ไม่อนุมัติ</button></div>`;
  }
}

function repRenderLog(r) {
  const log = (Array.isArray(r.log) && r.log.length ? r.log : [wcuLogEntry("นิสิตแจ้งปัญหาผ่านหน้าเว็บ", "student", repTs(r.createdAt))])
    .slice().sort((a, b) => repTs(b.at) - repTs(a.at));
  document.getElementById("rd-log").innerHTML = log.map((e) => `
    <li><span class="log-by ${e.by === "student" ? "student" : "admin"}">${e.by === "student" ? "นิสิต" : "แอดมิน"}</span>
      <div><p>${escapeHtml(e.text)}</p><small>${escapeHtml(repDateTime(repTs(e.at)))}</small></div></li>`).join("");
}

function repSetDraftStatus(status) {
  repState.draftStatus = status;
  document.querySelectorAll("#rd-status-seg [data-rstatus]").forEach((b) => {
    const on = b.dataset.rstatus === status;
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", String(on));
  });
  repUpdateHints();
}

function repUpdateHints() {
  const machineUid = document.getElementById("rd-machine").value;
  const status = repState.draftStatus;
  let hint = "";
  if (!machineUid) hint = "ยังไม่ได้ระบุเครื่อง ระบบจะเปลี่ยนสถานะเครื่องให้อัตโนมัติไม่ได้ (ดูเลขเครื่องได้จากรูปหลักฐาน)";
  else if (status === "resolved") hint = "เมื่อบันทึก เครื่องนี้จะกลับมาเปิดให้นักศึกษาใช้งาน";
  else hint = "ระหว่างนี้เครื่องจะแสดงเป็น \"มีปัญหา\" ให้นักศึกษาเห็น";
  setText("rd-machine-hint", hint);
  document.getElementById("rd-machine-hint").classList.toggle("warn", !machineUid);
  document.getElementById("rd-goto-machine").disabled = !wcuGetMachines().some((m) => m.uid === machineUid);
}

function saveReportDetail(e) {
  e.preventDefault();
  const r = wcuGetReport(repState.openId);
  if (!r) return;
  const now = Date.now();
  const machines = wcuGetMachines();
  const machineMap = new Map(machines.map((m) => [m.uid, m]));
  const prevStatus = wcuReportStatus(r);
  const status = repState.draftStatus;
  const machineUid = document.getElementById("rd-machine").value || null;
  const machine = machineUid ? machineMap.get(machineUid) : null;
  const note = document.getElementById("rd-note").value.trim().slice(0, 300);
  const cost = sanitizePrice(document.getElementById("rd-cost").value);

  const patch = {
    machineUid,
    machineLabel: machine ? wcuMachineLabel(machine) : (machineUid ? r.machineLabel || "" : ""),
    status,
    resolved: status === "resolved",
    adminNote: note,
    startedAt: status === "new" ? null : (r.startedAt || now),
    resolvedAt: status === "resolved" ? (prevStatus === "resolved" ? r.resolvedAt || now : now) : null,
  };
  if (machine) patch.topic = `${CATEGORY_LABEL[machine.category]} · เครื่อง ${machine.id}`;

  // --- บันทึกการเปลี่ยนแปลงลงประวัติ
  const changes = [];
  if ((r.machineUid || null) !== machineUid) changes.push(machine ? `ระบุเครื่อง: ${CATEGORY_LABEL[machine.category]} ${machine.id}` : "ยกเลิกการระบุเครื่อง");
  if (status !== prevStatus) changes.push(`เปลี่ยนสถานะเป็น "${REPORT_STATUS[status].label}"`);
  if (note && note !== (r.adminNote || "")) changes.push(`บันทึก: ${note}`);

  // --- ค่าซ่อม → หน้ารายจ่าย (สร้าง / แก้ / ลบ ตามช่องค่าซ่อม)
  const existing = r.expenseId ? wcuGetExpenses().find((x) => x.id === r.expenseId) : null;
  const expenseNote = `ซ่อมตามใบแจ้ง ${repCode(r.id)}: ${repIssues(r).join(", ") || repExtra(r) || "-"}${note ? ` (${note})` : ""}`.slice(0, 120);
  let costMsg = "";
  if (cost > 0) {
    if (existing) {
      wcuUpdateExpense(existing.id, { amount: cost, machineUid, note: expenseNote });
      if (existing.amount !== cost) { costMsg = ` · แก้ค่าซ่อมเป็น ${formatBaht(cost)}`; changes.push(`แก้ค่าซ่อมเป็น ${formatBaht(cost)}`); }
    } else if (cost !== (Number(r.repairCost) || 0)) {
      // สร้างรายจ่ายใหม่เฉพาะตอนแก้ตัวเลขค่าซ่อม (กดบันทึกซ้ำเฉยๆ ต้องไม่สร้างรายจ่ายซ้ำ/คืนชีพรายการที่ลบไปแล้ว)
      const exp = wcuAddExpense({ category: "repair", amount: cost, date: wcuDateKey(now), machineUid, note: expenseNote });
      patch.expenseId = exp.id;
      costMsg = ` · บันทึกค่าซ่อม ${formatBaht(cost)} ในหน้ารายจ่ายแล้ว`;
      changes.push(`บันทึกค่าซ่อม ${formatBaht(cost)}`);
    }
  } else if (existing) {
    wcuDeleteExpense(existing.id);
    patch.expenseId = null;
    costMsg = " · ลบค่าซ่อมออกจากหน้ารายจ่ายแล้ว";
    changes.push("ลบค่าซ่อม");
  }
  patch.repairCost = cost;
  if (changes.length) patch.log = (Array.isArray(r.log) ? r.log : []).concat(wcuLogEntry(changes.join(" · "), "admin", now));
  wcuUpdateReport(r.id, patch);

  // --- สถานะเครื่องให้ตรงกับใบแจ้งซ่อม
  let machineMsg = "";
  const oldUid = r.machineUid;
  if (oldUid && oldUid !== machineUid) {
    const old = machineMap.get(oldUid);
    if (old && old.status === "broken" && !wcuOpenReportsForMachine(oldUid).length) wcuSetMachineStatus(oldUid, "available");
    if (old && old.status === "busy" && old.needsRepair && !wcuOpenReportsForMachine(oldUid).length) wcuSetNeedsRepair(oldUid, false);
  }
  if (machine) {
    if (status === "resolved") {
      if (machine.status === "broken" && !wcuOpenReportsForMachine(machine.uid).length) {
        wcuSetMachineStatus(machine.uid, "available");
        machineMsg = ` · ${CATEGORY_LABEL[machine.category]} ${machine.id} กลับมาใช้งานได้แล้ว`;
      }
    } else if (machine.status === "available") {
      wcuSetMachineStatus(machine.uid, "broken");
      machineMsg = ` · ปิดใช้งาน ${CATEGORY_LABEL[machine.category]} ${machine.id} ระหว่างซ่อม`;
    }
    // เครื่องกำลังซักอยู่: ซักเสร็จแล้วให้เปลี่ยนเป็น "มีปัญหา" เอง (ทำงานได้แม้เปิดแค่หน้า demo)
    if (machine.status === "busy") {
      const want = wcuOpenReportsForMachine(machine.uid).length > 0;
      if (!!machine.needsRepair !== want) wcuSetNeedsRepair(machine.uid, want);
      if (want) machineMsg = ` · ${CATEGORY_LABEL[machine.category]} ${machine.id} จะปิดใช้งานเองเมื่อซักเสร็จ`;
    }
  }

  closeModal("report-modal");
  if (status !== prevStatus) repState.tab = status;
  if (repState.filter !== "refund") repState.filter = "all";
  showToast("บันทึกใบแจ้งซ่อมแล้ว", `สถานะ: ${REPORT_STATUS[status].label}${machineMsg}${costMsg}`, "success");
  renderReports(true);
  renderMachinesGrid(true);
}

function repRefundAction(action) {
  const r = wcuGetReport(repState.openId);
  if (!r) return;
  const now = Date.now();
  const amount = Number(r.moneyLost) || 0;
  const patch = {};
  let text = "";
  if (action === "refund") {
    const exp = wcuAddExpense({ category: "other", amount, date: wcuDateKey(now), machineUid: r.machineUid || null, note: `คืนเงินนิสิต ${repStudent(r) || ""} (ใบแจ้ง ${repCode(r.id)})` });
    Object.assign(patch, { refundStatus: "refunded", refundedAt: now, refundExpenseId: exp.id });
    text = `คืนเงิน ${formatBaht(amount)} ให้นิสิตแล้ว (บันทึกในหน้ารายจ่าย)`;
  } else if (action === "reject") {
    Object.assign(patch, { refundStatus: "rejected", refundedAt: now });
    text = "ไม่อนุมัติคำขอคืนเงิน";
  } else {
    if (r.refundExpenseId) wcuDeleteExpense(r.refundExpenseId);
    Object.assign(patch, { refundStatus: "pending", refundedAt: null, refundExpenseId: null });
    text = "ยกเลิกผลคำขอคืนเงิน (กลับเป็นรอดำเนินการ)";
  }
  patch.log = (Array.isArray(r.log) ? r.log : []).concat(wcuLogEntry(text, "admin", now));
  const updated = wcuUpdateReport(r.id, patch);
  showToast(action === "refund" ? "บันทึกการคืนเงินแล้ว" : "อัปเดตคำขอคืนเงินแล้ว", text, "success");
  repRenderRefund(updated);
  repRenderLog(updated);
  document.getElementById("rd-badges").innerHTML = repSevBadge(updated) + repRefundChip(updated);
  renderReports(true);
}

// ข้อความสรุปสำหรับส่งช่าง / กลุ่ม LINE
function repCopyForTechnician() {
  const r = wcuGetReport(repState.openId);
  if (!r) return;
  const info = repMachine(r, new Map(wcuGetMachines().map((m) => [m.uid, m])));
  const lines = [
    `[แจ้งซ่อม ${repCode(r.id)}] ${info.name || "ยังไม่ระบุเครื่อง"}`,
    `อาการ: ${repIssues(r).join(", ") || "ไม่ระบุ"}`,
    `ความรุนแรง: ${WCU_SEVERITY[r.severity] ? WCU_SEVERITY[r.severity].label : "ไม่ระบุ"}${r.occurredWhen ? ` · พบตอน: ${WCU_OCCURRED[r.occurredWhen]}` : ""}`,
  ];
  if (repExtra(r)) lines.push(`รายละเอียด: ${repExtra(r)}`);
  lines.push(`แจ้งเมื่อ: ${repDateTime(repTs(r.createdAt))}${repStudent(r) ? ` โดยนิสิต ${repStudent(r)}` : ""}`);
  if (r.contact) lines.push(`ติดต่อผู้แจ้ง: ${r.contact}`);
  lines.push(`สถานะ: ${REPORT_STATUS[wcuReportStatus(r)].label}`);
  if (r.adminNote) lines.push(`บันทึกแอดมิน: ${r.adminNote}`);
  const text = lines.join("\n");

  const done = () => showToast("คัดลอกแล้ว", "วางข้อความใน LINE หรือแชทส่งช่างได้เลย", "success");
  const fallback = () => {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); done(); } catch (err) { showToast("คัดลอกไม่ได้", "เบราว์เซอร์นี้ไม่อนุญาตให้คัดลอกอัตโนมัติ", "error"); }
    ta.remove();
  };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback);
  else fallback();
}

function exportReportsCSV() {
  const machineMap = new Map(wcuGetMachines().map((m) => [m.uid, m]));
  const rows = [["หมายเลข", "วันที่แจ้ง", "เวลา", "เครื่อง", "อาการ", "ความรุนแรง", "พบตอน", "รหัสนิสิต", "ติดต่อกลับ", "สถานะ",
    "เริ่มซ่อม", "ซ่อมเสร็จ", "ใช้เวลาซ่อม (ชม.)", "ค่าซ่อม (บาท)", "ขอคืนเงิน (บาท)", "ผลคำขอคืนเงิน", "บันทึกแอดมิน"]];
  wcuGetReports().sort((a, b) => repTs(a.createdAt) - repTs(b.createdAt)).forEach((r) => {
    const info = repMachine(r, machineMap);
    const created = repTs(r.createdAt);
    const d = new Date(created);
    rows.push([
      repCode(r.id), wcuDateKey(created), `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
      info.name || "ยังไม่ระบุเครื่อง", repIssues(r).join(", "), WCU_SEVERITY[r.severity] ? WCU_SEVERITY[r.severity].label : "",
      r.occurredWhen ? WCU_OCCURRED[r.occurredWhen] : "", repStudent(r), r.contact || "", REPORT_STATUS[wcuReportStatus(r)].label,
      r.startedAt ? repDateTime(repTs(r.startedAt)) : "", r.resolvedAt ? repDateTime(repTs(r.resolvedAt)) : "",
      r.resolvedAt ? Math.round(((repTs(r.resolvedAt) - created) / 3600000) * 10) / 10 : "",
      Number(r.repairCost) || 0, r.refundRequested ? Number(r.moneyLost) || 0 : "",
      r.refundRequested ? { refunded: "คืนแล้ว", rejected: "ไม่อนุมัติ" }[r.refundStatus] || "รอดำเนินการ" : "", r.adminNote || "",
    ]);
  });
  finDownloadCSV(`washnclean-repair-reports-${wcuDateKey(Date.now())}.csv`, rows);
}

function askDeleteReport() {
  const r = wcuGetReport(repState.openId);
  if (!r) return;
  const open = !r.resolved;
  closeModal("report-modal");
  askConfirm({
    title: "ลบใบแจ้งซ่อมนี้?",
    desc: `ใบแจ้ง ${repCode(r.id)} จะถูกลบถาวร${open && r.machineUid ? " และถ้าเครื่องไม่มีใบแจ้งอื่นค้างอยู่ เครื่องจะกลับมาเปิดใช้งาน" : ""}${r.expenseId || r.refundExpenseId ? " (ค่าซ่อม/เงินคืนที่บันทึกในหน้ารายจ่ายจะยังอยู่)" : ""}`,
    okText: "ลบใบแจ้งซ่อม",
    onConfirm: () => {
      wcuDeleteReport(r.id);
      if (open && r.machineUid) {
        const m = wcuGetMachines().find((x) => x.uid === r.machineUid);
        if (m && m.status === "broken" && !wcuOpenReportsForMachine(m.uid).length) wcuSetMachineStatus(m.uid, "available");
        if (m && m.status === "busy" && m.needsRepair && !wcuOpenReportsForMachine(m.uid).length) wcuSetNeedsRepair(m.uid, false);
      }
      showToast("ลบใบแจ้งซ่อมแล้ว", "รายการถูกลบออกจากระบบ", "success");
      renderReports(true);
      renderMachinesGrid(true);
    },
    onCancel: () => { document.getElementById("report-modal").hidden = false; },
  });
}

// ปุ่มลัดบนการ์ด: "เริ่มซ่อม" ทำได้ทันที / "ซ่อมเสร็จ" เปิดหน้าต่างให้กรอกค่าซ่อมก่อน
function quickReportAction(id, action) {
  const r = wcuGetReport(id);
  if (!r) return;
  const machine = r.machineUid ? wcuGetMachines().find((m) => m.uid === r.machineUid) : null;
  if (action === "start") {
    if (!machine) {
      openReportDetail(id, { status: "in_progress", scrollTop: true });
      showToast("ระบุเครื่องก่อนเริ่มซ่อม", "เลือกเครื่องที่มีปัญหาในช่อง \"เครื่องที่มีปัญหา\" แล้วกดบันทึก", "error");
      return;
    }
    const now = Date.now();
    wcuUpdateReport(id, {
      status: "in_progress", resolved: false, startedAt: r.startedAt || now,
      log: (Array.isArray(r.log) ? r.log : []).concat(wcuLogEntry("เริ่มซ่อม · เปลี่ยนสถานะเป็น \"กำลังซ่อม\"", "admin", now)),
    });
    if (machine.status === "available") wcuSetMachineStatus(machine.uid, "broken");
    else if (machine.status === "busy" && !machine.needsRepair) wcuSetNeedsRepair(machine.uid, true);
    repState.tab = "in_progress";
    repState.filter = "all";
    showToast("เริ่มซ่อมแล้ว", `${CATEGORY_LABEL[machine.category]} ${machine.id} ย้ายไปที่ "กำลังซ่อม"`, "success");
    renderReports(true);
    renderMachinesGrid(true);
  } else if (action === "resolve") {
    openReportDetail(id, { status: "resolved", focusCost: true });
  }
}

// มาจากหน้าต่างตั้งค่าเครื่อง: เปิดแท็บแจ้งซ่อมแล้วเปิดใบนั้นเลย
function openReportFromMachine(id) {
  const r = wcuGetReport(id);
  if (!r) return;
  document.querySelector('.tab-item[data-target="reports"]').click();
  repState.tab = wcuReportStatus(r);
  repState.filter = "all";
  repState.query = "";
  document.getElementById("rep-search").value = "";
  renderReports(true);
  const card = document.querySelector(`.report-card[data-id="${CSS.escape(id)}"]`);
  if (card) {
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.add("highlight-pulse");
    setTimeout(() => card.classList.remove("highlight-pulse"), 2000);
  }
  openReportDetail(id);
}

function goToMachine(uid) {
  const m = wcuGetMachines().find((x) => x.uid === uid);
  if (!m) return;
  closeModal("report-modal");
  document.querySelector('.tab-item[data-target="machines"]').click();
  const seg = document.querySelector(`#view-machines .segment-btn[data-cat="${m.status === "broken" ? "broken" : m.category}"]`);
  if (seg) seg.click();
  openAdminModal(uid);
}

function setupReports() {
  const view = document.getElementById("view-reports");
  view.addEventListener("click", (e) => {
    const tab = e.target.closest("[data-rtab]");
    if (tab) {
      repState.tab = tab.dataset.rtab;
      repState.query = "";
      document.getElementById("rep-search").value = "";
      if (repState.filter === "refund") repState.filter = "all";
      renderReports(true);
      return;
    }
    const chip = e.target.closest("[data-rfilter]");
    if (chip) { repState.filter = chip.dataset.rfilter; renderReports(true); return; }
    if (e.target.closest("[data-clear-scope]")) {
      repState.query = "";
      document.getElementById("rep-search").value = "";
      if (repState.filter === "refund") repState.filter = "all";
      renderReports(true);
      return;
    }
    const card = e.target.closest(".report-card");
    if (!card) return;
    const quick = e.target.closest("[data-quick]");
    if (quick) { quickReportAction(card.dataset.id, quick.dataset.quick); return; }
    openReportDetail(card.dataset.id, { scrollTop: true });
  });
  view.addEventListener("keydown", (e) => {
    const card = e.target.closest(".report-card");
    if (card && e.target === card && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openReportDetail(card.dataset.id, { scrollTop: true }); }
  });

  document.getElementById("rep-search").addEventListener("input", (e) => { repState.query = e.target.value; renderReports(true); });
  document.getElementById("rep-sort").addEventListener("change", (e) => { repState.sort = e.target.value; renderReports(true); });
  document.getElementById("rep-export").addEventListener("click", exportReportsCSV);
  document.getElementById("rep-stats-toggle").addEventListener("click", () => { repState.statsOpen = !repState.statsOpen; renderReports(true); });
  document.getElementById("refund-alert").addEventListener("click", () => {
    repState.filter = "refund";
    renderReports(true);
    document.getElementById("report-filters").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  document.getElementById("rd-status-seg").addEventListener("click", (e) => {
    const b = e.target.closest("[data-rstatus]");
    if (b) repSetDraftStatus(b.dataset.rstatus);
  });
  document.getElementById("rd-machine").addEventListener("change", repUpdateHints);
  document.getElementById("rd-form").addEventListener("submit", saveReportDetail);
  document.getElementById("rd-delete").addEventListener("click", askDeleteReport);
  document.getElementById("rd-copy").addEventListener("click", repCopyForTechnician);
  document.getElementById("rd-goto-machine").addEventListener("click", () => goToMachine(document.getElementById("rd-machine").value));
  document.getElementById("rd-photo").addEventListener("click", (e) => {
    const src = e.currentTarget.dataset.src;
    if (src) openPhotoModal(src);
  });
  document.getElementById("rd-thumbs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-photo-index]");
    if (!b) return;
    repState.photoIndex = Number(b.dataset.photoIndex);
    const r = wcuGetReport(repState.openId);
    if (r) repRenderGallery(r, repMachine(r, new Map(wcuGetMachines().map((m) => [m.uid, m]))));
  });
  document.getElementById("rd-refund").addEventListener("click", (e) => {
    const b = e.target.closest("[data-refund]");
    if (b) repRefundAction(b.dataset.refund);
  });
  document.getElementById("rd-machine-history").addEventListener("click", (e) => {
    const b = e.target.closest("[data-open-report]");
    if (b) openReportDetail(b.dataset.openReport, { scrollTop: true });
  });
}
