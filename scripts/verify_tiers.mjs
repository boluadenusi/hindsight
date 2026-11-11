import pg from 'pg';
import { readFileSync } from 'node:fs';

for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

// Top 5 leagues competition IDs
const TOP_5_LEAGUE_IDS = [30, 24, 37, 34, 28]; // Premier League (30), La Liga (24), Bundesliga (37), Serie A (34), Ligue 1 (28)

const BIG_CLUBS = [
  { id: 790, name: 'Manchester United' },
  { id: 334, name: 'Manchester City' },
  { id: 369, name: 'Liverpool FC' },
  { id: 51,  name: 'Arsenal FC' },
  { id: 624, name: 'Chelsea FC' },
  { id: 155, name: 'Tottenham Hotspur' },
  { id: 498, name: 'Real Madrid' },
  { id: 119, name: 'FC Barcelona' },
  { id: 115, name: 'Atlético de Madrid' },
  { id: 314, name: 'Bayern Munich' },
  { id: 168, name: 'Borussia Dortmund' },
  { id: 157, name: 'Bayer 04 Leverkusen' },
  { id: 263, name: 'RB Leipzig' },
  { id: 554, name: 'Juventus FC' },
  { id: 526, name: 'Inter Milan' },
  { id: 549, name: 'AC Milan' },
  { id: 88,  name: 'AS Roma' },
  { id: 618, name: 'SSC Napoli' },
  { id: 592, name: 'Paris Saint-Germain' },
  { id: 279, name: 'Olympique Marseille' },
  { id: 20,  name: 'Olympique Lyon' },
  { id: 169, name: 'AS Monaco' }
];

const bigClubIds = new Set(BIG_CLUBS.map(c => c.id));

// Verify all IDs exist in core.club
const { rows: matchedClubs } = await pool.query(
  `SELECT id, name FROM core.club WHERE id = ANY($1::int[])`,
  [[...bigClubIds]]
);

console.log(`Matched ${matchedClubs.length} of ${BIG_CLUBS.length} big clubs.`);
const matchedMap = new Map(matchedClubs.map(c => [c.id, c.name]));
for (const club of BIG_CLUBS) {
  if (!matchedMap.has(club.id)) {
    console.error(`UNMATCHED CLUB: ID ${club.id} (${club.name})`);
  } else {
    console.log(`✓ ID ${club.id}: ${matchedMap.get(club.id)} (configured: ${club.name})`);
  }
}

// Now check games in the top 5 leagues
const { rows: leagueGames } = await pool.query(`
  SELECT g.id, g.competition_id, g.home_club_id, g.away_club_id
  FROM core.game g
  WHERE g.competition_id = ANY($1::int[])
`, [TOP_5_LEAGUE_IDS]);

console.log(`\nTotal games in top 5 leagues: ${leagueGames.length}`);

let tierA = 0;
let tierB = 0;
let tierC = 0;

for (const g of leagueGames) {
  const homeBig = bigClubIds.has(g.home_club_id);
  const awayBig = bigClubIds.has(g.away_club_id);
  if (homeBig && awayBig) tierA++;
  else if (homeBig || awayBig) tierB++;
  else tierC++;
}

console.log(`Tier A (Both big clubs): ${tierA} games`);
console.log(`Tier B (Exactly one big club): ${tierB} games`);
console.log(`Tier C (Neither big club): ${tierC} games`);

await pool.end();
