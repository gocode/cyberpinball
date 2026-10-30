// Fabrique les installeurs de Cyber Pinball à partir de release\win-unpacked :
//   release\CyberPinball-Setup.exe          version légère : VPX téléchargé au premier lancement
//   release\CyberPinball-Setup-complet.exe  version complète : archive officielle de VPX incluse
//
// Appelé par « node scripts/fabriquer.mjs --installeur » (option --leger : sans la
// version complète). Le script NSIS est scripts\installeur\cyberpinball.nsi.
//
// L'archive de VPX de la version complète est prise, dans l'ordre, dans
// CYBERPINBALL_VPX_ARCHIVE, dans cache\downloads\, sinon téléchargée dans
// cache\downloads\. Son empreinte SHA-256 est toujours vérifiée contre le manifeste
// (packages\installer\components.json) : une archive différente n'est jamais embarquée.
//
// Licence de VPX (docs\license.txt de l'archive) : GPLv3+ pour l'essentiel, licence
// dérivée de MAME pour le reste, qui autorise la redistribution à condition qu'elle
// ne soit ni vendue ni utilisée dans un produit ou une activité commerciale, et
// qu'elle reproduise la licence. L'archive est embarquée telle quelle, avec sa
// licence et l'adresse de ses sources ; la version complète ne doit jamais être vendue.

import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sign } from './signature.mjs';

const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const release = path.join(repo, 'release');
const unpacked = path.join(release, 'win-unpacked');
const work = path.join(repo, 'build', 'installeur');
const script = path.join(repo, 'scripts', 'installeur', 'cyberpinball.nsi');
const icon = path.join(repo, 'app', 'ressources', 'icone.ico');
const banner = path.join(repo, 'app', 'ressources', 'installeur-bandeau.bmp');

function step(text) {
  console.log(`\n> ${text}`);
}

