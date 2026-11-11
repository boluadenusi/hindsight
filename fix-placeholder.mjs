import fs from 'fs';

const filePath = 'C:\\Users\\hp\\Documents\\Not Safe For Work\\hindsight\\src\\matchday.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Fix the placeholder attribute - use single quotes for the attribute value
content = content.replace(/placeholder="—""/g, "placeholder='—'");
content = content.replace(/placeholder="—""/g, "placeholder='—'");

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done placeholder fix');