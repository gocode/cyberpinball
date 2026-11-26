// Miroir du navigateur : au téléphone, la fenêtre d'Edge que la borne montre (Applications, connexion
// YouTube du Juke-box), en images, qu'on touche comme sur un téléphone. C'est une option du pavé
// tactile, qui reste là : le bouton « Pavé / Miroir » bascule de l'un à l'autre, et le choix se retient
// le temps de la session de la télécommande (sessionStorage).
//
// La borne n'envoie rien tant que le miroir n'est pas demandé (message « mirror »). Les images
// (« frame », JPEG en base64) arrivent sur la même liaison scellée ; chacune est dessinée dans un
// canvas (sans URL : la page n'a pas le droit de charger d'image d'ailleurs que d'elle-même) puis
// acquittée (« mirror-ack »), et la borne n'en envoie pas d'autre avant. Un appui devient « tap »,
// un glissement « mscroll », un appui long un « tap » du bouton droit : leurs points sont des
// fractions de l'image, la borne les convertit en pixels de la fenêtre.
//
// Limite connue : les vidéos protégées (Netflix, Prime Video, Disney+) sortent noires de la capture
// d'écran ; le miroir n'y peut rien. Il n'affiche aucun texte d'aide : rien d'autre que l'image.
//
// Ce fichier est chargé avant telephone.js : il n'utilise ses globales (send, mode, state, t, $) que
// dans des fonctions appelées plus tard.

const MIRROR_STORE = 'cyberpinball.miroir';
const MIRROR_TAP_MS = 320;
const MIRROR_LONG_MS = 550;
const MIRROR_SLOP = 10;
/** Au plus 1,5 pixel d'image par pixel CSS : au-delà, l'image ne gagne rien et la liaison s'alourdit. */
const MIRROR_DENSITY_MAX = 1.5;
const mirror = {
  /** La borne annonce que cette fenêtre se capture (message « page »). */
  available: false,
  /** Le choix de la personne : le miroir plutôt que le pavé. */
  choice: false,
  /** La demande est partie (et n'a pas été retirée) : la borne capture. */
  asked: false,
  box: undefined,
  /** La borne n'arrive pas à capturer (message « mirror-state »). */
  broken: false,
  /** Une image est en cours de décodage : la suivante, si elle arrive, la remplace (la borne n'en envoie qu'une à la fois). */
  decoding: false,
  hasFrame: false,
  /** Dernière image décodée, gardée pour la redessiner quand la place change (rotation du téléphone). */
  bitmap: undefined,
  /** La fenêtre est en paysage (dernière image). */
  landscape: false,
  /** L'image est dessinée tournée d'un quart de tour : paysage dans une place en portrait. */
  turned: false,
};

try {
  mirror.choice = sessionStorage.getItem(MIRROR_STORE) === 'on';
} catch {
  // Stockage refusé : le choix ne dure que la page.
}
function mirrorRemember() {
  try {
    if (mirror.choice) sessionStorage.setItem(MIRROR_STORE, 'on');
    else sessionStorage.removeItem(MIRROR_STORE);
  } catch {
    // Stockage refusé.
  }
}

const mirrorView = document.getElementById('mirror');
const mirrorCanvas = document.getElementById('mirror-canvas');
const mirrorContext = mirrorCanvas.getContext('2d');
const mirrorTabs = { pad: document.getElementById('mirror-tab-pad'), mirror: document.getElementById('mirror-tab-mirror') };

/** Le miroir est montré : possible, choisi, au navigateur, liaison acceptée, page visible. */
function mirrorWanted() {
  return mirror.available && mirror.choice && mode === 'browser' && state === 'paired' && !document.hidden;
}

/**
 * Une fenêtre en paysage (le fronton) dans une place en portrait : l'image est tournée d'un quart de tour
 * pour remplir la place, et on pivote le téléphone pour la lire. Si la page passe en paysage (téléphone
 * pivoté, verrou accordé), la place est plus large que haute : l'image est alors droite (mirrorLockOrientation).
 */
function mirrorTurns(landscape, areaW, areaH) {
  return landscape && areaH > areaW;
}

/** La place de l'image, en pixels de l'écran du téléphone ; undefined tant que la scène n'a pas de taille (clavier ouvert…). */
function mirrorBox() {
  const r = mirrorView.getBoundingClientRect();
  if (r.width < 8 || r.height < 8) return undefined;
  const k = Math.min(window.devicePixelRatio || 1, MIRROR_DENSITY_MAX);
  const w = Math.min(4000, Math.round(r.width * k));
  const h = Math.min(4000, Math.round(r.height * k));
  // Fenêtre en paysage dans une place en portrait : l'image sera tournée, la borne la prépare pour la place tournée.
  return mirrorTurns(mirror.landscape, r.width, r.height) ? { w: h, h: w } : { w, h };
}

