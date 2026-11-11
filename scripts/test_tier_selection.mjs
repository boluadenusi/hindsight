import { readFileSync } from 'node:fs';
import path from 'node:path';

const config = JSON.parse(readFileSync('config/fixtures.json', 'utf8'));
const { tierPercentages } = config;

// Simulate 10,000 draws
const counts = { A: 0, B: 0, C: 0 };
const totalPct = tierPercentages.A + tierPercentages.B + tierPercentages.C;

function pickTier() {
  const r = Math.random() * totalPct;
  if (r < tierPercentages.A) return 'A';
  if (r < tierPercentages.A + tierPercentages.B) return 'B';
  return 'C';
}

for (let i = 0; i < 10000; i++) {
  counts[pickTier()]++;
}

console.log('Simulated 10,000 draws:');
console.log(`Tier A: ${(counts.A / 100).toFixed(1)}% (target: ${tierPercentages.A}%)`);
console.log(`Tier B: ${(counts.B / 100).toFixed(1)}% (target: ${tierPercentages.B}%)`);
console.log(`Tier C: ${(counts.C / 100).toFixed(1)}% (target: ${tierPercentages.C}%)`);
