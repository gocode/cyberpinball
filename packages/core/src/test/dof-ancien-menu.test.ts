// « LED et retours (DOF) » sur une borne venue de PinUP Popper (cas réel du 18/11/2026) : le dossier
// que lit le plugin DOF de VPX est vide, la configuration du configtool est restée dans
// C:\DirectOutput\Config. L'écran le dit, et un appui la met en place, sans avertissement IniFilesPath.
// Menu chargé depuis app/dist, hôte simulé : rien n'est lu sur les vrais disques.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { setLanguage } from '../i18n';
import type { ObservedUsbDevice } from '../model';
import { REPO_ROOT } from './i18n-scan';

interface Row {
  text: string;
}
interface Action {
  label: string;
  run(): void;
}
interface Built {
  sections: { title?: string; rows: Row[] }[];
  actions: Action[];
}

const { createDofMenu } = require(path.join(REPO_ROOT, 'app', 'dist', 'dof-menu.js')) as {
  createDofMenu(host: object): { build(): Built };
};

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('LED et retours (DOF) : l’ancienne configuration de Popper est montrée, puis reprise d’un appui', async () => {
  setLanguage('fr');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-dof-ancien-'));
  const drive = path.join(root, 'C');
  const oldConfig = path.join(drive, 'DirectOutput', 'Config');
  fs.mkdirSync(oldConfig, { recursive: true });
  fs.writeFileSync(path.join(oldConfig, 'directoutputconfig51.ini'), ['[Config DOF]', 'afm_113b,S11 Red,0,0'].join('\r\n'));
  fs.writeFileSync(path.join(oldConfig, 'tablemappings.xml'), '<TableMappings/>');
  fs.writeFileSync(path.join(oldConfig, 'GlobalConfig_B2SServer.xml'), '<GlobalConfig><IniFilesPath>{InstallDir}\\config</IniFilesPath></GlobalConfig>');
  const vpxDir = path.join(root, 'AppData', 'VPinballX', '10.8', 'directoutputconfig');
  const kl25z: ObservedUsbDevice[] = [{ instanceId: 'USB\\VID_1209&PID_EAEA\\1', vid: 0x1209, pid: 0xeaea }];

  let page: (() => Built) | undefined;
  const notices: { heading: string; lines: string[] }[] = [];
  const menu = createDofMenu({
    library: {
      openCustom: (build: () => Built) => (page = build),
      openSystem: () => undefined,
      openPrompt: () => undefined,
      openNotice: (heading: string, lines: string[], then?: () => void) => {
        notices.push({ heading, lines });
        then?.();
      },
      pick: async () => undefined,
      task: async (_message: string, work: () => Promise<void> | void) => {
        await work();
      },
    },
    dir: () => vpxDir,
    workDir: () => undefined,
    legacyInstalls: () => [path.join(drive, 'DirectOutput')],
    usb: () => kl25z,
    hidNames: () => [],
    backupDir: () => path.join(root, 'sauvegardes'),
    stagingDir: () => path.join(root, 'tmp'),
    unpack: async () => false,
    changed: () => undefined,
  });

  const before = menu.build();
  assert.equal(before.actions[0]!.label, 'Reprendre la configuration de l’ancien DOF');
  const warnings = before.sections.find((s) => s.title === 'À vérifier')!.rows.map((r) => r.text);
  assert.equal(warnings.length, 1, warnings.join(' | '));
  assert.ok(warnings[0]!.includes(oldConfig) && warnings[0]!.includes('directoutputconfig51.ini'), warnings[0]);

  before.actions[0]!.run();
  for (let i = 0; i < 5; i++) await tick();
  assert.equal(notices[0]?.heading, 'Configuration de l’ancien DOF reprise', JSON.stringify(notices));
  assert.deepEqual(fs.readdirSync(vpxDir).sort(), ['directoutputconfig51.ini', 'tablemappings.xml'], 'ni GlobalConfig ni Cabinet.xml');

  const after = (page ?? menu.build)();
  assert.notEqual(after.actions[0]!.label, 'Reprendre la configuration de l’ancien DOF');
  assert.equal(after.sections.find((s) => s.title === 'À vérifier'), undefined, 'plus rien à vérifier, aucun avertissement IniFilesPath');
  assert.ok(after.sections.some((s) => s.rows.some((r) => r.text === 'Rien n’empêche DOF d’allumer la borne')));
});
