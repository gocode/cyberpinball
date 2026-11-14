// Écrans « Sauvegardes » (app/src/backups-menu.ts, compilé) avec une bibliothèque et des lecteurs
// simulés (des dossiers temporaires) : rien ne lance de sauvegarde ou de restauration sans son
// action ; le focus de départ n'est jamais sur une action qui écrit ; une action indisponible reste
// visible avec sa raison ; une restauration prépare ses fichiers sans toucher la racine, puis
// demande le redémarrage ; une autre borne garde son identité par défaut ; la sauvegarde
// automatique se fait quand la borne est libre et se copie sur la destination quand elle est là.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { listBackups, loadBackupSettings, loadPendingRestore, localBackupDir, saveBackupSettings, BACKUP_DIR_NAME } from '../backup';
import { REPO_ROOT } from './i18n-scan';

interface Action {
  label: string;
  detail?: string;
  tone?: string;
  icon?: string;
  run: () => void | Promise<void>;
}
interface Row {
  text: string;
  detail?: string;
  tone?: string;
  badges?: string[];
  action?: number;
  current?: boolean;
}
interface Built {
  heading: string;
  subheading?: string;
  sections: { title?: string; options?: boolean; rows: Row[] }[];
  actions: Action[];
  back: () => void;
}
interface Drive {
  letter: string;
  name?: string;
  type: 'usb' | 'fixed';
  free?: number;
  path?: string;
  fs?: string;
  serial?: string;
}

function tmp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
function write(root: string, rel: string, content: string): void {
  const abs = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

function fakeRoot(id = 'salon'): string {
  const root = tmp('cp-menu-sauvegarde-');
  write(root, 'data/cabinet.json', '{}');
  write(root, 'data/borne.json', JSON.stringify({ id }));
  write(root, 'data/social.json', JSON.stringify({ name: 'Borne du salon', key: { publicKey: id } }));
  write(root, 'config/VPinballX.ini', '[Player]\n');
  write(root, 'tables/Medieval Madness/Medieval Madness.vpx', 'table');
  write(root, 'tables/Medieval Madness/pinmame/nvram/mm.nv', `scores-${id}`);
  return root;
}

function harness(options: { root?: string; drives?: Drive[]; now?: Date; pick?: (request: { startDir?: string }) => string[] | undefined } = {}) {
  const { createBackupsMenu } = require(path.join(REPO_ROOT, 'app', 'dist', 'backups-menu.js')) as {
    createBackupsMenu(host: object): {
      systemItem: { detail?: string; run(): void };
      busy(): string | undefined;
      yieldToGame(): Promise<boolean>;
      autoTick(free: boolean): Promise<void>;
      restoredNotice(): string | undefined;
    };
  };
  const root = options.root ?? fakeRoot();
  const dataDir = path.join(root, 'data');
  const drives: Drive[] = options.drives ?? [];
  let screen: { build: () => Built; at: number } | undefined;
  let pending: Promise<unknown> = Promise.resolve();
  let relaunched = 0;
  /** Tâches d'écran en cours (recherche des lecteurs, calcul de la place, plan) : settle les attend. */
  let inflight = 0;
  /** Messages d'attente montrés (« Préparation du plan… ») : chacun bloque les touches. */
  const tasks: string[] = [];
  const notices: string[] = [];
  const picks: { startDir?: string }[] = [];
  const menu = createBackupsMenu({
    library: {
      openCustom: (build: () => Built, at = 0) => (screen = { build, at }),
      openSystem: () => (screen = undefined),
      task: async (message: string, work: () => Promise<void> | void) => {
        tasks.push(message);
        inflight++;
        try {
          await work();
        } finally {
          inflight--;
        }
      },
      ...(options.pick ? { pick: async (request: { startDir?: string }) => (picks.push(request), options.pick!(request)) } : {}),
    },
    broadcast: () => undefined,
    root,
    dataDir,
    trashRoot: path.join(root, 'trash'),
    version: '0.1.6',
    cabinetName: () => 'Borne du salon',
    listDrives: async () => drives,
    diskSpace: () => ({ free: 50 * 1024 ** 3, total: 100 * 1024 ** 3 }),
    eject: async () => true,
    relaunch: () => relaunched++,
    notify: (text: string) => notices.push(text),
    now: () => options.now ?? new Date(),
  });
  /** Attend la fin de l'action et de la copie qu'elle a lancée en tâche de fond. */
  const settle = async () => {
    await pending;
    // Les tâches d'écran, la copie en tâche de fond, puis l'écran ouvert à leur suite (.then).
    for (let i = 0; i < 4000 && (inflight > 0 || menu.busy()); i++) await new Promise((r) => setTimeout(r, 5));
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 5));
    if (inflight > 0 || menu.busy()) await settle();
  };
  const shown = () => {
    assert.ok(screen, 'un écran est ouvert');
    return screen.build();
  };
  const action = (label: string | RegExp) => {
    const found = shown().actions.find((a) => (typeof label === 'string' ? a.label === label : label.test(a.label)));
    assert.ok(found, `action « ${label} » dans ${shown().actions.map((a) => a.label).join(' | ')}`);
    return found;
  };
  const choose = async (label: string | RegExp) => {
    pending = Promise.resolve(action(label).run());
    await settle();
  };
  const focused = () => shown().actions[screen!.at];
  return { menu, root, dataDir, drives, shown, action, choose, settle, focused, tasks, relaunched: () => relaunched, notices, picks, open: async () => { menu.systemItem.run(); await settle(); } };
}

