import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateEarnedBadges } from './badges.ts';
import {
  evaluatePrediction,
  resultOf,
  firstScorerOf,
  firstTeamOf,
  calculateCareerStats,
  migrateStoredHistory,
  HISTORY_KEY,
  SCORING_VERSION_KEY,
  BADGES_KEY,
  POWERUP_INVENTORY_KEY,
  POWERUP_AWARDED_KEY,
  type LockedPrediction,
  type RevealResult,
} from './memoryScore.ts';

const makePrediction = (over: Partial<LockedPrediction> = {}): LockedPrediction => ({
  fixtureId: 1,
  lockedAt: '2026-01-01T00:00:00.000Z',
  resultCall: null,
  homeScore: null,
  awayScore: null,
  goalscorerIds: [],
  totalGoals: null,
  firstTeamToScore: null,
  firstGoalscorerId: null,
  hintsUsed: [],
  hintSpotlightPlayerId: null,
  ...over,
});

const goal = (playerId: number, team: 'home' | 'away', minute: number | null) => ({
  playerId,
  playerName: `Player ${playerId}`,
  team,
  minute,
});

// 3-2 home win. 101, 102, 103 score for the home side; 201, 202 for away.
// 101 opens the scoring.
const threeTwo: RevealResult = {
  homeGoals: 3,
  awayGoals: 2,
  goals: [
    goal(101, 'home', 12),
    goal(201, 'away', 30),
    goal(102, 'home', 55),
    goal(202, 'away', 70),
    goal(103, 'home', 88),
  ],
};

const zeroZero: RevealResult = { homeGoals: 0, awayGoals: 0, goals: [] };

describe('memory score — worked examples', () => {
  it('A) 3-2 home win, full call', () => {
    // Player enters 3-2, first team home (right), first scorer (right),
    // scorers covering 2 of the 5 goals with 2 predicted.
    const prediction = makePrediction({
      homeScore: 3,
      awayScore: 2,
      goalscorerIds: [101, 102],
      firstTeamToScore: 'home',
      firstGoalscorerId: 101,
    });
    const score = evaluatePrediction(prediction, threeTwo);

    // Earned = 1 + 2 + 1 + 1 + 1 + 0.4 = 6.4. Maximum = 7. Score = 91.
    assert.equal(score.earned, 6.4);
    assert.equal(score.maximum, 7);
    assert.equal(score.percentage, 91);
    assert.deepEqual(
      score.calls.map((call) => [call.id, call.status]),
      [
        ['result', 'earned'],
        ['scoreline', 'earned'],
        ['totalGoals', 'earned'],
        ['firstTeamToScore', 'earned'],
        ['firstGoalscorer', 'earned'],
        ['scorers', 'earned'],
      ],
    );
  });

  it('B) same match, only home win and home scores first', () => {
    const prediction = makePrediction({
      resultCall: 'home',
      firstTeamToScore: 'home',
    });
    const score = evaluatePrediction(prediction, threeTwo);

    // Earned = 2. Maximum = 7. Score = 29.
    assert.equal(score.earned, 2);
    assert.equal(score.maximum, 7);
    assert.equal(score.percentage, 29);
  });

  it('C) 0-0 with no-goals calls', () => {
    const prediction = makePrediction({
      homeScore: 0,
      awayScore: 0,
      firstTeamToScore: 'none',
      firstGoalscorerId: 'none',
    });
    const score = evaluatePrediction(prediction, zeroZero);

    // Earned = 1 + 2 + 1 + 1 + 1 = 6. Maximum = 6 (Scorers left out). Score = 100.
    assert.equal(score.earned, 6);
    assert.equal(score.maximum, 6);
    assert.equal(score.percentage, 100);
    assert.equal(score.scorersVoided, true);
  });

  it('A) counts four real goals when one of five is an own goal', () => {
    const result: RevealResult = {
      ...threeTwo,
      goals: threeTwo.goals.map((entry, index) => index === 1
        ? { ...entry, team: 'home' as const, ownGoal: true }
        : entry),
    };
    const score = evaluatePrediction(makePrediction({ goalscorerIds: [101, 102] }), result);
    const scorers = score.calls.find((call) => call.id === 'scorers');
    assert.equal(scorers?.maximum, 1);
    assert.equal(scorers?.earned, 0.5);
    assert.match(scorers?.note ?? '', /2 of 4 goals matched/);
    assert.equal(score.goalscorerPoints.some((pick) => pick.playerId === 201), false);
  });

  it('B) two own goals leave both scorer calls out but preserve other calls', () => {
    const result: RevealResult = {
      homeGoals: 1,
      awayGoals: 1,
      goals: [
        { ...goal(201, 'home', 12), ownGoal: true },
        { ...goal(101, 'away', 40), ownGoal: true },
      ],
    };
    const score = evaluatePrediction(makePrediction({
      homeScore: 1,
      awayScore: 1,
      firstTeamToScore: 'home',
      firstGoalscorerId: 201,
    }), result);
    assert.equal(score.maximum, 5);
    assert.equal(score.calls.find((call) => call.id === 'firstGoalscorer')?.status, 'voided');
    assert.equal(score.calls.find((call) => call.id === 'scorers')?.status, 'voided');
    assert.equal(score.calls.find((call) => call.id === 'firstTeamToScore')?.status, 'earned');
    assert.equal(score.calls.find((call) => call.id === 'result')?.status, 'earned');
    assert.match(score.calls.find((call) => call.id === 'firstGoalscorer')?.note ?? '', /opener was an own goal/);
    assert.match(score.calls.find((call) => call.id === 'scorers')?.note ?? '', /every goal was an own goal/);
  });

  it('C) voids first goalscorer for an own-goal opener and scores real goals only', () => {
    const result: RevealResult = {
      homeGoals: 2,
      awayGoals: 1,
      goals: [
        { ...goal(201, 'home', 12), ownGoal: true },
        goal(101, 'home', 40),
        goal(202, 'away', 80),
      ],
    };
    const score = evaluatePrediction(makePrediction({
      goalscorerIds: [101, 201],
      firstGoalscorerId: 201,
    }), result);
    assert.equal(score.calls.find((call) => call.id === 'firstGoalscorer')?.status, 'voided');
    assert.equal(score.calls.find((call) => call.id === 'scorers')?.earned, 0.5);
    assert.match(score.calls.find((call) => call.id === 'scorers')?.note ?? '', /1 of 2 goals matched/);
  });
});

