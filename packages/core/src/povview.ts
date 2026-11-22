// Fichiers POV (21/11/2026) : le point de vue d'une table, préparé et partagé par la communauté (base VPS : 766 jeux
// en ont, surtout les « 10.8 Cabinet POV » de RajoJoey ; VPUniverse). Deux formes :
// - .pov : XML de VPX 10.7 (racine <POV>, sections desktop / fullscreen / fullsinglescreen) ;
// - .ini : « Save as Table Override » de VPX 10.8, [TableOverride] ViewCab…
// VPX 10.8.1 ne lit un .pov que si la table n'a pas encore de .ini (PinTable::LoadGameFromFilename), et le cadrage
// automatique que Cyber Pinball impose pour le sens des tables recalcule la vue : un POV n'avait donc aucun effet. Ici,
// la vue borne du POV est reportée dans le .ini de la table, en cadrage manuel pour elle seule, si le sens de la partie
// reste le bon sur cette borne (vpxPlayedFlipperEdge). Appliqué d'office avant la partie tant que rien n'a été choisi
// pour la table ; sinon proposé dans le diagnostic.

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Finding } from './doctor';
import type { FileOp } from './fileops';
import { EDGE_LABELS } from './layout';
import { t } from './i18n';
import { IniDocument } from './ini';
import type { PlayfieldOrientation } from './sync';
import { isPovIniName } from './tablefiles';
import { hasOwnCabinetView } from './tableview';
import { vpxPlayedFlipperEdge } from './vpx';
import { findTableIni } from './vpx-settings';

/** Champs d'une section du .pov et le réglage ViewCab… où VPX les range (PinTable::ImportBackdropPOV, au commit af26b2d93). */
const POV_FIELDS: Record<string, string> = {
  inclination: 'LookAt',
  fov: 'FOV',
  layback: 'Layback',
  lookat: 'LookAt',
  rotation: 'Rotation',
  xscale: 'ScaleX',
  yscale: 'ScaleY',
  zscale: 'ScaleZ',
  xoffset: 'PlayerX',
  yoffset: 'PlayerY',
  zoffset: 'PlayerZ',
  viewhofs: 'HOfs',
  viewvofs: 'VOfs',
  windowtopzofs: 'WindowTop',
  windowbottomzofs: 'WindowBot',
  layoutmode: 'Mode',
};

/** Réglages de la vue borne que VPX lit dans [TableOverride]. */
const CAB_KEY = /^ViewCab(Mode|ScaleX|ScaleY|ScaleZ|PlayerX|PlayerY|PlayerZ|LookAt|Rotation|FOV|Layback|HOfs|VOfs|WindowTop|WindowBot)$/i;

export interface PovView {
  /** Fichier du POV, dans le dossier de la table. */
  file: string;
  /** Vue borne : [TableOverride] ViewCab<champ> = valeur, dans l'ordre de VPX. */
  values: { key: string; value: string }[];
}

/** Vue borne d'un .pov (XML) : la section fullscreen, comme VPX l'importe. */
export function parsePovXml(text: string): { key: string; value: string }[] {
  const section = /<fullscreen>([\s\S]*?)<\/fullscreen>/i.exec(text)?.[1];
  if (!/<POV[\s>]/i.test(text) || !section) return [];
  const values = new Map<string, string>();
  for (const m of section.matchAll(/<(\w+)>\s*([^<]*?)\s*<\/\1>/g)) {
    const field = POV_FIELDS[m[1]!.toLowerCase()];
    const raw = m[2]!;
    if (!field || raw === '' || !Number.isFinite(Number(raw))) continue;
    values.set(`ViewCab${field}`, raw);
  }
  return [...values].map(([key, value]) => ({ key, value }));
}