/**
 * Lectures synchrones du disque faites par `work` (le module fs réel, que l'application voit aussi) :
 * un écran se reconstruit plusieurs fois par touche, il ne doit pas relire les fichiers de la borne.
 */
function diskReads(work: () => void): number {
  const real = require('node:fs') as Record<string, unknown>;
  const names = ['existsSync', 'statSync', 'lstatSync', 'readFileSync', 'readdirSync', 'statfsSync'];
  const saved = names.map((n) => real[n]);
  let count = 0;
  names.forEach((n, i) => {
    const original = saved[i] as (...args: unknown[]) => unknown;
    real[n] = (...args: unknown[]) => (count++, original(...args));
  });
  try {
    work();
  } finally {
    names.forEach((n, i) => (real[n] = saved[i]));
  }
  return count;
}

function usb(name = 'SAUVEGARDE', letter = 'E:', extra: Partial<Drive> = {}): Drive {
  return { letter, name, type: 'usb', free: 50 * 1024 ** 3, path: tmp(`cp-cle-${name}-`), serial: `${name}-1`, ...extra };
}

test('sans clé : tout reste visible, la sauvegarde grisée avec sa raison', async () => {
  const h = harness();
  await h.open();
  const save = h.action('Sauvegarder maintenant');
  assert.equal(save.tone, 'quiet');
  assert.match(save.detail ?? '', /clé, un disque ou un dossier/);
  await save.run();
  assert.equal(h.shown().heading, 'Sauvegardes', 'rien ne se lance sans destination');
  assert.ok(h.action('Restaurer une sauvegarde'));
  assert.ok(h.action('Choisir une destination'));
});

test('choisir une clé puis un niveau : le focus sur le niveau ; rien n’est écrit avant « Lancer la sauvegarde »', async () => {
  const key = usb();
  const h = harness({ drives: [key] });
  await h.open();
  await h.choose('Choisir une destination');
  assert.equal(h.shown().heading, 'Destination');
  await h.choose(/^Clé « SAUVEGARDE »/);
  assert.equal(loadBackupSettings(h.dataDir).destination?.serial, 'SAUVEGARDE-1');
  await h.choose('Sauvegarder maintenant');
  assert.equal(h.shown().heading, 'Sauvegarder maintenant');
  assert.equal(h.focused()!.label, 'Réglages et scores', 'focus sur le premier niveau, jamais sur le lancement');
  assert.ok(!fs.existsSync(path.join(key.path!, BACKUP_DIR_NAME)), 'rien n’est écrit avant le lancement');
  await h.choose('Avec les tables');
  await h.choose('Lancer la sauvegarde');
  assert.equal(h.shown().heading, 'Sauvegarde terminée');
  const done = listBackups(path.join(key.path!, BACKUP_DIR_NAME));
  assert.equal(done.length, 1);
  assert.equal(done[0]!.manifest.level, 'tables');
  assert.ok(done[0]!.manifest.complete);
  assert.match(h.menu.systemItem.detail ?? '', /Dernière/);
  // Éjecter : la clé part de la liste.
  await h.choose('Éjecter la clé');
  assert.ok(h.notices.some((n) => /débrancher/.test(n)));
});

