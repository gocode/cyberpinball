// Bac à sable de docs/demo-moments.ps1 : des tables et leurs médias générés ici, pour
// voir et « entendre » (relevé du son, fenêtres muettes) chaque moment du menu :
// navigation, chargement, partie, attente.
//
//   npx electron docs/demo-moments.cjs <racine du bac à sable>
//
// Avant cela, le garde-fou de mise en page (app/src/layout-check.ts) passe ses cas
// témoins : de vrais défauts sont signalés, une coupure voulue (« … », line-clamp) ne
// l'est pas. Sinon la démonstration s'arrête : un garde-fou faux ne prouve rien.
//
// Images PNG et vidéos WebM dessinées sur un canvas dans une fenêtre JAMAIS montrée
// (show: false, rendu hors écran, son coupé) ; certaines vidéos ont une piste son (un
// oscillateur) pour régler le son des vidéos du menu. Musiques et sons de lancement : des
// WAV calculés ici. Chaque média porte son nom et, au plateau, une bande « FLIPPERS » au
// bord des flippers, pour vérifier la rotation à l'œil.

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const { checkLayout } = require(path.join(__dirname, '..', 'app', 'dist', 'layout-check.js'));

const ROOT = path.resolve(process.argv.slice(2).find((a) => !a.startsWith('-') && !a.endsWith('.cjs')) ?? path.join(__dirname, '..', 'tmp', 'demo-moments', 'root'));

app.setPath('userData', path.join(ROOT, '..', 'generateur'));
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const GENERATOR = `
window.makeMedia = async (spec) => {
  const c = document.createElement('canvas');
  c.width = spec.w; c.height = spec.h;
  const g = c.getContext('2d');
  const draw = (t) => {
    if (spec.transparent) g.clearRect(0, 0, spec.w, spec.h);
    else {
      const grad = g.createLinearGradient(0, 0, spec.w, spec.h);
      grad.addColorStop(0, 'hsl(' + spec.hue + ', 80%, 35%)');
      grad.addColorStop(1, 'hsl(' + ((spec.hue + 60) % 360) + ', 80%, 15%)');
      g.fillStyle = grad; g.fillRect(0, 0, spec.w, spec.h);
      g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = Math.max(2, spec.w / 200);
      for (let i = 1; i < 8; i++) { g.beginPath(); g.moveTo(spec.w * i / 8, 0); g.lineTo(spec.w * i / 8, spec.h); g.stroke(); }
    }
    if (spec.flippers) {
      const band = Math.round(Math.min(spec.w, spec.h) * 0.12);
      g.fillStyle = 'rgba(255, 220, 0, 0.9)';
      const r = { bottom: [0, spec.h - band, spec.w, band], right: [spec.w - band, 0, band, spec.h] }[spec.flippers];
      g.fillRect(...r);
      g.save(); g.fillStyle = '#000'; g.font = 'bold ' + Math.round(band * 0.55) + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.translate(r[0] + r[2] / 2, r[1] + r[3] / 2);
      if (spec.flippers === 'right') g.rotate(-Math.PI / 2);
      g.fillText('FLIPPERS', 0, 0); g.restore();
    }
    g.fillStyle = spec.transparent ? 'hsl(' + spec.hue + ', 90%, 60%)' : '#fff';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const size = Math.round(Math.min(spec.h * 0.2, spec.w / (spec.label.length * 0.62)));
    g.font = '900 ' + size + 'px sans-serif';
    if (spec.transparent) { g.lineWidth = size / 10; g.strokeStyle = '#000'; g.strokeText(spec.label, spec.w / 2, spec.h / 2); }
    g.fillText(spec.label, spec.w / 2, spec.h / 2);
    if (spec.video) {
      g.fillStyle = '#fff';
      const x = spec.w * (0.15 + 0.7 * ((Math.sin(t * 3) + 1) / 2));
      g.beginPath(); g.arc(x, spec.h * 0.72, Math.min(spec.w, spec.h) * 0.05, 0, Math.PI * 2); g.fill();
    }
  };
  if (!spec.video) {
    draw(0);
    return c.toDataURL('image/png').split(',')[1];
  }
  const stream = c.captureStream(30);
  let audio;
  if (spec.sound) {
    // Piste son de la vidéo : un bourdonnement, pour régler le son des vidéos du menu.
    audio = new AudioContext();
    const osc = audio.createOscillator();
    osc.frequency.value = spec.sound;
    const gain = audio.createGain();
    gain.gain.value = 0.2;
    const dest = audio.createMediaStreamDestination();
    osc.connect(gain).connect(dest);
    osc.start();
    stream.addTrack(dest.stream.getAudioTracks()[0]);
  }
  const types = spec.sound ? ['video/webm;codecs=vp8,opus', 'video/webm'] : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const type = types.find((t) => MediaRecorder.isTypeSupported(t));
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 2_000_000 });
  const parts = [];
  rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
  const done = new Promise((r) => (rec.onstop = r));
  const start = performance.now();
  draw(0);
  rec.start(250);
  const timer = setInterval(() => draw((performance.now() - start) / 1000), 33);
  await new Promise((r) => setTimeout(r, spec.seconds * 1000));
  clearInterval(timer);
  rec.stop();
  await done;
  audio?.close();
  const buf = await new Blob(parts, { type }).arrayBuffer();
  let s = ''; const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
`;

