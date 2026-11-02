// Écran « Borne dédiée » (app/src/dedicated-menu.ts, compilé) avec un Windows simulé, et
// l'invariant de la fonction : aucune écriture dans Windows ne part ailleurs que de l'action
// « Activer » ou « Désactiver » choisie à l'écran. Ni l'ouverture de l'écran, ni ses autres
// actions, ni les entrées du menu système, ni le reste de l'application n'en font.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { freshWindows, loadDedicatedRecord, rescueScriptFile, simulateRun, type ElevatedRun, type SimulatedWindows } from '../dedicated';
import {
  freshSettings,
  loadSettingsRecord,
  settingsRescueFile,
  simulateSettingsRun,
  supervisorMarkerFile,
  SUPERVISOR_FLAG,
  type SettingsRun,
  type SimulatedSettings,
} from '../windowssettings';
import { REPO_ROOT } from './i18n-scan';

const APP_DIST = path.join(REPO_ROOT, 'app', 'dist');

interface Action {
  label: string;
  detail?: string;
  run: () => void | Promise<void>;
}
interface Row {
  text: string;
  detail?: string;
  tone?: string;
  badges?: string[];
}
interface Built {
  heading: string;
  subheading?: string;
  sections: { title?: string; rows: Row[] }[];
  actions: Action[];
  back: () => void;
}
interface Probe {
  user: string;
  sid: string;
  editionId: string;
  build: number;
  otherAdmins?: string[];
}
type Result = { outcome: unknown } | { cancelled: true } | { error: string };
interface Item {
  label?: string;
  detail?: string;
  run: () => void;
}

const PROBE: Probe = { user: 'Borne', sid: 'S-1-5-21-1-2-3-1001', editionId: 'IoTEnterpriseS', build: 26100, otherAdmins: ['Admin'] };

/** Écran de la borne dédiée, avec une bibliothèque et un Windows simulés ; chaque demande d'écriture est notée. */
function harness(options: { probe?: Partial<Probe>; windows?: SimulatedWindows; settings?: SimulatedSettings; command?: string[] | undefined; shellSession?: boolean; bootTime?: number; otherFrontends?: string } = {}) {
  const { createDedicatedMenu } = require(path.join(APP_DIST, 'dedicated-menu.js')) as {
    createDedicatedMenu(host: object): { dedicatedItem: Item; startupItem: Item; explorerItem: Item; open(): void };
  };
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-borne-dediee-'));
  const startupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-demarrage-'));
  const state = { windows: options.windows ?? freshWindows(), settings: options.settings ?? freshSettings(), cancel: false, bootTime: options.bootTime ?? Date.parse('2026-10-26T08:00:00Z') };
  const writes: ElevatedRun[] = [];
  /** Écritures des réglages du compte (relevés exclus), avec l'élévation demandée. */
  const settingsWrites: { run: SettingsRun; elevate: boolean }[] = [];
  const reads: string[] = [];
  let explorer = 0;
  let desktop = 0;
  let screen: { build: () => Built; at: number } | undefined;
  let system = 0;
  let pending: Promise<void> = Promise.resolve();
  const menu = createDedicatedMenu({
    library: {
      openCustom: (build: () => Built, at = 0) => (screen = { build, at }),
      openSystem: () => {
        screen = undefined;
        system++;
      },
      task: async (_message: string, work: () => Promise<void> | void) => {
        await work();
      },
    },
    system: {
      simulated: true,
      probe: async () => {
        reads.push('probe');
        return { ...PROBE, ...options.probe };
      },
      runElevated: async (run: ElevatedRun): Promise<Result> => {
        writes.push(run);
        if (state.cancel) return { cancelled: true };
        const { windows, outcome } = simulateRun(state.windows, run);
        state.windows = windows;
        return { outcome };
      },
      runSettings: async (run: SettingsRun, elevate: boolean): Promise<Result> => {
        if (Object.keys(run.want).length) settingsWrites.push({ run, elevate });
        if (Object.keys(run.want).length && elevate && state.cancel) return { cancelled: true };
        const { windows, outcome } = simulateSettingsRun(state.settings, run);
        state.settings = windows;
        return { outcome };
      },
      startupDir: () => startupDir,
      bootTime: () => state.bootTime,
      openExplorer: () => explorer++,
      explorerShown: () => false,
    },
    dataDir,
    command: () => ('command' in options ? options.command : ['D:\\CyberPinball\\app\\CyberPinball.exe']),
    shellSession: options.shellSession ?? false,
    desktopKeys: 'Ctrl+Maj+D',
    showDesktop: () => desktop++,
    otherFrontends: () => options.otherFrontends,
    now: () => new Date('2026-10-26T12:00:00Z'),
  });
  const shown = () => {
    assert.ok(screen, 'un écran est affiché');
    return screen.build();
  };
  const action = (label: string) => {
    const found = shown().actions.find((a) => a.label === label);
    assert.ok(found, `action « ${label} » absente : ${shown().actions.map((a) => a.label).join(' · ')}`);
    return found;
  };
  const rows = () => shown().sections.flatMap((s) => s.rows);
  const open = async () => {
    menu.open();
    await new Promise((r) => setTimeout(r, 0));
    await pending;
  };
  const choose = async (label: string) => {
    pending = Promise.resolve(action(label).run()) as Promise<void>;
    await pending;
  };
  return { menu, dataDir, startupDir, state, writes, settingsWrites, reads, open, choose, shown, rows, action, at: () => screen?.at, counts: () => ({ explorer, desktop, system }) };
}

