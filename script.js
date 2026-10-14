/**
 * SEQUENCE — UNIVERSAL PUZZLE ENGINE
 * Complete rebuild adhering to the Universal Game Design System.
 */

(function () {
  "use strict";

  // ==========================================================================
  // 1. CONSTANTS & CONFIGURATION
  // ==========================================================================
  const STORAGE_KEY = "tileworks_sequence_state_v2";
  const HOME_URL = "#home"; // Injected by Tileworks host container
  const MAX_ATTEMPTS = 4;
  const SLOTS_COUNT = 5;
  const CANONICAL_TIMEZONE = "Europe/London";

  // Exact required SVG graphic preserved verbatim character-for-character
  const CANNABIS_LEAF_SVG = `<svg xmlns="http://w3.org" viewBox="0 0 512 546" width="512" height="546">
  <g fill="#2e7d32">
    <!-- Center / Main Leaf Blade -->
    <path d="M256,20 C240,100 245,180 256,260 C267,180 272,100 256,20 Z" />
    <!-- Upper Side Lobes -->
    <path d="M256,260 C210,140 140,100 80,110 C140,160 200,230 256,260 Z" />
    <path d="M256,260 C302,140 372,100 432,110 C372,160 312,230 256,260 Z" />
    <!-- Middle Side Lobes -->
    <path d="M256,260 C180,200 100,210 50,250 C110,280 180,290 256,260 Z" />
    <path d="M256,260 C332,200 412,210 462,250 C402,280 332,290 256,260 Z" />
    <!-- Lower Side Lobes -->
    <path d="M256,260 C190,270 130,310 90,360 C140,360 200,340 256,260 Z" />
    <path d="M256,260 C322,270 382,310 422,360 C372,360 312,340 256,260 Z" />
    <!-- Stem / Petiole -->
    <path d="M246,260 L246,510 L266,510 L266,260 Z" />
  </g>
</svg>`;

  // ==========================================================================
  // 2. AUTHORITATIVE DAILY RELEASE ENGINE
  // ==========================================================================
  const DailyReleaseEngine = {
    synchronized: false,
    authoritativeOffsetMs: 0,

    async synchronize() {
      const endpoints = [
        async () => {
          const res = await fetch("https://worldtimeapi.org/api/timezone/Etc/UTC", { cache: "no-store" });
          if (!res.ok) throw new Error("WTA");
          const json = await res.json();
          return new Date(json.utc_datetime).getTime();
        },
        async () => {
          const res = await fetch("https://timeapi.io/api/time/current/zone?timeZone=UTC", { cache: "no-store" });
          if (!res.ok) throw new Error("TA");
          const json = await res.json();
          return new Date(json.dateTime).getTime();
        },
        async () => {
          const res = await fetch("puzzles.csv", { method: "HEAD", cache: "no-store" });
          const dateHeader = res.headers.get("Date");
          if (!dateHeader) throw new Error("Header Date");
          return new Date(dateHeader).getTime();
        }
      ];

      for (const fn of endpoints) {
        try {
          const remoteTimeMs = await Promise.race([
            fn(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3200))
          ]);
          if (!isNaN(remoteTimeMs) && remoteTimeMs > 0) {
            this.authoritativeOffsetMs = remoteTimeMs - performance.now();
            this.synchronized = true;
            return true;
          }
        } catch (e) {
          // Try next fallback endpoint
        }
      }

      this.synchronized = false;
      return false;
    },

    getNow() {
      if (this.synchronized) {
        return new Date(performance.now() + this.authoritativeOffsetMs);
      }
      return new Date();
    },

    getCanonicalReleaseDate() {
      const now = this.getNow();
      try {
        const formatter = new Intl.DateTimeFormat("en-CA", {
          timeZone: CANONICAL_TIMEZONE,
          year: "numeric",
          month: "2-digit",
          day: "2-digit"
        });
        return formatter.format(now);
      } catch (e) {
        return now.toISOString().slice(0, 10);
      }
    }
  };

  // ==========================================================================
  // 3. APPLICATION STATE
  // ==========================================================================
  const AppState = {
    puzzles: [],
    todayPuzzle: null,
    activePuzzle: null,
    isArchiveMode: false,
    selectedSlot: 0,
    currentDraft: [null, null, null, null, null],
    lockedSlots: [false, false, false, false, false],
    attemptsUsed: 0,
    isCompleted: false,
    isWon: false,
    historyGrid: [],
    store: loadStorage()
  };

  // ==========================================================================
  // 4. DOM REFERENCES
  // ==========================================================================
  const DOM = {
    btnHeaderHome: document.getElementById("btn-header-home"),
    btnHeaderBack: document.getElementById("btn-header-back"),
    headerTitle: document.getElementById("header-title"),
    
    // Views
    viewMenu: document.getElementById("view-menu"),
    viewGame: document.getElementById("view-game"),
    viewVault: document.getElementById("view-vault"),
    viewSettings: document.getElementById("view-settings"),
    
    // Main Menu
    btnMenuPlay: document.getElementById("btn-menu-play"),
    btnPlayLabel: document.getElementById("btn-play-label"),
    menuPlaySub: document.getElementById("menu-play-sub"),
    menuTodayDate: document.getElementById("menu-today-date"),
    btnMenuVault: document.getElementById("btn-menu-vault"),
    menuVaultCount: document.getElementById("menu-vault-count"),
    btnMenuSettings: document.getElementById("btn-menu-settings"),
    btnMenuRules: document.getElementById("btn-menu-rules"),
    
    // Utilities
    btnUtilStats: document.getElementById("btn-util-stats"),
    btnUtilShare: document.getElementById("btn-util-share"),
    btnUtilPlus: document.getElementById("btn-util-plus"),
    
    // Game Board
    gameTitleBadge: document.getElementById("game-title-badge"),
    gameAttemptsBadge: document.getElementById("game-attempts-badge"),
    gameClue: document.getElementById("game-clue"),
    hintBox: document.getElementById("hint-box"),
    hintText: document.getElementById("hint-text"),
    slotsContainer: document.getElementById("slots-container"),
    slots: document.querySelectorAll(".slot"),
    itemsPool: document.getElementById("items-pool"),
    btnClearPool: document.getElementById("btn-clear-pool"),
    btnSubmit: document.getElementById("btn-submit"),
    
    // Vault & Settings
    vaultList: document.getElementById("vault-list"),
    btnAnimOn: document.getElementById("btn-anim-on"),
    btnAnimOff: document.getElementById("btn-anim-off"),
    
    // Overlays & Panels
    panelRulesOverlay: document.getElementById("panel-rules-overlay"),
    sidePanelRules: document.getElementById("side-panel-rules"),
    backdropRules: document.getElementById("backdrop-rules"),
    btnCloseRules: document.getElementById("btn-close-rules"),
    btnRulesConfirm: document.getElementById("btn-rules-confirm"),
    
    // Modals
    modalStats: document.getElementById("modal-stats"),
    btnCloseStats: document.getElementById("btn-close-stats"),
    statPlayed: document.getElementById("stat-played"),
    statWinRate: document.getElementById("stat-win-rate"),
    statStreak: document.getElementById("stat-streak"),
    statMaxStreak: document.getElementById("stat-max-streak"),
    statsDistribution: document.getElementById("stats-distribution"),
    
    modalResult: document.getElementById("modal-result"),
    btnCloseResult: document.getElementById("btn-close-result"),
    resultTitle: document.getElementById("result-title"),
    resultSubtitle: document.getElementById("result-subtitle"),
    resultGrid: document.getElementById("result-grid"),
    resultSolutionList: document.getElementById("result-solution-list"),
    resultNotes: document.getElementById("result-notes"),
    btnShare: document.getElementById("btn-share"),
    btnResultVault: document.getElementById("btn-result-vault"),
    btnResultMenu: document.getElementById("btn-result-menu"),
    
    // Feedback & Atmosphere
    toast: document.getElementById("toast"),
    bgFloatingIcons: document.getElementById("bg-floating-icons")
  };

  // ==========================================================================
  // 5. STORAGE SYSTEM
  // ==========================================================================
  function loadStorage() {
    const fallback = {
      version: 2,
      settings: { anim: true },
      stats: { played: 0, won: 0, currentStreak: 0, maxStreak: 0, dist: { 1: 0, 2: 0, 3: 0, 4: 0 } },
      history: {}
    };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return {
        version: 2,
        settings: Object.assign({}, fallback.settings, parsed.settings || {}),
        stats: Object.assign({}, fallback.stats, parsed.stats || {}),
        history: parsed.history || {}
      };
    } catch (e) {
      return fallback;
    }
  }

  function saveStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(AppState.store));
    } catch (e) {
      // Ignore quota errors defensively
    }
  }

  // ==========================================================================
  // 6. CSV PARSER & DATA LOADER
  // ==========================================================================
  function parseCSV(text) {
    const rows = [];
    let row = [];
    let val = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      const next = text[i + 1];
      if (c === '"' && inQuotes && next === '"') {
        val += '"';
        i++;
      } else if (c === '"') {
        inQuotes = !inQuotes;
      } else if (c === "," && !inQuotes) {
        row.push(val.trim());
        val = "";
      } else if ((c === "\n" || (c === "\r" && next === "\n")) && !inQuotes) {
        if (c === "\r") i++;
        row.push(val.trim());
        rows.push(row);
        row = [];
        val = "";
      } else {
        val += c;
      }
    }
    if (val !== "" || (row.length > 0 && text[text.length - 1] === ",")) {
      row.push(val.trim());
    }
    if (row.length > 0) rows.push(row);
    return rows;
  }

  function shuffle(arr) {
    const res = arr.slice();
    for (let i = res.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = res[i];
      res[i] = res[j];
      res[j] = tmp;
    }
    return res;
  }

  // ==========================================================================
  // 7. TOAST FEEDBACK
  // ==========================================================================
  let toastTimer = null;
  function showToast(msg) {
    if (toastTimer) clearTimeout(toastTimer);
    DOM.toast.textContent = msg;
    DOM.toast.classList.remove("hidden");
    toastTimer = setTimeout(() => {
      DOM.toast.classList.add("hidden");
    }, 2200);
  }

  // ==========================================================================
  // 8. ROUTING & NAVIGATION
  // ==========================================================================
  function showView(viewId) {
    DOM.viewMenu.classList.add("hidden");
    DOM.viewGame.classList.add("hidden");
    DOM.viewVault.classList.add("hidden");
    DOM.viewSettings.classList.add("hidden");

    if (viewId === "menu") {
      DOM.btnHeaderBack.classList.add("hidden");
      DOM.btnHeaderHome.classList.remove("hidden");
      DOM.headerTitle.textContent = "SEQUENCE";
      DOM.viewMenu.classList.remove("hidden");
      renderMenu();
    } else {
      DOM.btnHeaderHome.classList.add("hidden");
      DOM.btnHeaderBack.classList.remove("hidden");

      if (viewId === "game") {
        DOM.headerTitle.textContent = "SEQUENCE";
        DOM.viewGame.classList.remove("hidden");
      } else if (viewId === "vault") {
        DOM.headerTitle.textContent = "VAULT";
        DOM.viewVault.classList.remove("hidden");
        renderVault();
      } else if (viewId === "settings") {
        DOM.headerTitle.textContent = "SETTINGS";
        DOM.viewSettings.classList.remove("hidden");
        renderSettings();
      }
    }
    window.scrollTo(0, 0);
  }

  // ==========================================================================
  // 9. HOW TO PLAY: STRICT RIGHT-TO-LEFT ENTRANCE
  // ==========================================================================
  function openHowToPlay() {
    DOM.panelRulesOverlay.classList.remove("hidden");
    // Trigger paint before class toggle to guarantee smooth slide-in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        DOM.panelRulesOverlay.classList.add("active");
        DOM.sidePanelRules.focus();
      });
    });
  }

  function closeHowToPlay() {
    DOM.panelRulesOverlay.classList.remove("active");
    setTimeout(() => {
      DOM.panelRulesOverlay.classList.add("hidden");
    }, 420); // Syncs with --panel-duration
  }

  // ==========================================================================
  // 10. BACKGROUND FLOATING ICONS SYSTEM (EXACT CANNABIS LEAF SVG)
  // ==========================================================================
  function initFloatingIcons() {
    DOM.bgFloatingIcons.innerHTML = "";
    const count = 12;
    const depths = ["depth-bg", "depth-mid", "depth-fg"];

    for (let i = 0; i < count; i++) {
      const el = document.createElement("div");
      const depth = depths[i % 3];
      el.className = `floating-icon ${depth}`;
      // Verbatim exact SVG injected without modifying its source attributes
      el.innerHTML = CANNABIS_LEAF_SVG;

      const left = Math.floor(Math.random() * 88) + 6;
      const duration = depth === "depth-bg" ? 26 + Math.random() * 10 : depth === "depth-mid" ? 20 + Math.random() * 8 : 15 + Math.random() * 6;
      const delay = -(Math.random() * duration);
      const drift = Math.floor(Math.random() * 44) - 22;
      const rot = Math.floor(Math.random() * 90) - 45;

      el.style.left = `${left}%`;
      el.style.animationDuration = `${duration}s`;
      el.style.animationDelay = `${delay}s`;
      el.style.setProperty("--drift", `${drift}px`);
      el.style.setProperty("--rot", `${rot}deg`);

      DOM.bgFloatingIcons.appendChild(el);
    }
    applyAnimationSetting();
  }

  function applyAnimationSetting() {
    const isEnabled = AppState.store.settings.anim;
    if (isEnabled) {
      document.body.classList.remove("anim-paused");
      DOM.btnAnimOn.classList.add("active");
      DOM.btnAnimOn.setAttribute("aria-pressed", "true");
      DOM.btnAnimOff.classList.remove("active");
      DOM.btnAnimOff.setAttribute("aria-pressed", "false");
    } else {
      document.body.classList.add("anim-paused");
      DOM.btnAnimOff.classList.add("active");
      DOM.btnAnimOff.setAttribute("aria-pressed", "true");
      DOM.btnAnimOn.classList.remove("active");
      DOM.btnAnimOn.setAttribute("aria-pressed", "false");
    }
  }

  function setAnimationSetting(on) {
    AppState.store.settings.anim = on;
    saveStorage();
    applyAnimationSetting();
  }

  // ==========================================================================
  // 11. INITIALIZATION & RELEASE PIPELINE
  // ==========================================================================
  async function init() {
    DOM.btnHeaderHome.setAttribute("href", HOME_URL);
    bindEvents();
    initFloatingIcons();

    await DailyReleaseEngine.synchronize();

    try {
      const res = await fetch("puzzles.csv");
      if (!res.ok) throw new Error("Network CSV missing");
      const text = await res.text();
      const rows = parseCSV(text);
      if (rows.length < 2) throw new Error("Malformed CSV");

      const header = rows[0];
      const rawList = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (r.length < header.length) continue;
        const p = {};
        header.forEach((k, idx) => (p[k] = r[idx]));
        rawList.push(p);
      }

      AppState.puzzles = rawList.map((p) => {
        const slots = [];
        const pool = [];
        for (let s = 1; s <= SLOTS_COUNT; s++) {
          const name = p[`slot_${s}_name`] || `Step ${s}`;
          const answer = p[`slot_${s}_answer`] || `Answer ${s}`;
          const decoy = p[`slot_${s}_decoy`] || `Decoy ${s}`;
          slots.push({ slotIndex: s - 1, name, answer });
          pool.push({ id: `${p.date}-c-${s}`, text: answer, slotIndex: s - 1 });
          pool.push({ id: `${p.date}-d-${s}`, text: decoy, slotIndex: null });
        }
        return {
          date: p.date,
          title: p.title || "Sequence Challenge",
          clue: p.clue || "Determine the proper sequence.",
          hint: p.hint || "Review the progression carefully.",
          notes: p.notes || "",
          slots,
          pool
        };
      });

      AppState.puzzles.sort((a, b) => a.date.localeCompare(b.date));

      const canonicalToday = DailyReleaseEngine.getCanonicalReleaseDate();
      let available = AppState.puzzles.filter((p) => p.date <= canonicalToday);
      if (available.length === 0) available = [AppState.puzzles[0]];

      AppState.todayPuzzle = available[available.length - 1];
      showView("menu");
    } catch (err) {
      createFallbackPuzzle();
      showView("menu");
    }
  }

  function createFallbackPuzzle() {
    const today = DailyReleaseEngine.getCanonicalReleaseDate();
    const fallback = {
      date: today,
      title: "Solar System Distance",
      clue: "Order the celestial bodies from nearest to farthest from the Sun.",
      hint: "Mercury is closest; Earth is third from the Sun.",
      notes: "Astronomical planetary ordering outward from the Sun.",
      slots: [
        { slotIndex: 0, name: "1st From Sun", answer: "Mercury" },
        { slotIndex: 1, name: "2nd From Sun", answer: "Venus" },
        { slotIndex: 2, name: "3rd From Sun", answer: "Earth" },
        { slotIndex: 3, name: "4th From Sun", answer: "Mars" },
        { slotIndex: 4, name: "5th From Sun", answer: "Jupiter" }
      ],
      pool: [
        { id: "fb-c-1", text: "Mercury", slotIndex: 0 },
        { id: "fb-d-1", text: "Pluto", slotIndex: null },
        { id: "fb-c-2", text: "Venus", slotIndex: 1 },
        { id: "fb-d-2", text: "Moon", slotIndex: null },
        { id: "fb-c-3", text: "Earth", slotIndex: 2 },
        { id: "fb-d-3", text: "Ceres", slotIndex: null },
        { id: "fb-c-4", text: "Mars", slotIndex: 3 },
        { id: "fb-d-4", text: "Titan", slotIndex: null },
        { id: "fb-c-5", text: "Jupiter", slotIndex: 4 },
        { id: "fb-d-5", text: "Saturn", slotIndex: null }
      ]
    };
    AppState.puzzles = [fallback];
    AppState.todayPuzzle = fallback;
  }

  // ==========================================================================
  // 12. MENU RENDERING
  // ==========================================================================
  function renderMenu() {
    const today = AppState.todayPuzzle;
    if (!today) return;

    DOM.menuTodayDate.textContent = today.date;
    DOM.btnPlayLabel.textContent = "Play Sequence";

    const record = AppState.store.history[today.date];
    if (record && record.completed) {
      DOM.menuPlaySub.textContent = record.won ? `Solved (${record.attemptsUsed}/${MAX_ATTEMPTS})` : "Completed (Unsolved)";
    } else if (record && record.attemptsUsed > 0) {
      DOM.menuPlaySub.textContent = `Resume (${record.attemptsUsed}/${MAX_ATTEMPTS} attempts)`;
    } else {
      DOM.menuPlaySub.textContent = "Daily Challenge";
    }

    const past = AppState.puzzles.filter((p) => p.date < today.date);
    DOM.menuVaultCount.textContent = past.length;
  }

  // ==========================================================================
  // 13. GAMEPLAY ENGINE (SINGLE-TAP INTERACTION)
  // ==========================================================================
  function startPuzzle(puzzle, isArchive = false) {
    AppState.activePuzzle = puzzle;
    AppState.isArchiveMode = isArchive;
    AppState.selectedSlot = 0;

    const record = AppState.store.history[puzzle.date];
    if (record) {
      AppState.isCompleted = !!record.completed;
      AppState.isWon = !!record.won;
      AppState.attemptsUsed = record.attemptsUsed || 0;
      AppState.lockedSlots = Array.isArray(record.lockedSlots) ? record.lockedSlots.slice() : [false, false, false, false, false];
      AppState.currentDraft = Array.isArray(record.draft) ? record.draft.slice() : [null, null, null, null, null];
      AppState.historyGrid = Array.isArray(record.historyGrid) ? record.historyGrid.slice() : [];
    } else {
      AppState.isCompleted = false;
      AppState.isWon = false;
      AppState.attemptsUsed = 0;
      AppState.lockedSlots = [false, false, false, false, false];
      AppState.currentDraft = [null, null, null, null, null];
      AppState.historyGrid = [];
    }

    DOM.gameTitleBadge.textContent = `${puzzle.title} (${puzzle.date})`;
    DOM.gameClue.textContent = puzzle.clue;

    if (!puzzle.shuffledPool) {
      puzzle.shuffledPool = shuffle(puzzle.pool);
    }

    const firstFree = AppState.lockedSlots.findIndex((l) => !l);
    AppState.selectedSlot = firstFree !== -1 ? firstFree : 0;

    renderGameStatus();
    renderSlots();
    renderPool();
    showView("game");
  }

  function renderGameStatus() {
    const remaining = MAX_ATTEMPTS - AppState.attemptsUsed;
    DOM.gameAttemptsBadge.textContent = `Attempts: ${remaining} / ${MAX_ATTEMPTS}`;

    const hintAvailable = AppState.attemptsUsed >= 2 || AppState.isCompleted;
    if (hintAvailable) {
      DOM.hintBox.classList.remove("hidden");
      DOM.hintText.textContent = AppState.activePuzzle.hint;
    } else {
      DOM.hintBox.classList.add("hidden");
    }

    if (AppState.isCompleted) {
      DOM.btnSubmit.textContent = "View Summary";
      DOM.btnClearPool.classList.add("hidden");
    } else {
      DOM.btnSubmit.textContent = "Submit Sequence";
      DOM.btnClearPool.classList.remove("hidden");
    }
  }

  function renderSlots() {
    DOM.slots.forEach((el, idx) => {
      const slotDef = AppState.activePuzzle.slots[idx];
      el.querySelector(".slot-label").textContent = slotDef.name;
      el.classList.remove("active", "locked");

      const valHolder = el.querySelector(".slot-value");
      valHolder.innerHTML = "";

      if (AppState.lockedSlots[idx]) {
        el.classList.add("locked");
        el.setAttribute("aria-label", `Slot ${idx + 1}: Locked correct, ${slotDef.answer}`);
        el.setAttribute("aria-pressed", "true");
        valHolder.textContent = slotDef.answer;
      } else if (AppState.currentDraft[idx]) {
        const item = AppState.currentDraft[idx];
        el.setAttribute("aria-label", `Slot ${idx + 1}: ${item.text}. Tap to remove.`);
        el.setAttribute("aria-pressed", idx === AppState.selectedSlot ? "true" : "false");
        valHolder.textContent = item.text;
      } else {
        el.setAttribute("aria-label", `Slot ${idx + 1}: Empty`);
        el.setAttribute("aria-pressed", idx === AppState.selectedSlot ? "true" : "false");
        valHolder.innerHTML = '<span class="placeholder">Empty</span>';
      }

      if (!AppState.isCompleted && !AppState.lockedSlots[idx] && idx === AppState.selectedSlot) {
        el.classList.add("active");
      }
    });
  }

  function renderPool() {
    DOM.itemsPool.innerHTML = "";
    const placedIds = new Set(AppState.currentDraft.filter(Boolean).map((t) => t.id));

    AppState.activePuzzle.shuffledPool.forEach((item) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "item-tile";
      btn.textContent = item.text;

      if (placedIds.has(item.id)) {
        btn.classList.add("used");
        btn.setAttribute("aria-disabled", "true");
        btn.tabIndex = -1;
      } else {
        btn.setAttribute("aria-label", `Place ${item.text}`);
        btn.addEventListener("click", () => handleTileClick(item));
      }
      DOM.itemsPool.appendChild(btn);
    });
  }

  function handleTileClick(item) {
    if (AppState.isCompleted) return;

    let target = AppState.selectedSlot;
    if (AppState.lockedSlots[target] || AppState.currentDraft[target]) {
      target = -1;
      for (let i = 0; i < SLOTS_COUNT; i++) {
        if (!AppState.lockedSlots[i] && !AppState.currentDraft[i]) {
          target = i;
          break;
        }
      }
    }
    if (target === -1) target = AppState.selectedSlot;
    if (AppState.lockedSlots[target]) return;

    AppState.currentDraft[target] = item;

    // Advance to next unfilled slot
    let next = -1;
    for (let i = 0; i < SLOTS_COUNT; i++) {
      if (!AppState.lockedSlots[i] && !AppState.currentDraft[i]) {
        next = i;
        break;
      }
    }
    AppState.selectedSlot = next !== -1 ? next : target;

    renderSlots();
    renderPool();
  }

  function handleSlotClick(idx) {
    if (AppState.isCompleted || AppState.lockedSlots[idx]) return;

    if (AppState.currentDraft[idx]) {
      AppState.currentDraft[idx] = null;
      AppState.selectedSlot = idx;
    } else {
      AppState.selectedSlot = idx;
    }
    renderSlots();
    renderPool();
  }

  function clearDraft() {
    if (AppState.isCompleted) return;
    for (let i = 0; i < SLOTS_COUNT; i++) {
      if (!AppState.lockedSlots[i]) AppState.currentDraft[i] = null;
    }
    const firstFree = AppState.lockedSlots.findIndex((l) => !l);
    AppState.selectedSlot = firstFree !== -1 ? firstFree : 0;
    renderSlots();
    renderPool();
  }

  function submitAttempt() {
    if (AppState.isCompleted) {
      openResultModal();
      return;
    }

    for (let i = 0; i < SLOTS_COUNT; i++) {
      if (!AppState.lockedSlots[i] && !AppState.currentDraft[i]) {
        showToast("Fill all 5 sequence slots before submitting.");
        return;
      }
    }

    AppState.attemptsUsed++;
    const rowResult = [];

    for (let i = 0; i < SLOTS_COUNT; i++) {
      if (AppState.lockedSlots[i]) {
        rowResult.push("hit");
        continue;
      }
      const item = AppState.currentDraft[i];
      if (item && item.slotIndex === i) {
        AppState.lockedSlots[i] = true;
        rowResult.push("hit");
      } else {
        AppState.currentDraft[i] = null;
        rowResult.push("miss");
        const slotEl = DOM.slots[i];
        slotEl.classList.add("incorrect-flash");
        setTimeout(() => slotEl.classList.remove("incorrect-flash"), 450);
      }
    }

    AppState.historyGrid.push(rowResult);

    const isAllCorrect = AppState.lockedSlots.every(Boolean);
    if (isAllCorrect) {
      AppState.isCompleted = true;
      AppState.isWon = true;
      saveProgress();
      recordStats(true, AppState.attemptsUsed);
      renderGameStatus();
      renderSlots();
      renderPool();
      setTimeout(openResultModal, 400);
      return;
    }

    if (AppState.attemptsUsed >= MAX_ATTEMPTS) {
      AppState.isCompleted = true;
      AppState.isWon = false;
      AppState.lockedSlots = [true, true, true, true, true];
      saveProgress();
      recordStats(false, AppState.attemptsUsed);
      renderGameStatus();
      renderSlots();
      renderPool();
      setTimeout(openResultModal, 400);
      return;
    }

    const nextFree = AppState.lockedSlots.findIndex((l) => !l);
    AppState.selectedSlot = nextFree !== -1 ? nextFree : 0;
    saveProgress();
    renderGameStatus();
    renderSlots();
    renderPool();
  }

  function saveProgress() {
    AppState.store.history[AppState.activePuzzle.date] = {
      completed: AppState.isCompleted,
      won: AppState.isWon,
      attemptsUsed: AppState.attemptsUsed,
      lockedSlots: AppState.lockedSlots.slice(),
      draft: AppState.currentDraft.slice(),
      historyGrid: AppState.historyGrid.slice()
    };
    saveStorage();
  }

  function recordStats(won, attempts) {
    if (AppState.isArchiveMode) return;
    const s = AppState.store.stats;
    s.played++;
    if (won) {
      s.won++;
      s.currentStreak++;
      if (s.currentStreak > s.maxStreak) s.maxStreak = s.currentStreak;
      if (s.dist[attempts] !== undefined) s.dist[attempts]++;
    } else {
      s.currentStreak = 0;
    }
    saveStorage();
  }

  // ==========================================================================
  // 14. VAULT & SETTINGS RENDERING
  // ==========================================================================
  function renderVault() {
    DOM.vaultList.innerHTML = "";
    const canonicalToday = DailyReleaseEngine.getCanonicalReleaseDate();
    const past = AppState.puzzles.filter((p) => p.date < canonicalToday);

    if (past.length === 0) {
      DOM.vaultList.innerHTML = '<p class="status-caption">No past challenges available yet.</p>';
      return;
    }

    past.slice().reverse().forEach((puzzle) => {
      const record = AppState.store.history[puzzle.date];
      const item = document.createElement("div");
      item.className = "vault-item";
      item.setAttribute("role", "button");
      item.setAttribute("tabindex", "0");

      let status = "Not Started";
      let isSolved = false;
      if (record && record.completed) {
        status = record.won ? `Solved (${record.attemptsUsed}/${MAX_ATTEMPTS})` : "Unsolved";
        isSolved = record.won;
      }

      item.innerHTML = `
        <div>
          <div class="vault-item-title">${puzzle.title}</div>
          <div class="status-caption">${puzzle.date}</div>
        </div>
        <span class="badge ${isSolved ? "badge-accent" : ""}">${status}</span>
      `;

      const selectVaultPuzzle = () => startPuzzle(puzzle, true);
      item.addEventListener("click", selectVaultPuzzle);
      item.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectVaultPuzzle();
        }
      });

      DOM.vaultList.appendChild(item);
    });
  }

  function renderSettings() {
    applyAnimationSetting();
  }

  // ==========================================================================
  // 15. MODALS: STATS & RESULTS
  // ==========================================================================
  function openStatsModal() {
    const s = AppState.store.stats;
    DOM.statPlayed.textContent = s.played;
    DOM.statWinRate.textContent = `${s.played > 0 ? Math.round((s.won / s.played) * 100) : 0}%`;
    DOM.statStreak.textContent = s.currentStreak;
    DOM.statMaxStreak.textContent = s.maxStreak;

    DOM.statsDistribution.innerHTML = "";
    const maxVal = Math.max(1, ...Object.values(s.dist));
    for (let i = 1; i <= MAX_ATTEMPTS; i++) {
      const count = s.dist[i] || 0;
      const pct = Math.max(14, Math.round((count / maxVal) * 100));

      const row = document.createElement("div");
      row.className = "dist-row";
      row.innerHTML = `
        <span style="width:16px;font-weight:800;">${i}</span>
        <div class="dist-bar-bg">
          <div class="dist-bar-fill" style="width:${pct}%">${count}</div>
        </div>
      `;
      DOM.statsDistribution.appendChild(row);
    }
    DOM.modalStats.classList.remove("hidden");
  }

  function openResultModal() {
    const p = AppState.activePuzzle;
    DOM.resultTitle.textContent = AppState.isWon ? "Sequence Solved!" : "Challenge Complete";
    DOM.resultSubtitle.textContent = `${p.title} (${p.date})`;

    DOM.resultGrid.innerHTML = "";
    AppState.historyGrid.forEach((row) => {
      const rowEl = document.createElement("div");
      rowEl.className = "result-grid-row";
      row.forEach((cell) => {
        const cellEl = document.createElement("div");
        cellEl.className = `result-grid-cell ${cell}`;
        rowEl.appendChild(cellEl);
      });
      DOM.resultGrid.appendChild(rowEl);
    });

    DOM.resultSolutionList.innerHTML = "";
    p.slots.forEach((s) => {
      const li = document.createElement("li");
      li.innerHTML = `<strong>${s.name}:</strong> ${s.answer}`;
      DOM.resultSolutionList.appendChild(li);
    });

    DOM.resultNotes.textContent = p.notes || "";
    DOM.modalResult.classList.remove("hidden");
  }

  // ==========================================================================
  // 16. SHARING SYSTEM
  // ==========================================================================
  function handleShareAction() {
    const url = window.location.href;
    const title = "Sequence Puzzle";
    const text = "Arrange the 5 items into their correct sequential order!";

    if (navigator.share) {
      navigator.share({ title, text, url }).catch(() => {});
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url)
        .then(() => showToast("Link copied to clipboard."))
        .catch(() => showToast("Unable to copy link."));
    } else {
      showToast("Sharing not supported on this browser.");
    }
  }

  function handleResultShare() {
    const p = AppState.activePuzzle;
    const score = AppState.isWon ? `${AppState.attemptsUsed}/${MAX_ATTEMPTS}` : "X/4";
    let shareText = `Sequence ${p.date} — ${score}\n`;
    AppState.historyGrid.forEach((row) => {
      shareText += row.map((cell) => (cell === "hit" ? "🟩" : "⬜")).join("") + "\n";
    });

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(shareText)
        .then(() => showToast("Score copied to clipboard!"))
        .catch(() => showToast("Unable to copy score."));
    } else {
      showToast("Clipboard unavailable.");
    }
  }

  // ==========================================================================
  // 17. EVENT BINDING
  // ==========================================================================
  function bindEvents() {
    DOM.btnHeaderBack.addEventListener("click", () => showView("menu"));

    // Menu Primary Actions
    DOM.btnMenuPlay.addEventListener("click", () => startPuzzle(AppState.todayPuzzle, false));
    DOM.btnMenuVault.addEventListener("click", () => showView("vault"));
    DOM.btnMenuSettings.addEventListener("click", () => showView("settings"));
    DOM.btnMenuRules.addEventListener("click", openHowToPlay);

    // Menu Utilities
    DOM.btnUtilStats.addEventListener("click", openStatsModal);
    DOM.btnUtilShare.addEventListener("click", handleShareAction);
    DOM.btnUtilPlus.addEventListener("click", () => {
      // Reserved for future collection link
      showToast("Tileworks collection catalog.");
    });

    // Settings
    DOM.btnAnimOn.addEventListener("click", () => setAnimationSetting(true));
    DOM.btnAnimOff.addEventListener("click", () => setAnimationSetting(false));

    // Panel Events
    DOM.btnCloseRules.addEventListener("click", closeHowToPlay);
    DOM.btnRulesConfirm.addEventListener("click", closeHowToPlay);
    DOM.backdropRules.addEventListener("click", closeHowToPlay);

    // Gameplay
    DOM.slots.forEach((el) => {
      const idx = parseInt(el.dataset.slot, 10);
      el.addEventListener("click", () => handleSlotClick(idx));
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleSlotClick(idx);
        }
      });
    });

    DOM.btnClearPool.addEventListener("click", clearDraft);
    DOM.btnSubmit.addEventListener("click", submitAttempt);

    // Modals
    DOM.btnCloseStats.addEventListener("click", () => DOM.modalStats.classList.add("hidden"));
    DOM.btnCloseResult.addEventListener("click", () => DOM.modalResult.classList.add("hidden"));
    DOM.btnResultMenu.addEventListener("click", () => {
      DOM.modalResult.classList.add("hidden");
      showView("menu");
    });
    DOM.btnResultVault.addEventListener("click", () => {
      DOM.modalResult.classList.add("hidden");
      showView("vault");
    });
    DOM.btnShare.addEventListener("click", handleResultShare);

    [DOM.modalStats, DOM.modalResult].forEach((backdrop) => {
      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) backdrop.classList.add("hidden");
      });
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        DailyReleaseEngine.synchronize();
      }
    });
  }

  // Boot on DOM Ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();