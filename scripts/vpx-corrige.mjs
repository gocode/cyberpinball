// Construit le VPX corrigé de Cyber Pinball : VPinballX_BGFX64.exe et le plugin PuP de VPX 10.8.1-5436, avec les
// correctifs de packages/vpx-corrige/correctifs (voir son LISEZMOI). Cyber Pinball les pose à la place de ceux de
// l'archive officielle (app/src/vpx-corrige.ts) ; les autres plugins et les bibliothèques restent ceux de la 5436.
//   node scripts/vpx-corrige.mjs            -> build\vpx-corrige\VPinballX_BGFX64.exe (et .pdb), plugins\pup\plugin-pup64.dll
//   node scripts/vpx-corrige.mjs --propre   -> repart de zéro (sources, dépendances et compilation)
// Demande CMake, les outils C++ de Visual Studio (Build Tools 2022), curl et tar (fournis par Windows). Les sources
// sont téléchargées une fois, au commit exact de la 5436 (et les dépendances à ceux de son platforms/config.sh) ;
// le dossier de travail est court (%LOCALAPPDATA%\cpvpx, ou CYBERPINBALL_VPX_BUILD) : certains chemins de bgfx
// dépassent sinon la limite de MSBuild. Compter 20 à 40 minutes la première fois, quelques minutes ensuite.

import { spawnSync } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { cmakePath } from './casque-vr.mjs';
import { filesFingerprint, matchingBuild, saveBuild } from './vpx-cache.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { copyTree } = createRequire(import.meta.url)(path.join(repo, 'packages', 'core', 'dist', 'copytree.js'));
const { writeFileAtomic } = createRequire(import.meta.url)(path.join(repo, 'packages', 'core', 'dist', 'atomicwrite.js'));
export const VPX_CORRIGE_SOURCE = path.join(repo, 'packages', 'vpx-corrige');
const out = path.join(repo, 'build', 'vpx-corrige');
export const VPX_CORRIGE_EXE = path.join(out, 'VPinballX_BGFX64.exe');
/** Le plugin PuP corrigé, posé dans <VPX>\plugins\pup (build\vpx-corrige\plugins\pup, natif\vpx-corrige\plugins\pup). */
export const VPX_CORRIGE_PUP = 'plugin-pup64.dll';

/**
 * La version corrigée : commit de la 5436, révision gardée (le format des tables, les plugins et les réglages en
 * dépendent). `patch` : numéro de la série de correctifs, nommée en anglais partout où elle se voit (« patched Cyber
 * Pinball 1 ») : version produit de l'exécutable, journal de VPX, release des sources, fiche technique.
 */
export const VPX_BASE = { commit: 'af26b2d9392b4c9ec3e3edff4bbd69562085a44c', revision: '5436', patch: 5 };
VPX_BASE.sha = `af26b2d93-patched-cyberpinball-${VPX_BASE.patch}`;

const work = process.env.CYBERPINBALL_VPX_BUILD ?? path.join(process.env.LOCALAPPDATA ?? os.tmpdir(), 'cpvpx');
/** Le dossier de travail (téléchargements dans dl\, sources dans src-<série>\) : l'archive des sources le relit. */
export const vpxCorrigeWorkDir = () => work;
const GENERATOR = ['-G', 'Visual Studio 17 2022', '-A', 'x64'];

/** Sortie des outils : à l'écran (commande seule), ou gardée et montrée en cas d'échec (fabrication). */
let quietOutput = false;

