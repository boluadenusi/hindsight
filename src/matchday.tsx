import { useEffect, useState } from 'react';
import {
  evaluatePrediction,
  calculateCareerStats,
  resultOf,
  type CallOutcome,
  type EvaluationResult,
  type FirstTeam,
  type HintKind,
  type LockedPrediction,
  type Result as MemoryResult,
  type RevealResult,
} from './memoryScore';
import { HINT_SCORE_PENALTIES } from './scoringConfig';
import { formatGameweek, layoutStartingXi, logLineupMismatches } from './lineupLayout';
import { syncEarnedBadges, type BadgeId } from './badges';
import { BadgeStamp } from './BadgeStamp';
import { computeWinPercentages } from './matchOdds';
import { CaughtYouToast } from './CaughtYouToast';
import { pickCaughtYouMessage } from './caughtYou';
import { logStatsEvent } from './stats';
import { readDrawPreference, type DrawPreference } from './drawPreference';

type Player = { id: number; name: string; position: string | null; shirtNumber: string | null };
type FormMatch = {
  id: number;
  game_date: string;
  competition: string;
  result: 'W' | 'D' | 'L';
  venue: 'H' | 'A';
  opponent: string;
  opponentIsBigClub?: boolean;
  score: string;
};
type Fixture = {
  id: number;
  game_date: string;
  competition: string;
  round?: string | null;
  home_team: string;
  away_team: string;
  home_manager?: string | null;
  away_manager?: string | null;
  home_formation: string | null;
  away_formation: string | null;
  home_lineup: Player[];
  away_lineup: Player[];
  home_subs?: Player[];
  away_subs?: Player[];
  home_form?: FormMatch[];
  away_form?: FormMatch[];
  tier?: 'A' | 'B' | 'C';
  season_year?: number | null;
  homeIsBigClub?: boolean;
  awayIsBigClub?: boolean;
};
type RevealData = RevealResult;
type Evaluation = EvaluationResult;
type Prediction = LockedPrediction & {
  fixtureSnapshot?: Fixture;
  result?: RevealData;
  evaluation?: Evaluation;
};

function HintIcon({ kind }: { kind: HintKind }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'goalCount' && <>
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <path d="M7 8h10M7 12h4M7 16h10" />
    </>}
    {kind === 'spotlight' && <>
      <path d="M8 4h8l3 8H5l3-8Z" />
      <path d="M12 12v7M9 20h6M7 2 5.5 1M17 2l1.5-1" />
    </>}
    {kind === 'firstTeam' && <>
      <path d="M6 3v18" />
      <path d="M7 4h11l-3 4 3 4H7" />
    </>}
  </svg>;
}

const PLAYED_KEY = 'hindsight.playedFixtureIds';
const HISTORY_KEY = 'hindsight.predictions';
const ACTIVE_KEY = 'hindsight.activeFixture';
function getPlayedIds(): number[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(PLAYED_KEY) || '[]');
    const legacyIds = Array.isArray(parsed) ? parsed.filter((id): id is number => Number.isInteger(id)) : [];
    const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    const historyIds = Array.isArray(history) ? history.map((item) => item?.fixtureId).filter((id): id is number => Number.isInteger(id)) : [];
    return [...new Set([...legacyIds, ...historyIds])];
  } catch { return []; }
}

function countPredictedGoals(ids: number[], playerId: number) {
  return ids.reduce((total, id) => total + (id === playerId ? 1 : 0), 0);
}

function limitPredictedGoals(
  ids: number[],
  homePlayerIds: Set<number>,
  awayPlayerIds: Set<number>,
  homeLimit: number,
  awayLimit: number,
) {
  let homeRemaining = homeLimit;
  let awayRemaining = awayLimit;
  return ids.filter((id) => {
    if (homePlayerIds.has(id)) {
      if (homeRemaining <= 0) return false;
      homeRemaining -= 1;
      return true;
    }
    if (awayPlayerIds.has(id)) {
      if (awayRemaining <= 0) return false;
      awayRemaining -= 1;
      return true;
    }
    return false;
  });
}

function CombinedTacticalPitch({
  homeTeam,
  awayTeam,
  homeManager,
  awayManager,
  homeFormation,
  awayFormation,
  homeLineup,
  awayLineup,
  selectedGoalscorerIds,
  onAddGoalscorer,
  canAddGoalscorer,
  onRemoveGoalscorer,
  locked,
}: {
  homeTeam: string;
  awayTeam: string;
  homeManager?: string | null;
  awayManager?: string | null;
  homeFormation: string | null;
  awayFormation: string | null;
  homeLineup: Player[];
  awayLineup: Player[];
  selectedGoalscorerIds: number[];
  onAddGoalscorer?: (id: number) => void;
  canAddGoalscorer?: (id: number) => boolean;
  onRemoveGoalscorer?: (id: number) => void;
  locked?: boolean;
}) {
  // Layout y: GK≈88, FWD≈20. Remap to home top half (GK→5%, FWD→46%) and away bottom half (GK→95%, FWD→54%).
  const remap = (oldY: number, isAway: boolean) => {
    const t = (88 - oldY) / 68;
    return isAway ? 95 - t * 41 : 5 + t * 41;
  };

  const homeLayout = layoutStartingXi(homeLineup, homeFormation);
  const awayLayout = layoutStartingXi(awayLineup, awayFormation);

  // Horizontal left/right must follow the team's direction of attack. The
  // home side attacks down the page, so its right is the viewer's left;
  // the away side attacks up the page, so its right is the viewer's right.
  const homePositions = homeLayout.positions.map(({ player, x, y }) => ({
    player, x: 100 - x, y: remap(y, false), side: 'home' as const,
  }));
  const awayPositions = awayLayout.positions.map(({ player, x, y }) => ({
    player, x, y: remap(y, true), side: 'away' as const,
  }));

  return <div className="tactical-pitch-board combined-pitch" aria-label="Combined tactical pitch">
    <div className="pitch-canvas combined-canvas">
      <div className="pitch-outline"></div>
      <div className="pitch-halfway"></div>
      <div className="pitch-center-circle"></div>
      <div className="pitch-center-spot"></div>
      <div className="pitch-box-top"></div>
      <div className="pitch-goal-top"></div>
      <div className="pitch-box-bottom"></div>
      <div className="pitch-goal-bottom"></div>
      <div className="pitch-d-top"></div>
      <div className="pitch-d-bottom"></div>

      {/* Team name + formation on the left, manager on the right, of each half */}
      <span className="pitch-side-label home-side-label">
        {homeTeam}
        <br></br>
        {homeFormation}
        {/* {homeFormation && <span className="formation">{homeFormation}</span>} */}
      </span>
      <span className="pitch-side-manager home-side-label home-side-manager">
        Manager:
        <br /> {homeManager}
      </span>
      <span className="pitch-side-label away-side-label">
        {awayTeam}
        <br></br>
        {awayFormation}
        {/* {awayFormation && <span className="formation">{awayFormation}</span>} */}
      </span>
      <span className="pitch-side-manager away-side-label away-side-manager">
        Manager: 
        <br />{awayManager}
      </span>

      {[...homePositions, ...awayPositions].map(({ player, x, y, side }) => {
        const goals = countPredictedGoals(selectedGoalscorerIds, player.id);
        const isSelected = goals > 0;
        const surname = player.name.split(' ').pop() || player.name;
        return <button
          key={player.id}
          type="button"
          className={`pitch-player pitch-player-${side}${isSelected ? ' is-selected' : ''}${locked ? ' is-locked' : ''}`}
          style={{ left: `${x}%`, top: `${y}%` }}
          onClick={() => !locked && onAddGoalscorer?.(player.id)}
          onContextMenu={(event) => {
            event.preventDefault();
            if (!locked) onRemoveGoalscorer?.(player.id);
          }}
          title={`${player.name} (${player.position || 'Player'}) — ${goals ? `${goals} predicted goal${goals === 1 ? '' : 's'}` : 'No predicted goals'}${canAddGoalscorer && !canAddGoalscorer(player.id) ? '. Team scoreline limit reached' : '. Tap to add a predicted goal'}`}
          aria-disabled={locked || (canAddGoalscorer ? !canAddGoalscorer(player.id) : false)}
          disabled={locked}
        >
          <span className="pitch-jersey">
            {isSelected ? goals : (player.shirtNumber || '·')}
          </span>
          <span className="pitch-player-name">{surname}</span>
        </button>;
      })}
    </div>
    <div className="pitch-legend combined-legend">
    </div>
  </div>;
}

