/* Wash & Clean Up — admin logic (Redesigned) */

const CATEGORY_LABEL = { washer: "เครื่องซักผ้า", iron: "เตารีด", broken: "เครื่องมีปัญหา" };
const warningIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;

let currentMachinesList = []; 
let activeModalMachineUid = null;
let activeMachineReportId = null; 
let activeSegment = "washer"; 

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

// แสดงเงินแบบมีคอมม่าเสมอ ไม่ขึ้นกับภาษาของเบราว์เซอร์ (เช่น ฿2,320)
function formatBaht(amount) {
  return `฿${(Number(amount) || 0).toLocaleString("th-TH")}`;
}

// เรียงหมายเลขเครื่องแบบตัวเลข (2 มาก่อน 10)
function compareMachineLabel(a, b) {
  return String(a).localeCompare(String(b), "th", { numeric: true });
}

// หมายเลขถัดไปที่ยังไม่มีใครใช้ (เดิมใช้ จำนวนเครื่อง+1 ทำให้ชนกับเลขที่มีอยู่หลังลบเครื่อง)
function nextMachineNumber(category) {
  const nums = wcuGetMachines(category).map(m => parseInt(String(m.id), 10)).filter(n => Number.isFinite(n));
  return nums.length ? Math.max(...nums) + 1 : 1;
}
function isDuplicateMachineId(category, id, exceptUid) {
  return wcuGetMachines(category).some(m => m.uid !== exceptUid && String(m.id).trim() === String(id).trim());
}
// ช่องที่ซ่อนไว้ต้อง disabled ด้วย ไม่งั้นเบราว์เซอร์ยังตรวจ min="1" แล้วไม่ยอมส่งฟอร์ม (เพิ่ม/แก้เตารีดไม่ได้)
function setFieldVisible(input, visible) {
  input.closest('.field').style.display = visible ? 'flex' : 'none';
  input.disabled = !visible;
}

// ราคาที่แอดมินกรอก: ห้ามติดลบ / ห้ามเป็น NaN
function sanitizePrice(value) {
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? price : 0;
}

// หน้าต่างยืนยันแบบเดียวกับธีม (แทน confirm() ของเบราว์เซอร์ที่หน้าตาไม่เข้ากัน)
function askConfirm({ title, desc, okText = "ยืนยัน", onConfirm, onCancel }) {
  const modal = document.getElementById("confirm-modal");
  if (!modal) { if (window.confirm(desc || title)) onConfirm && onConfirm(); return; }
  setText("confirm-title", title || "ยืนยัน?");
  setText("confirm-desc", desc || "");
  setText("confirm-ok-btn", okText);
  const ok = document.getElementById("confirm-ok-btn");
  const cancel = document.getElementById("confirm-cancel-btn");
  ok.onclick = () => { modal.hidden = true; onConfirm && onConfirm(); };
  cancel.onclick = () => { modal.hidden = true; onCancel && onCancel(); };
  modal.hidden = false;
}