/** Toutes les actions de l'écran sauf celles qui écrivent ; chacune est essayée, puis l'écran rouvert. */
async function tryEverythingElse(h: ReturnType<typeof harness>, writing: string[]) {
  for (const label of h.shown().actions.map((a) => a.label)) {
    if (writing.includes(label)) continue;
    await h.choose(label);
    // Secours : son propre écran, puis son retour.
    if (label.startsWith('Secours')) {
      assert.equal(h.shown().heading, 'Secours : accéder à Windows');
      assert.ok(h.rows().some((r) => /desactiver\.ps1/.test(r.detail ?? '')), 'le script de secours est nommé');
      if (loadSettingsRecord(h.dataDir)) assert.ok(h.rows().some((r) => /retablir-reglages\.ps1/.test(r.detail ?? '')), 'le secours des réglages est nommé');
      await h.choose('Retour');
      assert.equal(h.shown().heading, 'Borne dédiée');
    }
    await h.open();
  }
}

test('ouvrir l’écran, le parcourir, les entrées du menu : aucune écriture dans Windows', async () => {
  const h = harness();
  void h.menu.dedicatedItem.label;
  void h.menu.dedicatedItem.detail;
  void h.menu.explorerItem.detail;
  void h.menu.startupItem.label;
  void h.menu.startupItem.detail;
  await h.open();
  assert.equal(h.shown().heading, 'Borne dédiée');
  assert.match(h.shown().subheading ?? '', /Désactivée · compte « Borne » · Windows 11 IoT Enterprise LTSC/);
  assert.deepEqual(h.shown().actions.map((a) => a.label), ['Activer pour ce compte', 'Lancer au démarrage de Windows', 'Secours : accéder à Windows', 'Retour']);
  // La sélection d'office est sur « Retour » : rien ne demande l'autorisation de Windows par mégarde.
  assert.ok((h.at() ?? 0) >= h.shown().actions.length - 1);
  await tryEverythingElse(h, ['Activer pour ce compte', 'Lancer au démarrage de Windows']);
  h.menu.explorerItem.run();
  assert.deepEqual(h.writes, []);
  assert.deepEqual(h.settingsWrites, [], 'les réglages du compte sont seulement relevés');
  assert.deepEqual(h.state.settings, freshSettings());
  assert.equal(h.counts().desktop, 1, '« Ouvrir l’Explorateur Windows » passe par le mode bureau');
  assert.deepEqual(h.state.windows, freshWindows());
});

