// Coupures de la lecture locale du Juke-box (19/11/2026). Un morceau lu depuis le disque qui
// s'arrête quelques secondes, puis repart, ne laissait aucune trace : le journal ne disait que
// « lecture de… ». Ce guet note chaque arrêt de plus d'un quart de seconde, avec sa cause (un code,
// mis en phrase au journal par jukebox-player.ts) :
//   - data : l'élément attend la suite du fichier (événement waiting) ;
//   - frame : la vidéo joue, mais plus aucune image n'est décodée ;
//   - sound : le son seul n'avance plus, sans attente déclarée.
// Ce qui était chargé d'avance (buffered) au moment de l'arrêt dit si les données manquaient.
//
//   const stop = CyberJukeboxStalls.watch(élément, (coupure) => …)  // { ms, at, cause, ahead }
//   stop()

(() => {
  'use strict';
  if (window.CyberJukeboxStalls) return;

  /** Arrêt plus court : non noté (un recalage, un changement de sortie). */
  const MIN_MS = 250;
  const PROBE_MS = 250;

  /** Secondes chargées d'avance à la position de lecture. */
  function ahead(media) {
    const b = media.buffered;
    const t = media.currentTime;
    for (let i = 0; i < b.length; i++) if (b.start(i) <= t + 0.05 && b.end(i) >= t) return Math.max(0, b.end(i) - t);
    return 0;
  }

  function watch(media, report) {
    let waitingSince = 0;
    let waitingAt = 0;
    let waitingAhead = 0;
    let frozenSince = 0;
    let frozenAt = 0;
    let lastFrames = -1;
    let lastTime = -1;
    let stopped = false;

    const send = (ms, at, cause, more) => {
      if (stopped || ms < MIN_MS) return;
      try {
        report({ ms: Math.round(ms), at, cause, ...more });
      } catch {
        // Le guet ne casse jamais la lecture.
      }
    };

    // Le chargement du début n'est pas une coupure : le guet commence à la première image jouée.
    let started = false;
    const onWaiting = () => {
      if (!started || waitingSince || media.paused || media.seeking) return;
      waitingSince = performance.now();
      waitingAt = media.currentTime;
      waitingAhead = ahead(media);
    };
    const onPlaying = () => {
      started = true;
      if (!waitingSince) return;
      send(performance.now() - waitingSince, waitingAt, 'data', { ahead: waitingAhead });
      waitingSince = 0;
    };
    // Une pause ou un saut voulus ne sont pas des coupures.
    const reset = () => {
      waitingSince = 0;
      frozenSince = 0;
      lastFrames = -1;
      lastTime = -1;
    };

    const isVideo = typeof media.getVideoPlaybackQuality === 'function';
    const probe = setInterval(() => {
      if (!started || media.paused || media.ended || media.seeking || waitingSince || media.readyState < 2) {
        if (frozenSince) send(performance.now() - frozenSince, frozenAt, isVideo ? 'frame' : 'sound', { ahead: ahead(media) });
        frozenSince = 0;
        lastFrames = -1;
        lastTime = -1;
        return;
      }
      const frames = isVideo ? media.getVideoPlaybackQuality().totalVideoFrames : -1;
      const moving = isVideo && media.videoWidth ? frames !== lastFrames : media.currentTime !== lastTime;
      const first = isVideo && media.videoWidth ? lastFrames < 0 : lastTime < 0;
      lastFrames = frames;
      lastTime = media.currentTime;
      if (first) return;
      if (!moving && !frozenSince) {
        frozenSince = performance.now() - PROBE_MS;
        frozenAt = media.currentTime;
      } else if (moving && frozenSince) {
        send(performance.now() - frozenSince, frozenAt, isVideo && media.videoWidth ? 'frame' : 'sound', { ahead: ahead(media) });
        frozenSince = 0;
      }
    }, PROBE_MS);

    media.addEventListener('waiting', onWaiting);
    media.addEventListener('playing', onPlaying);
    media.addEventListener('pause', reset);
    media.addEventListener('seeking', reset);
    return () => {
      stopped = true;
      clearInterval(probe);
      media.removeEventListener('waiting', onWaiting);
      media.removeEventListener('playing', onPlaying);
      media.removeEventListener('pause', reset);
      media.removeEventListener('seeking', reset);
    };
  }

  window.CyberJukeboxStalls = { watch };
})();
