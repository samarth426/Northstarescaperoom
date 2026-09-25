/* Centralized persistence gateway. ALL storage access goes through here —
   game state, UI settings, availability checks, and save-data recovery.
   If localStorage is unavailable the game keeps running in memory and
   reports the limitation via NS_STORAGE.isAvailable(). */
(function () {
  "use strict";
  var KEY = (window.NS_CONFIG && window.NS_CONFIG.STORAGE_KEY) || "northstar_escape_v1";
  var SETTINGS_KEY = (window.NS_CONFIG && window.NS_CONFIG.SETTINGS_KEY) || "northstar_settings_v1";
  var BAK_KEY = KEY + ".bak";
  var TOTAL = (window.NS_CONFIG && window.NS_CONFIG.TOTAL_LEVELS) || 11;

  var recovered = false;   // true when load() had to repair or discard a save
  var memFallback = {};    // in-memory stand-in when localStorage is unusable
  var storageOK = null;    // cached availability probe result

  function isAvailable() {
    if (storageOK !== null) return storageOK;
    try {
      var probe = "__ns_probe__";
      window.localStorage.setItem(probe, "1");
      window.localStorage.removeItem(probe);
      storageOK = true;
    } catch (e) {
      storageOK = false;
    }
    return storageOK;
  }

  function rawGet(k) {
    if (isAvailable()) {
      try { return window.localStorage.getItem(k); } catch (e) { return memFallback[k] || null; }
    }
    return memFallback[k] || null;
  }
  function rawSet(k, v) {
    if (isAvailable()) {
      try { window.localStorage.setItem(k, v); return true; } catch (e) { /* fall through to memory */ }
    }
    try { memFallback[k] = String(v); } catch (e2) {}
    return false;
  }
  function rawDel(k) {
    if (isAvailable()) { try { window.localStorage.removeItem(k); } catch (e) {} }
    try { delete memFallback[k]; } catch (e2) {}
  }

  function defaultState() {
    return {
      version: 1,
      operative: "",
      startedAt: 0,          // epoch ms when investigation started
      elapsedBefore: 0,      // reserved for pause support
      pausedMs: 0,           // accumulated pause (display timer only)
      manualPaused: false,  // player-toggled pause; persisted so refresh keeps the exact state
      maxUnlocked: 1,        // highest level number available
      completed: {},         // levelId -> { score, attempts, hintsUsed:[bool,bool,bool], timeSeconds, completedAt }
      attempts: {},          // levelId -> wrong attempt count (includes current in-progress level)
      hints: {},             // levelId -> [bool,bool,bool]
      levelOpenedAt: {},     // levelId -> epoch ms of first open (for speed bonus)
      evidence: [],          // evidence ids in unlock order
      notes: [],             // { id, text, createdAt, level, source }
      finished: false,
      finishedAt: 0
    };
  }

  function defaultSettings() {
    return { showTimer: true, showScore: true, presentation: false };
  }

  function isBoolArray3(v) {
    return Array.isArray(v) && v.length === 3 && v.every(function (x) { return typeof x === "boolean"; });
  }

  /* Coerce an unknown parsed value into a safe state. Drops invalid fields,
     keeps everything salvageable. Returns { state, repaired }. */
  function sanitize(parsed) {
    var fresh = defaultState();
    var repaired = false;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { state: fresh, repaired: true };
    function take(key, check) {
      if (Object.prototype.hasOwnProperty.call(parsed, key)) {
        if (check(parsed[key])) fresh[key] = parsed[key];
        else repaired = true;
      }
    }
    var isStr = function (v) { return typeof v === "string"; };
    var isNum = function (v) { return typeof v === "number" && isFinite(v) && v >= 0; };
    var isBool = function (v) { return typeof v === "boolean"; };
    var isIdMap = function (v) {
      if (!v || typeof v !== "object" || Array.isArray(v)) return false;
      return Object.keys(v).every(function (k) { return /^\d+$/.test(k); });
    };
    take("operative", isStr);
    take("startedAt", isNum);
    take("elapsedBefore", isNum);
    take("pausedMs", isNum);
    take("manualPaused", isBool);
    take("finishedAt", isNum);
    if (Object.prototype.hasOwnProperty.call(parsed, "maxUnlocked")) {
      var m = parseInt(parsed.maxUnlocked, 10);
      if (m >= 1 && m <= TOTAL) fresh.maxUnlocked = m; else repaired = true;
    }
    if (Object.prototype.hasOwnProperty.call(parsed, "completed")) {
      if (isIdMap(parsed.completed)) {
        var clean = {};
        Object.keys(parsed.completed).forEach(function (k) {
          var c = parsed.completed[k];
          if (c && typeof c === "object" && isFinite(+c.score)) {
            clean[k] = {
              score: Math.max(0, +c.score || 0),
              attempts: Math.max(0, parseInt(c.attempts, 10) || 0),
              hintsUsed: isBoolArray3(c.hintsUsed) ? c.hintsUsed : [false, false, false],
              timeSeconds: Math.max(0, parseInt(c.timeSeconds, 10) || 0),
              completedAt: +c.completedAt || 0
            };
          } else repaired = true;
        });
        fresh.completed = clean;
      } else repaired = true;
    }
    ["attempts", "hints", "levelOpenedAt"].forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(parsed, key)) {
        if (isIdMap(parsed[key])) fresh[key] = parsed[key]; else repaired = true;
      }
    });
    if (Object.prototype.hasOwnProperty.call(parsed, "evidence")) {
      if (Array.isArray(parsed.evidence) && parsed.evidence.every(function (x) { return typeof x === "string"; })) fresh.evidence = parsed.evidence;
      else repaired = true;
    }
    if (Object.prototype.hasOwnProperty.call(parsed, "notes")) {
      if (Array.isArray(parsed.notes)) {
        var good = parsed.notes.filter(function (n) {
          return n && typeof n === "object" && typeof n.id === "string" && typeof n.text === "string";
        });
        if (good.length !== parsed.notes.length) repaired = true;
        fresh.notes = good.map(function (n) {
          return {
            id: String(n.id).slice(0, 40),
            text: String(n.text).slice(0, 2000),
            createdAt: +n.createdAt || 0,
            level: parseInt(n.level, 10) || 0,
            source: typeof n.source === "string" ? n.source.slice(0, 60) : ""
          };
        });
      } else repaired = true;
    }
    if (Object.prototype.hasOwnProperty.call(parsed, "finished")) {
      fresh.finished = parsed.finished === true;
    }
    return { state: fresh, repaired: repaired };
  }

  function parseRaw(raw) {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return { __corrupt: true }; }
  }

  function load() {
    recovered = false;
    var main = parseRaw(rawGet(KEY));
    if (main && !main.__corrupt) {
      var res = sanitize(main);
      if (res.repaired) recovered = true;
      return res.state;
    }
    // Main save missing or corrupt — try the backup copy.
    var bak = parseRaw(rawGet(BAK_KEY));
    if (bak && !bak.__corrupt) {
      recovered = true;
      return sanitize(bak).state;
    }
    if (main && main.__corrupt) recovered = true; // nothing salvageable
    return defaultState();
  }

  function wasRecovered() { return recovered; }

  function save(state) {
    var payload;
    try { payload = JSON.stringify(state); }
    catch (e) {
      if (window.NS_TOAST) window.NS_TOAST("Could not save progress (data error). The game continues unsaved.");
      return false;
    }
    // Keep the previous good copy as a backup before overwriting.
    try {
      var prev = rawGet(KEY);
      if (prev) rawSet(BAK_KEY, prev);
    } catch (e2) {}
    var ok = rawSet(KEY, payload);
    if (!ok && window.NS_TOAST) window.NS_TOAST("Could not save progress (storage unavailable). The game continues in memory.");
    return ok;
  }

  function clear() { rawDel(KEY); rawDel(BAK_KEY); }

  function loadSettings() {
    var fresh = defaultSettings();
    var raw = rawGet(SETTINGS_KEY);
    if (!raw) return fresh;
    try {
      var p = JSON.parse(raw);
      if (p && typeof p === "object") {
        if (typeof p.showTimer === "boolean") fresh.showTimer = p.showTimer;
        if (typeof p.showScore === "boolean") fresh.showScore = p.showScore;
        if (typeof p.presentation === "boolean") fresh.presentation = p.presentation;
      }
    } catch (e) {}
    return fresh;
  }
  function saveSettings(s) {
    try { rawSet(SETTINGS_KEY, JSON.stringify(s)); } catch (e) {}
  }

  window.NS_STORAGE = {
    load: load, save: save, clear: clear,
    defaultState: defaultState, sanitize: sanitize,
    isAvailable: isAvailable, wasRecovered: wasRecovered,
    loadSettings: loadSettings, saveSettings: saveSettings, defaultSettings: defaultSettings
  };
})();
