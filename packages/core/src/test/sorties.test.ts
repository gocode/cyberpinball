// Toujours une sortie (PinCab, 10/11/2026 : « tous les écrans deviennent noirs, et impossible de
// sortir de là » ; il fallait le gestionnaire des tâches). Les règles qui l'empêchent :
// - « Récupérer » cède son « toujours au-dessus » à une fenêtre de Windows qui prend le premier plan
//   (dialogue de sécurité, gestionnaire des tâches), et le reprend avec le focus (front-policy.ts) ;
// - un écran resté sous son seul voile noir hors partie est repris et noté (screencover.ts) ;
// - le surveillant de la borne dédiée relance Cyber Pinball figé, sans pouls (windowssettings.ts) ;
// - aucun texte ne prétend que yt-dlp manque : il est là, ou s'installe à la demande.
// Exit sans focus, Exit tenu et fenêtre au rendu tombé : banc de saisie-robuste.test.ts.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { frontMove } from '../front-policy';
import { veilAloneDue } from '../screencover';
import { PULSE_STALE_MS, pulseStale } from '../windowssettings';
import { REPO_ROOT } from './i18n-scan';

test('« Récupérer » ne cache jamais une fenêtre de Windows qui a pris le premier plan', () => {
  // Une fenêtre de Cyber Pinball prend le focus (le fronton cliqué) : « Récupérer » repasse devant.
  assert.equal(frontMove('blur', true, false), 'raise');
  // Une fenêtre de Windows le prend (Windows Hello, gestionnaire des tâches) : elle cède.
  assert.equal(frontMove('blur', false, false), 'yield');
  // Elle ne reprend pas son rang tant que le focus n'est pas revenu…
  assert.equal(frontMove('top-lost', false, true), 'keep');
  // …puis le reprend avec lui ; perdu sans l'avoir cédé, elle le reprend aussitôt.
  assert.equal(frontMove('focus', true, true), 'reclaim');
  assert.equal(frontMove('focus', true, false), 'keep');
  assert.equal(frontMove('top-lost', false, false), 'raise');
});

test('écran sous son seul voile noir : repris au-delà du délai, hors partie seulement, une fois par délai', () => {
  const since = new Map<string, number>();
  const veiled = new Set(['fronton']);
  assert.deepEqual(veilAloneDue(since, veiled, 0, false, 4000), []);
  assert.deepEqual(veilAloneDue(since, veiled, 3000, false, 4000), [], 'un voile seul le temps d’une bascule n’est pas un incident');
  assert.deepEqual(veilAloneDue(since, veiled, 4000, false, 4000), ['fronton']);
  assert.deepEqual(veilAloneDue(since, veiled, 5000, false, 4000), [], 'signalé une fois par délai');
  assert.deepEqual(veilAloneDue(since, veiled, 8000, false, 4000), ['fronton'], 'la reprise n’a pas suffi : de nouveau');
  // Pendant une partie (VPX couvre les écrans), rien ; l'attente repart de zéro après.
  assert.deepEqual(veilAloneDue(since, veiled, 20_000, true, 4000), []);
  assert.deepEqual(veilAloneDue(since, veiled, 21_000, false, 4000), []);
  assert.deepEqual(veilAloneDue(since, veiled, 25_000, false, 4000), ['fronton']);
  // Rendu à sa fenêtre : l'écran sort du suivi.
  assert.deepEqual(veilAloneDue(since, new Set(), 26_000, false, 4000), []);
  assert.equal(since.size, 0);
});

test('surveillant : Cyber Pinball sans pouls est figé, pas pendant son démarrage', () => {
  const start = 1_000_000;
  assert.equal(pulseStale(undefined, start, start + 10_000), false, 'démarrage : pas encore de pouls');
  assert.equal(pulseStale(start + 2000, start, start + 40_000), false);
  assert.equal(pulseStale(start + 2000, start, start + 2000 + PULSE_STALE_MS + 1), true, 'plus de pouls : figé');
  assert.equal(pulseStale(undefined, start, start + PULSE_STALE_MS + 1), true, 'jamais de pouls après le délai : figé');
  // Un pouls laissé par le lancement précédent ne compte pas.
  assert.equal(pulseStale(start - 60_000, start, start + PULSE_STALE_MS - 1), false);
  // Le surveillant le lit et tue le processus figé ; Cyber Pinball l'écrit.
  const supervisor = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'supervisor.ts'), 'utf8');
  assert.match(supervisor, /pulseStale\(/);
  assert.match(supervisor, /taskkill\.exe/);
  assert.match(fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'main.ts'), 'utf8'), /beatPulse\(\)/);
});

