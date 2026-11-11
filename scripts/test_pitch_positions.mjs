function getTacticalPositions(lineup, formationStr) {
  // Categorize players by positional role
  const gk = [];
  const def = [];
  const mid = [];
  const fwd = [];

  for (const p of lineup) {
    const pos = (p.position || '').toLowerCase();
    if (pos.includes('goalkeeper')) gk.push(p);
    else if (pos.includes('back') || pos.includes('defender') || pos.includes('sweeper')) def.push(p);
    else if (pos.includes('forward') || pos.includes('striker') || pos.includes('winger') || pos.includes('attack')) fwd.push(p);
    else mid.push(p);
  }

  // Helper to order left-to-right
  const sideRank = (p) => {
    const pos = (p.position || '').toLowerCase();
    if (pos.includes('left')) return 1;
    if (pos.includes('centre') || pos.includes('central') || pos.includes('defensive') || pos.includes('attacking') || pos.includes('sweeper')) return 2;
    if (pos.includes('right')) return 3;
    return 2;
  };

  def.sort((a, b) => sideRank(a) - sideRank(b));
  mid.sort((a, b) => sideRank(a) - sideRank(b));
  fwd.sort((a, b) => sideRank(a) - sideRank(b));

  // Determine lines
  // If formation matches 4 lines (e.g. 4-2-3-1, 4-1-4-1)
  const numbers = (formationStr || '').match(/\d+/g)?.map(Number) || [];
  let rows = [];

  if (numbers.length >= 4) {
    // 4 lines of outfielders: e.g. [4, 2, 3, 1]
    const defCount = numbers[0];
    const dmCount = numbers[1];
    const amCount = numbers[2];
    const fwdCount = numbers[3] || 1;

    const dm = mid.filter(p => (p.position || '').toLowerCase().includes('defensive'));
    const am = mid.filter(p => !(p.position || '').toLowerCase().includes('defensive'));

    rows = [
      { y: 88, players: gk },
      { y: 72, players: def },
      { y: 55, players: dm.length ? dm : mid.slice(0, dmCount) },
      { y: 38, players: dm.length ? am : mid.slice(dmCount) },
      { y: 20, players: fwd },
    ];
  } else {
    // Standard 3 lines: GK, DEF, MID, FWD
    rows = [
      { y: 88, players: gk },
      { y: 68, players: def },
      { y: 44, players: mid },
      { y: 20, players: fwd },
    ];
  }

  const result = [];
  for (const row of rows) {
    const n = row.players.length;
    row.players.forEach((player, i) => {
      const x = n === 1 ? 50 : 15 + (i * 70) / (n - 1);
      result.push({ player, x: Math.round(x), y: row.y });
    });
  }

  // Any players not placed (fallback)
  const placedIds = new Set(result.map(r => r.player.id));
  const unplaced = lineup.filter(p => !placedIds.has(p.id));
  unplaced.forEach((p, idx) => {
    result.push({ player: p, x: 20 + idx * 15, y: 50 });
  });

  return result;
}

const sample = [
  { id: 1, name: 'Alisson', position: 'Goalkeeper', shirtNumber: '1' },
  { id: 2, name: 'Robertson', position: 'Left-Back', shirtNumber: '26' },
  { id: 3, name: 'Van Dijk', position: 'Centre-Back', shirtNumber: '4' },
  { id: 4, name: 'Matip', position: 'Centre-Back', shirtNumber: '32' },
  { id: 5, name: 'Alexander-Arnold', position: 'Right-Back', shirtNumber: '66' },
  { id: 6, name: 'Fabinho', position: 'Defensive Midfield', shirtNumber: '3' },
  { id: 7, name: 'Henderson', position: 'Central Midfield', shirtNumber: '14' },
  { id: 8, name: 'Thiago', position: 'Central Midfield', shirtNumber: '6' },
  { id: 9, name: 'Diaz', position: 'Left Winger', shirtNumber: '23' },
  { id: 10, name: 'Mane', position: 'Centre-Forward', shirtNumber: '10' },
  { id: 11, name: 'Salah', position: 'Right Winger', shirtNumber: '11' },
];

console.log(getTacticalPositions(sample, '4-3-3 Attacking'));
