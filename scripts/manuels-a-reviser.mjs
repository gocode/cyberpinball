// Révision des manuels, une fois par version finale (décision du 17/11/2026).
//
// Pendant les préversions, une branche ne réécrit plus le manuel ni les tests manuels : ses
// nouveautés vont dans changements/<branche>.md, rien de plus. La révision se fait d'un bloc,
// avant de publier une version finale, d'après la liste que donne ce script : les nouveautés de la
// version en cours (section « ## <version finale> » du CHANGELOG) et celles en attente dans
// changements/, moins celles déjà relues. Le relevé des points relus est dans
// scripts/manuels-revises.json (empreintes courtes des textes).
//
//   node scripts/manuels-a-reviser.mjs            -> nouveautés pas encore reportées dans les manuels
//   node scripts/manuels-a-reviser.mjs --fait     -> les manuels sont à jour : toutes notées relues
//   node scripts/manuels-a-reviser.mjs --verifier -> code 1 s'il en reste (publier.mjs, version finale)
//   --racine <dossier> : autre dépôt (essais)

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { changelogSections, fragmentFiles, fragmentNotes } from './traductions.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REVISION_FILE = 'scripts/manuels-revises.json';

/** Empreinte courte d'une nouveauté (espaces normalisés) : le relevé ne recopie pas les textes. */
export const fingerprint = (text) => crypto.createHash('sha1').update(text.replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 12);

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

/**
 * Nouveautés de la version en cours : section « ## <version finale> » du CHANGELOG quand
 * package.json porte une préversion, plus les fichiers en attente de changements/.
 */
export function currentNotes(root = repo) {
  const version = readJson(path.join(root, 'package.json'))?.version ?? '';
  const section = version.includes('-') ? version.replace(/-.*$/, '') : undefined;
  const changelog = path.join(root, 'CHANGELOG.md');
  const sections = changelogSections(fs.existsSync(changelog) ? fs.readFileSync(changelog, 'utf8') : '');
  const notes = (section && sections.get(section)) || [];
  const pending = fragmentFiles(root).flatMap((file) => fragmentNotes(fs.readFileSync(path.join(root, file), 'utf8')).fr);
  return { section, notes: [...pending, ...notes] };
}

/** Nouveautés pas encore reportées dans les manuels. */
export function toReview(root = repo) {
  const revised = new Set(readJson(path.join(root, REVISION_FILE))?.revues ?? []);
  const { section, notes } = currentNotes(root);
  return { section, remaining: notes.filter((n) => !revised.has(fingerprint(n))) };
}

/** Note toutes les nouveautés actuelles comme relues (les anciennes empreintes de la section restent). */
export function markRevised(root = repo) {
  const file = path.join(root, REVISION_FILE);
  const before = readJson(file);
  const { section, notes } = currentNotes(root);
  const keep = before?.section === section ? before.revues ?? [] : [];
  const revues = [...new Set([...keep, ...notes.map(fingerprint)])];
  const text = `${JSON.stringify({ section: section ?? null, date: new Date().toISOString().slice(0, 10), revues }, null, 2)}\n`;
  fs.writeFileSync(file, fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes('\r\n') ? text.replace(/\n/g, '\r\n') : text);
  return { section, count: revues.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const at = argv.indexOf('--racine');
  const root = at >= 0 ? path.resolve(argv[at + 1]) : repo;
  if (argv.includes('--fait')) {
    const { section, count } = markRevised(root);
    console.log(`Manuels notés à jour${section ? ` pour la ${section}` : ''} : ${count} nouveauté(s) relue(s), dans ${REVISION_FILE} (à enregistrer dans git).`);
    process.exit(0);
  }
  const { section, remaining } = toReview(root);
  if (!remaining.length) {
    console.log(`Manuels à jour${section ? ` pour la ${section}` : ''} : aucune nouveauté à reporter.`);
    process.exit(0);
  }
  const out = argv.includes('--verifier') ? console.error : console.log;
  out(`${remaining.length} nouveauté(s)${section ? ` de la ${section}` : ''} à reporter dans les manuels (docs/manuel/, docs/manual/) et les tests manuels, en français et en anglais :`);
  for (const n of remaining) out(`  - ${n}`);
  out('Une fois les manuels relus : node scripts/manuels-a-reviser.mjs --fait, puis commit.');
  process.exit(argv.includes('--verifier') ? 1 : 0);
}
