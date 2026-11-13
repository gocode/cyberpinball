// Charte des modérateurs des salons (packages/core/src/moderation.ts) : la liste des clés de joueur
// qui peuvent masquer une ligne, mettre en sourdine, exclure et poser le sujet d'un salon. Signée par
// la clé du projet (celle des mises à jour, scripts/cle-publication.mjs), livrée avec l'application
// dans packages/core/src/moderation-charter.ts et relayée de borne en borne : une charte au numéro
// plus grand remplace l'ancienne sur toutes les bornes.
//   node scripts/charte-moderation.mjs                      -> montre la charte livrée
//   node scripts/charte-moderation.mjs --ajouter <clé>      -> ajoute une clé de joueur (64 caractères hexadécimaux)
//   node scripts/charte-moderation.mjs --retirer <clé>      -> la retire
// La clé de joueur d'une borne se lit dans Menu système > Amis > Partage et réseau (identifiant) ou
// dans <données>\social.json (key.publicKey : la moitié publique seulement). Après un changement :
// npm test, puis une version publiée pour que la nouvelle charte parte avec l'application.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createPrivateKey, sign } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadPrivateKey } from './cle-publication.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const moduleFile = path.join(repo, 'packages', 'core', 'src', 'moderation-charter.ts');

function current() {
  const text = fs.readFileSync(moduleFile, 'utf8');
  const json = /BUNDLED_CHARTER: unknown = (\{[\s\S]*?\});/.exec(text)?.[1];
  return json ? JSON.parse(json) : { version: 0, moderators: [] };
}

// Le texte signé : le même que charterText (moderation.ts), dans cet ordre.
const charterText = (c) => JSON.stringify({ app: 'cyberpinball', kind: 'moderation-charter', version: c.version, moderators: c.moderators, at: c.at });

const args = process.argv.slice(2);
const add = args.indexOf('--ajouter') >= 0 ? args[args.indexOf('--ajouter') + 1] : undefined;
const remove = args.indexOf('--retirer') >= 0 ? args[args.indexOf('--retirer') + 1] : undefined;
const was = current();
if (!add && !remove) {
  console.log(`Charte n° ${was.version} : ${was.moderators.length} modérateur(s)`);
  for (const k of was.moderators) console.log(`  ${k}`);
  process.exit(0);
}
for (const k of [add, remove].filter(Boolean)) if (!/^[0-9a-f]{64}$/.test(k)) throw new Error(`Clé de joueur invalide : ${k} (64 caractères hexadécimaux attendus).`);
let moderators = [...was.moderators];
if (add && !moderators.includes(add)) moderators.push(add);
if (remove) moderators = moderators.filter((k) => k !== remove);
if (moderators.length === was.moderators.length && moderators.every((k, i) => k === was.moderators[i])) {
  console.log('Charte inchangée.');
  process.exit(0);
}
const base = { version: was.version + 1, moderators, at: new Date().toISOString() };
const charter = { ...base, sig: sign(null, Buffer.from(charterText(base), 'utf8'), createPrivateKey(loadPrivateKey())).toString('base64') };
fs.writeFileSync(
  moduleFile,
  `// Charte des modérateurs livrée avec Cyber Pinball (moderation.ts), signée par la clé du projet :\n` +
    `// écrite par scripts/charte-moderation.mjs, jamais à la main (la signature ne tiendrait plus).\n` +
    `// Seules des clés publiques de joueur y figurent, jamais un nom.\n` +
    `export const BUNDLED_CHARTER: unknown = ${JSON.stringify(charter, null, 2)};\n`,
);
console.log(`Charte n° ${charter.version} écrite : ${moderators.length} modérateur(s).`);
