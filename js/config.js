/* Central tunable game configuration. Edit values here to rebalance scoring. */
window.NS_CONFIG = {
  STORAGE_KEY: "northstar_escape_v1",
  SETTINGS_KEY: "northstar_settings_v1",
  TOTAL_LEVELS: 11,
  // Instructor/demo mode: local-only panel for classroom demonstration.
  // Normal players never see it. No backend, no login — just set true,
  // reload, and use the amber "Instructor demo" button (bottom-left).
  // See README "DEMO MODE" for the full walkthrough.
  DEMO_MODE: false,
  scoring: {
    basePerLevel: 100,
    wrongAttemptPenalty: 10,
    hintPenalties: [10, 15, 20], // hint 1, 2, 3
    // Speed bonus by seconds spent on the level (from first open to solve)
    speedBonus: [
      { withinSeconds: 120, bonus: 25 },
      { withinSeconds: 300, bonus: 15 },
      { withinSeconds: 600, bonus: 5 }
    ],
    maxPerLevelForRating: 125 // base 100 + max speed bonus 25
  },
  ratings: [
    { minPct: 90, label: "EXPERT INVESTIGATOR" },
    { minPct: 75, label: "ADVANCED INVESTIGATOR" },
    { minPct: 60, label: "COMPETENT INVESTIGATOR" },
    { minPct: 40, label: "DEVELOPING INVESTIGATOR" },
    { minPct: 0,  label: "ROOKIE INVESTIGATOR" }
  ]
};