test('FAT32 et place : un niveau qui ne tient pas est bloqué avec sa raison, le lancement grisé', async () => {
  const small = usb('PETITE', 'G:', { free: 10, fs: 'FAT32' });
  const h = harness({ drives: [small] });
  saveBackupSettings(h.dataDir, { auto: 'off', copyToDestination: true, destination: { path: path.join(small.path!, BACKUP_DIR_NAME), serial: small.serial } });
  await h.open();
  await h.choose('Sauvegarder maintenant');
  const rows = h.shown().sections[0]!.rows;
  assert.ok(rows.every((r) => r.tone === 'error' && r.badges?.includes('Bloquant')), 'aucun niveau ne tient dans 10 octets');
  const launch = h.action('Lancer la sauvegarde');
  assert.equal(launch.tone, 'quiet');
  assert.match(launch.detail ?? '', /Il manque/);
  await launch.run();
  assert.equal(h.shown().heading, 'Sauvegarder maintenant');
});

test('une partie attend la fin d’une sauvegarde en cours', async () => {
  const key = usb();
  const h = harness({ drives: [key] });
  saveBackupSettings(h.dataDir, { auto: 'off', copyToDestination: true, destination: { path: path.join(key.path!, BACKUP_DIR_NAME), serial: key.serial } });
  await h.open();
  await h.choose('Sauvegarder maintenant');
  void h.action('Lancer la sauvegarde').run();
  assert.match(h.menu.busy() ?? '', /sauvegarde est en cours/);
  await h.settle();
  assert.equal(h.menu.busy(), undefined);
});

test('restaurer sa sauvegarde : le plan d’abord, focus sur la première partie ; préparée, la racine n’a pas bougé, Cyber Pinball redémarre', async () => {
  const key = usb();
  const h = harness({ drives: [key] });
  saveBackupSettings(h.dataDir, { auto: 'off', copyToDestination: true, destination: { path: path.join(key.path!, BACKUP_DIR_NAME), serial: key.serial } });
  await h.open();
  await h.choose('Sauvegarder maintenant');
  await h.choose('Lancer la sauvegarde');
  write(h.root, 'config/VPinballX.ini', 'change');
  await h.choose('Revenir aux sauvegardes');
  await h.choose('Restaurer une sauvegarde');
  assert.equal(h.shown().heading, 'Restaurer une sauvegarde');
  assert.equal(h.shown().sections[0]!.title, 'Cette borne · « Borne du salon »');
  await h.choose(/^Borne du salon /);
  const plan = h.shown();
  assert.equal(plan.heading, 'Vérifier la restauration');
  assert.match(plan.subheading ?? '', /cette borne/);
  assert.equal(h.focused()!.label, plan.sections[0]!.rows[0]!.text, 'focus sur la première partie, jamais sur « Restaurer »');
  const cabinet = plan.sections[0]!.rows.find((r) => r.text.startsWith('Écrans'))!;
  assert.ok(cabinet.badges?.includes('✓ Inclus'));
  assert.match(cabinet.detail ?? '', /1 fichier remplacé/);
  // Exclure les écrans : plus rien à restaurer.
  await h.choose('Écrans, boutons et son de la borne');
  assert.equal(h.action('Restaurer la sélection').tone, 'quiet');
  await h.choose('Écrans, boutons et son de la borne');
  await h.choose('Restaurer la sélection');
  assert.equal(h.relaunched(), 1);
  assert.ok(loadPendingRestore(h.dataDir));
  assert.equal(fs.readFileSync(path.join(h.root, 'config', 'VPinballX.ini'), 'utf8'), 'change', 'rien n’est posé avant le redémarrage');
});