function showToast(title, desc, type) {
  const container = document.getElementById("toast-container");
  if (!container) return;

  container.innerHTML = ""; 

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  
  const iconSvg = type === 'success' 
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;

  // ข้อความเป็น text ล้วน (มีเลขเครื่อง/ข้อความจากผู้ใช้ปน) ห้ามแปลงเป็น HTML
  toast.innerHTML = `
    <div class="toast-icon">${iconSvg}</div>
    <div class="toast-content">
      <span class="toast-title"></span>
      <p class="toast-desc"></p>
    </div>
  `;
  toast.querySelector(".toast-title").textContent = title == null ? "" : String(title);
  toast.querySelector(".toast-desc").textContent = desc == null ? "" : String(desc);
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.classList.add("fade-out");
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("login-form");
  if (!loginForm) return;

  const backLink = document.getElementById("back-link");
  if (backLink && typeof WcuIcon !== "undefined") backLink.innerHTML = WcuIcon.back();

  const togglePasswordBtn = document.getElementById("toggle-password");
  const passwordInput = document.getElementById("password");
  const eyeIcon = document.getElementById("eye-icon");

  if (togglePasswordBtn && passwordInput && eyeIcon) {
    togglePasswordBtn.addEventListener("click", () => {
      const isPassword = passwordInput.getAttribute("type") === "password";
      togglePasswordBtn.classList.add("anim-out");
      
      setTimeout(() => {
        passwordInput.setAttribute("type", isPassword ? "text" : "password");
        if (isPassword) {
          eyeIcon.innerHTML = `
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          `;
          togglePasswordBtn.classList.add("is-active");
          togglePasswordBtn.setAttribute("aria-label", "ซ่อนรหัสผ่าน");
        } else {
          eyeIcon.innerHTML = `
            <path d="M2 12c0 0 4-8 10-8s10 8 10 8-4 8-10 8-10-8-10-8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          `;
          togglePasswordBtn.classList.remove("is-active");
          togglePasswordBtn.setAttribute("aria-label", "แสดงรหัสผ่าน");
        }
        togglePasswordBtn.classList.remove("anim-out");
      }, 150);
    });
  }

  loginForm.addEventListener("submit", (e) => {
    e.preventDefault(); 
    const btn = document.getElementById("login-submit-btn");
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;
    const shake = () => {
      document.getElementById("login-card-main").classList.add("shake");
      setTimeout(() => document.getElementById("login-card-main").classList.remove("shake"), 450);
    };

    // โหมด Firebase: ตรวจรหัสผ่านกับ Firebase Authentication
    if (window.WCU_CLOUD && window.WCU_CLOUD.enabled) {
      if (!username || !password) {
        showToast("กรอกข้อมูลไม่ครบ", "กรุณากรอกชื่อผู้ใช้และรหัสผ่าน", "error");
        shake();
        return;
      }
      btn.disabled = true;
      btn.classList.add("is-loading");
      btn.textContent = "กำลังเข้าสู่ระบบ...";
      wcuCloudAdminLogin(username, password).then(() => {
        document.body.style.transition = "opacity 0.4s ease";
        document.body.style.opacity = "0";
        setTimeout(() => window.location.href = "dashboard.html", 400);
      }).catch((err) => {
        btn.disabled = false;
        btn.classList.remove("is-loading");
        btn.textContent = "เข้าสู่ระบบ";
        showToast("เข้าสู่ระบบไม่สำเร็จ", wcuCloudErrorText(err), "error");
        shake();
      });
      return;
    }

    try {
      const admin = wcuCheckAdminLogin(username, password);
      if (!admin) {
        showToast("เข้าสู่ระบบไม่สำเร็จ", "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง", "error");
        document.getElementById("login-card-main").classList.add("shake");
        setTimeout(() => document.getElementById("login-card-main").classList.remove("shake"), 450);
        return;
      }

      btn.disabled = true;
      btn.classList.add("is-loading");
      btn.textContent = "กำลังเข้าสู่ระบบ...";
      wcuSetSession(admin);

      document.body.style.transition = "opacity 0.4s ease";
      document.body.style.opacity = "0";
      setTimeout(() => window.location.href = "dashboard.html", 400);
    } catch (err) {
      console.error(err);
      showToast("เกิดข้อผิดพลาด", "ระบบขัดข้อง กรุณาลองใหม่", "error");
    }
  });

  const cloudMode = !!(window.WCU_CLOUD && window.WCU_CLOUD.enabled);
  if (cloudMode) {
    // ใช้บัญชีแอดมินจาก Firebase แทนบัญชีทดลอง (ถ้าล็อกอินค้างไว้ firebase-sync.js จะพาเข้าแดชบอร์ดเอง)
    const hint = document.querySelector(".login-hint");
    if (hint) hint.innerHTML = "<strong>บัญชีทดลอง: </strong>admin / admin1234<strong></strong>";
    return;
  }
  try {
    if (wcuGetSession()) window.location.replace("dashboard.html");
  } catch (err) { }
});

