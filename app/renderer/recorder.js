// Enregistreur d'une partie (game-recording.ts), dans une fenêtre jamais montrée. Ordres reçus :
//   prepare : ouvrir la capture de chaque écran (desktopCapturer : identifiant de la source, taille
//             voulue) ; ou, pour une partie simulée hors écran, dessiner soi-même une fausse table
//             dans le sens où VPX la dessinerait, ce qui éprouve tout le reste du chemin ;
//   start   : événement de début, l'enregistrement de chaque cible commence (MediaRecorder) ;
//   stop    : événement de fin. Fin à la durée : tout est écrit jusqu'à la durée, fondu compris.
//             Sortie de la table : les images retenues (RECORDING_TAIL_MS) sont jetées.
// Chaque cible (un rôle : plateau, fronton, DMD) prend sa zone dans l'image de son écran, la tourne
// et la réduit (CaptureGeometry), sur une toile, puis en fait une piste vidéo (MediaStreamTrackGenerator)
// que MediaRecorder encode en MP4 (H.264, et AAC pour le son de la partie). Les images et le son
// passent par une file retardée : ce qui précède la fermeture de VPX n'est jamais écrit.

'use strict';

const api = window.cyberRecorder;
let session = null;

const MIMES_AUDIO = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/webm;codecs=vp9,opus'];
const MIMES_VIDEO = ['video/mp4;codecs=avc1.640028', 'video/webm;codecs=vp9'];

function fadeLevel(ms, totalMs, fadeMs) {
  const ramp = (x) => Math.max(0, Math.min(1, x / fadeMs));
  const into = ramp(ms);
  return totalMs === undefined ? into : Math.min(into, ramp(totalMs - ms));
}

// ---------------------------------------------------------------------------
// Fausse table (partie simulée) : marques reconnaissables pour vérifier le sens de la vidéo

const COLORS = { void: '#030807', surface: '#0c1a17', line: '#24504a', top: '#ff6b6b', flipper: '#8be23a', ink: '#e6f0ec', ball: '#e6f0ec', dmd: '#f28a3d' };

/** Plateau vu du joueur, flippers en bas : bandeau rouge en haut, flippers verts en bas, une bille. */
function drawTable(ctx, w, h, t, title) {
  ctx.fillStyle = COLORS.surface;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = COLORS.top;
  ctx.fillRect(0, 0, w, h * 0.08);
  ctx.fillStyle = COLORS.flipper;
  ctx.fillRect(0, h * 0.94, w, h * 0.06);
  ctx.save();
  ctx.translate(w * 0.32, h * 0.88);
  ctx.rotate(0.35 + 0.3 * Math.sin(t / 250));
  ctx.fillRect(0, -h * 0.012, w * 0.16, h * 0.024);
  ctx.restore();
  ctx.save();
  ctx.translate(w * 0.68, h * 0.88);
  ctx.rotate(Math.PI - 0.35 - 0.3 * Math.sin(t / 250));
  ctx.fillRect(0, -h * 0.012, w * 0.16, h * 0.024);
  ctx.restore();
  ctx.fillStyle = COLORS.ball;
  ctx.beginPath();
  ctx.arc(w * (0.5 + 0.35 * Math.sin(t / 700)), h * (0.5 + 0.3 * Math.cos(t / 900)), Math.min(w, h) * 0.03, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.ink;
  ctx.font = `600 ${Math.round(w * 0.06)}px sans-serif`; // i18n-ignore : police de la fausse table
  ctx.textAlign = 'center';
  ctx.fillText(title, w / 2, h * 0.2);
}

/** Fronton ou afficheur : le titre et une bande qui défile. */
function drawPanel(ctx, w, h, t, title, color) {
  ctx.fillStyle = COLORS.void;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(((t / 6) % (w + w * 0.2)) - w * 0.2, h * 0.8, w * 0.2, h * 0.08);
  ctx.font = `600 ${Math.round(h * 0.18)}px sans-serif`; // i18n-ignore : police de la fausse table
  ctx.textAlign = 'center';
  ctx.fillText(title, w / 2, h * 0.5);
}

/** Une zone de l'écran simulé, dessinée dans le sens où VPX la montrerait (`turn` : edgeRotation du bord des flippers). */
function drawZone(ctx, zone, t) {
  ctx.save();
  ctx.translate(zone.rect.x + zone.rect.width / 2, zone.rect.y + zone.rect.height / 2);
  ctx.rotate(((zone.turn ?? 0) * Math.PI) / 180);
  const quarter = zone.turn === 90 || zone.turn === 270;
  const w = quarter ? zone.rect.height : zone.rect.width;
  const h = quarter ? zone.rect.width : zone.rect.height;
  ctx.translate(-w / 2, -h / 2);
  if (zone.role === 'playfield') drawTable(ctx, w, h, t, zone.title);
  else drawPanel(ctx, w, h, t, zone.title, zone.role === 'dmd' ? COLORS.dmd : COLORS.line);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Sources : capture d'un écran, ou écran simulé

async function openSource(src, index, cmd, onFrame, onAudio) {
  const wantsAudio = cmd.sound && cmd.targets.some((t) => t.sourceIndex === index && t.audio);
  const stoppers = [];
  if (cmd.synthetic) {
    const canvas = new OffscreenCanvas(src.width, src.height);
    const ctx = canvas.getContext('2d');
    const t0 = performance.now();
    const timer = setInterval(() => {
      const t = performance.now() - t0;
      ctx.fillStyle = COLORS.void;
      ctx.fillRect(0, 0, src.width, src.height);
      for (const zone of src.scene ?? []) drawZone(ctx, zone, t);
      const frame = new VideoFrame(canvas, { timestamp: Math.round(t * 1000) });
      try {
        onFrame(frame);
      } finally {
        frame.close();
      }
    }, 1000 / cmd.fps);
    stoppers.push(() => clearInterval(timer));
    if (wantsAudio) {
      const audio = new AudioContext();
      // Ce son ne va que dans la vidéo : aucune sortie de Windows, ni celle de la borne.
      audio.setSinkId({ type: 'none' }).catch(() => undefined);
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = 220;
      gain.gain.value = 0.2;
      const dest = audio.createMediaStreamDestination();
      osc.connect(gain).connect(dest);
      osc.start();
      stoppers.push(readTrack(dest.stream.getAudioTracks()[0], onAudio));
      stoppers.push(() => audio.close());
    }
    return () => stoppers.forEach((stop) => stop());
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: wantsAudio ? { mandatory: { chromeMediaSource: 'desktop' } } : false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: src.id,
        minWidth: src.width,
        maxWidth: src.width,
        minHeight: src.height,
        maxHeight: src.height,
        maxFrameRate: cmd.fps,
      },
    },
  });
  stoppers.push(readTrack(stream.getVideoTracks()[0], onFrame));
  const audioTrack = stream.getAudioTracks()[0];
  if (audioTrack) stoppers.push(readTrack(audioTrack, onAudio));
  stoppers.push(() => stream.getTracks().forEach((track) => track.stop()));
  return () => stoppers.forEach((stop) => stop());
}

