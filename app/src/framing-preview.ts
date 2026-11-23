// Aperçus du cadrage (23/11/2026) : la table du joueur rendue par son VPX, dans un cadrage donné, pour qu'il choisisse
// sur une vraie image et jamais à l'aveugle (règle du 24/10/2026). VPX la rend sur le bureau caché de Windows
// (win-displays, startOnHiddenDesktop) : rien n'apparaît sur les écrans, rien ne prend le focus. Une image prise après
// 31 s d'attraction simulées (-CaptureAttract), à la forme de la fenêtre du playfield de la borne.
// Rien du joueur n'est touché : la table est liée (lien physique) dans un dossier de travail, sa ROM aussi, sa mémoire
// (nvram) copiée ; préférences de VPX à part (-PrefPath) ; son, DOF, vrai DMD et fenêtres annexes coupés. Les images
// sont gardées en cache (<données>\cache\cadrage), une seule partie de VPX à la fois.

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { applyVpxSettings, decodeQoi, encodePng, IniDocument, linkOrCopy, PINMAME_FAST_BOOT, VPX_PLAY_SETTINGS, writeFileAtomic, type VpxSetting } from '@cyberpinball/core';
import { startOnHiddenDesktop } from '@cyberpinball/win-displays';

export interface FramingPreviewRequest {
  /** Le .vpx de la table. */
  table: string;
  /** Le .ini de la table pour ce rendu (cadrage d'un style, d'un POV, ou celui de la table) ; '' : aucun. */
  tableIni: string;
  /** VPinballX.ini de la configuration active. */
  globalIni: string;
  /** Fenêtre du playfield de la borne : seule sa forme compte (le cadrage automatique suit le format). */
  window: { width: number; height: number };
  /** ROM du script (première connue), liée dans la mémoire de travail de PinMAME. */
  rom?: string;
  /** Dossier de PinMAME de Cyber Pinball (<racine>\pinmame), dernier endroit où chercher la ROM. */
  pinmame?: string;
}

/** Hauteur de l'image rendue : assez pour juger le cadrage, sans rendre en 4K. */
const RENDER_HEIGHT = 960;
/** Au-delà, VPX est arrêté : une table qui ne démarre pas ne bloque pas le choix. */
const RENDER_TIMEOUT_MS = 150_000;
/** Plugins coupés pendant un aperçu : toys, vrai DMD, plugins de Cyber Pinball (et PUP, repris si le script l'exige). */
const QUIET_PLUGINS = ['DOF', 'DMDUtil', 'CyberPinball', 'CyberPinballDmd', 'PUP'];

export interface FramingPreviews {
  /** L'image déjà rendue pour cette demande, s'il y en a une. */
  cached(req: FramingPreviewRequest): string | undefined;
  /** L'image (PNG) de cette demande, rendue si besoin ; les demandes passent l'une après l'autre. */
  render(req: FramingPreviewRequest): Promise<string>;
}

