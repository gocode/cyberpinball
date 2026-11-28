// Applications (28/11/2026) : les icônes des six services installés d'office sont livrées avec le
// logiciel (app/renderer/applications-icones/<fichier>), nettes en grand et sans réseau : plus de
// favicon de 32 ou 64 px relevé sur le site, qui s'affichait en pastille sur une tuile composée. Les
// autres applications (catalogue, adresses ajoutées) gardent l'icône relevée sur leur site.

/** Fichier de l'icône livrée, par identité d'application (celle de DEFAULT_APPS). */
export const BUNDLED_APP_ICONS: Readonly<Record<string, string>> = {
  netflix: 'netflix.svg',
  'prime-video': 'prime-video.png',
  'disney-plus': 'disney-plus.png',
  youtube: 'youtube.png',
  twitch: 'twitch.svg',
  spotify: 'spotify.svg',
};

/** Dossier des icônes livrées, relatif aux pages du front-end (app/renderer). */
export const BUNDLED_APP_ICON_DIR = 'applications-icones';

/** Adresse relative (depuis une page de app/renderer) de l'icône livrée de cette application ; undefined : pas d'icône livrée. */
export function bundledAppIcon(id: string): string | undefined {
  const file = Object.prototype.hasOwnProperty.call(BUNDLED_APP_ICONS, id) ? BUNDLED_APP_ICONS[id] : undefined;
  return file ? `${BUNDLED_APP_ICON_DIR}/${file}` : undefined;
}
