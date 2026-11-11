import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  classifyPosition,
  formatGameweek,
  layoutStartingXi,
  parseFormationLines,
} from './lineupLayout.ts';

function namesOnLine(layout: ReturnType<typeof layoutStartingXi>, line: string) {
  return layout.positions.filter((entry) => entry.line === line).map((entry) => entry.player.name);
}

function xi(players: Array<[number, string, string]>) {
  return players.map(([id, name, position]) => ({ id, name, position, shirtNumber: String(id) }));
}

const liverpool4231 = xi([
  [1, 'Alisson', 'Goalkeeper'],
  [2, 'Robertson', 'Left-Back'],
  [3, 'Van Dijk', 'Centre-Back'],
  [4, 'Matip', 'Centre-Back'],
  [5, 'Alexander-Arnold', 'Right-Back'],
  [6, 'Fabinho', 'Defensive Midfield'],
  [7, 'Henderson', 'Central Midfield'],
  [8, 'Thiago', 'Attacking Midfield'],
  [9, 'Diaz', 'Left Winger'],
  [10, 'Salah', 'Right Winger'],
  [11, 'Mane', 'Centre-Forward'],
]);

describe('classifyPosition', () => {
  it('maps Transfermarkt names and codes', () => {
    assert.equal(classifyPosition('Goalkeeper'), 'GK');
    assert.equal(classifyPosition('Left-Back'), 'LB');
    assert.equal(classifyPosition('Left Wing-Back'), 'LWB');
    assert.equal(classifyPosition('Attacking Midfield'), 'AM');
    assert.equal(classifyPosition('CAM'), 'AM');
    assert.equal(classifyPosition('Second Striker'), 'SS');
  });
});

describe('parseFormationLines', () => {
  it('reads lines from back to front', () => {
    assert.deepEqual(parseFormationLines('4-2-3-1'), [
      { kind: 'gk', capacity: 1 },
      { kind: 'def', capacity: 4 },
      { kind: 'dm', capacity: 2 },
      { kind: 'am', capacity: 3 },
      { kind: 'fwd', capacity: 1 },
    ]);
    assert.deepEqual(parseFormationLines('4-4-2 diamond'), [
      { kind: 'gk', capacity: 1 },
      { kind: 'def', capacity: 4 },
      { kind: 'mid', capacity: 4 },
      { kind: 'fwd', capacity: 2 },
    ]);
  });
});

