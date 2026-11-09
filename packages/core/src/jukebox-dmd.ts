// Habillage du DMD pendant le Juke-box : le modèle, sans le rendu (étape 5). Choisi à l'intégration
// pour le morceau en cours : une image, une vidéo en boucle ou une animation, à l'un de ces niveaux,
// du plus précis au plus général : morceau, album, artiste, playlist, défaut du Juke-box. Le plus
// précis l'emporte ; l'écran de choix montre lequel s'applique et pourquoi (« Morceau : rien ·
// Album : rien · Artiste : image ✓ · Playlist : animation · Défaut : spectre »).
//
// Les quatre pistes d'animation des maquettes sont gardées (question 15) : spectre (le défaut, vert
// signal), artiste qui défile (sarcelle), pochette en points (orange plasma), titre et temps (ambre
// doux) ; chacune garde sa couleur, réglable. Une image ou une vidéo devenue introuvable ne laisse
// jamais le DMD vide : le niveau suivant s'applique, et la chaîne dit pourquoi.

import { DMD_COLOR_PRESETS, parseDmdColor } from './dmdcolor';
import { t } from './i18n';
import { songKey, type JukeboxTrack, type TrackInfo } from './jukebox';

export type SkinLevel = 'track' | 'album' | 'artist' | 'playlist' | 'default';
/** Du plus précis au plus général : le premier qui a un habillage l'emporte. */
export const SKIN_LEVELS: readonly SkinLevel[] = ['track', 'album', 'artist', 'playlist', 'default'];

export type JukeboxDmdAnimation = 'spectre' | 'artiste' | 'pochette' | 'titre-temps';

export interface JukeboxDmdAnimationSpec {
  id: JukeboxDmdAnimation;
  /** Couleur des points par défaut (préréglages de dmdcolor.ts). */
  color: string;
  readonly label: string;
}

const preset = (id: string) => DMD_COLOR_PRESETS.find((p) => p.id === id)!.hex;

export const JUKEBOX_DMD_ANIMATIONS: readonly JukeboxDmdAnimationSpec[] = [
  {
    id: 'spectre',
    color: preset('signal'),
    get label() {
      return t('Spectre');
    },
  },
  {
    id: 'artiste',
    color: preset('sarcelle'),
    get label() {
      return t('Artiste défilant');
    },
  },
  {
    id: 'pochette',
    color: preset('plasma'),
    get label() {
      return t('Pochette en points');
    },
  },
  {
    id: 'titre-temps',
    color: preset('ambre'),
    get label() {
      return t('Titre et temps');
    },
  },
];

export const isDmdAnimation = (v: unknown): v is JukeboxDmdAnimation => JUKEBOX_DMD_ANIMATIONS.some((a) => a.id === v);

export type DmdSkin = { kind: 'image'; file: string } | { kind: 'video'; file: string } | { kind: 'animation'; animation: JukeboxDmdAnimation; color?: string };

export interface SkinRule {
  level: Exclude<SkinLevel, 'default'>;
  /** Morceau : songKey ; album : « artiste|album » ; artiste : son nom ; playlist : son identifiant (tous en minuscules sauf ce dernier). */
  key: string;
  skin: DmdSkin;
}

export interface JukeboxSkins {
  /** Défaut du Juke-box : toujours une animation (jamais un fichier qui pourrait manquer). */
  default: Extract<DmdSkin, { kind: 'animation' }>;
  rules: SkinRule[];
}

/** Couleur des points d'une animation : la sienne si elle est réglée, sinon celle de sa piste. */
export function animationColor(skin: Extract<DmdSkin, { kind: 'animation' }>): string {
  return skin.color ?? JUKEBOX_DMD_ANIMATIONS.find((a) => a.id === skin.animation)!.color;
}

function cleanSkin(v: unknown): DmdSkin | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const r = v as Record<string, unknown>;
  if ((r.kind === 'image' || r.kind === 'video') && typeof r.file === 'string' && r.file) return { kind: r.kind, file: r.file };
  if (r.kind === 'animation' && isDmdAnimation(r.animation)) {
    const color = parseDmdColor(r.color);
    return { kind: 'animation', animation: r.animation, ...(color ? { color } : {}) };
  }
  return undefined;
}

