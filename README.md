# Northstar Systems — Cyber Incident Escape Room

## PROJECT OVERVIEW

A complete, fully playable **11-level educational cybersecurity escape room**, presented as one connected incident investigation at the fictional **Northstar Systems** technology company. Built as an NJCCIC-style internship project: defensive skills only, 100% fictional data, local-first, zero dependencies, no backend.

The player joins the night-shift investigation team and works a single breach from first intercept to final verdict: decode the message, rank the risky identity, triage the phish, hunt C2 traffic in a simulated capture, extract a hidden image message, annotate a pretexting attempt, dissect a prompt injection, rebuild the forensic timeline, attribute via responsible OSINT, geolocate the staging site, and close the case in a static malware-analysis lab that reuses evidence from earlier levels.

> **Deployment:** this game is served by GitHub Pages from the repository root (`index.html`, `css/`, `js/` all at top level) at <https://samarth426.github.io/Northstarescaperoom/>. Every path is relative, so the same files also work from any subfolder or a plain local server.

## EDUCATIONAL OBJECTIVES

| Level | Topic | Core takeaway |
|---|---|---|
| 1 | Caesar cipher, frequency analysis | Encryption ≠ hashing; classical ciphers fall to statistics |
| 2 | Authentication & MFA | Privilege × exposure; least privilege, unique vaulted secrets |
| 3 | Phishing triage (defensive) | Lookalike domains, urgency, attachments, verify via known-good channels |
| 4 | Traffic analysis | Baselines; size/timing/destination anomalies; DNS tunneling |
| 5 | Steganography | Metadata → channel inspection → controlled extraction, hash discipline |
| 6 | Social engineering defense | Pretexting tells; verify identity; never share passwords/MFA codes |
| 7 | Prompt injection | Instruction hierarchy; untrusted content is data; human approval gates |
| 8 | Digital forensics | Correlate identity/endpoint/proxy/DNS/flow; causality over assumption |
| 9 | Responsible OSINT | Convergent attribution from published sources only; no contact/intrusion |
| 10 | GEOINT | Corroborate signage/terrain/shadows/metadata; quantify uncertainty |
| 11 | Static malware triage | IOC extraction, persistence ID, contain across host/network/identity/evidence |

Every level shows **Learning Objectives** up front and a four-part **Debrief** after solving (what you found, why it matters, skill practiced, connection to the investigation). A compact **Glossary** (Help → Glossary) defines all 17 concepts in one line each.

## GAMEPLAY

