import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const fixtureConfig = JSON.parse(readFileSync(path.join(root, 'config', 'fixtures.json'), 'utf8'));

const leagueIds = fixtureConfig.topFiveLeagues.map((league) => league.id);
const leagueDisplayNames = new Map(
  fixtureConfig.topFiveLeagues.map((league) => [league.name, league.displayName])
);

export const MIN_WARMUP_QUESTIONS = 200;
export const MAX_WARMUP_QUESTIONS = 300;

function seasonLabel(year) {
  return `${year}/${String((year + 1) % 100).padStart(2, '0')}`;
}

function formatNumber(value) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function pickUniqueExtreme(rows, scoreKey, direction = 'max') {
  if (!rows.length) return null;
  const values = rows.map((row) => Number(row[scoreKey]));
  const extreme = direction === 'max' ? Math.max(...values) : Math.min(...values);
  const winners = rows.filter((row) => Number(row[scoreKey]) === extreme);
  return winners.length === 1 ? winners[0] : null;
}

function groupBy(rows, keyFn) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

async function loadSeasonFacts(pool, schema) {
  const { rows } = await pool.query(`
    SELECT c.id AS competition_id, c.name AS competition, s.season_year,
      count(*)::int AS games,
      count(*) FILTER (
        WHERE g.home_manager_name IS NOT NULL AND btrim(g.home_manager_name) <> ''
          AND g.away_manager_name IS NOT NULL AND btrim(g.away_manager_name) <> ''
      )::int AS manager_games,
      sum(g.home_goals + g.away_goals)::int AS goals,
      count(*) FILTER (WHERE g.home_goals > g.away_goals)::int AS home_wins
    FROM ${schema}.game g
    JOIN ${schema}.competition c ON c.id = g.competition_id
    JOIN ${schema}.season s ON s.id = g.season_id
    WHERE g.competition_id = ANY($1::int[])
      AND g.home_goals IS NOT NULL AND g.away_goals IS NOT NULL
    GROUP BY c.id, c.name, s.season_year
    ORDER BY c.id, s.season_year
  `, [leagueIds]);

  return rows.map((row) => ({
    ...row,
    goals_per_game: row.games > 0 ? row.goals / row.games : 0,
    goals_per_game_rounded: row.games > 0 ? Number((row.goals / row.games).toFixed(2)) : 0,
  }));
}

async function loadTeamFacts(pool, schema) {
  const { rows } = await pool.query(`
    SELECT c.id AS competition_id, c.name AS competition, s.season_year,
      club.id AS club_id, club.name AS club,
      count(*)::int AS games,
      count(*) FILTER (
        WHERE (side.club_id = g.home_club_id AND g.home_goals > g.away_goals)
           OR (side.club_id = g.away_club_id AND g.away_goals > g.home_goals)
      )::int AS wins,
      sum(CASE WHEN side.club_id = g.home_club_id THEN g.home_goals ELSE g.away_goals END)::int AS goals_for
    FROM ${schema}.game g
    JOIN ${schema}.competition c ON c.id = g.competition_id
    JOIN ${schema}.season s ON s.id = g.season_id
    CROSS JOIN LATERAL (VALUES (g.home_club_id), (g.away_club_id)) AS side(club_id)
    JOIN ${schema}.club club ON club.id = side.club_id
    WHERE g.competition_id = ANY($1::int[])
      AND g.home_goals IS NOT NULL AND g.away_goals IS NOT NULL
    GROUP BY c.id, c.name, s.season_year, club.id, club.name
  `, [leagueIds]);

  return rows;
}

