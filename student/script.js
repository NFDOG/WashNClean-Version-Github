/* Wash & Clean Up — student logic */

const CATEGORY_LABEL = { washer: "เครื่องซักผ้า", iron: "เตารีด" };

let activeCategory = "washer";
let currentMachines = []; 
let activeModalUid = null; 

const warningIcon = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/>
  <path d="M12 8v4m0 4h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</svg>`;

document.getElementById("back-link").innerHTML = WcuIcon.back();
document.getElementById("feedback-toggle").innerHTML = WcuIcon.chat();
document.querySelector('.nav-icon[data-cat="washer"]').innerHTML = WcuIcon.washer(); 
document.querySelector('.nav-icon[data-cat="iron"]').innerHTML = WcuIcon.iron();

const modal = document.getElementById("machine-modal");
const modalClose = document.getElementById("modal-close");
const modalIcon = document.getElementById("modal-icon");
const modalTitle = document.getElementById("modal-title");
const modalStatus = document.getElementById("modal-status");
const modalTime = document.getElementById("modal-time");
const modalCategory = document.getElementById("modal-category");
const modalActionBtn = document.getElementById("modal-action-btn");

const successModal = document.getElementById("success-modal");
const successCloseBtn = document.getElementById("success-close-btn");

function getRemainingTime(machine) {
  if (machine.status === "broken") return { text: "มีปัญหา", isFinished: true };
  
  if (machine.category === "iron") {
    if (machine.status !== "busy") return { text: "ถอดปลั๊กอยู่", isFinished: true };
    return { text: "เสียบปลั๊กอยู่", isFinished: false };
  }

  if (machine.status !== "busy") return { text: "ว่าง", isFinished: true };

  const startStr = machine.startedAt || machine.updatedAt || machine.startTime;
  if (!startStr) return { text: "กำลังทำงาน", isFinished: false };

  const startTime = new Date(startStr).getTime();
  const defaultDurationMins = machine.category === "washer" ? 60 : 30;
  const durationMs = (machine.duration || defaultDurationMins) * 60 * 1000;
  
  const endTime = startTime + durationMs;
  const now = wcuNow();
  const diff = endTime - now;

  if (diff <= 0) return { text: "00:00", isFinished: true }; 

  const mins = Math.floor(diff / 60000).toString().padStart(2, '0');
  const secs = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
  
  return { text: `${mins}:${secs}`, isFinished: false };
}