document.addEventListener("DOMContentLoaded", () => {
  if (!document.getElementById("view-machines")) return;
  // ไอคอนเส้น (SVG) แทน emoji ในส่วนที่เขียนไว้ใน HTML
  document.querySelectorAll("[data-ui-icon]").forEach((el) => { el.innerHTML = WcuIcon.ui(el.dataset.uiIcon); });

  const session = wcuGetSession();
  if (!session) {
    if (window.WCU_CLOUD && window.WCU_CLOUD.enabled) {
      // เปิดแท็บใหม่ขณะล็อกอิน Firebase ค้างไว้: รอ firebase-sync.js ตรวจสิทธิ์แล้วโหลดหน้าใหม่ให้เอง
      document.body.style.visibility = "hidden";
      return;
    }
    window.location.replace("login.html");
    return;
  }
  
  document.getElementById("logout-btn").addEventListener("click", () => {
    wcuClearSession();
    const signOut = typeof window.wcuCloudSignOut === "function" ? window.wcuCloudSignOut() : null;
    Promise.resolve(signOut).catch(() => {}).then(() => { window.location.href = "login.html"; });
  });

  document.querySelectorAll(".main-bottom-nav .tab-item").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".main-bottom-nav .tab-item").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      
      const target = btn.dataset.target;
      document.querySelectorAll(".view").forEach(v => v.hidden = v.id !== `view-${target}`);
      
      const titles = { machines: "แดชบอร์ด", revenue: "บัญชีรายรับ", expenses: "บัญชีรายจ่าย", reports: "รายการแจ้งซ่อม" };
      document.getElementById("header-title").textContent = titles[target];

      if (target === "machines") renderMachinesGrid(true);
      if (target === "revenue") renderRevenueView(true);
      if (target === "expenses") renderExpensesView(true);
      window.scrollTo(0, 0);
      if (target === "reports") renderReports(true);
    });
  });

  document.querySelectorAll("#view-machines .segment-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#view-machines .segment-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeSegment = btn.dataset.cat;
      renderMachinesGrid(true); 
    });
  });

  setupModals();
  if (typeof setupFinance === "function") setupFinance();
  if (typeof setupReports === "function") setupReports();
  renderMachinesGrid(true);
  
  setInterval(() => {
    const machinesView = document.getElementById("view-machines");
    if (machinesView && !machinesView.hidden) {
      renderMachinesGrid(false); 
      if (!document.getElementById("admin-modal").hidden && activeModalMachineUid) {
        const activeMachine = currentMachinesList.find(m => m.uid === activeModalMachineUid);
        if (activeMachine) updateModalUI(activeMachine);
      }
    }

    // หน้ารายรับอัปเดตเองเมื่อมีการใช้งานใหม่ (เช่น หยอดเหรียญจากหน้า demo อีกแท็บ)
    const revenueView = document.getElementById("view-revenue");
    if (revenueView && !revenueView.hidden) renderRevenueView(false);
    const expensesView = document.getElementById("view-expenses");
    if (expensesView && !expensesView.hidden) renderExpensesView(false);
    // ใบแจ้งซ่อมใหม่จากนักศึกษาโผล่เองโดยไม่ต้องรีเฟรช (ไม่วาดทับตอนเปิดหน้าต่างรายละเอียดอยู่)
    const reportsView = document.getElementById("view-reports");
    if (reportsView && !reportsView.hidden && document.getElementById("report-modal").hidden) renderReports(false);
  }, 1000);
});

function getRemainingTime(machine) {
  if (machine.status === "broken") return { text: "รอการซ่อม", isFinished: true };
  if (machine.category === "iron") {
    if (machine.status !== "busy") return { text: "ถอดปลั๊กอยู่", isFinished: true };
    return { text: "เสียบปลั๊กอยู่", isFinished: false };
  }
  if (machine.status !== "busy") return { text: "ว่าง", isFinished: true };

  const startStr = machine.startedAt || machine.updatedAt || machine.startTime;
  if (!startStr) return { text: "กำลังทำงาน", isFinished: false };

  const startTime = new Date(startStr).getTime();
  const durationMs = (machine.duration || 60) * 60 * 1000;
  const diff = (startTime + durationMs) - wcuNow();

  if (diff <= 0) return { text: "00:00", isFinished: true }; 
  const m = Math.floor(diff / 60000).toString().padStart(2, '0');
  const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
  return { text: `${m}:${s}`, isFinished: false };
}

// ค่าใช้จ่ายสะสมที่ผูกกับเครื่องนี้ (จากหน้ารายจ่าย)
function getMachineExpenseTotal(uid) {
  return wcuGetExpenses().filter(e => e.machineUid === uid).reduce((a, e) => a + Math.max(0, Number(e.amount) || 0), 0);
}

// รายรับสะสม + จำนวนครั้งของเครื่องเดียว (อ่านจากประวัติจริง)
function getMachineStats(uid) {
  const s = wcuGetUsageStats()[uid];
  return s ? { usageCount: s.usageCount, revenue: s.revenue } : { usageCount: 0, revenue: 0 };
}

