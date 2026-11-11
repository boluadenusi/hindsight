import fs from 'fs';

const filePath = 'C:\\Users\\hp\\Documents\\Not Safe For Work\\hindsight\\src\\matchday.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Replace the seal button
content = content.replace(
  '<button className="lock-button" type="button" onClick={lockPredictions} disabled={saving}>{saving ? \'Saving…\' : \'Seal my predictions\'}</button>',
  '<button className={`lock-button${saving ? \' loading\' : \'\'}`} type="button" onClick={lockPredictions} aria-busy={saving} aria-disabled={saving}>\n          <span className="btn-label">Seal my predictions</span>\n          <span className="btn-spinner" aria-hidden="true"></span>\n        </button>'
);

// Replace disabled with aria-busy on reveal button
content = content.replace(
  'disabled={revealing}',
  'aria-busy={revealing} aria-disabled={revealing}'
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done');