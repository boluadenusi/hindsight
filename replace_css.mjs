import fs from 'fs';

const cssPath = 'C:\\Users\\hp\\Documents\\Not Safe For Work\\hindsight\\src\\HowToPlay.css';
const newSectionPath = 'C:\\Users\\hp\\Documents\\Not Safe For Work\\hindsight\\new_arrows_section.css';

const css = fs.readFileSync(cssPath, 'utf8');
const newSection = fs.readFileSync(newSectionPath, 'utf8');

const startMarker = '/* Hand-drawn arrows */';
const endMarker = '/* Mobile: notes stacked above each part, no arrows */';

const startIdx = css.indexOf(startMarker);
const endIdx = css.indexOf(endMarker);

if (startIdx === -1 || endIdx === -1) {
  console.log('Markers not found');
  console.log('startIdx:', startIdx);
  console.log('endIdx:', endIdx);
  process.exit(1);
}

console.log('Found markers at', startIdx, 'to', endIdx);

const newCss = css.slice(0, startIdx) + newSection + css.slice(endIdx);
fs.writeFileSync(cssPath, newCss, 'utf8');
console.log('Done');