function run(cmd, args, cwd, label) {
  if (!quietOutput) console.log(`> ${label}`);
  const r = spawnSync(cmd, args, { cwd, stdio: quietOutput ? 'pipe' : 'inherit', encoding: 'utf8', windowsHide: true, maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) {
    if (quietOutput) console.log(`${r.stdout ?? ''}${r.stderr ?? ''}`.split(/\r?\n/).slice(-40).join('\n'));
    throw new Error(`${label} : échec (code ${r.status ?? r.error?.message})`);
  }
}

/** Télécharge `url` dans dl\ (une fois) et l'extrait dans `dest` ; renvoie le dossier extrait (unique sous-dossier). */
function fetchTarball(url, name, dest, exclude = []) {
  const dl = path.join(work, 'dl');
  fs.mkdirSync(dl, { recursive: true });
  const archive = path.join(dl, name);
  if (!fs.existsSync(archive)) {
    run('curl.exe', ['-sSfL', url, '-o', `${archive}.part`], dl, `téléchargement de ${name}`);
    fs.renameSync(`${archive}.part`, archive);
  }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  run('tar.exe', ['-xzf', archive, '-C', dest, ...exclude.flatMap((e) => ['--exclude', e])], dest, `extraction de ${name}`);
  const [inner] = fs.readdirSync(dest);
  return path.join(dest, inner);
}

/** Remplace `from` par `to` dans un fichier, et vérifie qu'il y était (sinon la recette ne suit plus la source). */
function replaceIn(file, from, to) {
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes(from)) throw new Error(`${path.basename(file)} : « ${from} » introuvable`);
  fs.writeFileSync(file, text.split(from).join(to));
}

/** Les dépendances de l'exécutable seul (SDL3, FreeImage, bgfx, OpenXR), aux commits de platforms/config.sh. */
function readConfig(src) {
  const config = fs.readFileSync(path.join(src, 'platforms', 'config.sh'), 'utf8');
  const get = (k) => {
    const m = new RegExp(`^${k}=(\\S+)`, 'm').exec(config);
    if (!m) throw new Error(`platforms/config.sh : ${k} absent`);
    return m[1];
  };
  return {
    sdl: get('SDL_SHA'),
    sdlImage: get('SDL_IMAGE_SHA'),
    sdlTtf: get('SDL_TTF_SHA'),
    freeimage: get('FREEIMAGE_SHA'),
    bgfxCmake: get('BGFX_CMAKE_VERSION'),
    bgfx: get('BGFX_PATCH_SHA'),
    openxr: get('OPENXR_SHA'),
    ffmpeg: get('FFMPEG_SHA'),
    dmdutil: get('LIBDMDUTIL_SHA'),
    pinmame: get('PINMAME_SHA'),
  };
}

