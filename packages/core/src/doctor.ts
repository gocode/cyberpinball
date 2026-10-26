// Médecin des tables : repère ce qui empêche une table de bien fonctionner et
// propose une correction précise, que l'utilisateur déclenche lui-même.
// Le script de la table (nom de la ROM) est lu par l'application avec
// VPinballX -ExtractVBS ; ici on ne fait qu'interpréter son texte.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { applyOps, formatSize, isInside, safeName, sameVolume, sizeOf, type FileOp, type OpContext } from './fileops';
import { formatDate, formatDateTime, formatList, t, tn } from './i18n';
import { IniDocument } from './ini';
import { isCurrentMediaError, mediaErrorsFile, readMediaErrors, type MediaErrorEntry, type MediaErrorKind } from './mediaerrors';
import {
  dmdTypeForRatio,
  isAcceptedFormat,
  mediaFileName,
  mediaKind,
  mediaNames,
  mediaTypeFromFolder,
  mediaTypeFromVpinfe,
  mediaTypeInfo,
  MEDIA_TYPES,
  pageOf,
  parseMediaFileName,
  readMediaDimensions,
  tableMediaDir,
  UNREADABLE_FORMATS,
  type MediaDimensions,
  type MediaKind,
  type MediaType,
} from './medias';
import type { RoleId } from './model';
import {
  analysePack,
  appliedVariant,
  cabinetFullDmd,
  chooseVariant,
  describePupCabinet,
  enablePupSwitch,
  expectedPackNames,
  findPackRoot,
  isVisible,
  pupScriptFacts,
  pupScriptSwitch,
  pupWindows,
  playlistRenames,
  screenRole,
  scoreVariant,
  variantTraitsLabel,
  type PupCabinet,
  type PupScriptFacts,
  type PupSwitch,
  type PupVariant,
  type PlaylistRename,
} from './puppack';
import { buildScriptPatch, readScriptPatch, scriptPatchState, type ScriptPatchState } from './scriptpatch';
import { aliasFor, historicAlias, neighbourRom, neighbourWarning, readTableAliases, romFamilyOf, tableAliasFile, withAlias, withoutAlias } from './romalias';
import { listRoms, romFile, sameRomContent, sameRomFile, storedRom } from './romlibrary';
import { isChipName, listRelative, readZipEntries, romContent, type RomZipMember } from './romzip';
import { companion, nameKey } from './tablefiles';
import { playBlockers, playSeverity } from './playable';
import { parseTableName, type TableEntry } from './tables';
import { findTableIni } from './vpx-settings';
import { EDGE_LABELS } from './layout';
import { orientationFinding, type PlayfieldOrientation } from './sync';
import { vpxPlayedFlipperEdge } from './vpx';
import { scriptCode } from './vbscript';
import { readVpxScript } from './vpxinfo';
import { ratioLabel } from './zones';

export type FindingSeverity = 'error' | 'warning' | 'info';

export interface Fix {
  /** Ce que fait la correction, dit à l'utilisateur avant qu'il la déclenche. */
  label: string;
  ops: FileOp[];
}

/** Toutes les règles du médecin ; chacune a sa table piégée (doctor-traps.test.ts). */
export const FINDING_CODES = [
  'outsideFolder',
  'scriptOverride',
  'scriptPatchStale',
  'backglassMissing',
  'backglassMisnamed',
  'backglassStray',
  'romMissing',
  'romMisplaced',
  'romUnknown',
  'romNotLinked',
  'romScattered',
  'romNested',
  'romCopy',
  'romAlias',
  'romAliasHistoric',
  'romAliasObsolete',
  'dmdFolderMissing',
  'scriptUnreadable',
  'crashReport',
  'infoMissing',
  'pupMissing',
  'pupNested',
  'pupOrphan',
  'pupOptionNotApplied',
  'pupOptionUnsuited',
  'pupDisabledByScript',
  'pupHidesDmd',
  'pupPlaylistOrder',
  'pupScreenAbsent',
  'pupPlayfieldScreen',
  'pupScriptDriven',
  'pupCaptureRom',
  'pupLog',
  'manualView',
  'tableOrientation',
  'tableWindows',
  'mediaUnreadable',
  'mediaMisnamed',
  'mediaStray',
  'mediaRatio',
  'mediaDmdSwapped',
  'mediaHuge',
  'mediaDuplicate',
  'mediaPlaybackError',
] as const;

export interface Finding {
  code: (typeof FINDING_CODES)[number];
  severity: FindingSeverity;
  title: string;
  detail: string;
  fix?: Fix;
  /**
   * Constats de ROM : la ROM qui manque ou qu'il faut lier (`rom`), et la révision voisine
   * présente sur la borne (`neighbour`), pour le parcours « Ce qu'il manque pour jouer » (journey.ts).
   */
  rom?: string;
  neighbour?: string;
}

/** Ce qu'on a appris du script de la table. */
export interface ScriptFacts {
  /** La table pilote un vrai jeu par PinMAME : il lui faut une ROM. */
  usesPinmame: boolean;
  /** Noms de ROM possibles (certaines tables laissent choisir entre plusieurs). */
  roms: string[];
  /**
   * Dossier, à côté de la table, d'où FlexDMD ou UltraDMD charge les images,
   * vidéos et polices du DMD (ProjectFolder). Facultatif pour jouer (playable.ts) :
   * sans lui, ce DMD-là reste vide et certains scripts s'arrêtent (« Type incompatible »).
   */
  dmdFolder?: string;
  /**
   * La table dessine son propre DMD (ROM de PinMAME, FlexDMD, UltraDMD) : un PuP-Pack qui
   * occupe la fenêtre du DMD le cache, le plugin PUP ne dessinant jamais le DMD de la table.
   */
  drawsDmd?: boolean;
  /** Absent si la table n'utilise pas PuP. */
  pup?: PupScriptFacts;
}

export interface DoctorContext {
  tablesDir: string;
  /** Résultat de la lecture du script, ou l'erreur rencontrée ; absent si VPX n'est pas installé. */
  script?: ScriptFacts | { error: string };
  /** Dossier des journaux, où l'on garde une copie du crash.txt avant de le retirer. */
  logsDir?: string;
  /** Écrans de la borne, pour les PuP-Packs (option, écrans absents) ; absent sans modèle de borne. */
  cabinet?: PupCabinet;
  /** Contenu de vpinball.log, s'il est lisible : ce que VPX a dit du pack à la dernière partie. */
  vpxLog?: string;
  /**
   * Noms de pack attendus par les autres versions du dossier, qui partagent
   * pupvideos ; undefined si le script de l'une d'elles n'est pas connu.
   */
  otherPackNames?: string[];
  /** Bibliothèque de ROM (<racine>\pinmame\roms) ; absente, les liens ne sont pas vérifiés. */
  romLibrary?: string;
  /**
   * Erreurs de lecture des médias enregistrées par l'affichage ; absentes, elles
   * sont lues dans <logsDir>\medias-erreurs.json (mediaerrors.ts).
   */
  mediaErrors?: MediaErrorEntry[];
  /** Playfield de la borne (playfieldOrientation) : le .ini de la table peut changer le sens de la partie. */
  orientation?: PlayfieldOrientation;
}

/** Mémoire de Cyber Pinball dans le .info : option et nom d'origine de chaque pack installé. */
export interface PupMemory {
  option?: string;
  origin?: string;
  /** L'option a été choisie dans la fiche (« PuP-Pack ») : le médecin ne propose plus d'en changer. */
  chosen?: 'user';
}

export function pupMemory(info: { [key: string]: unknown }, pack: string): PupMemory | undefined {
  const own = info.CyberPinball as { pup?: Record<string, PupMemory> } | undefined;
  const found = Object.entries(own?.pup ?? {}).find(([name]) => name.toLowerCase() === pack.toLowerCase());
  return found?.[1];
}

/** Le .info avec la mémoire de ce pack remplacée, les autres champs conservés. */
export function setPupMemory<T extends { [key: string]: unknown }>(info: T, pack: string, memory: PupMemory): T {
  const own = { ...(info.CyberPinball as { pup?: Record<string, PupMemory> } | undefined) };
  const pup = Object.fromEntries(Object.entries(own.pup ?? {}).filter(([name]) => name.toLowerCase() !== pack.toLowerCase()));
  pup[pack] = memory;
  return { ...info, CyberPinball: { ...own, pup } };
}

function withPupMemory(info: { [key: string]: unknown }, pack: string, memory: PupMemory): string {
  return JSON.stringify(setPupMemory(info, pack, memory), null, 2) + '\n';
}

/**
 * Opérations qui appliquent une option d'un pack installé : ses fichiers recopiés à la
 * racine (les .pup remplacés partent à la corbeille avec la copie), ceux que son .bat
 * supprime à la corbeille, et l'option retenue dans le .info pour les mises à jour.
 * Rien n'est exécuté : le .bat n'a été que lu (analysePack).
 */
export function pupOptionOps(entry: TableEntry, root: string, pack: string, variant: PupVariant, memory: PupMemory): FileOp[] {
  return [
    ...variant.copies.map((c) => ({ op: 'copy' as const, from: path.join(root, c.from), to: path.join(root, c.to) })),
    ...variant.deletes.map((d) => ({ op: 'trash' as const, path: path.join(root, d) })),
    ...(fs.existsSync(entry.infoFile) ? [{ op: 'write' as const, path: entry.infoFile, content: withPupMemory(entry.info, pack, { ...memory, option: variant.label }) }] : []),
  ];
}

export interface TablePupPack {
  /** Nom du dossier dans pupvideos. */
  pack: string;
  /** Racine du pack (screens.pup). */
  root: string;
  variants: PupVariant[];
  /** Option dont les .pup sont à la racine. */
  applied?: PupVariant;
  /** Option la plus proche de la borne, si le choix est net. */
  recommended?: PupVariant;
  memory?: PupMemory;
}

/**
 * PuP-Packs d'une table qui ont des options (variantes lues dans leurs .bat ou leurs
 * dossiers d'options), avec celle appliquée et celle qui convient à la borne : la fiche
 * les propose (« PuP-Pack »), le médecin compare les deux.
 */
export function tablePupPacks(entry: TableEntry, borne?: PupCabinet): TablePupPack[] {
  const cabinet = withTableBackglass(entry, borne);
  const pupName = listSafe(entry.folder).find((f) => f.toLowerCase() === 'pupvideos');
  if (!pupName) return [];
  const pupvideos = path.join(entry.folder, pupName);
  return listDirs(pupvideos).flatMap((pack) => {
    const dir = path.join(pupvideos, pack);
    const info = analysePack(findPackRoot(dir) ?? dir);
    if (!info.variants.length) return [];
    const best = cabinet ? chooseVariant(info.variants, cabinet) : undefined;
    return [
      {
        pack,
        root: info.root,
        variants: info.variants,
        applied: appliedVariant(info),
        recommended: best?.confident ? best.chosen : undefined,
        memory: pupMemory(entry.info, pack),
      },
    ];
  });
}

/**
 * La borne, et si cette table a son fronton (.directb2s) : une option de PuP-Pack qui
 * laisse le fronton au B2S n'y montre sinon qu'une image fixe (pupWindows).
 */
function withTableBackglass(entry: TableEntry, cabinet: PupCabinet | undefined): PupCabinet | undefined {
  if (!cabinet) return undefined;
  const base = path.basename(entry.file).replace(/.vpx$/i, '');
  return { ...cabinet, tableBackglass: Boolean(companion(entry.folder, base, true, '.directb2s')) };
}

/** Nom du dossier d'une table : « Terminator 2 (Williams 1991) ». */
export function tableFolderName(title: string, manufacturer?: string, year?: number): string {
  const suffix = [manufacturer, year].filter(Boolean).join(' ');
  return safeName(suffix ? `${title} (${suffix})` : title) || 'Table';
}

/** Nom(s) de ROM d'après le script VBScript de la table. */
export function scriptFacts(vbs: string): ScriptFacts {
  const code = scriptCode(vbs);
  const usesPinmame = /\bLoadVPM\b|VPinMAME\.Controller/i.test(code);
  const roms: string[] = [];
  const add = (name: string) => {
    if (name && !roms.some((r) => r.toLowerCase() === name.toLowerCase())) roms.push(name);
  };
  for (const m of code.matchAll(/\.GameName\s*=\s*("([^"]*)"|[A-Za-z_]\w*)/g)) {
    if (m[2] !== undefined) add(m[2].trim());
    else {
      const variable = m[1]!;
      for (const v of code.matchAll(new RegExp(`\\b${variable}\\s*=\\s*"([^"]*)"`, 'gi'))) add(v[1]!.trim());
    }
  }
  const facts: ScriptFacts = { usesPinmame, roms: usesPinmame ? roms : [] };
  const dmdFolder = dmdProjectFolder(code);
  if (dmdFolder) facts.dmdFolder = dmdFolder;
  if (usesPinmame || dmdFolder || /CreateObject\s*\(\s*"(FlexDMD\.FlexDMD|UltraDMD\.DMDObject)"/i.test(code)) facts.drawsDmd = true;
  const pup = pupScriptFacts(code);
  if (pup) facts.pup = pup;
  return facts;
}

/**
 * Dossier du DMD d'après « .ProjectFolder = "./TheGooniesDMD/" » ou
 * « .ProjectFolder = ".\"&myGameName&".FlexDMD\" » (FlexDMD), ou
 * « .SetProjectFolder curDir & "\Foo.UltraDMD" » (UltraDMD). Le chemin part du
 * dossier de la table ; un chemin absolu ne concerne pas ce dossier.
 */
function dmdProjectFolder(code: string): string | undefined {
  for (const m of code.matchAll(/\.(?:ProjectFolder\s*=|SetProjectFolder\b)\s*\(?([^\n:]*)/gi)) {
    const parts = m[1]!.replace(/\)\s*$/, '').split('&').map((p) => p.trim());
    let value = '';
    for (const [i, part] of parts.entries()) {
      const literal = /^"([^"]*)"$/.exec(part);
      const variable = /^[A-Za-z_]\w*$/.test(part) ? new RegExp(`\\b${part}\\s*=\\s*"([^"]*)"`, 'i').exec(code) : null;
      if (literal) value += literal[1];
      else if (variable) value += variable[1];
      // Variable de tête non résolue (curDir, TablesDirectory) : le dossier de la table.
      else if (i === 0 && /^[A-Za-z_]\w*$/.test(part)) continue;
      else {
        value = '';
        break;
      }
    }
    value = value.trim();
    if (!value || /^[a-z]:|^\\\\/i.test(value)) continue;
    const name = value.split(/[\\/]/).filter((part) => part && part !== '.').at(-1);
    if (name && name !== '..') return name;
  }
  return undefined;
}

