import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeWinPercentages } from './matchOdds.ts';

describe('match odds — win percentages', () => {
  it('splits a clear mismatch heavily in the favourite', () => {
    const odds = computeWinPercentages({
      tier: 'C',
      homeIsBigClub: true,
      awayIsBigClub: false,
      home_form: [{ result: 'W' }, { result: 'W' }, { result: 'W' }, { result: 'W' }, { result: 'W' }],
      away_form: [{ result: 'L' }, { result: 'L' }, { result: 'L' }, { result: 'L' }, { result: 'L' }],
    });
    assert.ok(odds.home > odds.away);
    assert.ok(odds.home + odds.draw + odds.away === 100);
  });

  it('adds a draw tendency in tier A', () => {
    const tierA = computeWinPercentages({
      tier: 'A',
      homeIsBigClub: true,
      awayIsBigClub: true,
      home_form: [{ result: 'W' }, { result: 'W' }],
      away_form: [{ result: 'W' }, { result: 'W' }],
    });
    const tierC = computeWinPercentages({
      tier: 'C',
      homeIsBigClub: true,
      awayIsBigClub: true,
      home_form: [{ result: 'W' }, { result: 'W' }],
      away_form: [{ result: 'W' }, { result: 'W' }],
    });
    assert.ok(tierA.draw > tierC.draw);
  });

  it('gives the home side an edge', () => {
    const odds = computeWinPercentages({
      tier: 'C',
      homeIsBigClub: false,
      awayIsBigClub: false,
      home_form: [{ result: 'D' }, { result: 'D' }],
      away_form: [{ result: 'D' }, { result: 'D' }],
    });
    assert.ok(odds.home > odds.away);
  });

  it('weights results against big clubs more heavily', () => {
    const bigOpponent = computeWinPercentages({
      tier: 'C',
      homeIsBigClub: false,
      awayIsBigClub: false,
      home_form: [
        { result: 'W', opponentIsBigClub: true },
        { result: 'W', opponentIsBigClub: true },
        { result: 'W', opponentIsBigClub: true },
        { result: 'W', opponentIsBigClub: true },
        { result: 'W', opponentIsBigClub: true },
      ],
      away_form: [
        { result: 'L', opponentIsBigClub: false },
        { result: 'L', opponentIsBigClub: false },
        { result: 'L', opponentIsBigClub: false },
        { result: 'L', opponentIsBigClub: false },
        { result: 'L', opponentIsBigClub: false },
      ],
    });
    const smallOpponent = computeWinPercentages({
      tier: 'C',
      homeIsBigClub: false,
      awayIsBigClub: false,
      home_form: [
        { result: 'W', opponentIsBigClub: false },
        { result: 'W', opponentIsBigClub: false },
        { result: 'W', opponentIsBigClub: false },
        { result: 'W', opponentIsBigClub: false },
        { result: 'W', opponentIsBigClub: false },
      ],
      away_form: [
        { result: 'L', opponentIsBigClub: true },
        { result: 'L', opponentIsBigClub: true },
        { result: 'L', opponentIsBigClub: true },
        { result: 'L', opponentIsBigClub: true },
        { result: 'L', opponentIsBigClub: true },
      ],
    });
    assert.ok(bigOpponent.home > smallOpponent.home);
  });

  it('handles empty form gracefully', () => {
    const odds = computeWinPercentages({ tier: 'C', home_form: [], away_form: [] });
    assert.ok(odds.home > 0 && odds.draw > 0 && odds.away > 0);
    assert.equal(odds.home + odds.draw + odds.away, 100);
  });

  it('always sums to one hundred', () => {
    const odds = computeWinPercentages({
      tier: 'B',
      homeIsBigClub: true,
      awayIsBigClub: false,
      home_form: [{ result: 'W' }, { result: 'L' }, { result: 'D' }],
      away_form: [{ result: 'W' }, { result: 'W' }, { result: 'D' }, { result: 'L' }],
    });
    assert.equal(odds.home + odds.draw + odds.away, 100);
  });
});