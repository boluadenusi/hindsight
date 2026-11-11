{/* SAMPLE PROGRAMME CARD — ANNOTATED */}
        <section className="sample-programme" aria-labelledby="sample-title">
          <div className="sample-wrapper perforated-top perforated-bottom">
            <span className="sample-badge">Sample fixture</span>

            {/* Annotated card wrapper with notes and arrows */}
            <div className="annotated-card-wrapper perforated-top perforated-bottom">
              <article className="programme-card annotated">
                <div className="programme-header" id="card-header">
                  <div className="programme-competition">{sampleFixture.competition}</div>
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
                    <span className="seal-stamp" id="seal-stamp">SEALED</span>
                    <h3>Predictions entered</h3>
                  </div>
                  <div className="predictions-grid">
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

                {/* Ticket stub for career tracking */}
                <div className="career-stub" id="career-stub">
                  <span className="stub-label">Career Ticket</span>
                  <span className="stub-value">0 fixtures played</span>
                </div>
              </article>

              {/* Handwritten notes with arrows */}
              <div className="handwritten-notes" aria-label="Step annotations">
                {/* Note 1: Pick a fixture → Card header */}
                <aside className="hand-note hand-note-1" data-target="card-header">
                  <svg className="hand-arrow" viewBox="0 0 100 50" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M10 25 Q 50 10 90 25" stroke="var(--red)" stroke-width="1.5" fill="none" stroke-linecap="round"/>
                    <polygon points="85,20 95,25 85,30" fill="var(--red)"/>
                  </svg>
                  <div className="hand-note-content">
                    <span className="hand-number">1.</span>
                    <span className="hand-text">Pick a fixture</span>
                  </div>
                </aside>

                {/* Note 2: Read the lineups → Teamsheet */}
                <aside className="hand-note hand-note-2" data-target="lineups">
                  <svg className="hand-arrow" viewBox="0 0 100 50" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M10 25 Q 50 10 90 25" stroke="var(--red)" stroke-width="1.5" fill="none" stroke-linecap="round"/>
                    <polygon points="85,20 95,25 85,30" fill="var(--red)"/>
                  </svg>
                  <div className="hand-note-content">
                    <span className="hand-number">2.</span>
                    <span className="hand-text">Read the lineups</span>
                  </div>
                </aside>

                {/* Note 3: Weigh the form → Last five results */}
                <aside className="hand-note hand-note-3" data-target="form-guide">
                  <svg className="hand-arrow" viewBox="0 0 100 50" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M10 25 Q 50 10 90 25" stroke="var(--red)" stroke-width="1.5" fill="none" stroke-linecap="round"/>
                    <polygon points="85,20 95,25 85,30" fill="var(--red)"/>
                  </svg>
                  <div className="hand-note-content">
                    <span className="hand-number">3.</span>
                    <span className="hand-text">Weigh the form</span>
                  </div>
                </aside>

                {/* Note 4: Make your calls → Prediction boxes */}
                <aside className="hand-note hand-note-4" data-target="predictions">
                  <svg className="hand-arrow" viewBox="0 0 100 50" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M90 25 Q 50 10 10 25" stroke="var(--red)" stroke-width="1.5" fill="none" stroke-linecap="round"/>
                    <polygon points="15,20 5,25 15,30" fill="var(--red)"/>
                  </svg>
                  <div className="hand-note-content">
                    <span className="hand-number">4.</span>
                    <span className="hand-text">Make your calls</span>
                  </div>
                </aside>

                {/* Note 5: Seal it → SEALED stamp */}
                <aside className="hand-note hand-note-5" data-target="seal-stamp">
                  <svg className="hand-arrow" viewBox="0 0 100 50" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M90 25 Q 50 10 10 25" stroke="var(--red)" stroke-width="1.5" fill="none" stroke-linecap="round"/>
                    <polygon points="15,20 5,25 15,30" fill="var(--red)"/>
                  </svg>
                  <div className="hand-note-content">
                    <span className="hand-number">5.</span>
                    <span className="hand-text">Seal it</span>
                  </div>
                </aside>

                {/* Note 6: Track your career → Ticket stub */}
                <aside className="hand-note hand-note-6" data-target="career-stub">
                  <svg className="hand-arrow" viewBox="0 0 100 50" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M50 10 Q 50 25 50 40" stroke="var(--red)" stroke-width="1.5" fill="none" stroke-linecap="round"/>
                    <polygon points="45,35 50,45 55,35" fill="var(--red)"/>
                  </svg>
                  <div className="hand-note-content">
                    <span className="hand-number">6.</span>
                    <span className="hand-text">Track your career</span>
                  </div>
                </aside>
              </div>
            </div>
          </div>
        </section>