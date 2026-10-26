// Son du menu (tâche T5, docs/recherche/medias.md § 5.2) : musique du jeu choisi (Audio)
// en boucle, son de lancement (AudioLaunch) joué une fois, et volume du son de la vidéo
// du playfield, sur la sortie audio du fronton (setSinkId). Seule la fenêtre du playfield
// joue. Le processus principal décide quoi jouer et à quel volume (menuSound,
// packages/core/src/menumoments.ts) ; ici, on enchaîne en fondu :
//   - changement de table : l'ancienne musique s'éteint en fondu, la nouvelle ne démarre
//     que si la table reste choisie un instant (pas de cacophonie en faisant défiler) ;
//   - lancement : la musique s'éteint, le son de lancement part ; la partie coupe tout.
//
//   CyberMenuAudio.update(son)   // son : { music?, launch?, launchId?, video, output? }
//   CyberMenuAudio.attachVideo(couche)  // couche du fond (media.js), dont le son est relevé
//   CyberMenuAudio.status()      // ce qui joue, pour les essais sans opérateur

(() => {
  'use strict';

  /** Fondu de la musique au changement de table et à l'arrêt, en ms. */
  const FADE_MS = 700;
  /** Une table doit rester choisie ce temps avant que sa musique démarre. */
  const SETTLE_MS = 350;
  /** Fondu de sortie du son de lancement quand la partie commence. */
  const LAUNCH_FADE_MS = 300;
  const STEP_MS = 30;

  // Chromium ajoute « (vid:pid) » au nom Windows des périphériques USB (comme sound.js,
  // l'étape « Son » de l'assistant) : « Haut-parleurs (USB Audio Device) (0711:5640) ».
  const USB_IDS = / \([0-9a-f]{4}:[0-9a-f]{4}\)$/i;

  /** Sortie demandée (nom Windows) et identifiant Chromium trouvé ; '' : sortie par défaut. */
  let wantedOutput;
  let sinkId = '';
  let sinkLabel = 'sortie par défaut'; // i18n-ignore : état lu par les essais (status), jamais affiché
  let sinkProblem;

  /** Pistes en cours : { el, url, kind, target, timer, settle }. */
  let music;
  let launch;
  let lastLaunchId;
  const fading = new Set();

  function rampTo(track, to, ms, done) {
    clearInterval(track.timer);
    const el = track.el;
    const from = el.volume;
    const steps = Math.max(1, Math.round(ms / STEP_MS));
    let i = 0;
    track.target = to;
    track.timer = setInterval(() => {
      i++;
      el.volume = Math.min(1, Math.max(0, from + ((to - from) * i) / steps));
      if (i >= steps) {
        clearInterval(track.timer);
        track.timer = undefined;
        done?.();
      }
    }, STEP_MS);
  }

  function create(url, kind, loop) {
    const el = new Audio();
    el.preload = 'auto';
    el.loop = loop;
    el.volume = 0;
    el.src = url;
    if (sinkId) el.setSinkId(sinkId).catch(() => {});
    el.addEventListener('error', () => {
      try {
        const e = el.error;
        // Message montré par le médecin (constat de la table).
        const message = e?.message ? t('Son illisible ({message})', { message: e.message }) : t('Son illisible');
        window.cyber?.mediaError?.({ url, role: 'audio', type: kind, code: e?.code, message });
      } catch {
        // Hors de l'application : rien à remonter.
      }
    });
    return { el, url, kind, target: 0 };
  }

  /** Éteint une piste en fondu, puis la libère. */
  function stop(track, ms = FADE_MS) {
    if (!track) return;
    clearTimeout(track.settle);
    fading.add(track);
    rampTo(track, 0, ms, () => {
      track.el.pause();
      track.el.removeAttribute('src');
      track.el.load();
      fading.delete(track);
    });
  }

  function start(track, volume) {
    track.el.play().catch(() => {});
    rampTo(track, volume, FADE_MS);
  }

  function updateMusic(wanted) {
    if (music && wanted && music.url === wanted.url) {
      // Même musique : seul le volume change (réglage, mode attente).
      if (music.target !== wanted.volume && !music.settle) rampTo(music, wanted.volume, FADE_MS);
      else music.target = wanted.volume;
      return;
    }
    stop(music);
    music = undefined;
    if (!wanted) return;
    const track = create(wanted.url, 'Audio', true);
    track.target = wanted.volume;
    music = track;
    track.settle = setTimeout(() => {
      track.settle = undefined;
      if (music === track) start(track, track.target);
    }, SETTLE_MS);
  }

  function updateLaunch(wanted, id) {
    if (wanted && id !== undefined && id !== lastLaunchId) {
      lastLaunchId = id;
      stop(launch, LAUNCH_FADE_MS);
      launch = create(wanted.url, 'AudioLaunch', false);
      launch.el.volume = wanted.volume;
      launch.target = wanted.volume;
      launch.el.play().catch(() => {});
      return;
    }
    if (!wanted && launch) {
      stop(launch, LAUNCH_FADE_MS);
      launch = undefined;
    }
  }

  /** Retrouve la sortie du fronton parmi celles de Chromium, et y envoie tout le son du menu. */
  async function useOutput(name) {
    if (name === wantedOutput) return;
    wantedOutput = name;
    let id = '';
    sinkProblem = undefined;
    if (name) {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const outputs = devices.filter((d) => d.kind === 'audiooutput' && d.deviceId !== 'default' && d.deviceId !== 'communications');
        const hit = outputs.find((d) => d.label === name || d.label.replace(USB_IDS, '') === name);
        if (hit) id = hit.deviceId;
        else sinkProblem = `sortie « ${name} » introuvable : sortie par défaut`; // i18n-ignore : état lu par les essais (status), jamais affiché
      } catch (error) {
        sinkProblem = `sorties illisibles (${error.message}) : sortie par défaut`; // i18n-ignore : état lu par les essais (status), jamais affiché
      }
    }
    if (wantedOutput !== name) return;
    sinkId = id;
    sinkLabel = id ? name : 'sortie par défaut'; // i18n-ignore : état lu par les essais (status), jamais affiché
    for (const track of [music, launch, ...fading]) track?.el.setSinkId(sinkId).catch(() => {});
    window.CyberMedia?.setSink?.(sinkId);
    window.CyberUiSounds?.setSink?.(sinkId);
  }

  function update(sound) {
    const s = sound ?? { video: 0 };
    void useOutput(s.output);
    updateMusic(s.music);
    updateLaunch(s.launch, s.launchId);
  }

  // Bureau Windows (fenêtres réduites) : la musique se tait, puis reprend.
  document.addEventListener('visibilitychange', () => {
    if (!music || music.settle) return;
    if (document.hidden) music.el.pause();
    else music.el.play().catch(() => {});
  });

  const describe = (track) =>
    track && {
      fichier: decodeURIComponent(track.url).replace(/^.*[\\/]/, '').replace(/\?v=.*$/, ''),
      volume: Math.round(track.target * 1000) / 1000,
      lecture: track.settle ? 'en attente' : track.el.paused ? 'en pause' : 'en lecture', // i18n-ignore : état lu par les essais (status), jamais affiché
    };

  let videoLayer;

  window.CyberMenuAudio = {
    update,
    attachVideo: (layer) => (videoLayer = layer),
    status: () => ({ sortie: sinkLabel, probleme: sinkProblem, musique: describe(music), lancement: describe(launch), enFondu: fading.size, video: videoLayer?.sound() }),
  };
})();