function FormGuide({ team, form }: { team: string; form?: FormMatch[] }) {
  const [expanded, setExpanded] = useState(false);
  const matches = form || [];

  return <div className="form-guide-block" aria-label={`${team} recent form guide`}>
    <div className="form-guide-header">
      <span className="form-team-name">{team}</span>
      <div className="form-pills" aria-label={`Last ${matches.length} matches`}>
        {matches.length ? matches.map((m, idx) => (
          <span
            key={`${m.id}-${idx}`}
            className={`form-pill result-${m.result}`}
            title={`${m.result === 'W' ? 'Win' : m.result === 'D' ? 'Draw' : 'Loss'} ${m.score} vs ${m.opponent} (${m.venue}) on ${m.game_date}`}
          >
            {m.result}
          </span>
        )) : <span className="form-pill-empty">No prior matches</span>}
      </div>
      {matches.length > 0 && (
        <button
          type="button"
          className="form-expand-toggle"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
        >
          {expanded ? 'Hide form' : 'View form guide'}
        </button>
      )}
    </div>

    {expanded && matches.length > 0 && (
      <div className="form-details-table">
        <ol className="form-match-list">
          {matches.map((m) => (
            <li key={m.id} className="form-match-row">
              <span className={`form-pill mini result-${m.result}`}>{m.result}</span>
              <span className="form-score">{m.score}</span>
              <span className="form-venue">{m.venue === 'H' ? 'v' : '@'}</span>
              <span className="form-opponent">{m.opponent}</span>
              <span className="form-comp">{m.competition}</span>
              <time className="form-date">{m.game_date}</time>
            </li>
          ))}
        </ol>
        {matches.length < 5 && (
          <p className="form-limited-note">Limited archive history before this match ({matches.length} earlier fixtures recorded).</p>
        )}
      </div>
    )}
  </div>;
}

const POSITION_ORDER = ['goalkeeper', 'back', 'defender', 'sweeper', 'midfielder', 'winger', 'forward', 'striker', 'attack'];
function posGroup(pos: string | null): number {
  if (!pos) return 5;
  const p = pos.toLowerCase();
  if (p.includes('goalkeeper')) return 0;
  if (p.includes('back') || p.includes('defender') || p.includes('sweeper')) return 1;
  if (p.includes('defensive mid')) return 2;
  if (p.includes('mid') || p.includes('winger') || p.includes('wing')) return 3;
  if (p.includes('forward') || p.includes('striker') || p.includes('attack')) return 4;
  return 5;
}
void POSITION_ORDER; // suppress unused lint

// Single source of truth for lineup ordering, so the programme teamsheet and the
// "Who found the net" picker always list players in the same position order.
function sortByPosition(players: Player[]): Player[] {
  return [...players].sort((a, b) => posGroup(a.position) - posGroup(b.position));
}

function TeamSheet({
  team,
  manager,
  formation,
  starters,
  substitutes,
}: {
  team: string;
  manager?: string | null;
  formation: string | null;
  starters: Player[];
  substitutes?: Player[];
}) {
  const sorted = sortByPosition(starters);
  const sortedSubs = substitutes ? sortByPosition(substitutes) : [];
  return <section className="team-sheet" aria-label={`${team}${manager ? `, managed by ${manager}` : ''} matchday lineup`}>
    <div className="team-heading">
      <div className="team-heading-main">
        <h2>{team}</h2>
        {manager && <span className="team-manager">Manager: {manager}</span>}
      </div>
      {formation && <span className="formation">{formation}</span>}
    </div>
    <div className="lineup-subheading">Starting Eleven</div>
    <ol className="lineup">
      {sorted.map((player) => <li key={player.id}>
        <span className="shirt-number">{player.shirtNumber || '·'}</span>
        <span className="player-name">{player.name}</span>
        {player.position && <span className="position">{player.position}</span>}
      </li>)}
    </ol>
    {sortedSubs.length > 0 && <>
      <div className="lineup-subheading bench-subheading">Substitutes Bench ({sortedSubs.length})</div>
      <ol className="lineup bench-lineup desktop-bench-list">
        {sortedSubs.map((player) => <li key={player.id}>
          <span className="shirt-number bench-shirt">{player.shirtNumber || '·'}</span>
          <span className="player-name">{player.name}</span>
          {player.position && <span className="position">{player.position}</span>}
        </li>)}
      </ol>
      <details className="mobile-bench-list">
        <summary>Substitutes bench <span>({sortedSubs.length})</span></summary>
        <ol className="lineup bench-lineup">
          {sortedSubs.map((player) => <li key={player.id}>
            <span className="shirt-number bench-shirt">{player.shirtNumber || '·'}</span>
            <span className="player-name">{player.name}</span>
            {player.position && <span className="position">{player.position}</span>}
          </li>)}
        </ol>
      </details>
    </>}
  </section>;
}

function WinOdds({ fixture }: { fixture: Fixture }) {
  const odds = computeWinPercentages(fixture);
  return (
    <div className="win-odds" aria-label="Match outcome probability">
      <div className="win-odds-track">
        <span className="win-odds-segment" style={{ width: `${odds.home}%` }}>
          <span className="win-odds-bar win-odds-bar-home" style={{ width: '100%' }} />
          <span className="win-odds-label">{odds.home}%</span>
        </span>
        <span className="win-odds-segment" style={{ width: `${odds.draw}%` }}>
          <span className="win-odds-bar win-odds-bar-draw" style={{ width: '100%' }} />
          <span className="win-odds-label">{odds.draw}% Draw</span>
        </span>
        <span className="win-odds-segment" style={{ width: `${odds.away}%` }}>
          <span className="win-odds-bar win-odds-bar-away" style={{ width: '100%' }} />
          <span className="win-odds-label">{odds.away}%</span>
        </span>
      </div>
    </div>
  );
}