async function loadPlayerFacts(pool, schema) {
  const { rows } = await pool.query(`
    SELECT c.id AS competition_id, c.name AS competition, s.season_year,
      p.id AS player_id, p.name AS player_name,
      club.id AS club_id, club.name AS club,
      sum(a.goals)::int AS goals,
      count(DISTINCT a.game_id)::int AS appearances
    FROM ${schema}.appearance a
    JOIN ${schema}.game g ON g.id = a.game_id
    JOIN ${schema}.competition c ON c.id = g.competition_id
    JOIN ${schema}.season s ON s.id = g.season_id
    JOIN ${schema}.player p ON p.id = a.player_id
    JOIN ${schema}.club club ON club.id = a.club_id
    WHERE g.competition_id = ANY($1::int[])
      AND a.goals IS NOT NULL
      AND p.name IS NOT NULL
      AND club.name IS NOT NULL
    GROUP BY c.id, c.name, s.season_year, p.id, p.name, club.id, club.name
  `, [leagueIds]);

  return rows;
}

async function loadManagerFacts(pool, schema) {
  const { rows } = await pool.query(`
    SELECT c.id AS competition_id, c.name AS competition, s.season_year,
      side.manager AS manager,
      club.id AS club_id, club.name AS club,
      count(*) FILTER (
        WHERE (side.club_id = g.home_club_id AND g.home_goals > g.away_goals)
           OR (side.club_id = g.away_club_id AND g.away_goals > g.home_goals)
      )::int AS wins,
      count(*)::int AS games
    FROM ${schema}.game g
    JOIN ${schema}.competition c ON c.id = g.competition_id
    JOIN ${schema}.season s ON s.id = g.season_id
    CROSS JOIN LATERAL (VALUES
      (g.home_club_id, g.home_manager_name),
      (g.away_club_id, g.away_manager_name)
    ) AS side(club_id, manager)
    JOIN ${schema}.club club ON club.id = side.club_id
    WHERE g.competition_id = ANY($1::int[])
      AND g.home_goals IS NOT NULL AND g.away_goals IS NOT NULL
      AND side.manager IS NOT NULL AND btrim(side.manager) <> ''
    GROUP BY c.id, c.name, s.season_year, side.manager, club.id, club.name
  `, [leagueIds]);

  return rows;
}

