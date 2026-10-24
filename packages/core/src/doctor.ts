// Médecin des tables : repère ce qui empêche une table de bien fonctionner et
// propose une correction précise, que l'utilisateur déclenche lui-même.
// Le script de la table (nom de la ROM) est lu par l'application avec
// VPinballX -ExtractVBS ; ici on ne fait qu'interpréter son texte.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { formatSize, isInside, safeName, sameVolume, sizeOf, type FileOp } from './fileops';
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
  chooseVariant,
  describePupCabinet,
  expectedPackNames,
  findPackRoot,
  isVisible,
  pupScriptFacts,
  screenRole,
  type PupCabinet,
  type PupScriptFacts,
} from './puppack';
import { aliasFor, historicAlias, neighbourRom, NEIGHBOUR_WARNING, readTableAliases, tableAliasFile, withAlias, withoutAlias } from './romalias';
import { listRoms, romFile, sameRomContent, sameRomFile, storedRom } from './romlibrary';
import { companion, nameKey } from './tablefiles';
import { parseTableName, type TableEntry } from './tables';
import { findTableIni } from './vpx-settings';

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
  'backglassMissing',
  'backglassMisnamed',
  'backglassStray',
  'romMissing',
  'romMisplaced',
  'romUnknown',
  'romNotLinked',
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
  'pupScreenAbsent',
  'pupPlayfieldScreen',
  'pupScriptDriven',
  'pupCaptureRom',
  'pupLog',
  'manualView',
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
}

/** Ce qu'on a appris du script de la table. */
export interface ScriptFacts {
  /** La table pilote un vrai jeu par PinMAME : il lui faut une ROM. */
  usesPinmame: boolean;
  /** Noms de ROM possibles (certaines tables laissent choisir entre plusieurs). */
  roms: string[];
  /**
   * Dossier, à côté de la table, d'où FlexDMD ou UltraDMD charge les images,
   * vidéos et polices du DMD (ProjectFolder). Sans lui, le script s'arrête au
   * démarrage : la table s'affiche mais la partie ne commence pas.
   */
  dmdFolder?: string;
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
}

