// Cadrage d'une table reprise d'une autre installation : exactement celui d'avant (23/11/2026).
//
// Retours des joueurs venus de PinUP Popper, PinballY ou d'un dossier de VPX : une table reprise ne se cadrait plus
// comme avant. Cyber Pinball la joue avec son VPX et son VPinballX.ini, en cadrage automatique « Ajuster » qui garde le
// haut de la table (sync.ts, VPX_KEEP_TOP_FRAMING) ; le VPinballX.ini de l'installation d'origine (le registre avant
// VPX 10.8) n'était jamais lu. Son mode (Manuel, Ajuster, Remplir), la taille de son écran et la place du joueur étaient
// perdus, et un POV posé à côté de la table, que le VPX d'origine ignorait en cadrage automatique, était appliqué
// (povview.ts), ou une vue du .ini qu'il ignorait reprise (tableview.ts).
//
// À l'ajout, le cadrage que le VPX d'origine appliquait à la table est recalculé d'après ses propres réglages et figé
// dans le .ini de la copie, jamais dans l'installation d'origine : le mode de cadrage, les mesures de l'écran et du
// joueur qui diffèrent de celles de la borne, « garder le haut » coupé (le VPX d'origine ne l'a pas), et en cadrage
// manuel la vue que ce VPX lisait (le .ini de la table, sinon son <table>.pov). Noté dans le .info
// (CyberPinball.framing) : les réparations automatiques et l'écran « Point de vue » le respectent.

import { t } from './i18n';
import { IniDocument } from './ini';
import type { PlayfieldOrientation } from './sync';
import { isVpxAutofit, isVpxCabinetView, vpxAutofitMode, vpxPlayedFlipperEdge } from './vpx';
import { touchesCabinetView } from './tableview';

/**
 * Mesures de l'écran et du joueur qui changent le cadrage, avec leur valeur par défaut dans VPX 10.8.1
 * (Settings_properties.inl) : VPX prend celle-ci quand la clé manque.
 */
export const VPX_FRAMING_DEFAULTS: Readonly<Record<string, string>> = {
  ScreenWidth: '95.89',
  ScreenHeight: '53.94',
  ScreenInclination: '0',
  ScreenPlayerX: '0',
  ScreenPlayerY: '-10',
  ScreenPlayerZ: '70',
  CabinetAutofitPos: '0.05',
};

/** Le VPX d'origine d'une table et ses réglages. */
export interface OriginVpx {
  exe: string;
  /** Version de son exécutable (« 10.8.0.1234 ») ; undefined : illisible. */
  version?: string;
  /** Fichier lu (VPinballX.ini), ou clé du registre ; undefined : aucun réglage trouvé (VPX prend ses valeurs par défaut). */
  source?: string;
  /** Ses réglages, au format INI (ceux du registre y sont recopiés sous [Player]). */
  ini: string;
}

/** Ce que Cyber Pinball note dans le .info d'une table dont le cadrage d'origine est figé. */
export interface OriginFramingNote {
  /** « VPX 10.8.0 · C:\vPinball\VisualPinball » : d'où vient ce cadrage. */
  from: string;
  /** Mode figé : cadrage automatique de VPX (Ajuster, Remplir) ou manuel (la vue de la table). */
  mode: 'auto' | 'manual';
  /** Forme de la fenêtre du playfield quand le cadrage a été figé : un cadrage manuel ne vaut que pour elle. */
  shape: 'portrait' | 'landscape';
  /** Clés [Player] posées dans le .ini de la table, retirées au retour au cadrage de la borne. */
  keys: string[];
}

export interface OriginFramingPlan {
  /** Le .ini de la table avec le cadrage d'origine ; undefined : rien à écrire (pas de .ini, ou déjà ce texte). */
  ini?: string;
  note?: OriginFramingNote;
  /** Pourquoi ce cadrage n'est pas repris : la table garde le cadrage de la borne. */
  refused?: string;
  /** Pour le journal. */
  summary: string;
}

