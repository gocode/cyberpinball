// Durée de chaque fichier de test rapide, et garde-fou contre le fichier qui redevient le goulet.
//
// Pourquoi : la suite rapide passe deux fois par changement (vérification de la branche, puis train)
// et node --test lance les fichiers en parallèle, mais chaque fichier est séquentiel. Un fichier de
// 29 essais qui attendent chacun 8 à 18 s (scripts/banc-casque.test.mjs : 242 s) fixe seul la durée de
// toute la suite : 6 à 13 min alors que la somme de tous les tests ne fait que 21 min (25/11/2026).
// Rien ne le signalait : on ne voyait que le total.
//
// Ce module est aussi un reporter de node:test (`--test-reporter=<ce fichier>`). Il reçoit, pour chaque
// fichier, l'événement « test:complete » de niveau 0 dont le nom est le fichier lui-même, avec sa durée
// réelle (démarrage du processus compris) ; il écrit tmp/durees-tests-rapides.json. Les contrôles express
// (scripts/controles.mjs) lisent ce fichier et avertissent de tout fichier rapide de plus de
// SEUIL_FICHIER_LENT_MS, avec son nom et sa durée. Règle fixée par scripts/durees-tests.test.mjs.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Un fichier de test rapide plus long que ça est un goulet : à découper ou à accélérer. */
export const SEUIL_FICHIER_LENT_MS = 60_000;

/** Où les contrôles écrivent les durées, dans `cwd`. */
export const dureesFile = (cwd) => path.join(cwd, 'tmp', 'durees-tests-rapides.json');

const here = fileURLToPath(import.meta.url);

/**
 * Arguments de node --test pour sortir à la fois le TAP (sur la sortie standard, lu par les contrôles) et
 * les durées par fichier (dans tmp/durees-tests-rapides.json). À mettre à la place de `--test-reporter=tap`.
 */
export function reporterArgs(cwd) {
  return ['--test-reporter=tap', '--test-reporter-destination=stdout', `--test-reporter=${pathToFileURL(here).href}`, `--test-reporter-destination=${dureesFile(cwd)}`];
}

const norm = (p) => String(p ?? '').replace(/\\/g, '/');

/**
 * Durées par fichier d'après les événements de node:test. `cwd` : dossier pour rendre les chemins relatifs.
 * Un fichier est connu par son événement de niveau 0 nommé comme lui ; à défaut (autre version de node), par
 * la somme de ses essais de niveau 0.
 */
export function dureesParFichier(events, cwd = process.cwd()) {
  const fichier = new Map();
  const somme = new Map();
  for (const { type, data } of events) {
    if (type !== 'test:complete' || !data?.file || data.nesting !== 0) continue;
    const rel = norm(path.relative(cwd, data.file));
    const ms = Number(data.details?.duration_ms) || 0;
    if (norm(data.name) === rel || norm(path.resolve(cwd, data.name)) === norm(data.file)) fichier.set(rel, ms);
    else somme.set(rel, (somme.get(rel) ?? 0) + ms);
  }
  const rel = new Set([...fichier.keys(), ...somme.keys()]);
  return Object.fromEntries([...rel].map((f) => [f, Math.round(fichier.get(f) ?? somme.get(f))]).sort((a, b) => b[1] - a[1]));
}

/** Les fichiers de plus de `seuilMs`, du plus long au plus court : [{ fichier, ms }]. */
export function fichiersLents(durees, seuilMs = SEUIL_FICHIER_LENT_MS) {
  return Object.entries(durees)
    .filter(([, ms]) => ms > seuilMs)
    .map(([fichier, ms]) => ({ fichier, ms }))
    .sort((a, b) => b.ms - a.ms);
}

/** L'avertissement des contrôles : une ligne par fichier lent, avec son nom et sa durée. Vide s'il n'y en a pas. */
export function avertissementsLents(durees, seuilMs = SEUIL_FICHIER_LENT_MS) {
  const lents = fichiersLents(durees, seuilMs);
  if (!lents.length) return [];
  return [
    `Avertissement : ${lents.length} fichier(s) de tests rapides de plus de ${Math.round(seuilMs / 1000)} s, le plus long fixe la durée de toute la suite (à découper, ou à accélérer : délai injecté, essais en parallèle) :`,
    ...lents.map((l) => `  - ${l.fichier} : ${Math.round(l.ms / 1000)} s`),
  ];
}

/** Lit tmp/durees-tests-rapides.json de `cwd` ; rend { fichiers, total_ms } ou undefined s'il manque. */
export function lireDurees(cwd) {
  try {
    const j = JSON.parse(fs.readFileSync(dureesFile(cwd), 'utf8'));
    return j && typeof j.fichiers === 'object' ? j : undefined;
  } catch {
    return undefined;
  }
}

/** Reporter de node:test : ne rend que le JSON final (la sortie TAP a son propre reporter). */
export default async function* reporterDurees(source) {
  const events = [];
  const debut = Date.now();
  for await (const event of source) if (event.type === 'test:complete') events.push({ type: event.type, data: { file: event.data.file, name: event.data.name, nesting: event.data.nesting, details: { duration_ms: event.data.details?.duration_ms } } });
  const fichiers = dureesParFichier(events);
  yield `${JSON.stringify({ date: new Date().toISOString(), total_ms: Date.now() - debut, seuil_ms: SEUIL_FICHIER_LENT_MS, fichiers }, null, 1)}\n`;
}
