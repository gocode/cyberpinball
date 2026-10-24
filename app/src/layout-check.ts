// Garde-fou de mise en page, pour les essais sans opérateur : après chaque touche
// rejouée, chaque fenêtre est inspectée dans son rendu réel. Sont signalés :
// - deux textes ou commandes qui se chevauchent à l'écran (le compte à rebours
//   dessiné sur les boutons d'action, par exemple) ;
// - un texte ou une commande qui sort de la fenêtre ;
// - un texte coupé par un conteneur qui masque ce qui dépasse (overflow: hidden),
//   lui-même compris ;
// - une image ou une vidéo qui ne se charge pas (protocole des médias non branché,
//   fichier absent, format illisible) : l'aperçu montrerait une icône cassée.
// Une superposition voulue (aide, menu par-dessus le menu des tables) n'est pas un
// chevauchement : le calque du dessus a un fond opaque qui cache celui du dessous.
// Une coupure voulue non plus : « … » posé par le texte ou par le conteneur qui le coupe
// (text-overflow n'est pas hérité), ou nombre de lignes limité (-webkit-line-clamp) ;
// seule la partie visible d'un texte compte alors (les lignes masquées ne chevauchent rien).
// Un texte limité en lignes qui coupe vraiment doit avoir un interligne d'au moins 1,2 :
// plus serré, l'accent d'une capitale de la ligne masquée dépasse sous la dernière ligne
// gardée (Saira dépasse sa ligne de 0,24 em vers le haut).
// Un voile décoratif (data-veil) ne doit jamais passer au-dessus d'un texte : le texte
// resterait là, mais assombri (menu en borne, octobre 2026).
// Enfin, les zones marquées data-stable (menu des tables) ne doivent pas bouger d'une
// touche à l'autre : même fenêtre, même taille, même présentation, même position au
// demi-pixel près. Changer de table ne change que leur contenu.
// Les problèmes vont dans la console et dans <captures>\mise-en-page.txt.

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { WebContents } from 'electron';