describe('memory score — calls', () => {
  it('derives the result and total goals from the scoreline', () => {
    const score = evaluatePrediction(makePrediction({ homeScore: 3, awayScore: 2 }), threeTwo);
    assert.equal(score.correctResult, true);
    assert.equal(score.calls.find((call) => call.id === 'totalGoals')?.status, 'earned');
  });

  it('uses the scoreline result even if a saved result call conflicts', () => {
    const score = evaluatePrediction(
      makePrediction({ resultCall: 'away', homeScore: 3, awayScore: 2 }),
      threeTwo,
    );
    assert.equal(score.correctResult, true);
    assert.equal(score.calls.find((call) => call.id === 'result')?.status, 'earned');
  });

  it('keeps blank calls in the maximum', () => {
    const score = evaluatePrediction(makePrediction(), threeTwo);
    assert.equal(score.earned, 0);
    assert.equal(score.maximum, 7);
    assert.equal(score.percentage, 0);
    assert.equal(score.calls.filter((call) => call.status === 'blank').length, 6);
  });

  it('blocks a total that contradicts the scoreline', () => {
    const score = evaluatePrediction(
      makePrediction({ homeScore: 3, awayScore: 2, totalGoals: 4 }),
      threeTwo,
    );
    const totalGoals = score.calls.find((call) => call.id === 'totalGoals');
    assert.equal(totalGoals?.status, 'voided');
    assert.equal(score.maximum, 6);
    assert.equal(score.earned, 3); // result + exact scoreline only
  });

  it('gives no negative points for a wrong call', () => {
    const score = evaluatePrediction(
      makePrediction({ resultCall: 'away', goalscorerIds: [999, 998] }),
      threeTwo,
    );
    assert.ok(score.calls.every((call) => call.earned >= 0));
    assert.ok(score.earned >= 0);
  });

  it('gives scorers partial credit and stops farming the whole lineup', () => {
    // The five actual scorers plus seventeen players who never scored.
    const picks = [101, 102, 103, 201, 202, ...Array.from({ length: 17 }, (_, index) => 900 + index)];
    const score = evaluatePrediction(
      makePrediction({ homeScore: 3, awayScore: 2, goalscorerIds: picks }),
      threeTwo,
    );
    const scorers = score.calls.find((call) => call.id === 'scorers');
    // matched = 5, max(actual 5, predicted 22) = 22, credit = 5/22.
    assert.equal(scorers?.earned, Number((5 / 22).toFixed(6)));
    assert.ok((scorers?.earned ?? 0) < 1);
  });

  it('voids Scorers in a 0-0 match', () => {
    const score = evaluatePrediction(makePrediction({ homeScore: 0, awayScore: 0 }), zeroZero);
    assert.equal(score.calls.find((call) => call.id === 'scorers')?.maximum, 0);
    assert.equal(score.maximum, 6);
  });

  it('voids first-team and first-scorer calls when the archive has no goal order', () => {
    const unordered: RevealResult = {
      homeGoals: 3,
      awayGoals: 2,
      goals: threeTwo.goals.map((entry) => ({ ...entry, minute: null })),
    };
    const score = evaluatePrediction(makePrediction({ homeScore: 3, awayScore: 2 }), unordered);
    assert.equal(score.calls.find((call) => call.id === 'firstTeamToScore')?.status, 'voided');
    assert.equal(score.calls.find((call) => call.id === 'firstGoalscorer')?.status, 'voided');
    assert.equal(score.maximum, 5); // result + scoreline + total goals + scorers
    assert.equal(score.earned, 4);
  });
});

