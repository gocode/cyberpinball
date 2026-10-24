// Signature Authenticode des exécutables, facultative : sans certificat
// configuré, rien n'est signé et la fabrication continue.
//
// Variables d'environnement (une seule des trois façons de désigner le certificat) :
//   CYBERPINBALL_SIGN_PFX       fichier .pfx (certificat et clé privée)
//   CYBERPINBALL_SIGN_PASSWORD  son mot de passe
//   CYBERPINBALL_SIGN_SHA1      empreinte d'un certificat du magasin Windows (clé USB ou HSM :
//                               cas des certificats délivrés depuis 2023)
//   CYBERPINBALL_SIGN_ARGS      arguments signtool à la place des deux précédents (par exemple
//                               /dlib et /dmdf pour un service de signature dans le nuage)
// Facultatives :
//   CYBERPINBALL_SIGN_TIMESTAMP serveur d'horodatage RFC 3161 (défaut : http://timestamp.digicert.com)
//   SIGNTOOL_PATH               signtool.exe à utiliser (défaut : le plus récent des Windows Kits,
//                               sinon celui que fournit electron-builder)

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';

const require = createRequire(import.meta.url);
const env = process.env;

/** Ce qui désigne le certificat, ou undefined si la signature n'est pas configurée. */
function certificateArgs() {
  if (env.CYBERPINBALL_SIGN_ARGS) return splitArgs(env.CYBERPINBALL_SIGN_ARGS);
  if (env.CYBERPINBALL_SIGN_PFX) {
    if (!fs.existsSync(env.CYBERPINBALL_SIGN_PFX)) throw new Error(`CYBERPINBALL_SIGN_PFX : fichier introuvable (${env.CYBERPINBALL_SIGN_PFX}).`);
    return ['/f', env.CYBERPINBALL_SIGN_PFX, ...(env.CYBERPINBALL_SIGN_PASSWORD ? ['/p', env.CYBERPINBALL_SIGN_PASSWORD] : [])];
  }
  if (env.CYBERPINBALL_SIGN_SHA1) return ['/sha1', env.CYBERPINBALL_SIGN_SHA1.replace(/\s/g, '')];
  return undefined;
}

function splitArgs(text) {
  return [...text.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2]);
}

export function signatureConfigured() {
  return certificateArgs() !== undefined;
}

let signtool;
async function findSigntool() {
  if (signtool) return signtool;
  if (env.SIGNTOOL_PATH) return (signtool = env.SIGNTOOL_PATH);
  const kits = path.join(env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Windows Kits', '10', 'bin');
  if (fs.existsSync(kits)) {
    const versions = fs
      .readdirSync(kits)
      .filter((v) => fs.existsSync(path.join(kits, v, 'x64', 'signtool.exe')))
      .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    if (versions.length) return (signtool = path.join(kits, versions.at(-1), 'x64', 'signtool.exe'));
  }
  // Dernier recours : le signtool des Windows Kits qu'electron-builder télécharge (empreinte vérifiée).
  const { getSignToolPath } = require('app-builder-lib/out/toolsets/windows');
  return (signtool = (await getSignToolPath('1.1.0', true)).path);
}

/**
 * Signe un exécutable si un certificat est configuré. Renvoie true s'il est signé.
 * Horodaté : la signature reste valable après l'expiration du certificat.
 */
export async function sign(file, description = 'Cyber Pinball') {
  const cert = certificateArgs();
  if (!cert) return false;
  const tool = await findSigntool();
  const args = [
    'sign',
    '/fd', 'sha256',
    '/tr', env.CYBERPINBALL_SIGN_TIMESTAMP ?? 'http://timestamp.digicert.com',
    '/td', 'sha256',
    '/d', description,
    ...cert,
    file,
  ];
  const run = spawnSync(tool, args, { encoding: 'utf8' });
  if (run.status !== 0) {
    const output = `${run.stdout ?? ''}${run.stderr ?? ''}`.replaceAll(env.CYBERPINBALL_SIGN_PASSWORD || '\0', '***');
    throw new Error(`Signature impossible de ${file} (signtool, code ${run.status}) :\n${output}`);
  }
  console.log(`Signé : ${file}`);
  return true;
}