export function Matchday({ onHome, drawPreference = readDrawPreference(localStorage), startFresh = false }: { onHome?: () => void; drawPreference?: DrawPreference; startFresh?: boolean } = {}) {
  const [fixture, setFixture] = useState<Fixture | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [homeScore, setHomeScore] = useState('0');
  const [awayScore, setAwayScore] = useState('0');
  const [goalscorerIds, setGoalscorerIds] = useState<number[]>([]);
  // One prediction set: every call is optional.
  const [resultCall, setResultCall] = useState<MemoryResult | null>(null);
  const [totalGoals, setTotalGoals] = useState<number | null>(null);
  const [firstTeamToScore, setFirstTeamToScore] = useState<FirstTeam | null>(null);
  const [firstGoalscorerId, setFirstGoalscorerId] = useState<number | 'none' | null>(null);
  // Hints
  const [hintsUsed, setHintsUsed] = useState<HintKind[]>([]);
  const [hintData, setHintData] = useState<{ goalCount?: number; spotlight?: number | null; spotlightName?: string; firstTeam?: FirstTeam | null }>({});
  const [hintError, setHintError] = useState('');
  const [hintsPending, setHintsPending] = useState(0);

  const [lockedPrediction, setLockedPrediction] = useState<Prediction | null>(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [revealStep, setRevealStep] = useState<'hidden' | 'score' | 'details'>('hidden');
  const [reveal, setReveal] = useState<RevealData | null>(null);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [revealError, setRevealError] = useState('');
  const [revealing, setRevealing] = useState(false);
  const [newBadges, setNewBadges] = useState<BadgeId[]>([]);

  const [history, setHistory] = useState<Prediction[]>(() => {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
    catch { return []; }
  });
  const [loadingNext, setLoadingNext] = useState(false);
  const [nextError, setNextError] = useState('');
  const [lineupTab, setLineupTab] = useState<'pitch' | 'sheets'>('pitch');
  const [caughtYouMessage, setCaughtYouMessage] = useState<string | null>(null);

  const careerStats = calculateCareerStats(history, fixture?.id);

  useEffect(() => {
    if (!fixture) return;
    logLineupMismatches(fixture, fixture.home_team, fixture.home_formation, layoutStartingXi(fixture.home_lineup, fixture.home_formation).mismatches);
    logLineupMismatches(fixture, fixture.away_team, fixture.away_formation, layoutStartingXi(fixture.away_lineup, fixture.away_formation).mismatches);
  }, [fixture]);

  useEffect(() => {
    if (!fixture || lockedPrediction) return;
    const homeIds = new Set([
      ...fixture.home_lineup,
      ...(fixture.home_subs || []),
    ].map((player) => player.id));
    const awayIds = new Set([
      ...fixture.away_lineup,
      ...(fixture.away_subs || []),
    ].map((player) => player.id));
    setGoalscorerIds((current) => limitPredictedGoals(
      current,
      homeIds,
      awayIds,
      homeScore === '' || awayScore === '' ? 0 : Number(homeScore),
      homeScore === '' || awayScore === '' ? 0 : Number(awayScore),
    ));
  }, [fixture, homeScore, awayScore, lockedPrediction]);

  // Older saved programmes did not contain manager fields. Hydrate them from the
  // match row; the route returns null rather than guessing a club's latest manager.
  useEffect(() => {
    if (!fixture) return;
    if ('home_manager' in fixture && 'away_manager' in fixture) return;
    const fixtureId = fixture.id;
    const controller = new AbortController();
    fetch(`/api/fixtures/${fixtureId}/managers`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((managers: { home_manager?: string | null; away_manager?: string | null } | null) => {
        if (!managers || !('home_manager' in managers) || !('away_manager' in managers)) return;
        setFixture((current) => current && current.id === fixtureId ? { ...current, ...managers } : current);
        try {
          const activeRaw = localStorage.getItem(ACTIVE_KEY);
          if (!activeRaw) return;
          const active = JSON.parse(activeRaw) as Fixture;
          if (active?.id === fixtureId) {
            localStorage.setItem(ACTIVE_KEY, JSON.stringify({ ...active, ...managers }));
          }
        } catch { /* Keep the programme usable if storage is unavailable. */ }
      })
      .catch((cause: Error) => {
        if (cause.name !== 'AbortError') {
          // A missing manager line is safer than a guessed one.
        }
      });
    return () => controller.abort();
  }, [fixture]);

  useEffect(() => {
    const controller = new AbortController();
    try {
      const activeRaw = localStorage.getItem(ACTIVE_KEY);
      if (activeRaw && !startFresh) {
        const active = JSON.parse(activeRaw) as Fixture;
        const currentHist = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') as Prediction[];
        const existing = currentHist.find((p) => p.fixtureId === active.id);
        if (!existing) {
          setFixture(active);
          setLoading(false);
          return () => controller.abort();
        }
      }

      const currentHist = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') as Prediction[];
      const latest = currentHist.at(-1);
        if (latest?.fixtureSnapshot && (!startFresh || !latest.result)) {
        setFixture(latest.fixtureSnapshot);
        setLockedPrediction(latest);
        setHomeScore(latest.homeScore == null ? '' : String(latest.homeScore));
        setAwayScore(latest.awayScore == null ? '' : String(latest.awayScore));
        setGoalscorerIds(latest.goalscorerIds || []);
        setResultCall(latest.resultCall ?? null);
        setTotalGoals(latest.totalGoals ?? null);
        setFirstTeamToScore(latest.firstTeamToScore ?? null);
        setFirstGoalscorerId(latest.firstGoalscorerId ?? null);
        setHintsUsed(latest.hintsUsed || []);
        setHintData({ spotlight: latest.hintSpotlightPlayerId ?? null, firstTeam: latest.hintFirstTeam ?? null });
        if (latest.result && latest.evaluation) {
          setReveal(latest.result);
          setEvaluation(latest.evaluation);
          setRevealStep('details');
        }
        setLoading(false);
        return () => controller.abort();
      }
    } catch { /* A corrupt history can't block a fresh fixture. */ }

    if (drawPreference.mode === 'supporter' && drawPreference.clubId === null) {
      setError('Choose a club to draw a supporter fixture.');
      setLoading(false);
      return () => controller.abort();
    }

    fetch('/api/fixtures/next', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playedFixtureIds: getPlayedIds(), clubId: drawPreference.mode === 'supporter' ? drawPreference.clubId : null }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || 'Could not load a fixture.');
        return payload as Fixture;
      })
      .then((loadedFixture) => {
        setFixture(loadedFixture);
        logStatsEvent('fixture', loadedFixture);
        try { localStorage.setItem(ACTIVE_KEY, JSON.stringify(loadedFixture)); } catch { /* ignore */ }
      })
      .catch((cause: Error) => { if (cause.name !== 'AbortError') setError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });

    return () => controller.abort();
  }, []);

  // "Caught you" — watches for the player slipping away from the programme.
  // Armed only once the teamsheet and form guide have landed, and only while
  // the player is still making their calls. It never fires on the reveal
  // screen, and it never touches the player's score, hints or history.
  useEffect(() => {
    if (!fixture || lockedPrediction || revealStep !== 'hidden') return;

    let hiddenAt: number | null = null;

    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt === null) return;
      const awaySeconds = (Date.now() - hiddenAt) / 1000;
      hiddenAt = null;
      const message = pickCaughtYouMessage(fixture.id, awaySeconds);
      if (message) setCaughtYouMessage(message);
    };

    window.addEventListener('visibilitychange', onVisibility);
    return () => window.removeEventListener('visibilitychange', onVisibility);
  }, [fixture, lockedPrediction, revealStep]);

  function canAddGoalFor(playerId: number, picks = goalscorerIds) {
    if (countPredictedGoals(picks, playerId) >= 9) return false;
    if (!fixture || homeScore === '' || awayScore === '') return false;
    const homeIds = new Set([
      ...fixture.home_lineup,
      ...(fixture.home_subs || []),
    ].map((player) => player.id));
    const awayIds = new Set([
      ...fixture.away_lineup,
      ...(fixture.away_subs || []),
    ].map((player) => player.id));
    const playerIds = homeIds.has(playerId) ? homeIds : awayIds.has(playerId) ? awayIds : null;
    if (!playerIds) return false;
    const teamLimit = playerIds === homeIds ? Number(homeScore) : Number(awayScore);
    return picks.filter((id) => playerIds.has(id)).length < teamLimit;
  }

  function addGoalscorer(playerId: number) {
    setGoalscorerIds((current) => {
      if (!canAddGoalFor(playerId, current)) return current;
      return [...current, playerId];
    });
  }

  function removeGoalscorer(playerId: number) {
    setGoalscorerIds((current) => {
      const index = current.lastIndexOf(playerId);
      if (index < 0) return current;
      return [...current.slice(0, index), ...current.slice(index + 1)];
    });
  }

  async function requestHint(kind: HintKind) {
    if (!fixture || lockedPrediction || loadingNext || hintsUsed.includes(kind)) return;
    setHintsPending((count) => count + 1);
    setHintError('');
    try {
      const endpoint = kind === 'goalCount' ? 'goal-count' : kind === 'spotlight' ? 'spotlight' : 'first-team';
      const response = await fetch(`/api/fixtures/${fixture.id}/hint/${endpoint}`, { method: 'POST' });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        throw new Error(data?.message || 'The hint is unavailable right now.');
      }
      logStatsEvent('hint', fixture);
      if (kind === 'goalCount') {
        setHintsUsed((current) => [...current, 'goalCount']);
        setHintData((current) => ({ ...current, goalCount: data.totalGoals }));
      } else if (kind === 'spotlight') {
        setHintsUsed((current) => [...current, 'spotlight']);
        setHintData((current) => ({
          ...current,
          spotlight: data.playerId ?? null,
          spotlightName: data.playerName ?? undefined,
        }));
      } else {
        setHintsUsed((current) => [...current, 'firstTeam']);
        setHintData((current) => ({ ...current, firstTeam: data.firstTeam ?? null }));
      }
    } catch (cause) {
      setHintError(cause instanceof Error ? cause.message : 'The hint is unavailable right now.');
    } finally {
      setHintsPending((count) => count - 1);
    }
  }

  function lockPredictions() {
    if (!fixture || lockedPrediction || saving || loadingNext || hintsPending > 0) return;
    if ((homeScore === '') !== (awayScore === '')) {
      setFormError("Enter both teams' goals, or leave both blank to skip the scoreline.");
      return;
    }
    const parsedHome = homeScore === '' ? null : Number(homeScore);
    const parsedAway = awayScore === '' ? null : Number(awayScore);
    if ([parsedHome, parsedAway].some((score) => score !== null && (!Number.isSafeInteger(score) || score < 0))) {
      setFormError('Goals must be whole numbers from zero upwards.');
      return;
    }
    // Validate totalGoals doesn't contradict scoreline
    const scorelineComplete = parsedHome !== null && parsedAway !== null;
    const derivedTotal = scorelineComplete ? parsedHome + parsedAway : null;
    if (scorelineComplete && totalGoals !== null && totalGoals !== derivedTotal) {
      setFormError('Total goals must match the scoreline, or leave total goals blank to derive it from the scoreline.');
      return;
    }
    // A scoreline fills in the result and total goals automatically.
    const finalResultCall: MemoryResult | null = scorelineComplete
      ? resultOf(parsedHome, parsedAway)
      : resultCall;
    const finalTotalGoals = derivedTotal ?? totalGoals;
    const finalGoalscorerIds = fixture
      ? limitPredictedGoals(
        goalscorerIds,
        new Set([...fixture.home_lineup, ...(fixture.home_subs || [])].map((player) => player.id)),
        new Set([...fixture.away_lineup, ...(fixture.away_subs || [])].map((player) => player.id)),
        parsedHome ?? 0,
        parsedAway ?? 0,
      )
      : goalscorerIds;

    setSaving(true);
    setFormError('');
    const prediction: Prediction = {
      fixtureId: fixture.id,
      lockedAt: new Date().toISOString(),
      resultCall: finalResultCall,
      homeScore: parsedHome,
      awayScore: parsedAway,
      goalscorerIds: finalGoalscorerIds,
      totalGoals: finalTotalGoals,
      firstTeamToScore,
      firstGoalscorerId,
      hintsUsed,
      hintSpotlightPlayerId: hintsUsed.includes('spotlight') ? hintData.spotlight ?? null : null,
      hintFirstTeam: hintsUsed.includes('firstTeam') ? hintData.firstTeam ?? null : null,
      fixtureSnapshot: fixture,
    };
    try {
      const currentHistory = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') as Prediction[];
      const updated = [...currentHistory, prediction];
      localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
      localStorage.removeItem(ACTIVE_KEY);
      setHistory(updated);
      setLockedPrediction(prediction);
      logStatsEvent('lock', fixture);
      // Sealing is the reveal action: fetch the archived result and show it
      // as soon as the prediction has been safely saved.
      void revealMatch(prediction);
    } catch {
      setFormError('Your browser could not save this lock. Check available storage and try again.');
    } finally { setSaving(false); }
  }

  async function revealMatch(predictionToReveal = lockedPrediction) {
    if (!fixture || !predictionToReveal || revealing || reveal) return;
    setRevealing(true);
    setRevealError('');
    try {
      const response = await fetch(`/api/fixtures/${fixture.id}/reveal`, { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || 'Could not reveal this match.');
      const actual = payload as RevealData;
      const score = evaluatePrediction(predictionToReveal, actual, {
        homeTeam: fixture.home_team,
        awayTeam: fixture.away_team,
      });
      const currentHistory = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') as Prediction[];
      const updatedHistory = currentHistory.map((item) => item.fixtureId === fixture.id ? { ...item, result: actual, evaluation: score } : item);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(updatedHistory));
      setHistory(updatedHistory);
      const earnedBadges = syncEarnedBadges(updatedHistory);
      setNewBadges(earnedBadges);
      logStatsEvent('reveal', fixture, score.percentage);
      for (const badge of earnedBadges) logStatsEvent(`badge:${badge}`, fixture);
      setReveal(actual);
      setEvaluation(score);
      setRevealStep('score');
    } catch (cause) {
      setRevealError(cause instanceof Error ? cause.message : 'Could not reveal this match.');
    } finally { setRevealing(false); }
  }

  async function handleNextFixture() {
    if (loadingNext || saving || revealing || hintsPending > 0) return;
    if (drawPreference.mode === 'supporter' && drawPreference.clubId === null) {
      setNextError('Choose a club before drawing a supporter fixture.');
      return;
    }
    setLoadingNext(true);
    setNextError('');
    try {
      const played = getPlayedIds();
      const response = await fetch('/api/fixtures/next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playedFixtureIds: played, clubId: drawPreference.mode === 'supporter' ? drawPreference.clubId : null }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || 'Could not load the Another one.');
      const nextFixture = payload as Fixture;
      setError('');
      logStatsEvent('fixture', nextFixture);
      try { localStorage.setItem(ACTIVE_KEY, JSON.stringify(nextFixture)); } catch { /* ignore */ }
      setFixture(nextFixture);
      setHomeScore('0');
      setAwayScore('0');
      setGoalscorerIds([]);
      setResultCall(null);
      setTotalGoals(null);
      setFirstTeamToScore(null);
      setFirstGoalscorerId(null);
      setHintsUsed([]);
      setHintData({});
      setHintError('');
      setLockedPrediction(null);
      setFormError('');
      setRevealStep('hidden');
      setReveal(null);
      setEvaluation(null);
      setRevealError('');
      setNewBadges([]);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (cause) {
      setNextError(cause instanceof Error ? cause.message : 'Could not load Another one.');
    } finally {
      setLoadingNext(false);
    }
  }

  const allPlayers = fixture ? [
    ...fixture.home_lineup,
    ...fixture.away_lineup,
    ...(fixture.home_subs || []),
    ...(fixture.away_subs || []),
  ] : [];
  const playerLabel = (value: string | number | null) => {
    if (value === 'none') return 'No goals';
    if (value === null) return '—';
    return allPlayers.find((player) => player.id === value)?.name ?? String(value);
  };
  const scorelineComplete = homeScore !== '' && awayScore !== '';
  const derivedResult = scorelineComplete ? resultOf(Number(homeScore), Number(awayScore)) : null;
  const effectiveResult = derivedResult ?? resultCall;
  const effectiveTotalGoals = scorelineComplete ? Number(homeScore) + Number(awayScore) : totalGoals;
  const predictionImpliesGoals = (effectiveTotalGoals !== null && effectiveTotalGoals > 0)
    || effectiveResult === 'home'
    || effectiveResult === 'away';

  useEffect(() => {
    if (!predictionImpliesGoals) return;
    if (firstTeamToScore === 'none') setFirstTeamToScore(null);
    if (firstGoalscorerId === 'none') setFirstGoalscorerId(null);
  }, [predictionImpliesGoals, firstTeamToScore, firstGoalscorerId]);

  const describeCall = (call: CallOutcome): string => {
    if (call.id === 'scorers') return call.note ?? '';
    if (call.note?.startsWith('First goalscorer skipped:')) return call.note;
    const predicted = call.id === 'firstGoalscorer'
      ? playerLabel(call.predicted)
      : call.predicted === null ? '—' : String(call.predicted);
    const actual = call.id === 'firstGoalscorer'
      ? playerLabel(call.actual)
      : call.actual === null ? '—' : String(call.actual);
    const base = `You: ${predicted} · Actual: ${actual}`;
    return call.note ? `${base} · ${call.note}` : base;
  };
  const gameweekLabel = fixture ? formatGameweek(fixture.round) : null;

  return <main className="page-shell">
    <header className="masthead">
      <div className="masthead-left">
        <a
          className="wordmark"
          href="/"
          aria-label="Hindsight home"
          onClick={(e) => {
            if (onHome) {
              e.preventDefault();
              onHome();
            }
          }}
        >
          Hindsight<span className="period">.</span>
        </a>
        <nav className="masthead-nav" aria-label="Matchday navigation">
          <a href="/how-to-play" className="masthead-nav-link">How to Play</a>
          <a href="/record-book" className="masthead-nav-link">Record Book</a>
          {onHome && (
            <button type="button" className="masthead-home-button" onClick={onHome} title="Return to turnstiles landing page">
              ← Turnstiles
            </button>
          )}
        </nav>
      </div>
      {careerStats.totalPlayed > 0 ? (
        <div className="masthead-ledger" aria-label="Career record summary">
          <span className="ledger-tag">RECORD</span>
          <span className="ledger-count">{careerStats.totalPlayed} {careerStats.totalPlayed === 1 ? 'MATCH' : 'MATCHES'}</span>
          <span className="ledger-dot" aria-hidden="true">·</span>
          <span className="ledger-avg">{careerStats.runningAverage.toFixed(1)}% MEMORY SCORE</span>
        </div>
      ) : (
        <span className="edition">THE FOOTBALL MEMORY GAME</span>
      )}
    </header>
    <section className="intro">
      <p className="eyebrow">The match has already been played</p>
      <h1>Remember the score?</h1>
      <p className="intro-copy">The teamsheet is set. The form guide tells its story. Ninety minutes are in the books — you just haven't called them yet.</p>
    </section>
    {loading && <div className="notice" role="status">Finding a match in the archive…</div>}
    {!loading && error && <div className="notice error" role="alert"><strong>No fixture to show.</strong><span>{error}</span></div>}
    {fixture && <>
      <section className="fixture-card" aria-label="Pre-match fixture">
        <div className="fixture-topline">
          <div className="topline-left">
            <span className="competition">{fixture.competition}</span>
            {gameweekLabel && <span className="round-badge">{gameweekLabel}</span>}
            {fixture.tier && (
              <span className={`tier-badge tier-${fixture.tier}`} title={`Tier ${fixture.tier} matchday draw`}>
                {fixture.tier === 'A' ? 'TIER A · CLASH OF TITANS' : fixture.tier === 'B' ? 'TIER B · CONTENDERS' : 'TIER C · ARCHIVE BATTLE'}
              </span>
            )}
          </div>
          <time dateTime={fixture.game_date}>{new Date(`${fixture.game_date}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</time>
        </div>
        <div
          className="fixture-title"
          aria-label={`${fixture.home_team}${fixture.home_manager ? `, managed by ${fixture.home_manager}` : ''} versus ${fixture.away_team}${fixture.away_manager ? `, managed by ${fixture.away_manager}` : ''}`}
        >
          <div className="fixture-team fixture-team-home">
            <span className="fixture-team-name">{fixture.home_team}</span>
          </div>
          <span className="versus">v</span>
          <div className="fixture-team fixture-team-away">
            <span className="fixture-team-name">{fixture.away_team}</span>
          </div>
        </div>

        {/* Form Guide Section */}
        <section className="form-guide-section" aria-label="Form guide before this match">
          <div className="form-guide-container">
            <FormGuide team={fixture.home_team} form={fixture.home_form} />
            <div className="form-guide-separator" aria-hidden="true"></div>
            <FormGuide team={fixture.away_team} form={fixture.away_form} />
          </div>
          <WinOdds fixture={fixture} />
        </section>

        {/* View Switcher: Tactical Pitch vs Programme Teamsheets */}
        <div className="view-switcher" role="tablist" aria-label="Teamsheet display mode">
          <button
            role="tab"
            aria-selected={lineupTab === 'pitch'}
            className={`view-tab${lineupTab === 'pitch' ? ' active' : ''}`}
            onClick={() => setLineupTab('pitch')}
            type="button"
          >
            Tactical Pitch
          </button>
          <button
            role="tab"
            aria-selected={lineupTab === 'sheets'}
            className={`view-tab${lineupTab === 'sheets' ? ' active' : ''}`}
            onClick={() => setLineupTab('sheets')}
            type="button"
          >
            Programme Teamsheet
          </button>
        </div>

        {lineupTab === 'pitch' ? (
          <div className="pitch-section">
            <CombinedTacticalPitch
              homeTeam={fixture.home_team}
              awayTeam={fixture.away_team}
              homeManager={fixture.home_manager}
              awayManager={fixture.away_manager}
              homeFormation={fixture.home_formation}
              awayFormation={fixture.away_formation}
              homeLineup={fixture.home_lineup}
              awayLineup={fixture.away_lineup}
              selectedGoalscorerIds={goalscorerIds}
              onAddGoalscorer={addGoalscorer}
              canAddGoalscorer={(playerId) => canAddGoalFor(playerId)}
              onRemoveGoalscorer={removeGoalscorer}
              locked={!!lockedPrediction}
            />
          </div>
        ) : (
          <div className="teamsheets">
            <TeamSheet
              team={fixture.home_team}
              manager={fixture.home_manager}
              formation={fixture.home_formation}
              starters={fixture.home_lineup}
              substitutes={fixture.home_subs}
            />
            <TeamSheet
              team={fixture.away_team}
              manager={fixture.away_manager}
              formation={fixture.away_formation}
              starters={fixture.away_lineup}
              substitutes={fixture.away_subs}
            />
          </div>
        )}
      </section>

      {!lockedPrediction ? <section className="prediction-card" aria-labelledby="prediction-title">
        <div className="prediction-heading">
          <div>
            <h2 id="prediction-title">What happened next?</h2>          </div>
        </div>
        <fieldset className="calls-set">
          <legend>Your calls</legend>

          <div className="call-block">
            <span className="call-label">Result</span>
            <div className="extended-input-group">
              <button type="button" className={`extended-choice${effectiveResult === 'home' ? ' selected' : ''}`} onClick={() => setResultCall('home')} disabled={scorelineComplete}>{fixture.home_team}</button>
              <button type="button" className={`extended-choice${effectiveResult === 'draw' ? ' selected' : ''}`} onClick={() => setResultCall('draw')} disabled={scorelineComplete}>Draw</button>
              <button type="button" className={`extended-choice${effectiveResult === 'away' ? ' selected' : ''}`} onClick={() => setResultCall('away')} disabled={scorelineComplete}>{fixture.away_team}</button>
              <button type="button" className={`extended-choice${effectiveResult === null ? ' selected' : ''}`} onClick={() => setResultCall(null)} disabled={scorelineComplete}>No call</button>
              {derivedResult && <span className="extended-hint">Set by scoreline</span>}
            </div>
          </div>

          <div className="call-block">
            <span className="call-label">Scoreline</span>
            <div className="score-picker">
              <div className="score-team">
                <span className="score-team-name">{fixture.home_team}</span>
                <div className="score-input-group">
                  <button type="button" className="score-adjust" aria-label={`Decrease ${fixture.home_team} goals`} onClick={() => setHomeScore((previous) => previous === '' ? '' : String(Math.max(0, Number(previous) - 1)))}>−</button>
                  <span className="score-value" aria-live="polite">{homeScore === '' ? '—' : homeScore}</span>
                  <button type="button" className="score-adjust" aria-label={`Increase ${fixture.home_team} goals`} onClick={() => setHomeScore((previous) => previous === '' ? '1' : String(Math.min(9, Number(previous) + 1)))}>+</button>
                </div>
              </div>
              <span className="score-separator">:</span>
              <div className="score-team">
                <span className="score-team-name">{fixture.away_team}</span>
                <div className="score-input-group">
                  <button type="button" className="score-adjust" aria-label={`Decrease ${fixture.away_team} goals`} onClick={() => setAwayScore((previous) => previous === '' ? '' : String(Math.max(0, Number(previous) - 1)))}>−</button>
                  <span className="score-value" aria-live="polite">{awayScore === '' ? '—' : awayScore}</span>
                  <button type="button" className="score-adjust" aria-label={`Increase ${fixture.away_team} goals`} onClick={() => setAwayScore((previous) => previous === '' ? '1' : String(Math.min(9, Number(previous) + 1)))}>+</button>
                </div>
              </div>
            </div>
            {(homeScore !== '0' || awayScore !== '0') && <div className="call-inline-actions"><button type="button" className="call-clear" onClick={() => { setHomeScore('0'); setAwayScore('0'); }}>Reset scoreline to 0–0</button></div>}
            <p className="field-hint">The default is 0–0. A scoreline fills in the result and total goals.</p>
          </div>

          <div className="call-block">
            <span className="call-label">Total goals</span>
            <div className="extended-input-group">
              <button type="button" className="score-adjust" aria-label="Decrease total goals" onClick={() => setTotalGoals((previous) => previous === null ? null : Math.max(0, previous - 1))} disabled={scorelineComplete}>−</button>
              <span className="score-value" aria-live="polite">{effectiveTotalGoals === null ? (scorelineComplete ? '0' : '—') : effectiveTotalGoals}</span>
              <button type="button" className="score-adjust" aria-label="Increase total goals" onClick={() => setTotalGoals((previous) => previous === null ? 1 : Math.min(20, previous + 1))} disabled={scorelineComplete}>+</button>
              {!scorelineComplete && totalGoals !== null && <button type="button" className="call-clear" onClick={() => setTotalGoals(null)}>Clear</button>}
              {scorelineComplete && <span className="extended-hint">Set by scoreline</span>}
            </div>
            <p className="field-hint">Enter it on its own, or let the scoreline fill it in. A total that contradicts the scoreline is blocked.</p>
          </div>

          <div className="call-block">
            <span className="call-label">First team to score</span>
            <div className="extended-input-group">
              <button type="button" className={`extended-choice${firstTeamToScore === 'home' ? ' selected' : ''}`} onClick={() => setFirstTeamToScore('home')}>{fixture.home_team}</button>
              <button type="button" className={`extended-choice${firstTeamToScore === 'away' ? ' selected' : ''}`} onClick={() => setFirstTeamToScore('away')}>{fixture.away_team}</button>
              {!predictionImpliesGoals && <button type="button" className={`extended-choice${firstTeamToScore === 'none' ? ' selected' : ''}`} onClick={() => setFirstTeamToScore('none')}>No goals</button>}
              <button type="button" className={`extended-choice${firstTeamToScore === null ? ' selected' : ''}`} onClick={() => setFirstTeamToScore(null)}>No call</button>
            </div>
          </div>

          <div className="call-block">
            <span className="call-label">First goalscorer</span>
            <div className="extended-input-group">
              <select
                value={firstGoalscorerId ?? ''}
                onChange={(event) => {
                  const value = event.target.value;
                  setFirstGoalscorerId(value === '' ? null : value === 'none' ? 'none' : Number(value));
                }}
                className="extended-select"
              >
                <option value="">— No call —</option>
                {!predictionImpliesGoals && <option value="none">No goals in match</option>}
                <optgroup label={fixture.home_team}>
                  {fixture.home_lineup.map((player) => <option key={player.id} value={player.id}>{player.name}{player.shirtNumber ? ` (#${player.shirtNumber})` : ''}</option>)}
                  {fixture.home_subs?.map((player) => <option key={player.id} value={player.id}>{player.name}{player.shirtNumber ? ` (#${player.shirtNumber})` : ''} (sub)</option>)}
                </optgroup>
                <optgroup label={fixture.away_team}>
                  {fixture.away_lineup.map((player) => <option key={player.id} value={player.id}>{player.name}{player.shirtNumber ? ` (#${player.shirtNumber})` : ''}</option>)}
                  {fixture.away_subs?.map((player) => <option key={player.id} value={player.id}>{player.name}{player.shirtNumber ? ` (#${player.shirtNumber})` : ''} (sub)</option>)}
                </optgroup>
              </select>
            </div>
          </div>

          <div className="call-block call-block-scorers">
            <span className="call-label">Scorers</span>
            <p className="field-hint">Pick any starter or sub. Tap + again for a brace or hat-trick; use − to take a goal off. Partial credit rewards the goals you matched, not the size of your list.</p>
            <div className="scorer-groups">
              {[
                { team: fixture.home_team, starters: fixture.home_lineup, subs: fixture.home_subs || [] },
                { team: fixture.away_team, starters: fixture.away_lineup, subs: fixture.away_subs || [] }
              ].map(({ team, starters, subs }) => <div className="scorer-group" key={team}>
                <h3>{team}</h3>
                <div className="scorer-subgroup-label">Starters</div>
                <div className="player-picks">{sortByPosition(starters).map((player) => {
                  const goals = countPredictedGoals(goalscorerIds, player.id);
                  return <div className={`player-pick${goals ? ' selected' : ''}`} key={player.id}>
                    <button className="pick-adjust" type="button" aria-label={`Remove a predicted goal for ${player.name}`} disabled={!goals} onClick={() => removeGoalscorer(player.id)}>−</button>
                    <button className="player-pick-main" type="button" aria-pressed={goals > 0} aria-label={`Add a predicted goal for ${player.name}`} onClick={() => addGoalscorer(player.id)} disabled={!canAddGoalFor(player.id)}>
                      <span className="player-pick-name">{player.name}</span>
                      {player.shirtNumber && <small className="player-pick-number">#{player.shirtNumber}</small>}
                      {goals > 0 && <small className="goal-count-badge">{goals} goal(s)</small>}
                    </button>
                    <button className="pick-adjust" type="button" aria-label={`Add a predicted goal for ${player.name}`} onClick={() => addGoalscorer(player.id)} disabled={!canAddGoalFor(player.id)}>+</button>
                  </div>;
                })}</div>

                {subs.length > 0 && <>
                  <div className="scorer-subgroup-label bench-group-label">Substitutes Bench</div>
                  <div className="player-picks bench-picks">{subs.map((player) => {
                    const goals = countPredictedGoals(goalscorerIds, player.id);
                    return <div className={`player-pick bench-pick${goals ? ' selected' : ''}`} key={player.id}>
                      <button className="pick-adjust" type="button" aria-label={`Remove a predicted goal for ${player.name}`} disabled={!goals} onClick={() => removeGoalscorer(player.id)}>−</button>
                      <button className="player-pick-main" type="button" aria-pressed={goals > 0} aria-label={`Add a predicted goal for ${player.name}`} onClick={() => addGoalscorer(player.id)} disabled={!canAddGoalFor(player.id)}>
                        <span className="player-pick-name">{player.name}</span>
                        <span className="sub-badge" aria-label="Substitute">SUB</span>
                        {goals > 0 && <small className="goal-count-badge">{goals} goal(s)</small>}
                      </button>
                      <button className="pick-adjust" type="button" aria-label={`Add a predicted goal for ${player.name}`} onClick={() => addGoalscorer(player.id)} disabled={!canAddGoalFor(player.id)}>+</button>
                    </div>;
                  })}</div>
                </>}
              </div>)}
            </div>
            <p className="field-hint scorer-skip">No goalscorer picks is fine too.</p>
          </div>
        </fieldset>

        {/* Hints */}
        <fieldset className="hints-fieldset">
          <legend>Hints <span className="hint-cost">(deductions shown on each hint)</span></legend>
          <div className="hints-grid">
            {/* Goal count hint */}
            <div className="hint-card">
              <div className="hint-header">
              <span className="hint-icon"><HintIcon kind="goalCount" /></span>
                <div>
                  <strong>Goal count</strong>
                  <span>Reveals total goals in the match</span>
                </div>
              </div>
              <div className="hint-body">
                {hintsUsed.includes('goalCount') ? (
                  <div className="hint-used">
                    <span className="hint-revealed">Total goals: {hintData.goalCount ?? '—'}</span>
                    <span className="hint-penalty">Voids your total goals call · −{HINT_SCORE_PENALTIES.goalCount}</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="hint-button"
                    onClick={() => requestHint('goalCount')}
                    disabled={!!lockedPrediction || loadingNext || hintsUsed.includes('goalCount')}
                  >
                    Use hint (−{HINT_SCORE_PENALTIES.goalCount})
                  </button>
                )}
              </div>
            </div>

            {/* Spotlight hint */}
            <div className="hint-card">
              <div className="hint-header">
              <span className="hint-icon"><HintIcon kind="spotlight" /></span>
                <div>
                  <strong>Spotlight</strong>
                  <span>Reveals one player who scored</span>
                </div>
              </div>
              <div className="hint-body">
                {hintsUsed.includes('spotlight') ? (
                  <div className="hint-used">
                    <span className="hint-revealed">Scorer: {hintData.spotlight
                      ? (allPlayers.find((player) => player.id === hintData.spotlight)?.name ?? hintData.spotlightName ?? 'Player')
                      : 'No goals in this match'}</span>
                    <span className="hint-penalty">Voids first scorer &amp; that player's credit · −{HINT_SCORE_PENALTIES.spotlight}</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="hint-button"
                    onClick={() => requestHint('spotlight')}
                    disabled={!!lockedPrediction || loadingNext || hintsUsed.includes('spotlight')}
                  >
                    Use hint (−{HINT_SCORE_PENALTIES.spotlight})
                  </button>
                )}
              </div>
            </div>
            <div className="hint-card">
              <div className="hint-header">
                <span className="hint-icon"><HintIcon kind="firstTeam" /></span>
                <div>
                  <strong>First team</strong>
                  <span>Reveals who scores first, or no goals</span>
                </div>
              </div>
              <div className="hint-body">
                {hintsUsed.includes('firstTeam') ? (
                  <div className="hint-used">
                    <span className="hint-revealed">First to score: {hintData.firstTeam === 'none'
                      ? 'No goals'
                      : hintData.firstTeam === 'home' ? fixture.home_team : hintData.firstTeam === 'away' ? fixture.away_team : '—'}</span>
                    <span className="hint-penalty">Voids your first team to score call · −{HINT_SCORE_PENALTIES.firstTeam}</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="hint-button"
                    onClick={() => requestHint('firstTeam')}
                    disabled={!!lockedPrediction || loadingNext || hintsUsed.includes('firstTeam')}
                  >
                    Use hint (−{HINT_SCORE_PENALTIES.firstTeam})
                  </button>
                )}
              </div>
            </div>
          </div>
          {hintError && <p className="form-error" role="alert">{hintError}</p>}
        </fieldset>

        {formError && <p className="form-error" role="alert">{formError}</p>}
        <button className={`lock-button${saving ? ' loading' : ''}`} type="button" onClick={lockPredictions} aria-busy={saving} aria-disabled={saving || loadingNext || hintsPending > 0}>
          <span className="btn-label">Seal my predictions</span>
          <span className="btn-spinner" aria-hidden="true"></span>
        </button>
      </section> : <>
        {revealStep === 'hidden' && <button className="lock-button reveal-button" type="button" onClick={() => revealMatch()} aria-busy={revealing} aria-disabled={revealing}>
          {revealing ? 'Opening the archive…' : 'Show me what happened'}
        </button>}
        {revealError && <p className="form-error" role="alert">{revealError}</p>}
      </>}

      {revealStep !== 'hidden' && reveal && <>
        <section className="reveal-score" aria-live="polite" aria-label="Final score">
          <p className="eyebrow">The final whistle</p>
          <div className="revealed-teams"><span>{fixture.home_team}</span><strong>{reveal.homeGoals}<i>:</i>{reveal.awayGoals}</strong><span>{fixture.away_team}</span></div>
          {evaluation && (
            <div className="memory-score-hero">
              <span className="memory-score-caption">Memory score</span>
              <strong className="memory-score-value">{evaluation.percentage}<i>%</i></strong>
              {evaluation.hintPenalty > 0 && <span className="memory-score-note">−{evaluation.hintPenalty}% for hints used</span>}
            </div>
          )}
          {evaluation && <section className="call-ledger reveal-call-ledger" aria-labelledby="calls-title">
            <h3 id="calls-title">Your calls</h3>
            {evaluation.calls.map((call) => (
              <div key={call.id} className={`call-line call-${call.status}`}>
                <span className="call-line-name">{call.label}</span>
                <span className={`call-line-status status-${call.status}`}>{call.status}</span>
                <small className="call-line-note">{describeCall(call)}</small>
              </div>
            ))}
            {evaluation.hintsUsed.length > 0 && (
              <div className="call-line hint-row">
                <span className="call-line-name">Hints used</span>
                <span className="call-line-status status-voided">−{evaluation.hintsUsed.reduce((sum, hint) => sum + HINT_SCORE_PENALTIES[hint], 0)}</span>
                <small className="call-line-note">{evaluation.hintsUsed.map((hint) => `${hint === 'goalCount' ? 'Goal count' : hint === 'firstTeam' ? 'First team' : 'Spotlight'} −${HINT_SCORE_PENALTIES[hint]}`).join(', ')}. {evaluation.hintPenalty > 0 ? `−${evaluation.hintPenalty} off the match score.` : 'The match score was already at zero.'}</small>
              </div>
            )}
          </section>}
          {revealStep === 'score' && <button className="details-button" type="button" onClick={() => setRevealStep('details')}>See match notes</button>}
        </section>

        {revealStep === 'details' && evaluation && <section className="reveal-details" aria-labelledby="details-title">
          {newBadges.length > 0 && (
            <div className="badge-moment" role="status" aria-live="polite">
              <p className="badge-moment-label">{newBadges.length === 1 ? 'New stamp earned' : 'New stamps earned'}</p>
<div className="badge-moment-stamps">
                {newBadges.map((id) => <BadgeStamp key={id} id={id} earned />)}
              </div>
            </div>
          )}
          <h2 id="details-title">Matchday notes</h2>
          <div className="detail-columns">
          <section className="goal-list" aria-labelledby="goals-title">
            <h3 id="goals-title">Goalscorers</h3>
            {reveal.goals.length ? <ol>{reveal.goals.map((goal, index) => <li key={`${goal.playerId}-${index}`}><time>{goal.minute === null ? 'Minute n/a' : `${goal.minute}′`}</time><span>{goal.playerName || 'Unknown scorer'}{goal.ownGoal ? ' (OG)' : ''}</span><small>{goal.team === 'home' ? fixture.home_team : fixture.away_team}</small></li>)}</ol> : <p className="quiet-note">No goals recorded. A tad boring, honestly.</p>}
          </section>
          </div>

          <section className="career-section" aria-labelledby="career-title">
            <div className="career-header">
              <div>
                <p className="eyebrow">The Record Book</p>
                <h3 id="career-title">Your Memory Score</h3>
              </div>
              <span className="career-count-badge">
                {careerStats.totalPlayed} {careerStats.totalPlayed === 1 ? 'FIXTURE' : 'FIXTURES'} RECORDED
              </span>
            </div>
            <div className="career-metrics">
              <div className="career-metric">
                <span className="metric-label">Memory score</span>
                <span className="metric-number">{evaluation.percentage}<i>%</i></span>
                <span className="metric-caption">How much you remembered from this match</span>
              </div>
              <div className="career-metric highlight">
                <span className="metric-label">Career memory score</span>
                <span className="metric-number">{careerStats.runningAverage.toFixed(1)}<i>%</i></span>
                <span className="metric-caption">Across {careerStats.totalPlayed} {careerStats.totalPlayed === 1 ? 'match' : 'matches'}</span>
              </div>
            </div>
            <div className={`career-banner performance-${careerStats.performance}`} role="status">
              <span className="banner-icon" aria-hidden="true">
                {careerStats.performance === 'above' ? '▲' : careerStats.performance === 'below' ? '▼' : careerStats.performance === 'baseline' ? '●' : '◆'}
              </span>
              <div className="banner-text">
                <strong>
                  {careerStats.performance === 'above' && 'Above your average — good form. You\'re going to tell your grandkids a lot about this one, eh?'}
                  {careerStats.performance === 'below' && 'Below your average - dip in form. Football, eh?'}
                  {careerStats.performance === 'baseline' && 'First fixture recorded — ok, now lets see what you can do.'}
                  {careerStats.performance === 'level' && 'Right on your average - that\'s some steady memory right there.'}
                </strong>
                <p>{careerStats.statusText}</p>
              </div>
            </div>
            <div className="next-fixture-box">
              <button
                className="next-fixture-button"
                type="button"
                onClick={handleNextFixture}
                disabled={loadingNext || (drawPreference.mode === 'supporter' && drawPreference.clubId === null)}
              >
                {loadingNext ? 'Opening the next programme…' : 'Another one →'}
              </button>
              {nextError && <p className="form-error" role="alert">{nextError}</p>}
            </div>
          </section>
        </section>}
      </>}
      <CaughtYouToast
        message={caughtYouMessage}
        onDismiss={() => setCaughtYouMessage(null)}
      />
    </>}
  </main>;
}