/** WAV 16 bits mono : une petite mélodie (musique) ou un « whoosh » montant (lancement). */
function wav(seconds, kind, base) {
  const rate = 22050;
  const n = Math.round(seconds * rate);
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    let v;
    if (kind === 'music') {
      const notes = [0, 4, 7, 12, 7, 4];
      const f = base * 2 ** (notes[Math.floor(t * 4) % notes.length] / 12);
      v = 0.25 * Math.sin(2 * Math.PI * f * t) * (0.6 + 0.4 * Math.cos(2 * Math.PI * 4 * t));
    } else {
      const f = base + 600 * (t / seconds);
      v = 0.3 * Math.sin(2 * Math.PI * f * t) * Math.min(1, (seconds - t) * 4);
    }
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2);
  }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

const TABLES = [
  {
    // Tout : musique, son de lancement, vidéo de chargement en paysage (flippers à droite).
    name: 'Neon Galaxy (Williams 1992)',
    medias: {
      Playfield: { ext: 'webm', w: 1280, h: 720, hue: 200, label: 'NEON GALAXY plateau', flippers: 'right', video: true, sound: 220 },
      Wheel: { ext: 'png', w: 900, h: 300, hue: 190, label: 'NEON GALAXY', transparent: true },
      Backglass: { ext: 'webm', w: 1024, h: 820, hue: 280, label: 'NEON fronton', video: true },
      DMD: { ext: 'png', w: 512, h: 128, hue: 30, label: 'NEON DMD' },
      Topper: { ext: 'webm', w: 1280, h: 360, hue: 320, label: 'NEON topper', video: true },
      Loading: { ext: 'webm', w: 1280, h: 720, hue: 160, label: 'NEON chargement', flippers: 'right', video: true },
      Audio: { wav: 'music', seconds: 4, base: 330 },
      AudioLaunch: { wav: 'launch', seconds: 1.2, base: 300 },
    },
  },
  {
    // Musique au volume relatif de 50 % (gestionnaire des médias), fronton tiré du .directb2s, pas de vidéo de chargement.
    name: "Pharaoh's Gold (Gottlieb 1979)",
    medias: {
      Playfield: { ext: 'png', w: 1080, h: 1920, hue: 45, label: 'PHARAOH plateau', flippers: 'bottom' },
      Audio: { wav: 'music', seconds: 4, base: 262 },
    },
    directb2s: { w: 1024, h: 768, hue: 40, label: 'PHARAOH .directb2s' },
    volume: 50,
  },
  {
    // Aucun média : tous les replis, écran de chargement de secours avec un titre très long.
    name: 'Le très long titre d’une table imaginaire pour vérifier les débordements du chargement et des écrans (Stern 2020)',
    medias: {},
  },
  {
    // Pas de musique : le son de sa vidéo du plateau, si le réglage le permet.
    name: 'Rocket Rally (Data East 1988)',
    medias: {
      Playfield: { ext: 'webm', w: 540, h: 960, hue: 120, label: 'ROCKET plateau', flippers: 'bottom', video: true, sound: 180 },
      Wheel: { ext: 'png', w: 500, h: 500, hue: 100, label: 'RR', transparent: true },
      FullDMD: { ext: 'webm', w: 960, h: 540, hue: 15, label: 'ROCKET FullDMD', video: true },
      Loading: { ext: 'webm', w: 540, h: 960, hue: 90, label: 'ROCKET chargement', flippers: 'bottom', video: true },
    },
  },
  { name: 'Atlantis Deep (Bally 1975)', medias: { Wheel: { ext: 'png', w: 300, h: 520, hue: 210, label: 'AD', transparent: true } } },
  { name: 'Volcano Run (Stern 2005)', medias: { Wheel: { ext: 'png', w: 1000, h: 220, hue: 10, label: 'VOLCANO RUN', transparent: true }, Backglass: { ext: 'png', w: 1280, h: 1024, hue: 15, label: 'VOLCANO fronton' } } },
  { name: 'Ice Castle (Gottlieb 1984)', medias: {} },
];

