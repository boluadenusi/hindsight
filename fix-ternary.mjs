import fs from 'fs';

const filePath = 'C:\\Users\\hp\\Documents\\Not Safe For Work\\hindsight\\src\\matchday.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Fix the extra quote in the ternary
content = content.replace("{loadingNext ? 'Opening the next programme…' : 'Another one →''}", "{loadingNext ? 'Opening the next programme…' : 'Another one →'}");

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done ternary fix');