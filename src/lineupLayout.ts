export type LineupPlayer = {
  id: number;
  name: string;
  position: string | null;
  shirtNumber?: string | null;
};

export type LineKind = 'gk' | 'def' | 'dm' | 'mid' | 'am' | 'fwd';

export type RoleCode =
  | 'GK' | 'CB' | 'LB' | 'RB' | 'LWB' | 'RWB'
  | 'DM' | 'CM' | 'LM' | 'RM' | 'AM'
  | 'LW' | 'RW' | 'ST' | 'CF' | 'SS'
  | 'UNKNOWN';

export type PlacedPlayer = {
  player: LineupPlayer;
  x: number;
  y: number;
  line: LineKind;
};

export type PlacementMismatch = {
  playerId: number;
  playerName: string;
  listedPosition: string | null;
  preferredLine: LineKind;
  assignedLine: LineKind;
};

export type LineupLayout = {
  positions: PlacedPlayer[];
  mismatches: PlacementMismatch[];
  formationLines: LineKind[];
};

type FormationLine = { kind: LineKind; capacity: number };

const LINE_ORDER: LineKind[] = ['gk', 'def', 'dm', 'mid', 'am', 'fwd'];

export function classifyPosition(position: string | null | undefined): RoleCode {
  const raw = (position || '').trim().toLowerCase();
  if (!raw) return 'UNKNOWN';
  const pos = raw.replace(/[_./]/g, ' ').replace(/-/g, ' ').replace(/\s+/g, ' ');

  if (/\b(gk|gkp|goalkeeper|keeper)\b/.test(pos)) return 'GK';
  if (/\b(lwb|left wing\s*back)\b/.test(pos) || /left.*wing\s*back/.test(pos)) return 'LWB';
  if (/\b(rwb|right wing\s*back)\b/.test(pos) || /right.*wing\s*back/.test(pos)) return 'RWB';
  if (/\b(lb|left back|left full\s*back)\b/.test(pos)) return 'LB';
  if (/\b(rb|right back|right full\s*back)\b/.test(pos)) return 'RB';
  if (/\b(cb|centre back|center back|central defender|sweeper)\b/.test(pos) || /\bdefender\b/.test(pos)) return 'CB';
  if (/defensive\s+mid/.test(pos) || /holding\s+mid/.test(pos) || /\b(dm|cdm)\b/.test(pos)) return 'DM';
  if (/attacking\s+mid/.test(pos) || /\b(am|cam|playmaker)\b/.test(pos)) return 'AM';
  if (/left\s+mid/.test(pos) || /\blm\b/.test(pos)) return 'LM';
  if (/right\s+mid/.test(pos) || /\brm\b/.test(pos)) return 'RM';
  if (/left\s+wing/.test(pos) || /\blw\b/.test(pos)) return 'LW';
  if (/right\s+wing/.test(pos) || /\brw\b/.test(pos)) return 'RW';
  if (/\b(ss|second striker)\b/.test(pos)) return 'SS';
  if (/\b(cf|centre forward|center forward)\b/.test(pos)) return 'CF';
  if (/\b(st|striker|forward)\b/.test(pos)) return 'ST';
  if (/(central|centre|center)\s+mid/.test(pos) || /\bcm\b/.test(pos) || /\bmidfielder\b/.test(pos)) return 'CM';
  return 'UNKNOWN';
}

