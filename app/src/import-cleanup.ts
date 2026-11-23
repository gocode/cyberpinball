// Le dossier de déballage est jetable, jamais les fichiers choisis par le joueur. Un antivirus ou
// un lecteur de médias peut encore le tenir : ce rangement ne doit pas retenir Annuler ni faire
// échouer une installation déjà terminée. fs.rm retente les verrous Windows hors du fil d'interface.
import * as fs from 'node:fs';
import * as path from 'node:path';

const pending = new Map<string, Promise<boolean>>();
const pathKey = (file: string) => process.platform === 'win32' ? file.toLowerCase() : file;

/** Ne retire qu'un dossier import-* directement sous la racine de déballage connue de l'application. */
export function cleanupImportStaging(staging: string, stagingRoot: string): Promise<boolean> {
  const target = path.resolve(staging);
  const key = pathKey(target);
  if (pathKey(path.dirname(target)) !== pathKey(path.resolve(stagingRoot)) || !/^import-[\w-]+$/.test(path.basename(target))) {
    console.warn(`Import : nettoyage temporaire refusé hors du dossier de déballage (${target}).`); // i18n-ignore : journal
    return Promise.resolve(false);
  }
  const existing = pending.get(key);
  if (existing) return existing;
  const job = (async () => {
    try {
      await fs.promises.rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      return true;
    } catch (error) {
      console.warn(`Import : dossier temporaire conservé, nettoyage impossible (${target} : ${(error as Error).message}).`); // i18n-ignore : journal
      return false;
    }
  })().finally(() => pending.delete(key));
  pending.set(key, job);
  return job;
}