test('la sauvegarde d’une autre borne : ses écrans et son identité ne sont pas repris d’office ; les prendre demande une confirmation', async () => {
  const key = usb();
  const other = harness({ root: fakeRoot('bruno'), drives: [key] });
  saveBackupSettings(other.dataDir, { auto: 'off', copyToDestination: true, destination: { path: path.join(key.path!, BACKUP_DIR_NAME), serial: key.serial } });
  await other.open();
  await other.choose('Sauvegarder maintenant');
  await other.choose('Lancer la sauvegarde');

  const h = harness({ drives: [key] });
  await h.open();
  await h.choose('Restaurer une sauvegarde');
  assert.equal(h.shown().sections[0]!.title, 'Une autre borne');
  await h.choose(/^Borne du salon /);
  const plan = h.shown();
  assert.match(plan.subheading ?? '', /une autre borne/);
  const cabinet = plan.sections[0]!.rows.find((r) => r.text.startsWith('Écrans'))!;
  assert.ok(cabinet.badges?.includes('Exclu'));
  assert.ok(!plan.sections[0]!.rows.some((r) => r.text.startsWith('Amis')), 'l’identité se choisit à part');
  const identity = plan.sections.find((s) => s.title === 'Amis et identité sur le réseau')!;
  assert.ok(identity.rows[0]!.current && identity.rows[0]!.badges?.includes('Choisi'));
  await h.choose(/^Remplacer « Borne du salon » sur le réseau$/);
  await h.choose('Restaurer la sélection');
  assert.match(h.shown().heading, /^Remplacer « Borne du salon » sur le réseau \?$/);
  assert.equal(h.relaunched(), 0, 'rien avant la confirmation');
  assert.equal(h.focused()!.label, 'Retour', 'la confirmation commence sur Retour');
});

test('sauvegarde automatique : due, borne libre, faite sur la borne puis copiée sur la clé ; occupée, elle attend', async () => {
  const key = usb();
  const sunday = new Date(2026, 10, 4, 21, 0);
  const h = harness({ drives: [key], now: sunday });
  saveBackupSettings(h.dataDir, { auto: 'weekly', moment: 'fixed', copyToDestination: true, destination: { path: path.join(key.path!, BACKUP_DIR_NAME), serial: key.serial } });
  await h.menu.autoTick(false);
  assert.equal(listBackups(localBackupDir(h.dataDir)).length, 0, 'pendant une partie, rien');
  await h.menu.autoTick(true);
  const local = listBackups(localBackupDir(h.dataDir));
  assert.equal(local.length, 1);
  assert.ok(local[0]!.manifest.auto);
  assert.equal(listBackups(path.join(key.path!, BACKUP_DIR_NAME)).length, 1, 'copiée sur la clé');
  assert.ok(h.notices.some((n) => /copiés sur/.test(n)));
  await h.menu.autoTick(true);
  assert.equal(listBackups(localBackupDir(h.dataDir)).length, 1, 'faite une fois par échéance');
});