function renderMachines(forceRender = false) {
  currentMachines = wcuGetMachines(activeCategory);
  
  let statusChanged = false;
  currentMachines.forEach(m => {
    if (m.status === "busy" && m.category !== "iron") {
      const timeData = getRemainingTime(m);
      if (timeData.isFinished) {
        const next = typeof wcuStatusAfterWash === 'function' ? wcuStatusAfterWash(m.uid) : "available";
        if (typeof wcuSetMachineStatus === 'function') {
          wcuSetMachineStatus(m.uid, next);
        }
        m.status = next; 
        statusChanged = true;
      }
    }
  });

  if (statusChanged) forceRender = true;

  const grid = document.getElementById("machine-grid");
  const existingCards = grid.querySelectorAll('.machine-card');

  // เลขเครื่อง/ลำดับเปลี่ยน (แอดมินแก้ชื่อเครื่อง) ต้องวาดการ์ดใหม่ ไม่ใช่แค่อัปเดตเวลา
  const layoutSig = currentMachines.map(m => `${m.uid}:${m.id}`).join("|");
  if (grid.dataset.sig !== layoutSig) forceRender = true;

  if (forceRender || existingCards.length !== currentMachines.length || currentMachines.length === 0) {
    grid.dataset.sig = layoutSig;
    if (currentMachines.length === 0) {
      grid.innerHTML = `<p class="empty-state">${wcuLoadingText(`ยังไม่มี${CATEGORY_LABEL[activeCategory]}ในระบบ`)}</p>`;
      return;
    }

    grid.innerHTML = currentMachines
      .map((m, index) => {
        const timeData = getRemainingTime(m);
        const icon = activeCategory === "washer" ? WcuIcon.washer("", m.status) : WcuIcon.iron("", m.status);
        const statusIcon = m.status === "available" ? WcuIcon.check() : (m.status === "broken" ? warningIcon : WcuIcon.cross());
        
        const timeLabel = m.status === "available" 
          ? (m.category === "iron" ? "ถอดปลั๊กอยู่" : "ว่าง") 
          : (m.status === "broken" ? "เครื่องมีปัญหา" : timeData.text);
        
        return `
          <div class="machine-card status-${rfEsc(m.status)}" id="card-${rfEsc(m.uid)}" data-uid="${rfEsc(m.uid)}" data-status="${rfEsc(m.status)}" role="button" tabindex="0" aria-label="${rfEsc(`${CATEGORY_LABEL[m.category]} ${m.id} ${timeLabel}`)}" style="animation-delay: ${index * 0.05}s">
            <div class="card-icon">
              ${icon}
              <span class="status-dot" id="dot-${m.uid}">${statusIcon}</span>
            </div>
            <p class="card-label">เครื่อง ${rfEsc(m.id)}</p>
            <p class="card-time" id="time-${m.uid}">${timeLabel}</p>
          </div>`;
      })
      .join("");
  } else {
    currentMachines.forEach(m => {
      const timeData = getRemainingTime(m);
      const card = document.getElementById(`card-${m.uid}`);
      const timeText = document.getElementById(`time-${m.uid}`);
      const cardIconContainer = card ? card.querySelector('.card-icon') : null;

      if (card && timeText && cardIconContainer) {
        if (card.dataset.status !== m.status) {
          card.className = `machine-card status-${m.status}`;
          card.dataset.status = m.status; 
          
          const statusIcon = m.status === "available" ? WcuIcon.check() : (m.status === "broken" ? warningIcon : WcuIcon.cross());
          const iconStr = activeCategory === "washer" ? WcuIcon.washer("", m.status) : WcuIcon.iron("", m.status);
          cardIconContainer.innerHTML = `${iconStr}<span class="status-dot" id="dot-${m.uid}">${statusIcon}</span>`;
        }
        
        const timeLabel = m.status === "available" 
          ? (m.category === "iron" ? "ถอดปลั๊กอยู่" : "ว่าง") 
          : (m.status === "broken" ? "เครื่องมีปัญหา" : timeData.text);
          
        timeText.textContent = timeLabel;
      }
    });
  }
}

function openModal(uid) {
  const machine = currentMachines.find(m => m.uid === uid);
  if(!machine) return;

  activeModalUid = uid; 

  modalIcon.innerHTML = activeCategory === "washer" ? WcuIcon.washer("", machine.status) : WcuIcon.iron("", machine.status);
  modalIcon.dataset.status = machine.status;

  modalTitle.textContent = `${CATEGORY_LABEL[machine.category]} เครื่อง ${machine.id}`;
  modalCategory.textContent = CATEGORY_LABEL[machine.category];
  
  const timeLabelEl = modalTime.previousElementSibling;
  if (machine.category === "iron") {
    timeLabelEl.textContent = "สถานะสมาร์ทปลั๊ก:";
  } else {
    timeLabelEl.textContent = "เวลาที่เหลือ/เวลาใช้งาน:";
  }

  updateModalTimeUI(machine);
  modal.hidden = false;
}

// ปุ่ม "รายงานปัญหา" ต้องเปลี่ยนตามสถานะล่าสุด (เครื่องอาจถูกแจ้งซ่อม/ซ่อมเสร็จระหว่างที่เปิดหน้าต่างอยู่)
function updateModalAction(machine) {
  const broken = machine.status === "broken";
  if (modalActionBtn.dataset.broken === String(broken)) return;
  modalActionBtn.dataset.broken = String(broken);
  modalActionBtn.disabled = broken;
  modalActionBtn.textContent = broken ? "เครื่องนี้แจ้งซ่อมไปแล้ว" : "รายงานปัญหาเครื่องนี้";
}
modalActionBtn.addEventListener("click", () => {
  const uid = activeModalUid;
  const machine = wcuGetMachines().find((m) => m.uid === uid);
  if (!machine || machine.status === "broken") return;
  closeModal();
  showFeedback(uid); // เปิดฟอร์มพร้อมเลือกเครื่องนี้ให้เลย
});

function closeModal() {
  modal.hidden = true;
  activeModalUid = null;
}