/** Cas témoins du garde-fou : [nom, html, problème attendu (début du texte), ou rien]. */
const LAYOUT_CASES = [
  ['liste coupée par « … » du conteneur', '<ul style="width:300px;margin:0;padding:0"><li style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><span>Un titre bien trop long pour tenir dans la liste du menu</span></li></ul>', undefined],
  ['titre limité à deux lignes, sous-titre dessous', '<div style="width:300px;font-size:30px;line-height:1.2;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden">Un titre très long qui fait bien plus de deux lignes à cette taille-là</div><div style="font-size:20px">Stern · 2020</div>', undefined],
  ['titre limité à deux lignes, interligne trop serré', '<div style="width:300px;font-size:30px;line-height:1.05;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden">Un titre très long qui fait bien plus de deux lignes à cette taille-là</div>', 'interligne trop serré'],
  ['titre limité à deux lignes, rogné par sa zone', '<div style="width:300px;height:40px;overflow:hidden;display:flex;align-items:flex-end"><div style="font-size:30px;line-height:1.2;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden">Un titre long sur deux lignes</div></div>', 'coupé'],
  ['deux textes l’un sur l’autre', '<div style="position:absolute;top:10px;left:10px;font-size:30px">Premier texte</div><div style="position:absolute;top:15px;left:20px;font-size:30px">Second texte</div>', 'chevauchement'],
  ['texte coupé sans « … »', '<div style="width:120px;overflow:hidden;white-space:nowrap"><span>Un texte coupé sans prévenir personne</span></div>', 'coupé'],
  ['texte hors de la fenêtre', '<div style="position:absolute;left:350px;top:10px;white-space:nowrap;font-size:30px">Ce texte sort de la fenêtre</div>', 'hors de la fenêtre'],
  // Écran de chargement (html.loading-phase) : en borne, aucun texte sur le média ; au bureau, l'encart à côté du cadre.
  ['chargement en borne, un titre sur le média', '<script>document.documentElement.className = "loading-phase menu-cab"</script><main id="root" style="position:fixed;inset:0"><h1>Neon Galaxy</h1></main>', 'texte sur le chargement en borne'],
  ['chargement en borne, le repli seul', '<script>document.documentElement.className = "loading-phase menu-cab"</script><main id="root" style="position:fixed;inset:0"><div class="cp-fb-loading"><div>Neon Galaxy</div></div></main>', undefined],
  ['chargement au bureau, encart sur le cadre', '<script>document.documentElement.className = "loading-phase menu-desktop"</script><div id="media-bg" style="position:fixed;left:20px;top:20px;width:100px;height:180px"></div><main id="root" style="position:fixed;inset:0"><section class="loading-card" style="position:absolute;left:110px;top:20px;width:200px;height:180px"></section></main>', 'encart du chargement sur le cadre'],
  ['chargement au bureau, encart à côté du cadre', '<script>document.documentElement.className = "loading-phase menu-desktop"</script><div id="media-bg" style="position:fixed;left:20px;top:20px;width:100px;height:180px"></div><main id="root" style="position:fixed;inset:0"><section class="loading-card" style="position:absolute;left:150px;top:20px;width:200px;height:180px"></section></main>', undefined],
];