/** L'archive officielle de la 5436 (packages/installer/components.json) : ses DLL donnent les bibliothèques d'import. */
function officialArchiveUrl() {
  const manifest = JSON.parse(fs.readFileSync(path.join(repo, 'packages', 'installer', 'components.json'), 'utf8'));
  const found = JSON.stringify(manifest).match(/https:\/\/github\.com\/vpinball\/vpinball\/releases\/download\/v10\.8\.1-5436-[^"]+\.zip/);
  if (!found) throw new Error('components.json : archive officielle de VPX 10.8.1-5436 introuvable');
  return found[0];
}

/** dumpbin et lib des Build Tools (vswhere). */
function msvcTool(name) {
  const vswhere = path.join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Microsoft Visual Studio', 'Installer', 'vswhere.exe');
  const r = spawnSync(vswhere, ['-latest', '-products', '*', '-property', 'installationPath'], { encoding: 'utf8', windowsHide: true });
  const vs = r.stdout?.trim();
  if (!vs) throw new Error('Build Tools 2022 introuvables (vswhere)');
  const tools = path.join(vs, 'VC', 'Tools', 'MSVC');
  for (const version of fs.readdirSync(tools).sort().reverse()) {
    const exe = path.join(tools, version, 'bin', 'Hostx64', 'x64', name);
    if (fs.existsSync(exe)) return exe;
  }
  throw new Error(`${name} introuvable dans ${tools}`);
}

/** Bibliothèque d'import d'une DLL (ses exportations, relevées par dumpbin), pour lier sans reconstruire la DLL. */
function importLibrary(dll, outLib) {
  const r = spawnSync(msvcTool('dumpbin.exe'), ['/exports', dll], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`dumpbin ${path.basename(dll)} : échec`);
  const names = [];
  for (const line of r.stdout.split(/\r?\n/)) {
    const m = /^\s+\d+\s+[0-9A-F]+\s+[0-9A-F]{8}\s+(\S+)/.exec(line);
    if (m) names.push(m[1]);
  }
  if (!names.length) throw new Error(`${path.basename(dll)} : aucune exportation`);
  const def = outLib.replace(/\.lib$/i, '.def');
  fs.writeFileSync(def, `LIBRARY ${path.basename(dll)}\r\nEXPORTS\r\n${names.map((n) => `  ${n}`).join('\r\n')}\r\n`);
  run(msvcTool('lib.exe'), ['/nologo', `/def:${def}`, '/machine:x64', `/out:${outLib}`], path.dirname(outLib), `bibliothèque d'import de ${path.basename(dll)}`);
}

/**
 * Ce que demande le plugin PuP (plugins\pup\plugin-pup64.dll, reconstruit pour 03-pup-label-sans-verrou.patch).
 * Ses bibliothèques restent celles de l'archive officielle : seuls leurs en-têtes sont téléchargés (SDL_image,
 * SDL_ttf, FFmpeg aux commits de platforms/config.sh, pupdmd.h au commit de libdmdutil), et les bibliothèques
 * d'import sont tirées des DLL de l'archive officielle.
 */
/** Le projet Xcode de SDL_image et SDL_ttf : liens symboliques que Windows refuse d'extraire (exclus aussi par VPX). */
const XCODE = ['*/Xcode/*'];

function pupPluginDependencies(src, deps, lib, inc) {
  const official = dependency('vpx-officiel', officialArchiveUrl(), (dir) => {
    const dl = path.join(work, 'dl');
    fs.mkdirSync(dl, { recursive: true });
    const zip = path.join(dl, path.basename(new URL(officialArchiveUrl()).pathname));
    if (!fs.existsSync(zip)) {
      run('curl.exe', ['-sSfL', officialArchiveUrl(), '-o', `${zip}.part`], dl, 'téléchargement de VPX 10.8.1-5436 officiel');
      fs.renameSync(`${zip}.part`, zip);
    }
    fs.mkdirSync(path.join(dir, 'x'), { recursive: true });
    run('tar.exe', ['-xf', zip, '-C', path.join(dir, 'x')], dir, 'extraction de VPX 10.8.1-5436 officiel');
  });
  const pupDir = (function find(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const p = path.join(dir, e.name);
      if (e.name.toLowerCase() === 'pup' && fs.existsSync(path.join(p, 'plugin-pup64.dll'))) return p;
      const deeper = find(p);
      if (deeper) return deeper;
    }
    return undefined;
  })(path.join(official, 'x'));
  if (!pupDir) throw new Error('archive officielle : plugins\\pup introuvable');
  for (const name of ['SDL3_image64', 'SDL3_ttf64', 'pupdmd64']) importLibrary(path.join(pupDir, `${name}.dll`), path.join(lib, `${name}.lib`));

  const headers = dependency('pup-entetes', `${deps.sdlImage}-${deps.sdlTtf}-${deps.ffmpeg}-${deps.dmdutil}-${deps.pinmame}`, (dir) => {
    const image = fetchTarball(`https://github.com/libsdl-org/SDL_image/archive/${deps.sdlImage}.tar.gz`, `SDL_image-${deps.sdlImage}.tar.gz`, path.join(dir, 'image'), XCODE);
    copy(path.join(image, 'include', 'SDL3_image'), path.join(dir, 'include', 'SDL3_image'));
    const ttf = fetchTarball(`https://github.com/libsdl-org/SDL_ttf/archive/${deps.sdlTtf}.tar.gz`, `SDL_ttf-${deps.sdlTtf}.tar.gz`, path.join(dir, 'ttf'), XCODE);
    copy(path.join(ttf, 'include', 'SDL3_ttf'), path.join(dir, 'include', 'SDL3_ttf'));
    const ffmpeg = fetchTarball(`https://github.com/FFmpeg/FFmpeg/archive/${deps.ffmpeg}.tar.gz`, `FFmpeg-${deps.ffmpeg}.tar.gz`, path.join(dir, 'ffmpeg'));
    for (const part of ['libavcodec', 'libavformat', 'libavutil', 'libswresample', 'libswscale']) copy(path.join(ffmpeg, part), path.join(dir, 'include', part));
    // Écrit par le configure de FFmpeg : x64 petit-boutiste, accès non alignés rapides.
    fs.writeFileSync(path.join(dir, 'include', 'libavutil', 'avconfig.h'), '#ifndef AVUTIL_AVCONFIG_H\n#define AVUTIL_AVCONFIG_H\n#define AV_HAVE_BIGENDIAN 0\n#define AV_HAVE_FAST_UNALIGNED 1\n#endif\n');
    const dmdutil = fetchTarball(`https://github.com/vpinball/libdmdutil/archive/${deps.dmdutil}.tar.gz`, `libdmdutil-${deps.dmdutil}.tar.gz`, path.join(dir, 'dmdutil'));
    const pupdmdSha = /^LIBPUPDMD_SHA=(\S+)/m.exec(fs.readFileSync(path.join(dmdutil, 'platforms', 'config.sh'), 'utf8'))?.[1];
    if (!pupdmdSha) throw new Error('libdmdutil : LIBPUPDMD_SHA absent');
    const pupdmd = fetchTarball(`https://github.com/ppuc/libpupdmd/archive/${pupdmdSha}.tar.gz`, `libpupdmd-${pupdmdSha}.tar.gz`, path.join(dir, 'pupdmd'));
    copy(path.join(pupdmd, 'src', 'pupdmd.h'), path.join(dir, 'include', 'pupdmd.h'));
    // PinMAMEPlugin.h (messages du plugin PinMAME, que le plugin PuP écoute), copié comme le fait platforms/windows-x64/external.sh.
    const pinmame = fetchTarball(`https://github.com/vbousquet/pinmame/archive/${deps.pinmame}.tar.gz`, `pinmame-${deps.pinmame}.tar.gz`, path.join(dir, 'pinmame'));
    for (const h of ['libpinmame.h', 'PinMAMEPlugin.h']) copy(path.join(pinmame, 'src', 'libpinmame', h), path.join(dir, 'include', 'pinmame', h));
    for (const sub of ['image', 'ttf', 'ffmpeg', 'dmdutil', 'pupdmd', 'pinmame']) fs.rmSync(path.join(dir, sub), { recursive: true, force: true });
  });
  for (const e of fs.readdirSync(path.join(headers, 'include'))) copy(path.join(headers, 'include', e), path.join(inc, e));
}

/** Construit une dépendance si son repère (cache.txt) ne correspond pas. */
function dependency(name, key, build) {
  const dir = path.join(work, 'ext', name);
  const stamp = path.join(dir, 'cache.txt');
  if (fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8').trim() === key) return dir;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  build(dir);
  fs.writeFileSync(stamp, key);
  return dir;
}

/** Copie d'un fichier, ou d'un dossier par copyTree (packages/core/src/copytree.ts : chemins accentués). */
function copy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  if (fs.statSync(from).isDirectory()) copyTree(from, to);
  else fs.copyFileSync(from, to);
}

/**
 * Sources et compilation de VPX : un dossier par série de correctifs (src-2, vpx-build-2). Le 21/11/2026, une
 * publication groupée (série 1, depuis le dossier principal) et une branche (série 2) construisaient dans le même
 * src : chacune effaçait les sources de l'autre au milieu de sa compilation. Les téléchargements (dl) et les
 * dépendances (ext) restent communs, sous le verrou de construction.
 */
export const vpxCorrigeSrcDir = () => path.join(work, `src-${VPX_BASE.patch}`);
const vpxBuildDir = () => path.join(work, `vpx-build-${VPX_BASE.patch}`);

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
};

