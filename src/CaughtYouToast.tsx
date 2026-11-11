import { useEffect, useState } from 'react';
import { TOAST_DURATION_SECONDS } from './caughtYou';

// A single small toast that slips in at the bottom of the screen. It is
// programme-style: a cream card, rust-red handwritten text, a light tilt. It
// never blocks the page — the tap target is only the card itself — and it
// fades out on a timer or when tapped.
export function CaughtYouToast({
  message,
  onDismiss,
}: {
  message: string | null;
  onDismiss: () => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!message) {
      setVisible(false);
      return;
    }
    // Entrance on the next frame so the fade-in transition actually fires.
    const enter = window.requestAnimationFrame(() => setVisible(true));
    const timer = window.setTimeout(() => onDismiss(), TOAST_DURATION_SECONDS * 1000);
    return () => {
      window.cancelAnimationFrame(enter);
      window.clearTimeout(timer);
    };
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <div
      className="caught-you-toast-shell"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <button
        type="button"
        className={`caught-you-toast${visible ? ' is-visible' : ''}`}
        onClick={onDismiss}
        aria-label={`Dismiss: ${message}`}
      >
        <span className="caught-you-mark" aria-hidden="true">!</span>
        <span className="caught-you-text">{message}</span>
      </button>
    </div>
  );
}