/** Texte du bouton et vue montrée, puis ce que la borne doit savoir. */
function mirrorRefresh() {
  const shown = mirror.available && mode === 'browser';
  document.body.dataset.miroir = !shown ? 'none' : mirror.choice ? 'on' : 'off';
  mirrorTabs.pad.setAttribute('aria-selected', String(!mirror.choice));
  mirrorTabs.mirror.setAttribute('aria-selected', String(mirror.choice));
  mirrorSync();
}

/** Dit à la borne ce qu'il faut : capturer (avec la place de l'image) ou s'arrêter. `force` : redemander même si c'est fait. */
function mirrorSync(force = false) {
  if (mirrorWanted()) {
    const box = mirrorBox();
    if (!box) return;
    const same = mirror.box && mirror.box.w === box.w && mirror.box.h === box.h;
    if (!force && mirror.asked && same) return;
    if (send({ t: 'mirror', on: true, w: box.w, h: box.h })) {
      mirror.asked = true;
      mirror.box = box;
    }
  } else if (mirror.asked) {
    mirror.asked = false;
    send({ t: 'mirror', on: false });
  }
}

function mirrorChoose(on) {
  if (mirror.choice === on) return;
  mirror.choice = on;
  mirrorRemember();
  mirror.broken = false;
  // Aucun texte d'aide en miroir : rien d'autre que l'image (ou, avant elle, un point qui pulse).
  mirrorLockOrientation();
  // Retour au pavé : la borne s'arrête (mirrorSync), et plus rien de l'image ne reste affiché ni attendu.
  if (!on) mirrorClear();
  mirrorRefresh();
}

/**
 * Orientation de la page pendant le miroir : verrouillée sur celle de la fenêtre montrée, pour que la page
 * ne se retourne pas quand on pivote le téléphone. Une fenêtre en paysage (le fronton) : paysage, et on
 * pivote le téléphone pour la lire ; une fenêtre en portrait (TikTok sur le playfield) : portrait. Hors miroir : libre.
 * Android n'accorde le verrou qu'en plein écran, iOS jamais : sans verrou, la place s'adapte toute seule
 * (image tournée d'un quart de tour dans une page en portrait, droite dans une page en paysage ; mirrorTurns).
 */
function mirrorLockOrientation() {
  try {
    const o = screen.orientation;
    if (!o) return;
    if (mirror.choice) o.lock?.(mirror.landscape ? 'landscape' : 'portrait')?.catch?.(() => undefined);
    else o.unlock?.();
  } catch {
    // Verrou refusé ou absent.
  }
}

function mirrorClear() {
  mirror.bitmap?.close?.();
  mirror.bitmap = undefined;
  mirror.landscape = false;
  mirror.turned = false;
  mirror.hasFrame = false;
  mirrorView.classList.remove('has-frame');
  mirrorContext.clearRect(0, 0, mirrorCanvas.width, mirrorCanvas.height);
}

mirrorTabs.pad.addEventListener('click', () => mirrorChoose(false));
mirrorTabs.mirror.addEventListener('click', () => mirrorChoose(true));

// --- Ce que la borne envoie ---------------------------------------------------

/** Message « page » : la fenêtre se capture-t-elle ? Si le miroir est choisi, il est (re)demandé ici : la borne l'oublie à chaque changement de fenêtre. */
function mirrorPage(m) {
  const was = mirror.available;
  mirror.available = m.mirror === true;
  if (!mirror.available) {
    // Plus de fenêtre à capturer : la borne s'est arrêtée d'elle-même.
    mirror.asked = false;
    mirror.box = undefined;
    mirror.broken = false;
    mirrorView.classList.remove('broken');
    if (was) mirrorClear();
  }
  mirrorRefresh();
  if (mirror.available && mirror.choice) mirrorSync(true);
}

/** Message « mode » : hors navigateur, plus de miroir ; de retour, il reprend si c'est le choix. */
function mirrorMode() {
  if (mode !== 'browser') {
    mirror.asked = false;
    mirrorClear();
  }
  mirrorRefresh();
}

