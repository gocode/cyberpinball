// Pointeur du téléphone (remote-pointer.html, app/src/phone-remote.ts). Le processus principal
// donne la place de la pointe à chaque geste ; la flèche y glisse, à chaque image de l'écran,
// d'une poursuite amortie (constante de temps TAU) : les gestes arrivent par paquets irréguliers
// du Wi-Fi, la flèche avance sans à-coups, à peine en retard. Un saut (première liaison) la pose
// d'un coup.
const box = document.getElementById('pointer');
const ring = document.getElementById('ring');
const TIP = 16;
const TAU = 26;

let goal;
let now;
let frame;
let last = 0;

function draw() {
  box.style.transform = `translate(${now.x - TIP}px, ${now.y - TIP}px)`;
}

function step(time) {
  frame = undefined;
  const dt = last ? Math.min(64, time - last) : 16;
  last = time;
  const k = 1 - Math.exp(-dt / TAU);
  now = { x: now.x + (goal.x - now.x) * k, y: now.y + (goal.y - now.y) * k };
  if (Math.hypot(goal.x - now.x, goal.y - now.y) < 0.4) {
    now = { ...goal };
    last = 0;
  } else frame = requestAnimationFrame(step);
  draw();
}

function flash() {
  ring.classList.remove('on');
  void ring.offsetWidth;
  ring.classList.add('on');
}

window.cyberPointer?.on((m) => {
  if (!m || typeof m !== 'object') return;
  if (typeof m.x === 'number' && typeof m.y === 'number') {
    goal = { x: m.x, y: m.y };
    if (!now || m.jump || box.hidden) {
      now = { ...goal };
      draw();
    } else frame ??= requestAnimationFrame(step);
  }
  if (typeof m.show === 'boolean') box.hidden = !m.show;
  if (m.flash) flash();
});

// Pour les essais : où la flèche est dessinée.
window.pointerDrawn = () => (now && !box.hidden ? { ...now } : null);