describe('memory score — hints', () => {
  it('goal count voids the total goals call', () => {
    const prediction = makePrediction({
      homeScore: 3,
      awayScore: 2,
      hintsUsed: ['goalCount'],
    });
    const score = evaluatePrediction(prediction, threeTwo);
    assert.equal(score.calls.find((call) => call.id === 'totalGoals')?.status, 'voided');
    assert.equal(score.maximum, 6);
    assert.equal(score.rawPercentage, 50); // result + scoreline of 6
    assert.equal(score.hintPenalty, 3);
    assert.equal(score.percentage, 47);
  });

  it('spotlight voids first goalscorer only when it revealed the first scorer', () => {
    const correctFirst = evaluatePrediction(
      makePrediction({
        firstGoalscorerId: 101,
        hintsUsed: ['spotlight'],
        hintSpotlightPlayerId: 101,
      }),
      threeTwo,
    );
    assert.equal(correctFirst.calls.find((call) => call.id === 'firstGoalscorer')?.status, 'voided');

    const differentPlayer = evaluatePrediction(
      makePrediction({
        firstGoalscorerId: 101,
        hintsUsed: ['spotlight'],
        hintSpotlightPlayerId: 103,
      }),
      threeTwo,
    );
    assert.equal(differentPlayer.calls.find((call) => call.id === 'firstGoalscorer')?.status, 'earned');
  });

  it('spotlight voids scorer credit for the revealed player', () => {
    const score = evaluatePrediction(
      makePrediction({
        goalscorerIds: [101],
        hintsUsed: ['spotlight'],
        hintSpotlightPlayerId: 101,
      }),
      threeTwo,
    );
    const scorers = score.calls.find((call) => call.id === 'scorers');
    assert.equal(scorers?.status, 'missed');
    assert.equal(scorers?.earned, 0);
    assert.equal(score.goalscorerPoints.find((pick) => pick.playerId === 101)?.zeroedByHint, true);
  });

  it('takes five off the score per hint and never drops below zero', () => {
    const score = evaluatePrediction(
      makePrediction({ hintsUsed: ['goalCount', 'spotlight'] }),
      threeTwo,
    );
    assert.equal(score.percentage, 0);
    assert.equal(score.hintPenalty, 0); // already at zero, nothing left to deduct
  });
});

describe('memory score — helpers', () => {
  it('derives result, first team and first scorer', () => {
    assert.equal(resultOf(3, 2), 'home');
    assert.equal(resultOf(1, 1), 'draw');
    assert.equal(resultOf(0, 2), 'away');
    assert.equal(firstTeamOf([goal(101, 'home', 12)]), 'home');
    assert.equal(firstScorerOf([goal(101, 'home', 12)]), 101);
    assert.equal(firstScorerOf([]), 'none');
  });
});

