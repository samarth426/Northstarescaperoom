/* Game engine: progress, scoring, attempts, hints, unlocking, timer, notes, evidence.
   UI rendering lives in app.js / levels.js; this file owns rules + state. */
(function () {
  "use strict";

  var CFG = window.NS_CONFIG;
  var state = window.NS_STORAGE.load();

  function persist() { window.NS_STORAGE.save(state); }
  function getState() { return state; }

  function resetAll() {
    pauseStart = 0;
    autoPaused = false;
    state = window.NS_STORAGE.defaultState();
    persist();
  }

  function startInvestigation(operative) {
    pauseStart = 0;
    autoPaused = false;
    state.manualPaused = false;
    state.pausedAt = 0;
    state.operative = operative;
    state.startedAt = Date.now();
    state.maxUnlocked = Math.max(state.maxUnlocked, 1);
    state.levelOpenedAt[1] = state.levelOpenedAt[1] || Date.now();
    persist();
  }

  function isStarted() { return !!(state.operative && state.startedAt); }

  /* Single-source timer pause model. Only the displayed global timer pauses;
     per-level dwell (used for speed bonuses) intentionally keeps wall-clock
     behavior so scoring rules never change; the difference is documented in
     the README. Two causes feed one effective state:
       - manualPaused (persisted): the player toggled pause via the HUD button.
       - autoPaused  (in-memory): the browser tab went to the background.
     isPaused() is true when either cause is active, so the badge, the button
     label, and the frozen display always agree with each other. */
  var pauseStart = 0;   // timestamp the current pause interval began (any cause)
  var autoPaused = false;
  // Restore an in-flight manual pause across refresh: the pause origin is
  // persisted (state.pausedAt) so the display stays frozen instead of
  // silently resuming, and the pre-refresh pause gap is not lost.
  if (state.manualPaused && state.startedAt) pauseStart = state.pausedAt || Date.now();
  function pausedTotalMs() {
    var acc = state.pausedMs || 0;
    if (pauseStart) acc += Date.now() - pauseStart;
    return acc;
  }
  function bankPause() {
    if (!pauseStart) return;
    state.pausedMs = (state.pausedMs || 0) + (Date.now() - pauseStart);
    pauseStart = 0;
  }
  function setAutoPaused(on) {
    on = !!on;
    if (on === autoPaused) return isPaused();
    autoPaused = on;
    if (on) {
      if (isStarted() && !pauseStart) pauseStart = Date.now();
    } else if (pauseStart && !state.manualPaused) {
      bankPause();
      persist();
    }
    return isPaused();
  }
  function setManualPaused(on) {
    on = !!on;
    if (!isStarted()) return false;
    if (!!state.manualPaused === on) return isPaused();
    state.manualPaused = on;
    if (on) {
      if (!pauseStart) pauseStart = Date.now();
      state.pausedAt = pauseStart;
    } else {
      if (pauseStart && !autoPaused) bankPause();
      state.pausedAt = 0;
    }
    persist();
    return isPaused();
  }
  function pauseTimer() { return setAutoPaused(true); }
  function resumeTimer() { return setAutoPaused(false); }
  function isPaused() { return !!(state.manualPaused || pauseStart); }
  function elapsedSeconds() {
    if (!state.startedAt) return 0;
    return Math.max(0, Math.floor((Date.now() - state.startedAt - pausedTotalMs()) / 1000));
  }
  function wallSeconds() {
    if (!state.startedAt) return 0;
    return Math.max(0, Math.floor((Date.now() - state.startedAt) / 1000));
  }

  function levelStatus(id) {
    if (state.completed[id]) return "completed";
    if (id === state.maxUnlocked && !state.completed[id]) {
      //Touched if attempts/hints/opened beyond landing
      return (state.attempts[id] > 0 || (state.hints[id] || []).some(Boolean)) ? "in-progress" : "available";
    }
    if (id < state.maxUnlocked) return "in-progress";
    return "locked";
  }

  function isUnlocked(id) { return id <= state.maxUnlocked; }

  function markLevelOpened(id) {
    if (!state.levelOpenedAt[id]) { state.levelOpenedAt[id] = Date.now(); persist(); }
  }

  function levelTimeSeconds(id) {
    var t0 = state.levelOpenedAt[id];
    if (!t0) return 0;
    var done = state.completed[id];
    var t1 = done ? done.completedAt : Date.now();
    return Math.max(1, Math.round((t1 - t0) / 1000));
  }

  function recordWrongAttempt(id) {
    state.attempts[id] = (state.attempts[id] || 0) + 1;
    persist();
    return state.attempts[id];
  }

  function useHint(id, idx) {
    if (!state.hints[id]) state.hints[id] = [false, false, false];
    if (state.hints[id][idx]) return false; // already used: no repeat charge
    state.hints[id][idx] = true;
    persist();
    return true;
  }

  function hintsUsed(id) {
    var h = state.hints[id] || [false, false, false];
    var out = 0;
    for (var i = 0; i < 3; i++) if (h[i]) out++;
    return out;
  }

  function speedBonus(seconds) {
    var tiers = CFG.scoring.speedBonus;
    for (var i = 0; i < tiers.length; i++) {
      if (seconds <= tiers[i].withinSeconds) return tiers[i].bonus;
    }
    return 0;
  }

  function scoreForLevel(id) {
    var done = state.completed[id];
    if (done) return done.score;
    // live projection (before completion)
    var wrong = state.attempts[id] || 0;
    var h = state.hints[id] || [false, false, false];
    var s = CFG.scoring.basePerLevel - wrong * CFG.scoring.wrongAttemptPenalty;
    for (var i = 0; i < 3; i++) if (h[i]) s -= CFG.scoring.hintPenalties[i];
    return Math.max(0, s);
  }

  function completeLevel(id, evidenceId) {
    var secs = levelTimeSeconds(id);
    var wrong = state.attempts[id] || 0;
    var h = state.hints[id] || [false, false, false];
    var s = CFG.scoring.basePerLevel - wrong * CFG.scoring.wrongAttemptPenalty;
    for (var i = 0; i < 3; i++) if (h[i]) s -= CFG.scoring.hintPenalties[i];
    s += speedBonus(secs);
    s = Math.max(0, s);
    state.completed[id] = {
      score: s, attempts: wrong,
      hintsUsed: [!!h[0], !!h[1], !!h[2]],
      timeSeconds: secs, completedAt: Date.now()
    };
    if (evidenceId && state.evidence.indexOf(evidenceId) === -1) state.evidence.push(evidenceId);
    if (id === state.maxUnlocked && id < CFG.TOTAL_LEVELS) state.maxUnlocked = id + 1;
    if (id === CFG.TOTAL_LEVELS) { state.finished = true; state.finishedAt = Date.now(); }
    persist();
    return state.completed[id];
  }

  function totalScore() {
    var t = 0;
    for (var id in state.completed) t += state.completed[id].score;
    return t;
  }

  /* Live investigation score — the single number the HUD shows.
     Banked points from solved levels plus the live projection of the level
     currently being worked (if unsolved), so every penalty moves the visible
     total the moment it happens. Solved/replayed levels add nothing extra.
     Derived purely from persisted state: no second ledger can drift. */
  function liveScore(activeId) {
    var t = totalScore();
    if (activeId && !state.completed[activeId] && isUnlocked(activeId)) {
      t += scoreForLevel(activeId);
    }
    return Math.max(0, t);
  }

  function completedCount() { return Object.keys(state.completed).length; }

  function rating() {
    var n = completedCount();
    if (!n) return { pct: 0, label: "ROOKIE INVESTIGATOR" };
    var pct = Math.round((totalScore() / (n * CFG.scoring.maxPerLevelForRating)) * 100);
    pct = Math.max(0, Math.min(100, pct));
    var list = CFG.ratings, label = list[list.length - 1].label;
    for (var i = 0; i < list.length; i++) {
      if (pct >= list[i].minPct) { label = list[i].label; break; }
    }
    return { pct: pct, label: label };
  }

  /* ---------- validation ---------- */
  function norm(s) {
    return String(s == null ? "" : s).toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[^a-z0-9.'/\- ]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function normStrict(s) {
    return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]+/g, "");
  }
  function matchAny(input, accepted) {
    var a = norm(input);
    for (var i = 0; i < accepted.length; i++) {
      if (a === norm(accepted[i])) return true;
    }
    // forgiving fallback: ignore punctuation/spacing entirely
    var b = normStrict(input);
    for (var j = 0; j < accepted.length; j++) {
      if (b === normStrict(accepted[j])) return true;
    }
    return false;
  }
  function sameSet(a, b) {
    if (a.length !== b.length) return false;
    var x = a.slice().sort().join("|"), y = b.slice().sort().join("|");
    return x === y;
  }
  function sameOrder(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  /* ---------- notes ---------- */
  function addNote(text, meta) {
    text = String(text || "").trim();
    if (!text) return null;
    meta = meta || {};
    var lvl = parseInt(meta.level, 10) || 0;
    if (lvl < 0 || lvl > CFG.TOTAL_LEVELS) lvl = 0;
    var n = {
      id: "n" + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36),
      text: text.slice(0, 2000),
      createdAt: Date.now(),
      level: lvl,
      source: String(meta.source || "").slice(0, 60)
    };
    state.notes.unshift(n);
    persist();
    return n;
  }
  function updateNote(id, text) {
    text = String(text || "").trim();
    if (!text) return null;
    for (var i = 0; i < state.notes.length; i++) {
      if (state.notes[i].id === id) {
        state.notes[i].text = text.slice(0, 2000);
        persist();
        return state.notes[i];
      }
    }
    return null;
  }
  function deleteNote(id) {
    state.notes = state.notes.filter(function (n) { return n.id !== id; });
    persist();
  }
  function clearNotes() { state.notes = []; persist(); }
  function searchNotes(q) {
    q = String(q || "").trim().toLowerCase();
    if (!q) return state.notes.slice();
    return state.notes.filter(function (n) {
      return (n.text || "").toLowerCase().indexOf(q) !== -1 ||
        (n.source || "").toLowerCase().indexOf(q) !== -1;
    });
  }

  /* ---------- evidence ---------- */
  function evidenceList() {
    var out = [];
    for (var i = 0; i < state.evidence.length; i++) {
      var e = window.NS_DATA.getEvidence(state.evidence[i]);
      if (e) out.push(e);
    }
    return out;
  }
  function hasEvidence(id) { return state.evidence.indexOf(id) !== -1; }

  /* ---------- misc ---------- */
  function fmtTime(totalSecs) {
    var h = Math.floor(totalSecs / 3600), m = Math.floor((totalSecs % 3600) / 60), s = totalSecs % 60;
    function p(x) { return (x < 10 ? "0" : "") + x; }
    return p(h) + ":" + p(m) + ":" + p(s);
  }
  function fmtDuration(totalSecs) {
    totalSecs = Math.max(0, Math.floor(totalSecs || 0));
    var h = Math.floor(totalSecs / 3600), m = Math.floor((totalSecs % 3600) / 60), s = totalSecs % 60;
    if (h > 0) return h + "h " + (m < 10 ? "0" : "") + m + "m";
    if (m > 0) return m + "m " + (s < 10 ? "0" : "") + s + "s";
    return s + "s";
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* Developer-friendly level-config check. Returns a list of issue strings
     (empty = valid). Used to fail gracefully instead of crashing. */
  function validateLevel(L) {
    var issues = [];
    if (!L || typeof L !== "object") return ["Level definition is missing or not an object."];
    ["id", "title", "tagline", "briefing", "answerFormat", "reward"].forEach(function (k) {
      if (!L[k]) issues.push("Missing required field: " + k);
    });
    if (!Array.isArray(L.story) || !L.story.length) issues.push("Missing story paragraphs.");
    if (!Array.isArray(L.objectives) || !L.objectives.length) issues.push("Missing mission objectives.");
    if (!Array.isArray(L.hints) || L.hints.length !== 3) issues.push("Hints must be an array of exactly 3 strings.");
    if (!L.validation || typeof L.validation !== "object") issues.push("Missing validation rules.");
    if (!L.explanation || !L.explanation.found || !L.explanation.why || !L.explanation.learned) {
      issues.push("Explanation needs found / why / learned.");
    }
    if (!window.NS_DATA.getEvidence(L.reward)) issues.push("Reward evidence '" + L.reward + "' is not defined.");
    return issues;
  }

  /* ---------- instructor demo helpers (local-only, no backend) ---------- */
  function unlockAll() {
    state.maxUnlocked = CFG.TOTAL_LEVELS;
    persist();
  }
  function clearHint(id, idx) {
    if (state.hints[id]) { state.hints[id][idx] = false; persist(); }
  }
  function clearHints(id) {
    state.hints[id] = [false, false, false];
    persist();
  }
  function forceComplete(id) {
    // Deterministic demo completion using the real scoring path.
    if (!window.NS_DATA.getLevel(id)) return null;
    markLevelOpened(id);
    return completeLevel(id, window.NS_DATA.getLevel(id).reward);
  }
  /* Build a demonstration state from real game content.
     kinds: "fresh" (clean start), "mid" (L1-5 solved + notes + a hint),
            "complete" (all solved, report unlocked). */
  function demoSnapshot(kind) {
    resetAll();
    startInvestigation("demo");
    if (kind === "fresh") return getState();
    var upto = kind === "mid" ? 5 : CFG.TOTAL_LEVELS;
    for (var i = 1; i <= upto; i++) forceComplete(i);
    addNote("C2 185.220.101.47 repeats in packets 7, 9, 11 — same internal host 10.4.18.22.", { level: 4, source: "Packet analyzer" });
    addNote("E3 sender domain is lookalike: northstar-systems-support.com (extra -support).", { level: 3, source: "Mail client" });
    if (kind === "mid") useHint(6, 0);
    return getState();
  }

  window.NS_ENGINE = {
    getState: getState, persist: persist, resetAll: resetAll,
    startInvestigation: startInvestigation, isStarted: isStarted,
    elapsedSeconds: elapsedSeconds, wallSeconds: wallSeconds,
    pauseTimer: pauseTimer, resumeTimer: resumeTimer, isPaused: isPaused,
    setAutoPaused: setAutoPaused, setManualPaused: setManualPaused,
    levelStatus: levelStatus, isUnlocked: isUnlocked,
    markLevelOpened: markLevelOpened, levelTimeSeconds: levelTimeSeconds,
    recordWrongAttempt: recordWrongAttempt, useHint: useHint, hintsUsed: hintsUsed,
    scoreForLevel: scoreForLevel, completeLevel: completeLevel,
    totalScore: totalScore, liveScore: liveScore, completedCount: completedCount, rating: rating,
    norm: norm, matchAny: matchAny, sameSet: sameSet, sameOrder: sameOrder,
    addNote: addNote, updateNote: updateNote, deleteNote: deleteNote,
    clearNotes: clearNotes, searchNotes: searchNotes,
    evidenceList: evidenceList, hasEvidence: hasEvidence,
    fmtTime: fmtTime, fmtDuration: fmtDuration, esc: esc,
    validateLevel: validateLevel,
    unlockAll: unlockAll, clearHint: clearHint, clearHints: clearHints,
    forceComplete: forceComplete, demoSnapshot: demoSnapshot
  };
})();
