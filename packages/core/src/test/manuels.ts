// Documents découpés (scripts/decoupage.mjs) : le manuel technique et les tests manuels tiennent
// en un sommaire (docs/manuel.md…) et un fichier par rubrique (docs/manuel/…). Les tests qui les
// relisent passent par ici : la liste des fichiers vient du sommaire, dans son ordre.

import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO = path.join(__dirname, '..', '..', '..', '..');

export const MANUEL = 'docs/manuel.md';
export const MANUAL = 'docs/manual.md';
/** Tests manuels (documents internes, absents de la copie publiée). */
export const TESTS_MANUELS = 'interne/tests-manuels/tests-manuels.md';
export const MANUAL_TESTS_EN = 'interne/tests-manuels/manual-tests.md';

/** Rubriques d'un sommaire : titres « ## [Titre](dossier/rubrique.md) ». */
const ENTRY = /^#{1,6} \[.+\]\(([^)\s]+\.md)\)\s*$/;

/** Fichiers d'un document découpé, chemins relatifs au dépôt (« / ») : le sommaire puis ses rubriques ; rien s'il manque. */
export function splitFiles(summary: string): string[] {
  const full = path.join(REPO, summary);
  if (!fs.existsSync(full)) return [];
  const entries = fs
    .readFileSync(full, 'utf8')
    .split(/\r?\n/)
    .map((line) => ENTRY.exec(line)?.[1])
    .filter((f): f is string => !!f)
    .map((f) => path.posix.join(path.posix.dirname(summary), decodeURI(f)));
  return [summary, ...entries];
}

/** Chaque fichier d'un document découpé et son texte. */
export function splitDocs(summary: string): { file: string; text: string }[] {
  return splitFiles(summary)
    .filter((f) => fs.existsSync(path.join(REPO, f)))
    .map((file) => ({ file, text: fs.readFileSync(path.join(REPO, file), 'utf8') }));
}

/** Texte entier d'un document découpé : sommaire et rubriques mis bout à bout. */
export function splitText(summary: string): string {
  return splitDocs(summary)
    .map((d) => d.text)
    .join('\n');
}
