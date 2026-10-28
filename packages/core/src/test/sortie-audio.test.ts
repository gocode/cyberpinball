// Tout le son de Cyber Pinball sort par la sortie audio de la borne (octobre 2026 : sur le
// PinCab, la musique de la roue et le lancement sonnaient, mais les sons proposés dans
// « Médias du jeu » restaient muets : ils partaient sur la sortie par défaut de Windows,
// que rien ne relie aux haut-parleurs de la borne). La sortie est celle du menu
// (menuAudioOutput, menu-audio.js) ; chaque élément qui joue y est envoyé (setSinkId),
// qu'il vienne du menu, de la bibliothèque ou d'une page web de la fenêtre « Récupérer ».
//
// Invariant fixé ici : un script du rendu qui crée un son l'envoie sur cette sortie, et
// une vue de page web d'Electron est muette ou routée ; le rendu réel de la bibliothèque
// et le script des pages web sont essayés avec de fausses sorties.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import * as vm from 'node:vm';
import { audioSinkScript } from '../audiosink';
import { APP, menuRenderer } from './menu-renderer';

const FRONTON = 'Haut-parleurs (Realtek(R) Audio)';
const DEVICES = [
  { kind: 'audiooutput', deviceId: 'default', label: 'Par défaut - Haut-parleurs (HDMI)' },
  { kind: 'audiooutput', deviceId: 'hdmi-id', label: 'Haut-parleurs (HDMI)' },
  { kind: 'audiooutput', deviceId: 'fronton-id', label: FRONTON },
  { kind: 'audioinput', deviceId: 'micro-id', label: 'Microphone' },
];

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

// ---------------------------------------------------------------------------
// Invariant, lu dans les sources