/** VPX 10.8.1 et suivants : cadrage automatique ([Player] CabinetAutofitMode) et réglages dans un .ini par version. */
export function vpxHasAutofit(version: string | undefined): boolean {
  const [major = 0, minor = 0, patch = 0] = (version ?? '').split(/[.-]/).map((n) => Number(n) || 0);
  return major > 10 || (major === 10 && (minor > 8 || (minor === 8 && patch >= 1)));
}

/** VPX 10.8.0 et suivants : réglages dans un VPinballX.ini ; avant, dans le registre (HKCU\Software\Visual Pinball\VP10). */
export function vpxUsesIni(version: string | undefined): boolean {
  const [major = 0, minor = 0] = (version ?? '').split(/[.-]/).map((n) => Number(n) || 0);
  return major > 10 || (major === 10 && minor >= 8);
}

/**
 * Où ce VPX lit ses réglages, dans l'ordre (FileLocator.cpp) : 10.8.1 et suivants, le VPinballX.ini posé à côté de
 * l'exécutable s'il est de cette version (disposition « à l'ancienne »), sinon %APPDATA%\VPinballX\<majeure.mineure> ;
 * 10.8.0, %APPDATA%\VPinballX ; à défaut, celui posé à côté de l'exécutable.
 */
export function originIniCandidates(exe: string, version: string | undefined, appData: string | undefined, join: (...parts: string[]) => string, dirname: (p: string) => string): string[] {
  const besideExe = join(dirname(exe), 'VPinballX.ini');
  const base = appData ? join(appData, 'VPinballX') : undefined;
  if (vpxHasAutofit(version)) {
    const minor = (version ?? '').split(/[.-]/).slice(0, 2).join('.');
    return [besideExe, ...(base ? [join(base, minor, 'VPinballX.ini')] : [])];
  }
  return [...(base ? [join(base, 'VPinballX.ini')] : []), besideExe];
}

/** Le VPinballX.ini posé à côté de l'exécutable est-il de cette version ([Version] VPinball = « 10 8 … ») ? */
export function iniMatchesVersion(ini: string, version: string | undefined): boolean {
  const own = IniDocument.parse(ini).get('Version', 'VPinball')?.trim().split(/\s+/);
  const wanted = (version ?? '').split(/[.-]/);
  return Boolean(own && own.length >= 2 && own[0] === wanted[0] && own[1] === wanted[1]);
}

/** Les valeurs de « reg query HKCU\Software\Visual Pinball\VP10\Player », au format INI sous [Player]. */
export function registryPlayerIni(output: string): string {
  const lines = ['[Player]'];
  for (const m of output.matchAll(/^\s+(\S+)\s+(REG_SZ|REG_DWORD|REG_QWORD)\s+(.*?)\s*$/gm)) {
    const [, key, type, raw] = m;
    lines.push(`${key} = ${type === 'REG_SZ' ? raw : String(Number(raw))}`);
  }
  return lines.join('\n') + '\n';
}

const sameNumber = (a: string, b: string) => {
  const x = Number(a);
  const y = Number(b);
  return Number.isFinite(x) && Number.isFinite(y) ? Math.abs(x - y) < 1e-4 : a.trim() === b.trim();
};

/** Forme de la fenêtre du playfield d'après les réglages de VPX ; undefined : taille non écrite (celle de l'écran). */
function iniShape(doc: IniDocument): OriginFramingNote['shape'] | undefined {
  for (const [w, h] of [['PlayfieldWidth', 'PlayfieldHeight'], ['Width', 'Height']] as const) {
    const width = Number(doc.get('Player', w));
    const height = Number(doc.get('Player', h));
    if (width > 0 && height > 0) return width < height ? 'portrait' : 'landscape';
  }
  return undefined;
}

