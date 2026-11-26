/** Adaptateur local : aucune écriture dans les tables, leurs .info ou leurs médias partagés. */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { readJsonFile, readVpxScript, scriptFacts, surpriseAllowed, writeFileAtomic, t, type SurpriseAudience, type SurpriseCandidate, type SurprisePermission, type TableEntry } from '@cyberpinball/core';
import type { Action, Built } from './library-types';

export interface SurpriseEngine {
  /** Exécutable réellement choisi par le lanceur natif, et fichiers essentiels déjà identifiés. */
  files: string[];
  identity: string;
  romDirs?: string[];
}
function stamp(file: string): string | undefined {
  try { const s = fs.statSync(file); return s.isFile() && s.size > 0 ? `${path.resolve(file)}:${s.size}:${s.mtimeMs}` : undefined; }
  catch { return undefined; }
}
/** Contrôles sans lancer de moteur. Les dépendances dynamiques exigent en plus une confirmation administrative. */
export function surpriseRequirements(table: TableEntry, engine: SurpriseEngine): NonNullable<SurprisePermission['checked']> | undefined {
  try {
  const required = { files: [] as string[], directories: [] as string[] };
  if (table.emulator !== 'vpx') return required;
  if (!/\.vpx$/i.test(table.file)) return undefined;
  const vbs = table.file.replace(/\.vpx$/i, '.vbs');
  const script = fs.existsSync(vbs) ? fs.readFileSync(vbs, 'utf8') : readVpxScript(table.file);
  if (!script?.trim()) return undefined;
  const facts = scriptFacts(script);
  if (facts.usesPinmame) {
    const rom = facts.roms.flatMap((name) => (engine.romDirs ?? []).map((dir) => path.join(dir, `${name}.zip`))).find((file) => stamp(file));
    if (!rom) return undefined;
    required.files.push(rom);
  }
  if (facts.dmdFolder) required.directories.push(path.resolve(table.folder, facts.dmdFolder));
  return required;
  } catch { return undefined; }
}
export function surpriseFingerprint(table: TableEntry, engine: SurpriseEngine | undefined, checked?: NonNullable<SurprisePermission['checked']>): string | undefined {
  try {
  if (!engine?.files.length) return undefined;
  const stamps = [stamp(table.file), ...engine.files.map(stamp)];
  if (stamps.some((s) => !s)) return undefined;
  if (table.emulator === 'vpx') {
    const vbs = table.file.replace(/\.vpx$/i, '.vbs');
    stamps.push(fs.existsSync(vbs) ? stamp(vbs) : 'embedded');
  } else if (table.emulator === 'pinballfx') {
    if (!Number.isInteger(table.pinballFxTable) || table.pinballFxTable! <= 0) return undefined;
  } else if (table.emulator !== 'futurepinball') return undefined;
  const required = checked ?? surpriseRequirements(table, engine);
  if (!required || !Array.isArray(required.files) || !Array.isArray(required.directories)) return undefined;
  for (const file of required.files) { const value = stamp(file); if (!value) return undefined; stamps.push(value); }
  for (const folder of required.directories) {
    const value = fs.statSync(folder);
    if (!value.isDirectory()) return undefined;
    stamps.push(`${path.resolve(folder)}:${value.mtimeMs}`);
  }
  return createHash('sha256').update(JSON.stringify([table.emulator, engine.identity, table.pinballFxTable, stamps])).digest('hex');
  } catch { return undefined; }
}

export function createSurpriseCatalog(host: {
  dataDir: string; guest(): boolean; engine(table: TableEntry): SurpriseEngine | undefined;
  wheel(table: TableEntry): string | undefined;
  library: { openCustom(build: () => Built): void };
  changed(): void;
}) {
  const file = path.join(host.dataDir, 'table-surprise.json');
  const read = (): Record<string, SurprisePermission> => {
    try {
      const value = readJsonFile(file);
      return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, SurprisePermission> : {};
    } catch { return {}; }
  };
  const fingerprint = (table: TableEntry, checked?: NonNullable<SurprisePermission['checked']>) => { try { return surpriseFingerprint(table, host.engine(table), checked); } catch { return undefined; } };
  function eligible(table: TableEntry, permissions = read()): boolean {
    const permission = permissions[table.id];
    if (!permission?.checked || permission.hidden !== false || permission.audience === 'adult' || (host.guest() && permission.audience !== 'family')) return false;
    return surpriseAllowed(permission, fingerprint(table, permission.checked), host.guest());
  }
  function save(table: TableEntry, value: SurprisePermission | undefined): void {
    if (host.guest()) return;
    const all = read();
    if (value) all[table.id] = value; else delete all[table.id];
    writeFileAtomic(file, JSON.stringify(all, null, 2));
    host.changed();
  }
  return {
    eligible,
    candidates(tables: readonly TableEntry[]): SurpriseCandidate[] {
      const permissions = read();
      return tables.filter((table) => eligible(table, permissions)).map((table) => ({ id: table.id, title: table.title, wheel: host.wheel(table) }));
    },
    action(table: TableEntry, back: () => void): Action {
      return {
        label: t('Table surprise'), icon: 'shuffle', door: 'sheet.manage',
        detail: eligible(table) ? t('Autorisée dans le tirage') : t('Exclue du tirage'),
        run: () => {
          if (host.guest()) return;
          const build = (): Built => {
            const previous = read()[table.id];
            const engine = host.engine(table);
            const checked = engine ? surpriseRequirements(table, engine) : undefined;
            const verified = checked ? fingerprint(table, checked) : undefined;
            const allow = (audience: SurpriseAudience): void => {
              if (verified && checked) save(table, { audience, hidden: false, verified, checked });
              host.library.openCustom(build);
            };
            return {
              heading: t('Table surprise'), subheading: table.title, icon: 'shuffle',
              lead: t('Confirme le contenu et les prérequis de cette entrée sur ce PC. Pour Pinball FX, confirme aussi que cette table est possédée et accessible avec le compte actuel. Une fiche ou un jeu installé ne prouve pas ces droits.'),
              sections: [{ rows: [{ text: verified ? t('Fichier et moteur trouvés') : t('Prérequis inconnus ou manquants'), detail: t('Vérifie auparavant les dépendances, les médias du pack et le fonctionnement de cette version. Toute modification de fichier ou de moteur impose une nouvelle confirmation.'), tone: verified ? 'info' : 'warning' }] }],
              actions: [
                { label: t('Confirmer : adaptée à la famille et jouable'), icon: 'check', run: () => allow('family') },
                { label: t('Confirmer : mode normal seulement et jouable'), icon: 'check', run: () => allow('normal') },
                { label: t('Exclure : adulte, masquée ou à vérifier'), icon: 'lock', detail: previous ? t('Retirer l’autorisation locale') : t('Aucune autorisation locale'), run: () => { save(table, undefined); host.library.openCustom(build); } },
                { label: t('Retour à la fiche'), icon: 'back', run: back },
              ], back,
            };
          };
          host.library.openCustom(build);
        },
      };
    },
  };
}