test('toute demande d’autorisation de Windows (UAC) est prévenue avant, et n’est pas attendue sans fin', () => {
  // PinCab, 10/11/2026 : la demande de Windows s'affiche sur le bureau sécurisé, où les boutons de la
  // borne ne peuvent rien. Chaque élévation de l'application a son écran qui prévient (askElevation,
  // « Plus tard » choisi d'office) et un délai commun (ELEVATION_WAIT_MS). Une élévation nouvelle doit
  // s'inscrire ici, avec l'écran qui la déclenche.
  const ELEVATIONS: Record<string, string[]> = {
    'app/src/dedicated-system.ts': ['app/src/dedicated-menu.ts'],
    'app/src/firewall-rule.ts': ['app/src/friends-menu.ts'],
    'app/src/vision3d.ts': ['app/src/frontend.ts'],
  };
  const src = path.join(REPO_ROOT, 'app', 'src');
  const read = (f: string) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
  const elevating = fs
    .readdirSync(src)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => `app/src/${f}`)
    .filter((f) => /-Verb RunAs|\brunas\b/i.test(read(f).replace(/\/\/.*$/gm, '')));
  assert.deepEqual(elevating.sort(), Object.keys(ELEVATIONS).sort(), 'élévation nouvelle : la prévenir (askElevation) et l’inscrire ici');
  for (const [file, screens] of Object.entries(ELEVATIONS)) {
    assert.match(read(file), /ELEVATION_WAIT_MS/, `${file} : délai commun d’attente de la réponse de Windows`);
    for (const screen of screens) assert.match(read(screen), /askElevation\(/, `${screen} : prévenir avant la demande de Windows`);
  }
  // L'écran d'avertissement : « Plus tard » d'abord (choisi d'office), et la façon de répondre.
  const confirm = read('app/src/uac-confirm.ts');
  assert.ok(confirm.indexOf("key: 'later'") < confirm.indexOf("key: 'go'"), '« Plus tard » en premier');
  assert.match(confirm, /Alt\+O pour Oui, Échap pour Non/);
});

test('aucun texte affiché ne prétend que yt-dlp manque : il est là, ou s’installe à la demande', () => {
  // Le 10/11/2026 : « … demanderait un outil externe (yt-dlp) que Cyber Pinball n’a pas », sur toute
  // page vidéo ouverte hors de la recherche d'un média (Juke-box, navigation libre).
  const claims = /yt-dlp[^'`\n]{0,80}(n’a pas(?! pu)|n'a pas(?! pu)|manque|absent|demanderait)|(n’a pas|n'a pas|manque)[^'`\n]{0,40}yt-dlp|outil externe \(yt-dlp\)|does not have[^'`\n]{0,40}yt-dlp|yt-dlp\) that Cyber Pinball does not have/i;
  const offenders: string[] = [];
  const scan = (dir: string, keep: RegExp) => {
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name);
      if (fs.statSync(file).isDirectory()) {
        if (name !== 'test' && name !== 'node_modules') scan(file, keep);
        continue;
      }
      if (!keep.test(name)) continue;
      fs.readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/^\s*(\/\/|\/?\*)/.test(line)) return;
          if (claims.test(line)) offenders.push(`${path.relative(REPO_ROOT, file)}:${i + 1}`);
        });
    }
  };
  scan(path.join(REPO_ROOT, 'app', 'src'), /\.ts$/);
  scan(path.join(REPO_ROOT, 'app', 'renderer'), /\.(js|html)$/);
  scan(path.join(REPO_ROOT, 'packages', 'core', 'src'), /\.ts$/);
  assert.deepEqual(offenders, []);
});
