// Badge ("stamp") definitions and evaluation for Hindsight.
//
// Badges are derived from the completed-fixture history kept under
// `hindsight.predictions`. Earned ids are cached under `hindsight.badges` so the
// reveal can announce only the stamps that are new, and so The Stamp Book can
// ink them without recomputing the whole archive.
//
// Nothing here touches scoring: percentages, result flags and per-pick detail
// are read from the evaluation the scoring engine already produced.

import { CAREER_AVERAGE_TOLERANCE, FLAWLESS_THRESHOLD } from './scoringConfig.ts';

export type BadgeGroup = 'Skill' | 'Streaks' | 'Nostalgia' | 'Play style';

export type BadgeId =
  | 'bullseye'
  | 'sharpshooter'
  | 'brace-yourself'
  | 'clean-sweep'
  | 'flawless-read'
  | 'perfect-memory'
  | 'perfect-with-hint'
  | 'super-sub'
  | 'hat-trick-hero'
  | 'both-ends'
  | 'first-in-line'
  | 'golden-boot-scout'
  | 'on-the-nose'
  | 'hot-hand'
  | 'hat-trick'
  | 'comeback-kid'
  | 'time-traveller'
  | 'derby-day'
  | 'deep-cut'
  | 'no-hints-needed'
  | 'against-the-grain'
  | 'century-club'
  | 'late-show'
  | 'north-london-derby'
  | 'unbeaten-run'
  | 'continental-tour'
  | 'goal-fest';

export type BadgeDefinition = {
  id: BadgeId;
  name: string;
  rule: string;
  group: BadgeGroup;
};

export const BADGES: BadgeDefinition[] = [
  { id: 'bullseye', name: 'Bullseye', group: 'Skill', rule: 'Exact scoreline.' },
  { id: 'sharpshooter', name: 'Sharpshooter', group: 'Skill', rule: 'Correct first goalscorer.' },
  { id: 'brace-yourself', name: 'Brace Yourself', group: 'Skill', rule: 'You correctly predicted at least two goals for a player who scored two or more.' },
  { id: 'clean-sweep', name: 'Clean Sweep', group: 'Skill', rule: 'Right result, exact scoreline and at least one right scorer.' },
  { id: 'flawless-read', name: 'Flawless Read', group: 'Skill', rule: `A fixture rating of ${FLAWLESS_THRESHOLD}% or higher.` },
  { id: 'perfect-memory', name: 'Perfect Memory', group: 'Skill', rule: 'Every answerable call right, with no hints.' },
  { id: 'perfect-with-hint', name: 'Perfect with a Hint', group: 'Skill', rule: 'Every answerable call right after using at least one hint, before the hint deduction.' },
  { id: 'super-sub', name: 'Super Sub', group: 'Skill', rule: 'Correctly predict a substitute to score.' },
  { id: 'hat-trick-hero', name: 'Hat-Trick Hero', group: 'Skill', rule: 'Correctly predict at least three goals for a player who scores three or more.' },
  { id: 'both-ends', name: 'Both Ends', group: 'Skill', rule: 'Correctly predict a scorer for each team in the same match.' },
  { id: 'first-in-line', name: 'First in Line', group: 'Skill', rule: 'Correctly predict the first team to score and the first player to score.' },
  { id: 'golden-boot-scout', name: 'Golden Boot Scout', group: 'Skill', rule: 'Correctly predict three different scorers in one match.' },
  { id: 'on-the-nose', name: 'On the Nose', group: 'Skill', rule: 'Predict the exact scoreline of a draw.' },
  { id: 'late-show', name: 'Late Show', group: 'Skill', rule: 'Correctly pick a scorer who scored in the 80th minute or later.' },
  { id: 'goal-fest', name: 'Goal Fest', group: 'Skill', rule: 'Correctly predict the total goals in a match with five or more goals.' },
  { id: 'hot-hand', name: 'Hot Hand', group: 'Streaks', rule: 'Right result on five fixtures in a row.' },
  { id: 'hat-trick', name: 'Hat-Trick', group: 'Streaks', rule: 'Beat your own average three fixtures in a row.' },
  { id: 'comeback-kid', name: 'Comeback Kid', group: 'Streaks', rule: 'Beat your average right after a below-average fixture.' },
  { id: 'unbeaten-run', name: 'Unbeaten Run', group: 'Streaks', rule: 'Score at least 50% in five consecutive fixtures.' },
  { id: 'time-traveller', name: 'Time Traveller', group: 'Nostalgia', rule: 'Fixtures from ten different seasons.' },
  { id: 'derby-day', name: 'Derby Day', group: 'Nostalgia', rule: 'Ten fixtures where both teams are big clubs.' },
  { id: 'north-london-derby', name: 'North London Derby', group: 'Nostalgia', rule: 'Correctly call the result of an Arsenal v Tottenham match.' },
  { id: 'continental-tour', name: 'Continental Tour', group: 'Nostalgia', rule: 'Complete fixtures from five different competitions.' },
  { id: 'deep-cut', name: 'Deep Cut', group: 'Play style', rule: 'Above your average with neither team a big club.' },
  { id: 'no-hints-needed', name: 'No Hints Needed', group: 'Play style', rule: 'Ten fixtures finished without using a hint.' },
  { id: 'against-the-grain', name: 'Against the Grain', group: 'Play style', rule: 'Right result where the weaker side won.' },
  { id: 'century-club', name: 'Century Club', group: 'Play style', rule: 'Complete 100 scored fixtures.' },
];