export function diagnose(entry: TableEntry, ctx: DoctorContext): Finding[] {
  const findings: Finding[] = [];
  const folder = entry.folder;
  const base = path.basename(entry.file).replace(/\.vpx$/i, '');
  const ownFolder = path.resolve(folder).toLowerCase() !== path.resolve(ctx.tablesDir).toLowerCase();
  const files = fs.readdirSync(folder);
  const has = (name: string) => files.find((f) => f.toLowerCase() === name.toLowerCase());

  // 1. Table rangée en vrac dans le dossier des tables.
  if (!ownFolder) {
    const target = path.join(ctx.tablesDir, tableFolderName(entry.title, entry.manufacturer, entry.year));
    const moved = files.filter((f) => f.toLowerCase().startsWith(`${base.toLowerCase()}.`) && !fs.statSync(path.join(folder, f)).isDirectory());
    findings.push({
      code: 'outsideFolder',
      severity: 'warning',
      title: t('Table hors de son propre dossier'),
      detail: t('VPX range chaque table dans son dossier, avec sa ROM, son backglass et ses vidéos. Celle-ci est en vrac dans {dir}.', { dir: ctx.tablesDir }),
      fix: {
        label:
          moved.length > 1
            ? t('Déplacer ses {n} fichiers dans « {folder} »', { n: moved.length, folder: path.basename(target) })
            : t('Déplacer la table dans « {folder} »', { folder: path.basename(target) }),
        ops: moved.map((f) => ({ op: 'move', from: path.join(folder, f), to: path.join(target, f) })),
      },
    });
  }

  // 2. Un .vbs nommé comme la table remplace son script ; celui de Cyber Pinball (PuP-Pack
  // allumé, scriptpatch.ts) est le bienvenu tant qu'il est tiré du script actuel de la table.
  const vbs = has(`${base}.vbs`);
  const override = vbs ? readOverride(entry, path.join(folder, vbs)) : undefined;
  if (override?.state.kind === 'stale') {
    findings.push(staleFinding(override));
  } else if (vbs && override?.state.kind !== 'ours') {
    findings.push({
      code: 'scriptOverride',
      severity: 'warning',
      title: t('Script de la table remplacé'),
      detail: t("{file} remplace le script contenu dans la table. C'est parfois voulu (correctif), souvent un reste d'extraction qui rend la table injouable après une mise à jour.", { file: vbs }),
      fix: { label: t('Mettre {file} à la corbeille', { file: vbs }), ops: [{ op: 'trash', path: path.join(folder, vbs) }] },
    });
  }

  // 3. Backglass.
  const backglass = companion(folder, base, ownFolder, '.directb2s');
  const versionBases = files.filter((f) => f.toLowerCase().endsWith('.vpx')).map((f) => f.slice(0, -4).toLowerCase());
  const strays = files.filter(
    (f) =>
      f.toLowerCase().endsWith('.directb2s') &&
      (!backglass || f.toLowerCase() !== path.basename(backglass).toLowerCase()) &&
      !versionBases.includes(f.slice(0, -'.directb2s'.length).toLowerCase()),
  );
  if (!backglass && strays.length && ownFolder) {
    const best = bestMatch(strays, [entry.title, base, path.basename(folder)]);
    const wanted = `${path.basename(folder)}.directb2s`;
    findings.push({
      code: 'backglassMisnamed',
      severity: 'warning',
      title: t('Backglass mal nommé'),
      detail: t('VPX cherche « {base}.directb2s » ou « {wanted} » : « {best} » ne sera pas affiché.', { base, wanted, best }),
      fix: { label: t('Renommer en « {name} »', { name: wanted }), ops: [{ op: 'move', from: path.join(folder, best), to: path.join(folder, wanted) }] },
    });
  } else if (!backglass) {
    findings.push({
      code: 'backglassMissing',
      severity: 'info',
      title: t('Pas de backglass'),
      detail: t('Le second écran restera sur l’image de Cyber Pinball. Ajoutez un fichier .directb2s avec « Ajouter une table » pour l’animer.'),
    });
  } else if (strays.length) {
    const size = strays.reduce((sum, f) => sum + sizeOf(path.join(folder, f)), 0);
    const params = { shown: path.basename(backglass), list: strays.map(quote).join(', '), size: formatSize(size) };
    findings.push({
      code: 'backglassStray',
      severity: 'info',
      title: tn(strays.length, 'Backglass inutilisé', 'Backglass inutilisés'),
      detail: tn(strays.length, 'VPX affiche « {shown} » ; {list} ne sert à rien ({size}).', 'VPX affiche « {shown} » ; {list} ne servent à rien ({size}).', params),
      fix: { label: tn(strays.length, 'Mettre le fichier inutilisé à la corbeille', 'Mettre les fichiers inutilisés à la corbeille'), ops: strays.map((f) => ({ op: 'trash', path: path.join(folder, f) })) },
    });
  }

  // 4. ROM attendue par le script.
  if (ownFolder && ctx.script) {
    if ('error' in ctx.script) {
      findings.push({ code: 'scriptUnreadable', severity: 'warning', title: t('Script illisible'), detail: t('La ROM n’a pas pu être vérifiée : {error}', { error: ctx.script.error }) });
    } else if (ctx.script.usesPinmame && ctx.script.roms.length === 0) {
      findings.push({ code: 'romUnknown', severity: 'info', title: t('ROM non vérifiée'), detail: t('La table utilise PinMAME, mais le nom de sa ROM n’apparaît pas clairement dans son script.') });
    } else if (ctx.script.usesPinmame) {
      findings.push(...checkRom(folder, ctx.script.roms, ctx.romLibrary));
    }
    if (!('error' in ctx.script) && ctx.script.dmdFolder) {
      const finding = checkDmdFolder(folder, ctx.script.dmdFolder, ctx.script.usesPinmame);
      if (finding) findings.push(finding);
    }
  }

  // 5. Rapports de plantage laissés par VPX.
  const crashes = ['crash.txt', 'crash.dmp'].map(has).filter((f): f is string => Boolean(f));
  if (crashes.length) {
    const size = crashes.reduce((sum, f) => sum + sizeOf(path.join(folder, f)), 0);
    const txt = has('crash.txt');
    const when = fs.statSync(path.join(folder, crashes[0]!)).mtime;
    const reason = txt ? /^Reason:\s*(.+)$/m.exec(fs.readFileSync(path.join(folder, txt), 'utf8'))?.[1]?.trim() : undefined;
    const ops: FileOp[] = [];
    for (const f of crashes) {
      const p = path.join(folder, f);
      if (f.toLowerCase() === 'crash.txt' && ctx.logsDir) {
        const stamp = when.toISOString().slice(0, 19).replace('T', ' ').replace(/:/g, '-');
        ops.push({ op: 'move', from: p, to: path.join(ctx.logsDir, 'plantages', `${safeName(path.basename(folder))} ${stamp}.txt`) });
      } else ops.push({ op: 'delete', path: p });
    }
    findings.push({
      code: 'crashReport',
      severity: 'warning',
      title: t('Rapport de plantage de VPX'),
      detail: reason
        ? t('VPX a planté sur cette table le {date} ({reason}). {files} : {size}.', { date: formatDateTime(when), reason, files: formatList(crashes), size: formatSize(size) })
        : t('VPX a planté sur cette table le {date}. {files} : {size}.', { date: formatDateTime(when), files: formatList(crashes), size: formatSize(size) }),
      fix: {
        label:
          tn(crashes.length, 'Supprimer le rapport (libère {size})', 'Supprimer les rapports (libère {size})', { size: formatSize(size) }) +
          (txt && ctx.logsDir ? t(', crash.txt est gardé dans les journaux') : ''),
        ops,
      },
    });
  }

  // 6. Fichier .info partagé entre frontends.
  if (!fs.existsSync(entry.infoFile) && !(ownFolder && has(`${path.basename(folder)}.info`))) {
    const infoFile = ownFolder ? path.join(folder, `${path.basename(folder)}.info`) : entry.infoFile;
    const info = { Info: { Title: entry.title, Manufacturer: entry.manufacturer, Year: entry.year } };
    findings.push({
      code: 'infoMissing',
      severity: 'info',
      title: t('Pas de fichier d’informations'),
      detail: t('Le titre, le fabricant et l’année sont devinés d’après le nom des fichiers. Le fichier .info les fixe et les partage avec les autres frontends.'),
      fix: { label: t('Créer « {name} »', { name: path.basename(infoFile) }), ops: [{ op: 'write', path: infoFile, content: JSON.stringify(info, null, 2) + '\n' }] },
    });
  }

  // 7. Sens de la partie changé par le .ini de la table, sinon cadrage manuel qu'il impose (souvent livré avec elle).
  const orientation = ctx.orientation && tableOrientationFinding(entry.file, ctx.orientation);
  const manual = orientation || manualViewFinding(entry.file);
  if (manual) findings.push(manual);

  // 7 bis. Écrans placés pour cette table seulement (menu de VPX, « Save as Table Override »).
  const windows = tableWindowsFinding(entry.file);
  if (windows) findings.push(windows);

  // 8. PuP-Pack (mode plugins de VPX 10.8.1).
  if (ownFolder) findings.push(...checkPup(entry, ctx, override));

  // 9. Médias de présentation (medias\ de la table).
  if (ownFolder) findings.push(...checkMedias(entry, ctx));

  // Seule la ROM bloque « Jouer » (playable.ts) : tout autre constat est au plus un avertissement.
  const order: Record<FindingSeverity, number> = { error: 0, warning: 1, info: 2 };
  return findings.map(playSeverity).sort((a, b) => order[a.severity] - order[b.severity]);
}

/**
 * `[Player] CabinetAutofitMode = 0` dans le .ini de la table : VPX ne cadre plus la
 * table et reprend la vue réglée à la main, souvent pour l'écran de l'auteur, d'où
 * un bas de table tronqué ou une table qui déborde. La réparation retire la clé (le
 * réglage général reprend la main), l'ancien fichier part à la corbeille.
 */
function manualViewFinding(tableFile: string): Finding | undefined {
  const ini = findTableIni(tableFile);
  if (!ini.exists) return undefined;
  const doc = IniDocument.parse(fs.readFileSync(ini.path, 'utf8'));
  const mode = doc.get('Player', 'CabinetAutofitMode')?.trim();
  if (mode !== '0' && !/^manual$/i.test(mode ?? '')) return undefined;
  doc.remove('Player', 'CabinetAutofitMode');
  const name = path.basename(ini.path);
  return {
    code: 'manualView',
    severity: 'warning',
    title: t('Cadrage manuel imposé par la table'),
    detail: t(
      '{name} règle [Player] CabinetAutofitMode = 0 : VPX ne cadre pas cette table et reprend une vue réglée à la main, peut-être pour un autre écran (table tronquée ou qui déborde). Ensuite, « Régler l’affichage en partie » dans la fiche la cadre sur la table lancée.',
      { name },
    ),
    fix: {
      label: t('Rendre le cadrage automatique à la table'),
      ops: doc.entries().length ? [{ op: 'write', path: ini.path, content: doc.toString() }] : [{ op: 'trash', path: ini.path }],
    },
  };
}

/** Clés du .ini d'une table qui décident du sens de la partie (vpxPlayedFlipperEdge). */
const ORIENTATION_KEYS = ['BGSet', 'CabinetAutofitMode'];

/**
 * Le .ini de la table change le sens de la partie sur cette borne : sans lui, VPX
 * dessinerait les flippers du côté du joueur ; avec lui (vue bureau, ou cadrage manuel
 * qui reprend la rotation réglée par l'auteur), plus. La réparation retire ces clés ;
 * l'ancien fichier part à la corbeille. Si VPinballX.ini est lui-même en cause, c'est
 * la synchronisation qui le dit.
 */
function tableOrientationFinding(tableFile: string, orientation: PlayfieldOrientation): Finding | undefined {
  const ini = findTableIni(tableFile);
  if (!ini.exists) return undefined;
  const doc = IniDocument.parse(fs.readFileSync(ini.path, 'utf8'));
  const global = IniDocument.parse(orientation.globalIni);
  const read = (section: string, key: string) => {
    const own = doc.get(section, key);
    return own !== undefined && own.trim() !== '' ? own : global.get(section, key);
  };
  if (orientationFinding(orientation.window, orientation.edge, (s, k) => global.get(s, k))) return undefined;
  const played = vpxPlayedFlipperEdge(read, orientation.window);
  if (played.edge === orientation.edge) return undefined;
  const keys = ORIENTATION_KEYS.filter((key) => (doc.get('Player', key)?.trim() ?? '') !== '');
  const set = keys.map((key) => t('[Player] {key} = {value}', { key, value: doc.get('Player', key)!.trim() })).join(t(' ; '));
  for (const key of keys) doc.remove('Player', key);
  const name = path.basename(ini.path);
  return {
    code: 'tableOrientation',
    severity: 'warning',
    title: t('Table de travers sur cette borne'),
    detail: played.edge
      ? t('{name} règle {keys} : VPX dessinera cette table flippers {played}, alors que vous êtes {edge} de l’écran. Sans ces clés, le cadrage automatique de la borne la remet dans votre sens.', {
          name,
          keys: set,
          played: EDGE_LABELS[played.edge],
          edge: EDGE_LABELS[orientation.edge],
        })
      : t('{name} règle {keys} : VPX reprend la vue de l’auteur de la table, avec sa rotation, souvent pour un autre écran : la table peut s’afficher de travers. Sans ces clés, le cadrage automatique de la borne la met dans votre sens.', {
          name,
          keys: set,
        }),
    fix: {
      label: t('Remettre la table dans le sens de la borne'),
      ops: doc.entries().length ? [{ op: 'write', path: ini.path, content: doc.toString() }] : [{ op: 'trash', path: ini.path }],
    },
  };
}

/** Fenêtres annexes de VPX que le .ini d'une table peut placer pour elle seule. */
const TABLE_WINDOWS = [
  { section: 'Backglass', prefix: 'Backglass', get label() { return t('Fronton'); } },
  { section: 'ScoreView', prefix: 'ScoreView', label: 'DMD' },
  { section: 'Topper', prefix: 'Topper', label: 'Topper' },
] as const;
const WINDOW_KEY = /^(Output|Display|FullScreen|WndX|WndY|Width|Height)$/i;

