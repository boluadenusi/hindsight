import { useEffect, useRef, useState } from 'react';
import { calculateCareerStats } from './memoryScore';
import type { DrawPreference } from './drawPreference';
import './Landing.css';

type LandingPageProps = {
  onPlay: () => void;
  onDrawNew: () => void;
  drawPreference: DrawPreference;
  onDrawPreferenceChange: (preference: DrawPreference) => void;
  preferenceError: string;
};

type SavedPrediction = {
  fixtureId?: number;
  fixtureSnapshot?: {
    game_date?: string;
    home_team?: string;
    away_team?: string;
  };
  result?: unknown;
  evaluation?: {
    percentage: number;
  } | null;
};

type WarmupQuestion = {
  id: number;
  type: 'player' | 'team' | 'league' | 'manager';
  question: string;
};

type WarmupAnswer = {
  answer: string;
  detail: string;
};

const PERFORMANCE_MARKS: Record<string, string> = {
  above: '▲',
  below: '▼',
  baseline: '●',
  level: '◆',
};

function readHistory(): SavedPrediction[] {
  try {
    const parsed = JSON.parse(localStorage.getItem('hindsight.predictions') || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const WARMUP_SEEN_KEY = 'hindsight.warmupQuestionIds';

function readSeenWarmupIds(): number[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(WARMUP_SEEN_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((id): id is number => Number.isSafeInteger(id) && id > 0)
      .slice(-20);
  } catch {
    return [];
  }
}

function rememberWarmupQuestion(id: number): void {
  const seen = readSeenWarmupIds().filter((seenId) => seenId !== id);
  seen.push(id);
  try {
    localStorage.setItem(WARMUP_SEEN_KEY, JSON.stringify(seen.slice(-20)));
  } catch {
    // The archive still works when storage is unavailable.
  }
}

function withFullStop(value: string): string {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function matchFormColor(score: number): string {
  const hue = Math.round(Math.max(0, Math.min(100, score)) * 1.2);
  return `hsl(${hue} 68% 42%)`;
}

export function LandingPage({ onPlay, onDrawNew, drawPreference, onDrawPreferenceChange, preferenceError }: LandingPageProps) {
  const [clubs, setClubs] = useState<{ id: number; name: string }[] | null>(null);
  const [clubsError, setClubsError] = useState('');
  const [clubsRetry, setClubsRetry] = useState(0);
  const [warmup, setWarmup] = useState<WarmupQuestion | null>(null);
  const [warmupAnswer, setWarmupAnswer] = useState<WarmupAnswer | null>(null);
  const [warmupLoading, setWarmupLoading] = useState(true);
  const [warmupRevealing, setWarmupRevealing] = useState(false);
  const [warmupError, setWarmupError] = useState('');
  const warmupRequestRef = useRef(0);
  const currentWarmupIdRef = useRef<number | null>(null);

  // Read player career record from browser storage
  const history = readHistory();
  const stats = calculateCareerStats(history);
  const isReturningPlayer = stats.totalPlayed > 0;
  let hasActiveFixture = false;
  try { hasActiveFixture = localStorage.getItem('hindsight.activeFixture') !== null; } catch { /* Storage is optional. */ }
  const needsClub = drawPreference.mode === 'supporter' && drawPreference.clubId === null;
  const canResume = hasActiveFixture || !!history.at(-1)?.fixtureSnapshot;
  const cannotStart = needsClub && !canResume;

  useEffect(() => {
    if (drawPreference.mode !== 'supporter' || clubs !== null) return;
    const controller = new AbortController();
    setClubsError('');
    fetch('/api/clubs', { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || 'Could not load clubs.');
        return payload as { id: number; name: string }[];
      })
      .then(setClubs)
      .catch((cause: Error) => { if (cause.name !== 'AbortError') setClubsError(cause.message); });
    return () => controller.abort();
  }, [drawPreference.mode, clubs, clubsRetry]);

  // The most recent completed match with a saved snapshot. Locked-but-unrevealed
  // fixtures are skipped so the stub always describes a match that actually finished.
  const recentMatches = history.filter(
    (item) => item?.fixtureSnapshot && item?.result && typeof item?.evaluation?.percentage === 'number'
  ).slice(-5);

  async function loadWarmup(excludeId?: number, signal?: AbortSignal) {
    const requestId = ++warmupRequestRef.current;
    setWarmupLoading(true);
    setWarmupError('');
    setWarmupAnswer(null);
    setWarmup(null);
    currentWarmupIdRef.current = null;

    const seen = readSeenWarmupIds();
    const excluded = seen.filter((id) => id !== excludeId);
    if (excludeId) excluded.push(excludeId);
    const query = excluded.length ? `?exclude=${excluded.slice(-20).join(',')}` : '';

    try {
      const response = await fetch(`/api/warmup${query}`, {
        headers: { Accept: 'application/json' },
        signal,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(payload?.message || 'The archive is unavailable right now.');
      }
      const data = await response.json() as WarmupQuestion;
      if (signal?.aborted || requestId !== warmupRequestRef.current) return;
      currentWarmupIdRef.current = data.id;
      setWarmup(data);
      rememberWarmupQuestion(data.id);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (!signal?.aborted && requestId === warmupRequestRef.current) {
        setWarmupError(error instanceof Error ? error.message : 'The archive is unavailable right now.');
      }
    } finally {
      if (!signal?.aborted && requestId === warmupRequestRef.current) setWarmupLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void loadWarmup(undefined, controller.signal);
    return () => controller.abort();
    // The archive draw is intentionally made once per landing visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function revealWarmup() {
    if (!warmup || warmupAnswer || warmupRevealing) return;
    const questionId = warmup.id;
    setWarmupRevealing(true);
    setWarmupError('');
    try {
      const response = await fetch(`/api/warmup/${questionId}/reveal`, { method: 'POST' });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(payload?.message || 'The answer is unavailable right now.');
      }
      const data = await response.json() as WarmupAnswer;
      if (currentWarmupIdRef.current === questionId) setWarmupAnswer(data);
    } catch (error) {
      setWarmupError(error instanceof Error ? error.message : 'The answer is unavailable right now.');
    } finally {
      setWarmupRevealing(false);
    }
  }

  function anotherWarmup() {
    if (warmupLoading || warmupRevealing) return;
    void loadWarmup(warmup?.id);
  }

  return (
    <div className="landing-shell">
      {/* Masthead */}
      <header className="landing-masthead">
        <div className="masthead-brand">
          <a href="/" className="wordmark" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
            Hindsight<span className="period">.</span>
          </a>
        </div>
        <nav className="landing-nav" aria-label="Main Navigation">
          <a href="/how-to-play" className="nav-link">How to Play</a>
          <a href="/record-book" className="nav-link record-book-nav-link">Record Book</a>
          <a href="#features" className="nav-link">The Archive</a>
          {isReturningPlayer && (
            <span className="nav-career-badge">
              {stats.totalPlayed} {stats.totalPlayed === 1 ? 'Match' : 'Matches'} · {stats.runningAverage.toFixed(1)}%
            </span>
          )}
          <button type="button" className="nav-play-button" onClick={onPlay} disabled={cannotStart}>
            {isReturningPlayer ? 'Resume Season →' : 'Kick Off →'}
          </button>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="landing-hero" aria-labelledby="hero-title">
        <div className="hero-content">
          <h1 id="hero-title" className="hero-title">
            Remember the score?
          </h1>
          <p className="hero-lede">
           Everyone says they knew it all along. This checks if you really did.
          </p>

          <section className="draw-settings" aria-labelledby="draw-settings-title">
            <h2 id="draw-settings-title">Choose your draw</h2>
            <p>Both modes count toward the same career record. Your choice applies to the next fixture.</p>
            <fieldset className="draw-modes">
              <legend>Match selection</legend>
              <label className="draw-mode"><input type="radio" name="draw-mode" checked={drawPreference.mode === 'free'} onChange={() => onDrawPreferenceChange({ mode: 'free', clubId: drawPreference.clubId })} /><span><strong>Free for all</strong><small>Any eligible match in the archive</small></span></label>
              <label className="draw-mode"><input type="radio" name="draw-mode" checked={drawPreference.mode === 'supporter'} onChange={() => onDrawPreferenceChange({ mode: 'supporter', clubId: drawPreference.clubId })} /><span><strong>Supporter</strong><small>Only matches involving your club</small></span></label>
            </fieldset>
            {drawPreference.mode === 'supporter' && <div className="draw-club">
              <label htmlFor="supporter-club">Your club</label>
              <select id="supporter-club" value={drawPreference.clubId ?? ''} disabled={clubs === null} onChange={(event) => onDrawPreferenceChange({ mode: 'supporter', clubId: event.target.value ? Number(event.target.value) : null })}>
                <option value="">{clubs === null ? 'Loading clubs…' : 'Choose a club'}</option>
                {clubs?.map((club) => <option value={club.id} key={club.id}>{club.name}</option>)}
              </select>
              {clubsError && <p className="form-error" role="alert">{clubsError} <button type="button" onClick={() => setClubsRetry((count) => count + 1)}>Try again</button></p>}
              {clubs && clubs.length === 0 && <p className="form-error" role="status">No clubs have eligible fixtures in the archive.</p>}
            </div>}
            {preferenceError && <p className="form-error" role="status">{preferenceError}</p>}
            {needsClub && <p role="status">Choose a club before drawing a supporter fixture.</p>}
          </section>

          <div className="hero-actions">
            <button type="button" className="hero-cta-button" onClick={onPlay} disabled={cannotStart}>
              <svg className="cta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7.2l3.4 2.5-1.3 4h-4.2l-1.3-4L12 7.2z" />
                <path d="M12 3v4.2M4.4 9.3l3.8.4M19.6 9.3l-3.8.4M7.3 20.1l2.6-6.4M16.7 20.1l-2.6-6.4" />
              </svg>
              <span className="cta-text">
                <strong>{isReturningPlayer ? 'Pick up where you left off' : 'Step up for today\'s fixture'}</strong>
              </span>
              <span className="cta-arrow" aria-hidden="true">→</span>
            </button>
            {hasActiveFixture && <>
              <button type="button" className="draw-new-button" onClick={onDrawNew} disabled={needsClub}>Draw a new fixture</button>
              <p className="draw-replace-note">This replaces your current fixture and clears any unlocked calls. Resume to keep it.</p>
            </>}
          </div>
        </div>

        {/* Vintage Matchday Pass / Season Ticket */}
        <div className="hero-ticket-container">
          <div className="matchday-ticket">
            <div className="ticket-main-row">
              <div className="ticket-stub">
                <span className="stub-series">GAMES FROM 2012</span>
                <span className="stub-barcode" aria-hidden="true">||| | | |||| | || | |||</span>
                <span className="stub-turnstile">TURNSTILE A</span>
              </div>
              <div className="ticket-main">
                <div className="ticket-header">
                  <span className="ticket-type">
                    {isReturningPlayer ? 'SEASON TICKET — YOUR SEAT IS WAITING' : 'MATCHDAY PASS — ADMIT ONE'}
                  </span>
                </div>
                <div className="ticket-body">
                  {isReturningPlayer ? (
                    <div className="ticket-stats-grid">
                      <div className="ticket-stat">
                        <span className="tstat-label">FIXTURES PLAYED</span>
                        <strong className="tstat-val">{stats.totalPlayed}</strong>
                      </div>
                      <div className="ticket-stat">
                        <span className="tstat-label">MEMORY SCORE</span>
                        <strong className="tstat-val highlight">{stats.runningAverage.toFixed(1)}%</strong>
                      </div>
                      <div className="ticket-status-note">
                        <span className="ticket-status-icon" aria-hidden="true">
                          {PERFORMANCE_MARKS[stats.performance] || '◆'}
                        </span>
                        <span>{stats.statusText}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="ticket-perks">
                      
                      <div className="ticket-perk">
                        <span className="perk-bullet">✦</span>
                        <span>Full 11v11 Lineups &amp; Substitutes Bench</span>
                      </div>
                      <div className="ticket-perk">
                        <span className="perk-bullet">✦</span>
                        <span>Tactical Formations &amp; Form Guides</span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="ticket-footer">
                  <button type="button" className="ticket-play-link" onClick={onPlay} disabled={cannotStart}>
                    KICK OFF→
                  </button>
                </div>
              </div>
            </div>

            {/* Recent memory scores, oldest to newest */}
            <div className="ticket-last-match">
              <span className="last-match-kicker">MATCH FORM</span>
              {recentMatches.length ? (
                <>
                  <div className="match-form-chart" role="list" aria-label="Memory score for your last five completed matches">
                    {recentMatches.map((item, index) => {
                      const score = Math.max(0, Math.min(100, item.evaluation?.percentage ?? 0));
                      const date = item.fixtureSnapshot?.game_date;
                      const dateLabel = date ? `${date.slice(5, 7)}/${date.slice(2, 4)}` : `#${index + 1}`;
                      const title = `${item.fixtureSnapshot?.home_team || 'Home'} v ${item.fixtureSnapshot?.away_team || 'Away'}${date ? ` · ${date}` : ''}: ${score}% memory score`;
                      return (
                        <div className="match-form-item" role="listitem" aria-label={title} title={title} key={item.fixtureId ?? `${date}-${index}`}>
                          <span className="match-form-score">{score}%</span>
                          <span className="match-form-track" aria-hidden="true">
                            <span className="match-form-bar" style={{ height: `${score}%`, backgroundColor: matchFormColor(score) }} />
                          </span>
                          <span className="match-form-date">{dateLabel}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="match-form-scale" aria-hidden="true">
                    <span>0%</span><span className="match-form-gradient" /><span>100%</span>
                  </div>
                  <p className="match-form-order"><span>Oldest</span><span>Newest</span></p>
                </>
              ) : (
                <p>No match yet. Your first ticket is waiting.</p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Matchday Warmup Teaser Card */}
      <section className="warmup-section" aria-labelledby="warmup-title">
        <div className="warmup-card">
          <div className="warmup-header">
            <span className="eyebrow">MATCHDAY WARMUP</span>
            <h3 id="warmup-title">Remember this one?</h3>
          </div>

          {warmupLoading ? (
            <p className="warmup-prompt warmup-loading" role="status">Opening the archive…</p>
          ) : warmup ? (
            <>
              <div className="warmup-question-block">
                <p className="warmup-question">{warmup.question}</p>
                {warmupAnswer && (
                  <div className="warmup-reveal" aria-live="polite">
                    <span className="warmup-answer-label">Answer</span>
                    <p className="warmup-answer">{withFullStop(warmupAnswer.answer)}</p>
                    <p className="warmup-detail">{warmupAnswer.detail}</p>
                  </div>
                )}
              </div>

              <div className="warmup-interaction">
                <button
                  type="button"
                  className={`warmup-flip-button${warmupAnswer ? ' flipped' : ''}`}
                  onClick={revealWarmup}
                  disabled={!!warmupAnswer || warmupRevealing}
                  aria-busy={warmupRevealing}
                >
                  {warmupRevealing ? 'Opening the archive…' : warmupAnswer ? 'Revealed' : 'Show me what happened'}
                </button>
                <button type="button" className="warmup-again-link" onClick={anotherWarmup} disabled={warmupLoading || warmupRevealing}>
                  Another one →
                </button>
                <span className="warmup-hint">
                  {warmupRevealing
                    ? 'Fetching the answer…'
                    : warmupAnswer
                      ? 'One for the scrapbooks.'
                      : 'Get some steps in before the big one.'}
                </span>
              </div>
              {warmupError && <p className="warmup-error" role="alert">{warmupError}</p>}
            </>
          ) : (
            <div className="warmup-error-state">
              <p className="warmup-prompt">{warmupError || 'The archive is unavailable right now.'}</p>
              <button type="button" className="warmup-again-link" onClick={anotherWarmup}>
                Try another one →
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Purist Features — enamel ground-rules sign */}
      <section id="features" className="features-section" aria-labelledby="features-title">
        <div className="rules-sign">
          <div className="rules-sign-inner">
            <span className="rules-rivet rules-rivet-tl" aria-hidden="true"></span>
            <span className="rules-rivet rules-rivet-tr" aria-hidden="true"></span>
            <span className="rules-rivet rules-rivet-bl" aria-hidden="true"></span>
            <span className="rules-rivet rules-rivet-br" aria-hidden="true"></span>

            <header className="rules-sign-head">
              <h2 id="features-title">As much as you can remember</h2>
            </header>

            <div className="rules-grid">
              <article className="rules-cell">
                <span className="rules-number" aria-hidden="true">1</span>
                <h4>No Odds, No Betting</h4>
                <p>No odds. No bookmakers. No gambling. Just football knowledge.</p>
              </article>

              <article className="rules-cell">
                <span className="rules-number" aria-hidden="true">2</span>
                <h4>Interactive Tactical Pitch</h4>
                <p>Teams laid out on a chalkboard pitch in their real formations. Tap to pick your scorers.</p>
              </article>

              <article className="rules-cell">
                <span className="rules-number" aria-hidden="true">3</span>
                <h4>Pre-Match Form Guide</h4>
                <p>The last five matches before kickoff — every competition. Momentum laid bare.</p>
              </article>

              <article className="rules-cell">
                <span className="rules-number" aria-hidden="true">4</span>
                <h4>Memory Score</h4>
                <p>Every fixture scored as the percentage of it you remembered. Your career average stays honest across eras.</p>
              </article>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-top">
          <span className="footer-logo">Hindsight<span className="period">.</span></span>
          <span className="footer-copy">"Remember the score?"</span>
          <div className="footer-links">
            <a className="footer-malt" href="https://buymeamalt.com/@boluadenusi" target="_blank" rel="noopener noreferrer">Buy me a malt</a>
            <a className="footer-x" href="https://x.com/@boluadenusi">Boluwatife on X</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
