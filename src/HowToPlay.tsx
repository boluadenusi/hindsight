import { useEffect, useMemo } from 'react';
import './HowToPlay.css';
import { BADGES, BADGE_GROUPS, readStoredBadges, evaluateEarnedBadges, type BadgeId } from './badges';
import { BadgeStamp } from './BadgeStamp';
import { CALL_POINTS, HINT_SCORE_PENALTIES, MATCH_SCORE_MAX, MATCH_SCORE_MIN, TOTAL_CALL_POINTS } from './scoringConfig';

export function HowToPlay({ onHome }: { onHome: () => void }) {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Inked stamps: stored ids plus anything the locked history already qualifies for.
  const earnedBadges = useMemo(() => {
    const earned = new Set<BadgeId>(readStoredBadges());
    try {
      const history = JSON.parse(localStorage.getItem('hindsight.predictions') || '[]');
      for (const id of evaluateEarnedBadges(history)) earned.add(id);
    } catch {
      /* No readable history: only stored stamps are inked. */
    }
    return earned;
  }, []);

  // Custom inline SVG icons
  const icons = {
    fixture: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="1" />
        <path d="M12 5v14" />
        <circle cx="12" cy="12" r="2.4" />
        <path d="M3 9.4h2.6v5.2H3M21 9.4h-2.6v5.2H21" />
      </svg>
    ),
    pitch: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="4" width="20" height="16" rx="1.5" />
        <path d="M12 4v16" />
        <circle cx="12" cy="12" r="3" />
        <path d="M2 8.5h3v7H2M21 8.5h-3v7h3" />
      </svg>
    ),
    form: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9.5 6.5h11M9.5 12h11M9.5 17.5h11" />
        <path d="M4 6.5l1.2 1.3L7.2 5.6M4 12l1.2 1.3 2-2.2M4 17.5l1.2 1.3 2-2.2" />
      </svg>
    ),
    calls: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 5v14h16" />
        <path d="M7.6 15.6l3.4-4 3 2.2 4-6.2" />
      </svg>
    ),
    seal: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3l7 2.5v5.1c0 4.2-2.9 7.7-7 9.4-4.1-1.7-7-5.2-7-9.4V5.5L12 3z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
    career: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </svg>
    ),
    totalGoals: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4M10 12h4" />
        <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
      </svg>
    ),
    firstTeam: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 3v18" />
        <path d="M7 4h11l-3 4 3 4H7" />
      </svg>
    ),
    firstScorer: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M8.5 4L12 5.5 15.5 4l4 2-1.8 3.6-2.2-.9V20H8.5V8.7l-2.2.9L4.5 6l4-2z" />
        <path d="M10 14.5h4" />
      </svg>
    ),
    goalCount: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="1.5" />
        <path d="M7 8h10M7 12h4M7 16h10" />
      </svg>
    ),
    spotlight: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M8 4h8l3 8H5l3-8Z" />
        <path d="M12 12v7M9 20h6M7 2 5.5 1M17 2l1.5-1" />
      </svg>
    ),
  };

  // Sample fixture data (hardcoded)
  const sampleFixture = {
    id: 0,
    game_date: '2024-03-10',
    competition: 'PREMIER LEAGUE',
    home_team: 'Arsenal',
    away_team: 'Liverpool',
    home_formation: '4-3-3',
    away_formation: '4-3-3',
    home_lineup: [
      { id: 1, name: 'Raya', position: 'Goalkeeper', shirtNumber: '1' },
      { id: 2, name: 'White', position: 'Right Back', shirtNumber: '4' },
      { id: 3, name: 'Saliba', position: 'Centre Back', shirtNumber: '12' },
      { id: 4, name: 'Gabriel', position: 'Centre Back', shirtNumber: '6' },
      { id: 5, name: 'Zinchenko', position: 'Left Back', shirtNumber: '17' },
      { id: 6, name: 'Rice', position: 'Defensive Mid', shirtNumber: '41' },
      { id: 7, name: 'Ødegaard', position: 'Attacking Mid', shirtNumber: '8' },
      { id: 8, name: 'Havertz', position: 'Attacking Mid', shirtNumber: '29' },
      { id: 9, name: 'Saka', position: 'Right Wing', shirtNumber: '7' },
      { id: 10, name: 'Martinelli', position: 'Left Wing', shirtNumber: '11' },
      { id: 11, name: 'Jesus', position: 'Striker', shirtNumber: '9' },
    ],
    away_lineup: [
      { id: 12, name: 'Alisson', position: 'Goalkeeper', shirtNumber: '1' },
      { id: 13, name: 'Alexander-Arnold', position: 'Right Back', shirtNumber: '66' },
      { id: 14, name: 'Van Dijk', position: 'Centre Back', shirtNumber: '4' },
      { id: 15, name: 'Konaté', position: 'Centre Back', shirtNumber: '5' },
      { id: 16, name: 'Robertson', position: 'Left Back', shirtNumber: '26' },
      { id: 17, name: 'Mac Allister', position: 'Defensive Mid', shirtNumber: '10' },
      { id: 18, name: 'Szoboszlai', position: 'Attacking Mid', shirtNumber: '8' },
      { id: 19, name: 'Jones', position: 'Attacking Mid', shirtNumber: '17' },
      { id: 20, name: 'Salah', position: 'Right Wing', shirtNumber: '11' },
      { id: 21, name: 'Núñez', position: 'Striker', shirtNumber: '9' },
      { id: 22, name: 'Díaz', position: 'Left Wing', shirtNumber: '7' },
    ],
    home_subs: [
      { id: 23, name: 'Ramsdale', position: 'Goalkeeper', shirtNumber: '32' },
      { id: 24, name: 'Tomiyasu', position: 'Right Back', shirtNumber: '18' },
      { id: 25, name: 'Kiwior', position: 'Centre Back', shirtNumber: '15' },
      { id: 26, name: 'Jorginho', position: 'Defensive Mid', shirtNumber: '20' },
      { id: 27, name: 'Trossard', position: 'Left Wing', shirtNumber: '19' },
    ],
    away_subs: [
      { id: 28, name: 'Kelleher', position: 'Goalkeeper', shirtNumber: '62' },
      { id: 29, name: 'Gomez', position: 'Centre Back', shirtNumber: '2' },
      { id: 30, name: 'Endo', position: 'Defensive Mid', shirtNumber: '3' },
      { id: 31, name: 'Elliott', position: 'Attacking Mid', shirtNumber: '19' },
      { id: 32, name: 'Gakpo', position: 'Left Wing', shirtNumber: '18' },
    ],
    home_form: [
      { id: 1, game_date: '2024-03-02', competition: 'PREMIER LEAGUE', result: 'W', venue: 'H', opponent: 'Brentford', score: '2-1' },
      { id: 2, game_date: '2024-02-24', competition: 'PREMIER LEAGUE', result: 'W', venue: 'A', opponent: 'Newcastle', score: '4-1' },
      { id: 3, game_date: '2024-02-17', competition: 'PREMIER LEAGUE', result: 'W', venue: 'H', opponent: 'Burnley', score: '5-0' },
      { id: 4, game_date: '2024-02-11', competition: 'PREMIER LEAGUE', result: 'D', venue: 'A', opponent: 'West Ham', score: '2-2' },
      { id: 5, game_date: '2024-02-04', competition: 'PREMIER LEAGUE', result: 'W', venue: 'H', opponent: 'Liverpool', score: '3-1' },
    ],
    away_form: [
      { id: 1, game_date: '2024-03-03', competition: 'PREMIER LEAGUE', result: 'W', venue: 'H', opponent: 'Nottingham Forest', score: '1-0' },
      { id: 2, game_date: '2024-02-25', competition: 'PREMIER LEAGUE', result: 'W', venue: 'A', opponent: 'Luton', score: '4-1' },
      { id: 3, game_date: '2024-02-21', competition: 'PREMIER LEAGUE', result: 'W', venue: 'H', opponent: 'Brentford', score: '4-1' },
      { id: 4, game_date: '2024-02-17', competition: 'PREMIER LEAGUE', result: 'W', venue: 'A', opponent: 'Burnley', score: '3-1' },
      { id: 5, game_date: '2024-02-10', competition: 'PREMIER LEAGUE', result: 'D', venue: 'H', opponent: 'Arsenal', score: '1-1' },
    ],
  };

  // Sample predictions on the card
  const samplePredictions = {
    resultCall: 'home' as const,
    homeScore: 2,
    awayScore: 1,
    totalGoals: 3,
    firstTeamToScore: 'home',
    firstGoalscorerId: 11, // Jesus
    goalscorerIds: [11, 11, 20], // Jesus brace, Salah
  };

  return (
    <div className="landing-shell how-shell">
      {/* Masthead */}
      <header className="landing-masthead">
        <div className="masthead-brand">
          <a href="/" className="wordmark" onClick={(e) => { e.preventDefault(); onHome(); }}>
            Hindsight<span className="period">.</span>
          </a>
        </div>
        <nav className="landing-nav" aria-label="Main Navigation">
          <a href="#features" className="nav-link">The Archive</a>
          <button type="button" className="nav-play-button" onClick={onHome}>
            Back to Turnstiles
          </button>
        </nav>
      </header>

      <main className="how-main">
        {/* Hero / Intro */}
        <section className="how-hero" aria-labelledby="how-title">
          <div className="how-hero-content">
            <p className="eyebrow">HOW TO PLAY</p>
            <h1 id="how-title">Remember the score?</h1>
            <p className="how-lede">
              A match has already been played. The programme is in your hands. Can you call what happened?
            </p>
          </div>
        </section>

        {/* SAMPLE PROGRAMME CARD — ANNOTATED */}
        <section className="sample-programme" aria-labelledby="sample-title">
          <div className="sample-wrapper">

            {/* Annotated card wrapper with notes and arrows */}
            <div className="annotated-card-wrapper perforated-top perforated-bottom">
              <article className="programme-card annotated">
                <div className="programme-header" id="card-header">
                  <div className="programme-competition"><span className="sample-step-tag">Pick a fixture</span>{sampleFixture.competition}</div>
                  <div className="programme-date">
                    <time dateTime={sampleFixture.game_date}>
                      {new Date(`${sampleFixture.game_date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    </time>
                  </div>
                  <div className="programme-teams">
                    <span className="team home">{sampleFixture.home_team}</span>
                    <span className="versus">v</span>
                    <span className="team away">{sampleFixture.away_team}</span>
                  </div>
                  <div className="formations">
                    <span className="formation home">{sampleFixture.home_formation}</span>
                    <span className="formation away">{sampleFixture.away_formation}</span>
                  </div>
                </div>

                <div className="programme-body" id="lineups">
                  {/* Home lineup */}
                  <div className="lineup-block home">
                    <div className="lineup-heading">
                      <span className="lineup-label">Starting Eleven</span>
                      <span className="team-name home">{sampleFixture.home_team}</span>
                    </div>
                    <ol className="lineup">
                      {sampleFixture.home_lineup.map((player) => (
                        <li key={player.id} className={samplePredictions.goalscorerIds.includes(player.id) ? 'predicted' : ''}>
                          <span className="shirt-number">{player.shirtNumber}</span>
                          <span className="player-name">{player.name}</span>
                          <span className="position">{player.position}</span>
                          {samplePredictions.goalscorerIds.filter(id => id === player.id).length > 0 && (
                            <span className="goal-badge">{samplePredictions.goalscorerIds.filter(id => id === player.id).length}⚽</span>
                          )}
                        </li>
                      ))}
                    </ol>
                    <div className="subs-heading">Substitutes</div>
                    <ol className="lineup subs">
                      {sampleFixture.home_subs.map((player) => (
                        <li key={player.id}>
                          <span className="shirt-number">{player.shirtNumber}</span>
                          <span className="player-name">{player.name}</span>
                          <span className="position">{player.position}</span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  {/* Away lineup */}
                  <div className="lineup-block away">
                    <div className="lineup-heading">
                      <span className="lineup-label">Starting Eleven</span>
                      <span className="team-name away">{sampleFixture.away_team}</span>
                    </div>
                    <ol className="lineup">
                      {sampleFixture.away_lineup.map((player) => (
                        <li key={player.id} className={samplePredictions.goalscorerIds.includes(player.id) ? 'predicted' : ''}>
                          <span className="shirt-number">{player.shirtNumber}</span>
                          <span className="player-name">{player.name}</span>
                          <span className="position">{player.position}</span>
                          {samplePredictions.goalscorerIds.filter(id => id === player.id).length > 0 && (
                            <span className="goal-badge">{samplePredictions.goalscorerIds.filter(id => id === player.id).length}⚽</span>
                          )}
                        </li>
                      ))}
                    </ol>
                    <div className="subs-heading">Substitutes</div>
                    <ol className="lineup subs">
                      {sampleFixture.away_subs.map((player) => (
                        <li key={player.id}>
                          <span className="shirt-number">{player.shirtNumber}</span>
                          <span className="player-name">{player.name}</span>
                          <span className="position">{player.position}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>

                {/* Form guide */}
                <div className="form-guide-block" id="form-guide">
                  <span className="sample-step-tag">Weigh the form</span>
                  <div className="form-guide-container">
                    <div className="form-guide-side home">
                      <div className="form-team-name">{sampleFixture.home_team}</div>
                      <div className="form-pills">
                        {sampleFixture.home_form.map((m) => (
                          <span key={m.id} className={`form-pill result-${m.result}`} title={`${m.result === 'W' ? 'Win' : m.result === 'D' ? 'Draw' : 'Loss'} ${m.score} vs ${m.opponent}`}>
                            {m.result}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="form-separator" aria-hidden="true"></div>
                    <div className="form-guide-side away">
                      <div className="form-pills">
                        {sampleFixture.away_form.map((m) => (
                          <span key={m.id} className={`form-pill result-${m.result}`} title={`${m.result === 'W' ? 'Win' : m.result === 'D' ? 'Draw' : 'Loss'} ${m.score} vs ${m.opponent}`}>
                            {m.result}
                          </span>
                        ))}
                      </div>
                      <div className="form-team-name">{sampleFixture.away_team}</div>
                    </div>
                  </div>
                </div>

                {/* Predictions on the card */}
                <div className="predictions-block" id="predictions">
                  <div className="predictions-header">
                    <span className="sample-step-tag">Make your calls</span>
                  </div>
                  <div className="predictions-grid">
                    <div className="prediction-item">
                      <span className="pred-label">Result</span>
                      <span className="pred-value">{samplePredictions.resultCall === 'home' ? `${sampleFixture.home_team} win` : samplePredictions.resultCall === 'away' ? `${sampleFixture.away_team} win` : 'Draw'}</span>
                    </div>
                    <div className="prediction-item">
                      <span className="pred-label">Scoreline</span>
                      <span className="pred-value">{samplePredictions.homeScore} – {samplePredictions.awayScore}</span>
                    </div>
                    <div className="prediction-item">
                      <span className="pred-label">Total goals</span>
                      <span className="pred-value">{samplePredictions.totalGoals}</span>
                    </div>
                    <div className="prediction-item">
                      <span className="pred-label">First team to score</span>
                      <span className="pred-value">{samplePredictions.firstTeamToScore === 'home' ? sampleFixture.home_team : 'Away'}</span>
                    </div>
                    <div className="prediction-item">
                      <span className="pred-label">First goalscorer</span>
                      <span className="pred-value">
                        {sampleFixture.home_lineup.find(p => p.id === samplePredictions.firstGoalscorerId)?.name ||
                         sampleFixture.away_lineup.find(p => p.id === samplePredictions.firstGoalscorerId)?.name}
                      </span>
                    </div>
                    <div className="prediction-item full-width">
                      <span className="pred-label">Goalscorers</span>
                      <span className="pred-value">
                        {samplePredictions.goalscorerIds.map(id => {
                          const player = [...sampleFixture.home_lineup, ...sampleFixture.away_lineup].find(p => p.id === id);
                          const count = samplePredictions.goalscorerIds.filter(x => x === id).length;
                          return player ? `${player.name}${count > 1 ? ` (${count})` : ''}` : '';
                        }).join(', ')}
                      </span>
                    </div>
                  </div>
                </div>

                </article>

            </div>
          </div>
        </section>


        {/* Hints — BUY CLARITY */}
        <section className="how-hints" aria-labelledby="hints-title">
          <div className="section-head">
            <p className="eyebrow">BUY CLARITY</p>
            <h2 id="hints-title">Hints</h2>
            <p className="section-lede">Buy clarity before you lock in. Each hint deducts the amount shown on its card and can void the call it answers.</p>
          </div>
          <div className="hints-grid">
            <article className="hint-slip">
              <div className="hint-slip-icon">{icons.goalCount}</div>
              <h3>Goal count</h3>
              <p className="hint-slip-text">Reveals the exact total goals in the match. Your "Total goals" call is <strong>voided</strong> — it leaves both earned and maximum.</p>
              <span className="hint-stamp">−{HINT_SCORE_PENALTIES.goalCount} off match score</span>
            </article>
            <article className="hint-slip">
              <div className="hint-slip-icon">{icons.spotlight}</div>
              <h3>Spotlight</h3>
              <p className="hint-slip-text">Reveals one player who scored. "First goalscorer" is <strong>voided</strong> if it is that player, and scorer credit for them is removed.</p>
              <span className="hint-stamp">−{HINT_SCORE_PENALTIES.spotlight} off match score</span>
            </article>
            <article className="hint-slip">
              <div className="hint-slip-icon">{icons.firstTeam}</div>
              <h3>First Team</h3>
              <p className="hint-slip-text">Reveals which team scored first, or that there were no goals. Your "First team to score" call is <strong>voided</strong>.</p>
              <span className="hint-stamp">−{HINT_SCORE_PENALTIES.firstTeam} off match score</span>
            </article>
          </div>
        </section>

        {/* The Stamp Book */}
        <section className="how-stamps" aria-labelledby="stamps-title">
          <div className="section-head">
            <p className="eyebrow">STAMPS</p>
            <h2 id="stamps-title">The Stamp Book</h2>
            <p className="section-lede">Earn a stamp. Fill your book.</p>
          </div>
          {BADGE_GROUPS.map((group) => {
            const groupBadges = BADGES.filter((badge) => badge.group === group);
            if (groupBadges.length === 0) return null;
            return (
              <div className="stamp-group" key={group}>
                <p className="stamp-group-label">{group}</p>
                <div className="stamps-grid">
                  {groupBadges.map((badge) => (
                    <BadgeStamp key={badge.id} id={badge.id} earned={earnedBadges.has(badge.id)} />
                  ))}
                </div>
              </div>
            );
          })}
        </section>

        {/* Scoring Summary */}
        <section className="how-scoring" aria-labelledby="scoring-title">
          <div className="section-head">
            <p className="eyebrow">THE SCORING BOOK</p>
            <h2 id="scoring-title">How the numbers come together</h2>
          </div>
          <p className="section-lede">A match is scored as the percentage of it you remembered. Each call is worth points toward both what you earned and the maximum. A fully answerable match is worth {TOTAL_CALL_POINTS} call points. A blank call earns nothing but its points stay in the maximum, so skipping caps your percentage.</p>
          <table className="ratings-table" aria-label="Points each call is worth">
            <thead>
              <tr>
                <th scope="col">Your call</th>
                <th scope="col">Worth</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Result<span>Win, draw or loss</span></th>
                  <td className="points-positive">+{CALL_POINTS.result}</td>
              </tr>
              <tr>
                <th scope="row">Exact scoreline<span>On top of the result</span></th>
                <td className="points-positive">+{CALL_POINTS.scoreline}</td>
              </tr>
              <tr>
                <th scope="row">Total goals<span>Entered alone or from scoreline</span></th>
                <td className="points-positive">+{CALL_POINTS.totalGoals}</td>
              </tr>
              <tr>
                <th scope="row">First team to score<span>Home, away, or no goals</span></th>
                <td className="points-positive">+{CALL_POINTS.firstTeamToScore}</td>
              </tr>
              <tr>
                <th scope="row">First goalscorer<span>One player, or no goals</span></th>
                <td className="points-positive">+{CALL_POINTS.firstGoalscorer}</td>
              </tr>
              <tr>
                <th scope="row">Scorers<span>Partial credit, see below</span></th>
                <td className="points-positive">+{CALL_POINTS.scorers}</td>
              </tr>
            </tbody>
          </table>
          <div className="ratings-notes">
            <article className="rating-note">
              <h3>Scorers — partial credit</h3>
              <p>Scorers credit = matched goals ÷ max(actual goals, goals you predicted). Matched goals = for each player you picked, the lesser of the goals you predicted and the goals they scored. This stops naming the whole lineup to farm points.</p>
              <div className="rating-formula">
                <span>Scorer credit</span>
                <strong>matched ÷ max(actual, predicted)</strong>
              </div>
            </article>
            <article className="rating-note">
              <h3>Match score</h3>
              <p>Earned ÷ maximum × {MATCH_SCORE_MAX}, rounded. Never below {MATCH_SCORE_MIN} or above {MATCH_SCORE_MAX}. A blank call keeps its points in the maximum, so skipping lowers your percentage.</p>
              <div className="rating-formula">
                <span>Match score</span>
                <strong>earned ÷ maximum × {MATCH_SCORE_MAX}</strong>
              </div>
            </article>
            <article className="rating-note">
              <h3>Hints</h3>
              <p>Each hint deducts its listed percentage from your match score, floored at 0. Goal Count voids total goals; First Team voids first team to score; Spotlight voids first goalscorer if it revealed the first scorer, and removes scorer credit for that player.</p>
            </article>
            <article className="rating-note">
              <h3>Worked example</h3>
              <p><strong>3-2 home win.</strong> You enter 3-2, first team home (right), first scorer (right), scorers covering 2 of the 5 goals with 2 predicted. Earned = 1 + 2 + 1 + 1 + 1 + 0.4 = 6.4. Maximum = 7. Score = <strong>91%</strong>.</p>
            </article>
            <article className="rating-note">
              <h3>Career memory score</h3>
              <p>Average of every match score you've completed. After each match the record book tells you whether you finished above, below or level with your running average.</p>
            </article>
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
      </main>
    </div>
  );
}
