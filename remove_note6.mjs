import fs from 'fs';

const cssPath = 'C:\\Users\\hp\\Documents\\Not Safe For Work\\hindsight\\src\\HowToPlay.css';
const css = fs.readFileSync(cssPath, 'utf8');

const startMarker = '/* Note 6: Track your career -> Ticket stub (bottom, center) */';
const endMarker = '}/* Mobile: notes stacked above each part, no arrows */';

const startIdx = css.indexOf(startMarker);
const endIdx = css.indexOf(endMarker);

if (startIdx === -1 || endIdx === -1) {
  console.log('Markers not found');
  process.exit(1);
}

console.log('Removing from', startIdx, 'to', endIdx);
const newCss = css.slice(0, startIdx) + css.slice(endIdx);
fs.writeFileSync(cssPath, newCss, 'utf8');
console.log('Done');