// Erreurs de la dernière partie de cette table : la première erreur explique souvent les suivantes.
import type { Finding } from './doctor';
import { t, tn } from './i18n';
import { scriptErrorsDuringGame, vpxScriptError } from './vpxfailure';

/** Ignore les chargements pour extraire un script et les erreurs des autres tables. */
export function scriptRuntimeFinding(file: string, log: string): Finding | undefined {
  const lines = log.split(/\r?\n/);
  const key = (value: string) => value.replace(/\\/g, '/').toLowerCase();
  const loads = lines.flatMap((line, index) => {
    const match = /\bLoadGameFromFilename (.+)$/.exec(line);
    return match ? [{ index, file: match[1]!.trim() }] : [];
  });
  for (let i = loads.length - 1; i >= 0; i--) {
    const load = loads[i]!;
    if (key(load.file) !== key(file)) continue;
    const session = lines.slice(load.index, loads[i + 1]?.index ?? lines.length);
    const errors = scriptErrorsDuringGame(session);
    // GetTextFile échoue avant les variables non définies : le fichier non chargé est la cause observable.
    const missing = [...new Set(session.flatMap((line) => {
      const match = /\bScriptGlobalTable::GetTextFile[^\]]*\]\s+Unable to load file:\s*(.+?)\s*$/i.exec(line);
      return match ? [match[1]!] : [];
    }))];
    if (missing.length) return {
      code: 'scriptRuntimeError',
      severity: 'warning',
      title: t('Script complémentaire non chargé'),
      detail: t('VPX n’a pas pu charger : {files}. Vérifie les scripts fournis avec cette version de la table et ceux de VPX. Les erreurs de variables ou d’objets qui suivent peuvent en découler.', { files: missing.slice(0, 8).map((file) => file.slice(0, 160)).join(', ') }),
    };
    // Un chargement sans joueur est une extraction ou l'éditeur : il n'efface pas la dernière partie.
    if (!errors.length && !session.some((line) => /\bStarting script\b|\bStartup done\b/.test(line))) continue;
    if (!errors.length) return undefined;
    const first = session.map((line) => vpxScriptError([line])).find(Boolean)!;
    const total = errors.reduce((sum, error) => sum + error.count, 0);
    return {
      code: 'scriptRuntimeError',
      severity: 'warning',
      title: t('Erreur du script pendant la dernière partie'),
      detail: t('Première erreur, ligne {line} : « {message} ». {count} Les erreurs suivantes peuvent en découler.', {
        line: first.line,
        message: first.message,
        count: tn(total, 'VPX a signalé une erreur pendant cette partie.', 'VPX a signalé {n} erreurs pendant cette partie.'),
      }),
    };
  }
  return undefined;
}