export function createFramingPreviews(deps: { dataDir: string; vpxExe(): string | undefined; log?(line: string): void }): FramingPreviews {
  const cacheDir = path.join(deps.dataDir, 'cache', 'cadrage');
  let queue: Promise<unknown> = Promise.resolve();
  const running = new Map<string, Promise<string>>();

  const keyOf = (req: FramingPreviewRequest, exe: string) => {
    const stat = fs.statSync(req.table);
    const exeStat = fs.statSync(exe);
    const size = renderSize(req.window);
    return crypto
      .createHash('sha256')
      .update(JSON.stringify([path.resolve(req.table).toLowerCase(), stat.size, stat.mtimeMs, exe.toLowerCase(), exeStat.mtimeMs, req.tableIni, framingKeys(req.globalIni), size]))
      .digest('hex')
      .slice(0, 32);
  };

  function cached(req: FramingPreviewRequest): string | undefined {
    const exe = deps.vpxExe();
    if (!exe || !fs.existsSync(req.table)) return undefined;
    const file = path.join(cacheDir, `${keyOf(req, exe)}.png`);
    return fs.existsSync(file) ? file : undefined;
  }

  function render(req: FramingPreviewRequest): Promise<string> {
    const exe = deps.vpxExe();
    if (!exe) return Promise.reject(new Error('VPX absent')); // i18n-ignore : erreur technique, dite par l'écran
    const key = keyOf(req, exe);
    const out = path.join(cacheDir, `${key}.png`);
    if (fs.existsSync(out)) return Promise.resolve(out);
    const known = running.get(key);
    if (known) return known;
    const job = queue.then(() => renderNow(req, exe, out, key));
    queue = job.catch(() => undefined);
    running.set(key, job);
    void job.finally(() => running.delete(key)).catch(() => undefined);
    return job;
  }

  async function renderNow(req: FramingPreviewRequest, exe: string, out: string, key: string): Promise<string> {
    if (fs.existsSync(out)) return out;
    const first = await attempt(req, exe, key, false);
    const image = first.image ?? (first.needsPup ? (await attempt(req, exe, key, true)).image : undefined);
    if (!image) throw new Error(first.error ?? 'aucune image'); // i18n-ignore : erreur technique, dite par l'écran
    fs.mkdirSync(cacheDir, { recursive: true });
    // lecture entière : une image QOI de VPX, à RENDER_HEIGHT de haut (quelques Mo au plus).
    writeFileAtomic(out, encodePng(decodeQoi(fs.readFileSync(image))));
    return out;
  }

  async function attempt(req: FramingPreviewRequest, exe: string, key: string, pup: boolean): Promise<{ image?: string; needsPup?: boolean; error?: string }> {
    const work = path.join(cacheDir, 'travail', key);
    fs.rmSync(work, { recursive: true, force: true });
    const tableDir = path.join(work, 'table');
    const pinmame = path.join(work, 'pinmame');
    const prefs = path.join(work, 'vpx');
    for (const dir of [tableDir, path.join(pinmame, 'roms'), path.join(pinmame, 'nvram'), prefs]) fs.mkdirSync(dir, { recursive: true });
    try {
      const played = path.join(tableDir, path.basename(req.table));
      linkOrCopy(req.table, played);
      // Le script remplacé par Cyber Pinball (<table>.vbs), s'il y en a un : la table démarre comme en partie.
      const vbs = req.table.replace(/\.vpx$/i, '.vbs');
      if (fs.existsSync(vbs)) linkOrCopy(vbs, played.replace(/\.vpx$/i, '.vbs'));
      const tableIni = played.replace(/\.vpx$/i, '.ini');
      if (req.tableIni) fs.writeFileSync(tableIni, req.tableIni);
      if (req.rom) {
        // Où PinMAME trouve la ROM : le dossier de VPinballX.ini, celui de la table, celui de Cyber Pinball.
        const sources = [IniDocument.parse(req.globalIni).get('Plugin.PinMAME', 'PinMAMEPath')?.trim(), path.join(path.dirname(req.table), 'pinmame'), req.pinmame].filter((s): s is string => Boolean(s));
        const rom = sources.map((s) => path.join(s, 'roms', `${req.rom}.zip`)).find((f) => fs.existsSync(f));
        if (rom) linkOrCopy(rom, path.join(pinmame, 'roms', `${req.rom}.zip`));
        // La mémoire de la ROM, copiée : sans elle, « FACTORY SETTINGS RESTORED » ; l'original n'est jamais écrit.
        const nv = sources.map((s) => path.join(s, 'nvram', `${req.rom}.nv`)).find((f) => fs.existsSync(f));
        if (nv) fs.copyFileSync(nv, path.join(pinmame, 'nvram', `${req.rom}.nv`));
      }
      const ini = path.join(work, 'VPinballX.ini');
      fs.writeFileSync(ini, previewIni(req.globalIni, req.window, pinmame, pup));
      const log = path.join(work, 'sortie.txt');
      const quote = (s: string) => `"${s}"`;
      const command = [exe, '-PrefPath', prefs, '-Ini', ini, '-CaptureAttract', '1', '1', played, 'noloop'].map((s) => (/^-|^\d+$|^noloop$/.test(s) ? s : quote(s))).join(' ');
      const run = startOnHiddenDesktop(command, path.dirname(exe), log);
      const started = Date.now();
      while (!run.wait(0)) {
        if (Date.now() - started > RENDER_TIMEOUT_MS) break;
        await new Promise((r) => setTimeout(r, 500));
      }
      // finish() ferme l'objet tâche : VPX et ce qu'il a lancé s'arrêtent avec lui, même au délai.
      run.finish();
      const capture = path.join(tableDir, 'Capture');
      const image = fs.existsSync(capture) ? fs.readdirSync(capture).find((f) => /^Playfield_\d+.*\.qoi$/i.test(f)) : undefined;
      if (image) {
        const kept = path.join(cacheDir, 'travail', `${key}.qoi`);
        fs.copyFileSync(path.join(capture, image), kept);
        return { image: kept };
      }
      const vpxLog = [path.join(prefs, 'vpinball.log'), path.join(prefs, '10.8', 'vpinball.log')].find((f) => fs.existsSync(f));
      const lines = vpxLog ? fs.readFileSync(vpxLog, 'utf8').split(/\r?\n/).filter((l) => / (ERROR|FATAL) /.test(l)) : [];
      deps.log?.(`Aperçu du cadrage : aucune image de ${path.basename(req.table)} (${lines.slice(0, 3).join(' | ') || 'journal vide'}).`); // i18n-ignore : journal
      return { needsPup: !pup && lines.some((l) => /PinUpPlayer/i.test(l)), error: lines[0] };
    } finally {
      // Seulement des liens physiques et des copies : les retirer ne touche jamais aux originaux.
      fs.rmSync(work, { recursive: true, force: true });
    }
  }

  return { cached, render };
}

