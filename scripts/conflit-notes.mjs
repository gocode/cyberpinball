// Conflit « note supprimée d'un côté, modifiée de l'autre » sur changements/*.md : résolu sans personne.
//
// Pourquoi (27/11/2026) : une publication fusionne les notes de changements/ dans le CHANGELOG et les supprime de
// proto/ecrans. Une branche qui retouchait sa note entre-temps entrait alors en conflit avec une suppression, et le
// train la laissait en « conflit » : sa session avait fini, personne ne le lisait, le travail restait bloqué.
// La note existe déjà dans le CHANGELOG ; seuls les points que la branche y a ajoutés ou changés sont encore à dire :
// ils passent dans une nouvelle note changements/<nom>-suite.md, jamais perdus en silence.

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const NOTE = /^changements\/[^/\\]+\.md$/;
const NON_FUSIONNES = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU']);

const run = (args, cwd) => spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });

/** Les fichiers non fusionnés de l'arbre : [{ code, file }] (code porcelain : DU = supprimé chez nous, UD = chez eux). */
function unmergedFiles(cwd) {
  return run(['status', '--porcelain', '--untracked-files=no'], cwd).stdout
    .split('\n')
    .filter((l) => NON_FUSIONNES.has(l.slice(0, 2)))
    .map((l) => ({ code: l.slice(0, 2), file: l.slice(3).trim() }));
}

/**
 * Les points « - » de `modifiee` absents de `base`, sous leur titre de langue (« ## Français », « ## English »).
 * Rend le texte d'une nouvelle note, ou '' s'il n'y a rien de neuf.
 */
export function nouveauxPoints(base, modifiee) {
  const vus = new Set(base.split(/\r?\n/).map((l) => l.trim()));
  const parTitre = new Map();
  let titre = '';
  for (const brute of modifiee.split(/\r?\n/)) {
    const ligne = brute.trim();
    if (ligne.startsWith('## ')) titre = ligne;
    else if (ligne.startsWith('- ') && !vus.has(ligne)) parTitre.set(titre, [...(parTitre.get(titre) ?? []), ligne]);
  }
  return [...parTitre].map(([t, points]) => `${t ? `${t}\n\n` : ''}${points.join('\n')}\n`).join('\n');
}

/**
 * Pendant une fusion en conflit dans `cwd` : si tous les fichiers en conflit sont des notes changements/*.md supprimées
 * d'un côté et modifiées de l'autre, les supprime, garde dans une note « -suite » les points que la branche y avait mis
 * de neuf, et termine la fusion. Rend { resolu, fichiers, notes } ; resolu: false si un autre conflit existe (rien touché).
 */
export function resoudreNotesSupprimees(cwd, { say = () => {} } = {}) {
  const conflits = unmergedFiles(cwd);
  if (!conflits.length || !conflits.every((c) => (c.code === 'DU' || c.code === 'UD') && NOTE.test(c.file))) return { resolu: false, fichiers: [], notes: [] };
  const notes = [];
  for (const { code, file } of conflits) {
    const base = run(['show', `:1:${file}`], cwd);
    const modifiee = run(['show', `:${code === 'DU' ? 3 : 2}:${file}`], cwd);
    const suite = base.status === 0 && modifiee.status === 0 ? nouveauxPoints(base.stdout, modifiee.stdout) : '';
    run(['rm', '-q', '--', file], cwd);
    if (!suite) continue;
    let cible = file.replace(/\.md$/, '-suite.md');
    for (let n = 2; fs.existsSync(path.join(cwd, cible)); n++) cible = file.replace(/\.md$/, `-suite-${n}.md`);
    // git rm a pu retirer le dossier avec sa dernière note.
    fs.mkdirSync(path.dirname(path.join(cwd, cible)), { recursive: true });
    fs.writeFileSync(path.join(cwd, cible), suite);
    run(['add', '--', cible], cwd);
    notes.push(cible);
  }
  const fin = run(['commit', '--no-edit', '-q'], cwd);
  if (fin.status !== 0) return { resolu: false, fichiers: [], notes: [], message: `${fin.stdout}${fin.stderr}`.trim().slice(0, 400) };
  const fichiers = conflits.map((c) => c.file);
  say(`Conflit résolu seul : ${fichiers.join(', ')} supprimé de la base par une publication (la note est dans le CHANGELOG)${notes.length ? `, points nouveaux de la branche gardés dans ${notes.join(', ')}` : ''}.`);
  return { resolu: true, fichiers, notes };
}
