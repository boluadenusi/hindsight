import fs from 'fs';

const cssPath = 'C:\\Users\\hp\\Documents\\Not Safe For Work\\hindsight\\src\\HowToPlay.css';
const css = fs.readFileSync(cssPath, 'utf8');

const startMarker = '/* Hover/target highlight activation */';
const endMarker = '/* ==========================================================================';

const startIdx = css.indexOf(startMarker);
const endIdx = css.indexOf(endMarker, css.indexOf(startMarker));

if (startIdx === -1 || endIdx === -1) {
  console.log('Markers not found');
  process.exit(1);
}

console.log('Removing from', startIdx, 'to', endIdx);
const newCss = css.slice(0, startIdx) + css.slice(endIdx);
fs.writeFileSync(cssPath, newCss, 'utf8');
console.log('Done');