/**
 * Une construction à la fois dans le dossier de travail (commun aux worktrees et au dossier principal) : la suivante
 * attend (fabrication d'une publication, branche qui construit). Le verrou d'un processus disparu est repris.
 */
function withBuildLock(fn) {
  fs.mkdirSync(work, { recursive: true });
  const lock = path.join(work, 'construction.verrou');
  let announced = false;
  for (;;) {
    try {
      fs.writeFileSync(lock, String(process.pid), { flag: 'wx' });
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const holder = Number(fs.readFileSync(lock, 'utf8').trim());
      if (!holder || !alive(holder)) {
        fs.rmSync(lock, { force: true });
        continue;
      }
      if (!announced) console.log(`VPX corrigé : une autre construction est en cours (processus ${holder}), attente de sa fin…`);
      announced = true;
      sleep(5000);
    }
  }
  try {
    return fn();
  } finally {
    fs.rmSync(lock, { force: true });
  }
}

export function buildVpxCorrige({ clean = false, quiet = false } = {}) {
  quietOutput = quiet;
  const cmake = cmakePath();
  if (!cmake) throw new Error('CMake absent (winget install Kitware.CMake).');
  return withBuildLock(() => buildLocked(cmake, clean));
}

function buildInputs(cmake) {
  const located = spawnSync('where.exe', [cmake], { encoding: 'utf8', windowsHide: true });
  const cmakeExe = path.isAbsolute(cmake) ? cmake : located.stdout?.trim().split(/\r?\n/)[0];
  if (!cmakeExe) throw new Error('CMake : chemin de l’outil introuvable');
  return filesFingerprint([
    fileURLToPath(import.meta.url), path.join(repo, 'scripts', 'vpx-cache.mjs'),
    path.join(repo, 'scripts', 'casque-vr.mjs'),
    path.join(VPX_CORRIGE_SOURCE, 'correctifs'),
    path.join(repo, 'packages', 'installer', 'components.json'),
    vpxCorrigeSrcDir(), path.join(vpxBuildDir(), 'CMakeCache.txt'), cmakeExe,
    // cl.exe charge notamment c1xx.dll et c2.dll : le pilote seul ne décrit pas le compilateur.
    path.dirname(msvcTool('cl.exe')),
  ]);
}

