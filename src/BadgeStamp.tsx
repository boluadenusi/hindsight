import { getBadge, type BadgeId } from './badges';

// A single rubber stamp. Earned stamps are fully inked; unearned ones are faded.
export function BadgeStamp({ id, earned }: { id: BadgeId; earned: boolean }) {
  const badge = getBadge(id);
  if (!badge) return null;

  return (
    <article
      className={`stamp${earned ? ' is-earned' : ' is-locked'}`}
      aria-label={`${badge.name}. ${badge.rule}${earned ? ' Earned.' : ' Not yet earned.'}`}
    >
      <span className="stamp-name">{badge.name}</span>
      <span className="stamp-rule">{badge.rule}</span>
    </article>
  );
}
