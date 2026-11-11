// Memory-score engine.
//
// A match is scored as the percentage of it the player remembered. Each call
// is worth points toward both the earned and the maximum totals; a blank call
// earns nothing but its points stay in the maximum, so skipping a call caps
// your percentage. A call is left out of both totals (voided) when the data
// cannot answer it, when it is Scorers in a 0-0, or when a hint gave it away.
// There are no negative points anywhere.

import {
  CALL_POINTS,
  HINT_SCORE_PENALTIES,
  MATCH_SCORE_MIN,
  MATCH_SCORE_MAX,
  CAREER_AVERAGE_TOLERANCE,
  SCORER_CREDIT_DECIMAL_PLACES,
  SCORING_VERSION,
} from './scoringConfig.ts';

export type Result = 'home' | 'draw' | 'away';
export type FirstTeam = 'home' | 'away' | 'none';
export type FirstScorer = number | 'none';
export type HintKind = 'goalCount' | 'spotlight' | 'firstTeam';
export type CallStatus = 'earned' | 'missed' | 'blank' | 'voided';
export type CallId =
  | 'result'
  | 'scoreline'
  | 'totalGoals'
  | 'firstTeamToScore'
  | 'firstGoalscorer'
  | 'scorers';

// One prediction set. Every field is optional. `resultCall` is the explicit
// W/D/L call; a scoreline fills it in automatically when it is absent.
export type LockedPrediction = {
  fixtureId?: number;
  lockedAt?: string;
  resultCall?: Result | null;
  homeScore?: number | null;
  awayScore?: number | null;
  goalscorerIds?: number[];
  totalGoals?: number | null;
  firstTeamToScore?: FirstTeam | null;
  firstGoalscorerId?: FirstScorer | null;
  hintsUsed?: HintKind[];
  hintSpotlightPlayerId?: number | null;
  hintFirstTeam?: FirstTeam | null;
  fixtureSnapshot?: unknown;
};

export type RevealedGoal = {
  playerId: number | null;
  playerName?: string;
  team: 'home' | 'away';
  minute: number | null;
  ownGoal?: boolean;
};

export type RevealResult = {
  homeGoals: number;
  awayGoals: number;
  goals: RevealedGoal[];
};

export type ScorerPointDetail = {
  playerId: number;
  predicted: number;
  actual: number;
  matched: number;
  points: number;
  zeroedByHint: boolean;
};

export type FirstGoalscorerDetail = {
  predicted: FirstScorer | null;
  actual: FirstScorer | null;
  points: number;
  zeroedByHint: boolean;
};

export type CallOutcome = {
  id: CallId;
  label: string;
  status: CallStatus;
  earned: number;
  maximum: number;
  predicted: string | number | null;
  actual: string | number | null;
  note?: string;
};

export type EvaluationResult = {
  hasScorePrediction: boolean;
  correctResult: boolean;
  exactScoreline: boolean;
  earned: number;
  maximum: number;
  rawPercentage: number;
  hintPenalty: number;
  percentage: number;
  calls: CallOutcome[];
  scorersVoided: boolean;
  hintsUsed: HintKind[];
  goalscorerPoints: ScorerPointDetail[];
  firstGoalscorerDetail: FirstGoalscorerDetail | null;
};

