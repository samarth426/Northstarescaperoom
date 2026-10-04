/* App shell: views, routing, HUD, hints, feedback, evidence locker, notes, report. */
(function () {
  "use strict";
  var E = window.NS_ENGINE;
  var D = window.NS_DATA;
  var CFG = window.NS_CONFIG;
  var timerId = null;
  var lastFocus = null;

  /* ---------- helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function smoothIntoView(elm) {
    if (!elm) return;
    try {
      var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      elm.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
    } catch (e) { elm.scrollIntoView(); }
  }
  function toast(msg) {
    var root = $("toastRoot");
    var t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    root.appendChild(t);
    setTimeout(function () { t.classList.add("show"); }, 10);
    setTimeout(function () { t.classList.remove("show"); setTimeout(function () { t.remove(); }, 300); }, 3400);
  }
  window.NS_TOAST = toast;

  function openModal(html, label) {
    var root = $("modalRoot");
    lastFocus = document.activeElement;
    root.innerHTML = '<div class="modal-back"><div class="modal" role="dialog" aria-modal="true" aria-label="' + E.esc(label || "Dialog") + '">' + html + "</div></div>";
    var back = root.querySelector(".modal-back");
    back.addEventListener("click", function (ev) { if (ev.target === back) closeModal(); });
    root.querySelectorAll("[data-close]").forEach(function (btn) {
      btn.addEventListener("click", closeModal);
    });
    document.addEventListener("keydown", escClose);
    document.addEventListener("keydown", trapTab, true);
    var f = root.querySelector("input, textarea, select, button.btn-primary, button");
    if (f) f.focus();
  }
  function escClose(ev) { if (ev.key === "Escape") closeModal(); }
  function trapTab(ev) {
    if (ev.key !== "Tab") return;
    var modal = document.querySelector("#modalRoot .modal");
    if (!modal) return;
    var items = modal.querySelectorAll("button, input, textarea, select, a[href]");
    if (!items.length) return;
    var first = items[0], last = items[items.length - 1];
    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  }
  function closeModal() {
    $("modalRoot").innerHTML = "";
    document.removeEventListener("keydown", escClose);
    document.removeEventListener("keydown", trapTab, true);
    if (lastFocus && document.contains(lastFocus)) { try { lastFocus.focus(); } catch (e) {} }
    lastFocus = null;
  }

  /* ---------- settings (timer/score visibility, presentation) ---------- */
  var settings = window.NS_STORAGE.loadSettings();
  function applySettings() {
    document.body.classList.toggle("presentation", !!settings.presentation);
    document.body.classList.toggle("hide-timer", !settings.showTimer);
    document.body.classList.toggle("hide-score", !settings.showScore);
    updateHUD();
  }
  function saveSettings() { window.NS_STORAGE.saveSettings(settings); applySettings(); }

  function storageBanner() {
    var old = $("storeWarn");
    if (old) old.remove();
    if (window.NS_STORAGE.isAvailable() && !window.NS_STORAGE.wasRecovered()) return;
    var bar = document.createElement("div");
    bar.id = "storeWarn";
    bar.className = "store-warn";
    bar.setAttribute("role", "status");
    if (!window.NS_STORAGE.isAvailable()) {
      bar.innerHTML = "<strong>Local saving is unavailable</strong> in this browser — the investigation will continue in memory for this session only.";
    } else {
      bar.innerHTML = "<strong>Saved data was repaired.</strong> A corrupted save was recovered where possible. If anything looks wrong, you can start fresh. " +
        '<button type="button" class="btn btn-sm" id="btnWarnReset">Start fresh…</button>';
    }
    var layout = $("layout");
    if (layout) layout.parentNode.insertBefore(bar, layout);
    var br = $("btnWarnReset");
    if (br) br.addEventListener("click", askReset);
  }

  // Level currently open in the workspace, if any. The HUD score is LIVE:
  // banked points plus the open level's live projection, all derived from
  // the same persisted state — one source of truth, no second ledger.
  function activeLevelId() {
    var m = (location.hash || "").match(/^#\/level\/(\d+)$/);
    return m ? parseInt(m[1], 10) : 0;
  }
  // The level the live score projects: the open one while it is unsolved,
  // otherwise the current mission (next unsolved) — including when no level
  // is open at all (dashboard, briefing). Keeps the header number identical
  // across navigation, so a penalty never vanishes just because the player
  // left the level, and reviewing a solved level never drops the score.
  function hudLevelId() {
    var a = activeLevelId();
    if (a && !E.getState().completed[a]) return a;
    return nextLevelId();
  }
  function updateHUD() {
    var s = E.getState();
    $("hudOperative").textContent = s.operative || "—";
    $("hudScore").textContent = String(E.liveScore(hudLevelId()));
    $("hudProgress").textContent = E.completedCount() + "/" + CFG.TOTAL_LEVELS;
    $("hudBar").style.width = Math.round((E.completedCount() / CFG.TOTAL_LEVELS) * 100) + "%";
    $("evCount").textContent = String(E.evidenceList().length);
    tickClock();
  }
  function tickClock() {
    var t = $("hudTime");
    if (!t) return;
    t.textContent = E.fmtTime(E.elapsedSeconds());
    // Single source of truth: engine pause state drives the digits, the
    // state pill, and the toggle button together, so they can never disagree.
    var paused = E.isPaused();
    t.classList.toggle("paused", paused);
    var pill = $("hudTimerState"), pillText = $("hudTimerStateText");
    if (pill) pill.classList.toggle("is-paused", paused), pill.classList.toggle("is-running", !paused);
    if (pillText) pillText.textContent = paused ? "PAUSED" : "RUNNING";
    var btn = $("hudPauseBtn");
    if (btn) {
      btn.setAttribute("aria-pressed", paused ? "true" : "false");
      btn.setAttribute("aria-label", paused ? "Resume mission timer" : "Pause mission timer");
      btn.setAttribute("title", paused ? "Resume mission timer" : "Pause mission timer");
      btn.textContent = paused ? "▶" : "⏸";
    }
  }
  function togglePause() {
    if (!E.isStarted()) return;
    var paused = E.setManualPaused(!E.getState().manualPaused);
    tickClock();
    toast(paused ? "Mission timer paused. Scoring uses wall-clock time and is unaffected." : "Mission timer resumed.");
  }

  function difficultyClass(d) {
    d = String(d).toLowerCase();
    if (d.indexOf("impossible") !== -1) return "diff-impossible";
    if (d.indexOf("hard") !== -1) return "diff-hard";
    if (d.indexOf("medium") !== -1) return "diff-medium";
    return "diff-easy";
  }
  function statusBadge(st) {
    var map = { locked: "LOCKED", available: "AVAILABLE", "in-progress": "IN PROGRESS", completed: "COMPLETED" };
    return '<span class="status st-' + st + '">' + (map[st] || st) + "</span>";
  }

  /* ---------- landing ---------- */
  function renderLanding() {
    var s = E.getState();
    var started = E.isStarted();
    $("viewLanding").innerHTML =
      '<section class="hero"><div class="hero-inner">' +
      '<p class="kicker">NJCCIC-style training exercise · 100% fictional</p>' +
      "<h1>Northstar Systems<br /><span>Incident Escape Room</span></h1>" +
      '<p class="lede">One connected breach. Eleven levels. You are the new analyst on the night shift: decode the intercept, trace the phish, hunt the beacons, and close the case with a full incident report.</p>' +
      '<div class="hero-meta"><span>◎ 11 levels: crypto → identity → phishing → network → stego → social engineering → prompt injection → forensics → OSINT → GEOINT → malware lab</span>' +
      "<span>▣ Evidence Locker carries clues forward — the finale requires them</span>" +
      "<span>◷ Autosaves locally · scoring with hint/attempt trade-offs</span></div>" +
      (started
        ? '<div class="hero-actions"><button type="button" class="btn btn-primary btn-lg" id="btnContinue">Continue investigation — ' + E.esc(s.operative) + '</button>' +
          '<button type="button" class="btn btn-ghost" id="btnFresh">Start over</button></div>'
        : '<form class="hero-actions" id="startForm"><label class="fld grow" for="opName"><span>Operative codename</span>' +
          '<input type="text" id="opName" maxlength="24" autocomplete="off" placeholder="e.g. nightowl" required /></label>' +
          '<button type="submit" class="btn btn-primary btn-lg">Begin briefing</button></form>') +
      '<p class="fiction">All organizations, people, domains, IPs, hashes, and infrastructure are fictional training inventions. Defensive skills only — nothing here attacks real systems.</p>' +
      "</div></section>" +
      '<section class="landing-grid"><div class="card"><h3>How it works</h3><p>Briefing → investigate the evidence → submit findings → unlock the next level and bank evidence. Hints cost points; wrong attempts cost points; fast clean solves earn bonuses.</p></div>' +
      '<div class="card"><h3>What you will learn</h3><p>Classical crypto, MFA and least privilege, phishing triage, traffic analysis, steganography, pretexting defense, prompt-injection hierarchy, forensic correlation, responsible OSINT, GEOINT corroboration, and safe static malware triage.</p></div>' +
      '<div class="card"><h3>Safety by design</h3><p>Every “dangerous” topic is a local simulation: scripted packet captures, generated pixels, a deterministic mock assistant, and static report text. No scanning, no execution, no external calls.</p></div></section>';
    if (started) {
      $("btnContinue").addEventListener("click", function () { enterApp(); });
      $("btnFresh").addEventListener("click", askReset);
    } else {
      $("startForm").addEventListener("submit", function (ev) {
        ev.preventDefault();
        var name = $("opName").value.trim().slice(0, 24) || "nightowl";
        E.startInvestigation(name);
        updateHUD();
        // Hash assignment alone is not enough: if the previous session already
        // left the URL at #/briefing (e.g. after a reset), no hashchange fires
        // and the player would be stuck on the landing page.
        if (location.hash === "#/briefing") route();
        else location.hash = "#/briefing";
      });
    }
  }

  /* ---------- app frame ---------- */
  function ensureClock() {
    // Exactly one 1s interval for the whole session; repeated calls
    // (navigation, pause toggles, re-entry) can never stack another one.
    if (!timerId) timerId = setInterval(tickClock, 1000);
    tickClock();
  }
  function enterApp() {
    $("landingWrap").hidden = true;
    $("topbar").hidden = false;
    $("layout").hidden = false;
    ensureClock();
    route();
    $("view").focus({ preventScroll: true });
  }
  function exitToLanding() {
    $("landingWrap").hidden = false;
    $("topbar").hidden = true;
    $("layout").hidden = true;
    renderLanding();
    storageBanner();
    renderDemoLauncher();
  }

  function route() {
    var h = location.hash || "#/briefing";
    updateHUD();
    if (!E.isStarted()) { exitToLanding(); return; }
    if ($("landingWrap").hidden === false) enterAppSilent();
    storageBanner();
    renderDemoLauncher();
    var m;
    if (h === "#/briefing") return renderBriefing();
    if (h === "#/report") return renderReport();
    if ((m = h.match(/^#\/tab\/(\w+)$/))) return renderTab(m[1]);
    if ((m = h.match(/^#\/level\/(\d+)$/))) return renderLevel(parseInt(m[1], 10));
    return renderTab("investigation");
  }
  function enterAppSilent() {
    $("landingWrap").hidden = true;
    $("topbar").hidden = false;
    $("layout").hidden = false;
    ensureClock();
  }
  function goTab(t) { location.hash = "#/tab/" + t; }

  /* ---------- briefing ---------- */
  function renderBriefing() {
    var s = E.getState();
    setSide("investigation");
    $("view").innerHTML =
      '<article class="card briefing"><p class="kicker">Case file INC-2214 · Northstar Systems (fictional)</p><h2>Briefing for operative ' + E.esc(s.operative) + "</h2>" +
      "<p>At 02:14 AM an automated filter caught a strange outbound fragment. By sunrise we knew it was a rehearsal for something bigger. Eleven workstreams stand between us and the full story — <strong>every level feeds the next</strong>, and the finale cannot be solved without the evidence you bank along the way.</p>" +
      '<ol class="brief-list"><li><strong>Investigate</strong> each workstation with the tools provided.</li><li><strong>Bank evidence</strong> — it auto-files into your Evidence Locker.</li><li><strong>Spend hints wisely</strong> — Hint 1 −10 · Hint 2 −15 · Hint 3 −20; wrong attempts −10.</li><li><strong>Close the case</strong> in Level 11 to unlock the Final Incident Report.</li></ol>' +
      '<div class="hero-actions"><button type="button" class="btn btn-primary btn-lg" id="btnGo">Open investigation dashboard</button></div></article>';
    $("btnGo").addEventListener("click", function () { goTab("investigation"); });
    $("view").focus({ preventScroll: true });
  }

  /* ---------- dashboard tabs ---------- */
  function setSide(tab) {
    document.querySelectorAll(".side-link").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-tab") === tab);
    });
  }
  function renderTab(tab) {
    setSide(tab);
    if (tab === "map") return renderMap();
    if (tab === "evidence") return renderEvidence();
    if (tab === "notes") return renderNotes();
    if (tab === "help") return renderHelp();
    return renderInvestigation();
  }

  function nextLevelId() {
    var s = E.getState();
    for (var i = 1; i <= CFG.TOTAL_LEVELS; i++) if (!s.completed[i]) return Math.min(i, s.maxUnlocked);
    return CFG.TOTAL_LEVELS;
  }

  /* Compact score ledger for the dashboard. Every line is derived from the
     same persisted attempts/hints/completed state as the HUD and the final
     report — base 100 per level, minus configured penalties, plus any banked
     speed bonus. No separate totals are kept anywhere. */
  function scoreBreakdownHTML() {
    var s = E.getState(), rows = [], totW = 0, totH = 0;
    for (var id = 1; id <= CFG.TOTAL_LEVELS; id++) {
      var w = s.attempts[id] || 0;
      var hh = s.hints[id] || [false, false, false];
      var hbits = [], penH = 0;
      for (var i = 0; i < 3; i++) {
        if (hh[i]) { penH += CFG.scoring.hintPenalties[i]; hbits.push("H" + (i + 1) + " −" + CFG.scoring.hintPenalties[i]); }
      }
      if (!w && !penH) continue;
      var penW = w * CFG.scoring.wrongAttemptPenalty;
      totW += penW; totH += penH;
      var val = s.completed[id]
        ? E.esc(String(s.completed[id].score)) + " banked"
        : E.esc(String(E.scoreForLevel(id))) + " live";
      rows.push("<div><dt>L" + id + " · " + w + " miss" + (w === 1 ? "" : "es") +
        (hbits.length ? " · " + E.esc(hbits.join(", ")) : "") +
        "</dt><dd>−" + (penW + penH) + " → " + val + "</dd></div>");
    }
    var html = '<div class="scorebreak"><h4>Investigation score</h4><dl>' +
      "<div><dt>Banked (solved levels)</dt><dd>" + E.totalScore() + " pts</dd></div>" +
      (rows.length ? rows.join("") : "<div><dt>Penalties so far</dt><dd>none — clean run</dd></div>") +
      "<div><dt>Wrong attempts total</dt><dd>−" + totW + " pts</dd></div>" +
      "<div><dt>Hints total</dt><dd>−" + totH + " pts</dd></div>" +
      "<div class='total'><dt>Live score</dt><dd>" + E.liveScore(hudLevelId()) + " pts</dd></div>" +
      "</dl></div>";
    return html;
  }
  function renderInvestigation() {
    var s = E.getState();
    var nid = nextLevelId();
    var L = D.getLevel(nid);
    var done = E.completedCount();
    var recent = E.evidenceList().slice(-3).reverse();
    var story = D.LEVELS.filter(function (l) { return s.completed[l.id]; })
      .map(function (l) { return "<li><strong>Level " + l.id + " — " + E.esc(l.title) + "</strong> <span class='muted'>+" + s.completed[l.id].score + " pts</span></li>"; }).join("");
    $("view").innerHTML =
      '<div class="dash-grid"><section class="card span2"><p class="kicker">Current mission</p>' +
      "<h2>Level " + L.id + " — " + E.esc(L.title) + "</h2>" +
      '<p><span class="diff ' + difficultyClass(L.difficulty) + '">' + E.esc(L.difficulty) + "</span> " + statusBadge(E.levelStatus(L.id)) +
      ' <span class="muted small">' + E.esc(L.time) + "</span></p><p>" + E.esc(L.tagline) + "</p>" +
      '<div class="hero-actions"><button type="button" class="btn btn-primary" id="btnStart">Open Level ' + L.id + '</button>' +
      '<button type="button" class="btn" id="btnMap">Mission map</button></div></section>' +
      '<section class="card"><h3>Investigation status</h3><div class="stat-grid">' +
      "<div><strong>" + E.liveScore(hudLevelId()) + "</strong><span>score</span></div>" +
      "<div><strong>" + done + "/" + CFG.TOTAL_LEVELS + "</strong><span>levels</span></div>" +
      "<div><strong>" + E.fmtTime(E.elapsedSeconds()) + "</strong><span>elapsed</span></div>" +
      "<div><strong>" + E.rating().label + "</strong><span>rating (" + E.rating().pct + "%)</span></div></div>" +
      scoreBreakdownHTML() +
      (s.finished ? '<button type="button" class="btn btn-primary" id="btnRep">Read Final Incident Report</button>' : '<p class="muted small">Finish Level 11 to unlock the Final Incident Report.</p>') + "</section>" +
      '<section class="card"><h3>Key evidence (latest)</h3><ul class="evmini">' +
      (recent.map(function (e) { return "<li><strong>" + e.id + "</strong> — " + E.esc(e.value) + "</li>"; }).join("") || "<li class='muted'>No evidence yet — solve Level 1.</li>") + "</ul>" +
      '<button type="button" class="btn btn-sm" id="btnEv">Open Evidence Locker</button></section>' +
      '<section class="card"><h3>Story so far</h3><ul class="storylist">' + (story || "<li class='muted'>The intercept is waiting. Every solved level writes the next line here.</li>") + "</ul></section></div>";
    $("btnStart").addEventListener("click", function () { location.hash = "#/level/" + nid; });
    $("btnMap").addEventListener("click", function () { goTab("map"); });
    $("btnEv").addEventListener("click", function () { goTab("evidence"); });
    var br = $("btnRep");
    if (br) br.addEventListener("click", function () { location.hash = "#/report"; });
  }

  function renderMap() {
    var cards = D.LEVELS.map(function (L) {
      var st = E.levelStatus(L.id);
      var locked = st === "locked";
      var sc = E.getState().completed[L.id];
      return '<article class="lvl-card ' + st + '">' +
        "<p class='lvl-num'>LEVEL " + L.id + "</p><h3>" + E.esc(L.title) + "</h3>" +
        '<p><span class="diff ' + difficultyClass(L.difficulty) + '">' + E.esc(L.difficulty) + "</span></p>" +
        "<p>" + statusBadge(st) + "</p>" +
        (sc ? "<p class='muted small'>Score " + sc.score + " · " + sc.attempts + " miss(es) · " + E.fmtTime(sc.timeSeconds) + "</p>" : "<p class='muted small'>" + E.esc(L.time) + "</p>") +
        (locked ? '<button type="button" class="btn btn-sm" disabled aria-disabled="true">Locked — solve Level ' + (L.id - 1) + " first</button>"
          : '<button type="button" class="btn btn-sm' + (st === "completed" ? "" : " btn-primary") + '" data-open="' + L.id + '">' + (st === "completed" ? "Review" : "Open") + "</button>") +
        "</article>";
    }).join("");
    $("view").innerHTML = '<h2>Mission map</h2><p class="muted">Levels unlock in order. Evidence carries forward — the finale needs Levels 3–10.</p><div class="lvl-grid">' + cards + "</div>";
    $("view").querySelectorAll("[data-open]").forEach(function (b) {
      b.addEventListener("click", function () { location.hash = "#/level/" + b.getAttribute("data-open"); });
    });
  }

  function openEvidenceModal(id) {
    var e = D.getEvidence(id);
    if (!e) return;
    var has = E.hasEvidence(id);
    var rel = D.relatedEvidence(id).filter(function (r) { return E.hasEvidence(r.evidence.id); });
    var relHtml = rel.length
      ? rel.map(function (r) {
          return '<button type="button" class="linkbtn" data-evjump="' + r.evidence.id + '">' + r.evidence.id + " — " + E.esc(r.evidence.name) + "</button>" +
            ' <span class="muted small">(shares: ' + r.sharedTags.map(E.esc).join(", ") + ")</span>";
        }).join("<br />")
      : '<span class="muted">No other recovered evidence links here yet.</span>';
    openModal("<h3>" + e.id + " — " + E.esc(e.name) + "</h3>" +
      "<p class='muted'>Type: " + E.esc(e.type) + " · Source: Level " + e.level + " · Status: " + (has ? "RECOVERED" : "SEALED") + "</p>" +
      "<p>" + E.esc(e.description) + "</p>" +
      (has ? "<p class='mono'>" + E.esc(e.value) + "</p>" : "") +
      '<p class="tags">' + (e.tags || []).map(function (t) { return "<span class='tag'>" + E.esc(t) + "</span>"; }).join(" ") + "</p>" +
      "<h3>Why it matters</h3><p>" + E.esc(e.finalNote || e.description) + "</p>" +
      "<h3>Related evidence</h3><p>" + relHtml + "</p>" +
      "<p>" + (e.usedInFinal
        ? "<span class='status st-completed'>CONTRIBUTED TO FINAL INVESTIGATION</span>"
        : "<span class='status st-available'>SUPPORTING EVIDENCE</span>") + "</p>" +
      "<button type='button' class='btn btn-primary' data-close='1'>Close</button>", e.id + " " + e.name);
    $("modalRoot").querySelectorAll("[data-evjump]").forEach(function (b) {
      b.addEventListener("click", function () { openEvidenceModal(b.getAttribute("data-evjump")); });
    });
  }

  function renderEvidence() {
    var list = E.evidenceList();
    // Vertical chain in level order; relatedness comes from shared tags in data.
    var chain = D.EVIDENCE.map(function (e, i) {
      var has = E.hasEvidence(e.id);
      var relCount = D.relatedEvidence(e.id).filter(function (r) { return E.hasEvidence(r.evidence.id); }).length;
      return (i > 0 ? '<div class="chain-link" aria-hidden="true">↓</div>' : "") +
        '<button type="button" class="chain-node' + (has ? "" : " sealed") + '" ' + (has ? 'data-ev="' + e.id + '"' : "disabled aria-disabled='true'") +
        ' aria-label="' + e.id + ": " + E.esc(e.name) + (has ? "" : " (sealed)") + '">' +
        '<span class="chain-id">' + e.id + " · Level " + e.level + "</span>" +
        "<strong>" + E.esc(e.name) + "</strong>" +
        (has
          ? '<span class="chain-sub">' + E.esc(e.value).slice(0, 90) + (E.esc(e.value).length > 90 ? "…" : "") + "</span>" +
            '<span class="chain-flags">' + (e.usedInFinal ? '<span class="status st-completed">finale</span>' : "") +
            (relCount ? '<span class="muted small">' + relCount + " link" + (relCount === 1 ? "" : "s") + "</span>" : "") + "</span>"
          : '<span class="chain-sub muted">Sealed — solve Level ' + e.level + "</span>") +
        "</button>";
    }).join("");
    var all = D.EVIDENCE.map(function (e) {
      var has = E.hasEvidence(e.id);
      return '<article class="ev-card' + (has ? "" : " missing") + '">' +
        "<p class='ev-id'>" + e.id + " · Level " + e.level + " · " + E.esc(e.type) + "</p><h3>" + E.esc(e.name) + "</h3>" +
        (has ? "<p>" + E.esc(e.description) + "</p><p class='mono small'>" + E.esc(e.value) + "</p>" +
          '<p class="tags">' + e.tags.map(function (t) { return "<span class='tag'>" + E.esc(t) + "</span>"; }).join(" ") + "</p>" +
          '<button type="button" class="btn btn-sm" data-ev="' + e.id + '">Inspect</button>'
          : "<p class='muted'>Sealed — solve Level " + e.level + " to recover this evidence.</p>") + "</article>";
    }).join("");
    $("view").innerHTML = "<h2>Evidence Locker</h2><p class='muted'>" + list.length + " of " + CFG.TOTAL_LEVELS + " recovered. Select any recovered item for description, related evidence, and its role in the finale.</p>" +
      '<div class="ws-grid ws-2col"><section class="card"><h3>Evidence chain</h3><p class="muted small">Level order, top to bottom. Links are shared tags from the case data.</p><div class="chain">' + chain + "</div></section>" +
      '<section><h3>All items</h3><div class="ev-grid ev-single">' + all + "</div></section></div>";
    $("view").querySelectorAll("[data-ev]").forEach(function (b) {
      b.addEventListener("click", function () { openEvidenceModal(b.getAttribute("data-ev")); });
    });
  }

  var noteQuery = "";
  var noteLevelFilter = "all";
  function noteLevelName(lvl) {
    if (!lvl) return "General";
    var L = D.getLevel(lvl);
    return L ? "L" + lvl + " · " + L.title : "L" + lvl;
  }
  function renderNotes() {
    var levelOpts = '<option value="all">All levels</option><option value="0">General</option>' +
      D.LEVELS.map(function (L) { return '<option value="' + L.id + '"' + (String(noteLevelFilter) === String(L.id) ? " selected" : "") + ">Level " + L.id + " — " + E.esc(L.title) + "</option>"; }).join("");
    var found = E.searchNotes(noteQuery).filter(function (n) {
      return noteLevelFilter === "all" || String(n.level || 0) === String(noteLevelFilter);
    });
    var items = found.map(function (n) {
      var d = n.createdAt ? new Date(n.createdAt) : null;
      return '<article class="note"><p>' + E.esc(n.text) + "</p>" +
        "<p class='muted small'>" + (d ? E.esc(d.toLocaleString()) : "undated") +
        ' · <span class="tag">' + E.esc(noteLevelName(n.level)) + "</span>" +
        (n.source ? ' · <span class="muted">' + E.esc(n.source) + "</span>" : "") + "</p>" +
        '<div class="answer-row"><button type="button" class="btn btn-sm" data-editnote="' + E.esc(n.id) + '">Edit</button>' +
        '<button type="button" class="btn btn-sm" data-delnote="' + E.esc(n.id) + '">Delete</button></div></article>';
    }).join("");
    $("view").innerHTML = '<h2>Investigation notes</h2><p class="muted">Persisted locally. Keep codenames, IPs, and hypotheses here — the finale is open-Locker.</p>' +
      '<form class="card" id="noteForm"><label class="fld" for="noteText"><span>New note</span><textarea id="noteText" rows="3" maxlength="2000" placeholder="e.g. C2 185.220.101.47 appears in packets 7, 9, 11…"></textarea></label>' +
      '<div class="answer-row wrap"><label class="fld" for="noteLevel"><span>Attach to level</span><select id="noteLevel"><option value="0">General</option>' +
      D.LEVELS.map(function (L) { return '<option value="' + L.id + '">Level ' + L.id + " — " + E.esc(L.title) + "</option>"; }).join("") + "</select></label>" +
      '<label class="fld" for="noteSource"><span>Source (optional)</span><input type="text" id="noteSource" maxlength="60" placeholder="e.g. Packet analyzer" /></label></div>' +
      '<div class="answer-row"><button type="submit" class="btn btn-primary">Save note</button></div></form>' +
      '<section class="card"><h3>Saved notes (' + found.length + ")</h3>" +
      '<div class="answer-row wrap"><label class="fld grow" for="noteSearch"><span>Search notes</span><input type="search" id="noteSearch" value="' + E.esc(noteQuery) + '" placeholder="Search text or source…" /></label>' +
      '<label class="fld" for="noteFilter"><span>Level</span><select id="noteFilter">' + levelOpts + "</select></label>" +
      '<button type="button" class="btn btn-sm" id="btnClearNotes">Clear all…</button></div>' +
      '<div class="note-list">' + (items || "<p class='muted'>No notes match.</p>") + "</div></section>";
    var h = location.hash.match(/^#\/level\/(\d+)$/);
    if (h) $("noteLevel").value = h[1];
    $("noteForm").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var t = $("noteText").value;
      if (!t.trim()) { toast("Write something first."); return; }
      E.addNote(t, { level: parseInt($("noteLevel").value, 10) || 0, source: $("noteSource").value.trim() });
      toast("Note saved.");
      renderNotes();
    });
    $("noteSearch").addEventListener("input", function (ev) { noteQuery = ev.target.value; renderNotes(); var s = $("noteSearch"); s.focus(); s.setSelectionRange(s.value.length, s.value.length); });
    $("noteFilter").addEventListener("change", function (ev) { noteLevelFilter = ev.target.value; renderNotes(); });
    $("btnClearNotes").addEventListener("click", function () {
      if (!E.getState().notes.length) { toast("No notes to clear."); return; }
      openModal("<h3>Delete all notes?</h3><p>This removes <strong>" + E.getState().notes.length + " note(s)</strong> on this browser. This cannot be undone.</p>" +
        '<div class="hero-actions"><button type="button" class="btn btn-primary" id="btnDoClearNotes">Delete all notes</button><button type="button" class="btn" data-close="1">Cancel</button></div>', "Delete all notes");
      $("btnDoClearNotes").addEventListener("click", function () { E.clearNotes(); closeModal(); toast("All notes deleted."); renderNotes(); });
    });
    $("view").querySelectorAll("[data-delnote]").forEach(function (b) {
      b.addEventListener("click", function () {
        E.deleteNote(b.getAttribute("data-delnote"));
        toast("Note deleted.");
        renderNotes();
      });
    });
    $("view").querySelectorAll("[data-editnote]").forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-editnote");
        var cur = null;
        E.getState().notes.forEach(function (n) { if (n.id === id) cur = n; });
        if (!cur) return;
        openModal('<h3>Edit note</h3><label class="fld" for="editText"><span>Note text</span><textarea id="editText" rows="4" maxlength="2000">' + E.esc(cur.text) + "</textarea></label>" +
          '<div class="hero-actions"><button type="button" class="btn btn-primary" id="btnDoEdit">Save changes</button><button type="button" class="btn" data-close="1">Cancel</button></div>', "Edit note");
        $("btnDoEdit").addEventListener("click", function () {
          var v = $("editText").value;
          if (!v.trim()) { toast("Note cannot be empty."); return; }
          E.updateNote(id, v);
          closeModal();
          toast("Note updated.");
          renderNotes();
        });
      });
    });
  }

  var helpSection = "guide";
  function renderHelp() {
    var safety = D.SAFETY.map(function (row) {
      return '<div class="kv"><span>' + E.esc(row[0]) + "</span><span>" + E.esc(row[1]) + "</span></div>";
    }).join("");
    var gloss = D.GLOSSARY.map(function (g) {
      return '<div class="kv"><span>' + E.esc(g[0]) + "</span><span>" + E.esc(g[1]) + "</span></div>";
    }).join("");
    $("view").innerHTML = '<h2>Help & field manual</h2>' +
      '<div class="tabs" role="tablist" aria-label="Help sections">' +
      '<button type="button" role="tab" class="tabbtn' + (helpSection === "guide" ? " on" : "") + '" data-help="guide" aria-selected="' + (helpSection === "guide") + '">Player guide</button>' +
      '<button type="button" role="tab" class="tabbtn' + (helpSection === "safety" ? " on" : "") + '" data-help="safety" aria-selected="' + (helpSection === "safety") + '">Safety &amp; ethics</button>' +
      '<button type="button" role="tab" class="tabbtn' + (helpSection === "glossary" ? " on" : "") + '" data-help="glossary" aria-selected="' + (helpSection === "glossary") + '">Glossary</button></div>' +
      '<div id="helpPanel" role="tabpanel"></div>';
    $("view").querySelectorAll("[data-help]").forEach(function (b) {
      b.addEventListener("click", function () { helpSection = b.getAttribute("data-help"); renderHelp(); });
    });
    var panel = $("helpPanel");
    if (helpSection === "safety") {
      panel.innerHTML = '<section class="card"><p class="kicker">Training ground rules</p><h3>Safety &amp; ethics</h3>' +
        '<p>This is a defensive classroom simulation. These ground rules keep it that way:</p>' + safety +
        '<p class="muted small">If anything in the game ever resembles a real person, system, or credential, treat it as coincidence, do not act on it, and tell your instructor.</p></section>';
    } else if (helpSection === "glossary") {
      panel.innerHTML = '<section class="card"><p class="kicker">Student reference</p><h3>Cybersecurity glossary</h3>' +
        '<p class="muted small">One-line definitions for every concept the investigation uses.</p>' + gloss + "</section>";
    } else {
      panel.innerHTML = '<div class="ws-grid ws-2col">' +
        '<section class="card"><h3>How to play</h3><ol><li>Read the story and objectives.</li><li>Work the evidence with the level tools (decode, filter, inspect, bookmark).</li><li>Submit findings — wrong attempts cost 10 pts; hints cost 10 / 15 / 20.</li><li>Banked evidence unlocks the next level. Review it anytime in the Locker.</li></ol>' +
        '<h3>Scoring</h3><p>100 base per level − penalties + speed bonus (≤2 min +25 · ≤5 min +15 · ≤10 min +5, floor 0). Rating bands: 90+ Expert · 75+ Advanced · 60+ Competent · 40+ Developing · below Rookie.</p><p>The header score is live: every wrong attempt (−10) and hint (−10/−15/−20) drops it immediately, with an old → new receipt in the feedback area. Solved levels bank their final value. A full breakdown lives on the dashboard under Investigation status.</p></section>' +
        '<section class="card"><h3>Timer</h3><p>Use the pause button next to the mission clock to freeze it — the pill reads <strong>PAUSED</strong> and the digits genuinely stop. Resume returns it to <strong>RUNNING</strong>. The clock also pauses automatically while this tab is hidden (a manual pause stays paused when you return). Per-level speed bonuses intentionally keep wall-clock rules — see the README for details.</p>' +
        '<h3>Display</h3><div class="check-grid">' +
        '<label class="check"><input type="checkbox" id="setTimer"' + (settings.showTimer ? " checked" : "") + ' /> <span>Show mission timer</span></label>' +
        '<label class="check"><input type="checkbox" id="setScore"' + (settings.showScore ? " checked" : "") + ' /> <span>Show score in header</span></label>' +
        '<label class="check"><input type="checkbox" id="setPresent"' + (settings.presentation ? " checked" : "") + ' /> <span>Presentation mode (large text, focused workspace)</span></label></div>' +
        '<h3>Safety notice</h3><p>This is a defensive training simulation. Captures, images, the AI assistant, and malware reports are fictional local data. It teaches detection and response — never attack techniques against real systems. No scanning, no execution, no external connections. Full details under the <strong>Safety &amp; ethics</strong> tab.</p>' +
        '<h3>Accessibility</h3><p>Full keyboard support (Tab / Enter / Space, Escape closes dialogs), visible focus, labeled controls, live-region feedback, and layouts that collapse cleanly on tablet and mobile. Packet tables scroll horizontally; boards stack vertically.</p>' +
        '<button type="button" class="btn" id="btnResetHelp">Reset investigation…</button></section></div>';
      $("btnResetHelp").addEventListener("click", askReset);
      $("setTimer").addEventListener("change", function (ev) { settings.showTimer = ev.target.checked; saveSettings(); });
      $("setScore").addEventListener("change", function (ev) { settings.showScore = ev.target.checked; saveSettings(); });
      $("setPresent").addEventListener("change", function (ev) { settings.presentation = ev.target.checked; saveSettings(); toast(ev.target.checked ? "Presentation mode on." : "Presentation mode off."); });
    }
  }

  /* ---------- level view ---------- */
  function currentLevelFromHash() {
    var m = (location.hash || "").match(/^#\/level\/(\d+)$/);
    return m ? parseInt(m[1], 10) : null;
  }
  function presentationNav() {
    if (!settings.presentation) return "";
    var opts = D.LEVELS.map(function (L) {
      var cur = currentLevelFromHash();
      return '<option value="' + L.id + '"' + (cur === L.id ? " selected" : "") + (E.isUnlocked(L.id) ? "" : " disabled") + ">Level " + L.id + " — " + E.esc(L.title) + "</option>";
    }).join("");
    return '<div class="presnav" role="navigation" aria-label="Quick level navigation"><div class="answer-row wrap">' +
      '<label class="fld grow" for="presJump"><span>Jump to level</span><select id="presJump">' + opts + "</select></label>" +
      '<button type="button" class="btn" id="presPrev">← Prev</button>' +
      '<button type="button" class="btn" id="presNext">Next →</button></div></div>';
  }
  function wirePresentationNav() {
    if (!settings.presentation) return;
    var j = $("presJump");
    if (j) j.addEventListener("change", function (ev) { location.hash = "#/level/" + ev.target.value; });
    var cur = currentLevelFromHash() || 1;
    var p = $("presPrev"), n = $("presNext");
    if (p) { p.disabled = cur <= 1; p.addEventListener("click", function () { if (cur > 1) location.hash = "#/level/" + (cur - 1); }); }
    if (n) { n.disabled = cur >= CFG.TOTAL_LEVELS || !E.isUnlocked(cur + 1); n.addEventListener("click", function () { location.hash = "#/level/" + (cur + 1); }); }
  }
  /* Appends a penalty receipt to the feedback area (never replaces guidance).
     Amounts always come from CFG; old→new values are read live from state,
     so the display cannot drift from the authoritative score. */
  function showPenaltyNotice(title, amount, oldProj, oldLive, lid) {
    var box = $("feedback");
    if (!box) return;
    var d = document.createElement("div");
    d.className = "alert warn";
    d.setAttribute("role", "status");
    d.innerHTML = "<strong>" + E.esc(title) + ' <span class="pen">−' + amount + " PTS</span></strong>" +
      '<p class="muted small">Level value: <strong>' + oldProj + " → " + E.scoreForLevel(lid) +
      "</strong> · Investigation score: <strong>" + oldLive + " → " + E.liveScore(lid) + "</strong>.</p>";
    box.appendChild(d);
    smoothIntoView(d);
  }
  function renderLevel(id) {
    var L = D.getLevel(id);
    if (!L) { goTab("investigation"); return; }
    if (!E.isUnlocked(id)) { toast("Level " + id + " is locked — solve Level " + (id - 1) + " first."); location.hash = "#/tab/map"; return; }
    var issues = E.validateLevel(L);
    E.markLevelOpened(id);
    setSide(id === nextLevelId() ? "investigation" : "map");
    var s = E.getState();
    var done = s.completed[id];
    var wrong = s.attempts[id] || 0;
    // Hint card renders from live state so revealing a hint never touches
    // the workspace below (selections, timeline drafts, typed answers stay).
    // Post-solve reveals are session-local: the debrief says "free review",
    // so they display the text without mutating score state or receipts.
    var revealed = {};
    function hintSolved() { return !!E.getState().completed[id]; }
    function hintCardHTML() {
      var solved = hintSolved();
      var hh = E.getState().hints[id] || [false, false, false];
      return "<h3>Hints " + (solved ? "(solved — free review)" : "(penalties apply)") + '</h3><div class="hint-list">' +
        L.hints.map(function (text, i) {
          var pen = CFG.scoring.hintPenalties[i];
          var shown = hh[i] || (solved && revealed[i]);
          var label = hh[i]
            ? "Hint " + (i + 1) + " used (−" + pen + ")"
            : "Reveal Hint " + (i + 1) + (solved ? " (free)" : " (−" + pen + ")");
          return '<div class="hint"><button type="button" class="btn btn-sm" data-hint="' + i + '"' + (shown ? " disabled" : "") + ">" +
            label + "</button>" +
            (shown ? "<p>" + E.esc(text) + "</p>" : "") + "</div>";
        }).join("") + "</div>";
    }
    function refreshHintCard() {
      var card = $("hintCard");
      if (!card) return;
      card.innerHTML = hintCardHTML();
      wireHints(card);
      var proj = $("lvlProj");
      if (proj) proj.textContent = "projected score: " + E.scoreForLevel(id);
    }
    function wireHints(root) {
      root.querySelectorAll("[data-hint]").forEach(function (b) {
        b.addEventListener("click", function () {
          var i = parseInt(b.getAttribute("data-hint"), 10);
          if (hintSolved()) {
            revealed[i] = true;
          } else {
            var hOldProj = E.scoreForLevel(id), hOldLive = E.liveScore(id);
            if (E.useHint(id, i)) {
              updateHUD();
              toast("Hint " + (i + 1) + " used −" + CFG.scoring.hintPenalties[i] + " pts. Score " + hOldLive + " → " + E.liveScore(id) + ".");
              showPenaltyNotice("HINT " + (i + 1) + " USED", CFG.scoring.hintPenalties[i], hOldProj, hOldLive, id);
            } else {
              toast("Hint " + (i + 1) + " already in use — no additional charge.");
            }
          }
          refreshHintCard();
        });
      });
    }

    $("view").innerHTML =
      '<nav class="crumbs" aria-label="Breadcrumb"><button type="button" class="linkbtn" id="crumbMap">← Mission map</button></nav>' +
      presentationNav() +
      '<header class="lvl-head"><div><p class="kicker">Level ' + L.id + " of " + CFG.TOTAL_LEVELS + "</p><h2>" + E.esc(L.title) + "</h2>" +
      '<p><span class="diff ' + difficultyClass(L.difficulty) + '">' + E.esc(L.difficulty) + '</span> <span id="lvlStatus">' + statusBadge(done ? "completed" : E.levelStatus(id)) + "</span>" +
      ' <span class="muted small">' + E.esc(L.time) + ' · attempts: <span id="lvlAtt">' + wrong + '</span> · <span id="lvlProj">projected score: ' + E.scoreForLevel(id) + "</span></span></p></div>" +
      (id === CFG.TOTAL_LEVELS ? '<p class="tag">FINALE — requires Evidence EV-03 → EV-10</p>' : "") + "</header>" +
      (issues.length ? '<div class="alert err" role="alert"><strong>Level configuration problem (no progress lost).</strong><ul>' +
        issues.map(function (i) { return "<li>" + E.esc(i) + "</li>"; }).join("") + "</ul></div>" : "") +
      '<section class="card"><h3>Story</h3>' + L.story.map(function (p) { return "<p>" + E.esc(p) + "</p>"; }).join("") +
      "<h3>Mission objectives</h3><ol>" + L.objectives.map(function (o) { return "<li>" + E.esc(o) + "</li>"; }).join("") + "</ol>" +
      (L.learningObjectives && L.learningObjectives.length
        ? "<h3>Learning objectives</h3><p class='muted small'>After this level you will be able to:</p><ul class='learn-list'>" +
          L.learningObjectives.map(function (o) { return "<li>" + E.esc(o) + "</li>"; }).join("") + "</ul>" : "") +
      '<p class="muted small">' + E.esc(L.briefing) + "</p></section>" +
      '<div id="workspace"></div>' +
      '<section class="card" id="hintCard">' + hintCardHTML() + "</section>" +
      '<div class="feedback" id="feedback" aria-live="polite"></div><div id="solved"></div>';

    $("crumbMap").addEventListener("click", function () { goTab("map"); });
    wirePresentationNav();
    wireHints($("view"));

    var api = {
      esc: E.esc, toast: toast,
      lastFailAt: 0,
      lastFailKey: "",
      fail: function (msg) {
        if (E.getState().completed[id]) return;
        // One submission = one penalty. Validation is synchronous, so a
        // machine-gun double-click would otherwise dispatch twice and charge
        // twice. A repeat is a duplicate only when it carries the SAME
        // failure message within 500ms (i.e. the same unchanged submission);
        // new information always counts, however fast it follows.
        var now = Date.now();
        var key = id + "|" + msg;
        if (key === api.lastFailKey && now - api.lastFailAt < 500) { smoothIntoView($("feedback")); return; }
        api.lastFailAt = now;
        api.lastFailKey = key;
        var pen = CFG.scoring.wrongAttemptPenalty;
        var oldProj = E.scoreForLevel(id), oldLive = E.liveScore(id);
        var n = E.recordWrongAttempt(id);
        var newProj = E.scoreForLevel(id), newLive = E.liveScore(id);
        updateHUD();
        var att = $("lvlAtt");
        if (att) att.textContent = String(n);
        var proj = $("lvlProj");
        if (proj) proj.textContent = "projected score: " + newProj;
        var hintIdx = [0, 1, 2].filter(function (i) { return !(E.getState().hints[id] || [])[i]; })[0];
        $("feedback").innerHTML = '<div class="alert err" role="alert"><strong>INCORRECT <span class="pen">−' + pen + ' PTS</span></strong><p>' + msg + "</p>" +
          '<p class="muted small">Attempt ' + n + " · Level value: <strong>" + oldProj + " → " + newProj + "</strong> · Investigation score: <strong>" + oldLive + " → " + newLive + "</strong>.</p>" +
          '<p class="muted small">' +
          (hintIdx !== undefined
            ? 'Stuck? <button type="button" class="linkbtn" id="fbHint">Reveal Hint ' + (hintIdx + 1) + " (−" + CFG.scoring.hintPenalties[hintIdx] + " pts)</button>"
            : "All three hints are already revealed — re-read them against the evidence.") + "</p></div>";
        var hb = $("fbHint");
        if (hb) hb.addEventListener("click", function () {
          var hOldProj = E.scoreForLevel(id), hOldLive = E.liveScore(id);
          if (E.useHint(id, hintIdx)) {
            updateHUD();
            toast("Hint " + (hintIdx + 1) + " used −" + CFG.scoring.hintPenalties[hintIdx] + " pts. Score " + hOldLive + " → " + E.liveScore(id) + ".");
            showPenaltyNotice("HINT " + (hintIdx + 1) + " USED", CFG.scoring.hintPenalties[hintIdx], hOldProj, hOldLive, id);
          } else {
            toast("Hint " + (hintIdx + 1) + " already in use — no additional charge.");
          }
          refreshHintCard();
        });
        smoothIntoView($("feedback"));
      },
      solve: function () {
        if (E.getState().completed[id]) { showSolved(L, E.getState().completed[id], true); return; }
        var rec = E.completeLevel(id, L.reward);
        updateHUD();
        showSolved(L, rec, false);
        // Re-render header bits captured before the solve: badge flips to
        // COMPLETED and the hint card switches to "solved — free review".
        var st = $("lvlStatus");
        if (st) st.innerHTML = statusBadge("completed");
        refreshHintCard();
      }
    };
    try {
      window.NS_LEVELS[id]($("workspace"), L, api);
    } catch (err) {
      $("workspace").innerHTML = '<div class="alert err">Workstation failed to load. Reset the investigation or try another browser. (' + E.esc(err.message) + ")</div>";
    }
    if (done) showSolved(L, done, true);
    $("view").focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  function showSolved(L, rec, already) {
    var ev = D.getEvidence(L.reward);
    var box = $("solved");
    if (!box) return;
    var db = L.debrief || {};
    box.innerHTML =
      '<section class="card solved pop-in" aria-label="Level debrief"><p class="kicker success-kicker">' + (already ? "Debrief — already solved" : "✓ SUCCESS — Level " + L.id + " solved · +" + rec.score + " pts") + "</p>" +
      "<h3>Debrief</h3>" +
      "<h4>What you found</h4><p>" + E.esc(L.explanation.found) + "</p>" +
      "<h4>Why it matters</h4><p>" + E.esc(L.explanation.why) + "</p>" +
      (db.skill ? "<h4>Skill practiced</h4><p>" + E.esc(db.skill) + "</p>" : "") +
      (db.connection ? "<h4>Connection to the investigation</h4><p>" + E.esc(db.connection) + "</p>" : "") +
      "<h4>What you learned</h4><p>" + E.esc(L.explanation.learned) + "</p>" +
      '<p class="ev-unlock">▣ Evidence banked: <strong>' + ev.id + " — " + E.esc(ev.name) + "</strong><br /><span class='mono small'>" + E.esc(ev.value) + "</span></p>" +
      '<div class="hero-actions">' +
      (L.id < CFG.TOTAL_LEVELS ? '<button type="button" class="btn btn-primary" id="btnNext">Advance to Level ' + (L.id + 1) + "</button>" : '<button type="button" class="btn btn-primary" id="btnFinal">Open Final Incident Report</button>') +
      '<button type="button" class="btn" id="btnLocker">Review Evidence Locker</button></div></section>';
    smoothIntoView(box);
    var nx = $("btnNext");
    if (nx) nx.addEventListener("click", function () { location.hash = "#/level/" + (L.id + 1); });
    var bf = $("btnFinal");
    if (bf) bf.addEventListener("click", function () { location.hash = "#/report"; });
    $("btnLocker").addEventListener("click", function () { goTab("evidence"); });
    var fb = $("feedback");
    if (fb && !already) fb.innerHTML = "";
  }

  /* ---------- final report ---------- */
  function renderReport() {
    var s = E.getState();
    if (!s.finished) { toast("Solve Level " + CFG.TOTAL_LEVELS + " to unlock the report."); location.hash = "#/level/" + nextLevelId(); return; }
    setSide("investigation");
    var r = E.rating();
    var rows = D.LEVELS.map(function (L) {
      var c = s.completed[L.id];
      return "<tr><td>L" + L.id + "</td><td>" + E.esc(L.title) + "</td><td>" + (c ? c.score : 0) + "</td><td>" + (c ? c.attempts : "—") + "</td><td>" + (c ? c.hintsUsed.filter(Boolean).length : "—") + "</td><td>" + (c ? E.fmtTime(c.timeSeconds) : "—") + "</td></tr>";
    }).join("");
    var totalAttempts = Object.keys(s.attempts).reduce(function (a, k) { return a + s.attempts[k]; }, 0);
    var totalHints = Object.keys(s.hints).reduce(function (a, k) { return a + s.hints[k].filter(Boolean).length; }, 0);
    var opened = s.startedAt ? new Date(s.startedAt).toLocaleString() : "—";
    var closed = s.finishedAt ? new Date(s.finishedAt).toLocaleString() : "—";
    var evUsed = D.EVIDENCE.map(function (e) {
      return "<tr><td>" + e.id + "</td><td>" + E.esc(e.name) + "</td><td>L" + e.level + "</td><td>" + E.esc(e.finalNote || e.description) + "</td></tr>";
    }).join("");
    $("view").innerHTML =
      '<article class="card report"><p class="kicker">Final incident report · INC-2214 · operative ' + E.esc(s.operative) + "</p><h2>Northstar Systems — Incident Closed</h2>" +
      "<h3>Mission status</h3><p><span class='status st-completed'>CASE CLOSED</span> — all 11 workstreams complete. Investigation opened <strong>" + E.esc(opened) + "</strong>, closed <strong>" + E.esc(closed) + "</strong> by operative <strong>" + E.esc(s.operative) + "</strong>.</p>" +
      "<h3>Incident summary</h3><p>On Oct 12 a lookalike-domain phish (<strong>northstar-systems-support.com</strong>) harvested Finance credentials; the attacker pivoted to the weak admin account <strong>m.reyes</strong> (no MFA, reused password), executed <strong>northstar_update.exe</strong> on <strong>10.4.18.22</strong>, tunneled via <strong>DNS</strong>, and exfiltrated <strong>~4.2 MB</strong> to <strong>185.220.101.47</strong> before midnight. Staging traces (<strong>FALCON NEST 7</strong>, code <strong>4419</strong>) converge on fictional persona <strong>D. Kessler / grayfalcon_builds</strong> operating near <strong>Pier 7, Halcyon Bay (41.0821, −73.7902)</strong>. Containment: host isolated, C2 blocked, credentials reset, forensic image preserved.</p>" +
      "<h3>Initial access</h3><p>Phishing email E3 (Oct 12, 13:14) from the lookalike domain <strong>it-helpdesk@northstar-systems-support.com</strong> combined manufactured payroll urgency with a macro-enabled attachment (<strong>Payroll_Update_Q3.doc</strong>, a3f9…c41d) and a credential-harvesting link. A 09:41 form submission gave the attacker valid Finance credentials (Evidence EV-03), which were then replayed against the weak admin account <strong>m.reyes</strong> — no MFA, reused password — at 10:02 (Evidence EV-02).</p>" +
      "<h3>Attack path</h3><ol><li>Oct 02 — attack domain registered (registrant “D.K.”).</li><li>Oct 12 09:14 — phish E3 delivered to Finance.</li><li>09:41 — credentials harvested via lookalike portal.</li><li>10:02 — anomalous m.reyes login from an unknown network.</li><li>11:20 — attachment hash active on host 10.4.18.22.</li><li>23:47 — DNS tunneling to relay.northstar-systems-support.com begins.</li><li>Oct 13 00:03 — 4.2 MB exfiltrated to 185.220.101.47; periodic beacons continue.</li><li>Staging supported from Pier 7, Halcyon Bay (“FALCON NEST 7”, code 4419).</li></ol>" +
      "<h3>Key indicators</h3><div class='table-scroll'><table class='pkt'><thead><tr><th>Type</th><th>Value</th><th>Source</th></tr></thead><tbody>" +
      "<tr><td>Domain</td><td class='mono'>northstar-systems-support.com</td><td>L3/L9</td></tr>" +
      "<tr><td>C2 host</td><td class='mono'>relay.northstar-systems-support.com</td><td>L4/L11</td></tr>" +
      "<tr><td>C2 IP</td><td class='mono'>185.220.101.47</td><td>L4/L11</td></tr>" +
      "<tr><td>Hash</td><td class='mono break'>a3f9e71b…bbc41d</td><td>L3/L8/L11</td></tr>" +
      "<tr><td>Internal host</td><td class='mono'>10.4.18.22</td><td>L4/L8</td></tr>" +
      "<tr><td>Persistence</td><td class='mono'>HKCU … Run\\NorthstarUpdate</td><td>L11</td></tr>" +
      "<tr><td>Staging</td><td class='mono'>FALCON NEST 7 · code 4419 · Pier 7</td><td>L5/L7/L10</td></tr>" +
      "</tbody></table></div>" +
      "<h3>Timeline</h3><ol><li>Oct 02 — attack domain registered (D.K.)</li><li>Oct 12 09:14 — phish E3 delivered</li><li>09:41 — credentials submitted</li><li>10:02 — anomalous m.reyes login</li><li>11:20 — implant active on 10.4.18.22</li><li>23:47 — DNS tunneling starts</li><li>Oct 13 00:03 — 4.2 MB egress</li><li>Oct 13 08:30 — SOC opens INC-2214; sample quarantined</li></ol>" +
      "<h3>Root cause</h3><p>Weak identity (admin without MFA, reused password) met effective delivery (targeted pretexted phish) and flat response assumptions (DNS egress unmonitored). No single control failed — the chain did.</p>" +
      "<h3>Impact</h3><p>Within the recovered training records: <strong>~4.2 MB exfiltrated</strong> to external infrastructure; one Finance credential set and one domain-admin session compromised; one workstation (10.4.18.22) implanted with Run-key persistence. The correlated timeline shows no lateral movement beyond that host in the available records — containment arrived before the next stage.</p>" +
      "<h3>Containment</h3><p>Executed order: <strong>isolate 10.4.18.22; block 185.220.101.47 and relay.northstar-systems-support.com at the edge; force-reset m.reyes credentials and revoke sessions; preserve a forensic image before rebuilding from known-good media.</strong> Then hunt the IOC table below across mail, proxy, DNS, and EDR telemetry, and monitor for beacon re-registration.</p>" +
      "<h3>Recommended defensive actions</h3><ol><li>Enforce phishing-resistant MFA and vaulted unique passwords; remove standing domain-admin.</li><li>Filter long/TXT DNS to external resolvers; alert on query-length and rarity.</li><li>Block and hunt the IOCs above; gateway-strip macro attachments.</li><li>System-prompt hierarchy + human approval for AI assistants with sensitive data.</li><li>Verify callers via known-good channels; never share passwords or MFA codes.</li><li>Preserve images, reimage from known-good media, tabletop the timeline.</li></ol>" +
      "<h3>Evidence used</h3><p class='muted small'>How each banked item fed the final conclusion:</p><div class='table-scroll'><table class='pkt'><thead><tr><th>ID</th><th>Evidence</th><th>Lvl</th><th>Role in conclusion</th></tr></thead><tbody>" + evUsed + "</tbody></table></div>" +
      "<h3>Player performance</h3><div class='stat-grid'><div><strong>" + E.totalScore() + "</strong><span>total score</span></div><div><strong>" + E.fmtTime(E.elapsedSeconds()) + "</strong><span>active time</span></div><div><strong>" + E.fmtDuration(E.wallSeconds()) + "</strong><span>completion (wall)</span></div><div><strong>" + totalAttempts + "</strong><span>wrong attempts</span></div><div><strong>" + totalHints + "</strong><span>hints used</span></div><div><strong>" + CFG.TOTAL_LEVELS + "/" + CFG.TOTAL_LEVELS + "</strong><span>levels</span></div><div><strong>" + r.label + "</strong><span>" + r.pct + "%</span></div></div>" +
      "<h3>Per-level breakdown</h3><div class='table-scroll'><table class='pkt'><thead><tr><th>Lvl</th><th>Title</th><th>Score</th><th>Misses</th><th>Hints</th><th>Time</th></tr></thead><tbody>" + rows + "</tbody></table></div>" +
      '<div class="hero-actions"><button type="button" class="btn btn-primary" id="btnReview">Review investigation</button><button type="button" class="btn btn-ghost" id="btnAgain">Reset & replay</button></div></article>';
    $("btnReview").addEventListener("click", function () { goTab("map"); });
    $("btnAgain").addEventListener("click", askReset);
    window.scrollTo(0, 0);
  }

  /* ---------- instructor demo mode (local-only; see js/config.js) ---------- */
  function isDemo() { return !!(CFG && CFG.DEMO_MODE); }
  function demoLevelId() { return currentLevelFromHash() || nextLevelId(); }

  /* Human-readable expected solution derived from the level's own data. */
  function solutionLines(L) {
    var v = L.validation, out = [];
    function names(arr, labels) { return arr.map(function (i) { return labels[i]; }); }
    if (v.type === "text") out.push("Answer: " + v.accepted[0]);
    else if (v.type === "account") {
      out.push("Account: " + v.account);
      out.push("Factors: " + names(v.factors, L.riskFactors).join(" · "));
    } else if (v.type === "phish") {
      out.push("Email: " + v.email);
      out.push("Indicators: " + names(v.indicators, L.indicators).join(" · "));
    } else if (v.type === "multipart" || v.type === "final") {
      v.fields.forEach(function (f) { out.push(f.label + ": " + f.accepted[0]); });
      if (v.type === "final") out.push("Containment: option 1 — " + L.containmentOptions[v.containment].slice(0, 80) + "…");
    } else if (v.type === "annotate") {
      var segs = v.segments.map(function (id) {
        var m = null;
        L.chat.forEach(function (c) { if (c.id === id) m = c; });
        return id + (m ? " (“" + m.text.slice(0, 48) + "…”)" : "");
      });
      out.push("Flag: " + segs.join(" · "));
      out.push("Technique: " + L.techniques[v.technique]);
    } else if (v.type === "injection") {
      out.push("Malicious message: " + v.message);
      out.push("Fix: " + L.fixes[v.fix].slice(0, 90) + "…");
    } else if (v.type === "ordered") {
      out.push("Order: " + v.order.join(" → "));
    } else if (v.type === "osint") {
      out.push("Bookmark: " + v.bookmarks.join(", "));
      out.push("Persona: " + L.suspects[v.suspect]);
      out.push("Domain: " + v.domain);
    } else if (v.type === "geoint") {
      out.push("Site: " + L.sites[v.site]);
      out.push("Coordinates: " + v.lat + ", " + v.lon);
    } else out.push("See level validation data.");
    return out;
  }

  function renderDemoLauncher() {
    var root = $("demoRoot");
    if (!root) return;
    if (!isDemo() || !E.isStarted() || $("landingWrap").hidden === false) { root.innerHTML = ""; return; }
    if ($("demoBtn")) return;
    var b = document.createElement("button");
    b.type = "button";
    b.id = "demoBtn";
    b.className = "demo-launcher";
    b.textContent = "⬣ Instructor demo (local)";
    b.setAttribute("aria-label", "Open instructor demo panel");
    b.addEventListener("click", openDemoPanel);
    root.appendChild(b);
  }

  function openDemoPanel() {
    var id = demoLevelId();
    var L = D.getLevel(id);
    var remaining = [0, 1, 2].filter(function (i) { return !(E.getState().hints[id] || [])[i]; });
    openModal(
      "<p class='demo-tag'>INSTRUCTOR DEMO — LOCAL ONLY · hidden unless DEMO_MODE is on</p>" +
      "<h3>Demo controls</h3>" +
      "<p class='muted small'>Current level: <strong>Level " + id + " — " + E.esc(L.title) + "</strong></p>" +
      "<h3>Navigate</h3><div class='answer-row wrap'>" +
      '<label class="fld grow" for="demoJump"><span>Jump to level</span><select id="demoJump">' +
      D.LEVELS.map(function (l) { return '<option value="' + l.id + '"' + (l.id === id ? " selected" : "") + ">Level " + l.id + " — " + E.esc(l.title) + "</option>"; }).join("") + "</select></label>" +
      '<button type="button" class="btn btn-sm" id="demoGo">Go</button>' +
      '<button type="button" class="btn btn-sm" id="demoReport">Final report…</button></div>' +
      "<h3>Progress</h3><div class='answer-row wrap'>" +
      '<button type="button" class="btn btn-sm" id="demoUnlock">Unlock all levels</button>' +
      '<button type="button" class="btn btn-sm" id="demoComplete">Complete current level</button>' +
      '<button type="button" class="btn btn-sm" id="demoReset">Reset game…</button></div>' +
      "<h3>Hints (Level " + id + ")</h3><div class='answer-row wrap'>" +
      '<button type="button" class="btn btn-sm" id="demoAddHint"' + (remaining.length ? "" : " disabled") + ">Reveal next hint</button>" +
      '<button type="button" class="btn btn-sm" id="demoDropHint">Un-reveal last hint</button></div>' +
      "<h3>Solutions & evidence</h3><div class='answer-row wrap'>" +
      '<button type="button" class="btn btn-sm" id="demoSolution">View Level ' + id + " solution</button>" +
      '<button type="button" class="btn btn-sm" id="demoEvidence">View expected evidence</button></div>' +
      '<div class="demo-out" id="demoOut" aria-live="polite"><p class="muted small">Output appears here.</p></div>' +
      "<h3>Demo investigation states</h3><div class='answer-row wrap'>" +
      '<button type="button" class="btn btn-sm" id="demoFresh">Fresh start</button>' +
      '<button type="button" class="btn btn-sm" id="demoMid">Mid-game (L1–5)</button>' +
      '<button type="button" class="btn btn-sm" id="demoFull">Completed game</button></div>' +
      "<h3>Presentation</h3><div class='answer-row wrap'>" +
      '<button type="button" class="btn btn-sm" id="demoPresent">Toggle presentation mode</button>' +
      '<button type="button" class="btn btn-sm" id="demoTimer">Toggle timer</button>' +
      '<button type="button" class="btn btn-sm" id="demoScore">Toggle score</button></div>' +
      '<div class="hero-actions"><button type="button" class="btn btn-primary" data-close="1">Close panel</button></div>',
      "Instructor demo panel");
    function out(html) { $("demoOut").innerHTML = html; }
    function refresh() { updateHUD(); renderDemoLauncher(); openDemoPanel(); route(); }
    $("demoGo").addEventListener("click", function () {
      var target = parseInt($("demoJump").value, 10) || 1;
      if (!E.isUnlocked(target)) { E.unlockAll(); toast("Demo: unlocked all levels for the jump."); }
      location.hash = "#/level/" + target; closeModal();
    });
    $("demoReport").addEventListener("click", function () {
      for (var i = 1; i <= CFG.TOTAL_LEVELS; i++) if (!E.getState().completed[i]) E.forceComplete(i);
      updateHUD(); closeModal(); location.hash = "#/report";
      toast("Demo: all levels completed — report unlocked.");
    });
    $("demoUnlock").addEventListener("click", function () { E.unlockAll(); toast("Demo: all levels unlocked."); refresh(); });
    $("demoComplete").addEventListener("click", function () {
      if (!E.isUnlocked(id)) E.unlockAll();
      E.forceComplete(id); toast("Demo: Level " + id + " completed."); refresh();
    });
    $("demoReset").addEventListener("click", function () { closeModal(); askReset(); });
    $("demoAddHint").addEventListener("click", function () {
      if (!remaining.length) return;
      E.useHint(id, remaining[0]); toast("Demo: hint revealed."); refresh();
    });
    $("demoDropHint").addEventListener("click", function () {
      var used = [0, 1, 2].filter(function (i) { return (E.getState().hints[id] || [])[i]; });
      if (!used.length) { toast("Demo: no hints to remove."); return; }
      E.clearHint(id, used[used.length - 1]); toast("Demo: last hint removed (points restored)."); refresh();
    });
    $("demoSolution").addEventListener("click", function () {
      out("<p><strong>Level " + id + " expected solution:</strong></p><ul>" +
        solutionLines(L).map(function (l) { return "<li>" + E.esc(l) + "</li>"; }).join("") + "</ul>");
    });
    $("demoEvidence").addEventListener("click", function () {
      var e = D.getEvidence(L.reward);
      out("<p><strong>Expected evidence " + e.id + ":</strong> " + E.esc(e.name) + "<br /><span class='mono small'>" + E.esc(e.value) + "</span><br />" + E.esc(e.finalNote || "") + "</p>");
    });
    $("demoFresh").addEventListener("click", function () { E.demoSnapshot("fresh"); toast("Demo: fresh investigation."); closeModal(); location.hash = "#/briefing"; route(); });
    $("demoMid").addEventListener("click", function () { E.demoSnapshot("mid"); toast("Demo: mid-game state (L1–5 + notes + hint)."); closeModal(); location.hash = "#/tab/investigation"; route(); });
    $("demoFull").addEventListener("click", function () { E.demoSnapshot("complete"); toast("Demo: completed game."); closeModal(); location.hash = "#/report"; route(); });
    $("demoPresent").addEventListener("click", function () { settings.presentation = !settings.presentation; saveSettings(); toast("Presentation mode " + (settings.presentation ? "on." : "off.")); refresh(); });
    $("demoTimer").addEventListener("click", function () { settings.showTimer = !settings.showTimer; saveSettings(); refresh(); });
    $("demoScore").addEventListener("click", function () { settings.showScore = !settings.showScore; saveSettings(); refresh(); });
  }

  /* ---------- reset ---------- */
  function askReset() {
    openModal("<h3>Reset investigation?</h3><p>This erases score, evidence, notes, and unlocks on <strong>this browser</strong>. Type <strong>RESET</strong> to confirm.</p>" +
      '<label class="fld" for="resetBox"><span>Confirmation</span><input type="text" id="resetBox" autocomplete="off" placeholder="RESET" /></label>' +
      '<div class="hero-actions"><button type="button" class="btn btn-primary" id="btnDoReset">Erase everything</button><button type="button" class="btn" data-close="1">Cancel</button></div>');
    $("btnDoReset").addEventListener("click", function () {
      if ($("resetBox").value.trim() !== "RESET") { toast("Type RESET exactly to confirm."); return; }
      E.resetAll();
      closeModal();
      location.hash = "#/briefing";
      exitToLanding();
      toast("Investigation reset.");
    });
  }

  /* ---------- boot ---------- */
  function onVisibility() {
    // Background auto-pause never overrides an explicit manual pause:
    // the engine keeps both causes and reports their union as the state.
    E.setAutoPaused(document.hidden);
    tickClock();
  }
  function boot() {
    renderLanding();
    applySettings();
    document.querySelectorAll(".side-link").forEach(function (b) {
      b.addEventListener("click", function () { goTab(b.getAttribute("data-tab")); });
    });
    $("btnResetTop").addEventListener("click", askReset);
    // Skip link must focus the visible main without touching location.hash:
    // a raw "#view" hash fails route matching and would bounce the player
    // out of the current level to the dashboard.
    var sl = document.querySelector(".skip-link");
    if (sl) sl.addEventListener("click", function (ev) {
      ev.preventDefault();
      var target = (!$("layout").hidden && $("view")) || $("viewLanding");
      if (target) target.focus({ preventScroll: false });
    });
    var pb = $("hudPauseBtn");
    if (pb) pb.addEventListener("click", togglePause);
    window.addEventListener("hashchange", route);
    document.addEventListener("visibilitychange", onVisibility);
    if (E.isStarted() && location.hash && location.hash !== "") { enterApp(); }
    if (window.NS_STORAGE.wasRecovered()) {
      toast("Saved data was damaged, so the investigation was reset to a safe state.");
    }
    if (!window.NS_STORAGE.isAvailable()) {
      toast("Local saving is unavailable — progress lasts for this session only.");
    }
    updateHUD();
    tickClock();
    storageBanner();
  }
  document.addEventListener("DOMContentLoaded", boot);
})();
