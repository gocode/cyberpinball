// Vue passive : ni hasard, ni IPC de lancement. Seul le processus principal choisit et lance.
(() => {
  let token;
  let started = 0;
  let frame;
  let current;
  const root = document.getElementById('table-surprise');
  function stop() { if (frame !== undefined) cancelAnimationFrame(frame); frame = undefined; }
  function item(entry, center) {
    const node = document.createElement('div');
    node.className = center ? 'surprise-item surprise-chosen' : 'surprise-item';
    if (!entry) return node;
    const title = document.createElement('div');
    title.className = 'surprise-title';
    title.textContent = entry.title;
    const logo = entry.wheel && window.CyberMedia?.logo(entry.wheel)?.cloneNode();
    if (logo) {
      logo.addEventListener('error', () => { logo.remove(); title.classList.remove('surprise-with-logo'); }, { once: true });
      node.appendChild(logo);
      title.classList.add('surprise-with-logo');
    }
    node.appendChild(title);
    return node;
  }
  function draw(now) {
    if (!current || !root) return;
    const { entries, selected, duration, phase } = current;
    const progress = phase === 'release' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 1 : Math.min(1, Math.max(0, (now - started) / duration));
    const steps = 28;
    const target = Math.max(0, entries.findIndex((entry) => entry.id === selected));
    const at = ((target - steps + Math.floor((1 - (1 - progress) ** 3) * steps)) % entries.length + entries.length) % entries.length;
    const reel = root.querySelector('.surprise-reel');
    const identity = `${token}:${at}:${phase}`;
    if (reel.dataset.identity !== identity) {
      reel.dataset.identity = identity;
      reel.replaceChildren(...[-1, 0, 1].map((offset) => item(entries[(at + offset + entries.length) % entries.length], offset === 0)));
    }
    root.querySelector('.surprise-hint').textContent = phase === 'release' ? t('Relâche les deux flippers pour jouer · Exit : annuler') : t('Tirage en cours · Exit : annuler');
    if (progress < 1) frame = requestAnimationFrame(draw); else frame = undefined;
  }
  window.CyberTableSurprise = {
    render(view) {
      if (!root) return;
      current = view;
      if (!view) { stop(); token = undefined; root.hidden = true; root.replaceChildren(); return; }
      root.hidden = false;
      if (token !== view.token) {
        stop(); token = view.token; started = performance.now();
        const panel = document.createElement('section'); panel.className = 'surprise-panel';
        const heading = document.createElement('h1'); heading.textContent = t('Table surprise');
        const reel = document.createElement('div'); reel.className = 'surprise-reel';
        const hint = document.createElement('p'); hint.className = 'surprise-hint';
        panel.append(heading, reel, hint); root.replaceChildren(panel);
      }
      if (view.phase === 'preparing') root.querySelector('.surprise-hint').textContent = t('Vérification des tables autorisées…');
      else {
        if (!view.entries.length) return;
        if (!root.querySelector('.surprise-reel').dataset.identity) started = performance.now();
        stop(); draw(performance.now());
      }
    },
  };
})();