/**
 * Fronton, DMD ou topper placés pour cette table seulement : le menu de VPX (« Display
 * Settings », enregistré par « Save as Table Override ») écrit leur fenêtre dans le .ini
 * de la table, par-dessus la disposition de la borne. C'est voulu (le DMD posé dans le
 * cadre que dessine un PuP-Pack) ; le constat le montre et permet d'y revenir, par
 * exemple après un changement d'écran. La réparation retire ces clés et rien d'autre.
 */
function tableWindowsFinding(tableFile: string): Finding | undefined {
  const ini = findTableIni(tableFile);
  if (!ini.exists) return undefined;
  const doc = IniDocument.parse(fs.readFileSync(ini.path, 'utf8'));
  const placed: string[] = [];
  for (const w of TABLE_WINDOWS) {
    const keys = doc
      .entries()
      .filter((e) => e.section.toLowerCase() === w.section.toLowerCase() && e.key.toLowerCase().startsWith(w.prefix.toLowerCase()) && WINDOW_KEY.test(e.key.slice(w.prefix.length)) && e.value.trim() !== '');
    if (!keys.length) continue;
    const value = (suffix: string) => keys.find((e) => e.key.toLowerCase() === `${w.prefix}${suffix}`.toLowerCase())?.value.trim();
    const [x, y, width, height] = ['WndX', 'WndY', 'Width', 'Height'].map(value);
    const where = [width && height ? `${width} × ${height}` : undefined, x !== undefined && y !== undefined ? t('en {x}, {y}', { x, y }) : undefined].filter(Boolean).join(' ');
    const output = value('Output');
    const state =
      output === '0'
        ? t('éteint')
        : output === '2'
          ? where
            ? t('incrusté dans le plateau, {where}', { where })
            : t('incrusté dans le plateau')
          : where || keys.map((e) => e.key).join(', ');
    placed.push(t('{window} ({state})', { window: w.label, state }));
    for (const e of keys) doc.remove(e.section, e.key);
  }
  if (!placed.length) return undefined;
  const name = path.basename(ini.path);
  return {
    code: 'tableWindows',
    severity: 'info',
    title: t('Écrans placés pour cette table'),
    detail: t('{file} place {windows} pour cette table seulement, par-dessus la disposition de la borne (menu de VPX, « Display Settings », enregistré pour la table). Après un changement d’écran, revenez à la disposition générale.', { file: name, windows: placed.join(', ') }),
    fix: {
      label: t('Revenir à la disposition générale'),
      ops: doc.entries().length ? [{ op: 'write', path: ini.path, content: doc.toString() }] : [{ op: 'trash', path: ini.path }],
    },
  };
}

/**
 * Le plugin PUP ne dessine jamais le DMD de la table : il n'en lit les images que pour
 * reconnaître des scènes (PuPCapture, PUPManager::ProcessDmdFrame). Dans la fenêtre du DMD,
 * VPX garde le premier moteur qui dessine, par priorité (player.cpp, OnAuxRendererChanged) :
 * avec Priority.PUP = 100, un pack qui a un écran 5 ou 1 cache le score de la ROM, de FlexDMD
 * ou d'UltraDMD (2001 - A Space Odyssey, option « DMD on Fulldmd »). La priorité se lit dans
 * les réglages de la table : « [ScoreView] Priority.PUP = 0 » dans son .ini rend la fenêtre
 * au DMD pour elle seule ; le pack garde le fronton et le topper. Une valeur déjà écrite
 * pour la table (menu de VPX en partie) est respectée.
 */
function pupHidesDmdFinding(tableFile: string, pack: string): Finding | undefined {
  const ini = findTableIni(tableFile);
  const doc = IniDocument.parse(ini.exists ? fs.readFileSync(ini.path, 'utf8') : '');
  if (doc.get('ScoreView', 'Priority.PUP') !== undefined) return undefined;
  doc.set('ScoreView', 'Priority.PUP', '0');
  const params = { pack, file: path.basename(ini.path) };
  return {
    code: 'pupHidesDmd',
    severity: 'warning',
    title: t('Le PuP-Pack cacherait le DMD de la table'),
    detail: t('pupvideos\\{pack} occupe la fenêtre du DMD, où le plugin PUP ne dessine jamais le DMD de la table : son score n’apparaîtrait pas. Pour cette table, le DMD passera devant le pack ({file}) ; le pack garde le fronton et le topper.', params),
    fix: { label: t('Garder le DMD de la table devant le PuP-Pack'), ops: [{ op: 'write', path: ini.path, content: doc.toString() }] },
  };
}

/** Fichiers d'un pack renommés pour que le plugin PUP commence ses playlists comme PinUP Player (playlistRenames). */
function playlistOrderFinding(pack: string, root: string, renames: PlaylistRename[]): Finding {
  const first = renames[0]!;
  const params = {
    pack,
    playlist: first.playlist,
    wrong: first.wrong,
    right: path.basename(first.from),
    to: path.basename(first.to),
    n: renames.length,
  };
  return {
    code: 'pupPlaylistOrder',
    severity: 'warning',
    title: t('Playlist du PuP-Pack lue dans le mauvais ordre'),
    detail: [
      t('Le plugin PUP trie les fichiers en tenant compte des majuscules, PinUP Player non : dans pupvideos\\{pack}\\{playlist}, il commencerait par « {wrong} » au lieu de « {right} », que l’auteur a nommé pour passer en premier (souvent une image transparente). Un écran du pack montrerait ce fichier à la place.', params),
      renames.length > 1 ? tn(renames.length - 1, 'Une autre playlist est dans ce cas.', '{n} autres playlists sont dans ce cas.', { n: renames.length - 1 }) : '',
    ]
      .filter(Boolean)
      .join(' '),
    fix: {
      label: tn(renames.length, 'Renommer « {right} » en « {to} »', 'Renommer {n} fichiers pour rétablir l’ordre', params),
      ops: renames.map((r) => ({ op: 'move' as const, from: path.join(root, r.from), to: path.join(root, r.to) })),
    },
  };
}

/** Le .vbs de Cyber Pinball tiré du script d'une version précédente de la table. */
function staleFinding(override: Override): Finding {
  const file = path.basename(override.file);
  const content = override.state.kind === 'stale' ? override.state.content : undefined;
  return {
    code: 'scriptPatchStale',
    severity: 'warning',
    title: t('Script adapté pour une ancienne version de la table'),
    detail: t('Cyber Pinball a écrit {file} (PuP-Pack allumé) d’après le script d’une version précédente de la table : VPX joue cet ancien script avec la nouvelle table.', { file }),
    fix: content
      ? { label: t('Refaire {file} d’après le nouveau script', { file }), ops: [{ op: 'write', path: override.file, content, encoding: 'latin1' }] }
      : { label: t('Mettre {file} à la corbeille', { file }), ops: [{ op: 'trash', path: override.file }] },
  };
}

/**
 * Réparations des PuP-Packs que le menu fait seul avant chaque partie : elles ne touchent
 * qu'au pack (renommé, remonté, option recopiée, les anciens fichiers à la corbeille) et
 * au .vbs de Cyber Pinball, jamais à la table ; une option choisie dans la fiche est
 * gardée. Sans elles, un pack installé reste éteint tant qu'on n'ouvre pas le médecin
 * (2001 - A Space Odyssey, 25 octobre 2026 : partie jouée sans le .vbs qui allume le pack).
 */
export const PUP_PLAY_REPAIRS: readonly Finding['code'][] = ['pupNested', 'pupMissing', 'scriptPatchStale', 'pupDisabledByScript', 'pupOptionNotApplied', 'pupOptionUnsuited', 'pupHidesDmd', 'pupPlaylistOrder'];

/**
 * Constats réparables de PUP_PLAY_REPAIRS pour cette table. Sans script connu (cache
 * périmé), le script est lu dans le .vpx (readVpxScript), sans lancer VPX.
 */
export function pupPlayRepairs(entry: TableEntry, ctx: DoctorContext): Finding[] {
  if (path.resolve(entry.folder).toLowerCase() === path.resolve(ctx.tablesDir).toLowerCase()) return [];
  const base = path.basename(entry.file).replace(/.vpx$/i, '');
  let script = ctx.script;
  if (!script || 'error' in script) {
    const text = readVpxScript(entry.file);
    if (text !== undefined) script = scriptFacts(text);
  }
  const vbs = listSafe(entry.folder).find((f) => f.toLowerCase() === `${base.toLowerCase()}.vbs`);
  const override = vbs ? readOverride(entry, path.join(entry.folder, vbs)) : undefined;
  const found: Finding[] = [];
  if (override?.state.kind === 'stale') found.push(staleFinding(override));
  found.push(...checkPup(entry, { ...ctx, script, vpxLog: undefined }, override));
  return found.filter((f) => f.fix && PUP_PLAY_REPAIRS.includes(f.code));
}

/**
 * Applique les réparations de pupPlayRepairs une à une (l'une peut en appeler une autre :
 * pack remonté, puis son option), six au plus ; les fichiers remplacés vont à la corbeille.
 * Renvoie les constats réglés, pour le journal.
 */
export function repairPupForPlay(entry: TableEntry, ctx: DoctorContext, ops: OpContext): Finding[] {
  const done: Finding[] = [];
  for (let round = 0; round < 6; round++) {
    const next = pupPlayRepairs(entry, ctx).find((f) => !done.some((d) => d.code === f.code && d.fix!.label === f.fix!.label));
    if (!next) break;
    applyOps(next.fix!.ops, ops);
    done.push(next);
  }
  return done;
}

/** Le .vbs qui remplace le script de la table, et s'il vient de Cyber Pinball. */
interface Override {
  file: string;
  /** Contenu, lu en latin1 (un caractère par octet). */
  text: string;
  state: ScriptPatchState;
}

function readOverride(entry: TableEntry, file: string): Override | undefined {
  let text: string;
  try {
    text = fs.readFileSync(file, 'latin1');
  } catch {
    return undefined;
  }
  // Le script de la table n'est lu que pour un .vbs marqué par Cyber Pinball.
  const state: ScriptPatchState = readScriptPatch(text) ? scriptPatchState(text, readVpxScript(entry.file)) : { kind: 'foreign' };
  return { file, text, state };
}

/**
 * PuP-Pack coupé par le script : la correction allume l'interrupteur dans un .vbs à côté
 * de la table (scriptpatch.ts), sans toucher à la table ; dans le .vbs déjà là s'il vient
 * d'ailleurs. Sans le texte du script (table protégée), le constat dit quoi changer.
 */
function pupSwitchFinding(entry: TableEntry, pack: string, off: PupSwitch, override: Override | undefined): Finding {
  const base = path.basename(entry.file).replace(/\.vpx$/i, '');
  const target = override?.file ?? path.join(entry.folder, `${base}.vbs`);
  const file = path.basename(target);
  let content: string | undefined;
  if (override?.state.kind === 'ours') {
    // Un interrupteur de plus dans notre .vbs : refait d'après la table, tous allumés.
    const embedded = readVpxScript(entry.file);
    const sw = pupScriptSwitch(scriptCode(override.text));
    if (embedded !== undefined && sw) content = buildScriptPatch(embedded, [...override.state.patch.switches, sw]);
  } else if (override) {
    const sw = pupScriptSwitch(scriptCode(override.text));
    if (sw) content = enablePupSwitch(override.text, sw);
  } else {
    const embedded = readVpxScript(entry.file);
    // Relu dans le texte de la table : c'est lui qu'on recopie, ligne pour ligne.
    const sw = embedded !== undefined ? pupScriptSwitch(scriptCode(embedded)) : undefined;
    if (embedded !== undefined && sw) content = buildScriptPatch(embedded, [sw]);
  }
  const params = { variable: off.variable, value: off.value, enable: off.enable ?? '?', pack, file };
  const detail = [t('Le script met {variable} = {value} : il ne lance jamais le PuP-Pack, et la partie n’affiche que le fronton et le DMD habituels, même avec pupvideos\\{pack} bien rangé.', params)];
  if (content && !override) detail.push(t('La table n’est pas modifiée : VPX joue {file}, une copie de son script où seule cette valeur change.', params));
  else if (!content && off.enable) detail.push(t('Mettez {variable} = {enable} dans le script de la table (éditeur de VPX).', params));
  return {
    code: 'pupDisabledByScript',
    severity: 'warning',
    title: t('PuP-Pack coupé par le script de la table'),
    detail: detail.join(' '),
    fix: content ? { label: t('Allumer le PuP-Pack ({variable} = {enable}, dans {file})', params), ops: [{ op: 'write', path: target, content, encoding: 'latin1' }] } : undefined,
  };
}