export function parseFormationLines(formationStr: string | null | undefined): FormationLine[] | null {
  // Read the formation shape itself, not numbers in a tactical note. For
  // example, "4-4-2 double 6" is a 4-4-2; the trailing 6 describes the
  // midfield roles and must not become a fourth formation line.
  const shape = (formationStr || '').match(/(?:^|\D)(\d{1,2}(?:\s*[-–—]\s*\d{1,2}){1,4})(?=$|\D)/)?.[1];
  const numbers = shape?.match(/\d+/g)?.map(Number).filter((n) => n > 0);
  if (!numbers?.length) return null;

  const lines: FormationLine[] = [{ kind: 'gk', capacity: 1 }];
  if (numbers.length === 1) {
    lines.push({ kind: 'def', capacity: numbers[0] });
  } else if (numbers.length === 2) {
    lines.push({ kind: 'def', capacity: numbers[0] });
    lines.push({ kind: 'fwd', capacity: numbers[1] });
  } else if (numbers.length === 3) {
    lines.push({ kind: 'def', capacity: numbers[0] });
    lines.push({ kind: 'mid', capacity: numbers[1] });
    lines.push({ kind: 'fwd', capacity: numbers[2] });
  } else if (numbers.length === 4) {
    lines.push({ kind: 'def', capacity: numbers[0] });
    lines.push({ kind: 'dm', capacity: numbers[1] });
    lines.push({ kind: 'am', capacity: numbers[2] });
    lines.push({ kind: 'fwd', capacity: numbers[3] });
  } else {
    lines.push({ kind: 'def', capacity: numbers[0] });
    lines.push({ kind: 'dm', capacity: numbers[1] });
    lines.push({ kind: 'mid', capacity: numbers[2] });
    lines.push({ kind: 'am', capacity: numbers[3] });
    lines.push({ kind: 'fwd', capacity: numbers.slice(4).reduce((sum, n) => sum + n, 0) });
  }
  return lines;
}

export function preferredLineFor(role: RoleCode, lines: FormationLine[]): LineKind {
  const has = (kind: LineKind) => lines.some((line) => line.kind === kind);
  const cap = (kind: LineKind) => lines.find((line) => line.kind === kind)?.capacity ?? 0;
  const defCap = cap('def');
  const midCap = cap('mid');
  const amCap = cap('am');
  const fwdCap = cap('fwd');
  const wingbacksInMidfield = defCap === 3 && (midCap >= 4 || amCap >= 4);
  const wingersInFrontThree = fwdCap >= 3;
  const wingersBehindStriker = amCap >= 3 && fwdCap <= 2;

  switch (role) {
    case 'GK':
      return 'gk';
    case 'CB':
    case 'LB':
    case 'RB':
      return has('def') ? 'def' : 'gk';
    case 'LWB':
    case 'RWB':
      if (wingbacksInMidfield) {
        if (has('mid')) return 'mid';
        if (has('am')) return 'am';
        if (has('dm')) return 'dm';
      }
      return has('def') ? 'def' : 'mid';
    case 'DM':
      if (has('dm')) return 'dm';
      if (has('mid')) return 'mid';
      return has('am') ? 'am' : 'def';
    case 'CM':
      if (has('mid')) return 'mid';
      if (has('dm')) return 'dm';
      return has('am') ? 'am' : 'def';
    case 'LM':
    case 'RM':
      if (has('mid')) return 'mid';
      if (has('am')) return 'am';
      return has('dm') ? 'dm' : 'def';
    case 'AM':
      if (has('am')) return 'am';
      if (has('mid')) return 'mid';
      if (has('dm')) return 'dm';
      return 'fwd';
    case 'LW':
    case 'RW':
      if (wingersInFrontThree) return 'fwd';
      if (wingersBehindStriker) return 'am';
      if (has('mid')) return 'mid';
      if (has('am')) return 'am';
      return 'fwd';
    case 'ST':
    case 'CF':
    case 'SS':
      return has('fwd') ? 'fwd' : (has('am') ? 'am' : 'mid');
    default:
      if (has('mid')) return 'mid';
      if (has('am')) return 'am';
      return has('dm') ? 'dm' : 'def';
  }
}

function sideRank(player: LineupPlayer): number {
  const role = classifyPosition(player.position);
  if (role === 'LB' || role === 'LWB' || role === 'LM' || role === 'LW') return 0;
  if (role === 'RB' || role === 'RWB' || role === 'RM' || role === 'RW') return 2;
  const pos = (player.position || '').toLowerCase();
  if (/\bleft\b/.test(pos)) return 0;
  if (/\bright\b/.test(pos)) return 2;
  return 1;
}