/** Vue borne d'un .ini de POV ([TableOverride] ViewCab…). */
export function parsePovIni(text: string): { key: string; value: string }[] {
  const doc = IniDocument.parse(text);
  return doc
    .entries()
    .filter((e) => e.section.toLowerCase() === 'tableoverride' && CAB_KEY.test(e.key) && e.value.trim() !== '' && Number.isFinite(Number(e.value.trim())))
    .map((e) => ({ key: e.key, value: e.value.trim() }));
}

/**
 * Le POV fourni avec la table : <table>.pov, sinon le seul .pov du dossier, sinon le seul .ini de POV ; undefined
 * sans POV, ou si le fichier ne donne aucune vue borne.
 */
export function findPovView(tableFile: string): PovView | undefined {
  const folder = path.dirname(tableFile);
  const base = path.basename(tableFile, path.extname(tableFile)).toLowerCase();
  let names: string[];
  try {
    names = fs.readdirSync(folder);
  } catch {
    return undefined;
  }
  const povs = names.filter((n) => /\.pov$/i.test(n));
  const inis = names.filter((n) => isPovIniName(n) && n.toLowerCase() !== `${base}.ini`);
  // Un POV nommé autrement que la table n'est pris que dans le dossier d'une seule table.
  const alone = names.filter((n) => /\.vpx$/i.test(n)).length === 1;
  const file = povs.find((n) => n.toLowerCase() === `${base}.pov`) ?? (alone && povs.length === 1 ? povs[0] : undefined) ?? (alone && inis.length === 1 ? inis[0] : undefined);
  if (!file) return undefined;
  try {
    // lecture entière : fichier POV de quelques Ko
    const text = fs.readFileSync(path.join(folder, file), 'utf8');
    const values = /\.pov$/i.test(file) ? parsePovXml(text) : parsePovIni(text);
    return values.length ? { file: path.join(folder, file), values } : undefined;
  } catch {
    return undefined;
  }
}

/** Le .ini de la table porte déjà cette vue, en cadrage manuel. */
function applied(doc: IniDocument, view: PovView): boolean {
  if ((doc.get('Player', 'CabinetAutofitMode')?.trim() ?? '') !== '0') return false;
  return view.values.every((v) => {
    const own = Number(doc.get('TableOverride', v.key));
    return Number.isFinite(own) && Math.abs(own - Number(v.value)) < 1e-3;
  });
}

/** Le .ini de la table avec la vue du POV : ses autres ViewCab… retirés (comme « Save as Table Override »), cadrage manuel. */
function withPov(doc: IniDocument, view: PovView): IniDocument {
  const next = IniDocument.parse(doc.toString());
  for (const e of next.entries()) if (e.section.toLowerCase() === 'tableoverride' && /^ViewCab/i.test(e.key)) next.remove(e.section, e.key);
  for (const v of view.values) next.set('TableOverride', v.key, v.value);
  next.set('Player', 'CabinetAutofitMode', '0');
  return next;
}

/** Pourquoi la table, avec ce .ini, serait de travers sur cette borne ; undefined : dans le bon sens. */
function wrongWay(next: IniDocument, orientation: PlayfieldOrientation, file: string): string | undefined {
  const global = IniDocument.parse(orientation.globalIni);
  const read = (section: string, key: string) => {
    const own = next.get(section, key);
    return own !== undefined && own.trim() !== '' ? own : global.get(section, key);
  };
  const played = vpxPlayedFlipperEdge(read, orientation.window);
  if (played.edge === orientation.edge) return undefined;
  return played.edge
    ? t('{file} est le point de vue préparé pour cette table, mais VPX la dessinerait flippers {played}, alors que vous êtes {edge} de l’écran : il n’est pas appliqué, la table garde le cadrage de la borne.', {
        file,
        played: EDGE_LABELS[played.edge],
        edge: EDGE_LABELS[orientation.edge],
      })
    : t('{file} est le point de vue préparé pour cette table, mais il ne dit pas dans quel sens la tourner : il n’est pas appliqué, la table garde le cadrage de la borne.', { file });
}