/** Règles du § 4.4 de la recherche sur les PuP-Packs, sans lancer VPX. */
function checkPup(entry: TableEntry, context: DoctorContext, override?: Override): Finding[] {
  const ctx = { ...context, cabinet: withTableBackglass(entry, context.cabinet) };
  const folder = entry.folder;
  const facts = ctx.script && !('error' in ctx.script) ? ctx.script : undefined;
  const pupName = listSafe(folder).find((f) => f.toLowerCase() === 'pupvideos');
  const pupDir = pupName ? path.join(folder, pupName) : undefined;
  const packs = pupDir ? listDirs(pupDir) : [];
  if (!facts?.pup && !packs.length) return [];
  const findings: Finding[] = [];
  const expected = expectedPackNames(facts);
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const matching = packs.filter((p) => expected.some((e) => same(e, p)));
  // Un pack attendu par une autre version du dossier n'est ni orphelin ni à renommer.
  const others = packs.filter((p) => !matching.includes(p) && !(ctx.otherPackNames ?? []).some((n) => same(n, p)));
  const othersKnown = ctx.otherPackNames !== undefined || listSafe(folder).filter((f) => f.toLowerCase().endsWith('.vpx')).length <= 1;
  const pupvideos = pupDir ?? path.join(folder, 'pupvideos');

  // Dossier en double : pupvideos\X\X\screens.pup, ou dossier d'archive en trop.
  const nested = new Set<string>();
  for (const pack of packs) {
    const dir = path.join(pupvideos, pack);
    const root = findPackRoot(dir);
    if (!root || samePathCI(root, dir)) continue;
    nested.add(pack);
    const tmp = `${dir}.cyberpinball-${process.pid}`;
    findings.push({
      code: 'pupNested',
      severity: 'warning',
      title: t('PuP-Pack rangé un dossier trop bas'),
      detail: t('Le plugin PUP lit screens.pup à la racine de pupvideos\\{pack} ; le pack est dans « {where} ».', { pack, where: path.relative(pupvideos, root) }),
      fix: {
        label: t('Remonter le pack dans pupvideos\\{pack}', { pack }),
        ops: [
          { op: 'move', from: root, to: tmp },
          { op: 'trash', path: dir },
          { op: 'move', from: tmp, to: dir },
        ],
      },
    });
  }

  // Pack introuvable : rien ne porte le nom que le plugin cherche.
  if (facts && expected.length && !matching.length) {
    const wanted = expected[0]!;
    const candidate = othersKnown && others.length === 1 ? others[0] : undefined;
    findings.push({
      code: 'pupMissing',
      severity: 'warning',
      title: t('PuP-Pack « {name} » introuvable', { name: wanted }),
      detail: [
        t('Le plugin PUP cherche {paths} à côté de la table.', { paths: formatList(expected.map((e) => `pupvideos\\${e}`), 'or') }),
        candidate
          ? t('« {name} » ne sera pas chargé sous ce nom.', { name: candidate })
          : packs.length
            ? t('Présents : {list}.', { list: packs.join(', ') })
            : t('Ajoutez le pack avec « Ajouter une table » : il sera rangé et nommé comme il faut.'),
        t('La table se joue sans ses vidéos.'),
      ].join(' '),
      fix: candidate ? { label: t('Renommer « {from} » en « {to} »', { from: candidate, to: wanted }), ops: [{ op: 'move', from: path.join(pupvideos, candidate), to: path.join(pupvideos, wanted) }] } : undefined,
    });
  } else if (matching.length && othersKnown && others.length) {
    const size = others.reduce((sum, p) => sum + sizeOf(path.join(pupvideos, p)), 0);
    findings.push({
      code: 'pupOrphan',
      severity: 'info',
      title: tn(others.length, 'PuP-Pack inutilisé', 'PuP-Packs inutilisés'),
      detail: tn(
        others.length,
        'Le plugin charge pupvideos\\{pack} ; {list} ne sert à aucune table du dossier ({size}).',
        'Le plugin charge pupvideos\\{pack} ; {list} ne servent à aucune table du dossier ({size}).',
        { pack: matching[0]!, list: others.map(quote).join(', '), size: formatSize(size) },
      ),
      fix: {
        label: tn(others.length, 'Mettre le dossier inutilisé à la corbeille', 'Mettre les dossiers inutilisés à la corbeille'),
        ops: others.map((p) => ({ op: 'trash' as const, path: path.join(pupvideos, p) })),
      },
    });
  }

  // Script qui ne lance jamais le pack (« usePUP = False ») : bien rangé, il ne s'affichera pas.
  // C'est le script que VPX joue qui compte : le .vbs posé à côté s'il y en a un.
  const off = override ? pupScriptSwitch(scriptCode(override.text)) : facts?.pup?.disabledBy;
  if (off && matching.length) findings.push(pupSwitchFinding(entry, matching[0]!, off, override));

  for (const pack of matching) {
    const dir = path.join(pupvideos, pack);
    const info = analysePack(findPackRoot(dir) ?? dir);
    const memory = pupMemory(entry.info, pack);

    // Playlist que le plugin commence par un autre fichier que PinUP Player (tri sensible à la casse).
    if (!nested.has(pack)) {
      const renames = playlistRenames(info.root);
      if (renames.length) findings.push(playlistOrderFinding(pack, info.root, renames));
    }

    // Pack dans la fenêtre du DMD d'une table qui dessine son propre DMD : le score disparaîtrait.
    if (!nested.has(pack) && !off && facts?.drawsDmd && !facts.pup?.labels && ctx.cabinet?.dmd && info.screens.length && pupWindows(info.screens).dmd) {
      const finding = pupHidesDmdFinding(entry.file, pack);
      if (finding) findings.push(finding);
    }

    // Option non appliquée : des variantes, et une racine sans .pup ou avec des .pup d'aucune variante.
    // Un pack imbriqué est d'abord remonté : la correction viserait sinon l'ancien emplacement.
    if (!nested.has(pack) && info.variants.length && (!info.pupFiles.length || !appliedVariant(info))) {
      const choice = chooseVariant(info.variants, ctx.cabinet, memory?.option);
      const v = choice.chosen!;
      const failed = info.bats.filter((b) => !b.ok);
      const why =
        choice.reason === 'remembered'
          ? t('option choisie à l’installation')
          : choice.reason === 'cabinet' && ctx.cabinet
            ? t('d’après la borne : {cabinet}', { cabinet: describePupCabinet(ctx.cabinet) })
            : choice.reason === 'only'
              ? t('seule option du pack')
              : t('à vérifier : la borne n’est pas configurée');
      findings.push({
        code: 'pupOptionNotApplied',
        severity: info.pupFiles.length ? 'info' : 'warning',
        title: info.pupFiles.length ? t('Option du PuP-Pack modifiée ou inconnue') : t('Option du PuP-Pack non appliquée'),
        detail: [
          info.pupFiles.length
            ? t('Les fichiers .pup de pupvideos\\{pack} ne sont ceux d’aucune option (modifiés à la main, ou mélange après une mise à jour).', { pack })
            : t('pupvideos\\{pack} n’a pas de screens.pup : il faut y recopier une des {n} options du pack.', { pack, n: info.variants.length }),
          t('Options : {list}.', { list: info.variants.map((x) => x.label).join(', ') }),
          failed.length
            ? tn(failed.length, '{list} : lu sans succès, jamais exécuté.', '{list} : lus sans succès, jamais exécutés.', {
                list: failed.map((b) => t('« {name} » ({reason})', { name: b.bat, reason: b.reason ?? '' })).join(', '),
              })
            : '',
        ]
          .filter(Boolean)
          .join(' '),
        fix: {
          label: t('Appliquer « {option} » ({why})', { option: v.label, why }),
          ops: [
            // L'option est retenue pour la prochaine mise à jour du pack.
            ...pupOptionOps(entry, info.root, pack, v, memory ?? {}),
          ],
        },
      });
    }

    // Option appliquée moins adaptée à la borne qu'une autre (borne changée depuis
    // l'installation, ou choix d'office d'une autre époque) : sauf si elle a été choisie
    // dans la fiche, la meilleure est proposée, nettement meilleure seulement.
    const applied = appliedVariant(info);
    if (ctx.cabinet && applied && memory?.chosen !== 'user' && info.variants.length > 1) {
      const best = chooseVariant(info.variants, ctx.cabinet);
      if (best.confident && best.chosen && best.chosen !== applied && scoreVariant(best.chosen.traits, ctx.cabinet) - scoreVariant(applied.traits, ctx.cabinet) >= 4) {
        findings.push({
          code: 'pupOptionUnsuited',
          severity: 'warning',
          title: t('Option du PuP-Pack inadaptée à la borne'),
          detail: t('pupvideos\\{pack} applique « {applied} » ({appliedTraits}) ; pour cette borne ({cabinet}), « {best} » ({bestTraits}) convient mieux. Fiche > « PuP-Pack » pour voir et choisir les options.', {
            pack,
            applied: applied.label,
            appliedTraits: variantTraitsLabel(applied),
            cabinet: describePupCabinet(ctx.cabinet),
            best: best.chosen.label,
            bestTraits: variantTraitsLabel(best.chosen),
          }),
          fix: { label: t('Appliquer « {option} »', { option: best.chosen.label }), ops: pupOptionOps(entry, info.root, pack, best.chosen, { ...(memory ?? {}), chosen: undefined }) },
        });
      }
    }

    // Écrans demandés que la borne n'a pas, et écran Playfield que le plugin ne rend pas.
    if (ctx.cabinet) {
      const has = { topper: ctx.cabinet.topper, backglass: ctx.cabinet.backglass, dmd: ctx.cabinet.dmd };
      const labels = { topper: t('le topper'), backglass: t('le backglass'), dmd: t('le DMD') };
      const lost = new Set<'topper' | 'backglass' | 'dmd'>();
      for (const s of info.screens.filter(isVisible)) {
        // Un écran placé dans un autre (CustomPos) s'affiche là où est son parent.
        const role = screenRole(s.parent !== undefined && s.parent !== s.num ? s.parent : s.num);
        if (role && role !== 'playfield' && !has[role]) lost.add(role);
      }
      if (lost.size) {
        findings.push({
          code: 'pupScreenAbsent',
          severity: 'info',
          title: t('Écrans du PuP-Pack absents de la borne'),
          detail: t(
            'Le pack montre des vidéos sur {screens}, que la borne n’a pas : elles ne seront pas vues. Une autre option du pack les place peut-être ailleurs.',
            { screens: formatList([...lost].map((r) => labels[r])) },
          ),
        });
      }
    }
    if (info.screens.some((s) => s.num === 3 && isVisible(s) && (s.parent === undefined || s.parent === 3))) {
      findings.push({
        code: 'pupPlayfieldScreen',
        severity: 'info',
        title: t('Vidéos sur le plateau non affichées'),
        detail: t('Le pack utilise l’écran Playfield (3), que le plugin PUP de VPX 10.8.1 n’affiche pas : ces vidéos par-dessus le plateau ne seront pas vues.'),
      });
    }

    // Pack ancien : le script déclare tout, le pack n'a que des dossiers de vidéos.
    if (facts?.pup?.playlistAdd && !info.pupFiles.length && !info.variants.length) {
      findings.push({
        code: 'pupScriptDriven',
        severity: 'info',
        title: t('PuP-Pack piloté par le script'),
        detail: t(
          'pupvideos\\{pack} n’a aucun fichier .pup : c’est le script de la table qui déclare ses playlists (playlistadd). Le plugin PUP le gère en grande partie ; si des vidéos manquent, le journal de VPX dira quelles fonctions ne sont pas prises en charge.',
          { pack },
        ),
      });
    }

    // PuPCapture : les images reconnues dépendent de la ROM exacte.
    const rom = facts?.usesPinmame ? facts.roms[0] : undefined;
    if (info.hasPupCapture && rom) {
      const origin = memory?.origin;
      const language = romLanguage(rom);
      if (origin && !same(origin, rom) && !same(origin, pack)) {
        findings.push({
          code: 'pupCaptureRom',
          severity: 'warning',
          title: t('PuP-Pack prévu pour une autre ROM'),
          detail: t('Le pack reconnaît les images du DMD (PuPCapture) de la ROM « {origin} », la table joue « {rom} » : certaines vidéos ne se déclencheront pas.', { origin, rom }),
        });
      } else if (language) {
        findings.push({
          code: 'pupCaptureRom',
          severity: 'info',
          title: t('ROM d’une autre langue'),
          detail: t(
            'La table joue « {rom} », semble-t-il une ROM {language}. Le pack reconnaît les images du DMD (PuPCapture) : s’il a été fait pour la ROM anglaise, certaines vidéos ne se déclencheront pas.',
            { rom, language },
          ),
        });
      }
    }
  }

  if (ctx.vpxLog) findings.push(...checkPupLog(entry, ctx.vpxLog, expected, findings));
  return findings;
}

/** Langue d'une ROM d'après son suffixe (« acd_170hf ») ; supposé, à confirmer sur la borne. */
export function romLanguage(rom: string): string | undefined {
  const m = /_\d{2,3}[a-z]([fgis])$/i.exec(rom);
  if (!m) return undefined;
  switch (m[1]!.toLowerCase()) {
    case 'f':
      return t('française');
    case 'g':
      return t('allemande');
    case 'i':
      return t('italienne');
    default:
      return t('espagnole');
  }
}

/** Ce que vpinball.log dit du pack à la dernière partie de cette table. */
function checkPupLog(entry: TableEntry, log: string, expected: string[], found: Finding[]): Finding[] {
  const lines = log.split(/\r?\n/);
  const loads = lines.map((l, i) => ({ i, file: /LoadGameFromFilename (.+)$/.exec(l)?.[1]?.trim() })).filter((x) => x.file);
  const start = loads.filter((x) => samePathCI(x.file!, entry.file)).at(-1);
  if (!start) return [];
  const end = loads.find((x) => x.i > start.i)?.i ?? lines.length;
  const session = lines.slice(start.i, end);
  // Une vraie partie : VPX 10.8.1 écrit « Starting script » puis « Startup done » (Player::Player) ;
  // « Starting Play mode » vient du lancement depuis l'éditeur.
  if (!session.some((l) => /Plugin PUP loaded/.test(l)) || !session.some((l) => /Starting Play mode|Starting script|Startup done/.test(l))) return [];
  const findings: Finding[] = [];
  const pathIndex = session.findLastIndex((l) => /PUP path: /.test(l));
  const pupPath = pathIndex >= 0 ? /PUP path: (.+)$/.exec(session[pathIndex]!)![1]!.trim() : undefined;
  if (pupPath && session.slice(pathIndex).some((l) => /No screens\.pup file found/.test(l))) {
    if (!found.some((f) => f.code === 'pupOptionNotApplied')) {
      findings.push({
        code: 'pupLog',
        severity: 'warning',
        title: t('Journal de VPX : pack sans screens.pup'),
        detail: t('À la dernière partie, VPX a chargé « {path} » mais n’y a pas trouvé de screens.pup : les écrans du pack sont restés éteints.', { path: pupPath }),
      });
    }
  } else if (!pupPath && expected.length && !found.some((f) => f.code === 'pupMissing' || f.code === 'pupDisabledByScript')) {
    findings.push({
      code: 'pupLog',
      severity: 'warning',
      title: t('Journal de VPX : pack non chargé'),
      detail: t('À la dernière partie, le plugin PUP n’a chargé aucun pack (il cherchait pupvideos\\{pack}). Si le pack a été ajouté ou réparé depuis, relancez une partie.', { pack: expected[0]! }),
    });
  }
  const missing = [
    ...new Set(
      session
        .map((l) => /Not implemented:?\s*(.*)$/.exec(l)?.[1]?.split(/[:(,=]/)[0]?.trim())
        .filter((x): x is string => Boolean(x)),
    ),
  ];
  if (missing.length) {
    findings.push({
      code: 'pupLog',
      severity: 'info',
      title: t('Journal de VPX : fonctions PuP non prises en charge'),
      detail: t('La table a demandé au plugin PUP des fonctions qu’il ne gère pas encore ({list}) : une partie du pack peut manquer.', {
        list: missing.slice(0, 4).join(', ') + (missing.length > 4 ? '…' : ''),
      }),
    });
  }
  return findings;
}

// ---------- Médias de présentation (docs/recherche/medias.md, § 5.5, tâche T11) ----------

/**
 * Écart de proportions toléré entre un média et l'écran de son rôle, mesuré en
 * rapport (16:10 sur 16:9 passe, 4:3 sur 16:9 non) : au-delà, le menu recadre
 * le plateau ou laisse des bandes noires sur les autres écrans.
 */
export const MEDIA_RATIO_TOLERANCE = 0.15;

/**
 * Seuils du constat « média très lourd », par nature de fichier. Une vidéo
 * 1080p d'une minute pèse 20 à 60 Mo, une 4K jusqu'à 150 Mo ; une image 4K en
 * PNG 10 à 20 Mo ; une musique de 5 minutes 5 à 12 Mo en mp3, 50 Mo en wav.
 */
export const MEDIA_SIZE_LIMITS: Record<MediaKind, number> = {
  image: 25 * 1024 ** 2,
  video: 300 * 1024 ** 2,
  audio: 50 * 1024 ** 2,
};

/** Une image de plus de pixels que l'écran 8K (7680 × 4320) occupe plus de 130 Mo une fois décodée. */
export const MEDIA_MAX_PIXELS = 7680 * 4320;

/** Un fichier de medias\ et ce que son nom dit de lui. */
interface MediaItem {
  file: string;
  name: string;
  ext: string;
  /** Absent : ni « (Type) », ni nom de VPinFE. */
  type?: MediaType;
  /** Nom après « (Type) » ; absent pour un nom de VPinFE. */
  stem?: string;
  vpinfe?: boolean;
  /** Format lu par le menu pour ce type. */
  accepted: boolean;
}

function mediaItems(dir: string): MediaItem[] {
  return readDirents(dir)
    .filter((d) => d.isFile())
    .map((d) => {
      const file = path.join(dir, d.name);
      const ext = path.extname(d.name).slice(1).toLowerCase();
      const parsed = parseMediaFileName(d.name);
      if (parsed) return { file, name: d.name, ext, type: parsed.type, stem: parsed.stem, accepted: isAcceptedFormat(parsed.type, d.name) };
      const vpinfe = mediaTypeFromVpinfe(d.name);
      if (vpinfe) return { file, name: d.name, ext, type: vpinfe, vpinfe: true, accepted: true };
      return { file, name: d.name, ext, accepted: false };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true, sensitivity: 'base' }));
}