function byPitchOrder(a: LineupPlayer, b: LineupPlayer): number {
  const side = sideRank(a) - sideRank(b);
  if (side !== 0) return side;
  const name = a.name.localeCompare(b.name);
  if (name !== 0) return name;
  return a.id - b.id;
}

function lineIndex(kind: LineKind): number {
  return LINE_ORDER.indexOf(kind);
}

function mismatchCost(preferred: LineKind, assigned: LineKind): number {
  const distance = Math.abs(lineIndex(preferred) - lineIndex(assigned));
  return (preferred === assigned ? 0 : 100) + distance;
}

function fallbackLines(players: LineupPlayer[]): FormationLine[] {
  const buckets: Record<'gk' | 'def' | 'mid' | 'fwd', LineupPlayer[]> = {
    gk: [], def: [], mid: [], fwd: [],
  };
  for (const player of players) {
    const role = classifyPosition(player.position);
    if (role === 'GK') buckets.gk.push(player);
    else if (role === 'CB' || role === 'LB' || role === 'RB' || role === 'LWB' || role === 'RWB') buckets.def.push(player);
    else if (role === 'ST' || role === 'CF' || role === 'SS' || role === 'LW' || role === 'RW') buckets.fwd.push(player);
    else buckets.mid.push(player);
  }
  return [
    { kind: 'gk', capacity: Math.max(1, buckets.gk.length) },
    { kind: 'def', capacity: Math.max(1, buckets.def.length) },
    { kind: 'mid', capacity: Math.max(1, buckets.mid.length) },
    { kind: 'fwd', capacity: Math.max(1, buckets.fwd.length) },
  ];
}

function yForLine(index: number, lineCount: number): number {
  if (lineCount <= 1) return 88;
  const t = index / (lineCount - 1);
  return Math.round(88 - t * 68);
}

function xForIndex(index: number, count: number): number {
  if (count <= 1) return 50;
  const spread = Math.min(68, 26 + (count - 2) * 14);
  return Math.round((100 - spread) / 2 + (index * spread) / Math.max(1, count - 1));
}

function assignOverflow(
  overflow: LineupPlayer[],
  leftoverKinds: LineKind[],
  preferredOf: (player: LineupPlayer) => LineKind,
  lineKinds: LineKind[],
): Map<number, LineKind> {
  const assigned = new Map<number, LineKind>();
  const unusedPlayers = overflow.map((_, i) => i);
  const unusedSlots = leftoverKinds.map((_, i) => i);

  while (unusedPlayers.length && unusedSlots.length) {
    let best = { cost: Infinity, pi: -1, si: -1, pIndex: -1, sIndex: -1 };
    for (const pi of unusedPlayers) {
      const pref = preferredOf(overflow[pi]);
      for (const si of unusedSlots) {
        const cost = mismatchCost(pref, leftoverKinds[si]);
        if (cost < best.cost) best = { cost, pi, si, pIndex: pi, sIndex: si };
      }
    }
    if (best.pi < 0) break;
    assigned.set(overflow[best.pi].id, leftoverKinds[best.si]);
    unusedPlayers.splice(unusedPlayers.indexOf(best.pi), 1);
    unusedSlots.splice(unusedSlots.indexOf(best.si), 1);
  }

  for (const pi of unusedPlayers) {
    const pref = preferredOf(overflow[pi]);
    let bestKind = lineKinds.find((kind) => kind !== 'gk') ?? pref;
    let bestCost = Infinity;
    for (const kind of lineKinds) {
      const cost = mismatchCost(pref, kind);
      if (cost < bestCost) {
        bestCost = cost;
        bestKind = kind;
      }
    }
    assigned.set(overflow[pi].id, bestKind);
  }
  return assigned;
}

