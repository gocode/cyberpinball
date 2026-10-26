// Rendu des sons de l'interface (app/renderer/ui-sounds.js) en fichiers WAV, pour les écouter
// sans lancer le menu, et relevé de leur niveau (crête, efficace, durée audible). Lancé par
// docs\rendu-sons-interface.ps1, hors écran : une fenêtre de createWindow (app/src/offscreen.ts)
// joue chaque recette dans un OfflineAudioContext, qui calcule le son sans rien faire entendre.
//   electron docs\rendu-sons-interface.cjs <dossier de sortie>

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

const out = path.resolve(process.argv[2] ?? path.join(__dirname, '..', 'tmp', 'sons-interface'));
const source = fs.readFileSync(path.join(__dirname, '..', 'app', 'renderer', 'ui-sounds.js'), 'utf8');
const RATE = 48000;
// Dossier Chromium à part : rien de commun avec le menu ou une autre démonstration en cours.
app.setPath('userData', path.join(out, '.chromium'));

// Dans la page : AudioContext remplacé par un OfflineAudioContext d'une seconde ; chaque son
// est rendu seul, puis le contexte est relâché (setPhase('playing')) pour que le suivant en ait un neuf.
const page = `
  window.__contexts = [];
  window.AudioContext = class extends OfflineAudioContext {
    constructor() { super(1, ${RATE}, ${RATE}); window.__contexts.push(this); }
    setSinkId() { return Promise.resolve(); }
    resume() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
  };
  ${source}
  (async () => {
    const result = {};
    for (const id of window.CyberUiSounds.recipes()) {
      window.CyberUiSounds.setPhase('menu');
      if (!window.CyberUiSounds.play(id, 1)) throw new Error(id + ' : non joué');
      const buffer = await window.__contexts.at(-1).startRendering();
      window.CyberUiSounds.setPhase('playing');
      const data = buffer.getChannelData(0);
      let peak = 0, sum = 0, last = 0;
      for (let i = 0; i < data.length; i++) {
        const v = Math.abs(data[i]);
        peak = Math.max(peak, v);
        sum += data[i] * data[i];
        if (v > 0.001) last = i;
      }
      const pcm = new Int16Array(data.length);
      for (let i = 0; i < data.length; i++) pcm[i] = Math.max(-32768, Math.min(32767, Math.round(data[i] * 32767)));
      let binary = '';
      const bytes = new Uint8Array(pcm.buffer);
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      result[id] = { peak, rms: Math.sqrt(sum / Math.max(1, last)), audible: last / ${RATE}, pcm: btoa(binary) };
    }
    return result;
  })()`;

function wav(pcm) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

const dB = (v) => (v > 0 ? `${(20 * Math.log10(v)).toFixed(1)} dB` : '-∞');

app.whenReady().then(async () => {
  const { createWindow } = require(path.join(__dirname, '..', 'app', 'dist', 'offscreen.js'));
  const win = createWindow({ width: 320, height: 240, webPreferences: { contextIsolation: true, sandbox: true } });
  await win.loadURL('about:blank');
  let code = 0;
  try {
    const result = await win.webContents.executeJavaScript(page);
    fs.mkdirSync(out, { recursive: true });
    for (const [id, r] of Object.entries(result)) {
      const file = path.join(out, `${id}.wav`);
      fs.writeFileSync(file, wav(Buffer.from(r.pcm, 'base64')));
      console.log(`${id.padEnd(9)} crête ${dB(r.peak).padStart(9)} · efficace ${dB(r.rms).padStart(9)} · audible ${r.audible.toFixed(2)} s · ${file}`);
      // Un son à pleine échelle écrête : la recette doit garder de la marge.
      if (r.peak >= 1) {
        console.log(`  ÉCHEC : ${id} écrête (crête ${r.peak.toFixed(3)}).`);
        code = 1;
      }
    }
  } catch (error) {
    console.log(`Rendu impossible : ${error.message}`);
    code = 1;
  }
  app.exit(code);
});