test('activer puis désactiver : une écriture chacune, à l’action choisie ; l’état d’avant revient, vérifié', async () => {
  const h = harness();
  await h.open();
  await h.choose('Activer pour ce compte');
  assert.deepEqual(h.writes.map((w) => w.kind), ['activate']);
  assert.match(h.rows()[0]!.text, /Activation enregistrée et vérifiée/);
  const record = loadDedicatedRecord(h.dataDir);
  assert.equal(record?.state, 'active');
  assert.equal(record?.sid, PROBE.sid);
  assert.equal(record?.setting.shell, 'D:\\CyberPinball\\app\\CyberPinball.exe --borne-dediee');
  // Script de secours, à lancer depuis un compte administrateur : la désactivation, telle quelle.
  const rescue = fs.readFileSync(rescueScriptFile(h.dataDir), 'utf8');
  assert.match(rescue, /#Requires -RunAsAdministrator/);
  assert.match(rescue, /\$Kind = 'deactivate'/);
  assert.match(rescue, /\$Sid = 'S-1-5-21-1-2-3-1001'/);
  assert.match(h.menu.dedicatedItem.label ?? '', /activée/);

  // Activée : l'écran dit ce que la désactivation remettra ; rien d'autre n'écrit.
  await h.open();
  assert.deepEqual(h.shown().actions.map((a) => a.label), ['Désactiver et rétablir le bureau', 'Secours : accéder à Windows', 'Retour']);
  assert.ok(h.rows().some((r) => r.text === 'Démarrage du compte « Borne »' && r.detail === 'avant : aucun réglage'));
  assert.ok(h.rows().some((r) => r.text === 'Démarrage des autres comptes' && r.detail === 'avant : cmd.exe'));
  await tryEverythingElse(h, ['Désactiver et rétablir le bureau']);
  assert.equal(h.writes.length, 1);

  await h.choose('Désactiver et rétablir le bureau');
  assert.deepEqual(h.writes.map((w) => w.kind), ['activate', 'deactivate']);
  assert.match(h.rows()[0]!.text, /Configuration précédente restaurée et vérifiée/);
  assert.ok(h.rows().filter((r) => r.badges?.includes('Vérifié')).length >= 4);
  assert.deepEqual(h.state.windows, freshWindows(), 'Windows exactement comme avant');
  assert.equal(loadDedicatedRecord(h.dataDir), undefined);
  assert.equal(fs.existsSync(rescueScriptFile(h.dataDir)), false);
});

test('script de secours lancé depuis un compte administrateur : l’activation est oubliée, après vérification', async () => {
  const h = harness();
  await h.open();
  await h.choose('Activer pour ce compte');
  const record = loadDedicatedRecord(h.dataDir)!;
  // Ce que fait le script de secours : la désactivation, son résultat à côté de lui.
  const { windows, outcome } = simulateRun(h.state.windows, { kind: 'deactivate', sid: record.sid, reference: record.reference });
  h.state.windows = windows;
  fs.writeFileSync(path.join(h.dataDir, 'borne-dediee', 'resultat-secours.json'), '﻿' + JSON.stringify(outcome));
  await h.open();
  assert.match(h.rows()[0]!.text, /Désactivée par le script de secours : état d’avant vérifié/);
  assert.equal(loadDedicatedRecord(h.dataDir), undefined);
  assert.deepEqual(h.shown().actions.map((a) => a.label), ['Activer pour ce compte', 'Lancer au démarrage de Windows', 'Secours : accéder à Windows', 'Retour']);
  assert.deepEqual(h.state.windows, freshWindows());
  assert.equal(h.writes.length, 1, 'l’application n’a rien écrit de plus');
});

test('autorisation refusée : rien n’a changé, et l’écran le dit', async () => {
  const h = harness();
  h.state.cancel = true;
  await h.open();
  await h.choose('Activer pour ce compte');
  assert.equal(h.writes.length, 1);
  assert.match(h.rows()[0]!.text, /Autorisation refusée.*rien n’a changé/);
  assert.equal(loadDedicatedRecord(h.dataDir), undefined);
  assert.deepEqual(h.state.windows, freshWindows());
});

test('sans administrateur de secours ou depuis les sources : remplacer le bureau reste visible, grisé avec sa raison, sans rien écrire', async () => {
  const cases: [Parameters<typeof harness>[0], RegExp, boolean][] = [
    [{ probe: { otherAdmins: [] } }, /Aucun autre compte administrateur que « Borne »/, true],
    [{ probe: { otherAdmins: [], editionId: 'Professional' } }, /Aucun autre compte administrateur que « Borne »/, true],
    [{ command: undefined }, /depuis ses sources/, false],
  ];
  for (const [options, reason, startupAllowed] of cases) {
    const h = harness(options);
    await h.open();
    assert.ok(h.rows().some((r) => reason.test(r.text)), String(reason));
    const replace = h.action('Remplacer le bureau pour ce compte');
    assert.match(replace.detail ?? '', /^Indisponible : /);
    assert.match(h.action('Lancer au démarrage de Windows').detail ?? '', startupAllowed ? /^(?!Indisponible)/ : /^Indisponible : /);
    await tryEverythingElse(h, startupAllowed ? ['Lancer au démarrage de Windows'] : []);
    assert.deepEqual(h.writes, []);
    assert.deepEqual(h.settingsWrites, []);
  }
  // Liste des administrateurs illisible : à vérifier, sans bloquer.
  const unknown = harness({ probe: { otherAdmins: undefined } });
  await unknown.open();
  assert.ok(unknown.rows().some((r) => r.badges?.includes('À vérifier')));
  assert.ok(unknown.shown().actions.some((a) => a.label === 'Activer pour ce compte'));
});

test('Windows demande un redémarrage : l’activation se termine ensuite, la désactivation remet tout', async () => {
  const h = harness({ windows: { ...freshWindows(), restartOnEnable: true } });
  await h.open();
  await h.choose('Activer pour ce compte');
  assert.equal(loadDedicatedRecord(h.dataDir)?.state, 'restart');
  await h.open();
  assert.deepEqual(h.shown().actions.map((a) => a.label), ['Terminer l’activation', 'Annuler et rétablir', 'Secours : accéder à Windows', 'Retour']);
  // Redémarrage simulé.
  h.state.windows = { ...h.state.windows, features: { 'Client-DeviceLockdown': 'Enabled', 'Client-EmbeddedShellLauncher': 'Enabled' }, wesl: true, restartOnEnable: false };
  await h.choose('Terminer l’activation');
  assert.equal(loadDedicatedRecord(h.dataDir)?.state, 'active');
  await h.open();
  await h.choose('Désactiver et rétablir le bureau');
  assert.deepEqual(h.state.windows, { ...freshWindows(), restartOnEnable: false });
});

test('session de la borne dédiée : « Ouvrir l’Explorateur » sur l’écran, sans écriture', async () => {
  const h = harness({ shellSession: true });
  await h.open();
  await h.choose('Activer pour ce compte');
  await h.open();
  assert.match(h.shown().subheading ?? '', /cette session démarre directement dans Cyber Pinball/);
  await h.choose('Ouvrir l’Explorateur');
  assert.equal(h.counts().desktop, 1);
  assert.equal(h.writes.length, 1);
});

// ---------------------------------------------------------------------------
// Sans Shell Launcher (Windows Pro, Famille) : réglages du compte, sauvegardés avant d'écrire

const PRO = { probe: { editionId: 'Professional' } };

test('Windows Pro : remplacer le bureau par le réglage du compte, sauvegardé, puis tout remis et vérifié', async () => {
  const start: SimulatedSettings = { values: { ...freshSettings().values, shell: 'C:\\Ancien\\menu.exe' } };
  const h = harness({ ...PRO, settings: start });
  await h.open();
  assert.ok(h.rows().some((r) => /Windows 11 Pro : sans Shell Launcher/.test(r.text)));
  assert.deepEqual(h.shown().actions.map((a) => a.label), ['Remplacer le bureau pour ce compte', 'Lancer au démarrage de Windows', 'Secours : accéder à Windows', 'Retour']);
  await h.choose('Remplacer le bureau pour ce compte');
  // Une écriture, élevée (stratégie du compte), et rien de Shell Launcher.
  assert.deepEqual(h.writes, []);
  assert.deepEqual(h.settingsWrites.map((w) => [Object.keys(w.run.want), w.elevate]), [[['shell'], true]]);
  assert.equal(h.state.settings.values.shell, `D:\\CyberPinball\\app\\CyberPinball.exe ${SUPERVISOR_FLAG}`);
  assert.match(h.rows()[0]!.text, /Sauvegarde prise, réglages écrits et vérifiés/);
  const record = loadSettingsRecord(h.dataDir)!;
  assert.deepEqual(record.reference, { shell: 'C:\\Ancien\\menu.exe' }, 'la sauvegarde : le shell d’avant');
  const rescue = fs.readFileSync(settingsRescueFile(h.dataDir), 'utf8');
  assert.match(rescue, /#Requires -RunAsAdministrator/);
  assert.match(rescue, /"shell":"C:\\\\Ancien\\\\menu\.exe"/);
  assert.equal(h.menu.dedicatedItem.label, 'Borne dédiée : activée');

  await h.open();
  assert.match(h.shown().subheading ?? '', /Bureau remplacé depuis le/);
  assert.ok(h.rows().some((r) => r.text === 'Interface utilisateur du compte « Borne »' && r.detail === 'avant : menu.exe · maintenant : CyberPinball.exe'));
  assert.deepEqual(h.shown().actions.map((a) => a.label), ['Désactiver et rétablir le bureau', 'Secours : accéder à Windows', 'Retour']);
  await tryEverythingElse(h, ['Désactiver et rétablir le bureau']);
  assert.equal(h.settingsWrites.length, 1);

  await h.choose('Désactiver et rétablir le bureau');
  assert.deepEqual(h.settingsWrites.map((w) => [w.run.want, w.elevate]), [[{ shell: `D:\\CyberPinball\\app\\CyberPinball.exe ${SUPERVISOR_FLAG}` }, true], [{ shell: 'C:\\Ancien\\menu.exe' }, true]]);
  assert.match(h.rows()[0]!.text, /Configuration précédente restaurée et vérifiée/);
  assert.ok(h.rows().some((r) => r.badges?.includes('Vérifié') && /menu\.exe, comme avant/.test(r.text)));
  assert.deepEqual(h.state.settings, start, 'Windows exactement comme avant');
  assert.equal(loadSettingsRecord(h.dataDir), undefined);
  assert.equal(fs.existsSync(settingsRescueFile(h.dataDir)), false);
});

test('lancer au démarrage : raccourci, fond noir et icônes masquées sans UAC ; « Ne plus lancer » remet tout', async () => {
  const h = harness({ ...PRO, otherFrontends: 'PinUP Popper' });
  await h.open();
  assert.ok(h.rows().some((r) => r.text === 'Autre menu installé : PinUP Popper' && r.tone === 'warning'));
  assert.equal(h.menu.startupItem.label, 'Lancement au démarrage : non');
  await h.choose('Lancer au démarrage de Windows');
  assert.deepEqual(h.settingsWrites.map((w) => w.elevate), [false]);
  assert.deepEqual(h.state.settings.values, { shell: null, startup: 'D:\\CyberPinball\\app\\CyberPinball.exe', wallpaper: '', background: '0 0 0', icons: 1 });
  assert.equal(h.menu.startupItem.label, 'Lancement au démarrage : oui');
  // Le fond était déjà noir : la sauvegarde le garde tel quel, rien n'est réécrit.
  assert.deepEqual(loadSettingsRecord(h.dataDir)?.reference, { startup: null, wallpaper: freshSettings().values.wallpaper, background: '0 0 0', icons: null });
  await h.open();
  assert.match(h.shown().subheading ?? '', /Lancement au démarrage depuis le/);
  await h.choose('Ne plus lancer au démarrage');
  assert.deepEqual(h.settingsWrites.map((w) => w.elevate), [false, false]);
  assert.deepEqual(h.state.settings, freshSettings());
  assert.equal(h.menu.startupItem.label, 'Lancement au démarrage : non');
});

test('raccourci posé par l’installeur : signalé, retiré à la demande, vérifié', async () => {
  const h = harness({ settings: { values: { ...freshSettings().values, startup: 'D:\\CyberPinball\\app\\CyberPinball.exe' } } });
  fs.writeFileSync(path.join(h.startupDir, 'Cyber Pinball.lnk'), '');
  assert.equal(h.menu.startupItem.label, 'Lancement au démarrage : oui');
  await h.open();
  assert.ok(h.rows().some((r) => r.text === 'Cyber Pinball se lance déjà au démarrage de Windows'));
  await h.choose('Retirer le lancement au démarrage');
  assert.deepEqual(h.settingsWrites.map((w) => [w.run.want, w.elevate]), [[{ startup: null }, false]]);
  assert.equal(h.state.settings.values.startup, null);
  assert.match(h.rows()[0]!.text, /ne se lance plus au démarrage/);
});

test('autorisation refusée pour le réglage du compte : rien n’a changé, et l’écran le dit', async () => {
  const h = harness(PRO);
  h.state.cancel = true;
  await h.open();
  await h.choose('Remplacer le bureau pour ce compte');
  assert.match(h.rows()[0]!.text, /Autorisation refusée.*rien n’a changé/);
  assert.equal(loadSettingsRecord(h.dataDir), undefined);
  assert.deepEqual(h.state.settings, freshSettings());
});

test('Windows a ignoré le réglage, ou le surveillant a rendu la main : l’écran le dit après le redémarrage', async () => {
  const h = harness(PRO);
  await h.open();
  await h.choose('Remplacer le bureau pour ce compte');
  // Le constat de l'activation s'efface en quittant l'écran.
  await h.choose('Retour');
  await h.open();
  assert.ok(h.rows().some((r) => r.text === 'Cette session a démarré avec le bureau Windows'), 'pas encore redémarré : rien d’anormal');
  // Le PC a redémarré depuis, et la session s'est ouverte avec le bureau.
  h.state.bootTime = Date.parse('2026-10-27T08:00:00Z');
  await h.open();
  assert.ok(h.rows().some((r) => /Windows n’a pas appliqué le réglage/.test(r.text) && r.tone === 'error'));
  // Le surveillant est bien parti, puis a ouvert l'Explorateur : Cyber Pinball plantait en boucle.
  fs.writeFileSync(supervisorMarkerFile(h.dataDir), JSON.stringify({ at: '2026-10-27T08:00:30Z' }));
  await h.open();
  assert.ok(h.rows().some((r) => /Le surveillant a rendu la main/.test(r.text)));
});

test('script de secours des réglages lancé hors de Cyber Pinball : l’installation est oubliée, après vérification', async () => {
  const h = harness(PRO);
  await h.open();
  await h.choose('Lancer au démarrage de Windows');
  const record = loadSettingsRecord(h.dataDir)!;
  const { windows, outcome } = simulateSettingsRun(h.state.settings, { sid: record.sid, startupDir: record.startupDir, want: record.reference });
  h.state.settings = windows;
  fs.writeFileSync(path.join(h.dataDir, 'borne-dediee', 'resultat-retablir.json'), JSON.stringify(outcome));
  await h.open();
  assert.match(h.rows()[0]!.text, /Désactivée par le script de secours : état d’avant vérifié/);
  assert.equal(loadSettingsRecord(h.dataDir), undefined);
  assert.equal(h.settingsWrites.length, 1, 'l’application n’a rien écrit de plus');
});

// ---------------------------------------------------------------------------
// Les sources : où peut partir une écriture dans Windows

const SOURCE_DIRS = ['app/src', 'packages/core/src', 'packages/win-displays/src', 'packages/installer/src'];

function sources(): { file: string; text: string }[] {
  return SOURCE_DIRS.flatMap((dir) =>
    fs
      .readdirSync(path.join(REPO_ROOT, dir))
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))
      .map((f) => ({ file: `${dir}/${f}`, text: fs.readFileSync(path.join(REPO_ROOT, dir, f), 'utf8') })),
  );
}

