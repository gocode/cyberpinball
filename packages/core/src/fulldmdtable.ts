// Habillage FullDMD d'une table : ce que la borne, les fichiers de la table et son .ini disent
// (fulldmdframe.ts pour le cadre et la décision). Partagé par la partie (frontend.ts), le
// médecin (doctor.ts) et le diagnostic de toutes les tables (fulldmd-cli.ts).

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ScriptFacts } from './doctor';
import { dmdKindOf, dmdScreen } from './dmdscreen';
import type { Finding } from './doctor';
import type { FileOp } from './fileops';
import { t } from './i18n';
import { IniDocument } from './ini';
import { resolveRoleMedia, type ResolvedMedia } from './medias';
import type { Cabinet, DmdKind, Rect } from './model';
import { analysePack, findPackRoot, pupWindows } from './puppack';
import { readInfo, type TableEntry } from './tables';
import { findTableIni } from './vpx-settings';
import { isFullZone, roleZone, zoneRect, type ZonePlacement } from './zones';
import {
  dressCoverage,
  DRESS_COVERED,
  dressRecord,
  dressUpdate,
  fullDmdPlan,
  isDressWindow,
  tableDmdWindow,
  withDressRecord,
  type FrameRecord,
  type FullDmdPlan,
  type TableDmdWindow,
} from './fulldmdframe';

/** L'écran du DMD de la borne, tel que VPX y ouvre sa fenêtre. */
export interface DressScreen {
  dmdKind: DmdKind | undefined;
  placement: ZonePlacement | undefined;
  /** Zone du DMD en pixels, relative à son écran (comme [ScoreView] ScoreViewWndX…). */
  zone: Rect | undefined;
}

/**
 * Écran du DMD d'après le modèle de la borne : son type (FullDMD ou DMD seul), la façon dont
 * VPX y ouvre sa fenêtre (zonePlacement : incrustée dans le playfield, plein écran, fenêtre sur
 * une zone) et la zone en pixels de l'écran (zoneRect, comme vpxRect).
 */
export function dressScreen(cabinet: Cabinet | undefined): DressScreen {
  const screen = cabinet && dmdScreen(cabinet);
  if (!cabinet || !screen) return { dmdKind: undefined, placement: undefined, zone: undefined };
  const zone = roleZone(cabinet, 'dmd');
  const sameAsPlayfield = cabinet.roles.dmd === cabinet.roles.playfield;
  const pf = roleZone(cabinet, 'playfield');
  const inside = zone.x >= pf.x - 1e-6 && zone.y >= pf.y - 1e-6 && zone.x + zone.width <= pf.x + pf.width + 1e-6 && zone.y + zone.height <= pf.y + pf.height + 1e-6;
  const placement: ZonePlacement = sameAsPlayfield && inside ? 'embedded' : isFullZone(zone) ? 'screen' : 'window';
  return { dmdKind: dmdKindOf(cabinet), placement, zone: zoneRect(zone, { width: screen.widthPx, height: screen.heightPx }) };
}

/**
 * Un PuP-Pack de la table dessine dans la fenêtre du DMD pendant la partie : la table lance
 * PuP (ou son script est inconnu), un pack a un écran 5 ou 1 utilisable (pupWindows), et le
 * .ini de la table ne lui retire pas la fenêtre ([ScoreView] Priority.PUP = 0, règle pupHidesDmd).
 */
export function pupInDmdWindow(entry: TableEntry, facts: ScriptFacts | undefined): boolean {
  if (facts && (!facts.pup || facts.pup.disabledBy)) return false;
  const ini = findTableIni(entry.file);
  if (ini.exists && IniDocument.parse(fs.readFileSync(ini.path, 'utf8')).get('ScoreView', 'Priority.PUP')?.trim() === '0') return false;
  const pupName = listSafe(entry.folder).find((f) => f.toLowerCase() === 'pupvideos');
  if (!pupName) return false;
  const pupvideos = path.join(entry.folder, pupName);
  return listSafe(pupvideos).some((pack) => {
    const dir = path.join(pupvideos, pack);
    try {
      if (!fs.statSync(dir).isDirectory()) return false;
      const info = analysePack(findPackRoot(dir) ?? dir);
      return info.screens.length > 0 && pupWindows(info.screens).dmd;
    } catch {
      return false;
    }
  });
}