describe('own-goal badges', () => {
  it('does not award Brace Yourself or Sharpshooter for own-goal credit', () => {
    const result: RevealResult = {
      homeGoals: 2,
      awayGoals: 1,
      goals: [
        { ...goal(201, 'home', 12), ownGoal: true },
        goal(101, 'home', 40),
        goal(202, 'away', 80),
      ],
    };
    const evaluation = evaluatePrediction(makePrediction({
      goalscorerIds: [201, 201],
      firstGoalscorerId: 201,
    }), result);
    const badges = evaluateEarnedBadges([{ evaluation, result }]);
    assert.equal(badges.includes('brace-yourself'), false);
    assert.equal(badges.includes('sharpshooter'), false);
  });
});

describe('career memory score', () => {
  it('averages all match scores', () => {
    const stats = calculateCareerStats([
      { fixtureId: 1, evaluation: { percentage: 90 } },
      { fixtureId: 2, evaluation: { percentage: 30 } },
    ]);
    assert.equal(stats.totalPlayed, 2);
    assert.equal(stats.runningAverage, 60);
  });

  it('compares the current match to the average before it', () => {
    const stats = calculateCareerStats([
      { fixtureId: 1, evaluation: { percentage: 60 } },
      { fixtureId: 2, evaluation: { percentage: 80 } },
      { fixtureId: 3, evaluation: { percentage: 40 } },
    ], 3);
    assert.equal(stats.priorAverage, 70);
    assert.equal(stats.diffFromPrior, -30);
    assert.equal(stats.performance, 'below');
  });
});

describe('old data migration', () => {
  it('re-scores saved history and clears power-up inventory', () => {
    const store = new Map<string, string>();
    globalThis.localStorage = {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => { store.set(key, String(value)); },
      removeItem: (key: string) => { store.delete(key); },
      clear: () => store.clear(),
    } as unknown as Storage;

    // Old-style lock: no `resultCall` field, old power-up fields present, and
    // an old evaluation built on inflated points.
    const legacy = [{
      fixtureId: 1,
      lockedAt: '2026-01-01T00:00:00.000Z',
      homeScore: 3,
      awayScore: 2,
      goalscorerIds: [101, 102],
      totalGoals: 5,
      firstTeamToScore: 'home',
      firstGoalscorerId: 101,
      hintsUsed: [],
      hintSpotlightPlayerId: null,
      powerUpUsed: 'lockInBonus',
      result: { ...threeTwo, goals: threeTwo.goals.map((entry) => ({ ...entry, ownGoal: false })) },
      evaluation: { percentage: 100, totalPoints: 20, maximumPoints: 20 },
    }];
    store.set(HISTORY_KEY, JSON.stringify(legacy));
    store.set(POWERUP_INVENTORY_KEY, JSON.stringify({ doubleDown: 2, safetyNet: 1, lockInBonus: 2 }));
    store.set(POWERUP_AWARDED_KEY, JSON.stringify({ doubleDown: 2, safetyNet: 1, lockInBonus: 2 }));

    const summary = migrateStoredHistory();

    assert.equal(summary.rescored, 1);
    assert.equal(summary.reset, false);
    assert.equal(store.has(POWERUP_INVENTORY_KEY), false);
    assert.equal(store.has(POWERUP_AWARDED_KEY), false);
    assert.equal(store.get(SCORING_VERSION_KEY), 'memory-v4');

    const saved = JSON.parse(store.get(HISTORY_KEY)!);
    assert.equal(saved[0].evaluation.percentage, 91);
    assert.equal(saved[0].evaluation.earned, 6.4);
    assert.equal(saved[0].evaluation.maximum, 7);
    assert.equal('powerUpUsed' in saved[0], false);
  });

  it('resets evaluations and badges when a completed match has no saved result', () => {
    const store = new Map<string, string>();
    globalThis.localStorage = {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => { store.set(key, String(value)); },
      removeItem: (key: string) => { store.delete(key); },
      clear: () => store.clear(),
    } as unknown as Storage;
    const legacy = [{ fixtureId: 2, homeScore: 1, awayScore: 0, evaluation: { percentage: 75 } }];
    store.set(HISTORY_KEY, JSON.stringify(legacy));
    store.set(BADGES_KEY, JSON.stringify(['bullseye']));

    const summary = migrateStoredHistory();

    assert.equal(summary.reset, true);
    assert.equal(summary.rescored, 0);
    const saved = JSON.parse(store.get(HISTORY_KEY)!);
    assert.equal(saved[0].homeScore, 1);
    assert.equal('evaluation' in saved[0], false);
    assert.equal(store.has(BADGES_KEY), false);
  });
});
