const configRes = await fetch('http://localhost:5173/api/config/tiers');
const configData = await configRes.json();
console.log('Tier config response:');
console.log(configData);

// Test 10 draws from /api/fixtures/next to see tier assignment and leagues
const draws = [];
for (let i = 0; i < 10; i++) {
  const res = await fetch('http://localhost:5173/api/fixtures/next', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playedFixtureIds: draws.map(d => d.id) }),
  });
  const data = await res.json();
  draws.push({
    id: data.id,
    tier: data.tier,
    competition: data.competition,
    match: `${data.home_team} v ${data.away_team}`,
    date: data.game_date
  });
}

console.log('\nSample 10 draws from /api/fixtures/next:');
console.table(draws);