export function layoutStartingXi(
  lineup: LineupPlayer[],
  formationStr: string | null | undefined,
): LineupLayout {
  const players = [...lineup];
  const parsed = parseFormationLines(formationStr);
  const lines = parsed ?? fallbackLines(players);
  const preferredOf = (player: LineupPlayer) => preferredLineFor(classifyPosition(player.position), lines);

  const remaining = new Map(players.map((player) => [player.id, player]));
  const placedByLine = lines.map((line) => ({ ...line, players: [] as LineupPlayer[] }));

  for (const line of placedByLine) {
    const candidates = [...remaining.values()]
      .filter((player) => preferredOf(player) === line.kind)
      .sort(byPitchOrder);
    const taken = candidates.slice(0, line.capacity);
    line.players = taken;
    for (const player of taken) remaining.delete(player.id);
  }

  const overflow = [...remaining.values()];
  const leftoverKinds: LineKind[] = [];
  for (const line of placedByLine) {
    for (let i = line.players.length; i < line.capacity; i += 1) leftoverKinds.push(line.kind);
  }

  const overflowAssign = assignOverflow(
    overflow,
    leftoverKinds,
    preferredOf,
    lines.map((line) => line.kind),
  );
  for (const player of overflow) {
    const kind = overflowAssign.get(player.id);
    const line = placedByLine.find((entry) => entry.kind === kind) ?? placedByLine[placedByLine.length - 1];
    line.players.push(player);
  }

  for (const line of placedByLine) line.players.sort(byPitchOrder);

  const positions: PlacedPlayer[] = [];
  const mismatches: PlacementMismatch[] = [];
  placedByLine.forEach((line, lineIndexValue) => {
    const y = yForLine(lineIndexValue, placedByLine.length);
    line.players.forEach((player, index) => {
      positions.push({
        player,
        x: xForIndex(index, line.players.length),
        y,
        line: line.kind,
      });
      const preferred = preferredOf(player);
      if (preferred !== line.kind) {
        mismatches.push({
          playerId: player.id,
          playerName: player.name,
          listedPosition: player.position,
          preferredLine: preferred,
          assignedLine: line.kind,
        });
      }
    });
  });

  return {
    positions,
    mismatches,
    formationLines: placedByLine.map((line) => line.kind),
  };
}

export function logLineupMismatches(
  fixture: { id?: number; home_team?: string; away_team?: string },
  team: string,
  formation: string | null | undefined,
  mismatches: PlacementMismatch[],
) {
  if (!mismatches.length) return;
  console.info('[hindsight:lineup] players placed outside listed position', {
    fixtureId: fixture.id ?? null,
    team,
    opponent: team === fixture.home_team ? fixture.away_team : fixture.home_team,
    formation: formation || null,
    count: mismatches.length,
    players: mismatches.map((entry) => ({
      name: entry.playerName,
      listedPosition: entry.listedPosition,
      preferredLine: entry.preferredLine,
      assignedLine: entry.assignedLine,
    })),
  });
}

export function formatGameweek(round: string | null | undefined): string | null {
  if (!round) return null;
  const trimmed = round.trim();
  if (!trimmed) return null;

  const labelled = trimmed.match(/^(?:matchday|spieltag|game\s*week|gameweek|gw|md|week)\s*[:.#-]?\s*(\d{1,2})$/i);
  if (labelled) return `Gameweek ${Number(labelled[1])}`;

  const trailing = trimmed.match(/^(?:matchday|spieltag|gameweek|gw|md)\s*[:.#-]?\s*(\d{1,2})\b/i)
    || trimmed.match(/(\d{1,2})(?:st|nd|rd|th)?\s*[.:#-]?\s*(?:matchday|spieltag|gameweek)\b/i);
  if (trailing) return `Gameweek ${Number(trailing[1])}`;

  if (/^\d{1,2}$/.test(trimmed)) return `Gameweek ${Number(trimmed)}`;

  return trimmed;
}
