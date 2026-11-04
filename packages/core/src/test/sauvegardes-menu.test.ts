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

function harness(options: { root?: string; drives?: Drive[]; now?: Date } = {}) {
  const { createBackupsMenu } = require(path.join(REPO_ROOT, 'app', 'dist', 'backups-menu.js')) as {
    createBackupsMenu(host: object): {
      systemItem: { detail?: string; run(): void };
      busy(): string | undefined;
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
  const notices: string[] = [];
  const menu = createBackupsMenu({
    library: {
      openCustom: (build: () => Built, at = 0) => (screen = { build, at }),
      openSystem: () => (screen = undefined),
      task: async (_m: string, work: () => Promise<void> | void) => {
        inflight++;
        try {
          await work();
        } finally {
          inflight--;
        }
      },
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
  return { menu, root, dataDir, drives, shown, action, choose, settle, focused, relaunched: () => relaunched, notices, open: async () => { menu.systemItem.run(); await settle(); } };
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
  saveBackupSettings(h.dataDir, { auto: 'weekly', copyToDestination: true, destination: { path: path.join(key.path!, BACKUP_DIR_NAME), serial: key.serial } });
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