function renderMachinesGrid(forceRender = false) {
  currentMachinesList = wcuGetMachines();
  const container = document.getElementById("machine-grid");
  const existingCards = container.querySelectorAll('.machine-card');

  currentMachinesList.forEach(m => {
    if (m.status === "busy" && m.category !== "iron" && getRemainingTime(m).isFinished) {
      const next = wcuStatusAfterWash(m.uid);
      wcuSetMachineStatus(m.uid, next); m.status = next; forceRender = true;
    }
  });

  const filteredList = currentMachinesList.filter(m => {
    if (activeSegment === "broken") return m.status === "broken";
    return m.category === activeSegment;
  });

  if (!forceRender && existingCards.length !== filteredList.length) forceRender = true;
  // ชุดเครื่องเปลี่ยน (สลับเครื่อง / แก้เลขเครื่องจากอีกเครื่อง) ต้องวาดใหม่ ไม่ใช่แค่อัปเดตเวลา
  const layoutSig = activeSegment + "|" + filteredList.map(m => `${m.uid}:${m.id}`).join(",");
  if (container.dataset.sig !== layoutSig) forceRender = true;
  container.dataset.sig = layoutSig;

  if (!forceRender) {
    filteredList.forEach(m => {
      const card = document.getElementById(`card-${m.uid}`);
      if (card) {
        if (card.dataset.status !== m.status) {
          card.className = `machine-card status-${m.status}`;
          card.dataset.status = m.status; 
          const iconStr = m.category === "washer" ? WcuIcon.washer("", m.status) : WcuIcon.iron("", m.status);
          const sIcon = m.status === "available" ? WcuIcon.check() : (m.status === "broken" ? warningIcon : WcuIcon.cross());
          card.querySelector('.card-icon').innerHTML = `${iconStr}<span class="status-dot">${sIcon}</span>`;
        }
        card.querySelector('.card-time').textContent = getRemainingTime(m).text;
      }
    });
    return;
  }

  if (filteredList.length === 0) {
    container.innerHTML = `<div class="empty-state">${escapeHtml(wcuLoadingText(activeSegment === "broken" ? "ไม่มีเครื่องที่มีปัญหา" : `ไม่มี${CATEGORY_LABEL[activeSegment]}ในระบบ`))}</div>`;
    container.dataset.sig = "";
    return;
  }

  container.innerHTML = filteredList.map((m, idx) => {
    const icon = m.category === "washer" ? WcuIcon.washer("", m.status) : WcuIcon.iron("", m.status);
    const sIcon = m.status === "available" ? WcuIcon.check() : (m.status === "broken" ? warningIcon : WcuIcon.cross());
    return `
      <div class="machine-card status-${escapeHtml(m.status)}" id="card-${escapeHtml(m.uid)}" data-uid="${escapeHtml(m.uid)}" data-status="${escapeHtml(m.status)}" role="button" tabindex="0" aria-label="${escapeHtml(`${CATEGORY_LABEL[m.category]} ${m.id} ${getRemainingTime(m).text}`)}" style="animation-delay: ${idx * 0.05}s">
        <div class="card-icon">${icon}<span class="status-dot">${sIcon}</span></div>
        <p class="card-label">เครื่อง ${escapeHtml(m.id)}</p>
        <p class="card-time">${getRemainingTime(m).text}</p>
      </div>`;
  }).join("");
}

// ใช้ได้ทั้งในเนื้อหาและใน attribute (ต้องหนี " และ ' ด้วย ไม่งั้นข้อมูลจากนิสิตแทรก onerror= ได้)
function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ดูรูปภาพใหญ่ + ซูมและลากได้ (Pan & Drag)
let isPhotoZoomed = false;
let dragInfo = { isDragging: false, startX: 0, startY: 0, tx: 0, ty: 0 };

