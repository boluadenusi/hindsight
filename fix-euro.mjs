import fs from 'fs';

const filePath = 'C:\\Users\\hp\\Documents\\Not Safe For Work\\hindsight\\src\\matchday.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Fix all remaining € characters (they're mangled em dashes)
content = content.split('€"').join('—');
content = content.split('€\u009d').join('"');
content = content.split('€\u009c').join('"');
content = content.split('€\u0099').join("'");
content = content.split('€\u0094').join('—');
content = content.split('€\u0093').join('–');
content = content.split('€\u0092').join("'");
content = content.split('€\u0091').join("'");
content = content.split('€\u008c').join('Œ');
content = content.split('€\u0084').join('„');
content = content.split('€\u0085').join('…');
content = content.split('€\u0086').join('†');
content = content.split('€\u0087').join('‡');
content = content.split('€\u0088').join('ˆ');
content = content.split('€\u0089').join('‰');
content = content.split('€\u008a').join('Š');
content = content.split('€\u008b').join('‹');
content = content.split('€\u008c').join('Œ');
content = content.split('€\u0091').join("'");
content = content.split('€\u0092').join("'");
content = content.split('€\u0093').join('–');
content = content.split('€\u0094').join('—');
content = content.split('€\u0095').join('•');
content = content.split('€\u0096').join('–');
content = content.split('€\u0097').join('—');
content = content.split('€\u0098').join('˜');
content = content.split('€\u0099').join('™');
content = content.split('€\u009a').join('š');
content = content.split('€\u009b').join('›');
content = content.split('€\u009c').join('œ');
content = content.split('€\u009d').join('"');
content = content.split('€\u009e').join('ž');
content = content.split('€\u009f').join('Ÿ');

// Fix any standalone € that appear to be em dashes
content = content.split('€').join('—');

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done euro fix');