/**
 * Fichiers que le menu montre pour un type et une liste de noms (le .vpx, puis le
 * dossier), comme resolveMedia aux étapes 1 à 3 : la première page dans le format
 * préféré, ou toutes les pages ; sinon le nom de VPinFE.
 */
function shownMedia(items: MediaItem[], type: MediaType, names: string[]): MediaItem[] {
  const info = mediaTypeInfo(type);
  for (const name of names) {
    const candidates = items
      .filter((i) => i.type === type && i.stem !== undefined && i.accepted)
      .map((i) => ({ i, page: pageOf(i.stem!, name) }))
      .filter((c) => c.page !== undefined);
    if (!candidates.length) continue;
    if (info.pages) return candidates.sort((a, b) => a.page! - b.page!).map((c) => c.i);
    const first = candidates.filter((c) => c.page === 1).map((c) => c.i);
    if (!first.length) continue;
    return [first.sort((a, b) => info.formats.indexOf(a.ext) - info.formats.indexOf(b.ext))[0]!];
  }
  for (const alias of info.aliases.vpinfe) {
    const found = items.find((i) => i.vpinfe && i.name.toLowerCase() === alias);
    if (found) return [found];
  }
  return [];
}

/** « « a », « b » et 3 autres ». */
function quoteList(names: string[], max = 4): string {
  const shown = names.slice(0, max).map(quote);
  const rest = names.length - shown.length;
  return formatList(rest > 0 ? [...shown, tn(rest, '{n} autre', '{n} autres')] : shown);
}

/** « nom » (guillemets de la langue). */
function quote(name: string): string {
  return t('« {name} »', { name });
}

const ROLE_LABELS: Record<RoleId, string> = {
  get playfield() {
    return t('le plateau');
  },
  get backglass() {
    return t('le fronton');
  },
  get dmd() {
    return t('le DMD');
  },
  get topper() {
    return t('le topper');
  },
};

const MEDIA_ERROR_LABELS: Record<MediaErrorKind, string> = {
  get decode() {
    return t('décodage impossible (fichier abîmé, ou codec non pris en charge)');
  },
  get unsupported() {
    return t('format ou codec refusé');
  },
  get image() {
    return t('image illisible');
  },
  get network() {
    return t('fichier illisible sur le disque (verrouillé, ou disque en erreur)');
  },
  get other() {
    return t('erreur de lecture');
  },
};

/** Erreurs dues au fichier lui-même : il ne sera pas mieux lu la fois suivante. */
const FILE_ERRORS: readonly MediaErrorKind[] = ['decode', 'unsupported', 'image'];

/** Dossiers d'un PuP-Pack, d'une ROM ou d'un DMD dessiné par le script : jamais des médias du menu. */
function notMediaFolder(name: string, dmdFolder: string | undefined): boolean {
  const n = name.toLowerCase();
  return ['medias', 'pupvideos', 'pinmame', 'cache'].includes(n) || n === dmdFolder?.toLowerCase() || /\.ultradmd$|flexdmd/i.test(n);
}

/** Fichiers d'un dossier, sous-dossiers compris. */
function filesUnder(dir: string): string[] {
  return readDirents(dir).flatMap((d) => (d.isDirectory() ? filesUnder(path.join(dir, d.name)) : [path.join(dir, d.name)]));
}

/** Média trouvé hors de medias\ : rangé à la Popper ou à la PinballX, ou « (Type) nom » au mauvais endroit. */
interface StrayMedia {
  from: string;
  type: MediaType;
  ext: string;
  page: number;
}

function findStrayMedias(folder: string, likeTable: (stem: string) => number | undefined, dmdFolder: string | undefined): StrayMedia[] {
  const out: StrayMedia[] = [];
  const walk = (dir: string, chain: string[]) => {
    const here = chain.at(-1);
    const folderType = here ? (mediaTypeFromFolder('popper', here) ?? mediaTypeFromFolder('pinballx', here)) : undefined;
    // POPMedia\Visual Pinball X\Wheel, PinUPSystem\POPMedia\…, Media\Visual Pinball\Wheel Images.
    const frontendTree = chain.slice(0, -1).some((c) => /^(popmedia|pinupsystem|media)$/i.test(c) || /^visual ?pinball/i.test(c));
    for (const d of readDirents(dir)) {
      const p = path.join(dir, d.name);
      if (d.isDirectory()) {
        if (chain.length < 4 && !notMediaFolder(d.name, dmdFolder)) walk(p, [...chain, d.name]);
        continue;
      }
      if (!d.isFile() || !mediaKind(d.name)) continue;
      const ext = path.extname(d.name).slice(1).toLowerCase();
      const parsed = parseMediaFileName(d.name);
      if (parsed) {
        out.push({ from: p, type: parsed.type, ext, page: likeTable(parsed.stem) ?? 1 });
        continue;
      }
      const stem = d.name.slice(0, d.name.length - ext.length - 1);
      const page = likeTable(stem);
      if (folderType && (frontendTree || page !== undefined)) out.push({ from: p, type: folderType, ext, page: page ?? 1 });
    }
  };
  walk(folder, []);
  return out;
}

