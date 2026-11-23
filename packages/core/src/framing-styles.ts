// Styles de cadrage des tables en vue borne (23/11/2026). Sur un écran 16:9 en portrait, une
// table est 17 à 29 % trop étroite : aucun cadrage ne remplit l'écran sans compromis (banc de rendu réel,
// scripts/banc-cadrage.ps1). Trois choix, montrés au joueur sur une image rendue de sa propre table
// (app/src/framing-preview.ts), jamais à l'aveugle :
// - « Plein écran, apron rogné » (défaut) : « Ajuster » qui garde le haut (correctif 02 du VPX corrigé) ; le fond du
//   plateau reste visible, l'apron sort de l'écran, étirement plafonné à 15 % ;
// - « Table entière » : la table en entier, à ses proportions, des bandes sur les côtés ;
// - « Plein écran, table élargie » : « Remplir » de VPX, toute la table étirée en largeur.
// Le style de la borne est écrit dans VPinballX.ini (sync.ts) ; celui d'une table seule, dans son .ini.

import { t } from './i18n';
import { IniDocument } from './ini';
import type { VpxSetting } from './vpx';
import { vpxAutofitMode } from './vpx';

export type FramingStyle = 'garde-le-haut' | 'entiere' | 'remplir';

export const DEFAULT_FRAMING_STYLE: FramingStyle = 'garde-le-haut';

/** Les clés [Player] qu'un style écrit. */
export const FRAMING_STYLE_KEYS = ['CabinetAutofitMode', 'CabinetAutofitKeepTop', 'CabinetAutofitMaxStretch', 'CabinetAutofitPos'] as const;

const player = (key: (typeof FRAMING_STYLE_KEYS)[number], value: string): VpxSetting => ({ section: 'Player', key, value });

/**
 * Les réglages d'un style. `keepTop` : le VPX sait garder le haut (VPX corrigé, profil keepTopFraming) ; sans lui,
 * « Table entière » n'existe pas et « apron rogné » devient l'« Ajuster » de VPX.
 */
export function framingStyleSettings(style: FramingStyle, keepTop: boolean): VpxSetting[] {
  switch (style) {
    case 'remplir':
      return keepTop ? [player('CabinetAutofitMode', '2'), player('CabinetAutofitKeepTop', '0')] : [player('CabinetAutofitMode', '2')];
    case 'entiere':
      return [player('CabinetAutofitMode', '1'), player('CabinetAutofitKeepTop', '1'), player('CabinetAutofitMaxStretch', '0'), player('CabinetAutofitPos', '0.2')];
    case 'garde-le-haut':
      return keepTop
        ? [player('CabinetAutofitMode', '1'), player('CabinetAutofitKeepTop', '1'), player('CabinetAutofitMaxStretch', '0.15'), player('CabinetAutofitPos', '0.05')]
        : [player('CabinetAutofitMode', '1')];
  }
}

/** Les styles possibles avec ce VPX, dans l'ordre où ils sont proposés. */
export function framingStyles(keepTop: boolean): FramingStyle[] {
  return keepTop ? ['garde-le-haut', 'entiere', 'remplir'] : ['garde-le-haut', 'remplir'];
}

export function framingStyleLabel(style: FramingStyle): string {
  switch (style) {
    case 'garde-le-haut':
      return t('Plein écran, apron rogné');
    case 'entiere':
      return t('Table entière');
    case 'remplir':
      return t('Plein écran, table élargie');
  }
}

export function framingStyleDetail(style: FramingStyle): string {
  switch (style) {
    case 'garde-le-haut':
      return t('Le fond du plateau reste visible, le bas de la table sort de l’écran.');
    case 'entiere':
      return t('Toute la table à ses proportions, avec des bandes sur les côtés.');
    case 'remplir':
      return t('Toute la table, étirée en largeur pour remplir l’écran.');
  }
}

/** Le style que ces valeurs donnent (le .ini d'une table par-dessus VPinballX.ini) ; undefined : cadrage manuel ou autre. */
export function framingStyleOf(read: (section: string, key: string) => string | undefined, keepTop: boolean): FramingStyle | undefined {
  const mode = vpxAutofitMode(read('Player', 'CabinetAutofitMode'));
  if (mode === 0) return undefined;
  if (mode === 2) return 'remplir';
  if (!keepTop) return 'garde-le-haut';
  const top = read('Player', 'CabinetAutofitKeepTop')?.trim();
  if (top !== '1' && !/^true$/i.test(top ?? '')) return undefined;
  const stretch = Number(read('Player', 'CabinetAutofitMaxStretch') ?? '0');
  return stretch < 0.01 ? 'entiere' : 'garde-le-haut';
}

/** Le .ini d'une table avec ce style pour elle seule ([Player], ses autres réglages gardés). */
export function withTableFramingStyle(tableIni: string, style: FramingStyle, keepTop: boolean): string {
  const doc = IniDocument.parse(tableIni);
  for (const key of FRAMING_STYLE_KEYS) doc.remove('Player', key);
  for (const s of framingStyleSettings(style, keepTop)) doc.set(s.section, s.key, s.value);
  return doc.toString();
}
