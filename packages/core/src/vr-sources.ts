// Sources du fronton et du DMD d'une table dans le casque (règle du 12 novembre 2026 : toute table en VR
// affiche un fronton et un DMD, quels que soient ses médias).
//
// Essai sur la borne : The Matrix sans PuP-Pack, rien ; Terminator 2, rien (son meuble de cabine devant le
// fronton de VPX, vr.ts VR_VIEW_MODE) ; Back to the Future, un fronton mais aucun DMD ; City Hunter (pièce
// VR à elle), un DMD gris vide. Mécanisme commun : VPX 10.8.1 ne dessine en VR aucune fenêtre annexe ; le
// DMD (PinMAME, FlexDMD, UltraDMD, AlphaDMD) n'arrive dans le casque que si la table a un objet DMD dans sa
// scène. Le plugin de Cyber Pinball dessine donc, sur le fronton que VPX pose, une bande DMD sous le fronton
// (chaîne PuP, ScoreView, B2S), et des images de secours (fronton et DMD des médias de Cyber Pinball).
// Ce module dit, sans VPX, quelle source chaque table aura, pour le journal et la santé de la borne.

/** `room` : la pièce VR de la table, avec son propre fronton et son propre DMD. */
export type BackglassSource = 'room' | 'PuP-Pack' | 'directb2s' | 'image';
export type DmdSource = 'room' | 'PinMAME' | 'FlexDMD' | 'UltraDMD' | 'PuP-Pack' | 'image';

export interface VrSourceFacts {
  /** La table a sa pièce VR avec son propre fronton : VPX n'ajoute pas le sien (vrNeedsVpxBackglass faux). */
  ownRoom: boolean;
  /** PuP-Pack actif (pupvideos). */
  pupPack: boolean;
  /** Fichier .directb2s à côté de la table. */
  directb2s: boolean;
  /** Image (pas vidéo) du fronton et du DMD trouvées par Cyber Pinball (médias de la table ou par défaut). */
  backglassImage: boolean;
  dmdImage: boolean;
  script: string | undefined;
}

export interface VrSources {
  backglass?: BackglassSource;
  dmd?: DmdSource;
}

/** Le DMD que pilote le script : PinMAME (ROM), FlexDMD, UltraDMD ; undefined sans aucun. */
export function scriptDmd(script: string | undefined): 'PinMAME' | 'FlexDMD' | 'UltraDMD' | undefined {
  if (!script) return undefined;
  const code = script.replace(/'.*$/gm, '');
  if (/VPinMAME\.Controller|\bLoadVPM\b|\bcGameName\s*=/i.test(code)) return 'PinMAME';
  if (/FlexDMD/i.test(code)) return 'FlexDMD';
  if (/UltraDMD/i.test(code)) return 'UltraDMD';
  return undefined;
}

/** Les sources qu'aura la table dans le casque, la première de chaque chaîne. */
export function vrSources(f: VrSourceFacts): VrSources {
  if (f.ownRoom) return { backglass: 'room', dmd: 'room' };
  const backglass: BackglassSource | undefined = f.pupPack ? 'PuP-Pack' : f.directb2s ? 'directb2s' : f.backglassImage ? 'image' : undefined;
  const dmd: DmdSource | undefined = scriptDmd(f.script) ?? (f.pupPack ? 'PuP-Pack' : f.dmdImage ? 'image' : undefined);
  return { ...(backglass ? { backglass } : {}), ...(dmd ? { dmd } : {}) };
}

/** Ce qui manque : le fronton, le DMD, ou rien. */
export function missingVrSources(s: VrSources): ('fronton' | 'DMD')[] {
  return [...(s.backglass ? [] : (['fronton'] as const)), ...(s.dmd ? [] : (['DMD'] as const))];
}

/** Images que VPX sait lire (CreateTexture) : pas de vidéo pour une image de secours. */
export function isVrImage(file: string): boolean {
  return /\.(png|jpe?g|webp|bmp)$/i.test(file);
}

/** Bande du DMD sous le fronton que VPX pose, en part de sa partie visible (cyberpinball.cpp, DmdBand). */
export const VR_DMD_BAND = 0.25;