/**
 * Le cadrage que le VPX d'origine appliquait à la table, à figer dans le .ini de sa copie.
 * - `tableIni` : le .ini de la table tel que le VPX d'origine le lisait (undefined : pas de .ini) ;
 * - `pov` : la vue de son <table>.pov (le seul que VPX charge de lui-même), undefined sans ;
 * - `orientation` : le playfield de la borne et son VPinballX.ini.
 * Refusé quand la vue n'est pas du même genre (bureau d'un côté, borne de l'autre), ou quand un cadrage manuel
 * dessinerait la table de travers sur la fenêtre d'aujourd'hui.
 */
export function planOriginFraming(o: { origin: OriginVpx; tableIni: string | undefined; pov: { key: string; value: string }[] | undefined; orientation: PlayfieldOrientation }): OriginFramingPlan {
  const { origin, orientation } = o;
  const global = IniDocument.parse(origin.ini);
  const table = IniDocument.parse(o.tableIni ?? '');
  const borne = IniDocument.parse(orientation.globalIni);
  const own = (key: string) => table.get('Player', key)?.trim() || undefined;
  const originValue = (key: string) => own(key) ?? (global.get('Player', key)?.trim() || undefined);
  const label = `VPX ${origin.version ?? '?'}`;
  const window = orientation.window.bounds;
  const shape: OriginFramingNote['shape'] = window.width < window.height ? 'portrait' : 'landscape';

  const originCabinet = isVpxCabinetView(originValue('BGSet'));
  const borneCabinet = isVpxCabinetView(own('BGSet') ?? borne.get('Player', 'BGSet'));
  if (!originCabinet && !borneCabinet) return { summary: `${label} : vue bureau, comme sur cette borne ; rien à figer` }; // i18n-ignore : journal
  if (originCabinet !== borneCabinet) {
    return {
      refused: originCabinet
        ? t('Dans son installation d’origine ({from}), cette table se jouait en vue borne ; ici, la vue est celle d’un bureau : son cadrage d’alors ne s’applique pas.', { from: label })
        : t('Dans son installation d’origine ({from}), cette table se jouait en vue bureau ; ici, la vue est celle d’une borne : son cadrage d’alors ne s’applique pas.', { from: label }),
      summary: `${label} : vue ${originCabinet ? 'borne' : 'bureau'} à l'origine, pas ici ; non figé`, // i18n-ignore : journal
    };
  }

  const modern = vpxHasAutofit(origin.version);
  const mode = modern ? vpxAutofitMode(originValue('CabinetAutofitMode')) : 0;
  const next = IniDocument.parse(o.tableIni ?? '');
  const keys: string[] = [];
  const put = (key: string, value: string) => {
    if (next.get('Player', key)?.trim() !== value) next.set('Player', key, value);
    keys.push(key);
  };

  if (mode === 0 && o.pov?.length) {
    // La vue que le VPX d'origine lisait : 10.8.1 ne charge le .pov qu'à défaut de .ini ; 10.8.0 et avant, qu'à défaut
    // de vue dans le .ini (« ne serait-ce qu'une rotation », vpx-launch-compat.ts).
    const fromPov = modern ? o.tableIni === undefined : !touchesCabinetView(table);
    if (fromPov) {
      for (const e of next.entries()) if (e.section.toLowerCase() === 'tableoverride' && /^ViewCab/i.test(e.key)) next.remove(e.section, e.key);
      for (const v of o.pov) next.set('TableOverride', v.key, v.value);
    }
  }
  // Le mode est écrit même quand la table le portait déjà : c'est lui que le retour au cadrage de la borne remplace.
  put('CabinetAutofitMode', String(mode));
  // « Garder le haut » (VPX corrigé de Cyber Pinball) : absent du VPX d'origine.
  if (isVpxAutofit(String(mode))) put('CabinetAutofitKeepTop', '0');
  for (const [key, fallback] of Object.entries(VPX_FRAMING_DEFAULTS)) {
    if (own(key)) continue;
    const before = global.get('Player', key)?.trim() || (modern ? fallback : undefined);
    if (before === undefined) continue;
    const now = borne.get('Player', key)?.trim() || fallback;
    if (!sameNumber(before, now)) put(key, before);
  }

  if (mode === 0) {
    // Cadrage manuel : la rotation est celle de la vue de la table. Vérifiée par ce que VPX lira, sinon par la forme de
    // la fenêtre : la même qu'à l'origine, la table se dessine comme avant.
    const read = (section: string, key: string) => {
      const value = next.get(section, key);
      return value !== undefined && value.trim() !== '' ? value : borne.get(section, key);
    };
    const played = vpxPlayedFlipperEdge(read, orientation.window);
    const before = iniShape(global);
    const sameWay = played.edge === orientation.edge || (played.edge === undefined && before === shape);
    if (!sameWay) {
      return {
        refused:
          played.edge === undefined
            ? t('Dans son installation d’origine ({from}), cette table se cadrait à la main, avec la rotation choisie par son auteur ; la fenêtre du playfield n’y avait pas la même forme qu’ici, ou elle n’est pas connue : son cadrage d’alors pourrait la montrer de travers.', { from: label })
            : t('Dans son installation d’origine ({from}), cette table se cadrait à la main ; sur cette borne, sa vue la dessinerait de travers : son cadrage d’alors ne s’applique pas.', { from: label }),
        summary: `${label} : cadrage manuel, sens invérifiable ou faux sur cette borne ; non figé`, // i18n-ignore : journal
      };
    }
  }

  const text = next.toString();
  return {
    ...(text !== (o.tableIni ?? '') ? { ini: text } : {}),
    note: { from: label, mode: mode === 0 ? 'manual' : 'auto', shape, keys },
    summary: `${label} : ${mode === 0 ? 'cadrage manuel' : mode === 1 ? 'Ajuster' : 'Remplir'} figé (${keys.join(', ')})`, // i18n-ignore : journal
  };
}