function updateModalTimeUI(machine) {
  updateModalAction(machine);
  if (machine.status === "available") {
    modalStatus.textContent = machine.category === "iron" ? "สถานะ: พร้อมเสียบใช้งาน" : "สถานะ: ว่างพร้อมใช้งาน";
    modalStatus.className = "modal-status-badge available";
    modalTime.textContent = machine.category === "iron" ? "ไฟดับอยู่" : "-";
  } else if (machine.status === "broken") {
    modalStatus.textContent = "สถานะ: มีผู้แจ้งปัญหาการใช้งาน";
    modalStatus.className = "modal-status-badge broken";
    modalTime.textContent = "งดให้บริการชั่วคราว";
  } else {
    const timeData = getRemainingTime(machine);
    modalStatus.textContent = machine.category === "iron" ? "สถานะ: กำลังรีดผ้า" : "สถานะ: กำลังใช้งาน";
    modalStatus.className = "modal-status-badge busy";
    modalTime.textContent = timeData.text;
  }
  
  if (modalIcon.dataset.status !== machine.status) {
    modalIcon.innerHTML = activeCategory === "washer" ? WcuIcon.washer("", machine.status) : WcuIcon.iron("", machine.status);
    modalIcon.dataset.status = machine.status;
  }
}

modalClose.addEventListener("click", closeModal);

// การ์ดเครื่อง: คลิก หรือกด Enter/Space
const machineGrid = document.getElementById("machine-grid");
machineGrid.addEventListener("click", (e) => {
  const card = e.target.closest(".machine-card[data-uid]");
  if (card) openModal(card.dataset.uid);
});
machineGrid.addEventListener("keydown", (e) => {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches(".machine-card[data-uid]")) {
    e.preventDefault();
    openModal(e.target.dataset.uid);
  }
});

// Esc ปิดหน้าต่างที่เปิดอยู่
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const review = document.getElementById("review-modal");
  if (review && !review.hidden) { review.hidden = true; return; }
  if (!successModal.hidden) { successCloseBtn.click(); return; }
  if (!modal.hidden) closeModal();
});
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});

successCloseBtn.addEventListener("click", () => {
  successModal.hidden = true;
  showList(activeCategory);
});
document.getElementById("success-track-btn").addEventListener("click", () => {
  successModal.hidden = true;
  const mine = document.getElementById("rf-mine");
  if (mine && !mine.hidden) mine.scrollIntoView({ behavior: "smooth", block: "start" });
});

const viewList = document.getElementById("view-list");
const viewFeedback = document.getElementById("view-feedback");
const feedbackToggle = document.getElementById("feedback-toggle");

function showList(category) {
  activeCategory = category;
  document.querySelectorAll(".nav-icon").forEach((btn) => btn.classList.toggle("is-active", btn.dataset.cat === category));
  viewFeedback.hidden = true;
  viewList.hidden = false;
  feedbackToggle.setAttribute("aria-pressed", "false");
  document.getElementById("topbar-title").textContent = "รายการ";
  renderMachines(true); 
}

function showFeedback(machineUid) {
  viewList.hidden = true;
  viewFeedback.hidden = false;
  feedbackToggle.setAttribute("aria-pressed", "true");
  document.getElementById("topbar-title").textContent = "แจ้งปัญหา";
  document.querySelectorAll(".nav-icon").forEach((btn) => btn.classList.remove("is-active"));
  rfOpen(machineUid); // report-form.js
  window.scrollTo(0, 0);
}

document.querySelectorAll(".nav-icon").forEach((btn) => {
  btn.addEventListener("click", () => showList(btn.dataset.cat));
});

feedbackToggle.addEventListener("click", () => {
  if (viewFeedback.hidden) showFeedback();
  else showList(activeCategory);
});

// ตรวจสอบค่าจาก URL ว่าให้เปิดแท็บไหน
const urlParams = new URLSearchParams(window.location.search);
const targetTab = urlParams.get('tab');

if (targetTab === 'iron') {
  showList("iron");
} else if (targetTab === 'feedback') {
  showList("washer"); // โหลดพื้นหลังให้เป็นเครื่องซักผ้าไว้ก่อน
  showFeedback();     // เปิดหน้าฟอร์มแจ้งปัญหา
} else {
  showList("washer"); // ค่าเริ่มต้นถ้าไม่มีการส่งค่ามา
}

setInterval(() => {
  if (!viewFeedback.hidden) rfTick(); // อัปเดตสถานะเครื่อง + "การแจ้งของฉัน"
  if (!viewList.hidden) {
    renderMachines(false); 
    if (!modal.hidden && activeModalUid) {
      const activeMachine = currentMachines.find(m => m.uid === activeModalUid);
      if (activeMachine) {
        updateModalTimeUI(activeMachine);
      }
    }
  }
}, 1000);