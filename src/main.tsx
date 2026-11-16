import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Matchday } from './matchday';
import { LandingPage } from './landing';
import { HowToPlay } from './HowToPlay';
import { RecordBook } from './RecordBook';
import { HISTORY_KEY, migrateStoredHistory } from './memoryScore';
import { syncEarnedBadges } from './badges';
import { getStatsVisitorId } from './stats';
import { readDrawPreference, saveDrawPreference, type DrawPreference } from './drawPreference';
import './styles.css';

getStatsVisitorId();
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
  const [drawPreference, setDrawPreference] = useState<DrawPreference>(() => readDrawPreference(localStorage));
  const [preferenceError, setPreferenceError] = useState('');
  const [startFresh, setStartFresh] = useState(false);
  const [route, setRoute] = useState<'landing' | 'play' | 'how-to-play' | 'record-book'>(() => {
    const path = window.location.pathname;
    const hash = window.location.hash;
    if (path.startsWith('/play') || hash === '#play') return 'play';
    if (path.startsWith('/how-to-play') || hash === '#how-to-play') return 'how-to-play';
    if (path.startsWith('/record-book') || hash === '#record-book') return 'record-book';
    return 'landing';
  });

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      const hash = window.location.hash;
      if (path.startsWith('/play') || hash === '#play') setRoute('play');
      else if (path.startsWith('/how-to-play') || hash === '#how-to-play') setRoute('how-to-play');
      else if (path.startsWith('/record-book') || hash === '#record-book') setRoute('record-book');
      else {
        setStartFresh(false);
        setRoute('landing');
      }
    };
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handlePopState);
    };
  }, []);

  const navigateTo = (nextRoute: 'landing' | 'play' | 'how-to-play' | 'record-book') => {
    if (nextRoute !== 'play') setStartFresh(false);
    setRoute(nextRoute);
    if (nextRoute === 'play') {
      window.history.pushState({}, '', '/play');
    } else if (nextRoute === 'how-to-play') {
      window.history.pushState({}, '', '/how-to-play');
    } else if (nextRoute === 'record-book') {
      window.history.pushState({}, '', '/record-book');
    } else {
      window.history.pushState({}, '', '/');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const updateDrawPreference = (preference: DrawPreference) => {
    setDrawPreference(preference);
    try {
      saveDrawPreference(localStorage, preference);
      setPreferenceError('');
    } catch {
      setPreferenceError('Your draw preference could not be saved for your next visit.');
    }
  };

  const startPlay = (fresh: boolean) => {
    setStartFresh(fresh);
    navigateTo('play');
  };

  const page = route === 'play'
    ? <Matchday onHome={() => navigateTo('landing')} drawPreference={drawPreference} startFresh={startFresh} />
    : route === 'how-to-play'
      ? <HowToPlay onHome={() => navigateTo('landing')} />
      : route === 'record-book'
        ? <RecordBook />
      : <LandingPage onPlay={() => startPlay(false)} onDrawNew={() => startPlay(true)} drawPreference={drawPreference} onDrawPreferenceChange={updateDrawPreference} preferenceError={preferenceError} />;

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