async function checkGuard() {
  const win = new BrowserWindow({ show: false, focusable: false, skipTaskbar: true, width: 400, height: 300, useContentSize: true, webPreferences: { offscreen: true } });
  const failures = [];
  for (const [name, html, expected] of LAYOUT_CASES) {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><body style="margin:0;font-family:sans-serif">${html}</body>`)}`);
    const problems = await checkLayout(win.webContents);
    const ok = expected ? problems.some((p) => p.startsWith(expected)) : problems.length === 0;
    console.log(`Garde-fou de mise en page, ${name} : ${ok ? 'ok' : 'ÉCHEC'}${problems.length ? ` (${problems.join(' ; ')})` : ''}`);
    if (!ok) failures.push(name);
  }
  win.destroy();
  return failures;
}

function directb2s(png) {
  const b64 = (png.toString('base64').match(/.{1,76}/g) ?? []).join('&#xD;&#xA;');
  return `<DirectB2SData Version="1.2">\r\n  <Name Value="Démo" />\r\n  <Images>\r\n    <BackglassOnImage Value="${b64}" />\r\n  </Images>\r\n</DirectB2SData>\r\n`;
}

app.whenReady().then(async () => {
  const guard = await checkGuard();
  if (guard.length) {
    console.error(`Garde-fou de mise en page faux : ${guard.join(', ')}.`);
    return app.exit(1);
  }
  fs.rmSync(ROOT, { recursive: true, force: true });
  fs.mkdirSync(path.join(ROOT, 'media'), { recursive: true });
  const gen = new BrowserWindow({ show: false, focusable: false, skipTaskbar: true, width: 400, height: 300, webPreferences: { offscreen: true, backgroundThrottling: false } });
  // Les pistes son des vidéos sont enregistrées, jamais entendues.
  gen.webContents.setAudioMuted(true);
  await gen.loadURL('data:text/html,<meta charset=utf-8><title>générateur</title>');
  await gen.webContents.executeJavaScript(`${GENERATOR}; true`);
  const make = async (spec) => Buffer.from(await gen.webContents.executeJavaScript(`makeMedia(${JSON.stringify({ seconds: 2, ...spec })})`), 'base64');
  for (const t of TABLES) {
    const folder = path.join(ROOT, 'tables', t.name);
    fs.mkdirSync(path.join(folder, 'medias'), { recursive: true });
    fs.writeFileSync(path.join(folder, `${t.name}.vpx`), '');
    for (const [type, spec] of Object.entries(t.medias)) {
      const file = path.join(folder, 'medias', `(${type}) ${t.name}.${spec.wav ? 'wav' : spec.ext}`);
      fs.writeFileSync(file, spec.wav ? wav(spec.seconds, spec.wav, spec.base) : await make(spec));
    }
    if (t.directb2s) fs.writeFileSync(path.join(folder, `${t.name}.directb2s`), directb2s(await make(t.directb2s)));
    if (t.volume !== undefined) fs.writeFileSync(path.join(folder, `${t.name}.info`), JSON.stringify({ CyberPinball: { medias: { volume: t.volume } } }, null, 2));
    console.log(`Table : ${t.name} (${Object.keys(t.medias).join(', ') || 'aucun média'})`);
  }
  // Défaut de la borne pour le topper.
  fs.writeFileSync(path.join(ROOT, 'media', '(Topper).png'), await make({ w: 1280, h: 360, hue: 180, label: 'TOPPER DE LA BORNE' }));
  gen.destroy();
  app.quit();
});

app.on('window-all-closed', () => {});
process.on('unhandledRejection', (error) => {
  console.error(error);
  app.exit(1);
});
