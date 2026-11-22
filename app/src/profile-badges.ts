// Le catalogue complet dans le profil : récompenses et objectifs ; compteurs privés pour moi seul.
import { BADGES, RARITY_XP, badgeEarned, rarityLabel, locale, t, type BadgeDefinition, type BadgeFacts } from '@cyberpinball/core';
import type { HubCardSpec, HubSectionSpec } from './hub-screen';

const fmt = (n: number) => n.toLocaleString(locale());

export function profileBadgeSections(held: readonly string[], facts?: BadgeFacts): HubSectionSpec[] {
  const owned = new Set(held);
  const card = (b: BadgeDefinition): HubCardSpec => {
    const earned = owned.has(b.id);
    const secret = !earned && b.secret && (!facts || !badgeEarned(b, facts));
    const value = facts ? Math.max(0, Math.min(b.target, Math.floor(b.measure(facts)))) : undefined;
    const unit = b.id === 'hour-on-table' || b.id === 'marathon' ? ' min' : b.family === 'time' ? ' h' : '';
    const progress = earned || secret ? undefined : value === undefined ? t('Progression non partagée') : t('{value} / {target} · reste {remaining}', { value: `${fmt(value)}${unit}`, target: `${fmt(b.target)}${unit}`, remaining: `${fmt(b.target - value)}${unit}` });
    return {
      key: `badge:${b.id}`, title: secret ? t('Badge secret') : b.label,
      eyebrow: rarityLabel(b.rarity),
      medal: { icon: secret ? 'lock' : b.icon, rarity: b.rarity, earned },
      detail: [secret ? b.hint : b.detail, progress].filter(Boolean).join(' · '),
      aside: t('+{n} XP', { n: fmt(RARITY_XP[b.rarity]) }),
      ...(!earned && !secret && value !== undefined ? { progress: value / b.target } : {}),
    };
  };
  const missing = BADGES.filter((b) => !owned.has(b.id));
  // Les objectifs les plus proches en tête, sans révéler les secrets.
  if (facts) missing.sort((a, b) => (b.secret ? -1 : b.measure(facts) / b.target) - (a.secret ? -1 : a.measure(facts) / a.target));
  const earned = BADGES.filter((b) => owned.has(b.id));
  return [
    { title: t('À obtenir'), note: `${missing.length}`, layout: 'list', column: 'left', cards: missing.map(card) },
    { title: t('Obtenus'), note: `${earned.length}`, layout: 'list', column: 'right', cards: earned.map(card) },
  ].filter((s) => s.cards.length) as HubSectionSpec[];
}
