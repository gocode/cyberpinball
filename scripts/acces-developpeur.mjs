// Accès développeur : fabrique le fichier qui ouvre des réglages masqués sur des bornes
// choisies (packages/core/src/dev-access.ts), signé par la clé de publication des mises à
// jour (scripts/cle-publication.mjs).
//
//   node scripts/acces-developpeur.mjs --nom <repère> --borne <empreinte> [--borne <empreinte>…]
//   node scripts/acces-developpeur.mjs --nom <repère> --partout
//
//   --borne    empreinte de la borne, lue dans Menu système > Amis > Partage et réseau, ligne « Votre nom »
//              (« a3f9-12c0-7be4-55d1 », tirets et majuscules indifférents), ou sa clé publique
//              complète ; à répéter pour plusieurs bornes
//   --partout  valable sur toute borne (à garder pour vous)
//   --option   réglage ouvert (par défaut, tous) : telechargement-direct
//   --sortie   fichier écrit (par défaut %USERPROFILE%\.cyberpinball\acces\<repère>.json, hors du dépôt)
//
// Le fichier se dépose, sous le nom acces-developpeur.json, dans le dossier de données de la
// borne ; pris en compte à la prochaine ouverture de l'écran concerné. Le compiler d'abord :
// npm run build (le script lit packages/core/dist).

import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPrivateKey } from './cle-publication.mjs';

const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function values(args, flag) {
  const out = [];
  for (let i = 0; i < args.length; i++) if (args[i] === flag) out.push(args[++i]);
  if (out.some((v) => v === undefined || v.startsWith('--'))) fail(`${flag} attend une valeur.`);
  return out;
}

const args = process.argv.slice(2);
const core = require(path.join(repo, 'packages', 'core', 'dist', 'dev-access.js'));
const sharing = require(path.join(repo, 'packages', 'core', 'dist', 'sharing.js'));

const name = values(args, '--nom')[0];
if (!name?.trim()) fail('Indiquez pour qui est cet accès : --nom <repère>.');
const everywhere = args.includes('--partout');
const cabinets = values(args, '--borne').map((b) => {
  const fingerprint = /^[0-9a-f]{64}$/i.test(b) ? sharing.playerFingerprint(b.toLowerCase()) : core.normalizeFingerprint(b);
  if (!fingerprint) fail(`Empreinte de borne illisible : ${b} (16 caractères, « a3f9-12c0-7be4-55d1 »).`);
  return fingerprint;
});
if (everywhere === Boolean(cabinets.length)) fail('Choisissez : une ou plusieurs --borne <empreinte>, ou --partout.');
const asked = values(args, '--option');
const options = asked.length ? asked : [...core.DEV_OPTIONS];
for (const o of options) if (!core.DEV_OPTIONS.includes(o)) fail(`Option inconnue : ${o} (connues : ${core.DEV_OPTIONS.join(', ')}).`);

const access = { name: name.trim(), options, ...(cabinets.length ? { cabinets: [...new Set(cabinets)] } : {}), date: new Date().toISOString() };
const text = core.signDevAccess(access, loadPrivateKey());
const out = values(args, '--sortie')[0] ?? path.join(os.homedir(), '.cyberpinball', 'acces', `${access.name.replace(/[^\p{L}\p{N}_-]+/gu, '-')}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, text, 'utf8');
console.log(`Accès écrit : ${out}`);
console.log(`Options : ${options.join(', ')} · ${cabinets.length ? `bornes : ${access.cabinets.join(', ')}` : 'toute borne'}`);
console.log('À déposer sous le nom acces-developpeur.json dans le dossier de données de la borne.');
