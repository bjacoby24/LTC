/* -------------------------
   DOM HELPERS
------------------------- */
export function byId(id) {
  return document.getElementById(id);
}

export function qs(selector, root = document) {
  return root.querySelector(selector);
}

export function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

/* -------------------------
   TEXT / VALUE HELPERS
------------------------- */
export function setText(id, value) {
  const el = byId(id);
  if (el) el.textContent = value ?? "";
}

export function setValue(id, value) {
  const el = byId(id);
  if (el) el.value = value ?? "";
}

export function getValue(id) {
  const el = byId(id);
  return el ? el.value : "";
}

export function show(elOrId, displayValue = "block") {
  const el = typeof elOrId === "string" ? byId(elOrId) : elOrId;
  if (el) el.style.display = displayValue;
}

export function hide(elOrId) {
  const el = typeof elOrId === "string" ? byId(elOrId) : elOrId;
  if (el) el.style.display = "none";
}

export function toggleClass(elOrId, className, enabled) {
  const el = typeof elOrId === "string" ? byId(elOrId) : elOrId;
  if (!el) return;

  if (typeof enabled === "boolean") {
    el.classList.toggle(className, enabled);
  } else {
    el.classList.toggle(className);
  }
}

/* -------------------------
   FORMATTERS
------------------------- */
export function formatMoney(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

export function formatNumber(value, digits = 0) {
  return Number(value || 0).toFixed(digits);
}

/* -------------------------
   NORMALIZATION
------------------------- */
export function normalizeText(value) {
  return String(value ?? "").trim();
}

export function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

export function normalizeCellValue(value) {
  return String(value ?? "").trim();
}

/* -------------------------
   HTML SAFETY
------------------------- */
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* -------------------------
   SORT / COMPARE
------------------------- */
export function compareValues(a, b) {
  const valueA = normalizeCellValue(a).toLowerCase();
  const valueB = normalizeCellValue(b).toLowerCase();

  const numA = Number(valueA);
  const numB = Number(valueB);

  const bothNumbers =
    !Number.isNaN(numA) &&
    !Number.isNaN(numB) &&
    valueA !== "" &&
    valueB !== "";

  if (bothNumbers) {
    if (numA < numB) return -1;
    if (numA > numB) return 1;
    return 0;
  }

  return valueA.localeCompare(valueB);
}

/* -------------------------
   DATE / TIME
------------------------- */
export function daysBetween(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return 0;
  }

  return Math.round((endDate - startDate) / (1000 * 60 * 60 * 24));
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/* -------------------------
   IDS / ARRAYS / OBJECTS
------------------------- */
export function makeId() {
  return Date.now() + Math.floor(Math.random() * 100000);
}

export function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function uniqueValues(values) {
  return [...new Set(values)];
}

export function clone(value) {
  return structuredClone
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

/* -------------------------
   EVENTS / PERFORMANCE
------------------------- */
export function debounce(fn, wait = 200) {
  let timeoutId;

  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), wait);
  };
}