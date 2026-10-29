// Grilles qui centrent leur contenu (display: grid; place-items: center) : sans pistes bornées,
// la rangée prend la hauteur native de ce qu'elle porte. Une image n'y est plus bornée par
// max-height: 100 % ni par height: 100 %, et sort de sa boîte par le bas. Le 29 octobre 2026, le
// logo du lancement en cinéma (une roue de 1000 px) se posait rogné par le bas du fronton, jamais
// centré ; la roue du menu avait le même défaut pour un logo plus haut que large. Chaque grille
// centrée borne donc ses pistes à sa boîte, sauf celles qui ne portent que du texte ou une
// icône, listées ici avec leur raison. Le garde-fou de mise en page (layout-check.ts) signale de
// son côté toute image qui sort de sa boîte, dans les démonstrations.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';

const RENDERER = path.join(REPO_ROOT, 'app', 'renderer');

/** Grilles centrées sans image : leur contenu, texte ou icône, a sa propre taille. */
const TEXT_ONLY: Record<string, string> = {
  '.cp-fit': 'titre du repli, un texte',
  '.guest-lock-glyph': 'icône du cadenas, taille fixe',
  '.cine-disc': 'médaillon sans logo : le titre en texte',
  '.journey-num': 'numéro d’étape',
  '.state-done .witness-sign,\n.state-short .witness-sign,\n.state-failed .witness-sign': 'signe du bilan, un caractère',
};

/** Règles de la feuille : sélecteur et déclarations, commentaires ôtés. */
function rules(css: string): { selector: string; body: string }[] {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1]!.trim(), body: m[2]! }));
}

test('une grille qui centre une image borne ses pistes à sa boîte', () => {
  const sheets = fs.readdirSync(RENDERER).filter((f) => f.endsWith('.css'));
  const centered: string[] = [];
  for (const sheet of sheets) {
    const css = fs.readFileSync(path.join(RENDERER, sheet), 'utf8').replace(/\r\n/g, '\n');
    for (const { selector, body } of rules(css)) {
      if (!/display:\s*grid/.test(body) || !/place-items:\s*center/.test(body)) continue;
      centered.push(selector);
      if (selector in TEXT_ONLY) continue;
      assert.match(body, /grid-template:\s*minmax\(0,\s*1fr\)\s*\/\s*minmax\(0,\s*1fr\)/, `${sheet} ${selector} : grid-template: minmax(0, 1fr) / minmax(0, 1fr), ou dans TEXT_ONLY s'il ne porte qu'un texte`);
    }
  }
  // Les deux boîtes de logos y sont, et la liste des grilles de texte ne garde rien de périmé.
  for (const box of ['.wheel-tilt', '.cine-logo']) assert.ok(centered.includes(box), box);
  for (const selector of Object.keys(TEXT_ONLY)) assert.ok(centered.includes(selector), `TEXT_ONLY périmé : ${selector}`);
});

test('le logo du lancement en cinéma est borné par sa boîte, pas par sa taille native', () => {
  const css = fs.readFileSync(path.join(RENDERER, 'frontend.css'), 'utf8').replace(/\r\n/g, '\n');
  const img = rules(css).find((r) => r.selector === '.cine-logo img');
  assert.ok(img, '.cine-logo img');
  assert.match(img.body, /max-width:\s*100%/);
  assert.match(img.body, /max-height:\s*100%/);
  assert.match(img.body, /object-fit:\s*contain/);
});
