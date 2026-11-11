import fs from 'fs';

const filePath = 'C:\\Users\\hp\\Documents\\Not Safe For Work\\hindsight\\src\\matchday.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Fix the arrow character
content = content.replace('→ Turnstiles', '← Turnstiles');

// Replace the masthead-left div content
const oldBlock = `        {onHome && (
          <button type="button" className="masthead-home-button" onClick={onHome} title="Return to turnstiles landing page">
            ← Turnstiles
          </button>
        )}
      </div>`;

const newBlock = `        <nav className="masthead-nav" aria-label="Matchday navigation">
          <a href="/how-to-play" className="masthead-nav-link">How to Play</a>
          {onHome && (
            <button type="button" className="masthead-home-button" onClick={onHome} title="Return to turnstiles landing page">
              ← Turnstiles
            </button>
          )}
        </nav>
      </div>`;

content = content.replace(oldBlock, newBlock);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done');