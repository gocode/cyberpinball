// Images montrées au téléphone (phone-remote.ts) : pastilles des joueurs (classements, messagerie),
// pochettes du Juke-box, miniatures des tables. Le téléphone ne reçoit jamais un chemin : chaque
// image a un jeton tiré au hasard, valable tant que la télécommande vit (reset à son endormissement),
// et la borne la sert sous « /images/<jeton> », réduite à la taille demandée par celui qui l'a
// donnée (le réseau du téléphone reste léger : une miniature, jamais le fichier d'origine).
//
// Un seul magasin pour toute la page : un fichier montré à deux endroits garde son jeton.
//
// Sans electron à l'exécution : les tests du cœur le chargent tel quel.

import * as crypto from 'node:crypto';

/** Adresse des images servies au téléphone (phone-remote.ts) : « /images/<jeton> ». */
export const REMOTE_IMAGE_PATH = '/images/';
/** Un jeton : 16 octets au hasard, en base64url (22 caractères). */
export const REMOTE_IMAGE_TOKEN = /^[A-Za-z0-9_-]{22}$/;
/** Au plus, images servies (un jeton chacune) ; au-delà, les plus anciennes sont oubliées. */
const IMAGES_MAX = 1500;

/** Un fichier derrière un jeton, et le plus grand côté auquel la borne le réduit avant de l'envoyer. */
export interface RemoteImage {
  file: string;
  /** Plus grand côté, en pixels ; absent : le fichier tel quel (une pastille déjà petite). */
  max?: number;
}

export interface RemoteImages {
  /** L'adresse d'une image pour le téléphone (« images/<jeton> », relative à la page). */
  src(file: string, max?: number): string;
  /** Le fichier d'un jeton ; undefined pour un jeton inconnu (ou oublié). */
  get(token: string): RemoteImage | undefined;
  /** La télécommande s'endort : les jetons ne valent plus rien. */
  reset(): void;
}

export function createRemoteImages(): RemoteImages {
  /** Jeton de chaque image servie (par fichier et taille), et l'inverse. */
  const tokens = new Map<string, string>();
  const images = new Map<string, RemoteImage>();
  return {
    src(file, max) {
      const id = `${max ?? 0}|${file}`;
      let token = tokens.get(id);
      if (!token) {
        if (tokens.size >= IMAGES_MAX) {
          const [oldest] = tokens;
          tokens.delete(oldest![0]);
          images.delete(oldest![1]);
        }
        token = crypto.randomBytes(16).toString('base64url');
        tokens.set(id, token);
        images.set(token, { file, ...(max ? { max } : {}) });
      }
      return `${REMOTE_IMAGE_PATH.slice(1)}${token}`;
    },
    get: (token) => (REMOTE_IMAGE_TOKEN.test(token) ? images.get(token) : undefined),
    reset() {
      tokens.clear();
      images.clear();
    },
  };
}