/** Liaison coupée : la borne a tout oublié, la demande est à refaire à la reconnexion. */
function mirrorLinkLost() {
  mirror.asked = false;
  mirror.box = undefined;
}

/** Message « mirror-state » : la capture marche (ok) ou la borne n'y arrive pas. */
function mirrorState(m) {
  mirror.broken = m.ok === false;
  mirrorView.classList.toggle('broken', mirror.broken);
}

/** Dessine la dernière image dans le canvas, tournée d'un quart de tour si c'est un paysage dans une place en portrait. */
function mirrorPaint() {
  const b = mirror.bitmap;
  if (!b) return;
  const r = mirrorView.getBoundingClientRect();
  mirror.turned = mirrorTurns(b.width > b.height, r.width, r.height);
  const w = mirror.turned ? b.height : b.width;
  const h = mirror.turned ? b.width : b.height;
  if (mirrorCanvas.width !== w) mirrorCanvas.width = w;
  if (mirrorCanvas.height !== h) mirrorCanvas.height = h;
  mirrorContext.setTransform(1, 0, 0, 1, 0, 0);
  mirrorContext.clearRect(0, 0, w, h);
  // Un quart de tour dans le sens des aiguilles : le haut de l'image passe à droite du téléphone.
  if (mirror.turned) {
    mirrorContext.translate(w, 0);
    mirrorContext.rotate(Math.PI / 2);
  }
  mirrorContext.drawImage(b, 0, 0);
}

/** Message « frame » : une image JPEG, dessinée puis acquittée. */
async function mirrorFrame(m) {
  if (!mirrorWanted() || typeof m.n !== 'number' || typeof m.d !== 'string' || !m.d) return;
  if (mirror.decoding) return;
  mirror.decoding = true;
  try {
    const raw = atob(m.d);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
    // Le miroir a pu être quitté pendant le décodage : rien ne s'affiche (la borne a arrêté).
    if (mirrorWanted()) {
      mirror.bitmap?.close?.();
      mirror.bitmap = bitmap;
      const landscape = bitmap.width > bitmap.height;
      const changed = landscape !== mirror.landscape;
      mirror.landscape = landscape;
      mirrorPaint();
      mirror.hasFrame = true;
      mirror.broken = false;
      mirrorView.classList.add('has-frame');
      mirrorView.classList.remove('broken');
      send({ t: 'mirror-ack', n: m.n });
      // Le sens de l'image vient d'être connu : la borne prépare la taille pour la place telle qu'elle est montrée.
      if (changed) {
        mirrorSync();
        mirrorLockOrientation();
      }
    } else {
      bitmap.close?.();
    }
  } catch {
    // Image illisible : pas d'accusé, la borne reprend d'elle-même après son délai.
  } finally {
    mirror.decoding = false;
  }
}

// --- Ce qu'on fait sur l'image ------------------------------------------------

/** La place de l'image dans la vue (object-fit: contain), en pixels de l'écran ; undefined sans image. */
function mirrorImageRect() {
  if (!mirror.hasFrame) return undefined;
  const r = mirrorView.getBoundingClientRect();
  const nw = mirrorCanvas.width;
  const nh = mirrorCanvas.height;
  if (!nw || !nh || r.width < 1 || r.height < 1) return undefined;
  const k = Math.min(r.width / nw, r.height / nh);
  const w = nw * k;
  const h = nh * k;
  return { x: r.left + (r.width - w) / 2, y: r.top + (r.height - h) / 2, w, h };
}

/** Un point de l'écran en fractions de l'image ; `clamp` : ramené dedans, sinon undefined hors de l'image. */
function mirrorFraction(clientX, clientY, clamp) {
  const r = mirrorImageRect();
  if (!r) return undefined;
  const cx = (clientX - r.x) / r.w;
  const cy = (clientY - r.y) / r.h;
  if (!clamp && (cx < 0 || cx > 1 || cy < 0 || cy > 1)) return undefined;
  // Image tournée : le point du canvas (cx, cy) est, dans la fenêtre, à (cy, 1 - cx).
  const fx = mirror.turned ? cy : cx;
  const fy = mirror.turned ? 1 - cx : cy;
  const c = (v) => Math.round(Math.min(1, Math.max(0, v)) * 10000) / 10000;
  return { fx: c(fx), fy: c(fy) };
}

const mirrorPointers = new Map();
let mirrorGesture;
let mirrorPending = { dx: 0, dy: 0 };
let mirrorFrameId;
let mirrorLongTimer;