async function makensis(defines) {
  // NSIS 3 tel qu'electron-builder le fournit (téléchargé une fois, empreinte vérifiée).
  const { getMakeNsisPath } = require('app-builder-lib/out/toolsets/windows');
  const tool = await getMakeNsisPath();
  const args = ['/V2', '/INPUTCHARSET', 'UTF8', ...Object.entries(defines).map(([k, v]) => (v === true ? `/D${k}` : `/D${k}=${v}`)), script];
  const run = spawnSync(tool.path, args, { env: { ...process.env, ...tool.env }, encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`makensis a échoué (code ${run.status}) :\n${run.stdout}${run.stderr}`);
  const warnings = run.stdout.split(/\r?\n/).filter((l) => /warning/i.test(l));
  for (const w of warnings) console.log(`  ${w}`);
}

/** Version Windows à quatre nombres (0.1.0 -> 0.1.0.0). */
function windowsVersion(version) {
  const parts = version.split(/[.+-]/).filter((p) => /^\d+$/.test(p)).slice(0, 4);
  while (parts.length < 4) parts.push('0');
  return parts.join('.');
}

/** Archive de VPX vérifiée, et la notice de licence qui l'accompagne. */
async function vpxArchive() {
  const installer = path.join(repo, 'packages', 'installer', 'dist');
  const { findComponent, downloadComponent } = require(path.join(installer, 'index.js'));
  const { sha256OfFile } = require(path.join(installer, 'fsutil.js'));
  const vpx = findComponent('vpx');
  const name = path.basename(new URL(vpx.url).pathname);

  let archive = process.env.CYBERPINBALL_VPX_ARCHIVE;
  if (!archive) {
    const cache = path.join(repo, 'cache', 'downloads');
    console.log(`Archive de VPX ${vpx.version} : ${path.join(cache, name)}`);
    archive = await downloadComponent(vpx, cache, (received, total) => {
      if (received === total || received % (16 * 1024 * 1024) < 65536) process.stdout.write(`\r  ${Math.round(received / 1e6)} / ${Math.round(total / 1e6)} Mo`);
    });
    process.stdout.write('\n');
  }
  if (path.basename(archive) !== name) throw new Error(`L'archive de VPX doit s'appeler ${name} (reçu : ${archive}).`);
  const actual = await sha256OfFile(archive);
  if (actual !== vpx.sha256) throw new Error(`Empreinte SHA-256 incorrecte pour ${archive} : attendu ${vpx.sha256}, obtenu ${actual}.`);
  console.log(`Empreinte vérifiée : ${actual}`);

  // La licence est lue dans l'archive elle-même, pas recopiée à la main.
  const licenseDir = path.join(work, 'licence-vpx');
  fs.rmSync(licenseDir, { recursive: true, force: true });
  fs.mkdirSync(licenseDir, { recursive: true });
  // Le tar de Windows : celui de Git pour Windows ne lit pas les zip.
  const tar = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
  execFileSync(tar, ['-xf', archive, '-C', licenseDir, 'docs/license.txt']);
  const license = fs.readFileSync(path.join(licenseDir, 'docs', 'license.txt'), 'utf8');
  if (!/may not be sold, nor may they be used in a commercial/.test(license) || !/GNU General Public License/.test(license)) {
    throw new Error('La licence de VPX a changé : relisez docs/license.txt avant de redistribuer l’archive.');
  }
  const notice = path.join(work, `${name}.licence.txt`);
  fs.writeFileSync(
    notice,
    [
      `Visual Pinball X ${vpx.version} (${vpx.variant ?? ''}, ${vpx.platform})`,
      '',
      `Archive officielle, inchangée, publiée sur ${vpx.homepage}`,
      `  ${vpx.url}`,
      `  SHA-256 ${vpx.sha256}`,
      `Code source correspondant : ${vpx.source}`,
      '',
      'Livrée par la version complète de l’installeur de Cyber Pinball, gratuitement.',
      'Licence : GPLv3+ pour la majorité des fichiers, licence dérivée de MAME pour le reste.',
      'Cette dernière permet de redistribuer VPX à condition de ne pas vendre la redistribution,',
      'de ne pas l’utiliser dans un produit ou une activité commerciale, et de reproduire la licence.',
      'Cette version complète ne doit donc être ni vendue, ni livrée avec une borne vendue ou',
      'exploitée commercialement : dans ce cas, c’est à l’exploitant de vérifier la licence de VPX.',
      '',
      'Texte complet de la licence (docs/license.txt de l’archive) :',
      '',
      '==============================================================================',
      '',
      license,
    ].join('\r\n'),
    'utf8',
  );
  return { vpx, archive, name, notice };
}

export async function buildInstallers({ complete = true } = {}) {
  const exe = path.join(unpacked, 'CyberPinball.exe');
  if (!fs.existsSync(exe)) throw new Error(`${exe} manque : lancez d'abord la fabrication de l'exécutable.`);
  const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));
  const version = process.env.CYBERPINBALL_VERSION_ESSAI || pkg.version;
  // Le site de « Programmes et fonctionnalités » : le dépôt, celui des mises à jour.
  const site = pkg.repository.url.replace(/\.git$/, '');
  // La règle « Cyber Pinball VPX » du pare-feu vise la version de VPX que l'application installera,
  // par le dossier de sa version et par la jonction current (packages/core/src/firewall.ts).
  const vpx = JSON.parse(fs.readFileSync(path.join(repo, 'packages', 'installer', 'components.json'), 'utf8')).components.find((c) => c.id === 'vpx');
  if (!vpx?.executable || !new RegExp(vpx.executablePattern).test(vpx.executable)) throw new Error('components.json : l’exécutable de VPX (executable) manque ou ne répond pas à executablePattern.');
  const vpxDir = vpx.installDir.split('/').join('\\');
  const common = { VERSION: version, VERSION_WIN: windowsVersion(version), ICONE: icon, BANDEAU: banner, SITE: site, VPX_PAREFEU_REEL: `${vpxDir}\\${vpx.version}\\${vpx.executable}`, VPX_PAREFEU_JONCTION: `${vpxDir}\\current\\${vpx.executable}` };
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });

  step('Désinstalleur');
  // Écrit par un premier installeur, pour pouvoir le signer avant de l'embarquer.
  const writer = path.join(work, 'ecrire-desinstalleur.exe');
  const uninstaller = path.join(work, 'desinstalleur.exe');
  await makensis({ ...common, ECRIRE_DESINSTALLEUR: true, DESINSTALLEUR_ECRIVAIN: writer, DESINSTALLEUR_SORTIE: uninstaller });
  spawnSync(writer, ['/S'], { stdio: 'inherit' });
  if (!fs.existsSync(uninstaller)) throw new Error('Le désinstalleur n’a pas été écrit.');
  await sign(uninstaller, 'Désinstalleur de Cyber Pinball');

  const outputs = [];
  const build = async (file, extra) => {
    const out = path.join(release, file);
    fs.rmSync(out, { force: true });
    await makensis({ ...common, SORTIE: out, APP_DIR: unpacked, DESINSTALLEUR: uninstaller, ...extra });
    await sign(out, 'Installeur de Cyber Pinball');
    outputs.push(out);
  };

  step('Installeur, version légère');
  await build('CyberPinball-Setup.exe', {});

  if (complete) {
    step('Installeur, version complète (avec Visual Pinball X)');
    const { vpx, archive, name, notice } = await vpxArchive();
    await build('CyberPinball-Setup-complet.exe', {
      COMPLET: true,
      VPX_ARCHIVE: archive,
      VPX_ARCHIVE_NOM: name,
      VPX_NOTICE: notice,
      VPX_VERSION: vpx.version,
    });
  }

  console.log('');
  for (const out of outputs) console.log(`Installeur : ${out} (${(fs.statSync(out).size / 1024 ** 2).toFixed(1)} Mio)`);
  return outputs;
}
