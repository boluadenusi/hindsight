import fs from 'fs';

const filePath = 'C:\\Users\\hp\\Documents\\Not Safe For Work\\hindsight\\src\\styles.css';
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(
  '.steps-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}\n@media(max-width:700px){.steps-grid{grid-template-columns:1fr}}',
  '.steps-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}\n@media(max-width:900px){.steps-grid{grid-template-columns:repeat(2,1fr)}}\n@media(max-width:600px){.steps-grid{grid-template-columns:1fr}}'
);

content = content.replace(
  '.extended-grid,.hints-grid,.powerups-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:10px}\n@media(max-width:700px){.extended-grid,.hints-grid,.powerups-grid{grid-template-columns:1fr}}',
  '.extended-grid,.hints-grid,.powerups-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:10px}\n@media(max-width:900px){.extended-grid,.hints-grid,.powerups-grid{grid-template-columns:repeat(2,1fr)}}\n@media(max-width:600px){.extended-grid,.hints-grid,.powerups-grid{grid-template-columns:1fr}}'
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done');