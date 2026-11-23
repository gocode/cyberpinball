// Sources du VPX corrigé (packages/vpx-corrige), publiées une fois par version du correctif dans une release GitHub à
// part du dépôt public : licences de VPX (GPLv3+, et licence héritée de MAME qui demande, pour un binaire modifié, le
// code source complet, celui des composants qu'il utilise compris). L'archive réunit exactement ce que la construction
// a téléchargé (sources de VPX au commit de la 5436, SDL3, SDL_image, SDL_ttf, FreeImage, bgfx, OpenXR, FFmpeg,
// libdmdutil, libpupdmd, PinMAME, et pour dof64.dll : libdof, libusb, libserialport, hidapi, libftdi), les correctifs
// (correctifs et correctifs-libdof), la recette et les
// licences. La release n'a ni numéro de version ni flux de mise à jour : les bornes ne la lisent pas (update.ts).
//   node scripts/vpx-corrige-sources.mjs            -> crée la release si elle manque (jeton : scripts/jeton-github.mjs)
//   node scripts/vpx-corrige-sources.mjs --archive  -> l'archive seule, dans build\vpx-corrige
// Appelé par la publication (publier.mjs) avant chaque release : un binaire modifié ne part jamais sans ses sources.

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { githubToken, missingTokenMessage } from './jeton-github.mjs';
import { VPX_BASE, VPX_CORRIGE_SOURCE, vpxCorrigeSrcDir, vpxCorrigeWorkDir } from './vpx-corrige.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { copyTree } = createRequire(import.meta.url)(path.join(repo, 'packages', 'core', 'dist', 'copytree.js'));

/** L'étiquette de la release des sources : une par série de correctifs (sources-vpx-10.8.1-5436-patched-cyberpinball-1). */
export const VPX_SOURCES_TAG = `sources-vpx-10.8.1-${VPX_BASE.revision}-patched-cyberpinball-${VPX_BASE.patch}`;
export const VPX_SOURCES_NAME = `${VPX_SOURCES_TAG}.zip`;

/** Construit l'archive des sources à partir des téléchargements de la construction ; renvoie son chemin. */
export function vpxSourcesArchive() {
  const dl = path.join(vpxCorrigeWorkDir(), 'dl');
  const tarballs = fs.existsSync(dl) ? fs.readdirSync(dl).filter((f) => f.endsWith('.tar.gz')) : [];
  for (const needed of [VPX_BASE.commit, 'SDL-', 'SDL_image-', 'SDL_ttf-', 'freeimage-', 'bgfx.cmake.', 'bgfx-', 'OpenXR-SDK-Source-', 'FFmpeg-', 'libdmdutil-', 'libpupdmd-', 'pinmame-', 'libdof-', 'libusb-', 'libserialport-', 'hidapi-', 'libftdi-'])
    if (!tarballs.some((f) => f.includes(needed))) throw new Error(`sources incomplètes dans ${dl} (${needed}…) : lancer d'abord node scripts/vpx-corrige.mjs`);
  const out = path.join(repo, 'build', 'vpx-corrige');
  const stage = path.join(out, 'sources');
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(path.join(stage, 'telechargements'), { recursive: true });
  for (const f of tarballs) fs.copyFileSync(path.join(dl, f), path.join(stage, 'telechargements', f));
  copyTree(VPX_CORRIGE_SOURCE, path.join(stage, 'vpx-corrige'));
  fs.mkdirSync(path.join(stage, 'recette'), { recursive: true });
  for (const f of ['vpx-corrige.mjs', 'vpx-cache.mjs', 'casque-vr.mjs']) fs.copyFileSync(path.join(repo, 'scripts', f), path.join(stage, 'recette', f));
  const license = path.join(vpxCorrigeSrcDir(), 'LICENSE');
  if (fs.existsSync(license)) fs.copyFileSync(license, path.join(stage, 'LICENSE-VPX'));
  const zip = path.join(out, VPX_SOURCES_NAME);
  fs.rmSync(zip, { force: true });
  const r = spawnSync('tar.exe', ['-a', '-cf', zip, '-C', stage, '.'], { stdio: 'inherit', windowsHide: true });
  if (r.status !== 0 || !fs.existsSync(zip)) throw new Error('archive des sources : échec de tar');
  fs.rmSync(stage, { recursive: true, force: true });
  return zip;
}

