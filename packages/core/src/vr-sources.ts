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
//
// Cadre DMD d'une pièce VR (City Hunter, même jour : un DMD gris, alors que sa pièce montre le FullDMD de PuP) :
// un flasher en mode DMD (fronton-vr.ts, vpxDmdFrames), où VPX 10.8.1 ne montre qu'une source d'affichage de
// contrôleur (PinMAME, FlexDMD, UltraDMD). PuP n'en publie aucune : le plugin de Cyber Pinball publie la sienne
// ([Plugin.CyberPinball] RoomDmd, roomDmdSetting), même chaîne que la bande : PuP, puis le DMD du script, puis
// l'image.

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
  /** La scène a un cadre DMD (flasher en mode DMD) : celui de la pièce VR. */
  dmdFrame?: boolean;
  /** Le PuP-Pack actif dessine dans la fenêtre du DMD (écran 5, sinon 1 : packDrawsDmd). */
  pupDmd?: boolean;
  /** Image (pas vidéo) du fronton et du DMD trouvées par Cyber Pinball (médias de la table ou par défaut). */
  backglassImage: boolean;
  dmdImage: boolean;
  script: string | undefined;
}

export interface VrSources {
  backglass?: BackglassSource;
  /** Le DMD des scores, sinon ce qui remplit l'emplacement du DMD (full DMD de PuP, image). */
  dmd?: DmdSource;
  /** Le full DMD, la grande zone de fond sous le fronton : écran 5 (ou 1) du PuP-Pack. */
  fullDmd?: 'PuP-Pack';
}

/**
 * Le DMD des scores que pilote le script : PinMAME (ROM), FlexDMD, UltraDMD ; undefined sans aucun. Une ROM se
 * reconnaît à VPinMAME.Controller ou LoadVPM, jamais à cGameName seul : les tables originales le gardent pour
 * leur .directb2s (2001, 12 novembre 2026 : prise pour une ROM, ses scores d'UltraDMD comptés comme PinMAME).
 */
export function scriptDmd(script: string | undefined): 'PinMAME' | 'FlexDMD' | 'UltraDMD' | undefined {
  if (!script) return undefined;
  const code = script.replace(/'.*$/gm, '');
  if (/VPinMAME\.Controller|\bLoadVPM\b/i.test(code)) return 'PinMAME';
  if (/FlexDMD/i.test(code)) return 'FlexDMD';
  if (/UltraDMD/i.test(code)) return 'UltraDMD';
  return undefined;
}

/** Les sources qu'aura la table dans le casque, la première de chaque chaîne. */
export function vrSources(f: VrSourceFacts): VrSources {
  if (f.ownRoom) {
    // Pièce VR à cadre DMD : la chaîne de la bande, PuP, puis le DMD du script, puis l'image ; sans cadre, la pièce.
    if (!f.dmdFrame) return { backglass: 'room', dmd: 'room' };
    const dmd: DmdSource | undefined = f.pupDmd ? 'PuP-Pack' : (scriptDmd(f.script) ?? (f.dmdImage ? 'image' : undefined));
    return { backglass: 'room', ...(dmd ? { dmd } : {}) };
  }
  const backglass: BackglassSource | undefined = f.pupPack ? 'PuP-Pack' : f.directb2s ? 'directb2s' : f.backglassImage ? 'image' : undefined;
  const dmd: DmdSource | undefined = scriptDmd(f.script) ?? (f.pupPack ? 'PuP-Pack' : f.dmdImage ? 'image' : undefined);
  return { ...(backglass ? { backglass } : {}), ...(dmd ? { dmd } : {}), ...(f.pupDmd ? { fullDmd: 'PuP-Pack' as const } : {}) };
}

/**
 * [Plugin.CyberPinball] RoomDmd : la source que le plugin publie pour le cadre DMD de la pièce VR (« PUP »,
 * « image »), ou '' quand le DMD du script le remplit (ou sans pièce VR ni cadre DMD).
 */
export function roomDmdSetting(f: VrSourceFacts): 'PUP' | 'image' | '' {
  if (!f.ownRoom || !f.dmdFrame) return '';
  const dmd = vrSources(f).dmd;
  return dmd === 'PuP-Pack' ? 'PUP' : dmd === 'image' ? 'image' : '';
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