export const BADGE_GROUPS: BadgeGroup[] = ['Skill', 'Streaks', 'Nostalgia', 'Play style'];

export function getBadge(id: BadgeId): BadgeDefinition | undefined {
  return BADGES.find((badge) => badge.id === id);
}

// ---------------------------------------------------------------------------
// Storage — `hindsight.badges` is a JSON array of earned badge ids.
// ---------------------------------------------------------------------------

export const BADGES_KEY = 'hindsight.badges';

export function readStoredBadges(): BadgeId[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(BADGES_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    const known = new Set(BADGES.map((badge) => badge.id));
    return parsed.filter((id): id is BadgeId => typeof id === 'string' && known.has(id as BadgeId));
  } catch {
    return [];
  }
}

export function writeStoredBadges(ids: BadgeId[]): void {
  try {
    localStorage.setItem(BADGES_KEY, JSON.stringify([...new Set(ids)]));
  } catch {
    /* Storage can be unavailable; badges are non-critical. */
  }
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

// Loose structural view of a stored history entry. Real entries carry far more;
// every field here is optional so old snapshots stay harmless.
export type BadgeHistoryItem = {
  fixtureId?: number;
  hintsUsed?: string[];
  fixtureSnapshot?: {
    game_date?: string;
    tier?: 'A' | 'B' | 'C';
    season_year?: number | null;
    home_team?: string;
    away_team?: string;
    competition?: string;
    homeIsBigClub?: boolean;
    awayIsBigClub?: boolean;
    home_subs?: Array<{ id: number }>;
    away_subs?: Array<{ id: number }>;
  } | null;
  result?: {
    homeGoals: number;
    awayGoals: number;
    goals: Array<{ playerId: number | null; team: 'home' | 'away'; minute?: number | null; ownGoal?: boolean }>;
  } | null;
evaluation?: {
    percentage?: number;
    earned?: number;
    maximum?: number;
    hintsUsed?: string[];
    calls?: Array<{ id: string; status: string }>;
    correctResult?: boolean;
    exactScoreline?: boolean;
    goalscorerPoints?: Array<{ playerId: number; actual: number; matched: number }>;
    firstGoalscorerDetail?: { predicted: number | 'none' | null; actual: number | 'none' | null; points: number } | null;
  } | null;
};

export type Performance = 'above' | 'below' | 'level' | 'baseline';

// Running "beat your own average" flag for each played fixture, in order.
export function sequencePerformance(items: BadgeHistoryItem[]): Performance[] {
  const percentages: number[] = [];
  const performance: Performance[] = [];

  for (const item of items) {
    const pct = item.evaluation?.percentage;
    if (typeof pct !== 'number') {
      performance.push('baseline');
      continue;
    }
    if (percentages.length === 0) {
      performance.push('baseline');
    } else {
      const average = percentages.reduce((sum, value) => sum + value, 0) / percentages.length;
      const diff = pct - average;
      performance.push(diff > CAREER_AVERAGE_TOLERANCE ? 'above' : diff < -CAREER_AVERAGE_TOLERANCE ? 'below' : 'level');
    }
    percentages.push(pct);
  }

  return performance;
}

// Prefer the archive's own season_year; fall back to the fixture date
// (July-to-June season window) for snapshots locked before it was sent.
function seasonKey(item: BadgeHistoryItem): string | null {
  const snapshot = item.fixtureSnapshot;
  if (!snapshot) return null;
  if (typeof snapshot.season_year === 'number') return `y${snapshot.season_year}`;
  if (snapshot.game_date) {
    const date = new Date(`${snapshot.game_date}T12:00:00Z`);
    if (!Number.isNaN(date.getTime())) {
      const year = date.getUTCFullYear();
      const month = date.getUTCMonth(); // 0 = January
      return `y${month >= 6 ? year : year - 1}`;
    }
  }
  return null;
}

// Weaker side by big-club list: only defined when exactly one side is a big club.
function weakerSideWon(item: BadgeHistoryItem): boolean {
  const snapshot = item.fixtureSnapshot;
  const result = item.result;
  if (!snapshot || !result) return false;
  const home = snapshot.homeIsBigClub;
  const away = snapshot.awayIsBigClub;
  if (typeof home !== 'boolean' || typeof away !== 'boolean') return false;
  if (home === away) return false;

  const winner: 'home' | 'away' | null = result.homeGoals > result.awayGoals
    ? 'home'
    : result.awayGoals > result.homeGoals ? 'away' : null;
  if (!winner) return false;

  const weaker: 'home' | 'away' = home ? 'away' : 'home';
  return winner === weaker;
}

function addNewMatchBadges(item: BadgeHistoryItem, earned: Set<BadgeId>): void {
  const evaluation = item.evaluation;
  if (!evaluation) return;
  const matchedScorers = new Set(
    (evaluation.goalscorerPoints || []).filter((pick) => pick.matched > 0).map((pick) => pick.playerId),
  );
  if (item.result?.goals?.some((goal) =>
    !goal.ownGoal && goal.playerId !== null && matchedScorers.has(goal.playerId)
    && typeof goal.minute === 'number' && goal.minute >= 80
  )) earned.add('late-show');

  const home = item.fixtureSnapshot?.home_team?.trim().toLowerCase();
  const away = item.fixtureSnapshot?.away_team?.trim().toLowerCase();
  const isArsenal = (name: string | undefined) => name === 'arsenal fc' || name === 'arsenal';
  const isTottenham = (name: string | undefined) => name === 'tottenham hotspur' || name === 'tottenham';
  if (evaluation.correctResult && ((isArsenal(home) && isTottenham(away)) || (isTottenham(home) && isArsenal(away)))) {
    earned.add('north-london-derby');
  }
  if (item.result && item.result.homeGoals + item.result.awayGoals >= 5
    && evaluation.calls?.some((call) => call.id === 'totalGoals' && call.status === 'earned')) {
    earned.add('goal-fest');
  }
}

export function evaluateEarnedBadges(history: BadgeHistoryItem[]): BadgeId[] {
  const items = (Array.isArray(history) ? history : []).filter(
    (item): item is BadgeHistoryItem =>
      !!item && !!item.evaluation && typeof item.evaluation.percentage === 'number'
  );
  const performance = sequencePerformance(items);
  const earned = new Set<BadgeId>();
  if (items.length >= 100) earned.add('century-club');

  // --- Skill: per-fixture reads ---
  for (const item of items) {
    addNewMatchBadges(item, earned);
    const evaluation = item.evaluation!;
    const picks = evaluation.goalscorerPoints || [];
    const firstGoalscorerDetail = evaluation.firstGoalscorerDetail;

    if (evaluation.exactScoreline) earned.add('bullseye');
    if (evaluation.exactScoreline && evaluation.correctResult && item.result?.homeGoals === item.result?.awayGoals) {
      earned.add('on-the-nose');
    }
    if (firstGoalscorerDetail
      && firstGoalscorerDetail.points > 0
      && typeof firstGoalscorerDetail.predicted === 'number'
      && typeof firstGoalscorerDetail.actual === 'number') {
      earned.add('sharpshooter');
    }
    const firstTeamCall = evaluation.calls?.find((call) => call.id === 'firstTeamToScore');
    if (firstTeamCall?.status === 'earned'
      && firstGoalscorerDetail
      && firstGoalscorerDetail.points > 0
      && typeof firstGoalscorerDetail.predicted === 'number'
      && typeof firstGoalscorerDetail.actual === 'number') {
      earned.add('first-in-line');
    }
    if (picks.some((pick) => (pick.actual ?? 0) >= 2 && (pick.matched ?? 0) >= 2)) earned.add('brace-yourself');
    if (picks.some((pick) => (pick.actual ?? 0) >= 3 && (pick.matched ?? 0) >= 3)) earned.add('hat-trick-hero');
    const substituteIds = new Set([
      ...(item.fixtureSnapshot?.home_subs || []),
      ...(item.fixtureSnapshot?.away_subs || []),
    ].map((player) => player.id));
    if (picks.some((pick) => substituteIds.has(pick.playerId) && (pick.matched ?? 0) > 0)) {
      earned.add('super-sub');
    }
    const correctlyPredictedScorers = new Set(
      picks.filter((pick) => (pick.matched ?? 0) > 0).map((pick) => pick.playerId),
    );
    if (correctlyPredictedScorers.size >= 3) earned.add('golden-boot-scout');
    const predictedScoringTeams = new Set(
      (item.result?.goals || [])
        .filter((goal) => !goal.ownGoal && goal.playerId !== null && correctlyPredictedScorers.has(goal.playerId))
        .map((goal) => goal.team),
    );
    if (predictedScoringTeams.has('home') && predictedScoringTeams.has('away')) earned.add('both-ends');
    if (evaluation.correctResult && evaluation.exactScoreline && picks.some((pick) => (pick.matched ?? 0) > 0)) {
      earned.add('clean-sweep');
    }
    if ((evaluation.percentage ?? 0) >= FLAWLESS_THRESHOLD) earned.add('flawless-read');
    const perfectAnswerableCalls = typeof evaluation.maximum === 'number'
      && evaluation.maximum > 0
      && typeof evaluation.earned === 'number'
      && evaluation.earned === evaluation.maximum;
    if (perfectAnswerableCalls && (evaluation.hintsUsed || item.hintsUsed || []).length === 0) {
      earned.add('perfect-memory');
    }
    if (perfectAnswerableCalls && (evaluation.hintsUsed || item.hintsUsed || []).length > 0) {
      earned.add('perfect-with-hint');
    }
  }

  // --- Streaks & runs ---
  let resultRun = 0;
  let aboveRun = 0;
  let unbeatenRun = 0;
  let hintFreeFinishes = 0;
  items.forEach((item, index) => {
    resultRun = item.evaluation!.correctResult ? resultRun + 1 : 0;
    if (resultRun >= 5) earned.add('hot-hand');
    unbeatenRun = item.evaluation!.percentage! >= 50 ? unbeatenRun + 1 : 0;
    if (unbeatenRun >= 5) earned.add('unbeaten-run');

    aboveRun = performance[index] === 'above' ? aboveRun + 1 : 0;
    if (aboveRun >= 3) earned.add('hat-trick');

    if ((item.hintsUsed || []).length === 0) hintFreeFinishes += 1;
    if (hintFreeFinishes >= 10) earned.add('no-hints-needed');

    if (index > 0 && performance[index - 1] === 'below' && performance[index] === 'above') {
      earned.add('comeback-kid');
    }
  });

  // --- Nostalgia: archive spread ---
  const seasons = new Set<string>();
  const competitions = new Set<string>();
  let bothBigClubs = 0;
  for (const item of items) {
    const key = seasonKey(item);
    if (key) seasons.add(key);
    const competition = item.fixtureSnapshot?.competition?.trim().toLowerCase();
    if (competition) competitions.add(competition);
    if (item.fixtureSnapshot?.tier === 'A') bothBigClubs += 1;
  }
  if (seasons.size >= 10) earned.add('time-traveller');
  if (competitions.size >= 5) earned.add('continental-tour');
  if (bothBigClubs >= 10) earned.add('derby-day');

  // --- Play style ---
  items.forEach((item, index) => {
    if (item.fixtureSnapshot?.tier === 'C' && performance[index] === 'above') earned.add('deep-cut');
    if (item.evaluation!.correctResult && weakerSideWon(item)) earned.add('against-the-grain');
  });

  // Stable display order.
  return BADGES.map((badge) => badge.id).filter((id) => earned.has(id));
}

// The absolute (non-relative) badges a single completed fixture qualifies for.
// Used by the Record Book to ink the stamps that belong to each match without
// re-inking the whole book. Relative badges (deep-cut, hot-hand, comeback-kid,
// no-hints-needed, time-traveller, derby-day) are archive-wide by nature and are
// intentionally left out — they belong on the summary, not on one fixture.
export function badgesForItem(item: BadgeHistoryItem): BadgeId[] {
  const evaluation = item.evaluation;
  if (!evaluation || typeof evaluation.percentage !== 'number') return [];

  const picks = evaluation.goalscorerPoints || [];
  const firstGoalscorerDetail = evaluation.firstGoalscorerDetail;
  const earned = new Set<BadgeId>();
  addNewMatchBadges(item, earned);

  if (evaluation.exactScoreline) earned.add('bullseye');
  if (evaluation.exactScoreline && evaluation.correctResult
    && item.result?.homeGoals === item.result?.awayGoals) {
    earned.add('on-the-nose');
  }
  if (firstGoalscorerDetail
    && firstGoalscorerDetail.points > 0
    && typeof firstGoalscorerDetail.predicted === 'number'
    && typeof firstGoalscorerDetail.actual === 'number') {
    earned.add('sharpshooter');
  }
  const firstTeamCall = evaluation.calls?.find((call) => call.id === 'firstTeamToScore');
  if (firstTeamCall?.status === 'earned'
    && firstGoalscorerDetail
    && firstGoalscorerDetail.points > 0
    && typeof firstGoalscorerDetail.predicted === 'number'
    && typeof firstGoalscorerDetail.actual === 'number') {
    earned.add('first-in-line');
  }
  if (picks.some((pick) => (pick.actual ?? 0) >= 2 && (pick.matched ?? 0) >= 2)) earned.add('brace-yourself');
  if (picks.some((pick) => (pick.actual ?? 0) >= 3 && (pick.matched ?? 0) >= 3)) earned.add('hat-trick-hero');
  const substituteIds = new Set([
    ...(item.fixtureSnapshot?.home_subs || []),
    ...(item.fixtureSnapshot?.away_subs || []),
  ].map((player) => player.id));
  if (picks.some((pick) => substituteIds.has(pick.playerId) && (pick.matched ?? 0) > 0)) {
    earned.add('super-sub');
  }
  const correctlyPredictedScorers = new Set(
    picks.filter((pick) => (pick.matched ?? 0) > 0).map((pick) => pick.playerId),
  );
  if (correctlyPredictedScorers.size >= 3) earned.add('golden-boot-scout');
  const predictedScoringTeams = new Set(
    (item.result?.goals || [])
      .filter((goal) => !goal.ownGoal && goal.playerId !== null && correctlyPredictedScorers.has(goal.playerId))
      .map((goal) => goal.team),
  );
  if (predictedScoringTeams.has('home') && predictedScoringTeams.has('away')) earned.add('both-ends');
  if (evaluation.correctResult && evaluation.exactScoreline
    && picks.some((pick) => (pick.matched ?? 0) > 0)) {
    earned.add('clean-sweep');
  }
  if ((evaluation.percentage ?? 0) >= FLAWLESS_THRESHOLD) earned.add('flawless-read');
  const perfectAnswerableCalls = typeof evaluation.maximum === 'number'
    && evaluation.maximum > 0
    && typeof evaluation.earned === 'number'
    && evaluation.earned === evaluation.maximum;
  if (perfectAnswerableCalls && (evaluation.hintsUsed || item.hintsUsed || []).length === 0) {
    earned.add('perfect-memory');
  }
  if (perfectAnswerableCalls && (evaluation.hintsUsed || item.hintsUsed || []).length > 0) {
    earned.add('perfect-with-hint');
  }

  return BADGES.map((badge) => badge.id).filter((id) => earned.has(id));
}

// Merge newly evaluated badges into the stored set. Returns the ids that were
// not previously stored (i.e. the stamps to announce).
export function syncEarnedBadges(history: BadgeHistoryItem[]): BadgeId[] {
  const earnedNow = evaluateEarnedBadges(history);
  const stored = readStoredBadges();
  const storedSet = new Set(stored);
  const fresh = earnedNow.filter((id) => !storedSet.has(id));
  if (fresh.length > 0 || earnedNow.length !== stored.length) {
    writeStoredBadges([...stored, ...earnedNow]);
  }
  return fresh;
}
