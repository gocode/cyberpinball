// La souris sur le front-end (21/11/2026) : ce que la borne fait aux boutons, la souris le fait
// aussi, au bureau comme sur une borne qui en a une.
//   - Un clic n'importe où (hors d'un élément qui a sa propre action) réveille un écran que
//     n'importe quel bouton quitte : l'ouverture, le mode attente, le voile de nuit, le préavis
//     d'arrêt. Avant, seul un clic sur un élément cliquable y mettait fin, et l'ouverture, qui n'en
//     a aucun, ne se passait qu'au clavier.
//   - Les flèches dessinées sur la roue (bandeaux Médaillons et Minimaliste) la font tourner
//     d'une table, comme un flipper.
//   - La molette fait tourner la roue (ou la liste des titres), une table par cran.
// frontend.js branche le tout (CyberSouris.install, CyberSouris.arrows) ; le processus principal
// reçoit « wheel » (décalage de la roue, comme un clic sur un médaillon voisin) et « wake » (un
// réveil sans autre effet, frontend.ts).

(() => {
  'use strict';

  /**
   * Flèches dessinées dans les bandeaux (docs/design-system/src/roues/<roue>.svg), en unités du
   * bandeau (1080 × 540, celles de .wheel-stage, --w) : la zone cliquable couvre le trait et un peu
   * autour, sans toucher le médaillon voisin ni la plaque du titre. Bandeau et Arche n'en
   * dessinent pas : pas de zone.
   */
  const ARROWS = {
    medaillons: [
      // Flèches de la roue : M 30,186 L 12,212 L 30,238 (et leur reflet à droite), trait de 6.
      { dir: -1, x: 0, y: 166, w: 50, h: 92 },
      { dir: 1, x: 1030, y: 166, w: 50, h: 92 },
      // Chevrons de la plaque du titre : M 206,384 L 186,406 L 206,428 (et à droite), trait de 5.
      { dir: -1, x: 166, y: 370, w: 54, h: 72 },
      { dir: 1, x: 860, y: 370, w: 54, h: 72 },
    ],
    minimal: [
      // M 30,144 L 12,170 L 30,196 (et à droite).
      { dir: -1, x: 0, y: 124, w: 50, h: 92 },
      { dir: 1, x: 1030, y: 124, w: 50, h: 92 },
    ],
  };

  /** Zones cliquables des flèches de la roue `style`, posées (ou retirées) dans sa scène. */
  function arrows(stage, style) {
    if (stage.dataset.arrows === style) return;
    stage.dataset.arrows = style;
    for (const old of [...stage.children].filter((c) => c.classList.contains('wheel-arrow'))) old.remove();
    for (const a of ARROWS[style] ?? []) {
      const zone = document.createElement('div');
      zone.className = `wheel-arrow ${a.dir < 0 ? 'previous' : 'next'}`;
      zone.dataset.act = JSON.stringify({ type: 'wheel', offset: a.dir });
      zone.style.left = `calc(${a.x} * var(--w))`;
      zone.style.top = `calc(${a.y} * var(--w))`;
      zone.style.width = `calc(${a.w} * var(--w))`;
      zone.style.height = `calc(${a.h} * var(--w))`;
      stage.append(zone);
    }
  }

  /** Un cran de molette, en pixels (Chromium : 100 par cran sous Windows). */
  const NOTCH = 50;
  /** Au plus une table toutes les WHEEL_GAP ms : un pavé tactile envoie des dizaines de petits pas. */
  const WHEEL_GAP = 70;
  /** Un geste qui s'arrête plus longtemps que ça repart de zéro. */
  const WHEEL_REST = 300;

  /**
   * Le pas de roue d'un événement de molette : -1, 0 ou 1. Vers le bas ou vers la droite : la
   * table suivante, comme le flipper droit. Les petits pas d'un pavé tactile s'additionnent
   * jusqu'à un cran ; un changement de sens repart de zéro.
   */
  function wheelStepper() {
    let sum = 0;
    let stepAt = -Infinity;
    let eventAt = -Infinity;
    return (event, now) => {
      const d = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      const px = event.deltaMode === 1 ? d * 40 : event.deltaMode === 2 ? d * 800 : d;
      if (!px) return 0;
      if (now - eventAt > WHEEL_REST || Math.sign(px) !== Math.sign(sum)) sum = 0;
      eventAt = now;
      sum += px;
      if (Math.abs(sum) < NOTCH || now - stepAt < WHEEL_GAP) return 0;
      const dir = Math.sign(sum);
      sum = 0;
      stepAt = now;
      return dir;
    };
  }

  /** Au plus un réveil par demi-seconde : la molette en envoie des rafales. */
  const WAKE_GAP = 500;

  /**
   * Écoute la souris dans la page. `host.waking()` : l'écran se quitte d'un bouton quelconque
   * (ouverture, attente, nuit, préavis) ; `host.wheelArea()` : l'élément où la molette fait
   * tourner la roue, ou rien hors de l'écran des tables.
   */
  function install(host) {
    let wokeAt = -Infinity;
    const wake = () => {
      const now = Date.now();
      if (now - wokeAt < WAKE_GAP) return;
      wokeAt = now;
      window.cyber.act({ type: 'wake' });
    };
    document.addEventListener('click', (event) => {
      // Un élément cliquable a sa propre action (library.js), qui réveille déjà l'écran.
      if (event.target?.closest?.('[data-act]')) return;
      if (host.waking()) wake();
    });
    const step = wheelStepper();
    document.addEventListener(
      'wheel',
      (event) => {
        if (host.waking()) return wake();
        const area = host.wheelArea();
        if (!area || !area.contains(event.target)) return;
        const dir = step(event, Date.now());
        if (dir) window.cyber.act({ type: 'wheel', offset: dir });
      },
      { passive: true },
    );
  }

  window.CyberSouris = { arrows, install, wheelStepper, ARROWS };
})();
