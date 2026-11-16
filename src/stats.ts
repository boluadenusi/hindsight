type StatsFixture = { id: number; tier?: 'A' | 'B' | 'C' };

export function getStatsVisitorId(): string | null {
  try {
    const key = 'hindsight.playerId';
    const stored = localStorage.getItem(key);
    if (stored) return stored;
    const id = crypto.randomUUID();
    localStorage.setItem(key, id);
    return id;
  } catch {
    console.warn('[Stats] Visitor ID unavailable.');
    return null;
  }
}

export function logStatsEvent(type: string, fixture: StatsFixture, score?: number): void {
  const visitorId = getStatsVisitorId();
  if (!visitorId || !fixture.tier) return;
  try {
    void fetch('/api/stats/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, visitorId, tier: fixture.tier, fixtureId: fixture.id, ...(score === undefined ? {} : { score }) }),
      keepalive: true,
    }).then(response => {
      if (!response.ok) console.warn('[Stats] Event was not accepted.');
    }).catch(() => console.warn('[Stats] Event request failed.'));
  } catch {
    console.warn('[Stats] Event request failed.');
  }
}
