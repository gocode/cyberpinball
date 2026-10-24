// Clé de publication des mises à jour (Ed25519).
//   node scripts/cle-publication.mjs           -> crée la clé si elle n'existe pas, écrit la
//                                                 moitié publique dans packages/core/src/update-key.ts
//   node scripts/cle-publication.mjs --verifier -> vérifie que la clé privée correspond à celle livrée
//
// La clé privée signe le flux de chaque release (scripts/publier.mjs) ; les bornes ne
// font confiance qu'à la clé publique livrée avec l'application. Elle n'est jamais dans
// le dépôt : CYBERPINBALL_MAJ_CLE_PRIVEE, sinon %USERPROFILE%\.cyberpinball\cle-publication-maj.pem.
// À sauvegarder hors de ce poste : perdue, les bornes installées refuseront les mises à
// jour suivantes, et il faudra réinstaller chacune à la main.

import { createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const publicKeyModule = path.join(repo, 'packages', 'core', 'src', 'update-key.ts');

export function privateKeyPath() {
  return process.env.CYBERPINBALL_MAJ_CLE_PRIVEE || path.join(os.homedir(), '.cyberpinball', 'cle-publication-maj.pem');
}

/** Clé privée de publication ; refuse si elle ne correspond pas à la clé publique livrée. */
export function loadPrivateKey() {
  const file = privateKeyPath();
  if (!fs.existsSync(file)) throw new Error(`Clé de publication introuvable : ${file}. Restaurez-la depuis sa sauvegarde (ou CYBERPINBALL_MAJ_CLE_PRIVEE).`);
  const pem = fs.readFileSync(file, 'utf8');
  const derived = createPublicKey(createPrivateKey(pem)).export({ type: 'spki', format: 'pem' }).toString().trim();
  const shipped = /`([^`]+)`/.exec(fs.readFileSync(publicKeyModule, 'utf8'))?.[1].trim();
  if (derived !== shipped) throw new Error(`La clé ${file} ne correspond pas à la clé publique livrée (${publicKeyModule}) : les bornes refuseraient ce flux.`);
  return pem;
}

function writePublicKeyModule(publicPem) {
  fs.writeFileSync(
    publicKeyModule,
    [
      '// Clé publique de publication des mises à jour (Ed25519), écrite par scripts/cle-publication.mjs.',
      '// Seuls les flux signés par la clé privée correspondante sont acceptés (update.ts).',
      '// La changer coupe les bornes déjà installées des mises à jour suivantes.',
      `export const UPDATE_PUBLIC_KEY = \`${publicPem.trim()}\n\`;`,
      '',
    ].join('\n'),
    'utf8',
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = privateKeyPath();
  if (process.argv.includes('--verifier')) {
    loadPrivateKey();
    console.log(`Clé de publication ${file} : correspond à la clé livrée.`);
  } else if (fs.existsSync(file)) {
    console.log(`La clé existe déjà : ${file}. Elle n'est jamais remplacée (les bornes installées en dépendent).`);
    loadPrivateKey();
    console.log('Elle correspond à la clé publique livrée.');
  } else {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, privateKey.export({ type: 'pkcs8', format: 'pem' }), { encoding: 'utf8', mode: 0o600 });
    writePublicKeyModule(publicKey.export({ type: 'spki', format: 'pem' }).toString());
    console.log(`Clé privée : ${file}`);
    console.log(`Clé publique : ${publicKeyModule}`);
    console.log('Sauvegardez la clé privée hors de ce poste (gestionnaire de mots de passe, clé USB) : sans elle, plus de mise à jour pour les bornes installées.');
  }
}
