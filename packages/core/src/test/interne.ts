// Documents de travail du dépôt (dossier interne\ : démonstrations, tests manuels) : présents
// dans le dépôt de développement, absents de la copie publiée (isPrivate,
// scripts/audit-publication.mjs). Les tests qui les relisent se mettent en attente sans eux.

import * as fs from 'node:fs';
import * as path from 'node:path';

export const REPO = path.join(__dirname, '..', '..', '..', '..');
/** Démonstrations sans opérateur et leurs bancs. */
export const DEMOS = path.join(REPO, 'interne', 'demos');
/** Scénarios des tests manuels (français et anglais). */
export const MANUAL_TESTS = path.join(REPO, 'interne', 'tests-manuels');

/** Raison d'attente d'un test qui lit `dir` quand il manque (option skip de node:test). */
export function withoutInternal(dir: string = DEMOS): string | false {
  return fs.existsSync(dir) ? false : 'documents de travail absents (copie publique du dépôt)';
}

/** Fichiers d'un dossier interne (rien quand il manque). */
export function internalFiles(dir: string, keep: RegExp): string[] {
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => keep.test(f)).sort() : [];
}
