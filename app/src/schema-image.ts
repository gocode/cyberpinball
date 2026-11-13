// L'image du schéma des manettes pour la pause en partie (maquette validée le 13 novembre 2026) : le plugin de
// Cyber Pinball la pose dans VPX ([Plugin.CyberPinball] CalibrateImage, puis CalibratedImage après un calage). Fabriquée hors
// écran avec le vrai composant (app/renderer/schema-image.html), fond transparent, gardée dans <données>\vr\schemas
// sous une clé tirée de son contenu : refaite seulement quand le texte (langue) ou les commandes changent.

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createWindow } from './offscreen';

export interface SchemaImage {
  /** Le titre au-dessus du schéma, en vert si `titleGreen`. */
  title?: string;
  titleGreen?: boolean;
  /** Les commandes en vert (noms des éléments des manettes). */
  vert: readonly string[];
  /** La ligne d'aide sous le schéma. */
  text: string;
  /** Le début de la ligne à mettre en vert (la commande), s'il y est. */
  lead?: string;
}

/** Version du dessin : changée quand le composant change, pour refaire les images gardées. */
const SCHEMA_IMAGE_VERSION = 2;

/** Le fichier de l'image pour ce contenu (il peut ne pas encore exister). */
export function schemaImageFile(dataDir: string, image: SchemaImage): string {
  const key = createHash('sha1').update(JSON.stringify({ v: SCHEMA_IMAGE_VERSION, ...image })).digest('hex').slice(0, 16);
  return path.join(dataDir, 'vr', 'schemas', `pause-${key}.png`);
}

/** L'image, faite si elle n'existe pas encore ; undefined si elle n'a pas pu l'être (le plugin garde le texte seul). */
export async function prepareSchemaImage(dataDir: string, rendererDir: string, image: SchemaImage, log: (line: string) => void): Promise<string | undefined> {
  const file = schemaImageFile(dataDir, image);
  if (fs.existsSync(file)) return file;
  const win = createWindow({ show: false, width: 1900, height: 760, useContentSize: true, transparent: true, backgroundColor: '#00000000', webPreferences: { offscreen: true, sandbox: true } });
  try {
    await win.loadFile(path.join(rendererDir, 'schema-image.html'), { query: { ...(image.title && { titre: image.title }), ...(image.titleGreen && { titreVert: '1' }), vert: image.vert.join(','), texte: image.text, lead: image.lead ?? '' } });
    // La police chargée et la taille réelle du contenu : l'image prend juste ce qu'il faut.
    const size = (await win.webContents.executeJavaScript(
      "document.fonts.ready.then(() => { const r = document.getElementById('image').getBoundingClientRect(); return { w: Math.ceil(r.width), h: Math.ceil(r.height) }; })",
    )) as { w: number; h: number };
    await new Promise((r) => setTimeout(r, 150));
    const shot = await win.webContents.capturePage({ x: 0, y: 0, width: Math.min(1900, size.w), height: Math.min(760, size.h) });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, shot.toPNG());
    log(`Casque : image du schéma des manettes pour la pause faite (${shot.getSize().width}×${shot.getSize().height}).`); // i18n-ignore : journal
    return file;
  } catch (error) {
    log(`Casque : image du schéma des manettes pour la pause pas faite (${(error as Error).message}) ; la pause garde le texte seul.`); // i18n-ignore : journal
    return undefined;
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}
