// Conversion d'une image de fronton en PNG, pour les jeux de Zen qui lisent leurs propres images de fronton
// (Pinball FX3 : data\steam\<table>.*, pinballfx3-backglass.ts).
//
// Pinball FX (2023) n'en reçoit plus (décision du 20/11/2026) : la fenêtre du fronton de son mode
// borne est fermée, le fronton de la borne reste celui de Cyber Pinball, le média de la table. Avant, Cyber
// Pinball déposait Table_<numéro>.png et PFX.png dans PinballFX\Mods\Cabinet ; une table choisie dans le jeu
// restait sans image, et le jeu écrivait le chemin cherché à la place.

/** Image PNG d'un fichier image (Electron : nativeImage) ; vide si illisible. */
export function electronPng(file: string): Buffer {
  // Chargé à l'usage : les essais, sans Electron, passent leur propre conversion.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { nativeImage } = require('electron') as typeof import('electron');
  return nativeImage.createFromPath(file).toPNG();
}
