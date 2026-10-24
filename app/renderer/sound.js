// Sons de test de l'étape « Son » de l'assistant, générés par oscillateur (aucun
// fichier). Le processus principal décide quoi jouer ; cette fenêtre trouve la
// sortie par son nom Windows (label d'enumerateDevices), y joue le son en boucle
// et rend compte : sortie trouvée ou non, canaux que Chromium a ouverts.
//
// Commandes : { kind: 'stop' }
//   { kind: 'output', key, friendlyName, beeps } : « beeps » bips, tous canaux ;
//   { kind: 'channel', key, friendlyName, channels, left, right } : un bip sur le
//     canal « left », puis un sur « right » (rangs dans le flux de la sortie).

const BEEP = 0.14; // secondes
const GAP = 0.13;
const PAUSE = 1.1; // silence avant la répétition
const LEVEL = 0.22;

let current; // { key, ctx, timer }
let sequence = 0;

function stopSound() {
  if (!current) return;
  clearInterval(current.timer);
  current.ctx.close().catch(() => {});
  current = undefined;
}

// Chromium ajoute « (vid:pid) » au nom Windows des périphériques USB :
// « Haut-parleurs (USB Audio Device) (0711:5640) ».
const USB_IDS = / \([0-9a-f]{4}:[0-9a-f]{4}\)$/i;

/** Le label de Chromium désigne-t-il la sortie que Windows (et VPX) appelle friendlyName ? */
function sameOutput(label, friendlyName) {
  return label === friendlyName || label.replace(USB_IDS, '') === friendlyName;
}

/** Sorties audio réelles portant ce nom ; « default » et « communications » sont des alias de Chromium. */
async function findSinks(friendlyName) {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const outputs = devices.filter((d) => d.kind === 'audiooutput' && d.deviceId !== 'default' && d.deviceId !== 'communications');
  return { all: outputs, hits: outputs.filter((d) => sameOutput(d.label, friendlyName)) };
}

/** Un bip à « at » secondes, enveloppe douce pour éviter les claquements. */
function beep(ctx, destination, at, frequency) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(LEVEL, at + 0.01);
  gain.gain.setValueAtTime(LEVEL, at + BEEP - 0.03);
  gain.gain.linearRampToValueAtTime(0, at + BEEP);
  osc.connect(gain).connect(destination);
  osc.start(at);
  osc.stop(at + BEEP + 0.02);
}

async function playSound(command) {
  const mine = ++sequence;
  stopSound();
  if (command.kind === 'stop') return;
  const report = (status) => window.cyber.soundStatus({ key: command.key, ...status });

  let sinks;
  try {
    sinks = await findSinks(command.friendlyName);
  } catch (err) {
    report({ ok: false, reason: 'enumerate', detail: String(err) });
    return;
  }
  if (mine !== sequence) return;
  if (sinks.hits.length === 0) {
    // Sans permission, Chromium liste les sorties sans leur nom.
    const unnamed = sinks.all.length > 0 && sinks.all.every((d) => !d.label);
    report({ ok: false, reason: unnamed ? 'no-labels' : 'not-found', labels: sinks.all.map((d) => d.label) });
    return;
  }

  const ctx = new AudioContext({ latencyHint: 'interactive' });
  try {
    await ctx.setSinkId(sinks.hits[0].deviceId);
    await ctx.resume();
  } catch (err) {
    ctx.close().catch(() => {});
    report({ ok: false, reason: 'sink', detail: String(err) });
    return;
  }
  if (mine !== sequence) {
    ctx.close().catch(() => {});
    return;
  }

  let schedule;
  const maxChannels = ctx.destination.maxChannelCount;
  if (command.kind === 'channel') {
    if (Math.max(command.left, command.right) >= maxChannels) {
      ctx.close().catch(() => {});
      report({ ok: false, reason: 'channels', maxChannels });
      return;
    }
    // Chaque haut-parleur reçoit son canal tel quel : pas de remixage par Chromium.
    const count = Math.min(command.channels, maxChannels);
    ctx.destination.channelCount = count;
    ctx.destination.channelCountMode = 'explicit';
    ctx.destination.channelInterpretation = 'discrete';
    const merger = ctx.createChannelMerger(count);
    merger.connect(ctx.destination);
    const left = ctx.createGain();
    const right = ctx.createGain();
    left.connect(merger, 0, command.left);
    right.connect(merger, 0, command.right);
    schedule = (t) => {
      beep(ctx, left, t, 660);
      beep(ctx, right, t + BEEP + GAP * 2, 990);
      return BEEP * 2 + GAP * 2;
    };
  } else {
    schedule = (t) => {
      for (let i = 0; i < command.beeps; i++) beep(ctx, ctx.destination, t + i * (BEEP + GAP), 880);
      return command.beeps * (BEEP + GAP);
    };
  }

  const burst = () => schedule(ctx.currentTime + 0.05);
  const length = burst();
  current = { key: command.key, ctx, timer: setInterval(burst, (length + PAUSE) * 1000) };
  report({ ok: true, maxChannels, homonyms: sinks.hits.length });
}

window.cyber.onSound((command) => {
  playSound(command).catch((err) => window.cyber.soundStatus({ key: command.key, ok: false, reason: 'error', detail: String(err) }));
});