const isManual = (mode: string) => mode === '0' || /^manual$/i.test(mode);

/** Ce qui cadre une table : le cadrage de la borne, le POV fourni avec elle, ou sa propre vue (menu de VPX, autre installation). */
export type TableFraming = 'cabinet' | 'pov' | 'own';

export interface TablePovState {
  framing: TableFraming;
  /** Le POV fourni avec la table (findPovView). */
  pov?: PovView;
  /** Pourquoi ce POV ne s'applique pas sur cette borne (de travers, ou sens invérifiable). */
  refused?: string;
  /** Écritures qui appliquent le POV ; absentes s'il est déjà appliqué ou refusé. */
  applyOps?: FileOp[];
  /** Écritures qui rendent le cadrage de la borne à la table ; absentes si c'est déjà le cas. */
  cabinetOps?: FileOp[];
}

/**
 * Le cadrage de la table et ce que la fiche peut en faire (« Point de vue », bêta). Un POV pas encore appliqué alors que
 * rien n'est choisi pour la table l'est avant la partie (povView) : c'est donc lui qui la cadre.
 */
export function tablePovState(tableFile: string, orientation?: PlayfieldOrientation): TablePovState {
  const ini = findTableIni(tableFile);
  const doc = IniDocument.parse(ini.exists ? fs.readFileSync(ini.path, 'utf8') : '');
  const pov = findPovView(tableFile);
  const mode = doc.get('Player', 'CabinetAutofitMode')?.trim() ?? '';
  const next = pov && withPov(doc, pov);
  const refused = pov && (orientation ? wrongWay(next!, orientation, path.basename(pov.file)) : t('Le sens de la borne n’est pas connu : relancez l’assistant d’écrans pour appliquer un point de vue.'));
  const done = pov !== undefined && applied(doc, pov);
  const framing: TableFraming = isManual(mode)
    ? done
      ? 'pov'
      : 'own'
    : mode === ''
      ? hasOwnCabinetView(doc)
        ? 'own'
        : pov && !refused
          ? 'pov'
          : 'cabinet'
      : 'cabinet';
  // Retour au cadrage de la borne : la clé est écrite (sans elle, un POV ou une vue reprise reviendrait à la partie suivante),
  // avec le mode de la borne quand il est automatique.
  const globalMode = orientation ? (IniDocument.parse(orientation.globalIni).get('Player', 'CabinetAutofitMode')?.trim() ?? '') : '';
  const back = IniDocument.parse(doc.toString());
  back.set('Player', 'CabinetAutofitMode', globalMode === '2' ? '2' : '1');
  return {
    framing,
    ...(pov ? { pov } : {}),
    ...(refused ? { refused } : {}),
    ...(pov && !refused && !done ? { applyOps: [{ op: 'write' as const, path: ini.path, content: next!.toString() }] } : {}),
    ...(framing !== 'cabinet' ? { cabinetOps: [{ op: 'write' as const, path: ini.path, content: back.toString() }] } : {}),
  };
}

/**
 * Importer un POV choisi par le joueur (« Point de vue » > « Importer un POV… ») : il est rangé avec la table, sous un
 * nom de POV (« <table>.pov », ou « <table> POV.ini »), à la place de ses autres POV (à la corbeille) ; jamais à la
 * place du .ini de la table. Refusé s'il ne donne aucune vue borne.
 */