function mirrorFlush() {
  mirrorFrameId = undefined;
  const g = mirrorGesture;
  const r = mirrorImageRect();
  if (!g || !r || (!mirrorPending.dx && !mirrorPending.dy)) return;
  // Le doigt a fait dx × dy pixels de l'écran : en fractions de l'image, la borne les rend en pixels de la fenêtre.
  const cdx = mirrorPending.dx / r.w;
  const cdy = mirrorPending.dy / r.h;
  // Image tournée : aller à droite sur le téléphone, c'est monter dans la fenêtre.
  const dx = Math.round((mirror.turned ? cdy : cdx) * 10000) / 10000;
  const dy = Math.round((mirror.turned ? -cdx : cdy) * 10000) / 10000;
  mirrorPending = { dx: 0, dy: 0 };
  if (dx || dy) send({ t: 'mscroll', fx: g.fx, fy: g.fy, dx: Math.max(-2, Math.min(2, dx)), dy: Math.max(-2, Math.min(2, dy)) });
}

mirrorView.addEventListener('pointerdown', (e) => {
  if (state !== 'paired' || !mirror.hasFrame) return;
  mirrorView.setPointerCapture(e.pointerId);
  mirrorPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  e.preventDefault();
  if (mirrorPointers.size > 1) {
    // Deux doigts : ni appui ni glissement (le pincement n'est pas géré).
    clearTimeout(mirrorLongTimer);
    if (mirrorGesture) mirrorGesture.cancelled = true;
    return;
  }
  const at = mirrorFraction(e.clientX, e.clientY, false);
  mirrorGesture = { start: e.timeStamp, x: e.clientX, y: e.clientY, last: { x: e.clientX, y: e.clientY }, moved: false, long: false, cancelled: !at, fx: at?.fx ?? 0, fy: at?.fy ?? 0 };
  clearTimeout(mirrorLongTimer);
  mirrorLongTimer = setTimeout(() => {
    const g = mirrorGesture;
    if (!g || g.moved || g.cancelled || mirrorPointers.size !== 1) return;
    g.long = true;
    if (navigator.vibrate) navigator.vibrate(25);
    send({ t: 'tap', fx: g.fx, fy: g.fy, button: 'right', count: 1 });
  }, MIRROR_LONG_MS);
});

mirrorView.addEventListener('pointermove', (e) => {
  const p = mirrorPointers.get(e.pointerId);
  const g = mirrorGesture;
  if (!p || !g || g.cancelled) return;
  p.x = e.clientX;
  p.y = e.clientY;
  if (!g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) > MIRROR_SLOP) {
    g.moved = true;
    clearTimeout(mirrorLongTimer);
  }
  if (!g.moved || g.long) return;
  mirrorPending.dx += e.clientX - g.last.x;
  mirrorPending.dy += e.clientY - g.last.y;
  g.last = { x: e.clientX, y: e.clientY };
  mirrorFrameId ??= requestAnimationFrame(mirrorFlush);
});

function mirrorRelease(e) {
  if (!mirrorPointers.delete(e.pointerId)) return;
  if (mirrorPointers.size) return;
  clearTimeout(mirrorLongTimer);
  const g = mirrorGesture;
  mirrorGesture = undefined;
  if (!g) return;
  if (g.moved && !g.cancelled) {
    // Ce qui reste du glissement part tout de suite.
    mirrorGesture = g;
    mirrorFlush();
    mirrorGesture = undefined;
    mirrorPending = { dx: 0, dy: 0 };
    return;
  }
  if (g.cancelled || g.long || e.type === 'pointercancel' || e.timeStamp - g.start > MIRROR_TAP_MS) return;
  send({ t: 'tap', fx: g.fx, fy: g.fy, button: 'left', count: 1 });
}
mirrorView.addEventListener('pointerup', mirrorRelease);
mirrorView.addEventListener('pointercancel', mirrorRelease);

// --- La page cachée, la scène qui change de taille ---------------------------------

// Page cachée (écran verrouillé, autre application) : la borne cesse de capturer ; elle reprend au retour.
document.addEventListener('visibilitychange', () => mirrorSync(true));
// Clavier ouvert, rotation : la place de l'image change, la borne en redemande une à la bonne taille.
window.addEventListener('resize', () => {
  mirrorPaint();
  if (mirror.asked) mirrorSync();
});
if (window.ResizeObserver) {
  new ResizeObserver(() => {
    mirrorPaint();
    if (mirror.asked) mirrorSync();
  }).observe(mirrorView);
}
