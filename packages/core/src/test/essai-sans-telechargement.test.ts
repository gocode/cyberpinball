// Essais sans opérateur (CYBERPINBALL_AUTOPILOT) : jamais de vrai téléchargement de VPX. Le
// 12/11/2026, un Start rejoué par la démonstration de la communauté est tombé sur « VPX n'est pas
// installé » et a lancé le téléchargement (app/src/install-vpx.ts) ; le garde-fou le refuse avant
// tout accès au réseau, sauf si l'essai le demande (CYBERPINBALL_TELECHARGER_VPX=1).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';

/* eslint-disable @typescript-eslint/no-require-imports */
const { installVpx } = require(path.join(REPO_ROOT, 'app', 'dist', 'install-vpx.js')) as { installVpx(root: string, onProgress: () => void): Promise<string> };
/* eslint-enable @typescript-eslint/no-require-imports */

test('pendant un essai sans opérateur, l’installation de VPX ne télécharge rien', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-sans-vpx-'));
  const before = { auto: process.env.CYBERPINBALL_AUTOPILOT, allow: process.env.CYBERPINBALL_TELECHARGER_VPX };
  const log = console.log;
  console.log = () => undefined;
  try {
    process.env.CYBERPINBALL_AUTOPILOT = 'wait:1';
    delete process.env.CYBERPINBALL_TELECHARGER_VPX;
    await assert.rejects(installVpx(root, () => undefined), /VPX/);
    assert.equal(fs.existsSync(path.join(root, 'downloads')), false, 'aucun dossier de téléchargement créé');
  } finally {
    console.log = log;
    if (before.auto === undefined) delete process.env.CYBERPINBALL_AUTOPILOT;
    else process.env.CYBERPINBALL_AUTOPILOT = before.auto;
    if (before.allow !== undefined) process.env.CYBERPINBALL_TELECHARGER_VPX = before.allow;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
