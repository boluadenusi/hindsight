import fs from 'fs';

const filePath = 'C:\\Users\\hp\\Documents\\Not Safe For Work\\hindsight\\src\\matchday.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Fix unescaped single quotes in strings
content = content.replace(/setFormError\('Enter both teams' goals, or leave both blank to skip the scoreline\.'\);/g, "setFormError(\"Enter both teams' goals, or leave both blank to skip the scoreline.\");");
content = content.replace(/setFormError\('Goals must be whole numbers from zero upwards\.'\);/g, "setFormError('Goals must be whole numbers from zero upwards.');");
content = content.replace(/setFormError\('Your browser could not save this lock\. Check available storage and try again\.'\);/g, "setFormError('Your browser could not save this lock. Check available storage and try again.');");
content = content.replace(/setError\('Browser storage is unavailable\. Enable local storage to save your match history\.'\);/g, "setError('Browser storage is unavailable. Enable local storage to save your match history.');");
content = content.replace(/setRevealError\(cause instanceof Error \? cause\.message : 'Could not reveal this match\.'\);/g, "setRevealError(cause instanceof Error ? cause.message : 'Could not reveal this match.');");
content = content.replace(/setError\(cause\.message\);/g, "setError(cause.message);");
content = content.replace(/setNextError\(cause instanceof Error \? cause\.message : 'Could not load next fixture\.'\);/g, "setNextError(cause instanceof Error ? cause.message : 'Could not load next fixture.');");
content = content.replace(/setNextError\(cause instanceof Error \? cause\.message : 'Could not load the next fixture\.'\);/g, "setNextError(cause instanceof Error ? cause.message : 'Could not load next fixture.');");
content = content.replace(/setError\(payload\.message \|\| 'Could not load a fixture\.'\);/g, "setError(payload.message || 'Could not load a fixture.');");
content = content.replace(/setRevealError\(payload\.message \|\| 'Could not reveal this match\.'\);/g, "setRevealError(payload.message || 'Could not reveal this match.');");
content = content.replace(/setNextError\(payload\.message \|\| 'Could not load the next fixture\.'\);/g, "setNextError(payload.message || 'Could not load next fixture.');");
content = content.replace(/setError\('Could not load a fixture\.'\);/g, "setError('Could not load a fixture.');");
content = content.replace(/setRevealError\('Could not reveal this match\.'\);/g, "setRevealError('Could not reveal this match.');");
content = content.replace(/setNextError\('Could not load next fixture\.'\);/g, "setNextError('Could not load next fixture.');");
content = content.replace(/setFormError\('Enter both teams' goals, or leave both blank to skip the scoreline\.'\);/g, "setFormError(\"Enter both teams' goals, or leave both blank to skip the scoreline.\");");

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done string fixes');