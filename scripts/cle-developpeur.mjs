// Clé développeur d'une machine (packages/core/src/devkey.ts) : ouvre sur elle les fonctions réservées à
// qui maintient Cyber Pinball (VPX d'essai). Signée ici avec la clé privée de publication des mises à jour,
// qui ne quitte jamais ce poste ; seul le fichier signé va sur l'autre machine.
//
//   node scripts/cle-developpeur.mjs --nom "PC de développement"
//       -> clé de cette machine, écrite dans %USERPROFILE%\.cyberpinball\developpeur.json
//   node scripts/cle-developpeur.mjs --nom PinCab --machine <MachineGuid> --sortie <fichier>
//       -> clé d'une autre machine (son MachineGuid : HKLM\SOFTWARE\Microsoft\Cryptography), à y copier
//          dans %USERPROFILE%\.cyberpinball\developpeur.json
//   node scripts/cle-developpeur.mjs --verifier [--machine <MachineGuid>] [--fichier <fichier>]
//       -> dit si la clé est valable pour cette machine (ou celle indiquée)

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { loadPrivateKey } from './cle-publication.mjs';

const require = createRequire(import.meta.url);
const core = require('../packages/core/dist/index.js');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** MachineGuid de cette machine. */
function localMachineGuid() {
  const out = execFileSync('reg', ['query', String.raw`HKLM\SOFTWARE\Microsoft\Cryptography`, '/v', 'MachineGuid'], { encoding: 'utf8', windowsHide: true });
  const m = /MachineGuid\s+REG_SZ\s+([0-9a-f-]{16,})/i.exec(out);
  if (!m) throw new Error('MachineGuid illisible sur cette machine.');
  return m[1];
}

const machine = arg('--machine') ?? localMachineGuid();
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(machine)) {
  console.error(`MachineGuid inattendu : ${machine}`);
  process.exit(1);
}

if (process.argv.includes('--verifier')) {
  const file = arg('--fichier') ?? core.devKeyFile() ?? 'developpeur.json';
  const ok = core.checkDevKey(core.readDevKeyText(file), machine, core.updatePublicKey());
  console.log(ok ? `Clé développeur ${file} : valable pour cette machine (${ok.nom}).` : `Clé développeur ${file} : absente ou non valable pour cette machine.`);
  process.exit(ok ? 0 : 1);
}

const nom = arg('--nom');
if (!nom) {
  console.error('Indiquez --nom "<nom de la machine>".');
  process.exit(1);
}
const key = core.signDevKey(machine, nom, loadPrivateKey());
// Contrôle immédiat avec la clé publique livrée : une clé qui ne s'ouvrirait pas n'est jamais écrite.
if (!core.checkDevKey(JSON.stringify(key), machine, core.updatePublicKey())) throw new Error('La clé signée ne se vérifie pas avec la clé publique livrée.');
const out = arg('--sortie') ?? core.devKeyFile();
if (!out) throw new Error('Bac à sable (CYBERPINBALL_HOME) : indiquez --sortie.');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(key, null, 2) + '\n', 'utf8');
console.log(`Clé développeur « ${nom} » écrite : ${out}`);
