function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeTags(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const out = [];
  for (const t of arr) {
    const s = String(t).trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function parseTagsFromInput(str) {
  if (str == null || typeof str !== "string") return [];
  const parts = str.split(",").map((t) => t.trim()).filter(Boolean);
  return normalizeTags(parts);
}

function normalizeReminder(raw) {
  if (raw == null || raw === "") return null;
  const d = new Date(typeof raw === "string" ? raw : String(raw));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function parseReminderFromInput(val) {
  if (val == null || String(val).trim() === "") return null;
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function reminderToDatetimeLocalValue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatReminderLabel(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const month = d.toLocaleString("en-US", { month: "short" });
  const day = d.getDate();
  const time = d.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  });
  return `⏰ ${month} ${day}, ${time}`;
}

function normalizeSearchNeedle(str) {
  if (str == null || typeof str !== "string") return "";
  return str.trim().toLowerCase();
}

function noteMatchesSearch(note, needle) {
  if (!needle) return true;
  const title = String(note.title ?? "").toLowerCase();
  const text = String(note.text ?? "").toLowerCase();
  return title.includes(needle) || text.includes(needle);
}

/** Soft warning when title + body length reaches this (localStorage is unbounded). */
const NOTE_CHAR_WARN_THRESHOLD = 8000;

const NOTE_COLORS = [
  { id: "white", label: "Default", bg: "#ffffff" },
  { id: "yellow", label: "Yellow", bg: "#fff8b8" },
  { id: "green", label: "Green", bg: "#e6f4ea" },
  { id: "blue", label: "Blue", bg: "#d3e3fd" },
  { id: "pink", label: "Pink", bg: "#fce8ef" },
];

function normalizeNote(raw) {
  const n = raw && typeof raw === "object" ? raw : {};
  const color = NOTE_COLORS.some((c) => c.id === n.color) ? n.color : "white";
  const pinned = n.pinned === true;
  const tags = normalizeTags(n.tags);
  const reminder = normalizeReminder(n.reminder);
  return { ...n, color, pinned, tags, reminder };
}

function normalizeNotesList(arr) {
  return Array.isArray(arr) ? arr.map(normalizeNote) : [];
}

function noteBackground(colorId) {
  const found = NOTE_COLORS.find((c) => c.id === colorId);
  return found ? found.bg : NOTE_COLORS[0].bg;
}

class Note {
  constructor(id, title, text, color = "white", pinned = false, tags = [], reminder = null) {
    this.id = id;
    this.title = title;
    this.text = text;
    this.color = NOTE_COLORS.some((c) => c.id === color) ? color : "white";
    this.pinned = pinned === true;
    this.tags = normalizeTags(tags);
    this.reminder = normalizeReminder(reminder);
  }
}

class App {
  constructor() {
    this.notes = normalizeNotesList(JSON.parse(localStorage.getItem("notes")) || []);
    this.archivedNotes = normalizeNotesList(JSON.parse(localStorage.getItem("archivedNotes")) || []);
    this.trashedNotes = normalizeNotesList(JSON.parse(localStorage.getItem("trashedNotes")) || []);
    this.view = localStorage.getItem("notesView") || "notes";
    this.tagFilter = null;
    this.searchQuery = "";

    this.selectedNoteId = "";
    this.miniSidebar = true;

    this.$activeForm = document.querySelector(".active-form");
    this.$inactiveForm = document.querySelector(".inactive-form");
    this.$noteTitle = document.querySelector("#note-title");
    this.$noteText = document.querySelector("#note-text");
    this.$inactiveNoteText = document.querySelector("#inactive-note-text");
    this.$notes = document.querySelector(".notes");
    this.$form = document.querySelector("#form");
    this.$modal = document.querySelector(".modal");
    this.$modalForm = document.querySelector("#modal-form");
    this.$modalTitle = document.querySelector("#modal-title");
    this.$modalText = document.querySelector("#modal-text");
    this.$noteTagsInput = document.querySelector("#note-tags-input");
    this.$modalTagsInput = document.querySelector("#modal-tags-input");
    this.$noteReminderInput = document.querySelector("#note-reminder-input");
    this.$modalReminderInput = document.querySelector("#modal-reminder-input");
    this.$activeCharCounter = document.querySelector("#active-note-char-counter");
    this.$modalCharCounter = document.querySelector("#modal-note-char-counter");
    this.$inactiveCharCounter = document.querySelector("#inactive-note-char-counter");
    this.$tagFilterBar = document.querySelector("#tag-filter-bar");
    this.$tagFilterDisplay = document.querySelector("#tag-filter-display");
    this.$searchInput = document.querySelector("#notes-search-input");
    this.$searchClear = document.querySelector("#notes-search-clear");
    this.$closeModalForm = document.querySelector("#modal-btn");
    this.$sidebar = document.querySelector(".sidebar");
    this.$menuToggle = document.querySelector("#nav-menu-toggle");
    this.$sidebarBackdrop = document.querySelector("#sidebar-backdrop");
    this.$settingsToggle = document.querySelector("#settings-toggle");
    this.$settingsDropdown = document.querySelector("#settings-dropdown");
    this.$noteToolsHoverOnly = document.querySelector("#note-tools-hover-only");
    this.$colorPopover = document.querySelector("#note-color-popover");
    this.$morePopover = document.querySelector("#note-more-popover");
    this._popoverNoteId = null;
    this._moreMenuNoteId = null;
    this._notesSortable = null;
    this._isFirstNotesPaint = true;
    this._enterAnimationNoteId = null;
    this._enterAnimationClearTimer = null;

    this.initColorSwatches();
    this.syncColorSwatches(this.$form, "white");
    this.syncColorSwatches(this.$modalForm, "white");
    this.applyNoteToolsVisibilityPreference();
    this.syncSidebarActiveFromView();
    this.addEventListeners();
    this.initThemeToggle();
    this.bindCharCounterInputs();
    this.refreshAllCharCounters();
    this.displayNotes();
  }

  updateCharCounterEl(el, count, warnAt = NOTE_CHAR_WARN_THRESHOLD) {
    if (!el) return;
    el.textContent = `${count} character${count === 1 ? "" : "s"}`;
    el.classList.toggle("note-char-counter--warn", count >= warnAt);
  }

  updateActiveFormCharCounter() {
    const title = this.$noteTitle ? this.$noteTitle.value.length : 0;
    const text = this.$noteText ? this.$noteText.value.length : 0;
    this.updateCharCounterEl(this.$activeCharCounter, title + text);
  }

  updateModalCharCounter() {
    const title = this.$modalTitle ? this.$modalTitle.value.length : 0;
    const text = this.$modalText ? this.$modalText.value.length : 0;
    this.updateCharCounterEl(this.$modalCharCounter, title + text);
  }

  updateInactiveCharCounter() {
    const text = this.$inactiveNoteText ? this.$inactiveNoteText.value.length : 0;
    this.updateCharCounterEl(this.$inactiveCharCounter, text);
  }

  refreshAllCharCounters() {
    this.updateActiveFormCharCounter();
    this.updateModalCharCounter();
    this.updateInactiveCharCounter();
  }

  bindCharCounterInputs() {
    this.$noteTitle?.addEventListener("input", () => this.updateActiveFormCharCounter());
    this.$noteText?.addEventListener("input", () => this.updateActiveFormCharCounter());
    this.$modalTitle?.addEventListener("input", () => this.updateModalCharCounter());
    this.$modalText?.addEventListener("input", () => this.updateModalCharCounter());
    this.$inactiveNoteText?.addEventListener("input", () => this.updateInactiveCharCounter());
  }

  initThemeToggle() {
    this.$themeToggle = document.querySelector("#theme-toggle");
    this.syncThemeToggleButton();
    this.$themeToggle?.addEventListener("click", () => this.toggleTheme());
  }

  toggleTheme() {
    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    if (dark) {
      document.documentElement.removeAttribute("data-theme");
      try {
        localStorage.setItem("theme", "light");
      } catch (e) {}
    } else {
      document.documentElement.setAttribute("data-theme", "dark");
      try {
        localStorage.setItem("theme", "dark");
      } catch (e) {}
    }
    this.syncThemeToggleButton();
  }

  syncThemeToggleButton() {
    const btn = this.$themeToggle;
    if (!btn) return;
    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    btn.textContent = dark ? "☀️" : "🌙";
    btn.setAttribute(
      "aria-label",
      dark ? "Switch to light mode" : "Switch to dark mode"
    );
    btn.setAttribute("aria-pressed", dark ? "true" : "false");
    btn.title = dark ? "Light mode" : "Dark mode";
  }

  applyNoteToolsVisibilityPreference() {
    const hoverOnly = localStorage.getItem("noteToolsHoverOnly") === "true";
    if (this.$noteToolsHoverOnly) {
      this.$noteToolsHoverOnly.checked = hoverOnly;
    }
    document.body.classList.toggle("note-tools-hover-only", hoverOnly);
  }

  syncSidebarActiveFromView() {
    const items = this.$sidebar.querySelectorAll(".sidebar-item[data-nav]");
    items.forEach((item) => {
      const icon = item.querySelector(".material-symbols-outlined");
      const match = item.dataset.nav === this.view;
      item.classList.toggle("sidebar-active-item", match);
      if (icon) icon.classList.toggle("active", match);
    });
  }

  setView(nav) {
    if (!["notes", "archive", "trash"].includes(nav)) return;
    this.view = nav;
    this.tagFilter = null;
    localStorage.setItem("notesView", nav);
    this.syncSidebarActiveFromView();
    this.closeMobileSidebar();
    this.render();
  }

  findNoteById(id) {
    return (
      this.notes.find((n) => n.id == id) ||
      this.archivedNotes.find((n) => n.id == id) ||
      this.trashedNotes.find((n) => n.id == id) ||
      null
    );
  }

  syncSearchClearButton() {
    if (!this.$searchClear) return;
    const hasText = Boolean(this.$searchInput?.value?.trim());
    this.$searchClear.hidden = !hasText;
    this.$searchClear.setAttribute("aria-hidden", hasText ? "false" : "true");
  }

  updateTagFilterBar() {
    if (!this.$tagFilterBar || !this.$tagFilterDisplay) return;
    const show =
      this.tagFilter &&
      (this.view === "notes" || this.view === "archive");
    this.$tagFilterBar.hidden = !show;
    if (show) {
      this.$tagFilterDisplay.textContent = this.tagFilter;
    }
  }

  setTagFilter(tag) {
    const t = String(tag).trim();
    if (!t) return;
    const key = t.toLowerCase();
    if (this.tagFilter && this.tagFilter.toLowerCase() === key) {
      this.tagFilter = null;
    } else {
      this.tagFilter = t;
    }
    this.render();
  }

  handleTagFilterClick(event) {
    const pill = event.target.closest(".note-tag-pill");
    if (!pill) return false;
    event.stopPropagation();
    event.preventDefault();
    const tag = pill.getAttribute("data-filter-tag");
    if (tag) this.setTagFilter(tag);
    return true;
  }

  appendTagToInput(inputEl, tag) {
    if (!inputEl || !tag) return;
    const next = normalizeTags([...parseTagsFromInput(inputEl.value), tag]);
    inputEl.value = next.join(", ");
  }

  isMobileLayout() {
    return typeof window.matchMedia === "function" && window.matchMedia("(max-width: 599px)").matches;
  }

  closeMobileSidebar() {
    document.body.classList.remove("sidebar-open");
    this.$menuToggle?.setAttribute("aria-expanded", "false");
  }

  toggleMobileSidebar(event) {
    event.stopPropagation();
    const isOpen = document.body.classList.toggle("sidebar-open");
    this.$menuToggle?.setAttribute("aria-expanded", isOpen ? "true" : "false");
  }

  initColorSwatches() {
    document.querySelectorAll(".note-color-swatches").forEach((el) => {
      if (el.dataset.initialized === "true") return;
      el.dataset.initialized = "true";
      el.innerHTML = NOTE_COLORS.map(
        (c) =>
          `<button type="button" class="color-swatch color-swatch--${c.id}" data-note-color="${c.id}" title="${escapeHtml(c.label)}" aria-label="${escapeHtml(c.label)}" aria-pressed="false"></button>`
      ).join("");
    });
  }

  syncColorSwatches(scopeEl, colorId) {
    if (!scopeEl) return;
    const safe = NOTE_COLORS.some((c) => c.id === colorId) ? colorId : "white";
    const hidden = scopeEl.querySelector('input[name="noteColor"]');
    if (hidden) hidden.value = safe;
    scopeEl.querySelectorAll(".color-swatch").forEach((btn) => {
      const sel = btn.dataset.noteColor === safe;
      btn.classList.toggle("is-selected", sel);
      btn.setAttribute("aria-pressed", String(sel));
    });
  }

  closeColorPopover() {
    if (this.$colorPopover) {
      this.$colorPopover.hidden = true;
    }
    this._popoverNoteId = null;
  }

  closeMorePopover() {
    if (this.$morePopover) {
      this.$morePopover.hidden = true;
    }
    this._moreMenuNoteId = null;
  }

  openMorePopover(event) {
    const trigger = event.target.closest(".note-more-btn");
    const note = trigger?.closest(".note");
    if (!note || !this.$morePopover || this.view === "trash") return;
    event.stopPropagation();
    this.closeColorPopover();
    this._moreMenuNoteId = note.id;
    const r = trigger.getBoundingClientRect();
    const pad = 8;
    let left = r.left + r.width / 2;
    const popW = 200;
    left = Math.max(pad, Math.min(left - popW / 2, window.innerWidth - popW - pad));
    this.$morePopover.style.position = "fixed";
    this.$morePopover.style.top = `${r.bottom + 6}px`;
    this.$morePopover.style.left = `${left}px`;
    this.$morePopover.hidden = false;
  }

  handleMoreMenuUiClick(event) {
    const pop = this.$morePopover;
    if (pop && !pop.hidden && pop.contains(event.target)) {
      if (event.target.closest(".note-more-delete") && this._moreMenuNoteId) {
        this.moveNoteToTrash(this._moreMenuNoteId);
        this.closeMorePopover();
      }
      event.stopPropagation();
      return true;
    }
    if (pop && !pop.hidden && !event.target.closest(".note-more-btn")) {
      this.closeMorePopover();
    }
    const moreBtn = event.target.closest(".note-more-btn");
    if (moreBtn) {
      const note = moreBtn.closest(".note");
      if (
        this.$morePopover &&
        !this.$morePopover.hidden &&
        this._moreMenuNoteId === note?.id
      ) {
        this.closeMorePopover();
      } else {
        this.openMorePopover(event);
      }
      return true;
    }
    return false;
  }

  openColorPopover(event) {
    const trigger = event.target.closest(".note-palette");
    const note = trigger?.closest(".note");
    if (!note || !this.$colorPopover || this.view === "trash") return;
    event.stopPropagation();
    this.closeMorePopover();
    this._popoverNoteId = note.id;
    const colorId = note.dataset.noteColor || "white";
    this.syncColorSwatches(this.$colorPopover, colorId);
    const r = trigger.getBoundingClientRect();
    const pad = 8;
    const popW = 280;
    let left = r.left;
    left = Math.max(pad, Math.min(left, window.innerWidth - popW - pad));
    this.$colorPopover.style.position = "fixed";
    this.$colorPopover.style.top = `${r.bottom + 8}px`;
    this.$colorPopover.style.left = `${left}px`;
    this.$colorPopover.hidden = false;
  }

  applyNoteColor(noteId, colorId) {
    const safe = NOTE_COLORS.some((c) => c.id === colorId) ? colorId : "white";
    const list = this.findNoteCollection(noteId);
    if (!list) return;
    list.forEach((n) => {
      if (n.id == noteId) n.color = safe;
    });
    this.render();
  }

  handleColorUiClick(event) {
    const pop = this.$colorPopover;
    if (pop && !pop.hidden && pop.contains(event.target)) {
      const sw = event.target.closest(".color-swatch");
      if (sw && this._popoverNoteId) {
        this.applyNoteColor(this._popoverNoteId, sw.dataset.noteColor);
        this.closeColorPopover();
      }
      return true;
    }
    if (pop && !pop.hidden && !event.target.closest(".note-palette")) {
      this.closeColorPopover();
    }
    if (event.target.closest(".note-palette")) {
      this.openColorPopover(event);
      return true;
    }
    return false;
  }

  addEventListeners() {
    document.body.addEventListener("click", (event) => {
      if (this.handleColorUiClick(event)) {
        return;
      }
      if (this.handleMoreMenuUiClick(event)) {
        return;
      }
      if (this.handlePinToggle(event)) {
        return;
      }
      if (this.handleTagFilterClick(event)) {
        return;
      }
      this.handleFormClick(event);
      this.closeModal(event);
      this.openModal(event);
      this.handleArchiving(event);
      this.handleMoveToTrash(event);
      this.handleDeleteForever(event);
    });

    this.$form.addEventListener("click", (event) => {
      const sw = event.target.closest(".color-swatch");
      if (!sw || !this.$form.contains(sw)) return;
      event.preventDefault();
      this.syncColorSwatches(this.$form, sw.dataset.noteColor);
    });

    this.$modalForm.addEventListener("click", (event) => {
      const sw = event.target.closest(".color-swatch");
      if (sw && this.$modalForm.contains(sw)) {
        event.preventDefault();
        this.syncColorSwatches(this.$modalForm, sw.dataset.noteColor);
        return;
      }
      const sug = event.target.closest(".tag-suggestion");
      if (sug && this.$modalForm.contains(sug)) {
        event.preventDefault();
        this.appendTagToInput(this.$modalTagsInput, sug.dataset.tagValue);
      }
    });

    this.$form.addEventListener("click", (event) => {
      const sug = event.target.closest(".tag-suggestion");
      if (!sug || !this.$form.contains(sug)) return;
      event.preventDefault();
      this.appendTagToInput(this.$noteTagsInput, sug.dataset.tagValue);
    });

    document.querySelector("#tag-filter-clear")?.addEventListener("click", () => {
      this.tagFilter = null;
      this.render();
    });

    if (this.$searchInput) {
      this.$searchInput.addEventListener("input", () => {
        this.searchQuery = this.$searchInput.value;
        this.render();
      });
    }

    this.$searchClear?.addEventListener("click", () => {
      this.searchQuery = "";
      if (this.$searchInput) this.$searchInput.value = "";
      this.render();
      this.$searchInput?.focus();
    });

    this.$form.addEventListener("submit", (event) => {
      event.preventDefault();
      const title = this.$noteTitle.value;
      const text = this.$noteText.value;
      const color = this.$form.querySelector('input[name="noteColor"]')?.value ?? "white";
      const tags = parseTagsFromInput(this.$noteTagsInput?.value ?? "");
      const reminder = parseReminderFromInput(this.$noteReminderInput?.value ?? "");
      this.addNote({ title, text, color, tags, reminder });
      this.closeActiveForm();
    });

    this.$modalForm.addEventListener("submit", (event) => {
      event.preventDefault();
    });

    this.$sidebar.addEventListener("mouseover", () => {
      this.handleToggleSidebar();
    });

    this.$sidebar.addEventListener("mouseout", () => {
      this.handleToggleSidebar();
    });

    this.$menuToggle?.addEventListener("click", (event) => {
      this.toggleMobileSidebar(event);
    });

    this.$menuToggle?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        this.toggleMobileSidebar(event);
      }
    });

    this.$sidebarBackdrop?.addEventListener("click", (event) => {
      event.stopPropagation();
      this.closeMobileSidebar();
    });

    this.$sidebar.addEventListener("click", (event) => {
      const item = event.target.closest(".sidebar-item[data-nav]");
      if (!item) return;
      event.stopPropagation();
      this.setView(item.dataset.nav);
    });

    if (this.$settingsToggle && this.$settingsDropdown) {
      this.$settingsToggle.addEventListener("click", (event) => {
        event.stopPropagation();
        const open = this.$settingsDropdown.classList.toggle("open");
        this.$settingsToggle.setAttribute("aria-expanded", open ? "true" : "false");
      });
    }

    if (this.$noteToolsHoverOnly) {
      this.$noteToolsHoverOnly.addEventListener("change", () => {
        const hoverOnly = this.$noteToolsHoverOnly.checked;
        localStorage.setItem("noteToolsHoverOnly", hoverOnly ? "true" : "false");
        document.body.classList.toggle("note-tools-hover-only", hoverOnly);
      });
    }

    document.body.addEventListener("click", (event) => {
      if (this.$settingsDropdown?.classList.contains("open")) {
        this.$settingsDropdown.classList.remove("open");
        this.$settingsToggle?.setAttribute("aria-expanded", "false");
      }
      if (
        this.isMobileLayout() &&
        document.body.classList.contains("sidebar-open") &&
        !this.$sidebar?.contains(event.target) &&
        !this.$menuToggle?.contains(event.target)
      ) {
        this.closeMobileSidebar();
      }
    });

    this.$settingsDropdown?.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    document.body.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        if (this.$colorPopover && !this.$colorPopover.hidden) {
          this.closeColorPopover();
          return;
        }
        if (this.$morePopover && !this.$morePopover.hidden) {
          this.closeMorePopover();
          return;
        }
      }
      if (event.key !== "Enter" && event.key !== " ") return;
      const moreBtn = event.target.closest(".note-more-btn");
      if (moreBtn && this.view !== "trash") {
        event.preventDefault();
        this.openMorePopover({ target: moreBtn });
        return;
      }
      const palette = event.target.closest(".note-palette");
      if (!palette || this.view === "trash") return;
      event.preventDefault();
      this.openColorPopover({ target: palette });
    });
  }

  handleFormClick(event) {
    const isActiveFormClickedOn = this.$activeForm.contains(event.target);
    const isInactiveFormClickedOn = this.$inactiveForm.contains(event.target);
    const activeOpen = this.$activeForm.style.display === "block";
    const title = activeOpen ? this.$noteTitle.value : "";
    const text = activeOpen
      ? this.$noteText.value
      : (this.$inactiveNoteText?.value ?? "");

    if (isInactiveFormClickedOn) {
      this.openActiveForm();
    } else if (!isInactiveFormClickedOn && !isActiveFormClickedOn) {
      this.addNote({ title, text, reminder: null });
      this.closeActiveForm();
    }
  }

  openActiveForm() {
    const draft = this.$inactiveNoteText?.value?.trim();
    if (draft) {
      this.$noteText.value = this.$inactiveNoteText.value;
      this.$inactiveNoteText.value = "";
    }
    this.$inactiveForm.style.display = "none";
    this.$activeForm.style.display = "block";
    this.updateActiveFormCharCounter();
    this.updateInactiveCharCounter();
    this.$noteText.focus();
  }

  closeActiveForm() {
    this.$inactiveForm.style.display = "block";
    this.$activeForm.style.display = "none";
    this.$noteText.value = "";
    this.$noteTitle.value = "";
    if (this.$inactiveNoteText) this.$inactiveNoteText.value = "";
    this.syncColorSwatches(this.$form, "white");
    if (this.$noteTagsInput) this.$noteTagsInput.value = "";
    if (this.$noteReminderInput) this.$noteReminderInput.value = "";
    this.updateActiveFormCharCounter();
    this.updateInactiveCharCounter();
  }

  isNoteActionClick(event) {
    return (
      event.target.closest(".archive") ||
      event.target.closest(".note-delete-forever") ||
      event.target.closest(".note-delete") ||
      event.target.closest(".note-palette") ||
      event.target.closest(".note-more-btn") ||
      event.target.closest("#note-more-popover") ||
      event.target.closest(".note-pin") ||
      event.target.closest(".note-tag-pill") ||
      event.target.closest(".note-drag-handle")
    );
  }

  sortNotesForDisplay(list) {
    const pinned = [];
    const unpinned = [];
    for (const n of list) {
      (n.pinned ? pinned : unpinned).push(n);
    }
    return [...pinned, ...unpinned];
  }

  noteReminderMarkup(note) {
    if (!note.reminder) return "";
    const label = formatReminderLabel(note.reminder);
    if (!label) return "";
    return `<div class="note-reminder">${escapeHtml(label)}</div>`;
  }

  handlePinToggle(event) {
    const btn = event.target.closest(".note-pin");
    if (!btn) return false;
    event.stopPropagation();
    event.preventDefault();
    const noteEl = btn.closest(".note");
    if (noteEl) this.toggleNotePinned(noteEl.id);
    return true;
  }

  toggleNotePinned(id) {
    const list = this.findNoteCollection(id);
    if (!list) return;
    list.forEach((n) => {
      if (n.id == id) n.pinned = !n.pinned;
    });
    this.render();
  }

  noteTagsMarkup(note, trashView) {
    const tags = normalizeTags(note.tags);
    if (!tags.length) return "";
    if (trashView) {
      return `<div class="note-tags" role="list">${tags
        .map((t) => `<span class="note-tag-badge">${escapeHtml(t)}</span>`)
        .join("")}</div>`;
    }
    const activeKey = this.tagFilter ? this.tagFilter.toLowerCase() : "";
    return `<div class="note-tags" role="list">${tags
      .map((t) => {
        const active = activeKey && t.toLowerCase() === activeKey ? " note-tag-pill--active" : "";
        return `<button type="button" class="note-tag-pill${active}" data-filter-tag="${escapeHtml(t)}" title="Show notes tagged ${escapeHtml(t)}">${escapeHtml(t)}</button>`;
      })
      .join("")}</div>`;
  }

  noteDragHandleMarkup(trashView) {
    if (trashView) return "";
    return `<button type="button" class="note-drag-handle" aria-label="Drag to reorder" title="Drag to reorder"><span class="note-drag-handle-dots" aria-hidden="true">⋮⋮</span></button>`;
  }

  notePinMarkup(note, trashView) {
    if (trashView) return "";
    const pinned = !!note.pinned;
    const label = pinned ? "Unpin note" : "Pin note";
    const fillStyle = pinned ? ` style="font-variation-settings: 'FILL' 1, 'wght' 500"` : "";
    return `
          <button type="button" class="note-pin${pinned ? " note-pin--pinned" : ""}" aria-label="${label}" aria-pressed="${pinned}" title="${label}">
            <span class="material-symbols-outlined note-pin-icon"${fillStyle}>push_pin</span>
          </button>`;
  }

  openModal(event) {
    const $selectedNote = event.target.closest(".note");
    if ($selectedNote && !this.isNoteActionClick(event)) {
      this.closeColorPopover();
      this.closeMorePopover();
      this.selectedNoteId = $selectedNote.id;
      const $title = $selectedNote.querySelector(".title");
      const $text = $selectedNote.querySelector(".text");
      this.$modalTitle.value = $title?.textContent ?? "";
      this.$modalText.value = $text?.textContent ?? "";
      const noteColor = $selectedNote.dataset.noteColor || "white";
      this.syncColorSwatches(this.$modalForm, noteColor);
      const full = this.findNoteById(this.selectedNoteId);
      const tagsJoined = full?.tags?.length ? full.tags.join(", ") : "";
      if (this.$modalTagsInput) this.$modalTagsInput.value = tagsJoined;
      if (this.$modalReminderInput) {
        this.$modalReminderInput.value = reminderToDatetimeLocalValue(full?.reminder ?? null);
      }
      this.updateModalCharCounter();
      this.$modal.classList.add("open-modal");
    }
  }

  closeModal(event) {
    const isModalFormClickedOn = this.$modalForm.contains(event.target);
    const isCloseModalBtnClickedOn = this.$closeModalForm.contains(event.target);
    if ((!isModalFormClickedOn || isCloseModalBtnClickedOn) && this.$modal.classList.contains("open-modal")) {
      const color = this.$modalForm.querySelector('input[name="noteColor"]')?.value ?? "white";
      const tags = parseTagsFromInput(this.$modalTagsInput?.value ?? "");
      const reminder = parseReminderFromInput(this.$modalReminderInput?.value ?? "");
      this.editNote(this.selectedNoteId, {
        title: this.$modalTitle.value,
        text: this.$modalText.value,
        color,
        tags,
        reminder,
      });
      this.$modal.classList.remove("open-modal");
    }
  }

  handleArchiving(event) {
    const $selectedNote = event.target.closest(".note");
    if (!$selectedNote || !event.target.closest(".archive")) return;
    if (this.view === "archive") {
      this.unarchiveNote($selectedNote.id);
    } else if (this.view === "notes") {
      this.archiveNote($selectedNote.id);
    }
  }

  handleMoveToTrash(event) {
    const $selectedNote = event.target.closest(".note");
    if (!$selectedNote || !event.target.closest(".note-delete")) return;
    this.moveNoteToTrash($selectedNote.id);
  }

  handleDeleteForever(event) {
    const $selectedNote = event.target.closest(".note");
    if (!$selectedNote || !event.target.closest(".note-delete-forever")) return;
    this.deleteForever($selectedNote.id);
  }

  archiveNote(id) {
    const idx = this.notes.findIndex((n) => n.id == id);
    if (idx === -1) return;
    const [note] = this.notes.splice(idx, 1);
    this.archivedNotes.push(note);
    this.render();
  }

  unarchiveNote(id) {
    const idx = this.archivedNotes.findIndex((n) => n.id == id);
    if (idx === -1) return;
    const [note] = this.archivedNotes.splice(idx, 1);
    this.notes.push(note);
    this.render();
  }

  moveNoteToTrash(id) {
    let note = this.notes.find((n) => n.id == id);
    if (note) {
      this.notes = this.notes.filter((n) => n.id != id);
    } else {
      note = this.archivedNotes.find((n) => n.id == id);
      if (note) {
        this.archivedNotes = this.archivedNotes.filter((n) => n.id != id);
      }
    }
    if (note) {
      this.trashedNotes = [...this.trashedNotes, note];
      this.render();
    }
  }

  deleteForever(id) {
    this.trashedNotes = this.trashedNotes.filter((n) => n.id != id);
    this.render();
  }

  addNote({ title, text, color, tags, reminder }) {
    if (text.trim() !== "") {
      const safeColor = NOTE_COLORS.some((c) => c.id === color) ? color : "white";
      const tagList = normalizeTags(tags);
      const r = reminder != null ? normalizeReminder(reminder) : null;
      const newNote = new Note(cuid(), title, text, safeColor, false, tagList, r);
      this._enterAnimationNoteId = newNote.id;
      this.notes = [...this.notes, newNote];
      this.render();
    }
  }

  findNoteCollection(id) {
    if (this.notes.some((n) => n.id == id)) return this.notes;
    if (this.archivedNotes.some((n) => n.id == id)) return this.archivedNotes;
    if (this.trashedNotes.some((n) => n.id == id)) return this.trashedNotes;
    return null;
  }

  editNote(id, { title, text, color, tags, reminder }) {
    const list = this.findNoteCollection(id);
    if (!list) return;
    list.forEach((note) => {
      if (note.id == id) {
        note.title = title;
        note.text = text;
        if (color != null && NOTE_COLORS.some((c) => c.id === color)) {
          note.color = color;
        }
        if (tags != null) {
          note.tags = normalizeTags(tags);
        }
        if (reminder !== undefined) {
          note.reminder = normalizeReminder(reminder);
        }
      }
    });
    this.render();
  }

  handleToggleSidebar() {
    if (this.isMobileLayout()) return;
    if (this.miniSidebar) {
      this.$sidebar.style.width = "250px";
      this.$sidebar.classList.add("sidebar-hover");
      this.miniSidebar = false;
    } else {
      const narrow = window.matchMedia("(max-width: 1023px)").matches ? "72px" : "80px";
      this.$sidebar.style.width = narrow;
      this.$sidebar.classList.remove("sidebar-hover");
      this.miniSidebar = true;
    }
  }

  saveNotes() {
    localStorage.setItem("notes", JSON.stringify(this.notes));
    localStorage.setItem("archivedNotes", JSON.stringify(this.archivedNotes));
    localStorage.setItem("trashedNotes", JSON.stringify(this.trashedNotes));
  }

  render() {
    this.saveNotes();
    this.syncSearchClearButton();
    this.displayNotes();
  }

  canReorderNotes() {
    return (
      (this.view === "notes" || this.view === "archive") &&
      !this.tagFilter &&
      !normalizeSearchNeedle(this.searchQuery)
    );
  }

  destroyNotesSortable() {
    if (this._notesSortable) {
      this._notesSortable.destroy();
      this._notesSortable = null;
    }
  }

  reorderCollectionFromDom(collection, container) {
    const elements = [...container.querySelectorAll(".note")];
    if (!elements.length) return;
    const orderIds = elements.map((el) => el.id);
    const byId = new Map(collection.map((n) => [String(n.id), n]));
    const reordered = orderIds.map((id) => byId.get(id)).filter(Boolean);
    const missing = collection.filter((n) => !orderIds.includes(String(n.id)));
    collection.length = 0;
    collection.push(...reordered, ...missing);
  }

  sortableOnMove(evt) {
    const related = evt.related;
    if (!related || !related.classList.contains("note")) return true;
    const dPin = evt.dragged.dataset.pinned === "true";
    const rPin = related.dataset.pinned === "true";
    if (!dPin && rPin && !evt.willInsertAfter) return false;
    if (dPin && !rPin && evt.willInsertAfter) return false;
    return true;
  }

  initNotesSortable() {
    this.destroyNotesSortable();
    if (typeof Sortable === "undefined" || !this.canReorderNotes()) return;
    const el = this.$notes;
    if (!el?.querySelector?.(".note")) return;

    const view = this.view;
    this._notesSortable = new Sortable(el, {
      animation: 150,
      easing: "cubic-bezier(0.25, 1, 0.5, 1)",
      handle: ".note-drag-handle",
      draggable: ".note",
      ghostClass: "note--sortable-ghost",
      chosenClass: "note--sortable-chosen",
      dragClass: "note--sortable-drag",
      delayOnTouchOnly: true,
      delay: 180,
      touchStartThreshold: 5,
      fallbackTolerance: 5,
      forceFallback: false,
      onMove: (evt) => this.sortableOnMove(evt),
      onEnd: () => {
        if (view === "notes") {
          this.reorderCollectionFromDom(this.notes, el);
        } else if (view === "archive") {
          this.reorderCollectionFromDom(this.archivedNotes, el);
        }
        this.saveNotes();
      },
    });
  }

  noteFooterMarkup({ trashView, archiveView }) {
    if (trashView) {
      return `
          <div class="note-footer note-footer--trash">
            <div class="tooltip note-delete-forever">
              <span class="material-symbols-outlined hover note-footer-icon"
                >delete_forever</span
              >
              <span class="tooltip-text">Delete forever</span>
            </div>
          </div>`;
    }

    const archiveTooltip = archiveView ? "Unarchive" : "Archive";
    return `
          <div class="note-footer">
            <div class="tooltip note-palette" role="button" tabindex="0" aria-label="Change color">
              <span class="material-symbols-outlined hover note-footer-icon"
                >palette</span
              >
              <span class="tooltip-text">Change color</span>
            </div>
            <div class="tooltip">
              <span class="material-symbols-outlined hover note-footer-icon"
                >add_alert</span
              >
              <span class="tooltip-text">Remind me</span>
            </div>
            <div class="tooltip">
              <span class="material-symbols-outlined hover note-footer-icon"
                >person_add</span
              >
              <span class="tooltip-text">Collaborator</span>
            </div>
            <div class="tooltip">
              <span class="material-symbols-outlined hover note-footer-icon"
                >image</span
              >
              <span class="tooltip-text">Add image</span>
            </div>
            <div class="tooltip archive">
              <span class="material-symbols-outlined hover note-footer-icon"
                >archive</span
              >
              <span class="tooltip-text">${archiveTooltip}</span>
            </div>
            <div class="tooltip note-delete">
              <span class="material-symbols-outlined hover note-footer-icon"
                >delete</span
              >
              <span class="tooltip-text">Delete</span>
            </div>
            <div class="tooltip note-more-btn" role="button" tabindex="0" aria-label="More" aria-haspopup="true" aria-expanded="false">
              <span class="material-symbols-outlined hover note-footer-icon"
                >more_vert</span
              >
              <span class="tooltip-text">More</span>
            </div>
          </div>`;
  }

  displayNotes() {
    let list;
    let emptyMessage = "";

    if (this.view === "archive") {
      list = this.archivedNotes;
      emptyMessage = "Your archived notes appear here";
    } else if (this.view === "trash") {
      list = this.trashedNotes;
      emptyMessage = "No notes in Trash";
    } else {
      list = this.notes;
    }

    const baseList = list;
    if (
      this.tagFilter &&
      (this.view === "notes" || this.view === "archive")
    ) {
      const fk = this.tagFilter.toLowerCase();
      list = list.filter((n) =>
        normalizeTags(n.tags).some((t) => t.toLowerCase() === fk)
      );
    }

    const afterTagList = list;
    const searchNeedle = normalizeSearchNeedle(this.searchQuery);
    if (searchNeedle) {
      list = afterTagList.filter((n) => noteMatchesSearch(n, searchNeedle));
    }

    if (list.length === 0) {
      this.destroyNotesSortable();
      if (baseList.length === 0) {
        this._isFirstNotesPaint = false;
      }
      if (searchNeedle && afterTagList.length > 0) {
        this.$notes.innerHTML =
          '<p class="notes-empty" role="status">No notes found</p>';
        this.updateTagFilterBar();
        return;
      }
      if (
        this.tagFilter &&
        baseList.length > 0 &&
        (this.view === "notes" || this.view === "archive")
      ) {
        this.$notes.innerHTML = `<p class="notes-empty" role="status">No notes with tag “${escapeHtml(this.tagFilter)}”.</p>`;
        this.updateTagFilterBar();
        return;
      }
      if (this.view === "notes") {
        this.$notes.innerHTML = `
        <div class="notes-empty-state" role="status">
          <span class="material-symbols-outlined notes-empty-icon" aria-hidden="true">lightbulb</span>
          <p class="notes-empty-text">Notes that you add appear here</p>
        </div>`;
      } else {
        this.$notes.innerHTML = `<p class="notes-empty">${emptyMessage}</p>`;
      }
      this.updateTagFilterBar();
      return;
    }

    const trashView = this.view === "trash";
    const archiveView = this.view === "archive";
    const sorted = this.sortNotesForDisplay(list);

    const animateFirstPaint = this._isFirstNotesPaint;
    const enterId = this._enterAnimationNoteId;

    this.destroyNotesSortable();
    this.$notes.innerHTML = sorted
      .map((note) => {
        const bg = noteBackground(note.color);
        const colorId = escapeHtml(note.color || "white");
        const pinnedClass = note.pinned ? " note--pinned" : "";
        const reminderClass = note.reminder ? " note--has-reminder" : "";
        const dragPadClass = trashView ? "" : " note--has-drag-handle";
        const shouldEnter =
          animateFirstPaint ||
          (enterId != null && String(note.id) === String(enterId));
        const enterClass = shouldEnter ? " note--enter" : "";
        return `
        <div class="note${pinnedClass}${reminderClass}${dragPadClass}${enterClass}" id="${note.id}" data-note-color="${colorId}" data-pinned="${note.pinned ? "true" : "false"}" style="background-color: ${bg};">
          ${this.noteDragHandleMarkup(trashView)}
          <span class="material-symbols-outlined check-circle"
            >check_circle</span
          >
          ${this.notePinMarkup(note, trashView)}
          <div class="title">${escapeHtml(note.title)}</div>
          <div class="text">${escapeHtml(note.text)}</div>
          ${this.noteReminderMarkup(note)}
          ${this.noteTagsMarkup(note, trashView)}
          ${this.noteFooterMarkup({ trashView, archiveView })}
        </div>
        `;
      })
      .join("");
    if (animateFirstPaint) {
      this._isFirstNotesPaint = false;
    }
    if (enterId != null) {
      if (this._enterAnimationClearTimer) {
        clearTimeout(this._enterAnimationClearTimer);
      }
      this._enterAnimationClearTimer = setTimeout(() => {
        this._enterAnimationNoteId = null;
        this._enterAnimationClearTimer = null;
      }, 480);
    }
    this.updateTagFilterBar();
    this.initNotesSortable();
  }
}

const app = new App();