function listSafe(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

export interface DressOptions {
  screen: DressScreen;
  /** Racine de Cyber Pinball (médias par défaut, <racine>\media). */
  root: string;
  cabinet?: Cabinet;
  /** Lecture du script de la table ; undefined : inconnue. */
  facts?: ScriptFacts;
  /** Le .directb2s de la table a une image FullDMD (b2sImages : dmd). */
  b2sFullDmd: boolean;
  /** Cadre déjà cherché dans un média (cache, ou PNG lu sur place). */
  frameOf: (media: string) => FrameRecord | undefined;
}

/** Habillage d'une table : la décision, et la fenêtre du DMD que son .ini donne aujourd'hui. */
export interface TableDressing {
  plan: FullDmdPlan;
  /** Média FullDMD de la table, s'il y en a un. */
  media?: string;
  /** Zone du DMD en pixels de son écran. */
  zone?: Rect;
  iniPath: string;
  /** Fenêtre du DMD écrite dans le .ini de la table. */
  current: TableDmdWindow;
  /** Place écrite par Cyber Pinball la dernière fois (.info). */
  record?: Rect;
  /** La place du .ini est celle de l'habillage, gérée par Cyber Pinball. */
  ours: boolean;
}

/**
 * Média FullDMD que le menu montre pour cette table sur l'écran du FullDMD, s'il peut porter un
 * habillage : un fichier FullDMD de la table ou de la borne (<racine>\media), pas l'image du
 * .directb2s (le plugin B2S la montre lui-même), ni un DMD 4:1 agrandi.
 */
export function dressingMedia(entry: TableEntry, screen: DressScreen, root: string, cabinet: Cabinet | undefined): string | undefined {
  return screen.dmdKind === 'fulldmd' ? dressableFile(resolveRoleMedia(entry, root, 'dmd', { cabinet })) : undefined;
}

const dressableFile = (r: ResolvedMedia) => (r.file && r.foundType === 'FullDMD' && r.source !== 'b2s' && r.source !== 'fallback' ? r.file : undefined);

export function tableDressing(entry: TableEntry, opts: DressOptions): TableDressing {
  const resolved = opts.screen.dmdKind === 'fulldmd' ? resolveRoleMedia(entry, opts.root, 'dmd', { cabinet: opts.cabinet }) : undefined;
  const media = resolved && dressableFile(resolved);
  const plan = fullDmdPlan({
    dmdKind: opts.screen.dmdKind,
    placement: opts.screen.placement,
    zone: opts.screen.zone,
    media: resolved?.file ? { file: resolved.file, type: resolved.foundType, source: resolved.source } : undefined,
    frame: media ? opts.frameOf(media) : undefined,
    drawsDmd: opts.facts ? Boolean(opts.facts.drawsDmd) : undefined,
    b2sFullDmd: opts.b2sFullDmd,
    pupInDmdWindow: pupInDmdWindow(entry, opts.facts),
  });
  const ini = findTableIni(entry.file);
  const current = tableDmdWindow(IniDocument.parse(ini.exists ? fs.readFileSync(ini.path, 'utf8') : ''));
  // Le .info relu : un autre écran (médias, PuP-Pack) a pu l'écrire depuis la lecture des tables.
  const record = dressRecord(readInfo(entry.infoFile));
  return { plan, media, zone: opts.screen.zone, iniPath: ini.path, current, record, ours: isDressWindow(current, record) };
}

/**
 * Opérations qui posent la fenêtre du DMD dans le cadre (ou la rendent à la disposition
 * générale quand l'habillage n'a plus lieu) : le .ini de la table et la place retenue dans
 * son .info. Vide quand rien ne change, ou quand l'utilisateur a réglé sa place en partie.
 */
export function dressingOps(entry: TableEntry, dressing: TableDressing): { state: ReturnType<typeof dressUpdate>['state']; ops: FileOp[] } {
  const text = fs.existsSync(dressing.iniPath) ? fs.readFileSync(dressing.iniPath, 'utf8') : '';
  const update = dressUpdate(text, dressing.plan, dressing.record);
  const ops: FileOp[] = [];
  if (update.content !== undefined) ops.push(update.content === '' ? { op: 'trash', path: dressing.iniPath } : { op: 'write', path: dressing.iniPath, content: update.content });
  if (update.record !== undefined) ops.push({ op: 'write', path: entry.infoFile, content: JSON.stringify(withDressRecord(readInfo(entry.infoFile), update.record), null, 2) + '\n' });
  return { state: update.state, ops };
}

/** Fenêtre que VPX ouvrira pour le DMD de cette table (le .ini de la table, sinon toute la zone). */
export function gameDmdWindow(dressing: TableDressing): Rect | undefined {
  if (!dressing.zone) return undefined;
  if (dressing.current.fullScreen === '1' || !dressing.current.rect) return dressing.zone;
  return dressing.current.rect;
}

/**
 * Constat du médecin : la table a un habillage FullDMD, mais la place du DMD réglée pour elle
 * (menu de VPX, « Save as Table Override », ou un .ini venu avec la table) le recouvre : en
 * partie, le DMD s'étale sur tout l'écran et l'habillage disparaît. La correction pose le DMD
 * dans le cadre de l'habillage, que Cyber Pinball gère ensuite.
 */
export function dressHiddenFinding(entry: TableEntry, dressing: TableDressing): Finding | undefined {
  const plan = dressing.plan;
  if (!plan.dressed || dressing.ours || !dressing.current.keys.length || !dressing.zone) return undefined;
  const window = gameDmdWindow(dressing)!;
  if (dressCoverage(window, dressing.zone, plan.window) < DRESS_COVERED) return undefined;
  const doc = IniDocument.parse(fs.existsSync(dressing.iniPath) ? fs.readFileSync(dressing.iniPath, 'utf8') : '');
  for (const key of dressing.current.keys) doc.remove('ScoreView', key);
  const fixed = dressUpdate(doc.toString(), plan, undefined);
  const file = path.basename(dressing.iniPath);
  return {
    code: 'fullDmdHidden',
    severity: 'warning',
    title: t('Le DMD cacherait l’habillage FullDMD'),
    detail: t('{media} habille l’écran du FullDMD autour d’un cadre de DMD, mais {file} place le DMD de cette table sur {where} : en partie, il recouvrirait l’habillage. Cyber Pinball pose le DMD dans le cadre ({w} × {h} en {x}, {y}) ; la place s’ajuste ensuite en partie, dans le menu de VPX.', {
      media: dressing.media ? path.basename(dressing.media) : 'FullDMD',
      file,
      where: dressing.current.fullScreen === '1' || !dressing.current.rect ? t('tout l’écran') : `${window.width} × ${window.height}`,
      w: plan.window.width,
      h: plan.window.height,
      x: plan.window.x,
      y: plan.window.y,
    }),
    fix: {
      label: t('Poser le DMD dans le cadre de l’habillage'),
      ops: [
        { op: 'write', path: dressing.iniPath, content: fixed.content! },
        { op: 'write', path: entry.infoFile, content: JSON.stringify(withDressRecord(readInfo(entry.infoFile), plan.window), null, 2) + '\n' },
      ],
    },
  };
}

/**
 * Pendant la partie : part de l'habillage que recouvrent les fenêtres d'autres processus (VPX,
 * PinMAME, PuP) posées au-dessus de la nôtre sur l'écran du DMD, d'après la pile des fenêtres de
 * Windows (la plus haute d'abord, comme occupiedRoles). `dmd` est la zone du
 * DMD en pixels du bureau ; le cadre y est reporté à l'échelle. 0 sans habillage.
 */
export function liveDressCoverage(windows: readonly { rect: Rect; pid: number; minimized?: boolean }[], ownPid: number, dmd: Rect, dressing: TableDressing): number {
  const plan = dressing.plan;
  if (!plan.dressed || !dressing.zone || dressing.zone.width <= 0 || dressing.zone.height <= 0) return 0;
  const sx = dmd.width / dressing.zone.width;
  const sy = dmd.height / dressing.zone.height;
  const frame: Rect = {
    x: dmd.x + (plan.window.x - dressing.zone.x) * sx,
    y: dmd.y + (plan.window.y - dressing.zone.y) * sy,
    width: plan.window.width * sx,
    height: plan.window.height * sy,
  };
  let most = 0;
  for (const w of windows) {
    if (w.minimized) continue;
    // Pile de Windows, la plus haute d'abord : sous notre fenêtre du DMD, plus rien ne se voit.
    if (w.pid === ownPid) {
      if (dressCoverage(w.rect, dmd, { x: dmd.x, y: dmd.y, width: 0, height: 0 }) >= 0.99) break;
      continue;
    }
    most = Math.max(most, dressCoverage(w.rect, dmd, frame));
  }
  return most;
}