/** Habillages relus de juke-box.json ; ce qui ne tient pas debout est oublié, le défaut revient au spectre. */
export function normalizeSkins(raw: unknown): JukeboxSkins {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { default?: unknown; rules?: unknown };
  const def = cleanSkin(r.default);
  const rules: SkinRule[] = [];
  for (const x of Array.isArray(r.rules) ? r.rules : []) {
    const rule = x as Partial<SkinRule>;
    const skin = cleanSkin(rule?.skin);
    if (!skin || typeof rule.key !== 'string' || !rule.key || !['track', 'album', 'artist', 'playlist'].includes(rule.level as string)) continue;
    if (rules.some((y) => y.level === rule.level && y.key === rule.key)) continue;
    rules.push({ level: rule.level as SkinRule['level'], key: rule.key, skin });
  }
  return { default: def?.kind === 'animation' ? def : { kind: 'animation', animation: 'spectre' }, rules };
}

const norm = (s: string) => s.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();

/** Clé de chaque niveau pour ce morceau ; absente quand le morceau n'a pas d'album ou d'artiste connu. */
export function skinKeys(track: JukeboxTrack, info: Pick<TrackInfo, 'artist' | 'album'>, playlist: string): Partial<Record<Exclude<SkinLevel, 'default'>, string>> {
  return {
    track: songKey(track),
    ...(info.album ? { album: `${norm(info.artist ?? '')}|${norm(info.album)}` } : {}),
    ...(info.artist ? { artist: norm(info.artist) } : {}),
    playlist,
  };
}

export interface SkinLink {
  level: SkinLevel;
  key?: string;
  skin?: DmdSkin;
  /** Image ou vidéo choisie à ce niveau, mais introuvable : sautée. */
  missing?: boolean;
  applied: boolean;
}

export interface ResolvedSkin {
  level: SkinLevel;
  skin: DmdSkin;
  /** Les cinq niveaux, du plus précis au plus général, pour l'écran de choix. */
  chain: SkinLink[];
}

/** L'habillage qui s'applique : le niveau le plus précis qui en a un (fichier présent). */
export function resolveSkin(skins: JukeboxSkins, keys: Partial<Record<Exclude<SkinLevel, 'default'>, string>>, fileExists: (file: string) => boolean = () => true): ResolvedSkin {
  const chain: SkinLink[] = [];
  let applied: { level: SkinLevel; skin: DmdSkin } | undefined;
  for (const level of SKIN_LEVELS) {
    if (level === 'default') {
      chain.push({ level, skin: skins.default, applied: !applied });
      applied ??= { level, skin: skins.default };
      continue;
    }
    const key = keys[level];
    const rule = key ? skins.rules.find((r) => r.level === level && r.key === key) : undefined;
    if (!rule) {
      chain.push({ level, ...(key ? { key } : {}), applied: false });
      continue;
    }
    const missing = rule.skin.kind !== 'animation' && !fileExists(rule.skin.file);
    const take = !applied && !missing;
    chain.push({ level, key: key!, skin: rule.skin, ...(missing ? { missing: true } : {}), applied: take });
    if (take) applied = { level, skin: rule.skin };
  }
  return { ...applied!, chain };
}

/** Pose (ou retire, `skin` absent) l'habillage d'un niveau ; le défaut ne se retire pas, il change. */
export function setSkin(skins: JukeboxSkins, level: SkinLevel, key: string, skin: DmdSkin | undefined): JukeboxSkins {
  if (level === 'default') return skin?.kind === 'animation' ? { ...skins, default: skin } : skins;
  const rules = skins.rules.filter((r) => !(r.level === level && r.key === key));
  return { ...skins, rules: skin ? [...rules, { level, key, skin }] : rules };
}

export function skinLevelLabel(level: SkinLevel): string {
  switch (level) {
    case 'track':
      return t('Morceau');
    case 'album':
      return t('Album');
    case 'artist':
      return t('Artiste');
    case 'playlist':
      return t('Playlist');
    default:
      return t('Défaut');
  }
}

export function skinLabel(skin: DmdSkin | undefined): string {
  if (!skin) return t('rien');
  if (skin.kind === 'image') return t('image');
  if (skin.kind === 'video') return t('vidéo en boucle');
  return JUKEBOX_DMD_ANIMATIONS.find((a) => a.id === skin.animation)!.label.toLowerCase();
}

/** « Morceau : rien · Album : rien · Artiste : image ✓ · Playlist : animation · Défaut : spectre ». */
export function skinChainText(chain: readonly SkinLink[]): string {
  return chain
    .map((l) => {
      const what = l.missing ? t('{skin} introuvable', { skin: skinLabel(l.skin) }) : skinLabel(l.skin);
      return t('{level} : {skin}', { level: skinLevelLabel(l.level), skin: what }) + (l.applied ? ' ✓' : '');
    })
    .join(' · ');
}