describe('layoutStartingXi', () => {
  it('places a 4-2-3-1 without putting CAM on the striker line', () => {
    const layout = layoutStartingXi(liverpool4231, '4-2-3-1');
    assert.deepEqual(namesOnLine(layout, 'gk'), ['Alisson']);
    assert.deepEqual(namesOnLine(layout, 'def'), ['Robertson', 'Matip', 'Van Dijk', 'Alexander-Arnold']);
    assert.deepEqual(namesOnLine(layout, 'dm'), ['Fabinho', 'Henderson']);
    assert.deepEqual(namesOnLine(layout, 'am'), ['Diaz', 'Thiago', 'Salah']);
    assert.deepEqual(namesOnLine(layout, 'fwd'), ['Mane']);
    assert.equal(layout.mismatches.length, 0);
  });

  it('puts two strikers on the forward line in 4-4-2 and wingers in midfield', () => {
    const squad = xi([
      [1, 'GK', 'Goalkeeper'],
      [2, 'LB', 'Left-Back'],
      [3, 'LCB', 'Centre-Back'],
      [4, 'RCB', 'Centre-Back'],
      [5, 'RB', 'Right-Back'],
      [6, 'LM', 'Left Winger'],
      [7, 'LCM', 'Central Midfield'],
      [8, 'RCM', 'Central Midfield'],
      [9, 'RM', 'Right Winger'],
      [10, 'ST1', 'Centre-Forward'],
      [11, 'ST2', 'Centre-Forward'],
    ]);
    const layout = layoutStartingXi(squad, '4-4-2');
    assert.equal(namesOnLine(layout, 'def').length, 4);
    assert.deepEqual(namesOnLine(layout, 'mid'), ['LM', 'LCM', 'RCM', 'RM']);
    assert.deepEqual(namesOnLine(layout, 'fwd'), ['ST1', 'ST2']);
  });

  it('puts wingers in the front three of a 4-3-3', () => {
    const squad = xi([
      [1, 'GK', 'Goalkeeper'],
      [2, 'LB', 'Left-Back'],
      [3, 'LCB', 'Centre-Back'],
      [4, 'RCB', 'Centre-Back'],
      [5, 'RB', 'Right-Back'],
      [6, 'DM', 'Defensive Midfield'],
      [7, 'LCM', 'Central Midfield'],
      [8, 'RCM', 'Central Midfield'],
      [9, 'LW', 'Left Winger'],
      [10, 'ST', 'Centre-Forward'],
      [11, 'RW', 'Right Winger'],
    ]);
    const layout = layoutStartingXi(squad, '4-3-3 Attacking');
    assert.deepEqual(namesOnLine(layout, 'fwd'), ['LW', 'ST', 'RW']);
    assert.equal(namesOnLine(layout, 'mid').length, 3);
  });

  it('puts wing-backs inside the five of a 3-5-2', () => {
    const squad = xi([
      [1, 'GK', 'Goalkeeper'],
      [2, 'LCB', 'Centre-Back'],
      [3, 'CB', 'Centre-Back'],
      [4, 'RCB', 'Centre-Back'],
      [5, 'LWB', 'Left Wing-Back'],
      [6, 'RWB', 'Right Wing-Back'],
      [7, 'LCM', 'Central Midfield'],
      [8, 'CM', 'Central Midfield'],
      [9, 'RCM', 'Central Midfield'],
      [10, 'ST1', 'Centre-Forward'],
      [11, 'ST2', 'Striker'],
    ]);
    const layout = layoutStartingXi(squad, '3-5-2');
    assert.equal(namesOnLine(layout, 'def').length, 3);
    assert.deepEqual(namesOnLine(layout, 'mid'), ['LWB', 'CM', 'LCM', 'RCM', 'RWB']);
    assert.equal(namesOnLine(layout, 'fwd').length, 2);
  });

  it('keeps 4-2-3-1 shape when two strikers are listed', () => {
    const squad = xi([
      [1, 'GK', 'Goalkeeper'],
      [2, 'LB', 'Left-Back'],
      [3, 'LCB', 'Centre-Back'],
      [4, 'RCB', 'Centre-Back'],
      [5, 'RB', 'Right-Back'],
      [6, 'DM1', 'Defensive Midfield'],
      [7, 'DM2', 'Defensive Midfield'],
      [8, 'LW', 'Left Winger'],
      [9, 'RW', 'Right Winger'],
      [10, 'ST1', 'Centre-Forward'],
      [11, 'ST2', 'Centre-Forward'],
    ]);
    const layout = layoutStartingXi(squad, '4-2-3-1');
    assert.equal(namesOnLine(layout, 'fwd').length, 1);
    assert.equal(namesOnLine(layout, 'am').length, 3);
    assert.equal(layout.mismatches.length, 1);
    assert.equal(layout.mismatches[0].preferredLine, 'fwd');
    assert.equal(layout.mismatches[0].assignedLine, 'am');
  });

  it('ignores database row order', () => {
    const reversed = [...liverpool4231].reverse();
    const a = layoutStartingXi(liverpool4231, '4-2-3-1');
    const b = layoutStartingXi(reversed, '4-2-3-1');
    assert.deepEqual(
      a.positions.map((entry) => [entry.player.name, entry.x, entry.y, entry.line]),
      b.positions.map((entry) => [entry.player.name, entry.x, entry.y, entry.line]),
    );
  });

  it('groups by GK/defence/midfield/attack when formation is missing', () => {
    const layout = layoutStartingXi(liverpool4231, null);
    assert.deepEqual(layout.formationLines, ['gk', 'def', 'mid', 'fwd']);
    assert.equal(namesOnLine(layout, 'gk').length, 1);
    assert.equal(namesOnLine(layout, 'def').length, 4);
    assert.ok(namesOnLine(layout, 'fwd').includes('Mane'));
    assert.ok(namesOnLine(layout, 'fwd').includes('Diaz'));
  });
});

describe('formatGameweek', () => {
  it('promotes numeric and matchday rounds', () => {
    assert.equal(formatGameweek('38'), 'Gameweek 38');
    assert.equal(formatGameweek('Matchday 12'), 'Gameweek 12');
    assert.equal(formatGameweek('12. Matchday'), 'Gameweek 12');
    assert.equal(formatGameweek('Round of 16'), 'Round of 16');
    assert.equal(formatGameweek(null), null);
  });
});