/** Mémoire de Cyber Pinball dans le .info : option et nom d'origine de chaque pack installé. */
export interface PupMemory {
  option?: string;
  origin?: string;
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

/** Nom du dossier d'une table : « Terminator 2 (Williams 1991) ». */
export function tableFolderName(title: string, manufacturer?: string, year?: number): string {
  const suffix = [manufacturer, year].filter(Boolean).join(' ');
  return safeName(suffix ? `${title} (${suffix})` : title) || 'Table';
}

/** Nom(s) de ROM d'après le script VBScript de la table. */
export function scriptFacts(vbs: string): ScriptFacts {
  const code = vbs
    .split(/\r?\n/)
    .map(stripComment)
    .join('\n');
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

/** Retire le commentaire VBScript d'une ligne (apostrophe hors chaîne, ou Rem). */
function stripComment(line: string): string {
  if (/^\s*rem\b/i.test(line)) return '';
  let inString = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inString = !inString;
    else if (c === "'" && !inString) return line.slice(0, i);
  }
  return line;
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
      title: 'Table hors de son propre dossier',
      detail: `VPX range chaque table dans son dossier, avec sa ROM, son backglass et ses vidéos. Celle-ci est en vrac dans ${ctx.tablesDir}.`,
      fix: {
        label: `Déplacer ${moved.length > 1 ? `ses ${moved.length} fichiers` : 'la table'} dans « ${path.basename(target)} »`,
        ops: moved.map((f) => ({ op: 'move', from: path.join(folder, f), to: path.join(target, f) })),
      },
    });
  }

  // 2. Un .vbs nommé comme la table remplace son script.
  const vbs = has(`${base}.vbs`);
  if (vbs) {
    findings.push({
      code: 'scriptOverride',
      severity: 'warning',
      title: 'Script de la table remplacé',
      detail: `${vbs} remplace le script contenu dans la table. C'est parfois voulu (correctif), souvent un reste d'extraction qui rend la table injouable après une mise à jour.`,
      fix: { label: `Mettre ${vbs} à la corbeille`, ops: [{ op: 'trash', path: path.join(folder, vbs) }] },
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
      title: 'Backglass mal nommé',
      detail: `VPX cherche « ${base}.directb2s » ou « ${wanted} » : « ${best} » ne sera pas affiché.`,
      fix: { label: `Renommer en « ${wanted} »`, ops: [{ op: 'move', from: path.join(folder, best), to: path.join(folder, wanted) }] },
    });
  } else if (!backglass) {
    findings.push({
      code: 'backglassMissing',
      severity: 'info',
      title: 'Pas de backglass',
      detail: 'Le second écran restera sur l’image de Cyber Pinball. Ajoutez un fichier .directb2s avec « Ajouter une table » pour l’animer.',
    });
  } else if (strays.length) {
    const size = strays.reduce((sum, f) => sum + sizeOf(path.join(folder, f)), 0);
    findings.push({
      code: 'backglassStray',
      severity: 'info',
      title: strays.length > 1 ? 'Backglass inutilisés' : 'Backglass inutilisé',
      detail: `VPX affiche « ${path.basename(backglass)} » ; ${strays.map((f) => `« ${f} »`).join(', ')} ne ${strays.length > 1 ? 'servent' : 'sert'} à rien (${formatSize(size)}).`,
      fix: { label: `Mettre ${strays.length > 1 ? 'les fichiers inutilisés' : 'le fichier inutilisé'} à la corbeille`, ops: strays.map((f) => ({ op: 'trash', path: path.join(folder, f) })) },
    });
  }

  // 4. ROM attendue par le script.
  if (ownFolder && ctx.script) {
    if ('error' in ctx.script) {
      findings.push({ code: 'scriptUnreadable', severity: 'warning', title: 'Script illisible', detail: `La ROM n’a pas pu être vérifiée : ${ctx.script.error}` });
    } else if (ctx.script.usesPinmame && ctx.script.roms.length === 0) {
      findings.push({ code: 'romUnknown', severity: 'info', title: 'ROM non vérifiée', detail: 'La table utilise PinMAME, mais le nom de sa ROM n’apparaît pas clairement dans son script.' });
    } else if (ctx.script.usesPinmame) {
      findings.push(...checkRom(folder, ctx.script.roms, ctx.romLibrary));
    }
    if (!('error' in ctx.script) && ctx.script.dmdFolder) {
      const finding = checkDmdFolder(folder, ctx.script.dmdFolder);
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
      title: 'Rapport de plantage de VPX',
      detail: `VPX a planté sur cette table le ${when.toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })}${reason ? ` (${reason})` : ''}. ${crashes.join(' et ')} : ${formatSize(size)}.`,
      fix: { label: `Supprimer ${crashes.length > 1 ? 'les rapports' : 'le rapport'} (libère ${formatSize(size)})${txt && ctx.logsDir ? ', crash.txt est gardé dans les journaux' : ''}`, ops },
    });
  }

  // 6. Fichier .info partagé entre frontends.
  if (!fs.existsSync(entry.infoFile) && !(ownFolder && has(`${path.basename(folder)}.info`))) {
    const infoFile = ownFolder ? path.join(folder, `${path.basename(folder)}.info`) : entry.infoFile;
    const info = { Info: { Title: entry.title, Manufacturer: entry.manufacturer, Year: entry.year } };
    findings.push({
      code: 'infoMissing',
      severity: 'info',
      title: 'Pas de fichier d’informations',
      detail: 'Le titre, le fabricant et l’année sont devinés d’après le nom des fichiers. Le fichier .info les fixe et les partage avec les autres frontends.',
      fix: { label: `Créer « ${path.basename(infoFile)} »`, ops: [{ op: 'write', path: infoFile, content: JSON.stringify(info, null, 2) + '\n' }] },
    });
  }

  // 7. Cadrage manuel imposé par le .ini de la table (souvent livré avec elle).
  const manual = manualViewFinding(entry.file);
  if (manual) findings.push(manual);

  // 8. PuP-Pack (mode plugins de VPX 10.8.1).
  if (ownFolder) findings.push(...checkPup(entry, ctx));

  // 9. Médias de présentation (medias\ de la table).
  if (ownFolder) findings.push(...checkMedias(entry, ctx));

  const order: Record<FindingSeverity, number> = { error: 0, warning: 1, info: 2 };
  return findings.sort((a, b) => order[a.severity] - order[b.severity]);
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
    title: 'Cadrage manuel imposé par la table',
    detail: `${name} règle [Player] CabinetAutofitMode = 0 : VPX ne cadre pas cette table et reprend une vue réglée à la main, peut-être pour un autre écran (table tronquée ou qui déborde). Ensuite, « Ajuster la vue » dans la fiche la règle aux boutons.`,
    fix: {
      label: 'Rendre le cadrage automatique à la table',
      ops: doc.entries().length ? [{ op: 'write', path: ini.path, content: doc.toString() }] : [{ op: 'trash', path: ini.path }],
    },
  };
}

