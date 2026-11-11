import fs from 'fs';

const filePath = 'C:\\Users\\hp\\Documents\\Not Safe For Work\\hindsight\\src\\styles.css';
let content = fs.readFileSync(filePath, 'utf8');

const oldStyles = `.score-prediction{border-bottom:1px solid #d6cebc;padding-bottom:20px}.score-inputs{display:flex;align-items:center;gap:14px}.score-inputs label{display:grid;grid-template-columns:auto 56px;align-items:center;gap:8px;font-size:11px;color:#5d685d}.score-inputs input{width:56px;height:46px;background:var(--paper);border:1px solid #cfc6b4;border-radius:2px;text-align:center;color:var(--ink);font:600 20px 'DM Mono',monospace;appearance:textfield}.score-inputs input::-webkit-inner-spin-button,.score-inputs input::-webkit-outer-spin-button{appearance:none;margin:0}`;

const newStyles = `.score-prediction{border-bottom:1px solid #d6cebc;padding-bottom:20px}.score-picker{display:flex;align-items:center;gap:18px;flex-wrap:wrap}.score-team{display:flex;align-items:center;gap:10px}.score-team-name{font-size:12px;color:#5d685d;min-width:80px;text-align:right}.score-input-group{display:flex;align-items:center;gap:6px}.score-adjust{width:36px;height:36px;flex:none;border:1px solid #cfc6b4;background:var(--paper);color:var(--ink);border-radius:2px;font:600 16px/1 'DM Mono',monospace;cursor:pointer;transition:background-color .15s ease,border-color .15s ease,transform .12s ease}.score-adjust:hover{background:#f8f5eb;border-color:#b8af9b}.score-adjust:active{transform:scale(.96)}.score-adjust:disabled{opacity:.35;cursor:default}.score-value{min-width:28px;text-align:center;font:600 28px/1 'DM Mono',monospace;color:var(--ink);font-variant-numeric:tabular-nums}.score-separator{font:18px 'Playfair Display',Georgia,serif;color:var(--red)}`;

if (content.includes(oldStyles)) {
  content = content.replace(oldStyles, newStyles);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Done');
} else {
  console.log('Old styles not found - checking...');
  // Find what's actually there
  const idx = content.indexOf('.score-prediction{border-bottom:1px solid #d6cebc;padding-bottom:20px}');
  if (idx >= 0) {
    console.log('Found at index', idx);
    console.log(content.substring(idx, idx + 500));
  } else {
    console.log('Not found at all');
  }
}