/** Règles du médecin sur les médias de la table : constats clairs, et corrections sûres (renommer, ranger, corbeille). */
function checkMedias(entry: TableEntry, ctx: DoctorContext): Finding[] {
  const findings: Finding[] = [];
  const folder = entry.folder;
  const folderName = path.basename(folder);
  const dir = tableMediaDir(entry);
  const items = mediaItems(dir);
  const own = mediaNames(entry);
  const vpxBases = readDirents(folder)
    .filter((d) => d.isFile() && /\.vpx$/i.test(d.name))
    .map((d) => d.name.slice(0, -4));
  // Chaque version du dossier cherche son .vpx, puis le dossier.
  const versionNames = (vpxBases.length ? vpxBases : [own[0]!]).map((b) => (b.toLowerCase() === folderName.toLowerCase() ? [b] : [b, folderName]));
  const allNames = [...new Set(versionNames.flat())];
  const facts = ctx.script && !('error' in ctx.script) ? ctx.script : undefined;
  const dims = new Map<string, MediaDimensions | undefined>();
  const dimsOf = (file: string) => {
    if (!dims.has(file)) dims.set(file, readMediaDimensions(file));
    return dims.get(file);
  };
  const taken = new Set(items.map((i) => i.name.toLowerCase()));
  const label = (type: MediaType) => mediaTypeInfo(type).label;
  const move = (from: string, to: string): FileOp => ({ op: 'move', from, to });
  // Fichiers déjà renommés ou mis à la corbeille par une correction plus haut :
  // « Tout réparer » applique les corrections l'une après l'autre.
  const claimed = new Set<string>();
  const claim = (file: string) => claimed.add(file.toLowerCase());
  const free = (file: string) => !claimed.has(file.toLowerCase());

  // Format illisible par le menu, ou non prévu pour ce type.
  const unreadable = items.filter((i) => i.type && !i.accepted);
  if (unreadable.length) {
    const redundant = unreadable.filter((i) =>
      items.some((o) => o !== i && o.type === i.type && o.accepted && (o.stem ?? '').toLowerCase() === (i.stem ?? '').toLowerCase()),
    );
    redundant.forEach((i) => claim(i.file));
    const old = unreadable.filter((i) => UNREADABLE_FORMATS.includes(i.ext));
    const wrong = unreadable.filter((i) => !old.includes(i));
    findings.push({
      code: 'mediaUnreadable',
      severity: 'warning',
      title: tn(unreadable.length, 'Média dans un format que le menu ne lit pas', 'Médias dans un format que le menu ne lit pas'),
      detail: [
        old.length
          ? tn(
              new Set(old.map((i) => i.ext)).size,
              '{files} : {exts}, ancien format de PinUP Popper que le menu (Chromium) ne lit pas. Convertissez en mp4 (H.264) ou en webm, par exemple avec HandBrake.',
              '{files} : {exts}, anciens formats de PinUP Popper que le menu (Chromium) ne lit pas. Convertissez en mp4 (H.264) ou en webm, par exemple avec HandBrake.',
              { files: quoteList(old.map((i) => i.name)), exts: [...new Set(old.map((i) => i.ext))].join(', ') },
            )
          : '',
        ...wrong.map((i) => t('« {name} » : un média « {type} » se lit en {formats}.', { name: i.name, type: label(i.type!), formats: mediaTypeInfo(i.type!).formats.join(', ') })),
        redundant.length ? t('{files} : une version lisible porte le même nom, c’est elle qui est montrée.', { files: quoteList(redundant.map((i) => i.name)) }) : '',
        redundant.length < unreadable.length ? t('En attendant, le menu passe au média suivant ou à son repli.') : '',
      ]
        .filter(Boolean)
        .join(' '),
      fix: redundant.length
        ? {
            label:
              redundant.length > 1
                ? t('Mettre les {n} fichiers en double à la corbeille (une version lisible existe)', { n: redundant.length })
                : t('Mettre « {name} » à la corbeille (une version lisible existe)', { name: redundant[0]!.name }),
            ops: redundant.map((i) => ({ op: 'trash' as const, path: i.file })),
          }
        : undefined,
    });
  }

  // DMD 4:1 rangé en FullDMD 16:9, ou l'inverse : le menu le montrerait sur le mauvais écran.
  // Un média mal nommé est d'abord renommé ; son type est vérifié à l'analyse suivante.
  const named = (i: MediaItem) => i.stem !== undefined && allNames.some((n) => pageOf(i.stem!, n) !== undefined);
  const swapped: { item: MediaItem; actual: MediaType; ratio: number; to?: string }[] = [];
  for (const item of items.filter((i) => (i.type === 'DMD' || i.type === 'FullDMD') && named(i) && i.accepted)) {
    const d = dimsOf(item.file);
    if (!d) continue;
    const actual = dmdTypeForRatio(Math.max(d.width, d.height) / Math.min(d.width, d.height));
    if (actual === item.type) continue;
    const target = `(${actual}) ${item.stem}.${item.ext}`;
    const conflict = items.some((o) => o.type === actual && (o.stem ?? '').toLowerCase() === item.stem!.toLowerCase()) || taken.has(target.toLowerCase());
    if (!conflict) {
      taken.add(target.toLowerCase());
      claim(item.file);
    }
    swapped.push({ item, actual, ratio: d.width / d.height, to: conflict ? undefined : path.join(dir, target) });
  }
  if (swapped.length) {
    const fixable = swapped.filter((s) => s.to);
    findings.push({
      code: 'mediaDmdSwapped',
      severity: 'warning',
      title: tn(swapped.length, 'Afficheur rangé sous le mauvais type', 'Afficheurs rangés sous le mauvais type'),
      detail: [
        ...swapped.flatMap((s) => [
          t('« {name} » est en {ratio} : c’est un média « {actual} » ({type}), pas « {wrong} ».', {
            name: s.item.name,
            ratio: ratioLabel(s.ratio),
            actual: label(s.actual),
            type: s.actual,
            wrong: label(s.item.type!),
          }),
          ...(s.to ? [] : [t('Un fichier ({type}) de ce nom existe déjà : gardez l’un des deux.', { type: s.actual })]),
        ]),
        t('Le menu montre le média DMD sur un écran DMD seul, et le média FullDMD sur un écran FullDMD (Configuration de la borne > Écran du DMD).'),
      ].join(' '),
      fix: fixable.length
        ? {
            label:
              fixable.length > 1
                ? t('Renommer les {n} fichiers selon leurs proportions', { n: fixable.length })
                : t('Renommer en « {name} »', { name: path.basename(fixable[0]!.to!) }),
            ops: fixable.map((s) => move(s.item.file, s.to!)),
          }
        : undefined,
    });
  }
  const swappedFiles = new Set(swapped.map((s) => s.item.file));

  // Nom qui ne correspond ni à un .vpx du dossier ni au dossier.
  const misnamed = items.filter((i) => i.type && i.stem !== undefined && !named(i));
  const typeless = items.filter((i) => !i.type && mediaKind(i.name));
  if (misnamed.length || typeless.length) {
    const renames: { item: MediaItem; to: string }[] = [];
    const kept: { item: MediaItem; shown: MediaItem }[] = [];
    const blocked: MediaItem[] = [];
    for (const item of misnamed.filter((i) => free(i.file))) {
      const type = item.type!;
      const shown = shownMedia(items, type, own);
      if (!mediaTypeInfo(type).pages && shown.length) {
        kept.push({ item, shown: shown[0]! });
        continue;
      }
      let page = 1;
      let target = mediaFileName(entry, type, item.ext, page);
      if (mediaTypeInfo(type).pages) {
        const used = (n: number) => [...taken].some((t) => parseMediaFileName(t)?.type === type && pageOf(parseMediaFileName(t)!.stem, folderName) === n);
        while (used(page)) page++;
        target = mediaFileName(entry, type, item.ext, page);
      }
      if (taken.has(target.toLowerCase())) {
        blocked.push(item);
        continue;
      }
      taken.add(target.toLowerCase());
      claim(item.file);
      renames.push({ item, to: path.join(dir, target) });
    }
    findings.push({
      code: 'mediaMisnamed',
      severity: misnamed.length ? 'warning' : 'info',
      title: tn(misnamed.length + typeless.length, 'Média mal nommé', 'Médias mal nommés'),
      detail: [
        misnamed.length
          ? own[1]
            ? tn(
                misnamed.length,
                'Le menu cherche les médias sous le nom du .vpx (« {vpx} ») ou du dossier (« {folder} ») : {files} n’est pas montré.',
                'Le menu cherche les médias sous le nom du .vpx (« {vpx} ») ou du dossier (« {folder} ») : {files} ne sont pas montrés.',
                { vpx: own[0]!, folder: own[1], files: quoteList(misnamed.map((i) => i.name)) },
              )
            : tn(
                misnamed.length,
                'Le menu cherche les médias sous le nom du .vpx (« {vpx} ») : {files} n’est pas montré.',
                'Le menu cherche les médias sous le nom du .vpx (« {vpx} ») : {files} ne sont pas montrés.',
                { vpx: own[0]!, files: quoteList(misnamed.map((i) => i.name)) },
              )
          : '',
        ...kept.map((k) => t('« {name} » : « {shown} » porte déjà le bon nom et c’est lui qui est montré ; gardez l’un des deux.', { name: k.item.name, shown: k.shown.name })),
        blocked.length ? t('{files} : le nom attendu est déjà pris dans medias\\.', { files: quoteList(blocked.map((i) => i.name)) }) : '',
        typeless.length
          ? t('{files} : type inconnu. Le nom doit commencer par le type entre parenthèses, « (Backglass) {folder}.mp4 » par exemple.', {
              files: quoteList(typeless.map((i) => i.name)),
              folder: folderName,
            })
          : '',
      ]
        .filter(Boolean)
        .join(' '),
      fix: renames.length
        ? {
            label:
              renames.length > 1
                ? t('Renommer les {n} fichiers « (Type) {folder} »', { n: renames.length, folder: folderName })
                : t('Renommer en « {name} »', { name: path.basename(renames[0]!.to) }),
            ops: renames.map((r) => move(r.item.file, r.to)),
          }
        : undefined,
    });
  }

  // Médias rangés à la Popper ou à la PinballX dans le dossier de la table, hors de medias\.
  const keys = [entry.title, ...vpxBases, folderName].map((r) => nameKey(parseTableName(r).title)).filter(Boolean);
  const likeTable = (stem: string): number | undefined => {
    for (const name of allNames) {
      const page = pageOf(stem, name);
      if (page !== undefined) return page;
    }
    const k = nameKey(parseTableName(stem).title);
    return k && keys.some((r) => k === r || (k.length >= 4 && (k.includes(r) || r.includes(k)))) ? 1 : undefined;
  };
  const strays = findStrayMedias(folder, likeTable, facts?.dmdFolder).sort(
    (a, b) => a.type.localeCompare(b.type) || a.page - b.page || mediaTypeInfo(a.type).formats.indexOf(a.ext) - mediaTypeInfo(b.type).formats.indexOf(b.ext),
  );
  if (strays.length) {
    const ops: FileOp[] = [];
    const moved: string[] = [];
    // Laissés en place : medias\ montre déjà ce type (shown), ou le nom attendu est pris.
    const left: { s: StrayMedia; shown?: string }[] = [];
    for (const s of strays) {
      const info = mediaTypeInfo(s.type);
      const shown = info.pages ? undefined : shownMedia(items, s.type, own)[0];
      if (shown) {
        left.push({ s, shown: shown.name });
        continue;
      }
      let page = info.pages ? s.page : 1;
      const pageTaken = (n: number) => [...taken].some((t) => parseMediaFileName(t)?.type === s.type && pageOf(parseMediaFileName(t)!.stem, folderName) === n);
      if (info.pages) while (pageTaken(page)) page++;
      const target = mediaFileName(entry, s.type, s.ext, page);
      if (taken.has(target.toLowerCase())) {
        left.push({ s });
        continue;
      }
      taken.add(target.toLowerCase());
      ops.push(move(s.from, path.join(dir, target)));
      moved.push(s.from);
    }
    // Arborescence vidée (POPMedia\…) : ses dossiers vides partent à la corbeille.
    const tops = [...new Set(moved.map((f) => path.relative(folder, f).split(path.sep)).filter((parts) => parts.length > 1).map((parts) => parts[0]!))];
    for (const top of tops) {
      const all = filesUnder(path.join(folder, top));
      if (all.every((f) => moved.some((m) => samePathCI(m, f)))) ops.push({ op: 'trash', path: path.join(folder, top) });
    }
    const rel = (s: StrayMedia) => path.relative(folder, s.from);
    findings.push({
      code: 'mediaStray',
      // Rien à ranger : la table a déjà ses médias, ce ne sont que des restes.
      severity: moved.length ? 'warning' : 'info',
      title: tn(strays.length, 'Média rangé hors de medias\\', 'Médias rangés hors de medias\\'),
      detail: [
        tn(
          strays.length,
          'Le menu ne cherche les médias que dans medias\\, sous le nom « (Type) {folder} » : {files} n’est pas montré (rangement de PinUP Popper ou de PinballX, ou fichier posé à côté de la table).',
          'Le menu ne cherche les médias que dans medias\\, sous le nom « (Type) {folder} » : {files} ne sont pas montrés (rangement de PinUP Popper ou de PinballX, ou fichier posé à côté de la table).',
          { folder: folderName, files: quoteList(strays.map(rel)) },
        ),
        ...left.map((l) =>
          l.shown
            ? t('« {file} » : medias\\ montre déjà « {shown} » ; gardez l’un des deux, rien n’est déplacé.', { file: rel(l.s), shown: l.shown })
            : t('« {file} » : le nom attendu est déjà pris dans medias\\, il n’est pas déplacé.', { file: rel(l.s) }),
        ),
      ]
        .filter(Boolean)
        .join(' '),
      fix: moved.length
        ? {
            label:
              moved.length > 1
                ? t('Ranger les {n} médias dans medias\\ sous le nom « (Type) {folder} »', { n: moved.length, folder: folderName })
                : t('Ranger le média dans medias\\ sous le nom « (Type) {folder} »', { folder: folderName }),
            ops,
          }
        : undefined,
    });
  }

  // Proportions qui ne collent pas à l'écran du rôle (zone comprise).
  const aspects = ctx.cabinet?.aspects;
  if (aspects) {
    const lines: string[] = [];
    const tolerance = Math.log(1 + MEDIA_RATIO_TOLERANCE);
    const check = (type: MediaType, role: RoleId, note = '') => {
      const screen = aspects[role];
      const item = shownMedia(items, type, own)[0];
      if (!screen || !item || swappedFiles.has(item.file)) return false;
      const d = dimsOf(item.file);
      if (!d) return true;
      const size = `${d.width}×${d.height}`;
      if (mediaTypeInfo(type).orientable) {
        // Le menu tourne le média du plateau d'après le bord des flippers : seul le rapport des côtés compte.
        const rm = Math.max(d.width, d.height) / Math.min(d.width, d.height);
        const rs = Math.max(screen, 1 / screen);
        if (Math.abs(Math.log(rm / rs)) <= tolerance) return true;
        const lost = Math.round((1 - Math.min(rm, rs) / Math.max(rm, rs)) * 100);
        const orientation =
          rm < 1.1
            ? t('Presque carré : le menu ne peut pas savoir où sont les flippers, il le montre tel quel.')
            : d.width > d.height
              ? t('En paysage, les flippers sont supposés à droite : le menu le tourne ; s’il apparaît à l’envers, « Demi-tour » dans les médias de la table.')
              : '';
        lines.push(
          [
            t('« {name} » ({size}, {ratio}) sur le plateau ({screen}) : le menu le recadre, {lost} % de l’image coupés.', {
              name: item.name,
              size,
              ratio: ratioLabel(rm),
              screen: ratioLabel(rs),
              lost,
            }),
            orientation,
          ]
            .filter(Boolean)
            .join(' '),
        );
        return true;
      }
      const am = d.width / d.height;
      if (Math.abs(Math.log(am / screen)) <= tolerance) return true;
      const lost = Math.round((1 - Math.min(am, screen) / Math.max(am, screen)) * 100);
      const turned = am > 1.1 !== screen > 1.1 && Math.abs(Math.log(am)) > 0.1 && Math.abs(Math.log(screen)) > 0.1;
      const how = turned
        ? am < 1
          ? t('en portrait sur un écran en paysage')
          : t('en paysage sur un écran en portrait')
        : am > screen
          ? t('bandes noires en haut et en bas')
          : t('bandes noires sur les côtés');
      lines.push(
        t('« {name} » ({size}, {ratio}) sur {role} ({screen}){note} : {how}, {lost} % de l’écran inutilisé.', {
          name: item.name,
          size,
          ratio: ratioLabel(am),
          role: ROLE_LABELS[role],
          screen: ratioLabel(screen),
          note,
          how,
          lost,
        }),
      );
      return true;
    };
    check('Playfield', 'playfield');
    check('Loading', 'playfield');
    check('Backglass', 'backglass');
    check('Topper', 'topper');
    if (aspects.dmd) {
      // Le type de l'écran du DMD (FullDMD ou DMD seul), sinon les proportions de sa fenêtre.
      const full = ctx.cabinet && cabinetFullDmd(ctx.cabinet);
      const wanted: MediaType = full === undefined ? dmdTypeForRatio(Math.max(aspects.dmd, 1 / aspects.dmd)) : full ? 'FullDMD' : 'DMD';
      const partner: MediaType = wanted === 'DMD' ? 'FullDMD' : 'DMD';
      if (!check(wanted, 'dmd')) check(partner, 'dmd', t(', faute de média « {type} » ({code})', { type: label(wanted), code: wanted }));
    }
    if (lines.length) {
      findings.push({
        code: 'mediaRatio',
        severity: 'info',
        title: tn(lines.length, 'Proportions du média différentes de son écran', 'Proportions des médias différentes de leurs écrans'),
        detail: t('{lines} Le menu ne déforme jamais un média ; un fichier aux proportions de l’écran l’occupe en entier.', { lines: lines.join(' ') }),
      });
    }
  }

  // Fichiers très lourds.
  const heavy: string[] = [];
  for (const item of items) {
    const kind = mediaKind(item.name);
    if (!kind) continue;
    const size = sizeOf(item.file);
    const d = kind === 'image' ? dimsOf(item.file) : undefined;
    if (size > MEDIA_SIZE_LIMITS[kind]) {
      const kindLabel = kind === 'image' ? t('image') : kind === 'video' ? t('vidéo') : t('son');
      heavy.push(t('« {name} » : {size} ({kind}, seuil {limit}).', { name: item.name, size: formatSize(size), kind: kindLabel, limit: formatSize(MEDIA_SIZE_LIMITS[kind]) }));
    } else if (d && d.width * d.height > MEDIA_MAX_PIXELS) {
      heavy.push(t('« {name} » : {width} × {height} pixels, {size} une fois décodée en mémoire.', { name: item.name, width: d.width, height: d.height, size: formatSize(d.width * d.height * 4) }));
    }
  }
  if (heavy.length) {
    findings.push({
      code: 'mediaHuge',
      severity: 'info',
      title: tn(heavy.length, 'Média très lourd', 'Médias très lourds'),
      detail: tn(
        heavy.length,
        '{list} Le menu relit ce fichier à chaque passage sur la table, ce qui ralentit la navigation : une vidéo en 1080p ou en 4K (réencodée avec HandBrake, par exemple), une image en 4K au plus et un son en mp3 ou en ogg suffisent.',
        '{list} Le menu relit ces fichiers à chaque passage sur la table, ce qui ralentit la navigation : une vidéo en 1080p ou en 4K (réencodée avec HandBrake, par exemple), une image en 4K au plus et un son en mp3 ou en ogg suffisent.',
        { list: heavy.join(' ') },
      ),
    });
  }

  // Doublons d'un même type : un seul est montré.
  const duplicateLines: string[] = [];
  const duplicateOps: FileOp[] = [];
  for (const info of MEDIA_TYPES.filter((t) => !t.pages)) {
    const candidates = items.filter(
      (i) => i.type === info.type && i.accepted && !swappedFiles.has(i.file) && (i.vpinfe || allNames.some((n) => pageOf(i.stem!, n) === 1)),
    );
    if (candidates.length < 2) continue;
    const used = new Set(versionNames.flatMap((names) => shownMedia(items, info.type, names)).map((i) => i.file));
    const shown = candidates.filter((c) => used.has(c.file));
    const unused = candidates.filter((c) => !used.has(c.file));
    if (!unused.length || !shown.length) continue;
    const sameKind = unused.filter((u) => shown.some((s) => mediaKind(s.name) === mediaKind(u.name)));
    const other = unused.filter((u) => !sameKind.includes(u));
    duplicateLines.push(
      [
        tn(shown.length, '{type} : {files} est montré', '{type} : {files} sont montrés', { type: info.label, files: quoteList(shown.map((s) => s.name)) }),
        sameKind.length ? tn(sameKind.length, ', {files} ne sert pas', ', {files} ne servent pas', { files: quoteList(sameKind.map((u) => u.name)) }) : '',
        other.length ? t(' ; {files} : le menu prend la vidéo quand il y en a une', { files: quoteList(other.map((u) => u.name)) }) : '',
        '.',
      ].join(''),
    );
    for (const u of sameKind.filter((x) => free(x.file))) {
      claim(u.file);
      duplicateOps.push({ op: 'trash', path: u.file });
    }
  }
  if (duplicateLines.length) {
    const size = duplicateOps.reduce((sum, op) => sum + (op.op === 'trash' ? sizeOf(op.path) : 0), 0);
    findings.push({
      code: 'mediaDuplicate',
      severity: 'info',
      title: t('Médias en double'),
      detail: duplicateLines.join(' '),
      fix: duplicateOps.length
        ? {
            label:
              duplicateOps.length > 1
                ? t('Mettre les {n} fichiers jamais montrés à la corbeille (libère {size})', { n: duplicateOps.length, size: formatSize(size) })
                : t('Mettre le fichier jamais montré à la corbeille (libère {size})', { size: formatSize(size) }),
            ops: duplicateOps,
          }
        : undefined,
    });
  }

  // Erreurs de lecture enregistrées par l'affichage.
  const errors = (ctx.mediaErrors ?? (ctx.logsDir ? readMediaErrors(mediaErrorsFile(ctx.logsDir)) : [])).filter(
    (e) => isInside(e.file, folder) && isCurrentMediaError(e),
  );
  if (errors.length) {
    const broken = errors.filter((e) => FILE_ERRORS.includes(e.kind) && free(e.file));
    findings.push({
      code: 'mediaPlaybackError',
      severity: 'warning',
      title: tn(errors.length, 'Média que le menu n’a pas pu lire', 'Médias que le menu n’a pas pu lire'),
      detail: [
        ...errors.map((e) => {
          const params = { file: path.relative(folder, e.file), error: MEDIA_ERROR_LABELS[e.kind], count: e.count, date: formatDateTime(e.last), message: e.message ? ` (${e.message})` : '' };
          return e.count > 1 ? t('« {file} » : {error}, {count} fois, la dernière le {date}{message}.', params) : t('« {file} » : {error}, le {date}{message}.', params);
        }),
        t('Le menu passe alors au média suivant, ou à son repli. Remplacez le fichier par un mp4 (H.264) ou un webm, ou réencodez-le.'),
      ].join(' '),
      fix: broken.length
        ? {
            label:
              broken.length > 1
                ? t('Mettre les {n} fichiers illisibles à la corbeille', { n: broken.length })
                : t('Mettre « {name} » à la corbeille', { name: path.basename(broken[0]!.file) }),
            ops: broken.map((e) => ({ op: 'trash' as const, path: e.file })),
          }
        : undefined,
    });
  }

  return findings;
}

