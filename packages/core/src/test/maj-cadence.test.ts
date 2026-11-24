// Recherche des mises à jour en arrière-plan (app/src/updates-menu.ts) : une version publiée doit
// mettre sa pastille rouge sur une borne allumée sans attendre des heures. Le 20/11/2026, la 0.2.2
// sortie à 23 h 58 n'aurait été vue qu'à 4 h 14 : la recherche ne repartait que toutes les 6 h,
// et les minuteries ne comptent pas le temps de veille du PC.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';

const read = (file: string) => fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', file), 'utf8');

/** Une constante « N * 60_000 » ou « N * 3600_000 » de updates-menu.ts, en millisecondes. */
function constant(source: string, name: string): number {
  const m = source.match(new RegExp(String.raw`const ${name} = (\d+) \* (60_000|3600_000);`));
  assert.ok(m, `${name} introuvable dans updates-menu.ts`);
  return Number(m[1]) * Number(m[2]!.replace('_', ''));
}

test('mises à jour : une recherche au moins toutes les heures, et sans rafale vers GitHub', () => {
  const updates = read('updates-menu.ts');
  const every = constant(updates, 'CHECK_EVERY_MS');
  assert.ok(every <= 3600_000, `recherche toutes les ${every / 60_000} min : une version publiée resterait sans pastille plus d'une heure`);
  // 60 requêtes par heure sans compte, pour toute la maison (téléphones, autres PC) : pas plus de 4 par heure ici.
  assert.ok(every >= 15 * 60_000, `recherche toutes les ${every / 60_000} min : trop fréquente pour la limite de GitHub`);
  const soon = constant(updates, 'SOON_AFTER_MS');
  assert.ok(soon >= 60_000 && soon < every, 'réveil ou retour de partie : une recherche, au plus une toutes les quelques minutes');
});

test('mises à jour : la recherche part dès l’ouverture de l’entrée, sans attendre « Rechercher à nouveau »', () => {
  const updates = read('updates-menu.ts');
  // Jusqu'à la 0.2.3, un résultat de moins de 10 min s'affichait tel quel : une version publiée
  // entre-temps restait cachée derrière « Cyber Pinball est à jour ».
  assert.match(updates, /run: \(\) => open\(\),/, 'l’entrée du Menu système ouvre l’écran par open()');
  const open = updates.match(/function open\(\): void \{([\s\S]*?)\n  \}/);
  assert.ok(open, 'function open() introuvable');
  assert.match(open[1]!, /if \(state\.kind !== 'downloading' && state\.kind !== 'installing' && state\.kind !== 'checking'\) void check\(\);/, 'seule une opération en cours dispense de la recherche');
  assert.doesNotMatch(updates, /FRESH_MS|checkedAt/, 'aucun résultat gardé ne remplace la recherche à l’ouverture');
  // Une version déjà trouvée reste proposée si la recherche de l'ouverture n'obtient pas de réponse.
  assert.match(updates, /state = known \?\? \{ kind: 'error'/);
});

test('mise à jour automatique au lancement : la première recherche seulement, jamais en partie ni après un échec', () => {
  const updates = read('updates-menu.ts');
  // Armée au démarrage, consommée par la première recherche discrète qui aboutit, et dans un délai borné.
  assert.match(updates, /atLaunch = true;\s+launchedAt = Date\.now\(\);/, 'armée par startBackgroundChecks');
  assert.match(updates, /const launch = atLaunch && Date\.now\(\) - launchedAt < LAUNCH_WINDOW_MS;\s+atLaunch = false;/, 'une seule fois, juste après le démarrage');
  const window = constant(updates, 'LAUNCH_WINDOW_MS');
  assert.ok(window <= 30 * 60_000, 'au-delà, ce n’est plus « au lancement »');
  // Case cochée, pas de tentative ratée (sinon elle recommencerait à chaque démarrage), aucune partie en cours.
  const allowed = updates.match(/function autoInstallAllowed\([^)]*\): boolean \{([\s\S]*?)\n  \}/);
  assert.ok(allowed, 'autoInstallAllowed introuvable');
  assert.match(allowed[1]!, /!loadAutoUpdate\(host\.loc\.dataDir\) \|\| failed \|\| !installedRoot\(\)/);
  assert.match(allowed[1]!, /host\.busy\?\.\(\)/);
  const frontend = read('frontend.ts');
  assert.match(frontend, /busy: \(\) => state\.phase === 'loading' \|\| state\.phase === 'playing',/, 'le front-end dit quand une partie tourne');
  // La case est sur chaque écran de résultat.
  assert.equal((updates.match(/sourceAction\(\),\s+autoAction\(\),/g) ?? []).length, 3, 'à jour, disponible, erreur');
});

test('mises à jour : une recherche au réveil du PC et au retour d’une partie', () => {
  const frontend = read('frontend.ts');
  assert.match(frontend, /powerMonitor\.on\('resume', \(\) => updates\.checkSoon\(\)\);/, 'réveil du PC');
  assert.match(frontend, /if \(broadcastPhase === 'playing' && state\.phase !== 'playing'\) updates\.checkSoon\(\);\s+broadcastPhase = state\.phase;/, 'retour d’une partie, de tout jeu');
  const updates = read('updates-menu.ts');
  // checkSoon respecte l'écart minimal et ne vaut qu'avec la recherche en arrière-plan (jamais hors écran sans site d'essai).
  assert.match(updates, /function checkSoon\(\): void \{\s+if \(!host\.background \|\| Date\.now\(\) - quietAt < SOON_AFTER_MS\) return;/);
  assert.match(updates, /return \{[^}]*checkSoon \};/);
});
