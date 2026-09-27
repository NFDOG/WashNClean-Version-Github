/* Wash & Clean Up — ชุดไอคอน (inline SVG) ใช้ร่วมกันทั้งหน้า landing, student, admin
   เพื่อให้รูปเครื่องซัก/เตารีด/ประแจ/แชท ฯลฯ หน้าตาเหมือนกันทุกที่ */

const WcuIcon = {
  // 1. ไอคอนเครื่องซักผ้า
  washer: (cls = "", status = "default") => {
    if (status === "busy") {
      // (กำลังทำงาน) ปิดฝา + ถังซักหมุน
      return `<svg class="${cls}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <style>@keyframes spin-drum { 100% { transform: rotate(360deg); } }</style>
        <rect x="4" y="3" width="40" height="42" rx="8" fill="currentColor" fill-opacity="0.08"/>
        <rect x="4" y="3" width="40" height="42" rx="8" stroke="currentColor" stroke-width="2"/>
        <circle cx="10" cy="8" r="1.4" fill="currentColor"/>
        <circle cx="15" cy="8" r="1.4" fill="currentColor"/>
        <circle cx="24" cy="27" r="12" fill="#fff" stroke="currentColor" stroke-width="2"/>
        <g style="transform-origin: 24px 27px; animation: spin-drum 1.5s linear infinite;">
          <circle cx="24" cy="27" r="8" stroke="currentColor" stroke-width="2"/>
          <path d="M19 24.5c1.5 2 3.5 2 5 0s3.5-2 5 0" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          <path d="M19 29.5c1.5 2 3.5 2 5 0s3.5-2 5 0" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
        </g>
      </svg>`;
    } 
    else if (status === "available") {
      // (ว่าง) นิ่งๆ เปิดฝาไว้ + ประกายวิ้ง 1 ดวง (ไม่กะพริบ)
      return `<svg class="${cls}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="4" y="3" width="40" height="42" rx="8" fill="currentColor" fill-opacity="0.08"/>
        <rect x="4" y="3" width="40" height="42" rx="8" stroke="currentColor" stroke-width="2"/>
        <circle cx="10" cy="8" r="1.4" fill="currentColor"/>
        <circle cx="15" cy="8" r="1.4" fill="currentColor"/>
        
        <!-- รูด้านในถังซัก (สีเทาอ่อน) -->
        <circle cx="26" cy="27" r="10" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-width="2"/>
        <!-- ฝาเครื่องที่เปิดออกด้านซ้าย -->
        <ellipse cx="12" cy="27" rx="4.5" ry="11" fill="#fff" stroke="currentColor" stroke-width="2"/>
        
        <!-- ประกายวิ้งๆ มุมขวาบน (แบบนิ่ง) -->
        <path d="M38 12l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" fill="currentColor" opacity="0.45"/>
      </svg>`;
    } 
    else if (status === "broken") {
      // (พัง) กากบาททับ
      return `<svg class="${cls}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="4" y="3" width="40" height="42" rx="8" fill="currentColor" fill-opacity="0.08"/>
        <rect x="4" y="3" width="40" height="42" rx="8" stroke="currentColor" stroke-width="2"/>
        <circle cx="10" cy="8" r="1.4" fill="currentColor"/>
        <circle cx="15" cy="8" r="1.4" fill="currentColor"/>
        <circle cx="24" cy="27" r="12" fill="#fff" stroke="currentColor" stroke-width="2"/>
        <path d="M16 19l16 16M32 19L16 35" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
      </svg>`;
    } 
    else {
      // (ค่าเริ่มต้น)
      return `<svg class="${cls}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="4" y="3" width="40" height="42" rx="8" fill="currentColor" fill-opacity="0.08"/>
        <rect x="4" y="3" width="40" height="42" rx="8" stroke="currentColor" stroke-width="2"/>
        <circle cx="10" cy="8" r="1.4" fill="currentColor"/>
        <circle cx="15" cy="8" r="1.4" fill="currentColor"/>
        <circle cx="24" cy="27" r="12" fill="#fff" stroke="currentColor" stroke-width="2"/>
        <circle cx="24" cy="27" r="7.5" stroke="currentColor" stroke-width="2"/>
        <path d="M20 25c1.2 2 2.8 2 4 0s2.8-2 4 0" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
      </svg>`;
    }
  },

  // 2. ไอคอนเตารีด (ดีไซน์ใหม่)
  iron: (cls = "", status = "default") => {
    if (status === "busy") {
      // (กำลังทำงาน) ไถไปมา + พ่นไอน้ำ + ไฟแดง
      return `<svg class="${cls}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <style>
          @keyframes iron-slide { 0%, 100% { transform: translateX(-2px); } 50% { transform: translateX(4px); } }
          @keyframes steam-puff { 0% { transform: translateY(-2px); opacity: 0; } 50% { opacity: 0.8; } 100% { transform: translateY(4px); opacity: 0; } }
        </style>
        <!-- โต๊ะรองรีด -->
        <path d="M2 42h44" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        
        <!-- ตัวเตารีดเคลื่อนที่ -->
        <g style="animation: iron-slide 1.5s ease-in-out infinite;">
          <!-- หูจับ -->
          <path d="M8 18v-8c0-6 26-6 26 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>
          <!-- โครงเครื่อง -->
          <path d="M8 38h32 A 20 20 0 0 0 20 18 H 8 Z" fill="#fff" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
          <!-- แผ่นความร้อน -->
          <path d="M8 32h29.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <!-- หน้าปัด -->
          <circle cx="16" cy="25" r="4" stroke="currentColor" stroke-width="2"/>
          <path d="M16 25l2.5-2.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <!-- ไฟสถานะทำงาน (สีแดง) -->
          <circle cx="26" cy="25" r="2" fill="#e2534a"/>
          
          <!-- ไอน้ำพ่นลง -->
          <path d="M12 40v4 M20 40v6 M28 40v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" style="animation: steam-puff 1s infinite;"/>
        </g>
      </svg>`;
    } 
    else if (status === "available") {
      // (ว่าง) ตั้งนิ่งๆ + ไฟเขียวกะพริบช้าๆ + ประกายวิ้ง 1 ดวง
      return `<svg class="${cls}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <style>
          @keyframes ready-pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
        </style>
        <!-- โต๊ะรองรีด -->
        <path d="M2 42h44" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        
        <!-- หูจับ -->
        <path d="M8 18v-8c0-6 26-6 26 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>
        <!-- โครงเครื่อง -->
        <path d="M8 38h32 A 20 20 0 0 0 20 18 H 8 Z" fill="#fff" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        <!-- แผ่นความร้อน -->
        <path d="M8 32h29.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <!-- หน้าปัด -->
        <circle cx="16" cy="25" r="4" stroke="currentColor" stroke-width="2"/>
        <path d="M16 25l2.5-2.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <!-- ไฟสถานะว่าง (สีเขียว กะพริบหรี่ๆ) -->
        <circle cx="26" cy="25" r="2" fill="#3ebd6e" style="animation: ready-pulse 2.5s ease-in-out infinite;"/>

        <!-- ประกายวิ้งๆ มุมขวาบน -->
        <path d="M38 12l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" fill="currentColor" opacity="0.45"/>
      </svg>`;
    } 
    else if (status === "broken") {
      // (พัง) กากบาททับใหญ่
      return `<svg class="${cls}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M2 42h44" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M8 18v-8c0-6 26-6 26 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>
        <path d="M8 38h32 A 20 20 0 0 0 20 18 H 8 Z" fill="#f8fafc" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        <path d="M8 32h29.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <circle cx="16" cy="25" r="4" stroke="currentColor" stroke-width="2"/>
        <path d="M16 25l2.5-2.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        
        <!-- กากบาททับ -->
        <path d="M14 16l16 16M30 16L14 32" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
      </svg>`;
    } 
    else {
      // (ค่าเริ่มต้น สำหรับโชว์ในแถบเมนูด้านล่าง)
      return `<svg class="${cls}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M2 42h44" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M8 18v-8c0-6 26-6 26 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>
        <path d="M8 38h32 A 20 20 0 0 0 20 18 H 8 Z" fill="#fff" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        <path d="M8 32h29.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <circle cx="16" cy="25" r="4" stroke="currentColor" stroke-width="2"/>
        <path d="M16 25l2.5-2.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>`;
    }
  },

  // 3. ไอคอนอื่นๆ ในระบบ
  wrench: (cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14.7 6.3a4 4 0 0 0-5.4 4.9L4 16.5V20h3.5l5.3-5.3a4 4 0 0 0 4.9-5.4l-2.6 2.6-2-2z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>`,
  chat: (cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8A2.5 2.5 0 0 1 17.5 16H10l-4.5 4v-4H6.5A2.5 2.5 0 0 1 4 13.5v-8z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="8.5" cy="9.5" r="1" fill="currentColor"/><circle cx="12" cy="9.5" r="1" fill="currentColor"/><circle cx="15.5" cy="9.5" r="1" fill="currentColor"/></svg>`,
  back: (cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14.5 5 7 12l7.5 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  plus: (cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`,
  check: (cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9.2" stroke="currentColor" stroke-width="1.8"/><path d="M8 12.3l2.5 2.5L16 9.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  cross: (cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9.2" stroke="currentColor" stroke-width="1.8"/><path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>`,
  trash: (cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 7h14M9.5 7V5.5a1.5 1.5 0 0 1 1.5-1.5h2a1.5 1.5 0 0 1 1.5 1.5V7M7 7l.8 12a2 2 0 0 0 2 1.9h4.4a2 2 0 0 0 2-1.9L17 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.2 10.5v6M13.8 10.5v6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  person: (cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="8.3" r="3.3" stroke="currentColor" stroke-width="1.8"/><path d="M5 19c1-3.6 4-5.4 7-5.4s6 1.8 7 5.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  bubble: (cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10"/></svg>`
};

/* ไอคอนเส้น (แทน emoji) — เส้นหนา 2 ปลายมน สีตาม currentColor ใช้ได้ทุกหน้า */
const WCU_UI_ICONS = {
  // อาการเครื่องซักผ้า / เตารีด
  power: '<path d="M18.4 6.6a9 9 0 1 1-12.8 0"/><path d="M12 2.5v9"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M14.8 9.3c-.4-1-1.5-1.6-2.8-1.6-1.6 0-2.8.8-2.8 2s1.2 1.7 2.8 2c1.6.3 2.8.9 2.8 2.2s-1.2 2.1-2.8 2.1c-1.4 0-2.5-.7-2.9-1.7"/><path d="M12 5.8v1.9M12 16.3v1.9"/>',
  "drop-off": '<path d="M12 3.2s5.8 6.3 5.8 10.6a5.8 5.8 0 0 1-11.6 0c0-4.3 5.8-10.6 5.8-10.6z"/><path d="M4 4l16 16"/>',
  tub: '<path d="M4 4v13a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V4"/><path d="M4 12.5c1.3 0 1.3-1 2.7-1s1.3 1 2.7 1 1.3-1 2.6-1 1.3 1 2.7 1 1.3-1 2.6-1 1.4 1 2.7 1"/>',
  spin: '<path d="M20.5 12a8.5 8.5 0 0 1-14.9 5.6"/><path d="M3.5 12A8.5 8.5 0 0 1 18.4 6.4"/><path d="M19 2.8v3.8h-3.8"/><path d="M5 21.2v-3.8h3.8"/>',
  volume: '<path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.6 5.4a9.5 9.5 0 0 1 0 13.2"/>',
  drop: '<path d="M12 3.2s5.8 6.3 5.8 10.6a5.8 5.8 0 0 1-11.6 0c0-4.3 5.8-10.6 5.8-10.6z"/><path d="M9.3 14.4a2.8 2.8 0 0 0 2.7 2.7"/>',
  lid: '<rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 7.7-1.6"/><path d="M12 15v2"/>',
  odor: '<path d="M7 20c-1.8-2.3 1.8-4.2 0-6.5S8.8 9.3 7 7"/><path d="M12 20c-1.8-2.3 1.8-4.2 0-6.5S13.8 9.3 12 7"/><path d="M17 20c-1.8-2.3 1.8-4.2 0-6.5S18.8 9.3 17 7"/>',
  zap: '<path d="M13 2.5 4.5 13.5H12l-1 8 8.5-11H12l1-8z"/>',
  pencil: '<path d="M12.5 20H21"/><path d="M16.5 3.6a2.1 2.1 0 0 1 3 3L7.2 18.9 3 20l1.1-4.2L16.5 3.6z"/>',
  snow: '<path d="M12 2.5v19M3.8 7.3l16.4 9.4M3.8 16.7l16.4-9.4"/><path d="m9.6 4.2 2.4 2.1 2.4-2.1M9.6 19.8l2.4-2.1 2.4 2.1"/>',
  flame: '<path d="M12 21.5c3.9 0 6.8-2.7 6.8-6.6 0-3.8-2.7-6-3.8-9.4-1.6 1.7-2.6 3-3 4.8-1-.9-1.6-2-1.6-3.6C7.6 8.9 5.2 11.8 5.2 15c0 3.8 2.9 6.5 6.8 6.5z"/>',
  plug: '<path d="M9 2.5v5.5M15 2.5v5.5"/><path d="M6 8h12v3.5a6 6 0 0 1-12 0V8z"/><path d="M12 17.5v4"/>',
  steam: '<path d="M8.5 2.8c-1.3 1.3 1.3 2.7 0 4M12.5 2.8c-1.3 1.3 1.3 2.7 0 4M16.5 2.8c-1.3 1.3 1.3 2.7 0 4"/><path d="M3.5 18.5c0-3.9 3.1-7.5 7-7.5H19a1.5 1.5 0 0 1 1.5 1.5v4.5a1.5 1.5 0 0 1-1.5 1.5H3.5z"/><path d="M3.5 21h17"/>',
  sparkle: '<path d="M11 3.5 12.8 8l4.5 1.8-4.5 1.8L11 16l-1.8-4.4-4.5-1.8L9.2 8 11 3.5z"/><path d="M18 14.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z"/>',
  // ไอคอนประกอบอื่นๆ
  alert: '<path d="M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4.2"/><path d="M12 17h.01"/>',
  cash: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.6"/><path d="M6 12h.01M18 12h.01"/>',
  message: '<path d="M20.5 14.5a2 2 0 0 1-2 2H8l-4.5 4V5.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v9z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
  camera: '<path d="M21.5 18.5a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2V8.5a2 2 0 0 1 2-2H8l1.8-3h4.4L16 6.5h3.5a2 2 0 0 1 2 2v10z"/><circle cx="12" cy="13" r="3.8"/>',
  phone: '<path d="M21.5 16.9v2.9a2 2 0 0 1-2.2 2 19.6 19.6 0 0 1-8.5-3 19.2 19.2 0 0 1-5.9-5.9 19.6 19.6 0 0 1-3-8.6A2 2 0 0 1 3.9 2h2.9a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L7.8 9.8a16 16 0 0 0 5.9 5.9l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2.2z"/>',
  zoom: '<circle cx="11" cy="11" r="7"/><path d="m20.5 20.5-4.3-4.3"/><path d="M11 8v6M8 11h6"/>',
  chart: '<path d="M4 20h16"/><path d="M7 16.5v-5M12 16.5V6M17 16.5v-8"/>',
  clipboard: '<rect x="8.5" y="2.5" width="7" height="4" rx="1"/><path d="M15.5 4.5h2a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  "check-circle": '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16.5 9.5"/>',
  "x-circle": '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
  "fast-forward": '<path d="m13 19 8.5-7L13 5v14z"/><path d="m3 19 8.5-7L3 5v14z"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><path d="M1.5 14h5M9.5 8h5M17.5 16h5"/>',
  dot: '<circle cx="12" cy="12" r="3" fill="currentColor"/>',
};
WcuIcon.ui = (name, cls = "") =>
  `<svg class="wcu-i${cls ? ` ${cls}` : ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${WCU_UI_ICONS[name] || WCU_UI_ICONS.dot}</svg>`;
