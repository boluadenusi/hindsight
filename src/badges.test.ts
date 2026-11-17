import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { badgesForItem, evaluateEarnedBadges, syncEarnedBadges, type BadgeHistoryItem } from './badges.ts';
import { evaluatePrediction, type RevealResult } from './memoryScore.ts';

const scored = (percentage: number, snapshot: BadgeHistoryItem['fixtureSnapshot'] = {}): BadgeHistoryItem => ({
  evaluation: { percentage },
  fixtureSnapshot: snapshot,
});

function assertMatchBadge(item: BadgeHistoryItem, badge: string, expected: boolean) {
  assert.equal(evaluateEarnedBadges([item]).some((id) => id === badge), expected);
  assert.equal(badgesForItem(item).some((id) => id === badge), expected);
}

describe('new stamps', () => {
  it('awards Century Club at 100 scored fixtures, not 99 or an unrevealed lock', () => {
    const history = Array.from({ length: 99 }, () => scored(50));
    assert.equal(evaluateEarnedBadges([...history, {}]).some((id) => id === 'century-club'), false);
    assert.equal(evaluateEarnedBadges([...history, scored(0)]).some((id) => id === 'century-club'), true);
  });

  it('awards Late Show for a matched scorer with a non-own goal from minute 80', () => {
    const result: RevealResult = { homeGoals: 1, awayGoals: 0, goals: [{ playerId: 7, team: 'home', minute: 80 }] };
    const item = { result, evaluation: evaluatePrediction({ goalscorerIds: [7] }, result) };
    assertMatchBadge(item, 'late-show', true);
    assertMatchBadge({ ...item, result: { ...result, goals: [{ ...result.goals[0], minute: 79 }] } }, 'late-show', false);
    assertMatchBadge({ ...item, result: { ...result, goals: [{ ...result.goals[0], minute: null }] } }, 'late-show', false);
    assertMatchBadge({ ...item, result: { ...result, goals: [{ ...result.goals[0], ownGoal: true }] } }, 'late-show', false);
    assertMatchBadge({ ...item, evaluation: evaluatePrediction({ goalscorerIds: [7], hintsUsed: ['spotlight'], hintSpotlightPlayerId: 7 }, result) }, 'late-show', false);
    assertMatchBadge({ evaluation: item.evaluation }, 'late-show', false);
  });

  it('awards North London Derby only for a correct result between Arsenal and Tottenham', () => {
    const evaluation = { percentage: 50, correctResult: true };
    assertMatchBadge({ evaluation, fixtureSnapshot: { home_team: 'Arsenal FC', away_team: 'Tottenham Hotspur' } }, 'north-london-derby', true);
    assertMatchBadge({ evaluation, fixtureSnapshot: { home_team: 'Tottenham Hotspur', away_team: 'Arsenal FC' } }, 'north-london-derby', true);
    assertMatchBadge({ evaluation: { ...evaluation, correctResult: false }, fixtureSnapshot: { home_team: 'Arsenal FC', away_team: 'Tottenham Hotspur' } }, 'north-london-derby', false);
    assertMatchBadge({ evaluation, fixtureSnapshot: { home_team: 'Arsenal FC', away_team: 'Chelsea FC' } }, 'north-london-derby', false);
  });

  it('awards Unbeaten Run after five consecutive scores at or above 50, resetting below 50', () => {
    assert.equal(evaluateEarnedBadges([50, 80, 50, 60].map((n) => scored(n))).some((id) => id === 'unbeaten-run'), false);
    assert.equal(evaluateEarnedBadges([50, 80, 50, 60, 50].map((n) => scored(n))).some((id) => id === 'unbeaten-run'), true);
    assert.equal(evaluateEarnedBadges([50, 80, 49, 60, 50, 80, 70].map((n) => scored(n))).some((id) => id === 'unbeaten-run'), false);
  });

  it('awards Continental Tour for five distinct nonblank competitions', () => {
    const history = ['League A', 'League B', 'League C', 'League D'].map((competition) => scored(20, { competition }));
    assert.equal(evaluateEarnedBadges([...history, scored(20, { competition: ' league a ' }), scored(20, { competition: ' ' })]).some((id) => id === 'continental-tour'), false);
    assert.equal(evaluateEarnedBadges([...history, scored(20, { competition: 'League E' })]).some((id) => id === 'continental-tour'), true);
  });

  it('awards Goal Fest for an earned total-goals call in a match with at least five goals', () => {
    const result: RevealResult = { homeGoals: 3, awayGoals: 2, goals: [] };
    assertMatchBadge({ result, evaluation: evaluatePrediction({ totalGoals: 5 }, result) }, 'goal-fest', true);
    assertMatchBadge({ result, evaluation: evaluatePrediction({ totalGoals: 4 }, result) }, 'goal-fest', false);
    assertMatchBadge({ result, evaluation: evaluatePrediction({ totalGoals: 5, hintsUsed: ['goalCount'] }, result) }, 'goal-fest', false);
    const fourGoals = { ...result, awayGoals: 1 };
    assertMatchBadge({ result: fourGoals, evaluation: evaluatePrediction({ totalGoals: 4 }, fourGoals) }, 'goal-fest', false);
    assertMatchBadge({ evaluation: evaluatePrediction({ totalGoals: 5 }, result) }, 'goal-fest', false);
  });

  it('retroactively stores new stamps without discarding existing stamps or announcing them twice', () => {
    const values = new Map<string, string>([['hindsight.badges', '["bullseye"]']]);
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    } });
    try {
      const history = Array.from({ length: 100 }, () => scored(50));
      const first = syncEarnedBadges(history);
      assert.equal(first.some((id) => id === 'century-club'), true);
      assert.equal(first.some((id) => id === 'unbeaten-run'), true);
      assert.equal(JSON.parse(values.get('hindsight.badges')!).includes('bullseye'), true);
      assert.deepEqual(syncEarnedBadges(history), []);
    } finally {
      Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });
});
