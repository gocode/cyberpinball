/* Saisie locale. Le processus principal ne transmet que le chiffre actif et les cases masquées. */
(() => {
  const root = document.getElementById('parental-pin');
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  const panel = make('section', 'parental-pin-panel');
  const title = make('h2', 'parental-pin-title');
  const digits = make('div', 'parental-pin-digits');
  const boxes = Array.from({ length: 4 }, () => make('span', 'parental-pin-digit'));
  const status = make('p', 'parental-pin-status');
  const hint = make('p', 'parental-pin-hint');
  digits.append(...boxes);
  status.setAttribute('aria-live', 'polite');
  panel.append(title, digits, status, hint);
  root.append(panel);
  window.CyberParentalPin = (view) => {
    root.hidden = !view;
    if (!view) {
      boxes.forEach((box) => { box.textContent = ''; });
      return;
    }
    title.textContent = view.title;
    hint.textContent = view.hint;
    status.textContent = view.status || '';
    for (const [index, box] of boxes.entries()) {
      box.textContent = view.digits[index];
      box.classList.toggle('parental-pin-current', index === view.index);
    }
  };
})();