/** Ce qui crée un son dans une page : élément, constructeur ou balise. */
const MAKES_SOUND = [/new Audio\(/, /new (?:webkit)?AudioContext\(/, /createElement\(\s*['"](?:audio|video)['"]/, /\?\s*['"](?:audio|video)['"]\s*:/, /<(?:audio|video)\b/];
/** Ce qui l'envoie sur la sortie de la borne. */
const ROUTES = [/\.setSinkId\(/, /CyberMenuAudio\?\.route\?\.\(/];

test('invariant : un script du rendu qui crée un son l’envoie sur la sortie de la borne', () => {
  const dir = path.join(APP, 'renderer');
  const files = fs.readdirSync(dir).filter((f) => /\.(js|html)$/.test(f));
  const makers: string[] = [];
  for (const file of files) {
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    if (!MAKES_SOUND.some((re) => re.test(text))) continue;
    makers.push(file);
    assert.ok(ROUTES.some((re) => re.test(text)), `${file} crée un son sans le router (setSinkId, ou CyberMenuAudio.route) : il partirait sur la sortie par défaut de Windows`);
  }
  // Le contrôle voit bien les lecteurs connus (un motif cassé ne laisserait rien passer).
  for (const known of ['library.js', 'media.js', 'menu-audio.js', 'ui-sounds.js']) assert.ok(makers.includes(known), `${known} reconnu comme source de son`);
});

test('invariant : une vue de page web d’Electron est muette ou routée vers la sortie de la borne', () => {
  const dir = path.join(APP, 'src');
  let views = 0;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    if (!/new WebContentsView\(/.test(text)) continue;
    views++;
    assert.ok(/setAudioMuted\(true\)|audioSinkScript\(/.test(text), `${file} ouvre une page web dont le son partirait sur la sortie par défaut de Windows`);
  }
  assert.ok(views >= 2, 'vues de « Récupérer » et de la conversion trouvées');
  // La vue visible de « Récupérer » (YouTube…) : routée dans chaque cadre chargé.
  assert.match(fs.readFileSync(path.join(dir, 'acquire-window.ts'), 'utf8'), /did-frame-finish-load[\s\S]{0,300}audioSinkScript\(/);
});

// ---------------------------------------------------------------------------
// Rendu réel du menu : menu-audio.js et library.js

function soundPage() {
  const page = menuRenderer({ navigator: { mediaDevices: { enumerateDevices: async () => DEVICES } }, Audio: function Audio() {} }, { menuAudio: true });
  const { document } = page;
  const played: unknown[] = [];
  for (const tag of ['audio', 'video']) {
    const proto = Object.getPrototypeOf(document.createElement(tag));
    Object.assign(proto, {
      setSinkId(this: { sinkId?: string }, id: string) {
        this.sinkId = id;
        return Promise.resolve();
      },
      play(this: { paused?: boolean }) {
        this.paused = false;
        played.push(this);
        return Promise.resolve();
      },
      pause(this: { paused?: boolean }) {
        this.paused = true;
      },
      load() {},
    });
    Object.defineProperty(proto, 'paused', { configurable: true, writable: true, value: true });
    Object.defineProperty(proto, 'sinkId', { configurable: true, writable: true, value: '' });
  }
  return { ...page, played };
}

/** Écran « Médias du jeu » d'une table, sa carte de musique proposée choisie (elle s'écoute). */
function mediaScreen(output: string | undefined) {
  return {
    role: 'playfield',
    phase: 'library',
    help: false,
    count: 1,
    position: 1,
    neighbors: [],
    footer: [],
    gameKeys: [],
    menuKeys: [],
    nav: {},
    sound: { video: 0, output },
    library: {
      screen: 'custom',
      heading: 'Médias du jeu',
      icon: 'image',
      back: 'Retour',
      sections: [],
      cursor: 0,
      actions: [{ label: 'Garder cette musique' }, { label: 'Retour', icon: 'back' }],
      media: { cards: [{ action: 0, title: 'Musique', thumb: { kind: 'audio', url: 'cyber-media://fichier/D%3A%5CT%5CNeon%5Cmedias%5C(Audio)%20Neon.mp3', rotation: 0 } }] },
    },
  };
}

test('bibliothèque : le son proposé dans « Médias du jeu » joue sur la sortie de la borne', async () => {
  const page = soundPage();
  // La sortie est connue avant que l'écran s'ouvre : l'élément y est envoyé dès sa création.
  page.send({ ...mediaScreen(FRONTON), library: { ...mediaScreen(FRONTON).library, media: { cards: [] } } });
  await settle();
  assert.equal((page.window.CyberMenuAudio as { status(): { sortie: string } }).status().sortie, FRONTON);
  page.send(mediaScreen(FRONTON));
  const audio = page.document.querySelector('.media-card audio') as unknown as { sinkId: string } | null;
  assert.ok(audio, 'la carte du son porte son lecteur');
  assert.equal(audio.sinkId, 'fronton-id', 'sur la sortie du fronton, pas sur celle de Windows');
  assert.ok(page.played.includes(audio), 'la carte choisie s’écoute');
});

test('bibliothèque : sortie trouvée après l’ouverture de l’écran, le son déjà affiché la rejoint', async () => {
  const page = soundPage();
  page.send(mediaScreen(FRONTON));
  const audio = page.document.querySelector('.media-card audio') as unknown as { sinkId: string };
  await settle();
  assert.equal(audio.sinkId, 'fronton-id');
});

test('bibliothèque : sans sortie affectée par l’assistant, la sortie par défaut de Windows', async () => {
  const page = soundPage();
  page.send(mediaScreen(undefined));
  await settle();
  const audio = page.document.querySelector('.media-card audio') as unknown as { sinkId: string };
  assert.equal(audio.sinkId, '');
});

// ---------------------------------------------------------------------------
// Pages web de « Récupérer » : audioSinkScript

function webPage(devices: unknown[] = DEVICES) {
  const listeners: ((e: { target: unknown }) => void)[] = [];
  const media = (tag: string) => ({
    tagName: tag.toUpperCase(),
    sinkId: '',
    setSinkId(id: string) {
      this.sinkId = id;
      return Promise.resolve();
    },
  });
  const elements = [media('video')];
  const document = {
    querySelectorAll: () => elements,
    addEventListener: (type: string, f: (e: { target: unknown }) => void, capture: boolean) => {
      assert.equal(type, 'play');
      assert.equal(capture, true, 'en capture : play ne remonte pas');
      listeners.push(f);
    },
  };
  const ctx: Record<string, unknown> = { document, navigator: { mediaDevices: { enumerateDevices: async () => devices } } };
  ctx.window = ctx;
  vm.createContext(ctx);
  const run = (name: string) => vm.runInContext(audioSinkScript(name), ctx) as Promise<string> | string;
  return { run, elements, listeners, media };
}

test('pages web : la vidéo de la page et celles qui jouent ensuite vont sur la sortie de la borne', async () => {
  const p = webPage();
  // Chromium suffixe le nom des périphériques USB de « (vid:pid) ».
  const usb = webPage([{ kind: 'audiooutput', deviceId: 'usb-id', label: 'Haut-parleurs (USB Audio Device) (0711:5640)' }]);
  assert.equal(await usb.run('Haut-parleurs (USB Audio Device)'), 'usb-id');

  assert.equal(await p.run(FRONTON), 'fronton-id');
  assert.equal(p.elements[0]!.sinkId, 'fronton-id', 'élément déjà dans la page');
  const later = p.media('audio');
  p.listeners.forEach((f) => f({ target: later }));
  assert.equal(later.sinkId, 'fronton-id', 'élément qui se met à jouer ensuite');
  // Rejoué à chaque cadre chargé : un seul écouteur par document.
  await p.run(FRONTON);
  assert.equal(p.listeners.length, 1);
});

test('pages web : sortie introuvable ou sorties illisibles, la page garde la sortie par défaut', async () => {
  const p = webPage();
  assert.equal(await p.run('Haut-parleurs (débranchés)'), '');
  assert.equal(p.elements[0]!.sinkId, '');
  const ctx ={ document: { querySelectorAll: () => [], addEventListener() {} }, navigator: { mediaDevices: { enumerateDevices: () => Promise.reject(new Error('refusé')) } } } as Record<string, unknown>;
  ctx.window = ctx;
  vm.createContext(ctx);
  assert.equal(await vm.runInContext(audioSinkScript(FRONTON), ctx), '');
  // Nom piégé : une chaîne, jamais du code.
  assert.equal(await webPage().run("'); throw new Error('x'); ('"), '');
});
