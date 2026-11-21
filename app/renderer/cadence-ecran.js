// Fluidité de l'écran des tables, relevée sur la borne elle-même (21/11/2026). Les mesures de la roue
// avaient été faites sur un PC de développement ; ce relevé donne celles de chaque borne, dans son
// journal. Rien ne tourne au repos : seulement pendant le défilement (frontend.js, wheelMoved appelle
// watch), le rythme des images du plateau est compté par requestAnimationFrame. Au plus une fois par
// minute d'activité, et en quittant l'écran des tables (flush), un résumé part au processus principal
// (window.cyber.screenPace), qui l'écrit au journal (screen-pace.ts).
//
//   CyberCadence.watch()   // un appui vient de faire glisser la roue : relève pendant WATCH_MS
//   CyberCadence.flush()   // l'écran des tables est quitté : le résumé en attente part

(() => {
  'use strict';
  if (window.CyberCadence) return;

  /** Relevé après chaque appui : le glissement (320 ms), l'arrêt et ses effets (souffle, éclat). */
  const WATCH_MS = 1500;
  /** Une image plus longue est « lente » (60 Hz : 16,7 ms ; une image sautée : 33 ms). */
  const SLOW_MS = 25;
  /** Au plus un résumé par minute. */
  const REPORT_EVERY_MS = 60_000;

  let until = 0;
  let last = 0;
  let frame = 0;
  let lastReport = performance.now();
  let sum = fresh();

  function fresh() {
    return { frames: 0, slow: 0, worst: 0, ms: 0, hist: new Map() };
  }

  function tick(t) {
    frame = 0;
    if (document.hidden) {
      last = 0;
      return;
    }
    if (last) {
      const d = t - last;
      sum.frames++;
      sum.ms += d;
      if (d > SLOW_MS) sum.slow++;
      if (d > sum.worst) sum.worst = d;
      // Rythme habituel de l'écran : l'intervalle le plus fréquent, au dixième de milliseconde.
      const k = Math.round(d * 10) / 10;
      sum.hist.set(k, (sum.hist.get(k) ?? 0) + 1);
    }
    last = t;
    if (t < until) frame = requestAnimationFrame(tick);
    else {
      last = 0;
      report(false);
    }
  }

  function watch() {
    until = performance.now() + WATCH_MS;
    if (!frame && typeof requestAnimationFrame === 'function') frame = requestAnimationFrame(tick);
  }

  function report(force) {
    if (!sum.frames) return;
    const now = performance.now();
    if (!force && now - lastReport < REPORT_EVERY_MS) return;
    lastReport = now;
    let usual = 0;
    let most = 0;
    for (const [k, n] of sum.hist) {
      if (n > most) {
        most = n;
        usual = k;
      }
    }
    window.cyber?.screenPace?.({
      frames: sum.frames,
      slow: sum.slow,
      worst: Math.round(sum.worst),
      seconds: Math.round(sum.ms / 100) / 10,
      usual,
      width: Math.round(innerWidth * devicePixelRatio),
      height: Math.round(innerHeight * devicePixelRatio),
    });
    sum = fresh();
  }

  window.CyberCadence = { watch, flush: () => report(true) };
})();
