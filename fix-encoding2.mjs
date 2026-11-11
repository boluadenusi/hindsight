import fs from 'fs';

const filePath = 'C:\\Users\\hp\\Documents\\Not Safe For Work\\hindsight\\src\\matchday.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Fix remaining encoding artifacts
const replacements = [
  ['€"', '—'],
  ['€\u009d', '"'],
  ['€\u009c', '"'],
  ['€\u0099', "'"],
  ['€\u0094', '—'],
  ['€\u0093', '–'],
  ['€\u0092', '\''],
  ['€\u0091', '\''],
  ['€\u008c', 'Œ'],
  ['€\u0084', '„'],
  ['€\u0085', '…'],
  ['€\u0086', '†'],
  ['€\u0087', '‡'],
  ['€\u0088', 'ˆ'],
  ['€\u0089', '‰'],
  ['€\u008a', 'Š'],
  ['€\u008b', '‹'],
  ['€\u008c', 'Œ'],
  ['€\u0091', '\''],
  ['€\u0092', '\''],
  ['€\u0093', '–'],
  ['€\u0094', '—'],
  ['€\u0095', '•'],
  ['€\u0096', '–'],
  ['€\u0097', '—'],
  ['€\u0098', '˜'],
  ['€\u0099', '™'],
  ['€\u009a', 'š'],
  ['€\u009b', '›'],
  ['€\u009c', 'œ'],
  ['€\u009d', '"'],
  ['€\u009e', 'ž'],
  ['€\u009f', 'Ÿ'],
];

for (const [from, to] of replacements) {
  content = content.split(from).join(to);
}

// Also fix the "?" and "−" artifacts
content = content.split('?\"').join('—');
content = content.split('^\'').join('−');
content = content.split('·').join('·');
content = content.split('â–²').join('▲');
content = content.split('â–¼').join('▼');
content = content.split('â˜…').join('★');
content = content.split('â—†').join('◆');

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done second fix');