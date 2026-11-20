// File des fiches de sites (app/src/media-sites.ts, compilé) : sans téléchargement direct, la page
// affichée garde le média. Le 20/11/2026, le fronton de « Back to the Future Pinball » (VPForums)
// arrivait dans les téléchargements généraux, jamais rangé : la table restait sans fronton.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import type { SiteHit, SiteReceipt } from '..';
import { REPO_ROOT } from './i18n-scan';

interface Claim {
  dir: string;
  progress?(p: { received: number }): void;
  done(r: { file: string; filename: string; urls: string[] } | { error: 'cancelled' | 'interrupted' }): void;
}

interface Job {
  state: string;
  error?: string;
  login?: boolean;
}

interface AppSites {
  enqueue(hit: SiteHit, type: string): Job;
  job(key: string): Job | undefined;
  receipt(key: string): SiteReceipt | undefined;
}

const HIT: SiteHit = {
  site: 'vpforums',
  id: '14652',
  url: 'https://www.vpforums.org/index.php?app=downloads&showfile=14652',
  title: 'Back to the Future Pinball',
  vps: { game: 'bttf', types: ['Backglass'], kind: 'image', pack: false },
};
const KEY = 'vpforums:14652';

/** Fausse fenêtre « Récupérer » : connecté au site, téléchargement direct refusé comme on le dit. */
function sitesWith(direct: { ok: false; reason: string; login?: boolean }) {
  const { createMediaSites } = require(path.join(REPO_ROOT, 'app', 'dist', 'media-sites.js')) as { createMediaSites(ctx: object): AppSites };
  const downloads = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-sites-repli-'));
  const page = { open: true, claim: undefined as Claim | undefined, status: '' };
  const shown: { url: string; claim?: Claim }[] = [];
  const acquirer = {
    siteCookies: async () => [{ name: 'member_id', value: '42' }, { name: 'ips4_member_id', value: '42' }],
    show: (r: { url: string; claim?: Claim }) => shown.push(r),
    direct: async () => direct,
    adopt: (url: string, claim: Claim, status: string) => {
      if (!page.open || url !== HIT.url) return false;
      Object.assign(page, { claim, status });
      return true;
    },
    isOpen: () => page.open,
    resumable: () => false,
  };
  const sites = createMediaSites({ acquirer, downloadsDir: () => downloads, changed: () => undefined });
  return { sites, page, shown };
}

const until = async (what: string, ok: () => boolean, ms = 10_000) => {
  const end = Date.now() + ms;
  while (!ok() && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
  assert.ok(ok(), `attendu en vain : ${what}`);
};

test('fiche sans téléchargement direct : la page affichée rend le fichier au média, pas aux téléchargements généraux', async () => {
  const { sites, page } = sitesWith({ ok: false, reason: 'un clic est demandé sur la page' });
  sites.enqueue(HIT, 'Backglass');
  await until('la page affichée chargée du média', () => page.claim !== undefined);
  assert.match(page.status, /un clic est demandé sur la page/);
  assert.equal(sites.job(KEY)?.state, 'downloading', 'en attente du fichier, pas en échec');
  // L'utilisateur télécharge depuis la page : le fichier arrive dans le dossier du média.
  const file = path.join(page.claim!.dir, 'BackToTheFuture.png');
  fs.mkdirSync(page.claim!.dir, { recursive: true });
  fs.writeFileSync(file, 'PNG');
  page.claim!.progress?.({ received: 3 });
  page.claim!.done({ file, filename: 'BackToTheFuture.png', urls: [HIT.url] });
  await until('le reçu', () => sites.job(KEY)?.state === 'received');
  assert.deepEqual(sites.receipt(KEY)?.files.map((f) => [path.basename(f.file), f.type]), [['BackToTheFuture.png', 'Backglass']]);
});

test('fiche sans téléchargement direct : page fermée sans rien télécharger, échec dit (la file passe au suivant)', async () => {
  const { sites, page } = sitesWith({ ok: false, reason: 'un clic est demandé sur la page' });
  sites.enqueue(HIT, 'Backglass');
  await until('la page affichée chargée du média', () => page.claim !== undefined);
  page.open = false;
  await until('l’échec', () => sites.job(KEY)?.state === 'failed');
  assert.match(sites.job(KEY)!.error!, /page fermée/);
});

test('fiche sans téléchargement direct, fenêtre déjà fermée : rouverte sur la fiche, chargée du média', async () => {
  const { sites, page, shown } = sitesWith({ ok: false, reason: 'un clic est demandé sur la page' });
  page.open = false;
  sites.enqueue(HIT, 'Backglass');
  await until('la page rouverte', () => shown.some((r) => r.claim));
  assert.equal(shown.find((r) => r.claim)!.url, HIT.url);
});

test('connexion perdue : échec dit tout de suite, la page n’attend rien', async () => {
  const { sites, page } = sitesWith({ ok: false, reason: 'vous n’êtes plus connecté', login: true });
  sites.enqueue(HIT, 'Backglass');
  await until('l’échec', () => sites.job(KEY)?.state === 'failed');
  assert.equal(sites.job(KEY)!.login, true);
  assert.equal(page.claim, undefined);
});