function filesMatching(pattern: RegExp): string[] {
  return sources()
    .filter((s) => pattern.test(s.text))
    .map((s) => s.file)
    .sort();
}

test('les écritures de la borne dédiée ne partent que de « Activer » et « Désactiver »', () => {
  // Shell Launcher, fonctions facultatives, Winlogon : seulement dans le script du cœur.
  assert.deepEqual(filesMatching(/SetCustomShell|SetEnabled\(|Enable-WindowsOptionalFeature|Disable-WindowsOptionalFeature|WESL_UserSetting|Winlogon'/), ['packages/core/src/dedicated.ts']);
  // L'élévation de Windows : seulement l'exécuteur, et la règle du pare-feu du réseau des bornes
  // (firewall-rule.ts), posée seulement par une action de l'écran « Partage et réseau » (firewall.test.ts).
  assert.deepEqual(filesMatching(/-Verb RunAs|\brunas\b/i), ['app/src/dedicated-system.ts', 'app/src/firewall-rule.ts']);
  // L'exécuteur n'est appelé que par l'écran, et l'écran ne l'appelle que dans activate() et deactivate().
  assert.deepEqual(filesMatching(/runElevated\(/), ['app/src/dedicated-menu.ts', 'app/src/dedicated-system.ts']);
  const menu = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'dedicated-menu.ts'), 'utf8');
  const functions = [...menu.matchAll(/\n  (?:async )?function (\w+)\(/g)].map((m) => ({ name: m[1]!, at: m.index! }));
  const owners = [...menu.matchAll(/runElevated\(/g)].map((m) => functions.filter((f) => f.at < m.index!).at(-1)?.name);
  assert.deepEqual(owners, ['activate', 'deactivate']);
  // activate() et deactivate() ne sont lancées que par une action de l'écran.
  for (const call of menu.matchAll(/\b(activate|deactivate)\(([^)]*)\)/g)) {
    const line = menu.slice(menu.lastIndexOf('\n', call.index!) + 1, menu.indexOf('\n', call.index!));
    if (/function (activate|deactivate)\(/.test(line) || /^\s*(\/\/|\*|\/\*)/.test(line)) continue;
    assert.match(line, /run: \(\) => (activate|deactivate)\(/, `appel hors d’une action : ${line.trim()}`);
  }
  // Réglages du compte : l'exécuteur n'est appelé que par l'écran ; un relevé (want vide) dans
  // readProbe, une écriture seulement dans install(), uninstall() et removeStartup().
  assert.deepEqual(filesMatching(/runSettings\(/), ['app/src/dedicated-menu.ts', 'app/src/dedicated-system.ts']);
  const settingsOwners = [...menu.matchAll(/runSettings\(/g)].map((m) => functions.filter((f) => f.at < m.index!).at(-1)?.name);
  assert.deepEqual(settingsOwners, ['readProbe', 'install', 'uninstall', 'removeStartup']);
  assert.match(menu, /runSettings\(\{ sid: probe\.sid, startupDir: host\.system\.startupDir\(\), want: \{\} \}, false\)/, 'le relevé n’écrit rien');
  for (const call of menu.matchAll(/\b(install|uninstall|removeStartup)\(([^)]*)\)/g)) {
    const line = menu.slice(menu.lastIndexOf('\n', call.index!) + 1, menu.indexOf('\n', call.index!));
    if (/function (install|uninstall|removeStartup)\(/.test(line) || /^\s*(\/\/|\*|\/\*)/.test(line)) continue;
    assert.match(line, /run: \(\) => (install|uninstall|removeStartup)\(/, `appel hors d’une action : ${line.trim()}`);
  }
  // Le registre du compte et le dossier Démarrage : seulement dans le script du cœur.
  assert.deepEqual(filesMatching(/Policies\\\\System|HideIcons|WScript\.Shell/), ['packages/core/src/windowssettings.ts']);
  // Essais hors écran et bacs à sable : toujours le Windows simulé.
  const system = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'dedicated-system.ts'), 'utf8');
  assert.match(system, /if \(simulation \|\| OFFSCREEN \|\| process\.env\.CYBERPINBALL_HOME\) return simulatedSystem\(/);
});
