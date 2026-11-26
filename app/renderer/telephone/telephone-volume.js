// Volume de la borne au téléphone : le bouton haut-parleur de la barre du haut ouvre une réglette
// (Volume −, le niveau, Volume +, Muet). Elle règle le son de Windows comme les boutons de volume de
// la borne (app/src/cabinet-volume.ts) : au menu, pendant une partie, dans le Juke-box et dans les
// applications ouvertes à la borne. La pastille de la borne montre chaque appui.
//
// Les touches de volume du téléphone ne peuvent pas servir : le navigateur les garde pour le son du
// téléphone et n'en dit rien à la page.
//
// Chargé avant telephone.js : send est le sien, appelé seulement quand la page vit.

'use strict';

/** La réglette se replie seule après ce temps sans appui. */
const VOLUME_IDLE_MS = 6000;
/** Volume − ou Volume + tenu : l'appui se répète, comme sous un vrai bouton. */
const VOLUME_HOLD_MS = 450;
const VOLUME_REPEAT_MS = 160;

/** Dernier état reçu de la borne : { percent, muted }, ou { none: raison }. */
let volumeLevel;
let volumeIdle;
let volumeHold;

const volEl = (id) => document.getElementById(id);

function volumeOpen() {
  return !volEl('volume').hidden;
}

function volumeShow(open) {
  volEl('volume').hidden = !open;
  volEl('top-volume').setAttribute('aria-expanded', String(open));
  clearTimeout(volumeIdle);
  if (!open) return volumeStopHold();
  volumeAwake();
  // Le niveau peut avoir changé à la borne (ses boutons, Windows) : relu à chaque ouverture.
  send({ t: 'vol', c: 'read' });
}

/** Un appui garde la réglette ouverte. */
function volumeAwake() {
  clearTimeout(volumeIdle);
  volumeIdle = setTimeout(() => volumeShow(false), VOLUME_IDLE_MS);
}

function volumeSend(c) {
  volumeAwake();
  send({ t: 'vol', c });
}

function volumeStopHold() {
  clearTimeout(volumeHold);
  volumeHold = undefined;
}

/** Volume − ou Volume + : un pas au toucher, puis des pas tant que le doigt reste. */
function volumeHoldable(button, c) {
  button.addEventListener('pointerdown', (e) => {
    if (button.disabled) return;
    e.preventDefault();
    button.setPointerCapture?.(e.pointerId);
    volumeStopHold();
    volumeSend(c);
    const again = () => {
      volumeSend(c);
      volumeHold = setTimeout(again, VOLUME_REPEAT_MS);
    };
    volumeHold = setTimeout(again, VOLUME_HOLD_MS);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, volumeStopHold);
  // Au clavier (lecteur d'écran) : un pas par activation.
  button.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      volumeSend(c);
    }
  });
}

function volumeRender() {
  const v = volumeLevel;
  const none = Boolean(v?.none);
  const muted = Boolean(v && !none && v.muted);
  const percent = v && !none ? v.percent : 0;
  volEl('top-volume').replaceChildren(cyberIcon(muted ? 'volume-mute' : 'sound'));
  volEl('volume').classList.toggle('muted', muted);
  volEl('volume-fill').style.width = `${percent}%`;
  volEl('volume-track').setAttribute('aria-valuenow', String(percent));
  volEl('volume-track').setAttribute('aria-valuetext', muted ? t('Son coupé') : `${percent} %`);
  volEl('volume-value').textContent = !v ? '…' : none ? '' : muted ? t('Son coupé') : `${percent} %`;
  volEl('volume-mute').setAttribute('aria-label', muted ? t('Rétablir le son') : t('Couper le son'));
  volEl('volume-mute').setAttribute('aria-pressed', String(muted));
  for (const id of ['volume-minus', 'volume-plus', 'volume-mute']) volEl(id).disabled = none;
  volEl('volume-note').hidden = !none;
  volEl('volume-note').textContent = none ? v.none : '';
}

/** Message « volume » de la borne. */
function volumeMessage(m) {
  volumeLevel = typeof m.none === 'string' ? { none: m.none } : { percent: Math.max(0, Math.min(100, Number(m.percent) || 0)), muted: m.muted === true };
  volumeRender();
}

{
  volEl('top-volume').setAttribute('aria-label', t('Volume de la borne'));
  volEl('volume').setAttribute('aria-label', t('Volume de la borne'));
  volEl('volume-minus').replaceChildren(cyberIcon('volume-low'));
  volEl('volume-minus').setAttribute('aria-label', t('Baisser le son'));
  volEl('volume-plus').replaceChildren(cyberIcon('sound'));
  volEl('volume-plus').setAttribute('aria-label', t('Monter le son'));
  volEl('volume-mute').replaceChildren(cyberIcon('volume-mute'));
  volumeRender();
  volEl('top-volume').addEventListener('click', () => volumeShow(!volumeOpen()));
  volumeHoldable(volEl('volume-minus'), 'down');
  volumeHoldable(volEl('volume-plus'), 'up');
  volEl('volume-mute').addEventListener('click', () => volumeSend('mute'));
  // Le téléphone en veille, ou la page quittée : la réglette se replie, un appui tenu s'arrête.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) volumeShow(false);
  });
}
