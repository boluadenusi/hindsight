import { useState } from 'react';
import { HISTORY_KEY } from './memoryScore';
import { buildRecordBook, filterRecords, type RecordFilters } from './recordBookData';
import './RecordBook.css';

const initialFilters: RecordFilters = { club: '', competition: '', season: '', score: '', sort: 'newest' };

function readRecords() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return { records: [], error: '' };
    const history: unknown = JSON.parse(raw);
    if (!Array.isArray(history)) throw new Error('Invalid history');
    return { records: buildRecordBook(history), error: '' };
  } catch {
    return { records: [], error: 'Your saved record could not be read. Check your browser storage and try again.' };
  }
}

function unique(values: (string | null)[]) {
  return [...new Set(values.filter((value): value is string => value !== null))].sort((a, b) => a.localeCompare(b));
}

function matchDate(value: string | null) {
  if (!value) return 'Date unavailable';
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? 'Date unavailable' : parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function RecordBook() {
  const [{ records, error }] = useState(readRecords);
  const [filters, setFilters] = useState<RecordFilters>(initialFilters);
  const filtered = filterRecords(records, filters);
  const clubs = unique(records.flatMap((record) => [record.homeTeam, record.awayTeam]));
  const competitions = unique(records.map((record) => record.competition));
  const seasons = [...new Set(records.map((record) => record.season).filter((season): season is number => season !== null))].sort((a, b) => b - a);
  const scored = records.filter((record) => record.percentage !== null);
  const average = scored.length ? scored.reduce((sum, record) => sum + (record.percentage ?? 0), 0) / scored.length : null;

  return <main className="page-shell record-page">
    <header className="masthead">
      <a href="/" className="wordmark">Hindsight<span className="period">.</span></a>
      <nav className="masthead-nav" aria-label="Record book navigation">
        <a href="/" className="masthead-nav-link">← Turnstiles</a>
        <a href="/play" className="masthead-nav-link">Play</a>
      </nav>
    </header>
    <section className="record-intro">
      <p className="eyebrow">Your football memory</p>
      <h1>The Record Book</h1>
      <p>Every match you have completed, kept on this browser.</p>
      {!error && <div className="record-totals">
        <span><strong>{records.length}</strong> {records.length === 1 ? 'match' : 'matches'} recorded</span>
        <span><strong>{average === null ? '—' : `${average.toFixed(1)}%`}</strong> career memory score</span>
      </div>}
    </section>
    {error ? <div className="notice error" role="alert">{error}</div> : records.length === 0
      ? <section className="record-empty"><h2>Your book is waiting</h2><p>Complete a fixture and it will appear here.</p><a href="/play">Play a fixture →</a></section>
      : <>
        <section className="record-controls" aria-label="Filter and sort records">
          <label>Club<select value={filters.club} onChange={(event) => setFilters({ ...filters, club: event.target.value })}><option value="">All clubs</option>{clubs.map((club) => <option key={club} value={club}>{club}</option>)}</select></label>
          <label>Competition<select value={filters.competition} onChange={(event) => setFilters({ ...filters, competition: event.target.value })}><option value="">All competitions</option>{competitions.map((competition) => <option key={competition} value={competition}>{competition}</option>)}</select></label>
          <label>Season<select value={filters.season} onChange={(event) => setFilters({ ...filters, season: event.target.value })}><option value="">All seasons</option>{seasons.map((season) => <option key={season} value={season}>{season}/{String(season + 1).slice(-2)}</option>)}</select></label>
          <label>Memory score<select value={filters.score} onChange={(event) => setFilters({ ...filters, score: event.target.value })}><option value="">All scores</option><option value="0-24">0–24%</option><option value="25-49">25–49%</option><option value="50-74">50–74%</option><option value="75-100">75–100%</option></select></label>
          <label>Sort by<select value={filters.sort} onChange={(event) => setFilters({ ...filters, sort: event.target.value as RecordFilters['sort'] })}><option value="newest">Recently played</option><option value="oldest">First played</option><option value="score-high">Highest score</option><option value="score-low">Lowest score</option><option value="club">Home club</option><option value="competition">Competition</option><option value="season">Season</option></select></label>
          <button type="button" onClick={() => setFilters(initialFilters)}>Clear filters</button>
        </section>
        <p className="record-count" role="status">Showing {filtered.length} of {records.length} {records.length === 1 ? 'match' : 'matches'}</p>
        {filtered.length === 0 ? <div className="record-empty"><h2>No matches found</h2><p>Try changing or clearing your filters.</p></div> :
          <ol className="record-list">{filtered.map((record) => <li className="record-row" key={`${record.fixtureId ?? 'unknown'}-${record.index}`}>
            <div className="record-match"><span className="record-meta">{record.competition ?? 'Competition unavailable'} · {matchDate(record.matchDate)}{record.season !== null && ` · ${record.season}/${String(record.season + 1).slice(-2)}`}</span>
              <strong>{record.homeTeam ?? 'Home club unavailable'} <span className="record-result">{record.homeGoals === null || record.awayGoals === null ? 'v' : `${record.homeGoals}–${record.awayGoals}`}</span> {record.awayTeam ?? 'Away club unavailable'}</strong>
            </div>
            <div className="record-score"><strong>{record.percentage === null ? '—' : `${record.percentage}%`}</strong><span>Memory score</span></div>
          </li>)}</ol>}
      </>}
  </main>;
}
