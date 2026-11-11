import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Matchday } from './matchday';
import { LandingPage } from './landing';
import { HowToPlay } from './HowToPlay';
import { HISTORY_KEY, migrateStoredHistory } from './memoryScore';
import { syncEarnedBadges } from './badges';
import './styles.css';

// Re-score saved history under the current rules once per browser. The old
// archive kept the calls and the revealed result, so completed matches can be
// rebuilt. Legacy inventory is cleared at the same time.
const migration = migrateStoredHistory();
if (migration.reset) {
  console.warn('[Hindsight] Saved history could not be re-scored under the memory-score rules. Career stats were reset.');
}
try {
  const savedHistory = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  syncEarnedBadges(savedHistory);
} catch {
  /* Badges are re-inked from history when storage is available. */
}

export function App() {
  const [route, setRoute] = useState<'landing' | 'play' | 'how-to-play'>(() => {
    const path = window.location.pathname;
    const hash = window.location.hash;
    if (path.startsWith('/play') || hash === '#play') return 'play';
    if (path.startsWith('/how-to-play') || hash === '#how-to-play') return 'how-to-play';
    return 'landing';
  });

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      const hash = window.location.hash;
      if (path.startsWith('/play') || hash === '#play') setRoute('play');
      else if (path.startsWith('/how-to-play') || hash === '#how-to-play') setRoute('how-to-play');
      else setRoute('landing');
    };
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handlePopState);
    };
  }, []);

  const navigateTo = (nextRoute: 'landing' | 'play' | 'how-to-play') => {
    setRoute(nextRoute);
    if (nextRoute === 'play') {
      window.history.pushState({}, '', '/play');
    } else if (nextRoute === 'how-to-play') {
      window.history.pushState({}, '', '/how-to-play');
    } else {
      window.history.pushState({}, '', '/');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const page = route === 'play'
    ? <Matchday onHome={() => navigateTo('landing')} />
    : route === 'how-to-play'
      ? <HowToPlay onHome={() => navigateTo('landing')} />
      : <LandingPage onPlay={() => navigateTo('play')} />;

  return <>
    {migration.reset && (
      <div className="migration-notice" role="status">
        Some saved match results were unavailable, so your career Memory Score has been reset. Your locked calls are still saved.
      </div>
    )}
    {page}
  </>;
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
