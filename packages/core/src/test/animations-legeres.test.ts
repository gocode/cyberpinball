// Animations légères (21/11/2026). Mesuré en 2160 × 3840 sur la vraie page de la roue : le fondu de la
// couleur de la table, posé sur :root, faisait recalculer les styles de toute la page à chaque image
// (30 à 50 ms par changement de table, 40 images par seconde au lieu de 60) ; l'éclat du médaillon et
// le reflet du filet des menus se déplaçaient par left (mise en page à chaque image, sans fin pour le
// reflet). Invariants fixés pour toutes les feuilles du rendu :
// - une propriété enregistrée héritée (@property … inherits: true) ne glisse jamais sur :root, html ou
//   body, ni dans un @keyframes : chaque image restylerait toute la page ;
// - un @keyframes n'anime pas de propriété de mise en page (left, width, letter-spacing…), sauf les
//   arrivées jouées une fois ci-dessous, et aucune animation sans fin n'en anime ;
// - aucun filtre ne glisse (transition), ni ne s'anime sans fin, ni ne s'anime dans la roue.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { APP } from './menu-renderer';

const RENDERER = path.join(APP, 'renderer');

/** Feuilles du rendu (téléphone compris), sans commentaires. */
function sheets(): { file: string; css: string }[] {
  const out: { file: string; css: string }[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.css')) out.push({ file: path.relative(RENDERER, p).replace(/\\/g, '/'), css: fs.readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '') });
    }
  };
  walk(RENDERER);
  return out;
}

/** Blocs de règles les plus internes : sélecteur (ou étape d'un @keyframes) et déclarations. */
function rules(css: string): { selector: string; body: string }[] {
  return [...css.matchAll(/([^{};]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1]!.trim(), body: m[2]! }));
}

/** @keyframes : nom, ligne et contenu. */
function keyframes(css: string): { name: string; line: number; body: string }[] {
  const out: { name: string; line: number; body: string }[] = [];
  const re = /@keyframes\s+([\w-]+)\s*\{/g;
  for (let m = re.exec(css); m; m = re.exec(css)) {
    let i = re.lastIndex;
    for (let depth = 1; depth && i < css.length; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') depth--;
    }
    out.push({ name: m[1]!, line: css.slice(0, m.index).split('\n').length, body: css.slice(re.lastIndex, i - 1) });
  }
  return out;
}

const LAYOUT = /^(left|right|top|bottom|inset|width|height|min-width|min-height|max-width|max-height|margin(-[a-z]+)*|padding(-[a-z]+)*|letter-spacing|word-spacing|font-size|line-height|border-width|gap|flex-basis)$/;

/**
 * Arrivées jouées une fois, où la mise en page change pour de bon : le titre qui se resserre
 * (écrans de menu, moment de niveau, maquettes validées), l'onde du pointeur du téléphone sur l'écran.
 */
const ONE_SHOT: Record<string, string> = {
  'library.css lib-titre': 'titre d’un écran de menu à son ouverture (letter-spacing), une fois',
  'niveau.css lm-spread': 'titre du moment de niveau, une fois',
  'niveau.css lm-up': 'titre du moment de niveau, une fois',
  'remote-pointer.css ring': 'onde d’un appui du pointeur du téléphone, 320 ms',
};

test('animations : aucune propriété de mise en page animée, hors arrivées jouées une fois', () => {
  const found: string[] = [];
  for (const { file, css } of sheets()) {
    for (const k of keyframes(css)) {
      const props = [...new Set([...k.body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]!).filter((p) => LAYOUT.test(p)))];
      if (!props.length) continue;
      const key = `${file} ${k.name}`;
      if (!ONE_SHOT[key]) {
        found.push(`${file}:${k.line} @keyframes ${k.name} anime ${props.join(', ')} : passer par transform (translate, scale)`);
        continue;
      }
      // Une arrivée gardée ne tourne jamais en boucle.
      for (const r of rules(css)) {
        for (const decl of r.body.matchAll(/animation(?:-name)?\s*:([^;]*)/g)) {
          if (new RegExp(`(^|[\\s,])${k.name}([\\s,;]|$)`).test(decl[1]!) && /\binfinite\b/.test(decl[1]!)) found.push(`${file} : ${k.name} (${ONE_SHOT[key]}) joué sans fin dans « ${r.selector} »`);
        }
      }
    }
  }
  assert.deepEqual(found, []);
});

