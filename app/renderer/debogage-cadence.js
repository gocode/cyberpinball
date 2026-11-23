// Mode débogage (app/src/debogage.ts) : la cadence de cette fenêtre du front-end, comptée par requestAnimationFrame
// seulement quand le processus principal le demande (mode allumé, front-end à l'écran) ; éteint, aucune image n'est
// comptée et rien ne tourne. Une mesure par seconde : images par seconde et plus longue image, envoyées avec le rôle
// de la fenêtre (window.cyber.debugPace). Aussi : au bout de combien de temps un média de la roue est prêt
// (media.js, CyberDebug.mediaReady), pour le temps de chargement de la table choisie.

(() => {
  'use strict';
  if (window.CyberDebug) return;

  const role = new URLSearchParams(location.search).get('role') || 'playfield';
  let on = false;
  let frame = 0;
  let last = 0;
  let since = 0;
  let count = 0;
  let worst = 0;

  function tick(now) {
    frame = 0;
    if (!on) return;
    if (document.hidden) {
      last = 0;
      since = 0;
      count = 0;
      worst = 0;
    } else {
      if (last) {
        const d = now - last;
        count++;
        if (d > worst) worst = d;
      }
      last = now;
      if (!since) since = now;
      if (now - since >= 1000) {
        window.cyber?.debugPace?.({ role, fps: (count * 1000) / (now - since), worst: Math.round(worst) });
        since = now;
        count = 0;
        worst = 0;
      }
    }
    frame = requestAnimationFrame(tick);
  }

  window.cyber?.onDebugPace?.((value) => {
    on = Boolean(value);
    if (on && !frame && typeof requestAnimationFrame === 'function') {
      last = 0;
      since = 0;
      count = 0;
      worst = 0;
      frame = requestAnimationFrame(tick);
    }
  });

  window.CyberDebug = {
    /** Un média de la roue est prêt : `ms` après qu'on l'a demandé. */
    mediaReady(ms, kind) {
      if (on) window.cyber?.debugMedia?.({ role, ms: Math.round(ms), kind });
    },
  };
})();
