import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addFixtureToClubTiers, selectFixture } from './fixtureDraw.mjs';

const weights = { A: 45, B: 40, C: 15 };

describe('fixture draws', () => {
  it('uses the 45/40/15 tier boundaries before choosing a fixture', () => {
    const tiers = { A: [1], B: [2], C: [3] };
    for (const [roll, expected] of [[0, 'A'], [0.449, 'A'], [0.45, 'B'], [0.849, 'B'], [0.85, 'C']]) {
      assert.equal(selectFixture(tiers, [], weights, () => roll).tier, expected);
    }
    const counts = { A: 0, B: 0, C: 0 };
    for (let roll = 0; roll < 100; roll++) {
      counts[selectFixture(tiers, [], weights, () => (roll + 0.5) / 100).tier]++;
    }
    assert.deepEqual(counts, weights);
  });

  it('indexes both home and away clubs without mixing in other matches', () => {
    const clubs = new Map();
    addFixtureToClubTiers(clubs, { id: 1, home_club_id: 10, away_club_id: 20 }, 'A');
    addFixtureToClubTiers(clubs, { id: 2, home_club_id: 30, away_club_id: 10 }, 'B');
    addFixtureToClubTiers(clubs, { id: 3, home_club_id: 20, away_club_id: 30 }, 'C');
    assert.deepEqual(clubs.get(10), { A: [1], B: [2], C: [] });
    assert.deepEqual(clubs.get(20), { A: [1], B: [], C: [3] });
  });

  it('uses the existing fallback order after excluding already played matches', () => {
    const tiers = { A: [1], B: [2], C: [3] };
    assert.deepEqual(selectFixture(tiers, [1], weights, () => 0), { gameId: 2, tier: 'B' });
    assert.deepEqual(selectFixture(tiers, [3], weights, () => 0.9), { gameId: 2, tier: 'B' });
    assert.equal(selectFixture(tiers, [1, 2, 3], weights, () => 0), null);
  });

  it('never draws outside a club pool, including when a tier is empty', () => {
    const tiers = { A: [], B: [8, 9], C: [10] };
    assert.deepEqual(selectFixture(tiers, [8], weights, () => 0), { gameId: 9, tier: 'B' });
    assert.deepEqual(selectFixture(tiers, [8, 9], weights, () => 0.5), { gameId: 10, tier: 'C' });
  });
});
