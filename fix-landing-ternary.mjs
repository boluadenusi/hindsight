import fs from 'fs';

const filePath = 'C:\\Users\\hp\\Documents\\Not Safe For Work\\hindsight\\src\\landing.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Fix the extra quotes in the ternary
content = content.replace("{isReturningPlayer ? 'Resume Season →'' : 'Kick Off →''}", "{isReturningPlayer ? 'Resume Season →' : 'Kick Off →'}");

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done landing.tsx ternary fix');