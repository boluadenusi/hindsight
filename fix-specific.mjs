import fs from 'fs';

const filePath = 'C:\\Users\\hp\\Documents\\Not Safe For Work\\hindsight\\src\\matchday.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Fix specific remaining artifacts
content = content.split('\u2014\u201d').join('\u2014'); // —”
content = content.split('\u2014').join('\u2014'); // — (ensure it's clean)
content = content.split('\u2013').join('\u2013'); // –
content = content.split('\u2018').join("'"); // '
content = content.split('\u2019').join("'"); // '
content = content.split('\u201c').join('"'); // "
content = content.split('\u201d').join('"'); // "

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done specific fixes');