const BODY = [
  'Complete sources of the patched VPX files shipped with Cyber Pinball (VPinballX_BGFX64.exe, plugins/pup/plugin-pup64.dll and plugins/dof/dof64.dll, Visual Pinball X 10.8.1-5436 and its libdof with the patches listed in vpx-corrige/README.md), as required by the VPX licenses (GPLv3+ and the MAME-derived license): VPX sources at commit af26b2d93, the sources of the libraries they are built with (SDL3, SDL_image, SDL_ttf, FreeImage, bgfx, OpenXR, FFmpeg, libdmdutil, libpupdmd, PinMAME, libdof, libusb, libserialport, hidapi, libftdi), the patches and the build recipe. Not a Cyber Pinball release: cabinets never download it.',
  '',
  'Sources complètes des fichiers de VPX corrigés livrés avec Cyber Pinball (VPinballX_BGFX64.exe, plugins/pup/plugin-pup64.dll et plugins/dof/dof64.dll, Visual Pinball X 10.8.1-5436 et sa libdof avec les correctifs décrits dans vpx-corrige/LISEZMOI.md), comme le demandent les licences de VPX (GPLv3+ et licence dérivée de MAME) : sources de VPX au commit af26b2d93, celles des bibliothèques avec lesquelles ils sont construits (SDL3, SDL_image, SDL_ttf, FreeImage, bgfx, OpenXR, FFmpeg, libdmdutil, libpupdmd, PinMAME, libdof, libusb, libserialport, hidapi, libftdi), les correctifs et la recette de construction. Ce n’est pas une version de Cyber Pinball : les bornes ne la téléchargent jamais.',
].join('\n');

/**
 * La release des sources existe-t-elle, avec son archive ? Sinon : la crée (pré-release, jamais « latest ») et y
 * envoie l'archive. `repository` : « propriétaire/dépôt ». Renvoie l'adresse de la release.
 */
export async function ensureVpxCorrigeSources({ repository, token, target = 'main' }) {
  const api = async (method, url, body, headers = {}) => {
    const response = await fetch(url.startsWith('https://') ? url : `https://api.github.com/repos/${repository}${url}`, {
      method,
      headers: { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', authorization: `Bearer ${token}`, ...(body && !(body instanceof Blob) && { 'content-type': 'application/json' }), ...headers },
      ...(body && { body: body instanceof Blob ? body : JSON.stringify(body) }),
    });
    const text = await response.text();
    let json;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = text;
    }
    return { status: response.status, json };
  };
  let release = await api('GET', `/releases/tags/${VPX_SOURCES_TAG}`);
  if (release.status === 200 && release.json.assets?.some((a) => a.name === VPX_SOURCES_NAME && a.state === 'uploaded')) return release.json.html_url;
  const zip = vpxSourcesArchive();
  if (release.status !== 200) {
    release = await api('POST', '/releases', { tag_name: VPX_SOURCES_TAG, target_commitish: target, name: `Sources: VPX 10.8.1-${VPX_BASE.revision} patched Cyber Pinball ${VPX_BASE.patch}`, body: BODY, prerelease: true, make_latest: 'false' });
    if (release.status !== 201) throw new Error(`release des sources refusée (HTTP ${release.status}) : ${JSON.stringify(release.json)}`);
  }
  for (const asset of release.json.assets ?? []) if (asset.name === VPX_SOURCES_NAME) await api('DELETE', `/releases/assets/${asset.id}`);
  const upload = release.json.upload_url.replace(/\{.*\}$/, '');
  process.stdout.write(`  ${VPX_SOURCES_NAME} (${(fs.statSync(zip).size / 1024 ** 2).toFixed(1)} Mio)… `);
  const sent = await api('POST', `${upload}?name=${encodeURIComponent(VPX_SOURCES_NAME)}`, await fs.openAsBlob(zip), { 'content-type': 'application/zip' });
  if (sent.status !== 201) throw new Error(`envoi des sources refusé (HTTP ${sent.status}) : ${JSON.stringify(sent.json)}`);
  console.log('envoyé');
  return release.json.html_url;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.includes('--archive')) {
      console.log(`Sources du VPX corrigé : ${vpxSourcesArchive()}`);
    } else {
      const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));
      const repository = /github\.com\/([^/]+\/[^/.]+)/.exec(pkg.repository?.url ?? '')?.[1];
      const token = githubToken()?.token;
      if (!repository || !token) throw new Error(token ? 'dépôt introuvable dans package.json' : missingTokenMessage());
      console.log(`Sources du VPX corrigé : ${await ensureVpxCorrigeSources({ repository, token })}`);
    }
  } catch (error) {
    console.error(`Sources du VPX corrigé : ${error.message}`);
    process.exit(1);
  }
}