test('un dossier précis comme destination : sauvegardes dedans, retrouvées pour restaurer ; refusé dans l’installation', async () => {
  const key = usb();
  const target = path.join(key.path!, 'Sauvegardes', 'Borne');
  fs.mkdirSync(target, { recursive: true });
  let answer: string | undefined = target;
  const h = harness({ drives: [key], pick: () => (answer ? [answer] : undefined) });
  await h.open();
  await h.choose('Choisir une destination');
  await h.choose('Choisir un dossier…');
  assert.equal(h.picks[0]!.startDir, key.path, 'le sélecteur s’ouvre sur la clé');
  const s = loadBackupSettings(h.dataDir);
  assert.equal(s.destination?.folder, path.join('Sauvegardes', 'Borne'));
  assert.equal(s.destination?.serial, key.serial);
  assert.match(h.action(/^Destination : /).label, /Clé « SAUVEGARDE » \(E:\) › Sauvegardes.Borne/);
  await h.choose('Sauvegarder maintenant');
  await h.choose('Lancer la sauvegarde');
  assert.equal(listBackups(path.join(target, BACKUP_DIR_NAME)).length, 1, 'dans le dossier choisi');
  assert.ok(!fs.existsSync(path.join(key.path!, BACKUP_DIR_NAME)), 'rien à la racine de la clé');
  await h.choose('Revenir aux sauvegardes');
  await h.choose('Restaurer une sauvegarde');
  assert.ok(h.shown().actions.some((a) => /^Borne du salon /.test(a.label)), 'retrouvée pour restaurer');
  // La destination rouverte : le dossier choisi en tête, coché ; le sélecteur repart de lui.
  h.shown().back();
  await h.choose(/^Destination : /);
  const first = h.shown().sections.find((x) => x.options)!.rows[0]!;
  assert.ok(first.current && first.badges?.includes('Choisie'));
  // Un dossier dans l'installation est refusé, la destination ne change pas.
  answer = path.join(h.root, 'tables');
  await h.choose('Choisir un dossier…');
  assert.equal(h.picks[1]!.startDir, target);
  assert.equal(h.shown().heading, 'Destination');
  assert.match(h.shown().sections[0]!.rows[0]!.text, /dans l’installation/);
  assert.equal(loadBackupSettings(h.dataDir).destination?.folder, path.join('Sauvegardes', 'Borne'));
  // Le dossier des sauvegardes lui-même : c'est son dossier parent qui est pris.
  answer = path.join(target, BACKUP_DIR_NAME);
  await h.choose('Choisir un dossier…');
  assert.equal(loadBackupSettings(h.dataDir).destination?.folder, path.join('Sauvegardes', 'Borne'));
});

test('sauvegarde automatique dès que possible : une par jour à la première occasion ; une partie passe avant', async () => {
  const at = { now: new Date(2026, 10, 4, 21, 0) };
  const h = harness({ now: at.now });
  saveBackupSettings(h.dataDir, { auto: 'daily', moment: 'asap', copyToDestination: false });
  await h.menu.autoTick(true);
  assert.equal(listBackups(localBackupDir(h.dataDir)).length, 1, 'faite à la première occasion');
  await h.menu.autoTick(true);
  assert.equal(listBackups(localBackupDir(h.dataDir)).length, 1, 'une seule par jour');
  assert.match(h.menu.systemItem.detail ?? '', /Dernière/);
  // Une partie lancée pendant une sauvegarde automatique l'arrête : elle n'est pas comptée.
  const g = harness();
  saveBackupSettings(g.dataDir, { auto: 'daily', moment: 'asap', copyToDestination: false });
  for (let i = 0; i < 40; i++) write(g.root, `tables/T${i}/T${i}.ini`, 'x'.repeat(200_000));
  const running = g.menu.autoTick(true);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(await g.menu.yieldToGame(), true);
  assert.equal(g.menu.busy(), undefined, 'la partie peut partir');
  await running;
  assert.equal(loadBackupSettings(g.dataDir).lastAuto, undefined, 'pas comptée : elle se refera');
  assert.equal(await g.menu.yieldToGame(), false, 'plus rien à arrêter');
});