export type EvaluationOptions = {
  homeTeam?: string;
  awayTeam?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function resultOf(homeGoals: number, awayGoals: number): Result {
  if (homeGoals > awayGoals) return 'home';
  if (awayGoals > homeGoals) return 'away';
  return 'draw';
}

// Which side scored first, or none if there were no goals.
export function firstTeamOf(goals: RevealedGoal[]): FirstTeam {
  const first = goals[0];
  if (!first) return 'none';
  return first.team === 'home' ? 'home' : 'away';
}

// The first goalscorer, or none if there were no goals. A null return means
// the first goal has no known player (for example an own goal).
export function firstScorerOf(goals: RevealedGoal[]): FirstScorer | null {
  const first = goals[0];
  if (!first) return 'none';
  if (first.ownGoal) return null;
  return first.playerId ?? null;
}

// Goals scored by a player, from the revealed goals list.
export function goalsByPlayer(goals: RevealedGoal[], playerId: number): number {
  return goals.filter((goal) => goal.playerId === playerId).length;
}

// Goals in reliable order. Goal order is only trustworthy when every goal has
// a minute and the events cover the whole scoreline. Null means "the archive
// cannot answer who scored first".
function orderedGoals(result: RevealResult): RevealedGoal[] | null {
  const total = result.homeGoals + result.awayGoals;
  if (total === 0) return [];
  if (result.goals.length !== total) return null;
  if (!result.goals.every((goal) => typeof goal.minute === 'number' && Number.isFinite(goal.minute))) {
    return null;
  }
  return [...result.goals].sort((a, b) => (a.minute as number) - (b.minute as number));
}

function tallyPlayerGoals(goals: RevealedGoal[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const goal of goals) {
    if (goal.playerId === null || goal.playerId === undefined) continue;
    counts.set(goal.playerId, (counts.get(goal.playerId) || 0) + 1);
  }
  return counts;
}

function tallyPredictedGoals(ids: number[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1);
  return counts;
}

function roundPoints(value: number): number {
  return Number(value.toFixed(SCORER_CREDIT_DECIMAL_PLACES));
}

function clampScore(value: number): number {
  return Math.max(MATCH_SCORE_MIN, Math.min(MATCH_SCORE_MAX, value));
}

function resultLabel(value: Result | null): string | null {
  if (value === null) return null;
  if (value === 'home') return 'Home win';
  if (value === 'away') return 'Away win';
  return 'Draw';
}

function teamLabel(value: FirstTeam | null, options: EvaluationOptions): string | null {
  if (value === null) return null;
  if (value === 'none') return 'No goals';
  return value === 'home' ? (options.homeTeam || 'Home') : (options.awayTeam || 'Away');
}

function scorerLabel(value: FirstScorer | null, goals: RevealedGoal[]): string | number | null {
  if (value === null) return null;
  if (value === 'none') return 'No goals';
  return goals.find((goal) => goal.playerId === value)?.playerName || value;
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export function evaluatePrediction(
  prediction: LockedPrediction,
  result: RevealResult,
  options: EvaluationOptions = {},
): EvaluationResult {
  const homeScore = prediction.homeScore ?? null;
  const awayScore = prediction.awayScore ?? null;
  const hasScoreline = homeScore !== null && awayScore !== null;
  const actualHome = result.homeGoals;
  const actualAway = result.awayGoals;
  const actualTotalGoals = actualHome + actualAway;
  const actualResult = resultOf(actualHome, actualAway);

  // A scoreline fills in the result and total goals automatically.
  const derivedResult = hasScoreline ? resultOf(homeScore, awayScore) : null;
  const resultCall = hasScoreline ? derivedResult : prediction.resultCall ?? null;
  const derivedTotalGoals = hasScoreline ? homeScore + awayScore : null;
  const totalGoalsCall = derivedTotalGoals ?? prediction.totalGoals ?? null;
  const totalGoalsContradiction =
    hasScoreline && prediction.totalGoals !== null && prediction.totalGoals !== undefined
      ? prediction.totalGoals !== derivedTotalGoals
      : false;

  const firstTeamCall = prediction.firstTeamToScore ?? null;
  const firstScorerCall = prediction.firstGoalscorerId ?? null;
  const picks = prediction.goalscorerIds ?? [];
  const hintsUsed = Array.isArray(prediction.hintsUsed) ? prediction.hintsUsed : [];
  const usedGoalCountHint = hintsUsed.includes('goalCount');
  const usedSpotlightHint = hintsUsed.includes('spotlight');
  const usedFirstTeamHint = hintsUsed.includes('firstTeam');
  const spotlightPlayerId = usedSpotlightHint ? (prediction.hintSpotlightPlayerId ?? null) : null;

  // --- Goal data availability ---
  const ordered = orderedGoals(result);
  const firstTeamAvailable = ordered !== null;
  const actualFirstTeam = ordered && ordered.length > 0 ? firstTeamOf(ordered) : 'none';
  const firstGoalIsOwnGoal = ordered !== null && ordered.length > 0 && !!ordered[0].ownGoal;
  const actualFirstScorer: FirstScorer | null = ordered === null
    ? null
    : ordered.length === 0
      ? 'none'
      : firstGoalIsOwnGoal ? null : (ordered[0].playerId ?? null);
  const firstScorerAvailable = ordered !== null
    && !firstGoalIsOwnGoal
    && (ordered.length === 0 || actualFirstScorer !== null);
  const realGoals = result.goals.filter((goal) => !goal.ownGoal);
  const scorersAvailable = realGoals.length > 0;

  // --- Scorer credit ---
  const actualCounts = tallyPlayerGoals(realGoals);
  const predictedCounts = tallyPredictedGoals(picks);
  const playerIds = [...new Set([...predictedCounts.keys(), ...actualCounts.keys()])];
  const goalscorerPoints: ScorerPointDetail[] = playerIds.map((playerId) => {
    const predicted = predictedCounts.get(playerId) || 0;
    const actual = actualCounts.get(playerId) || 0;
    const zeroedByHint = usedSpotlightHint && spotlightPlayerId === playerId;
    const matched = zeroedByHint ? 0 : Math.min(predicted, actual);
    return { playerId, predicted, actual, matched, points: 0, zeroedByHint };
  });

  // The spotlight gave away one player: that player's predicted goals and any
  // credit from them are removed from the Scorers call.
  let matchedGoals = 0;
  let predictedGoals = 0;
  for (const detail of goalscorerPoints) {
    if (detail.zeroedByHint) continue;
    if (detail.predicted === 0) continue;
    predictedGoals += detail.predicted;
    matchedGoals += detail.matched;
  }
  const scorerDenominator = Math.max(realGoals.length, predictedGoals);
  const scorerCredit = scorerDenominator === 0
    ? 0
    : roundPoints((CALL_POINTS.scorers * matchedGoals) / scorerDenominator);
  for (const detail of goalscorerPoints) {
    if (detail.zeroedByHint || scorerDenominator === 0) continue;
    detail.points = roundPoints(detail.matched / scorerDenominator);
  }

  // --- Hints that void a call ---
  const totalGoalsVoided = usedGoalCountHint || totalGoalsContradiction;
  const spotlightRevealedFirst = usedSpotlightHint && firstScorerCall !== null && (
    actualFirstScorer === 'none'
      ? spotlightPlayerId === null
      : actualFirstScorer !== null && actualFirstScorer === spotlightPlayerId
  );
  const firstScorerVoided = !firstScorerAvailable || spotlightRevealedFirst;

  // --- Calls ---
  const resultEarned = resultCall !== null && resultCall === actualResult ? CALL_POINTS.result : 0;
  const exactScoreline = hasScoreline && homeScore === actualHome && awayScore === actualAway;
  const scorelineEarned = exactScoreline ? CALL_POINTS.scoreline : 0;
  const totalGoalsEarned = !totalGoalsVoided && totalGoalsCall !== null && totalGoalsCall === actualTotalGoals
    ? CALL_POINTS.totalGoals
    : 0;
  const firstTeamEarned = firstTeamAvailable && !usedFirstTeamHint && firstTeamCall !== null && firstTeamCall === actualFirstTeam
    ? CALL_POINTS.firstTeamToScore
    : 0;
  const firstScorerEarned = !firstScorerVoided && firstScorerCall !== null && firstScorerCall === actualFirstScorer
    ? CALL_POINTS.firstGoalscorer
    : 0;
  const scorersEarned = scorersAvailable ? scorerCredit : 0;

  const calls: CallOutcome[] = [
    {
      id: 'result',
      label: 'Result',
      status: resultCall === null ? 'blank' : resultEarned > 0 ? 'earned' : 'missed',
      earned: resultEarned,
      maximum: CALL_POINTS.result,
      predicted: resultLabel(resultCall),
      actual: resultLabel(actualResult),
    },
    {
      id: 'scoreline',
      label: 'Scoreline',
      status: !hasScoreline ? 'blank' : exactScoreline ? 'earned' : 'missed',
      earned: scorelineEarned,
      maximum: CALL_POINTS.scoreline,
      predicted: hasScoreline ? `${homeScore}–${awayScore}` : null,
      actual: `${actualHome}–${actualAway}`,
      note: hasScoreline ? 'The result and total goals are filled in by the scoreline.' : undefined,
    },
    {
      id: 'totalGoals',
      label: 'Total goals',
      status: totalGoalsVoided ? 'voided' : totalGoalsCall === null ? 'blank' : totalGoalsEarned > 0 ? 'earned' : 'missed',
      earned: totalGoalsEarned,
      maximum: totalGoalsVoided ? 0 : CALL_POINTS.totalGoals,
      predicted: totalGoalsCall,
      actual: actualTotalGoals,
      note: totalGoalsVoided
        ? (totalGoalsContradiction
          ? 'Blocked: the total contradicted the scoreline.'
          : 'Voided: the goal-count hint gave this away.')
        : undefined,
    },
    {
      id: 'firstTeamToScore',
      label: 'First team to score',
      status: !firstTeamAvailable || usedFirstTeamHint ? 'voided' : firstTeamCall === null ? 'blank' : firstTeamEarned > 0 ? 'earned' : 'missed',
      earned: firstTeamEarned,
      maximum: firstTeamAvailable && !usedFirstTeamHint ? CALL_POINTS.firstTeamToScore : 0,
      predicted: teamLabel(firstTeamCall, options),
      actual: teamLabel(actualFirstTeam, options) ?? 'Not recorded',
      note: usedFirstTeamHint
        ? 'Voided: the First Team hint revealed the answer.'
        : firstTeamAvailable ? undefined : 'Voided: this archive has no reliable goal order.',
    },
    {
      id: 'firstGoalscorer',
      label: 'First goalscorer',
      status: firstScorerVoided ? 'voided' : firstScorerCall === null ? 'blank' : firstScorerEarned > 0 ? 'earned' : 'missed',
      earned: firstScorerEarned,
      maximum: firstScorerVoided ? 0 : CALL_POINTS.firstGoalscorer,
      predicted: scorerLabel(firstScorerCall, result.goals),
      actual: firstScorerAvailable ? scorerLabel(actualFirstScorer, result.goals) : 'Not recorded',
      note: firstGoalIsOwnGoal
        ? 'First goalscorer skipped: the opener was an own goal.'
        : spotlightRevealedFirst
        ? 'Voided: the spotlight hint gave this away.'
        : !firstScorerAvailable
          ? 'Voided: the first goal has no recorded scorer upgrade.'
          : undefined,
    },
    {
      id: 'scorers',
      label: 'Scorers',
      status: !scorersAvailable ? 'voided' : picks.length === 0 ? 'blank' : scorersEarned > 0 ? 'earned' : 'missed',
      earned: scorersEarned,
      maximum: scorersAvailable ? CALL_POINTS.scorers : 0,
      predicted: picks.length,
      actual: realGoals.length,
      note: !scorersAvailable
        ? (actualTotalGoals === 0
          ? 'Voided: a 0-0 has no scorers to call.'
          : result.goals.length > 0 && result.goals.every((goal) => goal.ownGoal)
            ? 'Scorers skipped: every goal was an own goal.'
            : 'Voided: this archive has no goal events for the match.')
        : picks.length === 0
          ? 'No scorer picks.'
          : `${matchedGoals} of ${scorerDenominator} goals matched${usedSpotlightHint ? ' (spotlight credit removed)' : ''}.`,
    },
  ];

  const earned = roundPoints(calls.reduce((sum, call) => sum + call.earned, 0));
  const maximum = calls.reduce((sum, call) => sum + call.maximum, 0);
  const rawPercentage = maximum === 0 ? 0 : clampScore(Math.round((earned / maximum) * MATCH_SCORE_MAX));
  const nominalHintPenalty = hintsUsed.reduce((sum, hint) => sum + HINT_SCORE_PENALTIES[hint], 0);
  const percentage = clampScore(rawPercentage - nominalHintPenalty);
  const hintPenalty = rawPercentage - percentage;

  return {
    hasScorePrediction: hasScoreline,
    correctResult: resultCall !== null && resultCall === actualResult,
    exactScoreline,
    earned,
    maximum,
    rawPercentage,
    hintPenalty,
    percentage,
    calls,
    scorersVoided: !scorersAvailable,
    hintsUsed,
    goalscorerPoints,
    firstGoalscorerDetail: firstScorerCall === null
      ? null
      : {
        predicted: firstScorerCall,
        actual: firstScorerAvailable ? actualFirstScorer : null,
        points: firstScorerEarned,
        zeroedByHint: firstScorerVoided,
      },
  };
}

// ---------------------------------------------------------------------------
// Career stats
// ---------------------------------------------------------------------------

export type CareerStats = {
  totalPlayed: number;
  runningAverage: number;
  priorAverage: number | null;
  diffFromPrior: number | null;
  performance: 'above' | 'below' | 'level' | 'baseline';
  statusText: string;
};

type HistoryLike = {
  fixtureId?: number;
  evaluation?: { percentage?: number } | null;
};

export function calculateCareerStats(
  history: HistoryLike[],
  currentFixtureId?: number,
): CareerStats {
  const evaluated = (Array.isArray(history) ? history : []).filter(
    (item) => item?.evaluation && typeof item.evaluation.percentage === 'number',
  );
  const totalPlayed = evaluated.length;

  if (totalPlayed === 0) {
    return {
      totalPlayed: 0,
      runningAverage: 0,
      priorAverage: null,
      diffFromPrior: null,
      performance: 'baseline',
      statusText: 'No fixtures completed yet',
    };
  }

  const allSum = evaluated.reduce((sum, item) => sum + (item.evaluation!.percentage as number), 0);
  const runningAverage = allSum / totalPlayed;

  if (totalPlayed === 1) {
    return {
      totalPlayed: 1,
      runningAverage,
      priorAverage: null,
      diffFromPrior: null,
      performance: 'baseline',
      statusText: `Opening fixture — sets your benchmark at ${runningAverage.toFixed(1)}%`,
    };
  }

  // Compare this match with the average before it. When there is no current
  // fixture (landing page), compare the last match with everything before it.
  const priorMatches = currentFixtureId != null
    ? evaluated.filter((item) => item.fixtureId !== currentFixtureId)
    : evaluated.slice(0, -1);

  if (priorMatches.length === 0) {
    return {
      totalPlayed,
      runningAverage,
      priorAverage: null,
      diffFromPrior: null,
      performance: 'baseline',
      statusText: `Opening fixture — sets your benchmark at ${runningAverage.toFixed(1)}%`,
    };
  }

  const priorSum = priorMatches.reduce((sum, item) => sum + (item.evaluation!.percentage as number), 0);
  const priorAverage = priorSum / priorMatches.length;

  const currentMatch = currentFixtureId != null
    ? evaluated.find((item) => item.fixtureId === currentFixtureId)
    : evaluated[evaluated.length - 1];

  const currentPct = currentMatch ? (currentMatch.evaluation!.percentage as number) : runningAverage;
  const diffFromPrior = currentPct - priorAverage;

  let performance: 'above' | 'below' | 'level' | 'baseline' = 'level';
  let statusText = `Level with your previous average of ${priorAverage.toFixed(1)}%`;

  if (diffFromPrior > CAREER_AVERAGE_TOLERANCE) {
    performance = 'above';
    statusText = `Above your average (+${diffFromPrior.toFixed(1)}% vs previous ${priorAverage.toFixed(1)}%)`;
  } else if (diffFromPrior < -CAREER_AVERAGE_TOLERANCE) {
    performance = 'below';
    statusText = `Below your average (${diffFromPrior.toFixed(1)}% vs previous ${priorAverage.toFixed(1)}%)`;
  }

  return {
    totalPlayed,
    runningAverage,
    priorAverage,
    diffFromPrior,
    performance,
    statusText,
  };
}

// ---------------------------------------------------------------------------
// Storage migration
// ---------------------------------------------------------------------------

export const HISTORY_KEY = 'hindsight.predictions';
export const SCORING_VERSION_KEY = 'hindsight.scoringVersion';
export const BADGES_KEY = 'hindsight.badges';
export const POWERUP_INVENTORY_KEY = 'hindsight.powerUps';
export const POWERUP_AWARDED_KEY = 'hindsight.powerUpsAwarded';

export type StoredPrediction = LockedPrediction & {
  result?: RevealResult | null;
  evaluation?: EvaluationResult | null;
  // Legacy power-up fields, stripped on migration.
  powerUpUsed?: unknown;
  doubleDownTarget?: unknown;
};

export type MigrationResult = {
  rescored: number;
  total: number;
  reset: boolean;
};

function readHistory(): StoredPrediction[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function hasResult(item: StoredPrediction): item is StoredPrediction & { result: RevealResult } {
  return !!item?.result
    && typeof item.result.homeGoals === 'number'
    && typeof item.result.awayGoals === 'number'
    && Array.isArray(item.result.goals)
    && item.result.goals.every((goal) => typeof goal.ownGoal === 'boolean');
}

function stripLegacyFields(item: StoredPrediction): StoredPrediction {
  const next = { ...item };
  delete next.powerUpUsed;
  delete next.doubleDownTarget;
  return next;
}

// Re-score saved history under the current rules. The old archive stored the
// raw calls and the revealed result, so every completed match can be rebuilt.
// If any completed match cannot be rebuilt, career stats are reset rather than
// mixing two scoring systems.
export function migrateStoredHistory(): MigrationResult {
  const summary: MigrationResult = { rescored: 0, total: 0, reset: false };
  try {
    // Power-ups no longer exist: clear any saved inventory first.
    localStorage.removeItem(POWERUP_INVENTORY_KEY);
    localStorage.removeItem(POWERUP_AWARDED_KEY);

    if (localStorage.getItem(SCORING_VERSION_KEY) === SCORING_VERSION) return summary;

    const history = readHistory();
    summary.total = history.length;

    const completed = history.filter((item) => !!item.evaluation);
    const canRescoreAll = completed.every(hasResult);

    if (!canRescoreAll) {
      // Career stats cannot be expressed in the new system. Drop evaluations
      // (and stale stamps) but keep the locked predictions themselves.
      const resetHistory = history.map((item) => {
        const next = stripLegacyFields(item);
        delete next.evaluation;
        return next;
      });
      localStorage.setItem(HISTORY_KEY, JSON.stringify(resetHistory));
      localStorage.removeItem(BADGES_KEY);
      localStorage.setItem(SCORING_VERSION_KEY, SCORING_VERSION);
      summary.reset = true;
      return summary;
    }

    const rescoredHistory = history.map((item) => {
      const next = stripLegacyFields(item);
      if (next.evaluation && hasResult(next)) {
        next.evaluation = evaluatePrediction(next, next.result);
        summary.rescored += 1;
      }
      return next;
    });

    localStorage.setItem(HISTORY_KEY, JSON.stringify(rescoredHistory));
    // Old stamps may have been earned on inflated power-up scores. Let the
    // current history re-ink the book.
    localStorage.removeItem(BADGES_KEY);
    localStorage.setItem(SCORING_VERSION_KEY, SCORING_VERSION);
  } catch {
    /* Storage can be unavailable; the game still runs. */
  }
  return summary;
}
