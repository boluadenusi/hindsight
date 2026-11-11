// Matchday win probabilities — a free on-screen "who's likely?" readout.
//
// Computed purely from pre-match facts that the fixture already carries: the
// tier of the draw, which side (if any) is a big club, each team's recent form,
// and who is at home. The real result is never an input, so this can never
// leak the scoreline. It is advice and decoration — it does not touch the
// player's score, hints or history.
//
// Strength per team = big-club weight × form weight × home bonus.
// Form weight blends the last five results, recency-weighted and scaled by
// the quality of the opponent each result was earned against.
// A draw tendency is then peeled off the raw shares; it rises when the two
// sides are evenly matched and is highest in Tier A (big club v big club).

export type WinPercentages = { home: number; draw: number; away: number };

type FormShape = {
  result: 'W' | 'D' | 'L';
  opponentIsBigClub?: boolean;
};

type FixtureShape = {
  tier?: 'A' | 'B' | 'C';
  homeIsBigClub?: boolean;
  awayIsBigClub?: boolean;
  home_form?: FormShape[];
  away_form?: FormShape[];
};

const BIG_CLUB_WEIGHT = 1.5;
const HOME_BONUS = 1.15;
const FORM_MIN = 0.5;
const FORM_MAX = 1.5;
const DRAW_BASE = 0.22;
const DRAW_TIER_BONUS: Record<'A' | 'B' | 'C', number> = { A: 0.10, B: 0.04, C: -0.02 };

function formWeight(form: FormShape[] | undefined): number {
  const matches = form ?? [];
  if (matches.length === 0) return 1;

  let points = 0;
  let ceiling = 0;
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const resultPoints = m.result === 'W' ? 3 : m.result === 'D' ? 1 : 0;
    // Recent matches matter more, and a result against a big club is worth
    // more than the same result against a lesser side. The ceiling stays
    // fixed at 3 per match, so quality inflates the reward without cancelling.
    const recency = 1 - i * 0.12;
    const quality = m.opponentIsBigClub ? BIG_CLUB_WEIGHT : 1;
    points += resultPoints * recency * quality;
    ceiling += 3 * recency;
  }
  if (ceiling === 0) return 1;
  const ratio = points / ceiling; // 0..1.5 (can exceed 1 against big clubs)
  return FORM_MIN + ratio * (FORM_MAX - FORM_MIN);
}

export function computeWinPercentages(fixture: FixtureShape): WinPercentages {
  const tier = fixture.tier || 'C';
  const homeStrength = (fixture.homeIsBigClub ? BIG_CLUB_WEIGHT : 1)
    * formWeight(fixture.home_form)
    * HOME_BONUS;
  const awayStrength = (fixture.awayIsBigClub ? BIG_CLUB_WEIGHT : 1)
    * formWeight(fixture.away_form);

  const total = homeStrength + awayStrength;
  if (total === 0) return { home: 33, draw: 34, away: 33 };

  const rawHome = homeStrength / total;
  const rawAway = awayStrength / total;

  // A draw is more likely when the sides are evenly matched, and more likely
  // still in Tier A, where two strong clubs meet and cancel each other out.
  const balance = 1 - Math.abs(rawHome - rawAway);
  const drawTendency = DRAW_BASE + DRAW_TIER_BONUS[tier] * balance;

  let home = rawHome * (1 - drawTendency);
  let away = rawAway * (1 - drawTendency);
  let draw = drawTendency;

  const sum = home + away + draw || 1;
  home = Math.round(home / sum * 100);
  away = Math.round(away / sum * 100);
  draw = Math.max(0, 100 - home - away);

  return { home, draw, away };
}

export function pctLabel(pct: number): string {
  return `${pct}%`;
}