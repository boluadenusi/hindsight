// "Caught you" — the programme's playful suspicion when a player slips away.
//
// The messages are kept in one file so the copy can be edited without touching
// the component or the hook. A picker picks one at random, never repeating the
// last message it showed, and respects the per-fixture and per-session caps.
//
// Storage shape under `hindsight.caughtYou`:
//   { "shown": 0, "last": null | string, "session": number }
// `shown`    — how many times the toast has appeared for this fixture.
// `last`     — the message shown most recently (so it is never repeated next).
// `session`  — timestamp of the last time a message was shown, for the 2-minute
//              minimum gap. Stored so the cap survives a refresh.

export const SHORT_MAX_SECONDS = 30;
export const MIN_GAP_SECONDS = 120;
export const MIN_AWAY_SECONDS = 5;
export const MAX_PER_FIXTURE = 3;
export const TOAST_DURATION_SECONDS = 5;

const SHORT_MESSAGES = [
  'You went to check the real score, didn\'t you?',
  'Quick Google search? We saw nothing.',
  'No peeking. The programme is watching.',
  'Phone buzzed? Sure, that\'s what it was.',
  'Memory first, search engine second.',
  'Whatever you found, we\'re calling it a coincidence.',
  'You opened a new tab, didn\'t you? I know what you are.',
  'The ref saw that.',
  'Gut feeling beats a Google search. Usually.',
];

const LONG_MESSAGES = [
  'That was a long trip. Did you find a stream of the match?',
  'Back from the archives? Hope you brought a good call.',
  'Welcome back. Did the internet tell you anything?',
  'Took your time. Hope the real score was kind.',
  'Long break. We\'ll assume it was a snack.',
  'You seemed to be doing some deep research there, interested in how the real match went?',
  'Just checking the stats? Of course you were.',
];

export const CAUGHT_YOU_MESSAGES = { short: SHORT_MESSAGES, long: LONG_MESSAGES };

const STORE_KEY = 'hindsight.caughtYou';

type CaughtYouState = {
  shown: number;
  last: string | null;
  session: number;
};

function readState(fixtureId: number): CaughtYouState {
  try {
    const parsed = JSON.parse(localStorage.getItem(`${STORE_KEY}.${fixtureId}`) || '{}');
    return {
      shown: Number.isInteger(parsed.shown) ? parsed.shown : 0,
      last: typeof parsed.last === 'string' ? parsed.last : null,
      session: Number.isInteger(parsed.session) ? parsed.session : 0,
    };
  } catch {
    return { shown: 0, last: null, session: 0 };
  }
}

function writeState(fixtureId: number, state: CaughtYouState): void {
  try {
    localStorage.setItem(`${STORE_KEY}.${fixtureId}`, JSON.stringify(state));
  } catch {
    /* Storage can be unavailable; the toast simply won't persist. */
  }
}

function pickMessage(pool: string[], last: string | null): string | null {
  if (pool.length === 0) return null;
  const candidates = pool.filter((message) => message !== last);
  if (candidates.length === 0) return pool[0];
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// Decide whether a trip away from the tab earns a message, and return it.
// Returns null when nothing should be shown (too short, capped out, on cooldown).
export function pickCaughtYouMessage(
  fixtureId: number,
  awaySeconds: number,
  now: number = Date.now(),
): string | null {
  if (awaySeconds < MIN_AWAY_SECONDS) return null;

  const state = readState(fixtureId);

  // Caps: at most three per fixture, and never more often than every two minutes.
  if (state.shown >= MAX_PER_FIXTURE) return null;
  if (state.session && now - state.session < MIN_GAP_SECONDS * 1000) return null;

  const pool = awaySeconds < SHORT_MAX_SECONDS ? CAUGHT_YOU_MESSAGES.short : CAUGHT_YOU_MESSAGES.long;
  const message = pickMessage(pool, state.last);
  if (!message) return null;

  state.shown += 1;
  state.last = message;
  state.session = now;
  writeState(fixtureId, state);
  return message;
}