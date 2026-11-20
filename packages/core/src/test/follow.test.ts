// « Nous suivre » (follow.ts, app/src/follow-menu.ts) : l'ordre voulu (Facebook, YouTube, GitHub), la
// page Facebook selon la langue de l'interface, la page de la borne (QR code de la ligne choisie,
// Start dans le navigateur intégré, le QR en grand sans lui), le lien envoyé au téléphone (https
// seulement) et la ligne discrète des écrans d'aide.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { FOLLOW_URLS, followLinks, shortFollowUrl, type FollowLink } from '../follow';
import { setLanguage } from '../i18n';
import { remoteEntries } from '../remote-menus';
import { REPO_ROOT } from './i18n-scan';

test('nous suivre : Facebook, YouTube, GitHub dans cet ordre ; la page Facebook suit la langue', () => {
  setLanguage('fr');
  const fr = followLinks('fr');
  assert.deepEqual(
    fr.map((l) => l.network),
    ['facebook', 'youtube', 'github'],
  );
  assert.equal(fr[0]!.url, 'https://www.facebook.com/cyberpinball.fr');
  assert.equal(followLinks('en')[0]!.url, 'https://www.facebook.com/cyberpinball');
  // Une seule adresse YouTube et GitHub pour toutes les langues.
  assert.equal(fr[1]!.url, followLinks('en')[1]!.url);
  for (const l of [...fr, ...followLinks('en')]) {
    assert.match(l.url, /^https:\/\//);
    assert.equal(l.short, shortFollowUrl(l.url));
  }
  assert.equal(shortFollowUrl(FOLLOW_URLS.youtube), 'youtube.com/@cyberpinball');
  // Une icône différente par réseau (deux actions d'un écran n'ont jamais la même).
  assert.equal(new Set(fr.map((l) => l.icon)).size, fr.length);
  setLanguage('en');
  assert.equal(followLinks()[1]!.purpose, 'Step-by-step video tutorials');
  assert.equal(followLinks()[0]!.url, FOLLOW_URLS.facebook.other, 'la langue de l’interface choisit la page');
  setLanguage('fr');
});

test('nous suivre : le téléphone ne reçoit qu’un lien https', () => {
  const entries = remoteEntries({
    kind: 'screen',
    title: 'Nous suivre',
    current: 0,
    items: [
      { label: 'Facebook', link: 'https://www.facebook.com/cyberpinball.fr' },
      { label: 'Ailleurs', link: 'http://exemple.test/' },
      { label: 'Script', link: 'javascript:alert(1)' },
      { label: 'Guillemet', link: 'https://exemple.test/"><script>' },
    ],
  });
  assert.deepEqual(
    entries.items.map((i) => i.link),
    ['https://www.facebook.com/cyberpinball.fr', undefined, undefined, undefined],
  );
});

test('nous suivre : la page de la borne, son QR code, Start au navigateur intégré, le QR en grand sans lui', () => {
  setLanguage('fr');
  type Action = { label: string; detail?: string; tone?: string; link?: string; qr?: { url: string; title: string }; run(): void };
  type Built = { heading: string; actions: Action[]; remote?: { url: string } };
  const { createFollowMenu } = require(path.join(REPO_ROOT, 'app', 'dist', 'follow-menu.js')) as {
    createFollowMenu(host: unknown): { open(back: () => void): void; action(back: () => void): Action };
  };
  let shown: Built | undefined;
  const browsed: FollowLink[] = [];
  let guest = false;
  const menu = createFollowMenu({
    library: { openCustom: (build: () => Built) => void (shown = build()), openSystem: () => {} },
    browse: (link: FollowLink) => (guest ? false : (browsed.push(link), true)),
  });
  // La ligne discrète d'un écran d'aide : grisée, elle nomme les réseaux et ouvre la page.
  const line = menu.action(() => {});
  assert.equal(line.label, 'Nous suivre');
  assert.equal(line.tone, 'quiet');
  assert.equal(line.detail, 'Facebook · YouTube · GitHub');
  line.run();
  const page = shown!;
  assert.equal(page.heading, 'Nous suivre');
  const links = page.actions.filter((a) => a.qr);
  assert.deepEqual(
    links.map((a) => a.label),
    ['Facebook', 'YouTube', 'GitHub'],
  );
  // Chaque ligne : son QR code (borne) et son lien (téléphone), la même adresse.
  for (const a of links) assert.equal(a.qr!.url, a.link);
  assert.equal(links[0]!.link, 'https://www.facebook.com/cyberpinball.fr');
  links[1]!.run();
  assert.equal(shown, page, 'Start ouvre le navigateur intégré, sans écran intermédiaire');
  assert.equal(browsed[0]!.network, 'youtube');
  // Invité (navigateur fermé) : le QR code en grand.
  guest = true;
  links[0]!.run();
  assert.notEqual(shown, page);
  assert.equal(shown!.remote?.url, 'https://www.facebook.com/cyberpinball.fr');
});

test('nous suivre : branché aux écrans d’aide, au menu ⋮ du téléphone et à la sortie de l’assistant', () => {
  const read = (...p: string[]) => fs.readFileSync(path.join(REPO_ROOT, ...p), 'utf8');
  const feedback = read('app', 'src', 'feedback-menu.ts');
  // Retours et propositions, puis les deux écrans de confirmation d'envoi.
  assert.equal(feedback.match(/ctx\.follow\(/g)?.length, 3);
  const library = read('app', 'src', 'library.ts');
  assert.match(library, /follow: \(back\) => follow\.action\(back\)/);
  assert.match(library, /actions\.push\(follow\.action\(\(\) => go\(s\)\)\)/, 'le diagnostic d’une table');
  // Le téléphone : la liste vient de la borne, avec le catalogue (une seule source d'adresses).
  assert.match(read('app', 'src', 'phone-remote.ts'), /window\.cyberFollow = /);
  const phone = read('app', 'renderer', 'telephone', 'telephone.js');
  assert.match(phone, /id: 'follow', label: t\('Nous suivre'\)/);
  assert.match(phone, /b\.rel = 'noopener noreferrer'/);
  assert.match(read('app', 'src', 'wizard.ts'), /help: quitHelp\(\)/);
  // Aucune adresse des réseaux écrite ailleurs que dans follow.ts (hors README et tests).
  for (const file of ['app/src/follow-menu.ts', 'app/src/library.ts', 'app/src/wizard.ts', 'app/renderer/telephone/telephone.js', 'app/src/phone-remote.ts']) {
    assert.doesNotMatch(read(file), /facebook\.com|youtube\.com\/@/, file);
  }
});