export function importPovOps(tableFile: string, source: string): { ops: FileOp[] } | { error: string } {
  const name = path.basename(source);
  const ext = path.extname(name).toLowerCase();
  if (ext !== '.pov' && ext !== '.ini') return { error: t('« {name} » n’est pas un fichier de point de vue (.pov ou .ini).', { name }) };
  let text: string;
  try {
    // lecture entière : fichier POV de quelques Ko
    text = fs.readFileSync(source, 'utf8');
  } catch (err) {
    return { error: t('« {name} » illisible : {error}', { name, error: (err as Error).message }) };
  }
  if (!(ext === '.pov' ? parsePovXml(text) : parsePovIni(text)).length) {
    return { error: t('« {name} » ne contient pas de point de vue de borne (section fullscreen d’un .pov, ou [TableOverride] ViewCab… d’un .ini).', { name }) };
  }
  const folder = path.dirname(tableFile);
  const base = path.basename(tableFile, path.extname(tableFile));
  const dest = path.join(folder, ext === '.pov' ? `${base}.pov` : `${base} POV.ini`);
  let names: string[] = [];
  try {
    names = fs.readdirSync(folder);
  } catch {
    // dossier illisible : seule l'écriture du POV sera tentée
  }
  const alone = names.filter((n) => /\.vpx$/i.test(n)).length === 1;
  const others = names.filter((n) => {
    const own = n.toLowerCase() === `${base.toLowerCase()}.pov` || n.toLowerCase() === `${base.toLowerCase()} pov.ini`;
    const pov = /\.pov$/i.test(n) || (isPovIniName(n) && n.toLowerCase() !== `${base.toLowerCase()}.ini`);
    return (own || (alone && pov)) && path.join(folder, n).toLowerCase() !== dest.toLowerCase();
  });
  return { ops: [...others.map((n) => ({ op: 'trash' as const, path: path.join(folder, n) })), { op: 'write' as const, path: dest, content: text }] };
}

/**
 * Constat du POV fourni avec la table :
 * - povView : rien n'est choisi pour la table (ni cadrage, ni vue propre) : sa vue est reportée dans le .ini de la table,
 *   d'office avant la partie (PUP_PLAY_REPAIRS) ;
 * - povOffered : la table suit le cadrage de la borne ou sa propre vue, choisis : le POV est seulement proposé ;
 * - povWrongWay : avec ce POV, VPX dessinerait la table de travers sur cette borne (ou son sens ne se vérifie pas) : écarté.
 * Sans `orientation` (borne pas décrite), le sens n'est pas vérifié : le constat n'est jamais appliqué d'office.
 */
export function povViewFinding(tableFile: string, orientation?: PlayfieldOrientation): Finding | undefined {
  const view = findPovView(tableFile);
  if (!view) return undefined;
  const ini = findTableIni(tableFile);
  const doc = IniDocument.parse(ini.exists ? fs.readFileSync(ini.path, 'utf8') : '');
  if (applied(doc, view)) return undefined;
  const file = path.basename(view.file);
  const next = withPov(doc, view);
  const refused = orientation && wrongWay(next, orientation, file);
  if (refused) return { code: 'povWrongWay', severity: 'info', title: t('Point de vue fourni pour un autre écran (bêta)'), detail: refused };
  const chosen = (doc.get('Player', 'CabinetAutofitMode')?.trim() ?? '') !== '' || hasOwnCabinetView(doc);
  const fix = { label: t('Appliquer le point de vue « {file} »', { file }), ops: [{ op: 'write' as const, path: ini.path, content: next.toString() }] };
  return chosen
    ? {
        code: 'povOffered',
        severity: 'info',
        title: t('Point de vue fourni avec la table (bêta)'),
        detail: t('{file} est le point de vue préparé pour cette table (fichier POV). Il n’est pas appliqué : un cadrage a été choisi pour elle. Appliqué, il la cadre pour elle seule, en cadrage manuel.', { file }),
        fix,
      }
    : {
        code: 'povView',
        severity: 'info',
        title: t('Point de vue fourni avec la table (bêta)'),
        detail: t(
          '{file} est le point de vue préparé pour cette table (fichier POV), que VPX n’applique pas tel quel. Il est repris pour cette table seule, en cadrage manuel ; « Passer cette table au cadrage automatique » rend ensuite le cadrage de la borne.',
          { file },
        ),
        fix,
      };
}
