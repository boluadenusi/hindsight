export type RecordEntry = {
  fixtureId: number | null;
  index: number;
  lockedAt: string | null;
  matchDate: string | null;
  homeTeam: string | null;
  awayTeam: string | null;
  competition: string | null;
  season: number | null;
  homeGoals: number | null;
  awayGoals: number | null;
  percentage: number | null;
};

export type RecordFilters = {
  club: string;
  competition: string;
  season: string;
  score: string;
  sort: 'newest' | 'oldest' | 'score-high' | 'score-low' | 'club' | 'competition' | 'season';
};

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function buildRecordBook(history: unknown[]): RecordEntry[] {
  return history.flatMap((item, index) => {
    const prediction = object(item);
    const result = object(prediction.result);
    const evaluation = object(prediction.evaluation);
    const percentage = finite(evaluation.percentage);
    if (!prediction.result && percentage === null) return [];
    const fixture = object(prediction.fixtureSnapshot);
    return [{
      fixtureId: finite(prediction.fixtureId), index,
      lockedAt: text(prediction.lockedAt),
      matchDate: text(fixture.game_date),
      homeTeam: text(fixture.home_team),
      awayTeam: text(fixture.away_team),
      competition: text(fixture.competition),
      season: finite(fixture.season_year),
      homeGoals: finite(result.homeGoals),
      awayGoals: finite(result.awayGoals),
      percentage,
    }];
  });
}

export function filterRecords(records: RecordEntry[], filters: RecordFilters): RecordEntry[] {
  const scoreRanges: Record<string, [number, number]> = {
    '0-24': [0, 25], '25-49': [25, 50], '50-74': [50, 75], '75-100': [75, 101],
  };
  const range = scoreRanges[filters.score];
  return records.filter((record) =>
    (!filters.club || record.homeTeam === filters.club || record.awayTeam === filters.club)
    && (!filters.competition || record.competition === filters.competition)
    && (!filters.season || String(record.season) === filters.season)
    && (!range || (record.percentage !== null && record.percentage >= range[0] && record.percentage < range[1]))
  ).sort((a, b) => {
    switch (filters.sort) {
      case 'oldest': return a.index - b.index;
      case 'score-high':
      case 'score-low':
        if (a.percentage === null || b.percentage === null) return a.percentage === b.percentage ? b.index - a.index : a.percentage === null ? 1 : -1;
        return (filters.sort === 'score-high' ? b.percentage - a.percentage : a.percentage - b.percentage) || b.index - a.index;
      case 'club': return (a.homeTeam ?? '\uffff').localeCompare(b.homeTeam ?? '\uffff') || b.index - a.index;
      case 'competition': return (a.competition ?? '\uffff').localeCompare(b.competition ?? '\uffff') || b.index - a.index;
      case 'season': return (b.season ?? -Infinity) - (a.season ?? -Infinity) || b.index - a.index;
      default: return b.index - a.index;
    }
  });
}