function samePathCI(a: string, b: string): boolean {
  return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}

function listDirs(dir: string): string[] {
  return readDirents(dir)
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

/**
 * ROM demandée par le script. Le plugin PinMAME de VPX 10.8.1 cherche dans
 * <table>\pinmame\roms si ce dossier existe, et seulement là ; sinon dans son dossier
 * commun (PinMAMEPath, la bibliothèque de ROM). Il lit aussi <table>\pinmame\alias.txt
 * avant tout : révision voisine, ou ancien nom de VPinMAME (romalias.ts).
 */
/**
 * ROM attendue par le script. D'abord ses puces éparpillées dans la table (un ancien
 * import déballait une ROM rangée dans un sous-dossier de son zip) : si la ROM n'est
 * nulle part ailleurs, elles sont refaites en un zip à plat, rangé dans la bibliothèque
 * et lié ; sinon elles ne servent à rien et partent à la corbeille.
 */
/**
 * Ce qui empêche la ROM demandée par le script d'être lue (playable.ts), sans relire la
 * table : vide quand elle est là, liée, trouvée par le dossier commun de PinMAME ou
 * fournie par un alias. Pour la fiche, qui n'appelle pas tout le médecin.
 */
export function romBlockers(folder: string, roms: string[], library?: string): Finding[] {
  return roms.length ? playBlockers(checkRom(folder, roms, library)) : [];
}

function checkRom(folder: string, roms: string[], library?: string): Finding[] {
  const scattered = scatteredRom(folder, roms);
  const findings = checkRomFiles(folder, roms, library, scattered);
  if (!scattered || findings.some((f) => f.code === 'romScattered')) return findings;
  const list = formatList(scattered.files.map((f) => path.relative(folder, f)));
  return [
    ...findings,
    {
      code: 'romScattered',
      severity: 'info',
      rom: scattered.rom,
      title: t('Fichiers de ROM éparpillés'),
      detail: tn(
        scattered.files.length,
        '{list} : un fichier de la ROM {rom} resté dans le dossier de la table. La table utilise {rom}.zip ; celui-ci ne sert à rien.',
        '{list} : des fichiers de la ROM {rom} restés dans le dossier de la table. La table utilise {rom}.zip ; ceux-ci ne servent à rien.',
        { list, rom: scattered.rom },
      ),
      fix: { label: tn(scattered.files.length, 'Mettre ce fichier à la corbeille', 'Mettre ces fichiers à la corbeille'), ops: scatteredTrash(scattered) },
    },
  ];
}

/** Puces d'une ROM hors de son zip, dans le dossier de la table. */
interface ScatteredRom {
  rom: string;
  files: string[];
  /** Dossier nommé comme la ROM qui les contient (sinon, la racine de la table). */
  dir?: string;
}

/**
 * Puces de la ROM demandée laissées à la racine de la table (« t2_l8.rom »,
 * « t2_u14.l3 » : même nom ou même famille que la ROM), ou dans un dossier nommé
 * comme elle qui ne contient qu'elles.
 */
function scatteredRom(folder: string, roms: string[]): ScatteredRom | undefined {
  let best: ScatteredRom | undefined;
  for (const rom of roms) {
    const lower = rom.toLowerCase();
    const family = `${romFamilyOf(rom)}_`;
    const files = readDirents(folder)
      .filter((d) => d.isFile() && isChipName(d.name))
      .map((d) => d.name)
      .filter((n) => n.replace(/\.[^.]+$/, '').toLowerCase() === lower || n.toLowerCase().startsWith(family))
      .map((n) => path.join(folder, n));
    const dirName = readDirents(folder).find((d) => d.isDirectory() && d.name.toLowerCase() === lower)?.name;
    const dir = dirName ? path.join(folder, dirName) : undefined;
    const content = dir ? romContent(listRelative(dir, 64) ?? []) : undefined;
    const found: ScatteredRom | undefined = content
      ? { rom, dir, files: [...files, ...content.chips.map((c) => path.join(dir!, ...c.split('/')))] }
      : files.length
        ? { rom, files }
        : undefined;
    if (found && (!best || found.files.length > best.files.length)) best = found;
  }
  return best;
}

/** Les puces éparpillées à la corbeille (le dossier de la ROM d'un bloc). */
function scatteredTrash(s: ScatteredRom): FileOp[] {
  const loose = s.files.filter((f) => !s.dir || !isInside(f, s.dir));
  return [...loose.map((f) => ({ op: 'trash' as const, path: f })), ...(s.dir ? [{ op: 'trash' as const, path: s.dir }] : [])];
}

/**
 * Remet une ROM en place : son .zip à plat, rangé dans la bibliothèque et lié dans
 * pinmame\roms (copié d'un disque à l'autre), ou dans pinmame\roms sans bibliothèque.
 */
function rebuildRomOps(name: string, members: RomZipMember[], folder: string, library: string | undefined, mtimeMs: number): FileOp[] {
  const inTable = path.join(folder, 'pinmame', 'roms', name);
  const target = library ? path.join(library, name) : inTable;
  return [{ op: 'zip', to: target, files: members, mtimeMs }, ...(library ? [{ op: 'link' as const, from: target, to: inTable }] : [])];
}

/** Puces d'un zip rangées dans un sous-dossier : le zip à refaire à plat, sinon undefined. */
function nestedRom(file: string): { folder: string; members: RomZipMember[] } | undefined {
  const entries = readZipEntries(file);
  const content = entries && romContent(entries.map((e) => e.name));
  if (!content?.dir) return undefined;
  return { folder: content.dir, members: content.chips.map((c) => ({ from: file, entry: c, name: path.basename(c) })) };
}

/** Une ROM de pinmame\roms dont les puces sont dans un sous-dossier : PinMAME ne la lit pas. */
function checkRomNested(folder: string, file: string, library?: string): Finding | undefined {
  const nested = nestedRom(file);
  if (!nested) return undefined;
  const name = path.basename(file);
  const rom = name.replace(/\.zip$/i, '');
  const stored = library ? storedRom(library, name) : undefined;
  // La ROM de la bibliothèque est refaite à plat si c'est celle de la table, ou si la bibliothèque n'en a pas.
  const intoLibrary = library && (!stored || sameRomFile(stored, romFile(file)!));
  return {
    code: 'romNested',
    severity: 'error',
    rom,
    title: t('ROM « {rom} » illisible : ses fichiers sont dans un sous-dossier du zip', { rom }),
    detail: t('{name} contient le dossier « {folder} » : PinMAME ne lit que les fichiers à la racine du zip, la table ne démarre pas.', { name, folder: nested.folder }),
    fix: {
      label: intoLibrary ? t('Refaire {name} à plat dans la bibliothèque', { name }) : t('Refaire {name} à plat', { name }),
      ops: intoLibrary
        ? rebuildRomOps(name, nested.members, folder, library, romFile(file)!.mtimeMs)
        : [{ op: 'zip', to: file, files: nested.members, mtimeMs: romFile(file)!.mtimeMs }],
    },
  };
}

function checkRomFiles(folder: string, roms: string[], library: string | undefined, scattered: ScatteredRom | undefined): Finding[] {
  const romsDir = path.join(folder, 'pinmame', 'roms');
  const files = listSafe(romsDir);
  const dirExists = fs.existsSync(romsDir);
  const { text: aliasText, lines: aliases } = readTableAliases(folder);
  const aliasFile = tableAliasFile(folder);
  const here = (name: string) => files.find((f) => f.toLowerCase() === `${name.toLowerCase()}.zip`);
  const inLibrary = (name: string) => (library ? storedRom(library, name) : undefined);
  /** Lier (ou copier, d'un disque à l'autre) une ROM de la bibliothèque dans pinmame\roms. */
  const linkOp = (name: string): FileOp[] => {
    const stored = inLibrary(name);
    return stored && !here(name) ? [{ op: 'link', from: stored.path, to: path.join(romsDir, path.basename(stored.path)) }] : [];
  };
  const writeAliases = (content: string): FileOp => (content ? { op: 'write', path: aliasFile, content } : { op: 'trash', path: aliasFile });
  const findings: Finding[] = [];

  // Alias devenu inutile : la ROM demandée est là, mais l'alias passe avant elle.
  for (const r of roms) {
    const line = aliasFor(aliases, r);
    if (!line || !here(r) || line.rom.toLowerCase() === r.toLowerCase()) continue;
    findings.push({
      code: 'romAliasObsolete',
      severity: 'warning',
      title: t('Alias inutile : {rom} est là, mais {loaded} est chargée', { rom: r, loaded: line.rom }),
      detail: t('pinmame\\alias.txt fait charger {loaded} quand le script demande {rom} ; PinMAME lit l’alias avant la ROM, si bien que {rom}.zip, maintenant dans pinmame\\roms, ne sert pas.', {
        rom: r,
        loaded: line.rom,
      }),
      fix: { label: t('Revenir à la ROM demandée (retirer la ligne « {line} »)', { line: `${line.alias},${line.rom}` }), ops: [writeAliases(withoutAlias(aliasText, line.alias))] },
    });
  }

  const found = roms.map(here).find(Boolean);
  if (found) {
    const nested = checkRomNested(folder, path.join(romsDir, found), library);
    if (nested) return [...findings, nested];
    return [...findings, ...(library ? checkRomCopy(path.join(romsDir, found), library) : [])];
  }
  const rom = roms[0]!;

  // Puces éparpillées dans la table, et la ROM nulle part ailleurs : on refait son zip.
  if (scattered && !roms.some((r) => aliasFor(aliases, r) || inLibrary(r))) {
    const name = `${scattered.rom}.zip`;
    const where = scattered.dir ? t('dans le dossier « {folder} » de la table', { folder: path.basename(scattered.dir) }) : t('à la racine du dossier de la table');
    const members = scattered.files.map((f) => ({ from: f, name: path.basename(f) }));
    const mtimeMs = Math.max(...scattered.files.map((f) => romFile(f)?.mtimeMs ?? 0));
    findings.push({
      code: 'romScattered',
      severity: 'error',
      rom: scattered.rom,
      title: t('ROM « {rom} » en fichiers éparpillés dans la table', { rom: scattered.rom }),
      detail: tn(
        scattered.files.length,
        'Le fichier de la ROM {rom} ({list}) est {where} : PinMAME ne lit une ROM que sous la forme {rom}.zip, ses fichiers à la racine du zip, dans pinmame\\roms. La table ne démarre pas. La correction refait le zip ; le fichier éparpillé va à la corbeille.',
        'Les {n} fichiers de la ROM {rom} ({list}) sont {where} : PinMAME ne lit une ROM que sous la forme {rom}.zip, ses fichiers à la racine du zip, dans pinmame\\roms. La table ne démarre pas. La correction refait le zip ; les fichiers éparpillés vont à la corbeille.',
        { rom: scattered.rom, list: formatList(members.map((m) => m.name)), where },
      ),
      fix: {
        label: library ? t('Refaire {name} dans la bibliothèque et le lier', { name }) : t('Refaire {name} dans pinmame\\roms', { name }),
        ops: [...rebuildRomOps(name, members, folder, library, mtimeMs), ...scatteredTrash(scattered)],
      },
    });
    return findings;
  }

  // Un alias est déjà en place : c'est sa ROM qu'il faut.
  const alias = roms.map((r) => aliasFor(aliases, r)).find(Boolean);
  if (alias) {
    const historic = historicAlias(alias.alias)?.toLowerCase() === alias.rom.toLowerCase();
    if (here(alias.rom)) {
      // Un ancien nom de VPinMAME : rien à dire. Une révision voisine : on la rappelle.
      if (!historic) {
        findings.push({
          code: 'romAlias',
          severity: 'info',
          rom: alias.alias,
          neighbour: alias.rom,
          title: t('Révision voisine : {rom} au lieu de {asked}', { rom: alias.rom, asked: alias.alias }),
          detail: t('pinmame\\alias.txt fait charger {rom}, la table demande {asked}. {warning} Quand {asked}.zip arrivera, le médecin proposera de retirer l’alias.', {
            rom: alias.rom,
            asked: alias.alias,
            warning: neighbourWarning(),
          }),
        });
      }
      return findings;
    }
    const ops = linkOp(alias.rom);
    findings.push(
      ops.length
        ? {
            code: 'romNotLinked',
            severity: 'error',
            rom: alias.rom,
            title: t('ROM « {rom} » pas liée dans la table', { rom: alias.rom }),
            detail: t('pinmame\\alias.txt fait charger {rom} pour {asked} ; elle est dans la bibliothèque, mais pas dans pinmame\\roms.', { rom: alias.rom, asked: alias.alias }),
            fix: { label: t('Lier la ROM de la bibliothèque dans pinmame\\roms'), ops },
          }
        : {
            code: 'romMissing',
            severity: 'error',
            rom: alias.rom,
            title: t('ROM « {rom} » absente', { rom: alias.rom }),
            detail: t(
              'pinmame\\alias.txt fait charger {rom} quand le script demande {asked}, mais {rom}.zip n’est nulle part. Ajoutez-la (dossier d’import, puis « Ajouter une table »), ou retirez l’alias.',
              { rom: alias.rom, asked: alias.alias },
            ),
            fix: { label: t('Retirer l’alias « {line} »', { line: `${alias.alias},${alias.rom}` }), ops: [writeAliases(withoutAlias(aliasText, alias.alias))] },
          },
    );
    return findings;
  }

  // Ancien nom de VPinMAME : le plugin ne le connaît plus, il faut la ligne d'alias.
  const historic = roms.map((r) => [r, historicAlias(r)] as const).find(([, real]) => real);
  if (historic) {
    const [asked, real] = historic as readonly [string, string];
    const available = here(real) || inLibrary(real);
    findings.push({
      code: 'romAliasHistoric',
      severity: 'error',
      rom: real,
      title: t('« {asked} » : ancien nom de la ROM {rom}', { asked, rom: real }),
      detail: [
        t('Le script demande {asked}, que VPinMAME traduisait de lui-même en {rom} ; le plugin PinMAME de VPX 10.8.1 ne connaît plus ces anciens noms : sans alias, la table ne démarre pas.', {
          asked,
          rom: real,
        }),
        available ? '' : t('Il faut aussi {rom}.zip : ajoutez-la (dossier d’import, puis « Ajouter une table »).', { rom: real }),
      ]
        .filter(Boolean)
        .join(' '),
      fix: available
        ? {
            label: t('Écrire l’alias « {line} » dans pinmame\\alias.txt', { line: `${asked},${real}` }),
            ops: [...linkOp(real), { op: 'write', path: aliasFile, content: withAlias(aliasText, asked, real, `ancien nom de VPinMAME (release/VPMAlias.txt)`) }], // i18n-ignore : commentaire écrit dans alias.txt
          }
        : undefined,
    });
    return findings;
  }

  // La ROM est dans la bibliothèque : il ne manque que le lien.
  const stored = roms.map(inLibrary).find(Boolean);
  if (stored) {
    const name = path.basename(stored.path);
    const copy = !sameVolume(stored.path, folder);
    findings.push({
      code: 'romNotLinked',
      // Sans pinmame\roms, PinMAME la trouve dans son dossier commun ; avec, il ne regarde que là.
      severity: dirExists ? 'error' : 'info',
      rom: name.replace(/\.zip$/i, ''),
      title: dirExists
        ? t('ROM « {rom} » absente de pinmame\\roms', { rom: name.replace(/.zip$/i, '') })
        : t('ROM « {rom} » pas liée dans la table', { rom: name.replace(/.zip$/i, '') }),
      detail: dirExists
        ? t(
            'Elle est dans la bibliothèque de ROM ({dir}), mais la table a son propre dossier pinmame\\roms, sans elle : PinMAME ne cherche alors que là, jamais dans son dossier commun. La table ne démarre pas.',
            { dir: path.dirname(stored.path) },
          )
        : t(
            'Elle est dans la bibliothèque de ROM ({dir}) : la table la trouve par le dossier commun de PinMAME. Un lien dans pinmame\\roms la rend autonome (copie de la table, autre configuration).',
            { dir: path.dirname(stored.path) },
          ),
      fix: {
        label: copy
          ? t('Copier la ROM dans pinmame\\roms ({size}, la table est sur un autre disque)', { size: formatSize(stored.size) })
          : t('Lier la ROM de la bibliothèque dans pinmame\\roms (aucune place en plus)'),
        ops: [{ op: 'link', from: stored.path, to: path.join(romsDir, name) }],
      },
    });
    return findings;
  }
  // La ROM est peut-être dans le dossier, mais pas au bon endroit.
  const stray = findFile(folder, roms.map((r) => `${r.toLowerCase()}.zip`), romsDir);
  if (stray) {
    const nested = nestedRom(stray);
    findings.push({
      code: 'romMisplaced',
      severity: 'error',
      rom: path.basename(stray).replace(/\.zip$/i, ''),
      title: t('ROM mal rangée'),
      detail: nested
        ? t('PinMAME cherche la ROM dans pinmame\\roms, ses fichiers à la racine du zip ; « {file} » n’y est pas, et ses fichiers sont dans le dossier « {folder} ».', {
            file: path.relative(folder, stray),
            folder: nested.folder,
          })
        : t('PinMAME cherche la ROM dans pinmame\\roms ; « {file} » n’y est pas.', { file: path.relative(folder, stray) }),
      fix: nested
        ? {
            label: library ? t('Refaire la ROM à plat dans la bibliothèque') : t('Refaire la ROM à plat dans pinmame\\roms'),
            ops: [...rebuildRomOps(path.basename(stray), nested.members, folder, library, romFile(stray)!.mtimeMs), { op: 'trash', path: stray }],
          }
        : { label: t('Ranger la ROM dans pinmame\\roms'), ops: [{ op: 'move', from: stray, to: path.join(romsDir, path.basename(stray)) }] },
    });
    return findings;
  }
  // Une révision voisine est sur la borne : sur demande, un alias la fait charger.
  const libraryNames = library ? [...listRoms(library).keys()] : [];
  const neighbour = neighbourRom(rom, [...files, ...libraryNames]);
  if (neighbour) {
    const where = here(neighbour) ? t('dans pinmame\\roms de la table') : t('dans la bibliothèque de ROM');
    findings.push({
      code: 'romAlias',
      severity: 'error',
      rom,
      neighbour,
      title: t('ROM « {rom} » absente, révision voisine {neighbour} sur la borne', { rom, neighbour }),
      detail: t('La table ne démarrera pas sans {rom}.zip. {neighbour}.zip, du même jeu, est {where} : un alias peut la faire charger à sa place. {warning}', {
        rom,
        neighbour,
        where,
        warning: neighbourWarning(),
      }),
      fix: {
        label: t('Jouer avec {neighbour} (alias « {line} » dans pinmame\\alias.txt)', { neighbour, line: `${rom},${neighbour}` }),
        ops: [...linkOp(neighbour), { op: 'write', path: aliasFile, content: withAlias(aliasText, rom, neighbour, `révision voisine choisie le ${new Date().toLocaleDateString('fr-FR')}`) }], // i18n-ignore : commentaire écrit dans alias.txt
      },
    });
    return findings;
  }
  const others = roms.length > 1 ? ` ${t('(ou {list})', { list: roms.slice(1).map((r) => `${r}.zip`).join(', ') })}` : '';
  findings.push({
    code: 'romMissing',
    severity: 'error',
    rom,
    title: t('ROM « {rom} » absente', { rom }),
    detail: [
      t(
        'La table ne démarrera pas sans {rom}.zip{others}. Mettez le fichier dans le dossier d’import (ou glissez-le sur cette fenêtre) puis « Ajouter une table » : il sera rangé dans la bibliothèque de ROM et lié dans pinmame\\roms. Pour savoir où la trouver, étape par étape : « Ce qu’il manque pour jouer ».',
        { rom, others },
      ),
      dirExists && !files.length ? t('Le dossier pinmame\\roms de la table est vide : tant qu’il existe, PinMAME ne cherche pas ailleurs.') : '',
    ]
      .filter(Boolean)
      .join(' '),
  });
  return findings;
}

/** ROM de la table à côté de celle de la bibliothèque : copie à remplacer par un lien. */
function checkRomCopy(file: string, library: string): Finding[] {
  const own = romFile(file);
  const stored = storedRom(library, path.basename(file));
  if (!own || !stored || sameRomFile(own, stored)) return [];
  const name = path.basename(file);
  const identical = sameRomContent(own, stored);
  // D'un disque à l'autre, une copie identique est la seule possibilité.
  if (identical && !sameVolume(stored.path, file)) return [];
  return [
    identical
      ? {
          code: 'romCopy',
          severity: 'info',
          title: t('Copie de ROM au lieu d’un lien'),
          detail: t('pinmame\\roms\\{name} est une copie de la ROM de la bibliothèque : {size} de trop sur le disque.', { name, size: formatSize(own.size) }),
          fix: { label: t('Remplacer la copie par un lien vers la bibliothèque (libère {size})', { size: formatSize(own.size) }), ops: [{ op: 'link', from: stored.path, to: file }] },
        }
      : {
          code: 'romCopy',
          severity: 'warning',
          title: t('Autre version de la ROM que celle de la bibliothèque'),
          detail: t(
            'pinmame\\roms\\{name} ({size}, {date}) n’a pas le même contenu que celle de la bibliothèque ({librarySize}, {libraryDate}). Pour garder plutôt celle de la table, « Ranger les ROM » dans le menu laisse choisir.',
            { name, size: formatSize(own.size), date: formatDate(own.mtimeMs), librarySize: formatSize(stored.size), libraryDate: formatDate(stored.mtimeMs) },
          ),
          fix: { label: t('Utiliser la ROM de la bibliothèque (celle de la table va à la corbeille)'), ops: [{ op: 'link', from: stored.path, to: file }] },
        },
  ];
}

/**
 * Dossier FlexDMD / UltraDMD que charge le script, absent. Facultatif (playable.ts) : la
 * table se lance sans lui. Sans ses images, FlexDMD renvoie Nothing au script (NewImage,
 * plugins/flexdmd/actors/Image.cpp) : ce DMD-là reste vide, et un script qui ne s'y attend
 * pas s'arrête sur « Type incompatible » (Goonies de VPW).
 */
function checkDmdFolder(folder: string, dmdFolder: string, usesPinmame: boolean): Finding | undefined {
  const dirs = readDirents(folder).filter((d) => d.isDirectory()).map((d) => d.name);
  if (dirs.some((d) => d.toLowerCase() === dmdFolder.toLowerCase())) return undefined;
  const intro = [
    t('Facultatif : le script dessine un DMD avec les images, vidéos et polices du dossier « {folder} », mais la table se lance sans lui.', { folder: dmdFolder }),
    usesPinmame
      ? t('Le DMD de la ROM s’affiche à l’emplacement du DMD ; si le script s’arrête sur « Type incompatible », c’est ce dossier qui manque.')
      : t('Sans lui, ce DMD reste vide ; si le script s’arrête sur « Type incompatible », c’est ce dossier qui manque.'),
  ].join(' ');
  // Contenu vidé à la racine par un import qui aplatissait les sous-dossiers : on le range.
  const own = [path.basename(folder), ...readDirents(folder).filter((d) => d.isFile() && /\.vpx$/i.test(d.name)).map((d) => d.name.slice(0, -4))].map((n) =>
    n.toLowerCase(),
  );
  const loose = readDirents(folder)
    .filter((d) => d.isFile() && DMD_ASSET_EXT.has(path.extname(d.name).toLowerCase()))
    .map((d) => d.name)
    .filter((f) => !own.some((n) => f.toLowerCase().startsWith(n)));
  if (loose.length) {
    return {
      code: 'dmdFolderMissing',
      severity: 'warning',
      title: t('Dossier « {folder} » absent, son contenu est en vrac', { folder: dmdFolder }),
      detail: `${intro} ${tn(loose.length, '{n} image ou police du DMD sont à la racine du dossier de la table.', '{n} images ou polices du DMD sont à la racine du dossier de la table.')}`,
      fix: {
        label: loose.length > 1 ? t('Ranger ces {n} fichiers dans « {folder} »', { n: loose.length, folder: dmdFolder }) : t('Ranger ce fichier dans « {folder} »', { folder: dmdFolder }),
        ops: loose.map((f) => ({ op: 'move', from: path.join(folder, f), to: path.join(folder, dmdFolder, f) })),
      },
    };
  }
  return {
    code: 'dmdFolderMissing',
    severity: 'warning',
    title: t('Dossier « {folder} » absent', { folder: dmdFolder }),
    detail: `${intro} ${t('Ce dossier est fourni avec la table d’origine ; mettez-le dans le dossier d’import puis « Ajouter une table ».')}`,
  };
}

/** Fichiers que FlexDMD et UltraDMD chargent depuis leur dossier. */
const DMD_ASSET_EXT = new Set(['.fnt', '.png', '.gif', '.apng', '.bmp', '.jpg', '.jpeg']);

/** Cherche un fichier par nom dans le dossier de la table (3 niveaux), hors du dossier exclu. */
function findFile(dir: string, names: string[], exclude: string, depth = 3): string | undefined {
  for (const dirent of readDirents(dir)) {
    const p = path.join(dir, dirent.name);
    if (dirent.isFile() && names.includes(dirent.name.toLowerCase())) return p;
  }
  if (depth === 0) return undefined;
  for (const dirent of readDirents(dir)) {
    const p = path.join(dir, dirent.name);
    if (!dirent.isDirectory() || isInside(p, exclude) || ['cache', 'pupvideos', 'medias'].includes(dirent.name.toLowerCase())) continue;
    const found = findFile(p, names, exclude, depth - 1);
    if (found) return found;
  }
  return undefined;
}

/** Le nom le plus proche des références (titre, nom de fichier, dossier). */
export function bestMatch(names: string[], references: string[]): string {
  const keys = references.map((r) => nameKey(parseTableName(r).title)).filter(Boolean);
  const score = (name: string) => {
    const k = nameKey(parseTableName(name.replace(/\.[^.]+$/, '')).title);
    return keys.reduce((best, ref) => Math.max(best, k === ref ? 3 : k.includes(ref) || ref.includes(k) ? 2 : 0), 0);
  };
  return [...names].sort((a, b) => score(b) - score(a) || a.localeCompare(b))[0]!;
}

function listSafe(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

function readDirents(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}
