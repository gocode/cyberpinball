// Écriture de VPinballX.ini depuis le modèle de borne, partagée par le menu,
// l'assistant et la commande sync. Garde en mémoire les valeurs écrites pour
// reconnaître ensuite une clé gérée changée à la main (jamais écrasée en silence).
// Les sorties audio et les périphériques USB (DMD réels) sont relus à chaque fois,
// comme les écrans. Chaque configuration de borne a son VPinballX.ini : celle qui
// correspond aux écrans branchés est reconnue avant chaque synchronisation.

import {
  configIniPath,
  findGlobalDmdFolders,
  loadCabinet,
  readJsonFile,
  selectConfiguration,
  writeVpxSync,
  type Cabinet,
  type ConfigurationSelection,
  type Locations,
  type ObservedAudioOutput,
  type ObservedDisplay,
  type ObservedUsbDevice,
  type VpxProfile,
  type VpxSyncWrite,
} from '@cyberpinball/core';
import { probeAudioOutputs, probeUsbDevices } from '@cyberpinball/win-displays';
import { backupDir, locations } from './paths';

export type VpxIniSync = VpxSyncWrite;

export function syncVpxIni(
  dataDir: string,
  iniPath: string,
  cabinet: Cabinet,
  displays: ObservedDisplay[],
  profile: VpxProfile,
  /** Reprendre la main sur les clés changées à la main : toutes, ou celles pour lesquelles la fonction répond oui. */
  overwriteManual: boolean | ((id: string) => boolean) = false,
  audio: ObservedAudioOutput[] | undefined = cabinet.audio ? audioOutputs() : undefined,
  /** Étape de l'assistant refaite seule : seulement ces clés écrites (SyncOptions.only). */
  only?: (id: string) => boolean,
): VpxIniSync {
  const root = locations().root;
  return writeVpxSync(
    dataDir,
    iniPath,
    cabinet,
    displays,
    profile,
    { overwriteManual, audio, usb: usbDevices(), folders: root ? findGlobalDmdFolders(root) : undefined, only },
    backupDir(dataDir),
  );
}

/** VPinballX.ini de la configuration active : celui que lisent VPX, les réglages et l'assistant. */
export function activeVpxIni(loc: Locations = locations()): string {
  return configIniPath(loc.vpxIni, loadCabinet(loc.dataDir));
}

export interface ConfigurationSync {
  /** undefined : aucune borne configurée. */
  selection?: ConfigurationSelection;
  /** VPinballX.ini de la configuration retenue. */
  iniPath?: string;
  /** Absente quand l'utilisateur doit choisir la configuration. */
  sync?: VpxIniSync;
}

/**
 * Démarrage, avant chaque partie, commande sync : reconnaît la configuration
 * branchée, en fait la configuration active, puis remet son VPinballX.ini d'accord
 * avec les écrans. Ambiguïté ou aucune correspondance : rien n'est écrit.
 */
export function syncConfiguration(displays: ObservedDisplay[], profile: VpxProfile, overwriteManual: boolean | ((id: string) => boolean) = false): ConfigurationSync {
  const loc = locations();
  const selection = selectConfiguration(loc.dataDir, displays);
  const cabinet = selection?.configuration;
  if (!cabinet) return { selection };
  const iniPath = configIniPath(loc.vpxIni, cabinet);
  return { selection, iniPath, sync: syncVpxIni(loc.dataDir, iniPath, cabinet, displays, profile, overwriteManual) };
}

/**
 * Sorties audio actives ; undefined si le registre est illisible : les clés audio restent alors
 * telles quelles. CYBERPINBALL_AUDIO_OUTPUTS (fichier JSON) les remplace pour les tests sans
 * opérateur, ici comme dans l'assistant : la synchronisation suit les mêmes sorties que lui.
 */
export function audioOutputs(): ObservedAudioOutput[] | undefined {
  const fixture = process.env.CYBERPINBALL_AUDIO_OUTPUTS;
  if (fixture) return readJsonFile(fixture) as ObservedAudioOutput[];
  try {
    return probeAudioOutputs();
  } catch {
    return undefined;
  }
}

/**
 * Périphériques USB présents ; undefined si la liste est illisible : [Plugin.DMDUtil]
 * reste alors tel quel. CYBERPINBALL_USB_DEVICES (fichier JSON) les remplace pour les
 * tests sans opérateur, par exemple pour simuler un ZeDMD absent du PC.
 */
export function usbDevices(): ObservedUsbDevice[] | undefined {
  const fixture = process.env.CYBERPINBALL_USB_DEVICES;
  if (fixture) return readJsonFile(fixture) as ObservedUsbDevice[];
  try {
    return probeUsbDevices();
  } catch {
    return undefined;
  }
}
