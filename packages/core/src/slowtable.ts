// « Cette table rame sur cette borne » : constat du médecin (Santé, fiche de la table) tiré de la cadence des
// dernières parties (vpxcadence.ts, relevé écrit après chaque partie). Le 17/11/2026, des tables reprises d'une autre
// installation ramaient sur une borne et pas sur une autre, sans que rien ne le dise : le joueur l'apprend désormais
// de Cyber Pinball, avec les chiffres ; le journal de VPX (donc chaque rapport) garde l'heure de chaque à-coup.

import { formatDateTime, formatList, formatNumber, t, tn } from './i18n';
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
  if (!last) return undefined;
  // Calée sur un écran annexe plus lent (vpxcadence.ts, readScreenCap) : c'est l'écran qui bride, pas la table.
  if (last.cap) return screenCapFinding(last, last.cap);
  if (!last.slow && !last.stutters) return undefined;
  const target = last.targetFps ?? 60;
  const parts = [
    t('À la dernière partie ({date}), VPX a tenu {fps} images par seconde pour {target} visées.', { date: formatDateTime(new Date(last.at)), fps: num(last.fps), target: num(target) }),
  ];
  if (last.worst10s !== undefined && last.worst10s < last.fps) parts.push(t('Au pire moment : {worst} images par seconde.', { worst: num(last.worst10s) }));
  if (last.stalls) parts.push(tn(last.stalls, '{n} arrêt de l’image d’au moins un dixième de seconde (le plus long : {max} ms).', '{n} arrêts de l’image d’au moins un dixième de seconde (le plus long : {max} ms).', { n: last.stalls, max: last.max }));
  // Autres programmes de borne ouverts pendant cette partie (coexistence.ts, programsDuringGame) : une cause à écarter d'abord.
  if (last.others?.length)
    parts.push(
      tn(last.others.length, '{names} était ouvert pendant la partie : il peut prendre le processeur, le disque ou le DMD réel par moments. Fermez-le, ou retirez-le du démarrage de Windows.', '{names} étaient ouverts pendant la partie : ils peuvent prendre le processeur, le disque ou le DMD réel par moments. Fermez-les, ou retirez-les du démarrage de Windows.', { names: formatList(last.others) }),
    );
  parts.push(t('Chaque partie est mesurée : ce constat disparaît dès qu’une partie tient la cadence.'));
  return {
    code: 'slowTable',
    severity: 'warning',
    title: last.slow ? t('La table rame sur cette borne') : t('La table saccade sur cette borne'),
    detail: parts.join(' '),
  };
}

/**
 * La dernière partie s'est calée sur la fréquence d'un écran annexe (backglass, ScoreView, topper) : VPX 10.8.1 présente
 * toutes ses fenêtres ensemble, le playfield attend l'écran le plus lent. Le remède est la fréquence de cet écran.
 */
function screenCapFinding(last: TableCadenceEntry, cap: NonNullable<TableCadenceEntry['cap']>): Finding {
  const parts = [
    t('À la dernière partie ({date}), VPX a tenu {fps} images par seconde pour {target} visées.', { date: formatDateTime(new Date(last.at)), fps: num(last.fps), target: num(last.targetFps ?? 60) }),
    t('La table n’y est pour rien : VPX dessine aussi sur l’écran « {screen} », réglé à {hz} Hz, et sa version 10.8.1 cale toute la partie sur l’écran le plus lent, playfield compris.', { screen: cap.display, hz: num(cap.hz) }),
    t('Choisissez la fréquence la plus haute de cet écran dans les paramètres d’affichage de Windows (Affichage avancé). Une version à venir de VPX supprime ce bridage.'),
  ];
  if (last.stutters) parts.push(tn(last.stalls, '{n} arrêt de l’image d’au moins un dixième de seconde (le plus long : {max} ms).', '{n} arrêts de l’image d’au moins un dixième de seconde (le plus long : {max} ms).', { n: last.stalls, max: last.max }));
  return {
    code: 'screenCap',
    severity: 'warning',
    title: t('Partie limitée à {hz} images par seconde par l’écran « {screen} »', { hz: num(cap.hz), screen: cap.display }),
    detail: parts.join(' '),
  };
}
