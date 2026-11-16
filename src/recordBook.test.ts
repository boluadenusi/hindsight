import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildRecordBook, filterRecords } from './recordBookData.ts';
import { calculateCareerStats } from './memoryScore.ts';

const history = [
  { fixtureId: 1, lockedAt: '2024-01-02T00:00:00Z', fixtureSnapshot: { home_team: 'Arsenal', away_team: 'Chelsea', competition: 'League', season_year: 2020, game_date: '2021-01-01' }, result: { homeGoals: 2, awayGoals: 1 }, evaluation: { percentage: 80 } },
  { fixtureId: 2, lockedAt: '2024-03-02T00:00:00Z', fixtureSnapshot: { home_team: 'Chelsea', away_team: 'City', competition: 'Cup', season_year: 2021, game_date: '2022-01-01' }, result: { homeGoals: 0, awayGoals: 0 }, evaluation: { percentage: 40 } },
  { fixtureId: 3, lockedAt: '2024-04-02T00:00:00Z', result: { homeGoals: 1, awayGoals: 0 } },
  { fixtureId: 4, fixtureSnapshot: { home_team: 'Pending' } },
];

const defaults = { club: '', competition: '', season: '', score: '', sort: 'newest' as const };

describe('record book', () => {
  it('includes completed records even when historical metadata or score is missing', () => {
    const records = buildRecordBook(history);
    assert.equal(records.length, 3);
    assert.equal(records[2].homeTeam, null);
    assert.equal(records[2].percentage, null);
  });

  it('filters both home and away clubs, competition, season and score together', () => {
    const records = buildRecordBook(history);
    assert.deepEqual(filterRecords(records, { ...defaults, club: 'Chelsea', competition: 'League', season: '2020', score: '75-100' }).map((r) => r.fixtureId), [1]);
    assert.deepEqual(filterRecords(records, { ...defaults, club: 'Chelsea' }).map((r) => r.fixtureId), [2, 1]);
  });

  it('sorts by score without losing unscored records', () => {
    const records = filterRecords(buildRecordBook(history), { ...defaults, sort: 'score-high' });
    assert.deepEqual(records.map((r) => r.fixtureId), [1, 2, 3]);
  });

  it('leaves unavailable seasons unknown rather than guessing from dates', () => {
    assert.equal(buildRecordBook(history)[2].season, null);
  });

  it('uses the same career average as the scoreboard, including scored records without a result', () => {
    const saved = [...history, { fixtureId: 5, evaluation: { percentage: 60 } }];
    const scored = buildRecordBook(saved).filter((record) => record.percentage !== null);
    const average = scored.reduce((sum, record) => sum + (record.percentage ?? 0), 0) / scored.length;
    assert.equal(average, calculateCareerStats(saved).runningAverage);
  });

  it('covers score boundaries and orders by recency, club, competition and season', () => {
    const records = buildRecordBook([
      { fixtureId: 1, fixtureSnapshot: { home_team: 'Zulu', competition: 'League', season_year: 2020 }, evaluation: { percentage: 24.9 } },
      { fixtureId: 2, fixtureSnapshot: { home_team: 'Alpha', competition: 'Cup', season_year: 2022 }, evaluation: { percentage: 25 } },
      { fixtureId: 3, fixtureSnapshot: { home_team: 'Beta', competition: 'World', season_year: 2021 }, evaluation: { percentage: 50 } },
      { fixtureId: 4, evaluation: { percentage: 75 } },
      { fixtureId: 5, evaluation: { percentage: 100 } },
    ]);
    for (const [score, ids] of [['0-24', [1]], ['25-49', [2]], ['50-74', [3]], ['75-100', [5, 4]]] as const) {
      assert.deepEqual(filterRecords(records, { ...defaults, score }).map((record) => record.fixtureId), ids);
    }
    assert.deepEqual(filterRecords(records, { ...defaults, sort: 'oldest' }).map((record) => record.fixtureId), [1, 2, 3, 4, 5]);
    assert.deepEqual(filterRecords(records, { ...defaults, sort: 'score-low' }).map((record) => record.fixtureId), [1, 2, 3, 4, 5]);
    assert.deepEqual(filterRecords(records, { ...defaults, sort: 'club' }).slice(0, 3).map((record) => record.fixtureId), [2, 3, 1]);
    assert.deepEqual(filterRecords(records, { ...defaults, sort: 'competition' }).slice(0, 3).map((record) => record.fixtureId), [2, 1, 3]);
    assert.deepEqual(filterRecords(records, { ...defaults, sort: 'season' }).slice(0, 3).map((record) => record.fixtureId), [2, 3, 1]);
  });
});