/** Règles du § 4.4 de la recherche sur les PuP-Packs, sans lancer VPX. */
function checkPup(entry: TableEntry, ctx: DoctorContext): Finding[] {
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
      title: 'PuP-Pack rangé un dossier trop bas',
      detail: `Le plugin PUP lit screens.pup à la racine de pupvideos\\${pack} ; le pack est dans « ${path.relative(pupvideos, root)} ».`,
      fix: {
        label: `Remonter le pack dans pupvideos\\${pack}`,
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
      title: `PuP-Pack « ${wanted} » introuvable`,
      detail: [
        `Le plugin PUP cherche pupvideos\\${expected.join(' ou pupvideos\\')} à côté de la table.`,
        candidate
          ? `« ${candidate} » ne sera pas chargé sous ce nom.`
          : packs.length
            ? `Présents : ${packs.join(', ')}.`
            : 'Ajoutez le pack avec « Ajouter une table » : il sera rangé et nommé comme il faut.',
        'La table se joue sans ses vidéos.',
      ].join(' '),
      fix: candidate ? { label: `Renommer « ${candidate} » en « ${wanted} »`, ops: [{ op: 'move', from: path.join(pupvideos, candidate), to: path.join(pupvideos, wanted) }] } : undefined,
    });
  } else if (matching.length && othersKnown && others.length) {
    const size = others.reduce((sum, p) => sum + sizeOf(path.join(pupvideos, p)), 0);
    findings.push({
      code: 'pupOrphan',
      severity: 'info',
      title: others.length > 1 ? 'PuP-Packs inutilisés' : 'PuP-Pack inutilisé',
      detail: `Le plugin charge pupvideos\\${matching[0]} ; ${others.map((p) => `« ${p} »`).join(', ')} ne ${others.length > 1 ? 'servent' : 'sert'} à aucune table du dossier (${formatSize(size)}).`,
      fix: {
        label: `Mettre ${others.length > 1 ? 'les dossiers inutilisés' : 'le dossier inutilisé'} à la corbeille`,
        ops: others.map((p) => ({ op: 'trash' as const, path: path.join(pupvideos, p) })),
      },
    });
  }

  for (const pack of matching) {
    const dir = path.join(pupvideos, pack);
    const info = analysePack(findPackRoot(dir) ?? dir);
    const memory = pupMemory(entry.info, pack);

    // Option non appliquée : des variantes, et une racine sans .pup ou avec des .pup d'aucune variante.
    // Un pack imbriqué est d'abord remonté : la correction viserait sinon l'ancien emplacement.
    if (!nested.has(pack) && info.variants.length && (!info.pupFiles.length || !appliedVariant(info))) {
      const choice = chooseVariant(info.variants, ctx.cabinet, memory?.option);
      const v = choice.chosen!;
      const failed = info.bats.filter((b) => !b.ok);
      const why =
        choice.reason === 'remembered'
          ? 'option choisie à l’installation'
          : choice.reason === 'cabinet' && ctx.cabinet
            ? `d’après la borne : ${describePupCabinet(ctx.cabinet)}`
            : choice.reason === 'only'
              ? 'seule option du pack'
              : 'à vérifier : la borne n’est pas configurée';
      findings.push({
        code: 'pupOptionNotApplied',
        severity: info.pupFiles.length ? 'info' : 'warning',
        title: info.pupFiles.length ? 'Option du PuP-Pack modifiée ou inconnue' : 'Option du PuP-Pack non appliquée',
        detail: [
          info.pupFiles.length
            ? `Les fichiers .pup de pupvideos\\${pack} ne sont ceux d’aucune option (modifiés à la main, ou mélange après une mise à jour).`
            : `pupvideos\\${pack} n’a pas de screens.pup : il faut y recopier une des ${info.variants.length} options du pack.`,
          `Options : ${info.variants.map((x) => x.label).join(', ')}.`,
          failed.length
            ? `${failed.map((b) => `« ${b.bat} » (${b.reason})`).join(', ')} : lu${failed.length > 1 ? 's' : ''} sans succès, jamais exécuté${failed.length > 1 ? 's' : ''}.`
            : '',
        ]
          .filter(Boolean)
          .join(' '),
        fix: {
          label: `Appliquer « ${v.label} » (${why})`,
          ops: [
            ...v.copies.map((c) => ({ op: 'copy' as const, from: path.join(info.root, c.from), to: path.join(info.root, c.to) })),
            ...v.deletes.map((d) => ({ op: 'trash' as const, path: path.join(info.root, d) })),
            // L'option est retenue pour la prochaine mise à jour du pack.
            ...(fs.existsSync(entry.infoFile) ? [{ op: 'write' as const, path: entry.infoFile, content: withPupMemory(entry.info, pack, { ...memory, option: v.label }) }] : []),
          ],
        },
      });
    }

    // Écrans demandés que la borne n'a pas, et écran Playfield que le plugin ne rend pas.
    if (ctx.cabinet) {
      const has = { topper: ctx.cabinet.topper, backglass: ctx.cabinet.backglass, dmd: ctx.cabinet.dmd };
      const labels = { topper: 'le topper', backglass: 'le backglass', dmd: 'le DMD' } as const;
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
          title: 'Écrans du PuP-Pack absents de la borne',
          detail: `Le pack montre des vidéos sur ${[...lost].map((r) => labels[r]).join(' et ')}, que la borne n’a pas : elles ne seront pas vues. Une autre option du pack les place peut-être ailleurs.`,
        });
      }
    }
    if (info.screens.some((s) => s.num === 3 && isVisible(s) && (s.parent === undefined || s.parent === 3))) {
      findings.push({
        code: 'pupPlayfieldScreen',
        severity: 'info',
        title: 'Vidéos sur le plateau non affichées',
        detail: 'Le pack utilise l’écran Playfield (3), que le plugin PUP de VPX 10.8.1 n’affiche pas : ces vidéos par-dessus le plateau ne seront pas vues.',
      });
    }

    // Pack ancien : le script déclare tout, le pack n'a que des dossiers de vidéos.
    if (facts?.pup?.playlistAdd && !info.pupFiles.length && !info.variants.length) {
      findings.push({
        code: 'pupScriptDriven',
        severity: 'info',
        title: 'PuP-Pack piloté par le script',
        detail: `pupvideos\\${pack} n’a aucun fichier .pup : c’est le script de la table qui déclare ses playlists (playlistadd). Le plugin PUP le gère en grande partie ; si des vidéos manquent, le journal de VPX dira quelles fonctions ne sont pas prises en charge.`,
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
          title: 'PuP-Pack prévu pour une autre ROM',
          detail: `Le pack reconnaît les images du DMD (PuPCapture) de la ROM « ${origin} », la table joue « ${rom} » : certaines vidéos ne se déclencheront pas.`,
        });
      } else if (language) {
        findings.push({
          code: 'pupCaptureRom',
          severity: 'info',
          title: 'ROM d’une autre langue',
          detail: `La table joue « ${rom} », semble-t-il une ROM ${language}. Le pack reconnaît les images du DMD (PuPCapture) : s’il a été fait pour la ROM anglaise, certaines vidéos ne se déclencheront pas.`,
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
  return { f: 'française', g: 'allemande', i: 'italienne', s: 'espagnole' }[m[1]!.toLowerCase() as 'f' | 'g' | 'i' | 's'];
}

/** Ce que vpinball.log dit du pack à la dernière partie de cette table. */
function checkPupLog(entry: TableEntry, log: string, expected: string[], found: Finding[]): Finding[] {
  const lines = log.split(/\r?\n/);
  const loads = lines.map((l, i) => ({ i, file: /LoadGameFromFilename (.+)$/.exec(l)?.[1]?.trim() })).filter((x) => x.file);
  const start = loads.filter((x) => samePathCI(x.file!, entry.file)).at(-1);
  if (!start) return [];
  const end = loads.find((x) => x.i > start.i)?.i ?? lines.length;
  const session = lines.slice(start.i, end);
  if (!session.some((l) => /Plugin PUP loaded/.test(l)) || !session.some((l) => /Starting Play mode/.test(l))) return [];
  const findings: Finding[] = [];
  const pathIndex = session.findLastIndex((l) => /PUP path: /.test(l));
  const pupPath = pathIndex >= 0 ? /PUP path: (.+)$/.exec(session[pathIndex]!)![1]!.trim() : undefined;
  if (pupPath && session.slice(pathIndex).some((l) => /No screens\.pup file found/.test(l))) {
    if (!found.some((f) => f.code === 'pupOptionNotApplied')) {
      findings.push({
        code: 'pupLog',
        severity: 'warning',
        title: 'Journal de VPX : pack sans screens.pup',
        detail: `À la dernière partie, VPX a chargé « ${pupPath} » mais n’y a pas trouvé de screens.pup : les écrans du pack sont restés éteints.`,
      });
    }
  } else if (!pupPath && expected.length && !found.some((f) => f.code === 'pupMissing')) {
    findings.push({
      code: 'pupLog',
      severity: 'warning',
      title: 'Journal de VPX : pack non chargé',
      detail: `À la dernière partie, le plugin PUP n’a chargé aucun pack (il cherchait pupvideos\\${expected[0]}). Si le pack a été ajouté ou réparé depuis, relancez une partie.`,
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
      title: 'Journal de VPX : fonctions PuP non prises en charge',
      detail: `La table a demandé au plugin PUP des fonctions qu’il ne gère pas encore (${missing.slice(0, 4).join(', ')}${missing.length > 4 ? '…' : ''}) : une partie du pack peut manquer.`,
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
  const shown = names.slice(0, max).map((n) => `« ${n} »`);
  const rest = names.length - shown.length;
  if (rest > 0) return `${shown.join(', ')} et ${rest} autre${rest > 1 ? 's' : ''}`;
  return shown.length > 1 ? `${shown.slice(0, -1).join(', ')} et ${shown.at(-1)}` : (shown[0] ?? '');
}

/** Proportions lisibles : « 16:9 », « 9:16 », « 4:1 », sinon « 2,35:1 ». */
export function ratioLabel(widthOverHeight: number): string {
  const portrait = widthOverHeight < 1;
  const r = portrait ? 1 / widthOverHeight : widthOverHeight;
  const known: [number, number][] = [[1, 1], [5, 4], [4, 3], [3, 2], [16, 10], [16, 9], [2, 1], [21, 9], [3, 1], [4, 1]];
  const near = known.find(([w, h]) => Math.abs(Math.log(r / (w / h))) < 0.02);
  if (near) return portrait ? `${near[1]}:${near[0]}` : `${near[0]}:${near[1]}`;
  const value = r.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
  return portrait ? `1:${value}` : `${value}:1`;
}

const ROLE_LABELS: Record<RoleId, string> = { playfield: 'le plateau', backglass: 'le fronton', dmd: 'le DMD', topper: 'le topper' };

const MEDIA_ERROR_LABELS: Record<MediaErrorKind, string> = {
  decode: 'décodage impossible (fichier abîmé, ou codec non pris en charge)',
  unsupported: 'format ou codec refusé',
  image: 'image illisible',
  network: 'fichier illisible sur le disque (verrouillé, ou disque en erreur)',
  other: 'erreur de lecture',
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
      title: unreadable.length > 1 ? 'Médias dans un format que le menu ne lit pas' : 'Média dans un format que le menu ne lit pas',
      detail: [
        old.length
          ? `${quoteList(old.map((i) => i.name))} : ${[...new Set(old.map((i) => i.ext))].join(', ')}, ${new Set(old.map((i) => i.ext)).size > 1 ? 'anciens formats' : 'ancien format'} de PinUP Popper que le menu (Chromium) ne lit pas. Convertissez en mp4 (H.264) ou en webm, par exemple avec HandBrake.`
          : '',
        ...wrong.map((i) => `« ${i.name} » : un média « ${label(i.type!)} » se lit en ${mediaTypeInfo(i.type!).formats.join(', ')}.`),
        redundant.length ? `${quoteList(redundant.map((i) => i.name))} : une version lisible porte le même nom, c’est elle qui est montrée.` : '',
        redundant.length < unreadable.length ? 'En attendant, le menu passe au média suivant ou à son repli.' : '',
      ]
        .filter(Boolean)
        .join(' '),
      fix: redundant.length
        ? {
            label: `Mettre ${redundant.length > 1 ? `les ${redundant.length} fichiers en double` : `« ${redundant[0]!.name} »`} à la corbeille (une version lisible existe)`,
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
      title: swapped.length > 1 ? 'Afficheurs rangés sous le mauvais type' : 'Afficheur rangé sous le mauvais type',
      detail: [
        ...swapped.map(
          (s) =>
            `« ${s.item.name} » est en ${ratioLabel(s.ratio)} : c’est un média « ${label(s.actual)} » (${s.actual}), pas « ${label(s.item.type!)} ».${s.to ? '' : ` Un fichier (${s.actual}) de ce nom existe déjà : gardez l’un des deux.`}`,
        ),
        'Le menu montre le DMD 4:1 sur un écran proche du 4:1, et le FullDMD 16:9 sur un écran large.',
      ].join(' '),
      fix: fixable.length
        ? {
            label: fixable.length > 1 ? `Renommer les ${fixable.length} fichiers selon leurs proportions` : `Renommer en « ${path.basename(fixable[0]!.to!)} »`,
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
      title: misnamed.length + typeless.length > 1 ? 'Médias mal nommés' : 'Média mal nommé',
      detail: [
        misnamed.length
          ? `Le menu cherche les médias sous le nom du .vpx (« ${own[0]} »)${own[1] ? ` ou du dossier (« ${own[1]} »)` : ''} : ${quoteList(misnamed.map((i) => i.name))} ${misnamed.length > 1 ? 'ne sont pas montrés' : 'n’est pas montré'}.`
          : '',
        ...kept.map((k) => `« ${k.item.name} » : « ${k.shown.name} » porte déjà le bon nom et c’est lui qui est montré ; gardez l’un des deux.`),
        blocked.length ? `${quoteList(blocked.map((i) => i.name))} : le nom attendu est déjà pris dans medias\\.` : '',
        typeless.length
          ? `${quoteList(typeless.map((i) => i.name))} : type inconnu. Le nom doit commencer par le type entre parenthèses, « (Backglass) ${folderName}.mp4 » par exemple.`
          : '',
      ]
        .filter(Boolean)
        .join(' '),
      fix: renames.length
        ? {
            label: renames.length > 1 ? `Renommer les ${renames.length} fichiers « (Type) ${folderName} »` : `Renommer en « ${path.basename(renames[0]!.to)} »`,
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
      title: strays.length > 1 ? 'Médias rangés hors de medias\\' : 'Média rangé hors de medias\\',
      detail: [
        `Le menu ne cherche les médias que dans medias\\, sous le nom « (Type) ${folderName} » : ${quoteList(strays.map(rel))} ${strays.length > 1 ? 'ne sont pas montrés' : 'n’est pas montré'} (rangement de PinUP Popper ou de PinballX, ou fichier posé à côté de la table).`,
        ...left.map((l) =>
          l.shown
            ? `« ${rel(l.s)} » : medias\\ montre déjà « ${l.shown} » ; gardez l’un des deux, rien n’est déplacé.`
            : `« ${rel(l.s)} » : le nom attendu est déjà pris dans medias\\, il n’est pas déplacé.`,
        ),
      ]
        .filter(Boolean)
        .join(' '),
      fix: moved.length
        ? { label: `Ranger ${moved.length > 1 ? `les ${moved.length} médias` : 'le média'} dans medias\\ sous le nom « (Type) ${folderName} »`, ops }
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
            ? ' Presque carré : le menu ne peut pas savoir où sont les flippers, il le montre tel quel.'
            : d.width > d.height
              ? ' En paysage, les flippers sont supposés à droite : le menu le tourne ; s’il apparaît à l’envers, « Demi-tour » dans les médias de la table.'
              : '';
        lines.push(`« ${item.name} » (${size}, ${ratioLabel(rm)}) sur le plateau (${ratioLabel(rs)}) : le menu le recadre, ${lost} % de l’image coupés.${orientation}`);
        return true;
      }
      const am = d.width / d.height;
      if (Math.abs(Math.log(am / screen)) <= tolerance) return true;
      const lost = Math.round((1 - Math.min(am, screen) / Math.max(am, screen)) * 100);
      const turned = am > 1.1 !== screen > 1.1 && Math.abs(Math.log(am)) > 0.1 && Math.abs(Math.log(screen)) > 0.1;
      const how = turned ? (am < 1 ? 'en portrait sur un écran en paysage' : 'en paysage sur un écran en portrait') : am > screen ? 'bandes noires en haut et en bas' : 'bandes noires sur les côtés';
      lines.push(`« ${item.name} » (${size}, ${ratioLabel(am)}) sur ${ROLE_LABELS[role]} (${ratioLabel(screen)})${note} : ${how}, ${lost} % de l’écran inutilisé.`);
      return true;
    };
    check('Playfield', 'playfield');
    check('Loading', 'playfield');
    check('Backglass', 'backglass');
    check('Topper', 'topper');
    if (aspects.dmd) {
      const wanted = dmdTypeForRatio(ctx.cabinet?.dmdRatio ?? Math.max(aspects.dmd, 1 / aspects.dmd));
      const partner: MediaType = wanted === 'DMD' ? 'FullDMD' : 'DMD';
      if (!check(wanted, 'dmd')) check(partner, 'dmd', `, faute de média « ${label(wanted)} » (${wanted})`);
    }
    if (lines.length) {
      findings.push({
        code: 'mediaRatio',
        severity: 'info',
        title: lines.length > 1 ? 'Proportions des médias différentes de leurs écrans' : 'Proportions du média différentes de son écran',
        detail: `${lines.join(' ')} Le menu ne déforme jamais un média ; un fichier aux proportions de l’écran l’occupe en entier.`,
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
      const kindLabel = { image: 'image', video: 'vidéo', audio: 'son' }[kind];
      heavy.push(`« ${item.name} » : ${formatSize(size)} (${kindLabel}, seuil ${formatSize(MEDIA_SIZE_LIMITS[kind])}).`);
    } else if (d && d.width * d.height > MEDIA_MAX_PIXELS) {
      heavy.push(`« ${item.name} » : ${d.width} × ${d.height} pixels, ${formatSize(d.width * d.height * 4)} une fois décodée en mémoire.`);
    }
  }
  if (heavy.length) {
    findings.push({
      code: 'mediaHuge',
      severity: 'info',
      title: heavy.length > 1 ? 'Médias très lourds' : 'Média très lourd',
      detail: `${heavy.join(' ')} Le menu relit ${heavy.length > 1 ? 'ces fichiers' : 'ce fichier'} à chaque passage sur la table, ce qui ralentit la navigation : une vidéo en 1080p ou en 4K (réencodée avec HandBrake, par exemple), une image en 4K au plus et un son en mp3 ou en ogg suffisent.`,
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
        `${info.label} : ${quoteList(shown.map((s) => s.name))} ${shown.length > 1 ? 'sont montrés' : 'est montré'}`,
        sameKind.length ? `, ${quoteList(sameKind.map((u) => u.name))} ne ${sameKind.length > 1 ? 'servent' : 'sert'} pas` : '',
        other.length ? ` ; ${quoteList(other.map((u) => u.name))} : le menu prend la vidéo quand il y en a une` : '',
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
      title: 'Médias en double',
      detail: duplicateLines.join(' '),
      fix: duplicateOps.length
        ? {
            label: `Mettre ${duplicateOps.length > 1 ? `les ${duplicateOps.length} fichiers jamais montrés` : 'le fichier jamais montré'} à la corbeille (libère ${formatSize(size)})`,
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
    const date = (iso: string) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
    findings.push({
      code: 'mediaPlaybackError',
      severity: 'warning',
      title: errors.length > 1 ? 'Médias que le menu n’a pas pu lire' : 'Média que le menu n’a pas pu lire',
      detail: [
        ...errors.map(
          (e) =>
            `« ${path.relative(folder, e.file)} » : ${MEDIA_ERROR_LABELS[e.kind]}, ${e.count > 1 ? `${e.count} fois, la dernière le` : 'le'} ${date(e.last)}${e.message ? ` (${e.message})` : ''}.`,
        ),
        'Le menu passe alors au média suivant, ou à son repli. Remplacez le fichier par un mp4 (H.264) ou un webm, ou réencodez-le.',
      ].join(' '),
      fix: broken.length
        ? {
            label: `Mettre ${broken.length > 1 ? `les ${broken.length} fichiers illisibles` : `« ${path.basename(broken[0]!.file)} »`} à la corbeille`,
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
function checkRom(folder: string, roms: string[], library?: string): Finding[] {
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
      title: `Alias inutile : ${r} est là, mais ${line.rom} est chargée`,
      detail: `pinmame\\alias.txt fait charger ${line.rom} quand le script demande ${r} ; PinMAME lit l’alias avant la ROM, si bien que ${r}.zip, maintenant dans pinmame\\roms, ne sert pas.`,
      fix: { label: `Revenir à la ROM demandée (retirer la ligne « ${line.alias},${line.rom} »)`, ops: [writeAliases(withoutAlias(aliasText, line.alias))] },
    });
  }

  const found = roms.map(here).find(Boolean);
  if (found) return [...findings, ...(library ? checkRomCopy(path.join(romsDir, found), library) : [])];
  const rom = roms[0]!;

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
          title: `Révision voisine : ${alias.rom} au lieu de ${alias.alias}`,
          detail: `pinmame\\alias.txt fait charger ${alias.rom}, la table demande ${alias.alias}. ${NEIGHBOUR_WARNING} Quand ${alias.alias}.zip arrivera, le médecin proposera de retirer l’alias.`,
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
            title: `ROM « ${alias.rom} » pas liée dans la table`,
            detail: `pinmame\\alias.txt fait charger ${alias.rom} pour ${alias.alias} ; elle est dans la bibliothèque, mais pas dans pinmame\\roms.`,
            fix: { label: 'Lier la ROM de la bibliothèque dans pinmame\\roms', ops },
          }
        : {
            code: 'romMissing',
            severity: 'error',
            title: `ROM « ${alias.rom} » absente`,
            detail: `pinmame\\alias.txt fait charger ${alias.rom} quand le script demande ${alias.alias}, mais ${alias.rom}.zip n’est nulle part. Ajoutez-la (dossier d’import, puis « Ajouter une table »), ou retirez l’alias.`,
            fix: { label: `Retirer l’alias « ${alias.alias},${alias.rom} »`, ops: [writeAliases(withoutAlias(aliasText, alias.alias))] },
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
      title: `« ${asked} » : ancien nom de la ROM ${real}`,
      detail: `Le script demande ${asked}, que VPinMAME traduisait de lui-même en ${real} ; le plugin PinMAME de VPX 10.8.1 ne connaît plus ces anciens noms : sans alias, la table ne démarre pas.${available ? '' : ` Il faut aussi ${real}.zip : ajoutez-la (dossier d’import, puis « Ajouter une table »).`}`,
      fix: available
        ? { label: `Écrire l’alias « ${asked},${real} » dans pinmame\\alias.txt`, ops: [...linkOp(real), { op: 'write', path: aliasFile, content: withAlias(aliasText, asked, real, `ancien nom de VPinMAME (release/VPMAlias.txt)`) }] }
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
      title: dirExists ? `ROM « ${name.replace(/.zip$/i, '')} » absente de pinmame\\roms` : `ROM « ${name.replace(/.zip$/i, '')} » pas liée dans la table`,
      detail: dirExists
        ? `Elle est dans la bibliothèque de ROM (${path.dirname(stored.path)}), mais la table a son propre dossier pinmame\\roms, sans elle : PinMAME ne cherche alors que là, jamais dans son dossier commun. La table ne démarre pas.`
        : `Elle est dans la bibliothèque de ROM (${path.dirname(stored.path)}) : la table la trouve par le dossier commun de PinMAME. Un lien dans pinmame\\roms la rend autonome (copie de la table, autre configuration).`,
      fix: {
        label: copy ? `Copier la ROM dans pinmame\\roms (${formatSize(stored.size)}, la table est sur un autre disque)` : 'Lier la ROM de la bibliothèque dans pinmame\\roms (aucune place en plus)',
        ops: [{ op: 'link', from: stored.path, to: path.join(romsDir, name) }],
      },
    });
    return findings;
  }
  // La ROM est peut-être dans le dossier, mais pas au bon endroit.
  const stray = findFile(folder, roms.map((r) => `${r.toLowerCase()}.zip`), romsDir);
  if (stray) {
    findings.push({
      code: 'romMisplaced',
      severity: 'error',
      title: 'ROM mal rangée',
      detail: `PinMAME cherche la ROM dans pinmame\\roms ; « ${path.relative(folder, stray)} » n’y est pas.`,
      fix: { label: 'Ranger la ROM dans pinmame\\roms', ops: [{ op: 'move', from: stray, to: path.join(romsDir, path.basename(stray)) }] },
    });
    return findings;
  }
  // Une révision voisine est sur la borne : sur demande, un alias la fait charger.
  const libraryNames = library ? [...listRoms(library).keys()] : [];
  const neighbour = neighbourRom(rom, [...files, ...libraryNames]);
  if (neighbour) {
    const where = here(neighbour) ? 'dans pinmame\\roms de la table' : 'dans la bibliothèque de ROM';
    findings.push({
      code: 'romAlias',
      severity: 'error',
      title: `ROM « ${rom} » absente, révision voisine ${neighbour} sur la borne`,
      detail: `La table ne démarrera pas sans ${rom}.zip. ${neighbour}.zip, du même jeu, est ${where} : un alias peut la faire charger à sa place. ${NEIGHBOUR_WARNING}`,
      fix: {
        label: `Jouer avec ${neighbour} (alias « ${rom},${neighbour} » dans pinmame\\alias.txt)`,
        ops: [...linkOp(neighbour), { op: 'write', path: aliasFile, content: withAlias(aliasText, rom, neighbour, `révision voisine choisie le ${new Date().toLocaleDateString('fr-FR')}`) }],
      },
    });
    return findings;
  }
  const others = roms.length > 1 ? ` (ou ${roms.slice(1).map((r) => `${r}.zip`).join(', ')})` : '';
  findings.push({
    code: 'romMissing',
    severity: 'error',
    title: `ROM « ${rom} » absente`,
    detail: `La table ne démarrera pas sans ${rom}.zip${others}. Mettez le fichier dans le dossier d’import (ou glissez-le sur cette fenêtre) puis « Ajouter une table » : il sera rangé dans la bibliothèque de ROM et lié dans pinmame\\roms. Pour la trouver : menu système > « Trouver une table ».${dirExists && !files.length ? ' Le dossier pinmame\\roms de la table est vide : tant qu’il existe, PinMAME ne cherche pas ailleurs.' : ''}`,
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
  const date = (ms: number) => new Date(ms).toLocaleDateString('fr-FR', { dateStyle: 'long' });
  return [
    identical
      ? {
          code: 'romCopy',
          severity: 'info',
          title: 'Copie de ROM au lieu d’un lien',
          detail: `pinmame\\roms\\${name} est une copie de la ROM de la bibliothèque : ${formatSize(own.size)} de trop sur le disque.`,
          fix: { label: `Remplacer la copie par un lien vers la bibliothèque (libère ${formatSize(own.size)})`, ops: [{ op: 'link', from: stored.path, to: file }] },
        }
      : {
          code: 'romCopy',
          severity: 'warning',
          title: 'Autre version de la ROM que celle de la bibliothèque',
          detail: `pinmame\\roms\\${name} (${formatSize(own.size)}, ${date(own.mtimeMs)}) n’a pas le même contenu que celle de la bibliothèque (${formatSize(stored.size)}, ${date(stored.mtimeMs)}). Pour garder plutôt celle de la table, « Ranger les ROM » dans le menu laisse choisir.`,
          fix: { label: 'Utiliser la ROM de la bibliothèque (celle de la table va à la corbeille)', ops: [{ op: 'link', from: stored.path, to: file }] },
        },
  ];
}

function checkDmdFolder(folder: string, dmdFolder: string): Finding | undefined {
  const dirs = readDirents(folder).filter((d) => d.isDirectory()).map((d) => d.name);
  if (dirs.some((d) => d.toLowerCase() === dmdFolder.toLowerCase())) return undefined;
  const intro =
    `Le DMD de cette table est dessiné par son script, avec les images, vidéos et polices du dossier « ${dmdFolder} ». ` +
    'Sans lui, le script s’arrête au démarrage (« Type incompatible ») : la table s’affiche, mais la partie ne commence pas. ';
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
      severity: 'error',
      title: `Dossier « ${dmdFolder} » absent, son contenu est en vrac`,
      detail: `${intro}${loose.length} image${loose.length > 1 ? 's' : ''} ou police${loose.length > 1 ? 's' : ''} du DMD sont à la racine du dossier de la table.`,
      fix: {
        label: `Ranger ${loose.length > 1 ? `ces ${loose.length} fichiers` : 'ce fichier'} dans « ${dmdFolder} »`,
        ops: loose.map((f) => ({ op: 'move', from: path.join(folder, f), to: path.join(folder, dmdFolder, f) })),
      },
    };
  }
  return {
    code: 'dmdFolderMissing',
    severity: 'error',
    title: `Dossier « ${dmdFolder} » absent`,
    detail: `${intro}Ce dossier est fourni avec la table d’origine ; mettez-le dans le dossier d’import puis « Ajouter une table ».`,
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