// Un filtre (ombres floues, flou) se repeint à chaque image où il change. Le halo vert de la roue
// faisait glisser le sien : 48 images par seconde au lieu de 58 aux appuis isolés. Il passe désormais
// d'un calque fixe à l'autre par l'opacité. Restent permis : les arrivées jouées une fois hors de la roue.
test('animations : aucun filtre animé dans la roue, en transition ni sans fin', () => {
  const found: string[] = [];
  const FILTER = /(^|[\s;{])(filter|backdrop-filter)\s*:/;
  for (const { file, css } of sheets()) {
    for (const r of rules(css)) {
      for (const decl of r.body.matchAll(/transition(?:-property)?\s*:([^;]*)/g)) if (/\b(backdrop-)?filter\b/.test(decl[1]!)) found.push(`${file} : « ${r.selector} » fait glisser un filtre`);
    }
    for (const k of keyframes(css)) {
      if (!FILTER.test(k.body)) continue;
      if (file === 'frontend.css') found.push(`${file}:${k.line} @keyframes ${k.name} anime un filtre (roue, écran des tables) : passer par l'opacité de calques fixes`);
      for (const r of rules(css)) {
        for (const decl of r.body.matchAll(/animation(?:-name)?\s*:([^;]*)/g)) {
          if (new RegExp(`(^|[\\s,])${k.name}([\\s,;]|$)`).test(decl[1]!) && /\binfinite\b/.test(decl[1]!)) found.push(`${file} : ${k.name} anime un filtre sans fin (« ${r.selector} »)`);
        }
      }
    }
  }
  assert.deepEqual(found, []);
});

test('animations : une couleur ou une valeur héritée ne glisse jamais sur toute la page', () => {
  const all = sheets();
  const inherited = new Set<string>();
  for (const { css } of all) {
    for (const m of css.matchAll(/@property\s+(--[\w-]+)\s*\{([^}]*)\}/g)) if (/inherits\s*:\s*true/.test(m[2]!)) inherited.add(m[1]!);
  }
  assert.ok(inherited.has('--table-tint'), 'la teinte de la table est une propriété enregistrée héritée (theme.css)');
  const root = (selector: string) => selector.split(',').some((s) => /^(?::root|html|body)(?![\w-])/.test(s.trim()) && !/[\s>+~]/.test(s.trim()));
  const found: string[] = [];
  for (const { file, css } of all) {
    for (const r of rules(css)) {
      if (!root(r.selector)) continue;
      for (const decl of r.body.matchAll(/(transition(?:-property)?)\s*:([^;]*)/g)) {
        for (const name of inherited) if (new RegExp(`${name}(?![\\w-])`).test(decl[2]!)) found.push(`${file} : « ${r.selector} » fait glisser ${name}, héritée par toute la page`);
      }
    }
    for (const k of keyframes(css)) {
      for (const name of inherited) if (new RegExp(`${name}\\s*:`).test(k.body)) found.push(`${file}:${k.line} @keyframes ${k.name} anime ${name}, propriété héritée`);
    }
  }
  assert.deepEqual(found, []);
});

test('teinte de la table : chaque surface qui la lit en fondu porte sa copie non héritée', () => {
  const theme = fs.readFileSync(path.join(RENDERER, 'theme.css'), 'utf8');
  assert.match(theme, /@property --teinte\s*\{[^}]*inherits:\s*false/, '--teinte : copie locale, non héritée');
  const css = fs.readFileSync(path.join(RENDERER, 'frontend.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  // Les règles qui lisent --teinte sont toutes dans la liste des surfaces qui la recopient et la font glisser.
  const carriers = rules(css).find((r) => /--teinte\s*:\s*var\(--table-tint\)/.test(r.body) && /transition\s*:\s*--teinte\b/.test(r.body));
  assert.ok(carriers, 'une règle recopie la teinte (--teinte) et la fait glisser');
  const listed = new Set(carriers.selector.split(',').map((s) => s.trim()));
  const readers = rules(css).filter((r) => /var\(--teinte\)/.test(r.body) && !/@keyframes/.test(r.selector));
  assert.ok(readers.length >= 5, `surfaces teintées trouvées : ${readers.length}`);
  for (const r of readers) {
    for (const s of r.selector.split(',').map((x) => x.trim())) assert.ok(listed.has(s), `« ${s} » lit var(--teinte) sans la recopier : sa couleur resterait à la sarcelle`);
  }
});