/** Le cadrage d'origine noté dans le .info de la table, s'il y en a un. */
export function originFramingOf(info: { [key: string]: unknown } | undefined): OriginFramingNote | undefined {
  const own = info?.CyberPinball as { framing?: unknown } | undefined;
  const note = own?.framing as Partial<OriginFramingNote> | undefined;
  if (!note || typeof note.from !== 'string' || (note.mode !== 'auto' && note.mode !== 'manual')) return undefined;
  return { from: note.from, mode: note.mode, shape: note.shape === 'portrait' ? 'portrait' : 'landscape', keys: Array.isArray(note.keys) ? note.keys.filter((k): k is string => typeof k === 'string') : [] };
}

/** Le .info avec ce cadrage d'origine noté (undefined : retiré), les autres champs conservés. */
export function withOriginFraming<T extends { [key: string]: unknown }>(info: T, note: OriginFramingNote | undefined): T {
  const own: Record<string, unknown> = { ...(info.CyberPinball as Record<string, unknown> | undefined) };
  if (note) own.framing = note;
  else delete own.framing;
  const next: Record<string, unknown> = { ...info };
  if (Object.keys(own).length) next.CyberPinball = own;
  else delete next.CyberPinball;
  return next as T;
}

/**
 * Le .ini de la table rendu au cadrage de la borne : les clés figées retirées, le mode de la borne écrit (sans lui, une
 * vue propre ou un POV reviendrait à la partie suivante, importedView, povView).
 */
export function withoutOriginFraming(tableIni: string, note: OriginFramingNote, borneIni: string): string {
  const doc = IniDocument.parse(tableIni);
  for (const key of note.keys) doc.remove('Player', key);
  const borneMode = vpxAutofitMode(IniDocument.parse(borneIni).get('Player', 'CabinetAutofitMode'));
  doc.set('Player', 'CabinetAutofitMode', borneMode === 2 ? '2' : '1');
  return doc.toString();
}

/** La table, cadrée comme dans son installation d'origine, l'est-elle encore dans le bon sens (même forme de fenêtre) ? */
export function originFramingHolds(note: OriginFramingNote, orientation: PlayfieldOrientation | undefined): boolean {
  if (note.mode === 'auto' || !orientation) return true;
  const b = orientation.window.bounds;
  return (b.width < b.height ? 'portrait' : 'landscape') === note.shape;
}
