// Sélecteur sur la borne, commun aux deux jeux Steam de Zen.

import { isPinballFxMidnightId, t, zenTableOfEntry, type PinballFxGameMode, type TableEntry } from '@cyberpinball/core';
import type { Action, Built } from './library-types';

export function openPinballFxModes(
  table: TableEntry,
  launch: (mode: PinballFxGameMode) => void,
  open: (build: () => Built) => void,
  openSheet: (table: TableEntry) => void,
): boolean {
  const midnight = table.emulator === 'pinballfxmidnight' && isPinballFxMidnightId(table.pinballFxMidnightTable);
  const standard = table.emulator === 'pinballfx' && typeof table.pinballFxTable === 'number' &&
    Number.isInteger(table.pinballFxTable) && table.pinballFxTable > 0;
  if (!midnight && !standard) return false;
  const pro = standard && ['Williams', 'Bally'].includes(zenTableOfEntry(table)?.manufacturer ?? '');
  const back = () => openSheet(table);
  const playMode = (mode: PinballFxGameMode, label: string): Action => ({
    label,
    key: mode,
    door: 'sheet.play',
    run: () => launch(mode),
  });
  const more = () => open(advanced);
  const base = () => open(players);
  const players = (): Built => ({
    heading: t('Mode de jeu'),
    subheading: table.title,
    sections: [],
    actions: [
      playMode('Classic', t('1 joueur')),
      playMode('Hotseat_2', t('{count} joueurs', { count: 2 })),
      playMode('Hotseat_3', t('{count} joueurs', { count: 3 })),
      playMode('Hotseat_4', t('{count} joueurs', { count: 4 })),
      ...(standard ? [{ label: t('Autres modes'), door: 'sheet.play' as const, run: more }] : []),
      { label: t('Retour à la fiche'), door: 'sheet.back', run: back },
    ],
    back,
  });
  const advanced = (): Built => ({
    heading: t('Autres modes'),
    subheading: table.title,
    sections: [],
    actions: [
      playMode('Practice', t('Entraînement')),
      ...(pro ? [playMode('Pro', 'Pro')] : []),
      playMode('Challenge_BallLimited', t('Défi · Billes limitées')),
      playMode('Challenge_TimeLimited', t('Défi · Temps limité')),
      playMode('Challenge_DistanceLimited', t('Défi · Distance limitée')),
      playMode('Challenge_FlipLimited', t('Défi · Coups de flipper limités')),
      { label: t('Retour au choix des joueurs'), door: 'sheet.back', run: base },
    ],
    back: base,
  });
  base();
  return true;
}