/** Lit chaque image (ou morceau de son) d'une piste ; renvoie l'arrêt. */
function readTrack(track, onData) {
  const reader = new MediaStreamTrackProcessor({ track }).readable.getReader();
  let open = true;
  void (async () => {
    while (open) {
      const { value, done } = await reader.read().catch(() => ({ done: true }));
      if (done) break;
      try {
        onData(value);
      } finally {
        value.close();
      }
    }
  })();
  return () => {
    open = false;
    reader.cancel().catch(() => undefined);
    track.stop();
  };
}

// ---------------------------------------------------------------------------
// Cibles : une vidéo par rôle

function pickMime(audio) {
  return (audio ? MIMES_AUDIO : MIMES_VIDEO).find((m) => MediaRecorder.isTypeSupported(m));
}

function makeTarget(spec, cmd) {
  const canvas = new OffscreenCanvas(spec.width, spec.height);
  const ctx = canvas.getContext('2d', { alpha: false });
  const video = new MediaStreamTrackGenerator({ kind: 'video' });
  const audio = cmd.sound && spec.audio ? new MediaStreamTrackGenerator({ kind: 'audio' }) : null;
  return {
    spec,
    canvas,
    ctx,
    video,
    audio,
    videoWriter: video.writable.getWriter(),
    audioWriter: audio ? audio.writable.getWriter() : null,
    videoChain: Promise.resolve(),
    audioChain: Promise.resolve(),
    queue: [],
    recorder: null,
    chunks: Promise.resolve(),
    mime: pickMime(Boolean(audio)),
    samples: 0,
    audioStart: undefined,
  };
}