window.openPhotoModal = function(src) {
    let modal = document.getElementById("photo-modal");
    if (!modal) {
        const photoModalHTML = `
        <div id="photo-modal" class="modal-backdrop" style="z-index: 9999; background: rgba(10, 15, 30, 0.9); backdrop-filter: blur(8px); display: none; align-items: center; justify-content: center; overflow: hidden; position: fixed; top: 0; left: 0; width: 100%; height: 100%; touch-action: none;">
          <button class="modal-close" id="close-photo-btn" style="color: #fff; right: 20px; top: 20px; font-size: 2.5rem; border: none; background: none; cursor: pointer; position: absolute; z-index: 10;">&times;</button>
          <img id="photo-modal-img" src="" style="max-width: 90%; max-height: 85vh; border-radius: 12px; object-fit: contain; box-shadow: 0 15px 50px rgba(0,0,0,0.5); cursor: zoom-in; transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); user-select: none; -webkit-user-drag: none;" draggable="false" />
          <div id="photo-modal-hint" style="position: absolute; bottom: 30px; color: rgba(255,255,255,0.7); font-size: 0.9rem; pointer-events: none; background: rgba(0,0,0,0.5); padding: 8px 18px; border-radius: 20px; transition: opacity 0.3s; z-index: 10;">คลิกเพื่อซูม • ลากเพื่อเลื่อน</div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', photoModalHTML);
        modal = document.getElementById("photo-modal");
        
        const img = document.getElementById("photo-modal-img");
        
        let startClientX, startClientY;
        
        function toggleZoom() {
            isPhotoZoomed = !isPhotoZoomed;
            dragInfo.tx = 0; dragInfo.ty = 0;
            if (isPhotoZoomed) {
                img.style.transition = 'transform 0.3s ease';
                img.style.transform = 'translate(0px, 0px) scale(2.5)';
                img.style.cursor = 'grab';
                document.getElementById("photo-modal-hint").style.opacity = "0";
            } else {
                img.style.transition = 'transform 0.3s ease';
                img.style.transform = 'translate(0px, 0px) scale(1)';
                img.style.cursor = 'zoom-in';
                document.getElementById("photo-modal-hint").style.opacity = "1";
            }
        }

        const onDown = (e) => {
            if(e.target !== img) return;
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            startClientX = clientX;
            startClientY = clientY;
            
            if (isPhotoZoomed) {
                dragInfo.isDragging = true;
                dragInfo.startX = clientX - dragInfo.tx;
                dragInfo.startY = clientY - dragInfo.ty;
                img.style.transition = 'none';
                img.style.cursor = 'grabbing';
            }
        };
        
        const onMove = (e) => {
            if (!dragInfo.isDragging) return;
            e.preventDefault(); 
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            dragInfo.tx = clientX - dragInfo.startX;
            dragInfo.ty = clientY - dragInfo.startY;
            img.style.transform = `translate(${dragInfo.tx}px, ${dragInfo.ty}px) scale(2.5)`;
        };
        
        let lastTouchEnd = 0;
        const onUp = (e) => {
            // แตะบนมือถือ: เบราว์เซอร์จะยิง mousedown/mouseup ตามมาอีกชุด ทำให้ซูมแล้วเด้งกลับทันที
            if (e.type === "touchend") {
                lastTouchEnd = Date.now();
                if (e.target === img) e.preventDefault();
            } else if (Date.now() - lastTouchEnd < 700) {
                return;
            }
            if (startClientX === undefined) return;
            const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
            const clientY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
            
            // ถ้าขยับเมาส์น้อยมาก (ไม่ถึง 5px) ถือว่าเป็นการคลิกซูม
            if (Math.abs(clientX - startClientX) < 5 && Math.abs(clientY - startClientY) < 5 && e.target === img) {
                toggleZoom();
            }

            if (dragInfo.isDragging) {
                dragInfo.isDragging = false;
                img.style.cursor = 'grab';
            }
        };

        img.addEventListener('mousedown', (e) => { if (Date.now() - lastTouchEnd < 700) return; onDown(e); });
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        
        img.addEventListener('touchstart', onDown, {passive: false});
        window.addEventListener('touchmove', onMove, {passive: false});
        window.addEventListener('touchend', onUp, {passive: false});

        // ปิด Modal
        document.getElementById("close-photo-btn").addEventListener('click', () => {
            modal.style.display = "none";
            isPhotoZoomed = false;
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = "none";
                isPhotoZoomed = false;
            }
        });
    }
    
    const img = document.getElementById("photo-modal-img");
    img.src = src;
    img.style.transform = "translate(0px, 0px) scale(1)";
    img.style.cursor = "zoom-in";
    isPhotoZoomed = false;
    dragInfo.tx = 0; dragInfo.ty = 0;
    document.getElementById("photo-modal-hint").style.opacity = "1";
    document.getElementById("photo-modal").style.display = "flex";
}

function setupModals() {
  const editForm = document.getElementById("admin-edit-form");
  
  editForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const machine = currentMachinesList.find(m => m.uid === activeModalMachineUid);
    const newId = document.getElementById("edit-machine-id").value.trim();
    if (!newId) {
      showToast("กรอกหมายเลขเครื่อง", "หมายเลขเครื่องต้องไม่เว้นว่าง", "error");
      return;
    }
    if (machine && isDuplicateMachineId(machine.category, newId, machine.uid)) {
      showToast("หมายเลขซ้ำ", `มี${CATEGORY_LABEL[machine.category]}หมายเลข ${newId} อยู่แล้ว`, "error");
      return;
    }
    closeModal("admin-modal");
    document.getElementById("save-modal").hidden = false;
  });

  document.getElementById("save-cancel-btn").onclick = () => {
    closeModal("save-modal");
    document.getElementById("admin-modal").hidden = false; 
  };

  document.getElementById("save-confirm-btn").onclick = () => {
    const machine = currentMachinesList.find(m => m.uid === activeModalMachineUid);
    if (!machine) return;

    const newId = document.getElementById("edit-machine-id").value.trim();
    const newPrice = machine.category === "iron" ? 0 : sanitizePrice(document.getElementById("edit-machine-price").value);
    const newDuration = machine.category === "iron" ? 0 : Number(document.getElementById("edit-machine-duration").value);

    const lsMachines = wcuGetMachines();
    const mIdx = lsMachines.findIndex(m => m.uid === activeModalMachineUid);
    if (mIdx > -1) {
      lsMachines[mIdx].id = newId;
      lsMachines[mIdx].price = newPrice;
      lsMachines[mIdx].duration = newDuration;
      wcuSet(WCU_KEYS.machines, lsMachines); // ผ่าน wcuSet เพื่อให้ซิงก์ขึ้น Firebase ด้วย
    }
    // ราคาใหม่มีผลกับการใช้งานครั้งถัดไปเท่านั้น รายรับที่เก็บไปแล้วไม่ถูกคำนวณใหม่

    closeModal("save-modal");
    renderMachinesGrid(true);
    
    const successModal = document.getElementById("success-modal");
    successModal.querySelector("h3").textContent = "บันทึกสำเร็จ!";
    successModal.querySelector("p").textContent = "ข้อมูลของเครื่องถูกอัปเดตเรียบร้อยแล้ว";
    successModal.hidden = false;
  };

  document.getElementById("success-close-btn").onclick = () => {
    closeModal("success-modal");
  };

  document.getElementById("modal-inc-price").onclick = () => { document.getElementById("edit-machine-price").value = Number(document.getElementById("edit-machine-price").value) + 10; };
  document.getElementById("modal-dec-price").onclick = () => { document.getElementById("edit-machine-price").value = Math.max(0, Number(document.getElementById("edit-machine-price").value) - 10); };
  
  document.getElementById("modal-toggle-status-btn").onclick = () => {
    const machine = currentMachinesList.find(m => m.uid === activeModalMachineUid);
    if (!machine) return;
    const wasBroken = machine.status === "broken";
    const wasBusy = machine.status === "busy";
    let nextStatus = "available";
    if (machine.status === "available") nextStatus = machine.category === "iron" ? "busy" : "broken";
    // หยุดเครื่องที่กำลังทำงาน: ถ้ามีใบแจ้งซ่อมค้างต้องไปเป็น "มีปัญหา" ไม่ใช่ "ว่าง"
    else if (wasBusy) nextStatus = wcuStatusAfterWash(machine.uid);
    wcuSetMachineStatus(machine.uid, nextStatus);
    const saved = wcuGetMachines().find(m => m.uid === machine.uid);
    nextStatus = saved ? saved.status : nextStatus;
    machine.status = nextStatus;
    if (nextStatus === "broken") {
      showToast("ปิดใช้งานเครื่องแล้ว", wasBusy ? "เครื่องนี้มีใบแจ้งซ่อมค้างอยู่ จึงปิดใช้งานรอซ่อม" : "นักศึกษาจะเห็นว่าเครื่องนี้งดให้บริการชั่วคราว", "success");
    }
    if (wasBroken) {
      // เดิมเปิดเครื่องแล้วใบแจ้งซ่อมยังค้าง "รอดำเนินการ" ตลอด
      const closed = wcuResolveReportsForMachine(machine.uid);
      showToast("เปิดใช้งานเครื่องแล้ว", closed ? `ปิดใบแจ้งซ่อมของเครื่องนี้ ${closed} ใบ (ย้ายไปที่ "ซ่อมเสร็จ")` : "เครื่องกลับมาให้บริการตามปกติ", "success");
    }
    updateModalUI(machine);
    renderMachinesGrid(true);
  };

  document.getElementById("modal-delete-btn").onclick = () => {
    const machine = currentMachinesList.find(m => m.uid === activeModalMachineUid);
    closeModal("admin-modal");
    const notes = [];
    if (machine) {
      const open = wcuOpenReportsForMachine(machine.uid).length;
      const pending = wcuGetPendingSession(machine.uid);
      if (machine.status === "busy") notes.push("เครื่องกำลังทำงานอยู่");
      if (open) notes.push(`มีใบแจ้งซ่อมค้าง ${open} ใบ (ใบแจ้งจะยังอยู่ในหน้าแจ้งซ่อม)`);
      if (pending && Number(pending.amount) > 0) notes.push(`มีเหรียญค้างในเครื่อง ${formatBaht(pending.amount)}`);
    }
    const name = machine ? `${CATEGORY_LABEL[machine.category]} ${machine.id}` : "เครื่องนี้";
    setText("delete-desc", `${name} จะถูกลบออกจากระบบอย่างถาวร${notes.length ? ` · ${notes.join(" · ")}` : ""} · รายรับและรายจ่ายเดิมยังเก็บไว้`);
    document.getElementById("delete-modal").hidden = false;
  };

  document.getElementById("modal-reporter-section").addEventListener("click", () => {
    if (!activeMachineReportId) return;
    closeModal("admin-modal");
    openReportFromMachine(activeMachineReportId);
  });

  document.getElementById("add-machine-btn").onclick = () => {
    const cat = activeSegment === "broken" ? "washer" : activeSegment;
    document.getElementById("new-category").value = cat;
    applyNewMachineCategory(cat);
    document.getElementById("add-modal").hidden = false;
  };
  
  document.getElementById("new-category").addEventListener("change", (e) => applyNewMachineCategory(e.target.value));

  document.getElementById("add-cancel-btn").onclick = () => closeModal("add-modal");
  document.getElementById("add-machine-form").onsubmit = (e) => {
    e.preventDefault();
    const cat = document.getElementById("new-category").value;
    const id = document.getElementById("new-id").value.trim();
    if (!id) {
      showToast("กรอกหมายเลขเครื่อง", "หมายเลขเครื่องต้องไม่เว้นว่าง", "error");
      return;
    }
    if (isDuplicateMachineId(cat, id)) {
      showToast("หมายเลขซ้ำ", `มี${CATEGORY_LABEL[cat]}หมายเลข ${id} อยู่แล้ว ลองใช้ ${nextMachineNumber(cat)}`, "error");
      return;
    }
    const price = cat === "iron" ? 0 : sanitizePrice(document.getElementById("new-price").value);
    const duration = cat === "iron" ? 0 : Number(document.getElementById("new-duration").value);

    wcuAddMachine({ id, category: cat, status: "available", price, duration, startedAt: null });
    closeModal("add-modal");
    renderMachinesGrid(true);
    showToast("เพิ่มเครื่องสำเร็จ", `เพิ่ม ${CATEGORY_LABEL[cat]} หมายเลข ${id} เข้าสู่ระบบแล้ว`, "success");
  };

  document.getElementById("delete-cancel-btn").onclick = () => {
    closeModal("delete-modal");
    // ยกเลิกแล้วกลับไปหน้าต่างเครื่องเดิม (เหมือนปุ่มยกเลิกตอนบันทึก)
    if (activeModalMachineUid && currentMachinesList.some(m => m.uid === activeModalMachineUid)) document.getElementById("admin-modal").hidden = false;
  };
  document.getElementById("delete-confirm-btn").onclick = () => {
    if (activeModalMachineUid) {
      wcuDeleteMachine(activeModalMachineUid);
      activeModalMachineUid = null;
      closeModal("delete-modal");
      renderMachinesGrid(true);
      showToast("ลบเครื่องสำเร็จ", "ลบเครื่องออกจากระบบถาวรเรียบร้อยแล้ว", "success");
    }
  };

  document.querySelectorAll(".modal-close").forEach(btn => btn.onclick = (e) => closeModal(e.target.closest(".modal-backdrop").id));

  // การ์ดเครื่อง: คลิก หรือกด Enter/Space (ใช้คีย์บอร์ดได้)
  const grid = document.getElementById("machine-grid");
  grid.addEventListener("click", (e) => {
    const card = e.target.closest(".machine-card[data-uid]");
    if (card) openAdminModal(card.dataset.uid);
  });
  grid.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches(".machine-card[data-uid]")) {
      e.preventDefault();
      openAdminModal(e.target.dataset.uid);
    }
  });

  // ปุ่ม Esc ปิดหน้าต่างบนสุด (ใช้ทางเดียวกับปุ่มยกเลิก เพื่อให้กลับไปหน้าต่างเดิมถูกต้อง)
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const photo = document.getElementById("photo-modal");
    if (photo && photo.style.display === "flex") { document.getElementById("close-photo-btn").click(); return; }
    const open = [...document.querySelectorAll(".modal-backdrop")].filter((m) => !m.hidden && m.id !== "photo-modal");
    const top = open.find((m) => m.id === "confirm-modal") || open[open.length - 1];
    if (!top) return;
    const cancel = top.querySelector("#save-cancel-btn, #delete-cancel-btn, #confirm-cancel-btn, #add-cancel-btn, #expense-cancel-btn, #expense-delete-cancel-btn, #success-close-btn, .modal-close");
    if (cancel) cancel.click(); else closeModal(top.id);
  });
}

window.openAdminModal = function(uid) {
  const machine = currentMachinesList.find(m => m.uid === uid);
  if (!machine) return;
  activeModalMachineUid = uid;

  const modalIconContainer = document.getElementById("modal-icon");
  modalIconContainer.innerHTML = machine.category === "washer" ? WcuIcon.washer("", machine.status) : WcuIcon.iron("", machine.status);
  modalIconContainer.dataset.status = machine.status;

  document.getElementById("modal-title").textContent = CATEGORY_LABEL[machine.category];
  document.getElementById("edit-machine-id").value = machine.id;
  
  const priceInput = document.getElementById("edit-machine-price");
  const priceField = priceInput.closest('.field');
  const durationInput = document.getElementById("edit-machine-duration");
  const durationField = durationInput.closest('.field');
  const revenueRow = document.getElementById("modal-revenue").closest('.detail-row');
  const timeLabel = document.getElementById("modal-time").previousElementSibling;

  if (machine.category === "iron") {
    setFieldVisible(priceInput, false);
    setFieldVisible(durationInput, false);
    revenueRow.style.display = 'none';
    timeLabel.textContent = "สถานะไฟสมาร์ทปลั๊ก:";
    priceInput.value = 0;
    durationInput.value = 0;
  } else {
    setFieldVisible(priceInput, true);
    setFieldVisible(durationInput, true);
    revenueRow.style.display = 'flex';
    timeLabel.textContent = "สถานะเวลา:";
    priceInput.value = wcuMachinePrice(machine); // ราคา 0 ต้องแสดง 0 ไม่ใช่เด้งเป็น 20
    durationInput.value = machine.duration || 60;
    document.getElementById("modal-revenue").textContent = formatBaht(getMachineStats(machine.uid).revenue);
  }

  updateModalUI(machine);
  document.getElementById("admin-modal").hidden = false;
}

function applyNewMachineCategory(cat) {
  document.getElementById("new-id").value = nextMachineNumber(cat);
  const priceInput = document.getElementById("new-price");
  const durationInput = document.getElementById("new-duration");
  const isIron = cat === "iron";
  setFieldVisible(priceInput, !isIron);
  setFieldVisible(durationInput, !isIron);
  priceInput.value = isIron ? 0 : 20;
  durationInput.value = isIron ? 0 : 60;
}

function updateModalUI(machine) {
  const sBadge = document.getElementById("modal-status");
  const tBtn = document.getElementById("modal-toggle-status-btn");
  const reporterSec = document.getElementById("modal-reporter-section");
  const reporterText = document.getElementById("modal-reporter-text");

  document.getElementById("modal-time").textContent = getRemainingTime(machine).text;
  if (machine.category !== "iron") {
    setText("modal-revenue", formatBaht(getMachineStats(machine.uid).revenue));
  }
  setText("modal-expense", formatBaht(getMachineExpenseTotal(machine.uid)));

  const modalIconContainer = document.getElementById("modal-icon");
  if (modalIconContainer.dataset.status !== machine.status) {
    modalIconContainer.innerHTML = machine.category === "washer" ? WcuIcon.washer("", machine.status) : WcuIcon.iron("", machine.status);
    modalIconContainer.dataset.status = machine.status;
  }

  if (machine.status === "broken") {
    // เดิมจับคู่จากชื่อหมวด ทำให้เครื่องไหนเสียก็ไปดึงใบแจ้งของเครื่องอื่นมาแสดง
    const machineReport = findOpenReportForMachine(machine);
    
    if (machineReport) {
      const issues = repIssues(machineReport);
      const status = REPORT_STATUS[wcuReportStatus(machineReport)].label;
      reporterText.textContent = `${status} · ${issues.length ? issues.join(", ") : (repExtra(machineReport) || "ไม่ได้ระบุอาการ")}`;
      activeMachineReportId = machineReport.id;
      reporterSec.style.display = "flex"; 
    } else {
      reporterText.textContent = "";
      activeMachineReportId = null;
      reporterSec.style.display = "none"; 
    }
  } else {
    reporterText.textContent = "";
    activeMachineReportId = null;
    reporterSec.style.display = "none"; 
  }

  if (machine.status === "available") {
    sBadge.textContent = machine.category === "iron" ? "ถอดปลั๊กอยู่ (ไม่มีไฟ)" : "ว่างพร้อมใช้งาน";
    sBadge.className = "modal-status-badge available";
    tBtn.textContent = machine.category === "iron" ? "สั่งเปิดไฟสมาร์ทปลั๊ก (ON)" : "ปิดการใช้งาน (พักเครื่อง)";
  } else if (machine.status === "broken") {
    sBadge.textContent = activeMachineReportId ? "แจ้งซ่อม (เครื่องมีปัญหา)" : "ปิดใช้งานชั่วคราว";
    sBadge.className = "modal-status-badge broken";
    tBtn.textContent = activeMachineReportId ? "ซ่อมเสร็จแล้ว (เปิดใช้งาน)" : "เปิดใช้งานเครื่อง";
  } else {
    sBadge.textContent = machine.category === "iron" ? "เสียบปลั๊กใช้งานอยู่" : "กำลังใช้งาน";
    sBadge.className = "modal-status-badge busy";
    tBtn.textContent = machine.category === "iron" ? "สั่งตัดไฟสมาร์ทปลั๊ก (OFF)" : "บังคับหยุดทำงาน";
  }
}

function closeModal(id) { document.getElementById(id).hidden = true; }