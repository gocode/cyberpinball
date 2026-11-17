// « Cette table rame sur cette borne » : constat du médecin (Santé, fiche de la table) tiré de la cadence des
// dernières parties (vpxcadence.ts, relevé écrit après chaque partie). Le 17/11/2026, des tables reprises d'une autre
// installation ramaient sur une borne et pas sur une autre, sans que rien ne le dise : le joueur l'apprend désormais
// de Cyber Pinball, avec les chiffres ; le journal de VPX (donc chaque rapport) garde l'heure de chaque à-coup.

import { formatDateTime, formatNumber, t, tn } from './i18n';
import type { Finding } from './doctor';
import { tableCadence, type TableCadenceEntry } from './vpxcadence';

const num = (n: number) => formatNumber(n, { maximumFractionDigits: 1 });

/**
 * La dernière partie jugée de la table a ramé ou saccadé : le constat, avec ses chiffres. Une partie tenue depuis
 * efface le constat (la dernière fait foi).
 */
export function slowTableFinding(logsDir: string | undefined, tableFile: string): Finding | undefined {
  if (!logsDir) return undefined;
  const last: TableCadenceEntry | undefined = tableCadence(logsDir, tableFile)[0];
  if (!last || (!last.slow && !last.stutters)) return undefined;
  const target = last.targetFps ?? 60;
  const parts = [
    t('À la dernière partie ({date}), VPX a tenu {fps} images par seconde pour {target} visées.', { date: formatDateTime(new Date(last.at)), fps: num(last.fps), target: num(target) }),
  ];
  if (last.worst10s !== undefined && last.worst10s < last.fps) parts.push(t('Au pire moment : {worst} images par seconde.', { worst: num(last.worst10s) }));
  if (last.stalls) parts.push(tn(last.stalls, '{n} arrêt de l’image d’au moins un dixième de seconde (le plus long : {max} ms).', '{n} arrêts de l’image d’au moins un dixième de seconde (le plus long : {max} ms).', { n: last.stalls, max: last.max }));
  parts.push(t('Chaque partie est mesurée : ce constat disparaît dès qu’une partie tient la cadence.'));
  return {
    code: 'slowTable',
    severity: 'warning',
    title: last.slow ? t('La table rame sur cette borne') : t('La table saccade sur cette borne'),
    detail: parts.join(' '),
  };
}
