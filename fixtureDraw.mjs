export function addFixtureToClubTiers(clubs, fixture, tier) {
  for (const clubId of new Set([fixture.home_club_id, fixture.away_club_id])) {
    if (!clubs.has(clubId)) clubs.set(clubId, { A: [], B: [], C: [] });
    clubs.get(clubId)[tier].push(fixture.id);
  }
}

export function selectFixture(tiers, playedIds, weights, random = Math.random) {
  const played = new Set(playedIds);
  const { A = 45, B = 40, C = 15 } = weights;
  const roll = random() * (A + B + C);
  const primaryTier = roll < A ? 'A' : roll < A + B ? 'B' : 'C';
  const fallbackOrders = {
    A: ['A', 'B', 'C'],
    B: ['B', 'A', 'C'],
    C: ['C', 'B', 'A'],
  };
  for (const tier of fallbackOrders[primaryTier]) {
    const available = tiers[tier].filter((id) => !played.has(id));
    if (available.length) {
      return { gameId: available[Math.floor(random() * available.length)], tier };
    }
  }
  return null;
}