/** Exécuté dans la page : renvoie la liste des problèmes, en clair. */
const SCRIPT = /* i18n-ignore : script de page, du code ; ses constats vont au rapport du développeur */ String.raw`(() => {
  const T = 2;
  const vw = innerWidth, vh = innerHeight;
  const label = (el) => {
    const text = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50);
    const id = el.id ? '#' + el.id : '';
    const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : '';
    return el.tagName.toLowerCase() + id + cls + (text ? ' « ' + text + ' »' : '');
  };
  const shown = (el) => {
    for (let e = el; e; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.05) return false;
    }
    return true;
  };
  // Somme des rotations des ancêtres : un quart de tour couche le texte.
  const quarterTurned = (el) => {
    let angle = 0;
    for (let e = el; e; e = e.parentElement) {
      const m = getComputedStyle(e).transform.match(/^matrix\(([^)]+)\)/);
      if (m) {
        const [a, b] = m[1].split(',').map(Number);
        angle += Math.atan2(b, a);
      }
    }
    return Math.abs(Math.sin(angle)) > 0.7;
  };
  const boxes = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = walker.nextNode()); ) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement;
    if (!el || !shown(el)) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    // La boîte d'un texte va de l'ascendante à la descendante de la police (environ
    // 1,33 fois sa taille) : avec un interligne serré, deux lignes voisines se
    // recouvrent sans que leurs lettres se touchent. On garde la hauteur de la police.
    // Dans une vue pivotée d'un quart de tour (playfield vu de côté), cette hauteur est horizontale.
    const size = parseFloat(getComputedStyle(el).fontSize);
    const sideways = quarterTurned(el);
    for (const r of range.getClientRects()) {
      if (r.width <= 1 || r.height <= 1) continue;
      if (sideways) {
        const inset = Math.max(0, (r.width - size) / 2);
        boxes.push({ el, text: true, r: { left: r.left + inset, right: r.right - inset, top: r.top, bottom: r.bottom } });
      } else {
        const inset = Math.max(0, (r.height - size) / 2);
        boxes.push({ el, text: true, r: { left: r.left, right: r.right, top: r.top + inset, bottom: r.bottom - inset } });
      }
    }
  }
  for (const el of document.querySelectorAll('button, [data-act], input, select, textarea')) {
    if (!shown(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 1 && r.height > 1) boxes.push({ el, r });
  }
  const problems = new Set();
  const opaque = (el) => {
    const c = getComputedStyle(el).backgroundColor.match(/[\d.]+/g);
    return c && (c.length < 4 ? true : Number(c[3]) >= 0.8);
  };
  // Le calque de « top » cache-t-il « bottom » par un fond opaque, entre eux deux ?
  const masked = (top, bottom, x, y) => {
    for (let e = top; e && !e.contains(bottom); e = e.parentElement) {
      const r = e.getBoundingClientRect();
      if (opaque(e) && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
    }
    return false;
  };
  // Coupure voulue par ce conteneur : « … » en fin de ligne, ou lignes limitées.
  const truncates = (e) => {
    const s = getComputedStyle(e);
    return s.textOverflow === 'ellipsis' || (s.webkitLineClamp && s.webkitLineClamp !== 'none');
  };
  // Partie réellement visible de chaque boîte : un conteneur qui masque ce qui dépasse
  // la rogne (ce qui dépasse est signalé plus bas comme coupé, pas comme chevauchement).
  // Pour un texte, l'élément qui le porte compte aussi (lignes masquées par line-clamp).
  const seen = boxes.map(({ el, r, text }) => {
    let v = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    for (let e = text ? el : el.parentElement; e && e !== document.body; e = e.parentElement) {
      const s = getComputedStyle(e);
      if ([s.overflowX, s.overflowY].every((o) => o === 'visible')) continue;
      const c = e.getBoundingClientRect();
      v = { left: Math.max(v.left, c.left), right: Math.min(v.right, c.right), top: Math.max(v.top, c.top), bottom: Math.min(v.bottom, c.bottom) };
    }
    return v;
  });
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i];
    for (let j = i + 1; j < boxes.length; j++) {
      const b = boxes[j];
      if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const va = seen[i], vb = seen[j];
      const w = Math.min(va.right, vb.right) - Math.max(va.left, vb.left);
      const h = Math.min(va.bottom, vb.bottom) - Math.max(va.top, vb.top);
      if (w <= T || h <= T) continue;
      const x = Math.max(va.left, vb.left) + w / 2;
      const y = Math.max(va.top, vb.top) + h / 2;
      const hit = document.elementFromPoint(x, y);
      if (!hit) continue;
      const onA = a.el === hit || a.el.contains(hit) || hit.contains(a.el);
      const onB = b.el === hit || b.el.contains(hit) || hit.contains(b.el);
      if (!onA && !onB) continue; // un troisième élément couvre les deux
      const [top, bottom] = onA ? [a.el, b.el] : [b.el, a.el];
      if (masked(top, bottom, x, y)) continue;
      const at = (v) => '[' + [v.left, v.top, v.right, v.bottom].map(Math.round).join(', ') + ']';
      problems.add('chevauchement : ' + [label(a.el) + ' ' + at(va), label(b.el) + ' ' + at(vb)].sort().join(' et '));
    }
  }
  boxes.forEach(({ el, r }, i) => {
    let scrolled = false;
    // Coupure voulue : « … » ou lignes limitées, par le texte lui-même ou par le premier
    // conteneur qui le coupe. Elle n'excuse que ce conteneur : ce qui en reste visible (les
    // lignes gardées) ne doit être rogné par aucun autre. Un titre limité à deux lignes dans
    // une zone haute d'une seule perdait sa première ligne sans être signalé (octobre 2026).
    let kept = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    let excuse = truncates(el);
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const s = getComputedStyle(e);
      const clip = [s.overflowX, s.overflowY];
      if (clip.some((o) => o === 'auto' || o === 'scroll')) { scrolled = true; break; }
      if (!clip.some((o) => o === 'hidden' || o === 'clip')) continue;
      const c = e.getBoundingClientRect();
      if (excuse || truncates(e)) {
        kept = { left: Math.max(kept.left, c.left), right: Math.min(kept.right, c.right), top: Math.max(kept.top, c.top), bottom: Math.min(kept.bottom, c.bottom) };
        excuse = false;
        if (kept.right - kept.left <= T || kept.bottom - kept.top <= T) break; // ligne masquée par la coupure voulue
        continue;
      }
      if (kept.left < c.left - T || kept.right > c.right + T || kept.top < c.top - T || kept.bottom > c.bottom + T) {
        problems.add('coupé : ' + label(el) + ' par ' + label(e).slice(0, 60));
        break;
      }
    }
    // Hors de la fenêtre : la partie visible seulement (un texte coupé avec « … » reste dedans).
    const v = seen[i];
    if (!scrolled && v.right - v.left > T && v.bottom - v.top > T && (v.left < -T || v.top < -T || v.right > vw + T || v.bottom > vh + T)) problems.add('hors de la fenêtre : ' + label(el));
  });
  // Lignes limitées avec un interligne trop serré : l'encre de la ligne masquée dépasse.
  for (const el of document.querySelectorAll('*')) {
    const s = getComputedStyle(el);
    if (!s.webkitLineClamp || s.webkitLineClamp === 'none' || !shown(el)) continue;
    if (el.scrollHeight <= el.clientHeight + 1) continue;
    const ratio = parseFloat(s.lineHeight) / parseFloat(s.fontSize);
    if (ratio < 1.19) problems.add('interligne trop serré (' + ratio.toFixed(2) + ') pour des lignes limitées : ' + label(el));
  }
  // Voile décoratif (data-veil) dessiné au-dessus d'un texte : le texte est là mais
  // assombri. Le voile, sans pointeur, est rendu « touchable » le temps de la mesure.
  const veils = [...document.querySelectorAll('[data-veil]')];
  if (veils.length) {
    const saved = veils.map((v) => v.style.pointerEvents);
    veils.forEach((v) => (v.style.pointerEvents = 'auto'));
    boxes.forEach(({ el }, i) => {
      if (veils.some((v) => v.contains(el))) return;
      const s = seen[i];
      if (s.right - s.left <= T || s.bottom - s.top <= T) return;
      const stack = document.elementsFromPoint((s.left + s.right) / 2, (s.top + s.bottom) / 2);
      const veil = stack.findIndex((e) => veils.includes(e));
      const text = stack.findIndex((e) => e === el || el.contains(e) || e.contains(el));
      if (veil >= 0 && text >= 0 && veil < text) problems.add('sous un voile : ' + label(el));
    });
    veils.forEach((v, i) => (v.style.pointerEvents = saved[i]));
  }
  // Image chargée sans pixels, vidéo en erreur : l'écran montrerait un aperçu cassé.
  for (const img of document.images) if (img.complete && img.getAttribute('src') && img.naturalWidth === 0) problems.add('image non chargée : ' + img.getAttribute('src').slice(0, 120));
  for (const video of document.querySelectorAll('video')) if (video.error) problems.add('vidéo non chargée : ' + (video.getAttribute('src') || '').slice(0, 120));
  return [...problems];
})()`;