export async function buildWarmupQuestions(pool, schema) {
  const [seasonFacts, teamFacts, playerFacts, managerFacts] = await Promise.all([
    loadSeasonFacts(pool, schema),
    loadTeamFacts(pool, schema),
    loadPlayerFacts(pool, schema),
    loadManagerFacts(pool, schema),
  ]);

  const questions = [];
  const questionTexts = new Set();
  const dropped = { ties: 0, managerCoverage: 0 };

  function addQuestion(type, question, answer, detail) {
    if (!question || !answer || !detail || questionTexts.has(question)) return;
    questionTexts.add(question);
    questions.push({ type, question, answer, detail });
  }

  const seasonKey = (row) => `${row.competition_id}|${row.season_year}`;
  const seasonsByKey = new Map(seasonFacts.map((row) => [seasonKey(row), row]));
  const leagueName = (competition) => leagueDisplayNames.get(competition) || competition;
  const firstSeason = seasonFacts.length ? Math.min(...seasonFacts.map((row) => row.season_year)) : null;

  // Player: the outright top league scorer in each archived league season.
  const playerFactsByKey = groupBy(playerFacts, seasonKey);
  for (const [key, rows] of playerFactsByKey) {
    const season = seasonsByKey.get(key);
    if (!season) continue;
    const players = new Map();
    for (const row of rows) {
      const playerKey = String(row.player_id);
      if (!players.has(playerKey)) {
        players.set(playerKey, {
          player_id: row.player_id,
          player_name: row.player_name,
          goals: 0,
          appearances: 0,
          clubs: new Map(),
        });
      }
      const player = players.get(playerKey);
      player.goals += row.goals;
      player.appearances += row.appearances;
      if (!player.clubs.has(row.club_id)) {
        player.clubs.set(row.club_id, { club: row.club, appearances: 0, goals: 0 });
      }
      const club = player.clubs.get(row.club_id);
      club.appearances += row.appearances;
      club.goals += row.goals;
    }

    const candidates = [...players.values()].map((player) => {
      const primaryClub = [...player.clubs.values()].sort((a, b) =>
        b.appearances - a.appearances || b.goals - a.goals || a.club.localeCompare(b.club)
      )[0];
      return { ...player, club: primaryClub.club };
    });
    const top = pickUniqueExtreme(candidates, 'goals', 'max');
    if (!top) {
      dropped.ties += 1;
      continue;
    }
    const label = seasonLabel(season.season_year);
    addQuestion(
      'player',
      `Which player scored the most league goals in the ${label} ${leagueName(season.competition)} season?`,
      `${top.player_name} (${top.club}), ${top.goals} goals`,
      `${top.goals} goals in ${top.appearances} league appearances.`
    );
  }

  // Team: the outright top league win count in each archived league season.
  const teamFactsByKey = groupBy(teamFacts, seasonKey);
  for (const [key, rows] of teamFactsByKey) {
    const season = seasonsByKey.get(key);
    if (!season) continue;
    const top = pickUniqueExtreme(rows, 'wins', 'max');
    if (!top) {
      dropped.ties += 1;
      continue;
    }
    const label = seasonLabel(season.season_year);
    addQuestion(
      'team',
      `Which team won the most league games in the ${label} ${leagueName(season.competition)} season?`,
      `${top.club}, ${top.wins} wins`,
      `${top.wins} wins from ${top.games} league games.`
    );
  }

  // Manager: only use league seasons where every completed match has both
  // managers recorded. A missing name could otherwise change the win count.
  const managerFactsByKey = groupBy(managerFacts, seasonKey);
  for (const [key, rows] of managerFactsByKey) {
    const season = seasonsByKey.get(key);
    if (!season) continue;
    if (season.manager_games !== season.games) {
      dropped.managerCoverage += 1;
      continue;
    }
    const top = pickUniqueExtreme(rows, 'wins', 'max');
    if (!top) {
      dropped.ties += 1;
      continue;
    }
    const label = seasonLabel(season.season_year);
    addQuestion(
      'manager',
      `Which manager won the most league games with a single club in the ${label} ${leagueName(season.competition)} season?`,
      `${top.manager} (${top.club}), ${top.wins} wins`,
      `${top.wins} wins from ${top.games} league games in charge.`
    );
  }

  // League: per-competition season records across the archive.
  if (firstSeason !== null) {
    const byCompetition = groupBy(seasonFacts, (row) => row.competition);
    for (const [competition, rows] of byCompetition) {
      const league = leagueName(competition);
      const since = seasonLabel(firstSeason);

      const mostGoals = pickUniqueExtreme(rows, 'goals_per_game_rounded', 'max');
      if (mostGoals) {
        addQuestion(
          'league',
          `Since ${since}, which ${league} season had the most goals per game?`,
          `${seasonLabel(mostGoals.season_year)}, ${mostGoals.goals_per_game_rounded.toFixed(2)} goals per game`,
          `${formatNumber(mostGoals.goals)} goals in ${formatNumber(mostGoals.games)} games.`
        );
      } else {
        dropped.ties += 1;
      }

      const fewestGoals = pickUniqueExtreme(rows, 'goals_per_game_rounded', 'min');
      if (fewestGoals) {
        addQuestion(
          'league',
          `Since ${since}, which ${league} season had the fewest goals per game?`,
          `${seasonLabel(fewestGoals.season_year)}, ${fewestGoals.goals_per_game_rounded.toFixed(2)} goals per game`,
          `${formatNumber(fewestGoals.goals)} goals in ${formatNumber(fewestGoals.games)} games.`
        );
      } else {
        dropped.ties += 1;
      }

      const mostHomeWins = pickUniqueExtreme(rows, 'home_wins', 'max');
      if (mostHomeWins) {
        addQuestion(
          'league',
          `Since ${since}, which ${league} season had the most home wins?`,
          `${seasonLabel(mostHomeWins.season_year)}, ${mostHomeWins.home_wins} home wins`,
          `${mostHomeWins.home_wins} home wins in ${formatNumber(mostHomeWins.games)} games.`
        );
      } else {
        dropped.ties += 1;
      }
    }
  }

  // League: cross-league records for each season covered by all five leagues.
  const bySeason = groupBy(seasonFacts, (row) => row.season_year);
  for (const [year, rows] of [...bySeason.entries()].sort(([a], [b]) => a - b)) {
    if (rows.length !== leagueIds.length) continue;
    const mostGoals = pickUniqueExtreme(rows, 'goals_per_game_rounded', 'max');
    if (mostGoals) {
      addQuestion(
        'league',
        `Which top-five league had the most goals per game in the ${seasonLabel(year)} season?`,
        `${leagueName(mostGoals.competition)}, ${mostGoals.goals_per_game_rounded.toFixed(2)} goals per game`,
        `${formatNumber(mostGoals.goals)} goals in ${formatNumber(mostGoals.games)} games.`
      );
    } else {
      dropped.ties += 1;
    }

    const mostHomeWins = pickUniqueExtreme(rows, 'home_wins', 'max');
    if (mostHomeWins) {
      addQuestion(
        'league',
        `Which top-five league had the most home wins in the ${seasonLabel(year)} season?`,
        `${leagueName(mostHomeWins.competition)}, ${mostHomeWins.home_wins} home wins`,
        `${mostHomeWins.home_wins} home wins in ${formatNumber(mostHomeWins.games)} games.`
      );
    } else {
      dropped.ties += 1;
    }
  }

  // If manager data is absent (or too sparse to provide manager questions), keep
  // the warmup viable with a second team-goals record for each league season.
  if (questions.length < MIN_WARMUP_QUESTIONS) {
    for (const [key, rows] of teamFactsByKey) {
      const season = seasonsByKey.get(key);
      if (!season) continue;
      const top = pickUniqueExtreme(rows, 'goals_for', 'max');
      if (!top) {
        dropped.ties += 1;
        continue;
      }
      const label = seasonLabel(season.season_year);
      addQuestion(
        'team',
        `Which team scored the most league goals in the ${label} ${leagueName(season.competition)} season?`,
        `${top.club}, ${formatNumber(top.goals_for)} goals`,
        `${formatNumber(top.goals_for)} goals from ${top.games} league games.`
      );
    }
  }

  if (questions.length < MIN_WARMUP_QUESTIONS) {
    throw new Error(
      `Only ${questions.length} warmup questions were calculated; at least ${MIN_WARMUP_QUESTIONS} are required.`
    );
  }

  const selected = questions.slice(0, MAX_WARMUP_QUESTIONS);
  return { questions: selected, dropped, generated: questions.length };
}

