// Every number that governs the memory-score model, in one place.
//
// A match is scored as the percentage of the match the player remembered, not
// as raw points. Each call below is worth its points toward both the earned and
// the maximum totals; a blank call earns nothing but its points stay in the
// maximum, so skipping a call caps your percentage. A call left out of both
// totals (voided) is one the data or a hint cannot answer.

// Points each call is worth (its maximum contribution to a match).
export const CALL_POINTS = {
  result: 1,
  scoreline: 2,
  totalGoals: 1,
  firstTeamToScore: 1,
  firstGoalscorer: 1,
  scorers: 1,
} as const;

// The maximum a fully-filled, fully-answerable match can be worth.
// 1 + 2 + 1 + 1 + 1 + 1 = 7.
export const TOTAL_CALL_POINTS =
  CALL_POINTS.result +
  CALL_POINTS.scoreline +
  CALL_POINTS.totalGoals +
  CALL_POINTS.firstTeamToScore +
  CALL_POINTS.firstGoalscorer +
  CALL_POINTS.scorers;

// Percentage points deducted by each hint, floored at the minimum below.
export const HINT_SCORE_PENALTIES = {
  goalCount: 3,
  spotlight: 2,
  firstTeam: 2,
} as const;

// Internal precision for fractional Scorers credit.
export const SCORER_CREDIT_DECIMAL_PLACES = 6;

// A match score is clamped to this range after rounding and hint deductions.
export const MATCH_SCORE_MIN = 0;
export const MATCH_SCORE_MAX = 100;

// Differences within this margin count as level with the prior average.
export const CAREER_AVERAGE_TOLERANCE = 0.05;

// A "flawless" read is this percentage or higher.
export const FLAWLESS_THRESHOLD = 90;

// Stored history is re-scored once under this version. Bump it whenever the
// rules above change in a way that needs old matches recalculated.
export const SCORING_VERSION = 'memory-v4';
