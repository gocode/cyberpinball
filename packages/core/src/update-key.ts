// Clé publique de publication des mises à jour (Ed25519), écrite par scripts/cle-publication.mjs.
// Seuls les flux signés par la clé privée correspondante sont acceptés (update.ts).
// La changer coupe les bornes déjà installées des mises à jour suivantes.
export const UPDATE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAsx3K6p9Me9CmRYL4i7cM3IuxEYwv/ny6CgTjZ4nmn2I=
-----END PUBLIC KEY-----
`;