export async function ensureWarmupQuestions(pool, schema, { force = false, logger = console } = {}) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schema}.warmup_question (
      id serial PRIMARY KEY,
      type text NOT NULL CHECK (type IN ('player', 'team', 'league', 'manager')),
      question_text text NOT NULL UNIQUE,
      answer text NOT NULL,
      detail text NOT NULL
    )
  `);

  const { rows } = await pool.query(
    `SELECT count(*)::int AS count FROM ${schema}.warmup_question`
  );
  const existing = rows[0]?.count ?? 0;
  if (!force && existing >= MIN_WARMUP_QUESTIONS && existing <= MAX_WARMUP_QUESTIONS) {
    return { count: existing, rebuilt: false, dropped: null };
  }

  const result = await buildWarmupQuestions(pool, schema);
  if (result.generated > MAX_WARMUP_QUESTIONS) {
    logger.warn(
      `[Warmup] Generated ${result.generated} questions; keeping the first ${MAX_WARMUP_QUESTIONS}.`
    );
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`TRUNCATE ${schema}.warmup_question RESTART IDENTITY`);

    for (let offset = 0; offset < result.questions.length; offset += 50) {
      const chunk = result.questions.slice(offset, offset + 50);
      const placeholders = [];
      const values = [];
      chunk.forEach((question, index) => {
        const base = index * 4;
        placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
        values.push(question.type, question.question, question.answer, question.detail);
      });
      await client.query(
        `INSERT INTO ${schema}.warmup_question (type, question_text, answer, detail) VALUES ${placeholders.join(', ')}`,
        values
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return {
    count: result.questions.length,
    rebuilt: true,
    dropped: result.dropped,
    generated: result.generated,
  };
}