/** L'image de l'écran → la zone du rôle, tournée et réduite, fondu compris. */
function drawTarget(target, frame, ms, endMs) {
  const { ctx, spec } = target;
  const { crop, rotation, width, height } = spec;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  ctx.translate(width / 2, height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  const quarter = rotation === 90 || rotation === 270;
  const dw = quarter ? height : width;
  const dh = quarter ? width : height;
  ctx.drawImage(frame, crop.x, crop.y, crop.width, crop.height, -dw / 2, -dh / 2, dw, dh);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const level = fadeLevel(ms, endMs, session.fadeMs);
  if (level < 1) {
    ctx.fillStyle = `rgba(0, 0, 0, ${1 - level})`;
    ctx.fillRect(0, 0, width, height);
  }
}

/** Morceau de son repris dans l'horloge de l'enregistrement, au niveau du fondu. */
function copyAudio(target, data, ms, endMs) {
  const planar = data.format.endsWith('-planar');
  const planes = planar ? data.numberOfChannels : 1;
  const per = planar ? data.numberOfFrames : data.numberOfFrames * data.numberOfChannels;
  const samples = new Float32Array(per * planes);
  for (let p = 0; p < planes; p++) data.copyTo(samples.subarray(p * per, (p + 1) * per), { planeIndex: p, format: planar ? 'f32-planar' : 'f32' });
  const level = fadeLevel(ms, endMs, session.fadeMs);
  if (level < 1) for (let i = 0; i < samples.length; i++) samples[i] *= level;
  target.audioStart ??= ms;
  const timestamp = Math.round((target.audioStart + (target.samples / data.sampleRate) * 1000) * 1000);
  target.samples += data.numberOfFrames;
  return new AudioData({ format: planar ? 'f32-planar' : 'f32', sampleRate: data.sampleRate, numberOfFrames: data.numberOfFrames, numberOfChannels: data.numberOfChannels, timestamp, data: samples });
}

/** Écrit ce qui a quitté la file retardée (jusqu'à `untilMs`), dans l'ordre. */
function flush(target, untilMs) {
  while (target.queue.length && target.queue[0].ms <= untilMs) {
    const item = target.queue.shift();
    if (item.kind === 'video') target.videoChain = target.videoChain.then(() => target.videoWriter.write(item.data)).catch(() => undefined).finally(() => item.data.close());
    else target.audioChain = target.audioChain.then(() => target.audioWriter.write(item.data)).catch(() => undefined).finally(() => item.data.close());
  }
}

function drop(target) {
  for (const item of target.queue.splice(0)) item.data.close();
}

// ---------------------------------------------------------------------------
// Ordres

async function prepare(cmd) {
  session = { cmd, fadeMs: cmd.fadeMs, tailMs: cmd.tailMs, targets: cmd.targets.map((spec) => makeTarget(spec, cmd)), stops: [], t0: undefined, endMs: undefined, recording: false };
  const missing = session.targets.find((t) => !t.mime);
  if (missing) throw new Error('aucun format vidéo disponible pour MediaRecorder'); // i18n-ignore : remonté tel quel au journal
  for (const [index, src] of cmd.sources.entries()) {
    const mine = session.targets.filter((t) => t.spec.sourceIndex === index);
    const onFrame = (frame) => {
      if (!session.recording) return;
      const ms = performance.now() - session.t0;
      if (session.endMs !== undefined && ms > session.endMs) return;
      for (const target of mine) {
        drawTarget(target, frame, ms, session.endMs);
        target.queue.push({ ms, kind: 'video', data: new VideoFrame(target.canvas, { timestamp: Math.round(ms * 1000) }) });
        flush(target, ms - session.tailMs);
      }
    };
    const onAudio = (data) => {
      if (!session.recording) return;
      const ms = performance.now() - session.t0;
      if (session.endMs !== undefined && ms > session.endMs) return;
      for (const target of mine) {
        if (!target.audioWriter) continue;
        target.queue.push({ ms, kind: 'audio', data: copyAudio(target, data, ms, session.endMs) });
      }
    };
    session.stops.push(await openSource(src, index, cmd, onFrame, onAudio));
  }
  api.emit({ type: 'prepared', targets: session.targets.map((t) => ({ key: t.spec.key, mime: t.mime })) });
}

function start(cmd) {
  session.t0 = performance.now();
  session.endMs = cmd.durationMs;
  for (const target of session.targets) {
    const tracks = [target.video, ...(target.audio ? [target.audio] : [])];
    target.recorder = new MediaRecorder(new MediaStream(tracks), { mimeType: target.mime, videoBitsPerSecond: target.spec.bitrate, audioBitsPerSecond: 160_000 });
    target.recorder.ondataavailable = (event) => {
      if (!event.data.size) return;
      const data = event.data;
      target.chunks = target.chunks.then(async () => api.chunk(target.spec.key, await data.arrayBuffer()));
    };
    target.recorder.onerror = (event) => api.emit({ type: 'error', message: String(event.error?.message ?? event.error ?? 'MediaRecorder') });
    target.recorder.start(1000);
  }
  session.recording = true;
  api.emit({ type: 'started' });
}

async function stop(cmd) {
  if (!session) return api.emit({ type: 'done', targets: [] });
  session.recording = false;
  const clean = cmd.reason === 'duration';
  for (const target of session.targets) {
    if (clean) flush(target, Infinity);
    else drop(target);
  }
  await Promise.all(session.targets.flatMap((t) => [t.videoChain, t.audioChain]));
  const results = [];
  for (const target of session.targets) {
    if (!target.recorder) continue;
    // Le temps que l'encodeur rende ses dernières images.
    await new Promise((resolve) => setTimeout(resolve, 300));
    await new Promise((resolve) => {
      target.recorder.onstop = resolve;
      target.recorder.stop();
    });
    await target.chunks;
    results.push({ key: target.spec.key, mime: target.recorder.mimeType || target.mime });
  }
  for (const stopSource of session.stops) stopSource();
  for (const target of session.targets) {
    target.video.stop();
    target.audio?.stop();
  }
  session = null;
  api.emit({ type: 'done', targets: results });
}

let pending = Promise.resolve();
api.onCommand((cmd) => {
  // Les ordres s'enchaînent : un « stop » attend la fin du « prepare ».
  pending = pending
    .then(async () => {
      if (cmd.type === 'prepare') await prepare(cmd);
      else if (cmd.type === 'start') start(cmd);
      else if (cmd.type === 'stop') await stop(cmd);
    })
    .catch((error) => api.emit({ type: 'error', message: String(error?.message ?? error) }));
});
api.ready();