/** Taille de l'image rendue : la forme de la fenêtre du playfield, RENDER_HEIGHT de haut (pair, pour l'encodeur de VPX). */
export function renderSize(window: { width: number; height: number }): { width: number; height: number } {
  const ratio = window.width > 0 && window.height > 0 ? window.width / window.height : 9 / 16;
  return { width: Math.max(2, Math.round((RENDER_HEIGHT * ratio) / 2) * 2), height: RENDER_HEIGHT };
}

/** Les clés de VPinballX.ini qui changent le cadrage : la clé du cache n'en dépend que d'elles. */
function framingKeys(globalIni: string): string {
  const doc = IniDocument.parse(globalIni);
  return ['BGSet', 'CabinetAutofitMode', 'CabinetAutofitKeepTop', 'CabinetAutofitMaxStretch', 'CabinetAutofitPos', 'ScreenWidth', 'ScreenHeight', 'ScreenInclination', 'ScreenPlayerX', 'ScreenPlayerY', 'ScreenPlayerZ']
    .map((k) => `${k}=${doc.get('Player', k)?.trim() ?? ''}`)
    .join(';');
}

/** VPinballX.ini d'un aperçu : celui de la borne, fenêtré à la forme du playfield, sans son ni toys ni fenêtres annexes. */
export function previewIni(globalIni: string, window: { width: number; height: number }, pinmame: string, pup: boolean): string {
  const doc = IniDocument.parse(globalIni);
  const size = renderSize(window);
  const settings: VpxSetting[] = [
    ...VPX_PLAY_SETTINGS,
    { section: 'Player', key: 'MusicVolume', value: '0' },
    { section: 'Player', key: 'SoundVolume', value: '0' },
    { section: 'Player', key: 'PlayfieldFullScreen', value: '0' },
    { section: 'Player', key: 'PlayfieldWndX', value: '0' },
    { section: 'Player', key: 'PlayfieldWndY', value: '0' },
    { section: 'Player', key: 'PlayfieldWidth', value: String(size.width) },
    { section: 'Player', key: 'PlayfieldHeight', value: String(size.height) },
    { section: 'Backglass', key: 'BackglassOutput', value: '0' },
    { section: 'ScoreView', key: 'ScoreViewOutput', value: '0' },
    { section: 'Topper', key: 'TopperOutput', value: '0' },
    { section: 'Plugin.PinMAME', key: 'Enable', value: '1' },
    { section: 'Plugin.PinMAME', key: 'PinMAMEPath', value: pinmame },
    PINMAME_FAST_BOOT,
    ...QUIET_PLUGINS.map((id) => ({ section: `Plugin.${id}`, key: 'Enable', value: id === 'PUP' && pup ? '1' : '0' })),
  ];
  applyVpxSettings(doc, settings);
  return doc.toString();
}