Briefing → investigate each workstation → submit findings → bank evidence → unlock the next level. Wrong attempts cost 10 pts; hints cost 10 / 15 / 20; fast clean solves earn up to +25. Penalties apply instantly: the header score is live (banked points plus the current level's live projection — the open level, or the next mission on the dashboard), every wrong submit or hint shows an old → new receipt, repeat clicks on one submission count once, and re-clicking a used hint is never re-charged. A full per-level breakdown lives on the dashboard under Investigation status. The mission clock pauses while the tab is hidden. Evidence auto-files into the **Evidence Locker**, whose chain view shows how each item links (shared tags) and fed the finale. Notes support level tags, search, edit, and clear-all. Solving Level 11 unlocks the **Final Incident Report**: mission status, summary, initial access, attack path, IOCs, timeline, root cause, impact, containment, defensive actions, evidence-used table, and player performance.

## LEVEL OVERVIEW

1. **The Intercepted Message** (Easy) — Caesar shift-7 intercept naming GRAYFALCON and M. Reyes.
2. **Weakest Link** (Easy) — identity audit; m.reyes (no MFA, reused password, domain admin, anomalous login).
3. **The Hook** (Easy/Medium) — simulated inbox; E3 lookalike-domain phish with macro attachment + harvest link.
4. **Noise in the Wires** (Medium) — 14-packet capture; 10.4.18.22 ⇄ 185.220.101.47 via DNS tunneling/HTTPS exfil/beacons.
5. **The Photograph** (Medium) — canvas image lab; extract FALCON NEST 7 (blue channel, offset 7).
6. **Friendly Voices** (Medium) — annotate pretexting chat; classify the technique.
7. **The Helpful Machine** (Hard) — deterministic mock-AI; find the override injection, pick the hierarchy fix.
8. **Reconstruct the Night** (Hard) — order 6 attacker events, exclude 2 distractors.
9. **Paper Trail** (Hard) — fictional OSINT; attribute grayfalcon_builds = D. Kessler + WHOIS domain.
10. **Where the Falcon Nests** (Hard) — GEOINT board; Pier 7, Halcyon Bay (41.0821, −73.7902).
11. **The Sandbox Verdict** (Impossible) — static report on northstar_update.exe; verdict fuses EV-03→EV-10 plus containment order.

## ARCHITECTURE

```
northstar-escape/
  index.html        # app shell (HUD, sidenav, views, modal/demo/toast roots)
  css/styles.css    # SOC-dashboard theme, responsive, accessible
  js/config.js      # scoring/ratings/storage keys + DEMO_MODE flag
  js/storage.js     # SOLE persistence gateway: game state, settings,
                    #   availability probe, sanitize + backup recovery
  js/data.js        # ALL content: story, artifacts, hints, answers,
                    #   explanations, objectives, debriefs, evidence,
                    #   glossary, safety, tag-derived evidence graph
  js/engine.js      # rules: progress, scoring, validation, notes, timer
                    #   pause, settings passthrough, demo helpers
  js/levels.js      # 11 interactive workstation renderers
  js/app.js         # shell: routing, HUD, dashboard, map, locker chain,
                    #   notes UI, help/safety/glossary, demo panel,
                    #   presentation mode, enhanced report
  README.md
```

- **Content vs engine split:** each level declares `{ id, title, difficulty, story, objectives, learningObjectives, briefing, artifacts…, hints[3], validation, explanation{found,why,learned}, debrief{skill,connection}, reward }`. The engine never hardcodes answers.
- **Validation types:** `text`, `account`, `phish`, `multipart`, `annotate`, `injection`, `ordered`, `osint`, `geoint`, `final`.
- **State shape** (`northstar_escape_v1`): `{ operative, startedAt, pausedMs, maxUnlocked, completed{id:{score,attempts,hintsUsed,timeSeconds}}, attempts, hints, levelOpenedAt, evidence[], notes[{id,text,createdAt,level,source}], finished }`.

## SECURITY / SAFETY MODEL

- Fictional everything; in-website **Safety & Ethics** page (Help → Safety & ethics) plus fiction disclaimers on the landing page.
- Dangerous topics replaced with local simulation: canned 14-packet capture (no sniffing), procedural canvas pixels (no real stego payload), deterministic regex-based mock assistant (no API/model), static report text (no sample, no execution, nothing downloadable).
- No `eval`, no `innerHTML` from user input (all user content escaped via `NS_ENGINE.esc`), no external requests, no secrets, no credential collection.
- Corrupt saves are sanitized field-by-field with a backup-copy fallback; the app never crashes on bad data and offers a fresh start.

## DEVELOPMENT & SAFETY

This project teaches **defensive reasoning with controlled simulations rather than real attack infrastructure**. There is no port scanning, exploitation, malware execution, credential theft, or contact with real systems or people. Every artifact an analyst touches — packets, pixels, chat logs, forensic records, WHOIS data, malware reports — is authored training fiction rendered locally in the browser.

## AI-ASSISTED DEVELOPMENT DISCLOSURE

Generative AI was used during this project as a development assistant for:

- **Brainstorming** — level concepts, story structure, and scoring ideas.
- **Software development assistance** — drafting code, markup, and styles from the developer's specifications.
- **Debugging** — diagnosing build/runtime issues and test failures.
- **Code review** — spotting consistency, accessibility, and safety issues.
- **Usability review** — feedback wording, layout clarity, and mobile behavior.

The AI did not independently create or verify this project. The final cybersecurity content, puzzle logic, safety controls, simulation boundaries, and implementation were **reviewed, tested, and approved by the developer**, including automated assertion suites and real headless-browser playthroughs of all 11 levels (see TESTING).

## DEMO MODE (instructor, local-only)

No backend, no login. Enable in `js/config.js`:

```js
DEMO_MODE: true   // reload the page afterwards; default is false
```

An amber **⬣ Instructor demo (local)** button appears bottom-left (in-app only, never on the landing page). The panel — visually separated with dashed amber styling — offers:

- Jump to any level / jump to the final report (auto-completes prerequisites via the real scoring path)
- Unlock all levels · complete current level · reset game (typed-`RESET` confirm)
- Reveal / un-reveal hints for the current level (points adjust accordingly)
- View the expected solution and expected evidence for the current level (derived from level data)
- One-click demo states built from **real game content**: Fresh start, Mid-game (L1–5 + sample notes + hint), Completed game
- Presentation-mode, timer, and score toggles

## PRESENTATION MODE

Optimized for projectors and classroom demos — a mode, not a separate site. Enable from Help → Player guide → Display, or from the demo panel. It enlarges text, hides the sidebar and header actions, focuses the investigation workspace, and adds quick level navigation (prev / jump / next) to every level. Timer and score visibility are independently toggleable.

## LOCAL STORAGE

- Game state persists under `northstar_escape_v1` on every mutation; UI settings (timer/score/presentation) under `northstar_settings_v1`. Refresh keeps your place (hash routes: `#/tab/map`, `#/level/4`, `#/report`).
- If storage is unavailable, a banner warns and the game continues in memory for the session.
- If a save is corrupt, it is sanitized field-by-field (bad fields dropped, good ones kept), falling back to a backup copy, then to a fresh state — with a "repaired" notice and a start-fresh option.

## TESTING

- `node --check` on all six JS files.
- Node harness (logic + new features): full 11-level playthrough, scoring math, hint/attempt penalties, evidence chain EV-01→EV-11, lock/unlock, ratings, notes add/edit/search/clear, save/load round-trip, **sanitize + backup recovery**, **demo snapshots**, **level-config validation**, **evidence-graph links**, glossary/safety/objectives presence. Must remain green.
- Headless-browser (Edge + CDP) playthrough: landing → all 11 real-DOM solves → wrong-answer + hint handling → evidence chain → notes → reload persistence → reset; plus demo-mode panel actions and mobile-viewport smoke checks. Zero console/page errors required.
- Manual checklist before demos: keyboard-only solve of Level 2, Escape-closes-dialog, 390px pass over packet table / mail / report, Safety & Glossary tabs, presentation mode on a projector-size window.

## ACCESSIBILITY

Keyboard-operable throughout (Tab/Enter/Space; Escape closes dialogs; simple focus trap + focus return in modals); visible focus rings; labeled controls; `role=alert` failure messages that never reveal solutions; aria-live toasts; 44px touch targets on coarse pointers; reduced-motion support (success animation disabled); semantic headings; color never the sole signal (status pills carry text).

## KNOWN LIMITATIONS

- Per-level speed bonuses intentionally use wall-clock dwell (pauses excluded only from the displayed mission clock) — documented, scoring unchanged.
- No accounts/sync — progress is per-browser via localStorage.
- Simulations are authored classroom fiction, not real tooling output.
- Demo mode is gated by a config constant, not authentication — it is for local classroom use only.

## HOW TO CUSTOMIZE A LEVEL

Edit its object in `js/data.js`: story, objectives, `learningObjectives`, hints, `accepted` answers, `explanation`, `debrief`, evidence `value`/`finalNote`. If you change an answer that later levels reuse (domain, IPs, FALCON NEST 7, coordinates), update the matching `accepted` entries and the finale fields in Level 11 the same way. No engine changes needed. Validate with `NS_ENGINE.validateLevel(NS_DATA.getLevel(n))` in the console.

## HOW TO ADD A NEW LEVEL

1. Append a level object in `js/data.js` (copy Level 1's shape; keep 3 hints, explanation, reward evidence, objectives, debrief).
2. Add its evidence entry to `EVIDENCE` (with tags + `finalNote`).
3. Add a renderer `N: function (ws, L, api)` in `js/levels.js` calling `api.fail(msg)` / `api.solve()`.
4. Bump `TOTAL_LEVELS` in `js/config.js`. HUD, map, ratings, locker, and report adapt automatically.

## HOW TO RUN LOCALLY

```bash
cd northstar-escape
# option A: just open it
start index.html            # Windows
open index.html             # macOS
# option B: serve locally
python -m http.server 8080  # then http://localhost:8080/
```

No `npm install`, no build, no backend.

## DEPLOYMENT (GITHUB PAGES)

- **Live site:** <https://samarth426.github.io/Northstarescaperoom/> (GitHub Pages, branch `main`, folder `/`).
- The repository stores `index.html`, `css/`, `js/`, and `README.md` at the **repo root** so the project-page URL serves the game directly. A `.nojekyll` file disables Jekyll processing.
- All asset references are relative (`css/styles.css`, `js/*.js`) and there are no external requests, so the site works identically under any base path (project page subpath included).
- To publish changes: copy the contents of `northstar-escape/` to the repository root, commit, and push to `main`; Pages rebuilds automatically.
