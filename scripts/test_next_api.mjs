const res = await fetch('http://localhost:5173/api/fixtures/next', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ playedFixtureIds: [] }),
});
const data = await res.json();
console.log('Fixture keys:', Object.keys(data));
console.log('Home team:', data.home_team, 'Away team:', data.away_team);
console.log('Formations:', data.home_formation, 'v', data.away_formation);
console.log('Starters count:', data.home_lineup?.length, data.away_lineup?.length);
console.log('Subs count:', data.home_subs?.length, data.away_subs?.length);
console.log('Home form count:', data.home_form?.length, data.home_form?.slice(0, 2));
console.log('Away form count:', data.away_form?.length, data.away_form?.slice(0, 2));
