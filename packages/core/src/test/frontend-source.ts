// Le code du front-end tel qu'il a été écrit, pour les tests qui le relisent par motif.
//
// frontend.ts a été découpé (17/11/2026) : des blocs entiers en sont sortis tels quels, chacun dans
// une fabrique `create…(ctx)` d'un module à lui. Le découpage n'a changé que trois choses autour
// du code déplacé : frontend.ts lit le bloc par sa façade (`vrFront.headset`), le bloc lit l'état
// vivant du front-end par son contexte (`ctx.state`), et le corps de la fabrique est indenté. Ce
// texte rassemble frontend.ts et ces modules en retirant exactement ces trois marques : les motifs
// des tests vérifient le même code qu'avant, où qu'il soit rangé. Un nouveau bloc sorti de
// frontend.ts par la même méthode s'inscrit dans FRONTEND_PARTS.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { REPO_ROOT } from './i18n-scan';

export interface FrontendPart {
  /** Le module, dans app/src. */
  file: string;
  /** La fabrique dont le corps est le code déplacé. */
  factory: string;
  /** Le nom de sa façade dans frontend.ts (`<facade>.<nom>`). */
  facade: string;
  /** Les noms du front-end que le bloc lit par `ctx.<nom>` (son état vivant). */
  live: string[];
}

export const FRONTEND_PARTS: FrontendPart[] = [
  // La Vision 3D lit l'état du front-end par des fonctions (`ctx.playing()`), pas des accesseurs : rien à retirer.
  { file: 'vision3d-menu.ts', factory: 'createVision3dMenu', facade: 'vision3dMenu', live: [] },
  { file: 'vr-frontend.ts', factory: 'createVrFrontend', facade: 'vrFront', live: ['KEYS', 'launch', 'menuConfiguration', 'playing', 'roleRects', 'rotation', 'state', 'tables'] },
];

const readSrc = (file: string) => fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', file), 'utf8').replace(/\r\n/g, '\n');

/**
 * Blocs sortis de la fermeture createLibrary (library.ts) : leur code y était déjà indenté d'un
 * niveau, comme dans leur fabrique ; seuls la façade et les `ctx.` sont à retirer.
 */
export const LIBRARY_PARTS: FrontendPart[] = [];

/** Le corps de la fabrique d'un module, sans son indentation ni ses `ctx.` : le code tel qu'il était dans frontend.ts. */
export function partSource(part: FrontendPart, indent = 2): string {
  const text = readSrc(part.file);
  const head = text.indexOf(`export function ${part.factory}(`);
  if (head < 0) throw new Error(`${part.file} : fabrique ${part.factory} introuvable`);
  const start = text.indexOf('\n', head) + 1;
  const end = text.lastIndexOf('\n  return {\n');
  if (end < start) throw new Error(`${part.file} : façade introuvable`);
  const body = text
    .slice(start, end)
    .split('\n')
    .map((line) => (indent && line.startsWith(' '.repeat(indent)) ? line.slice(indent) : line))
    .join('\n');
  return part.live.length ? body.replace(new RegExp(`\\bctx\\.(${part.live.join('|')})\\b`, 'g'), '$1') : body;
}

/** frontend.ts sans les préfixes des façades, suivi du code de chaque bloc qui en est sorti. */
export function frontendSource(): string {
  let text = readSrc('frontend.ts');
  for (const part of FRONTEND_PARTS) text = text.replace(new RegExp(`\\b${part.facade}\\.`, 'g'), '');
  return [text, ...FRONTEND_PARTS.map((part) => partSource(part))].join('\n');
}

/** library.ts sans les préfixes des façades, suivi du code de chaque bloc sorti de createLibrary. */
export function librarySource(): string {
  let text = readSrc('library.ts');
  for (const part of LIBRARY_PARTS) text = text.replace(new RegExp(`\\b${part.facade}\\.`, 'g'), '');
  return [text, ...LIBRARY_PARTS.map((part) => partSource(part, 0))].join('\n');
}