/** Position des zones data-stable de la page, et ce qui doit être égal pour les comparer (taille, présentation). */
const STABLE = String.raw`(() => {
  const zones = {};
  for (const el of document.querySelectorAll('[data-stable]')) {
    const r = el.getBoundingClientRect();
    zones[el.dataset.stable] = [r.left, r.top, r.width, r.height].map((v) => Math.round(v * 2) / 2);
  }
  const shape = [innerWidth, innerHeight, ...[...document.querySelectorAll('[data-stable-shape]')].map((e) => e.dataset.stableShape)].join(' ');
  return { shape, zones };
})()`;

type Stable = { shape: string; zones: Record<string, number[]> };

/** Zones data-stable qui ont bougé depuis le relevé précédent de la même page. */
function moved(before: Stable | undefined, now: Stable): string[] {
  if (!before || before.shape !== now.shape) return [];
  const out: string[] = [];
  for (const [name, box] of Object.entries(now.zones)) {
    const old = before.zones[name];
    if (old && old.some((v, i) => Math.abs(v - box[i]!) > 0.5)) out.push(`zone déplacée : ${name} [${old.join(', ')}] → [${box.join(', ')}]`); // i18n-ignore : rapport de mise en page, pour le développeur
  }
  return out;
}

/** Problèmes de mise en page de la page affichée ; vide si tout va bien (ou si la page n'a pas répondu). */
export async function checkLayout(contents: WebContents): Promise<string[]> {
  try {
    return (await contents.executeJavaScript(SCRIPT)) as string[];
  } catch {
    return [];
  }
}

/** Relevé des problèmes d'un essai sans opérateur, écrit dans <captures>\mise-en-page.txt. */
export class LayoutReport {
  private readonly lines: string[] = [];
  /** Dernier relevé des zones stables de chaque page (par identifiant de WebContents). */
  private readonly stable = new Map<number, Stable>();

  /** Erreurs non rattrapées de chaque page suivie, pas encore relevées. */
  private readonly errors = new Map<number, string[]>();

  constructor(private readonly captureDir: string | undefined) {}

  /**
   * Erreurs non rattrapées de la page : une page qui plante peut rester vide sans que la
   * mise en page y trouve rien à redire (catalogue de traduction absent, par exemple).
   */
  private watch(contents: WebContents): string[] {
    let list = this.errors.get(contents.id);
    if (list) return list;
    const errors: string[] = [];
    list = errors;
    this.errors.set(contents.id, errors);
    contents.on('console-message', (event) => {
      if (event.level === 'error' && /^Uncaught\b/.test(event.message)) errors.push(`erreur de la page : ${event.message}`); // i18n-ignore : rapport de mise en page, pour le développeur
    });
    return list;
  }

  async check(contents: WebContents, where: string): Promise<void> {
    const errors = this.watch(contents);
    let now: Stable | undefined;
    try {
      now = (await contents.executeJavaScript(STABLE)) as Stable;
    } catch {
      now = undefined;
    }
    const shifts = now ? moved(this.stable.get(contents.id), now) : [];
    if (now) this.stable.set(contents.id, now);
    for (const problem of [...errors.splice(0), ...(await checkLayout(contents)), ...shifts]) {
      const line = `${where} : ${problem}`;
      console.log(`Mise en page : ${line}`);
      this.lines.push(line);
    }
  }

  /** Écrit le relevé (même vide : son absence voudrait dire que le contrôle n'a pas tourné). */
  save(): void {
    if (!this.captureDir) return;
    fs.mkdirSync(this.captureDir, { recursive: true });
    const text = this.lines.length ? this.lines.join('\n') : 'Aucun problème de mise en page.'; // i18n-ignore : rapport de mise en page, pour le développeur
    fs.writeFileSync(path.join(this.captureDir, 'mise-en-page.txt'), `${text}\n`, 'utf8');
    console.log(`Mise en page : ${this.lines.length} problème${this.lines.length > 1 ? 's' : ''}.`);
  }
}