function buildLocked(cmake, clean) {
  const certificate = path.join(vpxBuildDir(), 'construit.json');
  const outputs = [VPX_CORRIGE_EXE, path.join(out, 'plugins', 'pup', VPX_CORRIGE_PUP), path.join(out, 'LICENSE')];
  if (!clean && fs.existsSync(certificate)) {
    try {
      if (matchingBuild(certificate, buildInputs(cmake), outputs)) {
        console.log('VPX corrigé : exécutable et plugin PuP vérifiés, compilation réutilisée.');
        return VPX_CORRIGE_EXE;
      }
    } catch {
      // Une entrée absente ou invalide impose de repasser par la construction.
    }
  }
  if (clean) {
    fs.rmSync(vpxCorrigeSrcDir(), { recursive: true, force: true });
    fs.rmSync(vpxBuildDir(), { recursive: true, force: true });
  }
  fs.rmSync(certificate, { force: true });
  if (clean) for (const shared of ['dl', 'ext']) fs.rmSync(path.join(work, shared), { recursive: true, force: true });

  // Sources de la 5436, puis les correctifs, puis la version (comme le workflow de VPX : 9999 et « unknown »).
  const patches = fs.readdirSync(path.join(VPX_CORRIGE_SOURCE, 'correctifs')).filter((f) => f.endsWith('.patch')).sort();
  const patchKey = crypto.createHash('sha256');
  for (const p of patches) patchKey.update(fs.readFileSync(path.join(VPX_CORRIGE_SOURCE, 'correctifs', p)));
  const srcKey = `${VPX_BASE.commit}-${VPX_BASE.sha}-${patchKey.digest('hex').slice(0, 16)}`;
  const src = vpxCorrigeSrcDir();
  const srcStamp = `${src}.txt`;
  if (!fs.existsSync(src) || !fs.existsSync(srcStamp) || fs.readFileSync(srcStamp, 'utf8').trim() !== srcKey) {
    const scratch = `${src}-x`;
    const extracted = fetchTarball(`https://github.com/vpinball/vpinball/archive/${VPX_BASE.commit}.tar.gz`, `vpinball-${VPX_BASE.commit}.tar.gz`, scratch);
    fs.rmSync(src, { recursive: true, force: true });
    fs.renameSync(extracted, src);
    fs.rmSync(scratch, { recursive: true, force: true });
    for (const p of patches) run('git', ['apply', '--whitespace=nowarn', path.join(VPX_CORRIGE_SOURCE, 'correctifs', p)], src, `correctif ${p}`);
    const version = path.join(src, 'src', 'core', 'git_version.h');
    replaceIn(version, '9999', VPX_BASE.revision);
    replaceIn(version, '"unknown"', `"${VPX_BASE.sha}"`);
    fs.rmSync(vpxBuildDir(), { recursive: true, force: true });
    fs.writeFileSync(srcStamp, srcKey);
  }
  const deps = readConfig(src);
  const lib = path.join(src, 'third-party', 'build-libs', 'windows-x64');
  const inc = path.join(src, 'third-party', 'include');
  fs.mkdirSync(lib, { recursive: true });

  // SDL3 (SDL364.dll ; seule la bibliothèque d'import sert : la DLL livrée reste celle de la 5436).
  const sdl = dependency('SDL3', deps.sdl, (dir) => {
    const s = fetchTarball(`https://github.com/libsdl-org/SDL/archive/${deps.sdl}.tar.gz`, `SDL-${deps.sdl}.tar.gz`, path.join(dir, 'x'));
    replaceIn(path.join(s, 'CMakeLists.txt'), 'OUTPUT_NAME "SDL3"', 'OUTPUT_NAME "SDL364"');
    run(cmake, [...GENERATOR, '-DSDL_SHARED=ON', '-DSDL_STATIC=OFF', '-DSDL_TEST_LIBRARY=OFF', '-B', 'build'], s, 'SDL3 : configuration');
    run(cmake, ['--build', 'build', '--config', 'Release'], s, 'SDL3 : compilation');
  });
  const sdlDir = path.join(sdl, 'x', fs.readdirSync(path.join(sdl, 'x'))[0]);
  copy(path.join(sdlDir, 'build', 'Release', 'SDL364.lib'), path.join(lib, 'SDL364.lib'));
  copy(path.join(sdlDir, 'include', 'SDL3'), path.join(inc, 'SDL3'));

  // FreeImage (freeimage64.dll).
  const fi = dependency('freeimage', deps.freeimage, (dir) => {
    const s = fetchTarball(`https://github.com/toxieainc/freeimage/archive/${deps.freeimage}.tar.gz`, `freeimage-${deps.freeimage}.tar.gz`, path.join(dir, 'x'));
    run(cmake, [...GENERATOR, '-DPLATFORM=win', '-DARCH=x64', '-DBUILD_SHARED=ON', '-DBUILD_STATIC=OFF', '-B', 'build'], s, 'FreeImage : configuration');
    run(cmake, ['--build', 'build', '--config', 'Release'], s, 'FreeImage : compilation');
  });
  const fiDir = path.join(fi, 'x', fs.readdirSync(path.join(fi, 'x'))[0]);
  copy(path.join(fiDir, 'build', 'Release', 'freeimage64.lib'), path.join(lib, 'freeimage64.lib'));
  copy(path.join(fiDir, 'Source', 'FreeImage.h'), path.join(inc, 'FreeImage.h'));

  // bgfx (statique), au commit du fork de VPX, dans bgfx.cmake.
  const bgfx = dependency('bgfx', `${deps.bgfxCmake}-${deps.bgfx}`, (dir) => {
    const cm = fetchTarball(`https://github.com/bkaradzic/bgfx.cmake/releases/download/v${deps.bgfxCmake}/bgfx.cmake.v${deps.bgfxCmake}.tar.gz`, `bgfx.cmake.v${deps.bgfxCmake}.tar.gz`, path.join(dir, 'x'));
    const fork = fetchTarball(`https://github.com/vbousquet/bgfx/archive/${deps.bgfx}.tar.gz`, `bgfx-${deps.bgfx}.tar.gz`, path.join(dir, 'fork'));
    fs.rmSync(path.join(cm, 'bgfx'), { recursive: true, force: true });
    fs.renameSync(fork, path.join(cm, 'bgfx'));
    for (const [file, target, name] of [
      ['cmake/bx/bx.cmake', 'bx', 'bx64'],
      ['cmake/bimg/bimg.cmake', 'bimg', 'bimg64'],
      ['cmake/bimg/bimg_decode.cmake', 'bimg_decode', 'bimg_decode64'],
      ['cmake/bimg/bimg_encode.cmake', 'bimg_encode', 'bimg_encode64'],
      ['cmake/bgfx/bgfx.cmake', 'bgfx', 'bgfx64'],
    ])
      replaceIn(path.join(cm, ...file.split('/')), `set_target_properties(${target} PROPERTIES FOLDER "bgfx")`, `set_target_properties(${target} PROPERTIES FOLDER "bgfx" OUTPUT_NAME "${name}")`);
    run(
      cmake,
      [...GENERATOR, '-S.', '-DBGFX_LIBRARY_TYPE=STATIC', '-DBGFX_BUILD_TOOLS=OFF', '-DBGFX_BUILD_EXAMPLES=OFF', '-DBGFX_CONFIG_MULTITHREADED=ON', '-DBGFX_CONFIG_MAX_FRAME_BUFFERS=256', '-DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded$<$<CONFIG:Debug>:Debug>', '-B', 'build'],
      cm,
      'bgfx : configuration',
    );
    run(cmake, ['--build', 'build', '--config', 'Release'], cm, 'bgfx : compilation');
  });
  const cm = path.join(bgfx, 'x', fs.readdirSync(path.join(bgfx, 'x'))[0]);
  for (const name of ['bgfx', 'bimg', 'bx']) copy(path.join(cm, name, 'include', name), path.join(inc, name));
  copy(path.join(cm, 'build', 'cmake', 'bgfx', 'Release', 'bgfx64.lib'), path.join(lib, 'bgfx64.lib'));
  copy(path.join(cm, 'build', 'cmake', 'bimg', 'Release', 'bimg64.lib'), path.join(lib, 'bimg64.lib'));
  copy(path.join(cm, 'build', 'cmake', 'bimg', 'Release', 'bimg_decode64.lib'), path.join(lib, 'bimg_decode64.lib'));
  copy(path.join(cm, 'build', 'cmake', 'bx', 'Release', 'bx64.lib'), path.join(lib, 'bx64.lib'));

  // OpenXR (openxr_loader64.dll).
  const xr = dependency('openxr', deps.openxr, (dir) => {
    const s = fetchTarball(`https://github.com/KhronosGroup/OpenXR-SDK-Source/archive/${deps.openxr}.tar.gz`, `OpenXR-SDK-Source-${deps.openxr}.tar.gz`, path.join(dir, 'x'));
    const loader = path.join(s, 'src', 'loader', 'CMakeLists.txt');
    replaceIn(loader, 'set_target_properties(openxr_loader PROPERTIES FOLDER ${LOADER_FOLDER})', 'set_target_properties(openxr_loader PROPERTIES FOLDER ${LOADER_FOLDER} OUTPUT_NAME "openxr_loader64")');
    replaceIn(loader, '${CMAKE_CURRENT_BINARY_DIR}/$<CONFIGURATION>/openxr_loader', '${CMAKE_CURRENT_BINARY_DIR}/$<CONFIGURATION>/openxr_loader64');
    run(cmake, [...GENERATOR, '-DBUILD_TESTS=OFF', '-DDYNAMIC_LOADER=ON', '-DOPENXR_DEBUG_POSTFIX=', '-B', 'build'], s, 'OpenXR : configuration');
    run(cmake, ['--build', 'build', '--config', 'Release'], s, 'OpenXR : compilation');
  });
  const xrDir = path.join(xr, 'x', fs.readdirSync(path.join(xr, 'x'))[0]);
  copy(path.join(xrDir, 'build', 'src', 'loader', 'Release', 'openxr_loader64.lib'), path.join(lib, 'openxr_loader64.lib'));
  copy(path.join(xrDir, 'include', 'openxr'), path.join(inc, 'openxr'));

  pupPluginDependencies(src, deps, lib, inc);

  // VPX : l'exécutable et le plugin PuP (les autres plugins et les bibliothèques restent ceux de l'archive officielle).
  const vpxBuild = vpxBuildDir();
  run(cmake, ['-S', src, '-B', vpxBuild, ...GENERATOR, '-DRENDERER=BGFX', '-DPLATFORM=windows', '-DARCH=x64', '-DPOST_BUILD_COPY_EXT_LIBS=OFF'], src, 'VPX : configuration');
  run(cmake, ['--build', vpxBuild, '--config', 'Release', '--target', 'vpinball', 'PUPPlugin', '--parallel'], src, 'VPX : compilation');
  const exe = fs.readdirSync(path.join(vpxBuild, 'Release')).find((f) => /^VPinballX.*64\.exe$/i.test(f));
  if (!exe) throw new Error('VPX : exécutable introuvable après la compilation');
  fs.mkdirSync(out, { recursive: true });
  fs.copyFileSync(path.join(vpxBuild, 'Release', exe), VPX_CORRIGE_EXE);
  const pdb = path.join(vpxBuild, 'Release', exe.replace(/\.exe$/i, '.pdb'));
  if (fs.existsSync(pdb)) fs.copyFileSync(pdb, VPX_CORRIGE_EXE.replace(/\.exe$/i, '.pdb'));
  // Le plugin PuP : copié par sa cible dans <sortie>\plugins\pup.
  const pup = path.join(vpxBuild, 'Release', 'plugins', 'pup', VPX_CORRIGE_PUP);
  if (!fs.existsSync(pup)) throw new Error(`plugin PuP introuvable après la compilation (${pup})`);
  fs.mkdirSync(path.join(out, 'plugins', 'pup'), { recursive: true });
  fs.copyFileSync(pup, path.join(out, 'plugins', 'pup', VPX_CORRIGE_PUP));
  // La licence de VPX (GPLv3+ et licence héritée de MAME) voyage avec le binaire.
  fs.copyFileSync(path.join(src, 'LICENSE'), path.join(out, 'LICENSE'));
  saveBuild(certificate, buildInputs(cmake), outputs, writeFileAtomic);
  return VPX_CORRIGE_EXE;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const exe = buildVpxCorrige({ clean: process.argv.includes('--propre') });
    console.log(`VPX corrigé : ${exe}`);
  } catch (error) {
    console.error(`VPX corrigé : ${error.message}`);
    process.exit(1);
  }
}