test('écran automatique : chaque jour, à heure fixe, l’heure choisie ; le jour pour chaque semaine', async () => {
  const h = harness({ now: new Date(2026, 10, 4, 21, 0) });
  await h.open();
  await h.choose('Automatique : désactivée');
  assert.equal(h.shown().heading, 'Sauvegarde automatique');
  assert.ok(!h.shown().sections.some((s) => s.title === 'Moment'), 'désactivée : pas de moment');
  await h.choose('Chaque jour');
  assert.equal(h.focused()!.label, 'Chaque jour', 'le curseur reste sur le choix');
  assert.equal(loadBackupSettings(h.dataDir).moment, 'asap', 'dès que possible par défaut');
  assert.ok(h.shown().sections.find((s) => s.title === 'Moment')!.rows[0]!.current);
  assert.ok(!h.shown().actions.some((a) => /^Heure/.test(a.label)), 'pas d’heure dès que possible');
  await h.choose('À heure fixe');
  await h.choose('Heure : 4 h');
  assert.equal(h.shown().heading, 'Heure de la sauvegarde');
  assert.equal(h.focused()!.label, '4 h', 'le curseur sur l’heure actuelle');
  await h.choose('22 h');
  assert.equal(loadBackupSettings(h.dataDir).hour, 22);
  assert.equal(h.focused()!.label, 'Heure : 22 h');
  await h.choose('Chaque semaine');
  await h.choose('Jour : dimanche');
  await h.choose('Mardi');
  const s = loadBackupSettings(h.dataDir);
  assert.deepEqual([s.auto, s.moment, s.hour, s.weekday], ['weekly', 'fixed', 22, 2]);
  h.shown().back();
  assert.ok(h.action('Automatique : le mardi à 22 h'));
});
test('une borne pleine de fichiers : les écrans se reconstruisent sans relire le disque, inclure ou exclure une partie est immédiat', async () => {
  // Le 14/11/2026 : sur « Sauvegarder maintenant », chaque flipper relisait le cache d'empreintes et
  // cherchait chaque fichier sur la clé, pour chaque niveau, plusieurs fois par touche ; sur le plan
  // d'une restauration, chaque partie incluse relançait le relevé de tous les fichiers, touches
  // ignorées. Les appuis se perdaient et la sélection mettait des secondes à suivre.
  const FILES = 400;
  const root = fakeRoot();
  for (let i = 0; i < FILES; i++) write(root, `tables/Medieval Madness/media/image-${i}.png`, `image ${i}`);
  const key = usb();
  const h = harness({ root, drives: [key] });
  saveBackupSettings(h.dataDir, { auto: 'off', copyToDestination: true, destination: { path: path.join(key.path!, BACKUP_DIR_NAME), serial: key.serial } });
  await h.open();
  await h.choose('Sauvegarder maintenant');
  await h.choose('Avec les tables');
  await h.choose('Lancer la sauvegarde');
  assert.equal(h.shown().heading, 'Sauvegarde terminée');
  // Le cache d'empreintes est plein : c'est là que l'estimation cherchait chaque fichier sur la clé.
  await h.choose('Revenir aux sauvegardes');
  await h.choose('Sauvegarder maintenant');
  assert.equal(h.shown().heading, 'Sauvegarder maintenant');
  const BUILDS = 10;
  const levelReads = diskReads(() => {
    for (let i = 0; i < BUILDS; i++) h.shown();
  });
  assert.ok(levelReads < BUILDS * 20, `${levelReads} lectures du disque pour ${BUILDS} constructions de l'écran des niveaux (${FILES} fichiers)`);
  assert.match(h.shown().sections[0]!.rows[1]!.text, /^Avec les tables · /, 'les estimations sont toujours montrées');
  const mainReads = diskReads(() => {
    h.shown().back();
    for (let i = 0; i < BUILDS; i++) h.shown();
  });
  assert.equal(h.shown().heading, 'Sauvegardes');
  assert.ok(mainReads < BUILDS * 20, `${mainReads} lectures du disque pour ${BUILDS} constructions de l'écran principal`);

  await h.choose('Restaurer une sauvegarde');
  await h.choose(/^Borne du salon /);
  assert.equal(h.shown().heading, 'Vérifier la restauration');
  const before = h.tasks.length;
  const planReads = diskReads(() => {
    for (let i = 0; i < BUILDS; i++) h.shown();
  });
  assert.ok(planReads < BUILDS * 20, `${planReads} lectures du disque pour ${BUILDS} constructions du plan`);
  const tables = () => h.shown().sections[0]!.rows.find((r) => r.text === 'Tables, ROM, PuP-Packs, sons et médias')!;
  assert.ok(tables().badges?.includes('✓ Inclus'));
  let toggleReads = 0;
  const run = h.action('Tables, ROM, PuP-Packs, sons et médias').run();
  assert.equal(run, undefined, 'inclure ou exclure se fait sur-le-champ, sans attente');
  toggleReads += diskReads(() => void h.shown());
  assert.ok(tables().badges?.includes('Exclu'));
  assert.deepEqual(h.tasks.slice(before), [], 'aucun message d’attente : les touches restent libres');
  assert.ok(toggleReads < 20, `${toggleReads} lectures du disque pour une partie exclue`);
});
