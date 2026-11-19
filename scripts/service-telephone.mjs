// Mise en ligne du service de t.cyberpinball.com (packages/service-telephone : adresse stable du
// téléphone et retours des joueurs), sur Cloudflare Workers. Le compte est celui de
// `npx wrangler login` (gardé par wrangler dans le profil de l'utilisateur, jamais dans le dépôt) ;
// rien ici n'est secret.
//
//   node scripts/service-telephone.mjs preparer   copie dans public/ le chiffrement et les icônes de la page du téléphone
//   node scripts/service-telephone.mjs kv         crée l'espace KV « ADRESSES » et inscrit son identifiant dans wrangler.toml
//   node scripts/service-telephone.mjs d1         crée la base D1 « cyberpinball-retours », inscrit son identifiant dans
//                                                 wrangler.toml, puis lui applique schema.sql (rejouable)
//   node scripts/service-telephone.mjs deployer   prépare, applique schema.sql à la base D1, puis met le service en ligne
//                                                 (wrangler deploy), puis lance le rattrapage des traductions
//
// Les fichiers copiés ne sont pas suivis par git (packages/service-telephone/.gitignore) : la page
// du service et celle de la borne partagent ainsi le même chiffrement, sans double à tenir.

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SERVICE_DIR = path.join(root, 'packages', 'service-telephone');
/** Fichiers de la page du téléphone repris par la page du service. */
export const COPIED = ['telephone-core.js', 'icone-180.png', 'icone-192.png'];
const WRANGLER = ['--yes', 'wrangler@4'];

export function prepare() {
  for (const f of COPIED) fs.copyFileSync(path.join(root, 'app', 'renderer', 'telephone', f), path.join(SERVICE_DIR, 'public', f));
}

function wrangler(args) {
  return execFileSync('npx', [...WRANGLER, ...args], { cwd: SERVICE_DIR, encoding: 'utf8', shell: process.platform === 'win32', stdio: ['inherit', 'pipe', 'inherit'] });
}

const toml = path.join(SERVICE_DIR, 'wrangler.toml');
const PLACEHOLDER = 'A_REMPLIR_A_LA_PREMIERE_MISE_EN_LIGNE';
/** Marqueur propre à la base D1, distinct de celui de l'espace KV : chaque commande ne remplit que le sien. */
export const D1_PLACEHOLDER = 'A_REMPLIR_D1';
export const D1_NAME = 'cyberpinball-retours';

function createKv() {
  const text = fs.readFileSync(toml, 'utf8');
  if (!text.includes(PLACEHOLDER)) return console.log('Espace KV déjà inscrit dans wrangler.toml.');
  const out = wrangler(['kv', 'namespace', 'create', 'ADRESSES']);
  const id = /id\s*=\s*"([0-9a-f]{32})"/.exec(out)?.[1] ?? /"id":\s*"([0-9a-f]{32})"/.exec(out)?.[1];
  if (!id) throw new Error(`identifiant de l'espace KV introuvable dans la réponse de wrangler :\n${out}`);
  fs.writeFileSync(toml, text.replace(PLACEHOLDER, id));
  console.log(`Espace KV ADRESSES créé (${id}) et inscrit dans wrangler.toml.`);
}

/** Inscrit l'identifiant de la base D1 à la place de son marqueur (et de lui seul). */
export function writeD1Id(text, out) {
  const id = /database_id\s*[=:]\s*"([0-9a-f-]{36})"/.exec(out)?.[1];
  if (!id) throw new Error(`identifiant de la base D1 introuvable dans la réponse de wrangler :\n${out}`);
  return { id, text: text.replace(`database_id = "${D1_PLACEHOLDER}"`, `database_id = "${id}"`) };
}

/** Applique schema.sql à la base en ligne : rejouable (CREATE … IF NOT EXISTS). */
function applySchema() {
  process.stdout.write(wrangler(['d1', 'execute', D1_NAME, '--remote', '--file', 'schema.sql']));
}

function createD1() {
  const text = fs.readFileSync(toml, 'utf8');
  if (text.includes(D1_PLACEHOLDER)) {
    const { id, text: next } = writeD1Id(text, wrangler(['d1', 'create', D1_NAME]));
    fs.writeFileSync(toml, next);
    console.log(`Base D1 ${D1_NAME} créée (${id}) et inscrite dans wrangler.toml.`);
  } else console.log('Base D1 déjà inscrite dans wrangler.toml.');
  applySchema();
}

function deploy() {
  const text = fs.readFileSync(toml, 'utf8');
  if (text.includes(PLACEHOLDER)) throw new Error('espace KV pas encore créé : node scripts/service-telephone.mjs kv');
  if (text.includes(D1_PLACEHOLDER)) throw new Error('base D1 des retours pas encore créée : node scripts/service-telephone.mjs d1');
  prepare();
  applySchema();
  let out;
  try {
    out = wrangler(['deploy']);
  } catch (e) {
    // wrangler peut finir sur un code non nul après un déploiement réussi (19/11/2026, Windows) : sa
    // sortie fait foi, sinon le rattrapage des traductions serait sauté à tort.
    if (!deployedOk(e.stdout)) throw e;
    out = e.stdout;
    console.warn(`wrangler a fini sur le code ${e.status} après un déploiement réussi.`);
  }
  process.stdout.write(out);
}

/** La sortie de `wrangler deploy` confirme la mise en ligne : le Worker envoyé, puis ses déclencheurs. */
export function deployedOk(stdout) {
  return typeof stdout === 'string' && /Uploaded \S+/.test(stdout) && /Deployed \S+ triggers/.test(stdout);
}

/**
 * Rattrapage des traductions au déploiement : lire la liste suffit, le service comble alors en tâche
 * de fond les versions manquantes (propositions d'avant, langue ajoutée) ; le cron horaire fait le reste.
 */
async function kickTranslations() {
  try {
    const r = await fetch('https://t.cyberpinball.com/api/propositions', { signal: AbortSignal.timeout(30_000) });
    console.log(`Rattrapage des traductions lancé (HTTP ${r.status}).`);
  } catch (e) {
    console.log(`Rattrapage des traductions : liste injoignable (${e.message}), le cron horaire s'en chargera.`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const what = process.argv[2];
  if (what === 'preparer') prepare();
  else if (what === 'kv') createKv();
  else if (what === 'd1') createD1();
  else if (what === 'deployer') {
    deploy();
    await kickTranslations();
  }
  else {
    console.error('Usage : node scripts/service-telephone.mjs preparer | kv | d1 | deployer');
    process.exit(2);
  }
}
