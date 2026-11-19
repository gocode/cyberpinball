// Ce que le journal de VPX (vpinball.log) dit du son et du DMD d'une partie, résumé pour le journal de la borne et
// pour le médecin. Une partie sans son, ou un DMD qui ne montre pas les images de la table, ne laisse aucune erreur à
// l'écran : sans ces lignes, le rapport d'une borne ne permettait pas de trancher (Goldorak, 19/11/2026 : « aucun son »,
// DMD orange avec ou sans son dossier UltraDMD). Messages de VPX 10.8.1-5436, relevés dans son code source :
// - src/core/ScriptGlobalTable.cpp, PlayMusic : « Failed to stream music: <nom> » quand le morceau n'est ni dans
//   <dossier de la table>\music, ni dans <VPX>\music (FileLocator::GetTablePath) ;
// - src/audio/AudioPlayer.cpp : « Audio device initialized. Device: '<nom>' … », « Table sound device was not found
//   (<nom>), using default: <nom> », « Backglass sound device was not found … », « Failed to … » ;
// - plugins/flexdmd/resources/AssetManager.cpp : « Base path set to: <dossier> » (SetProjectFolder), « Bitmap added to
//   cache: <image> », « Failed to resolve asset: <image> », « Unsupported asset extension: <ext> », « Asset not loaded ».
// Le plugin FlexDMD de VPX 10.8.1 dessine les textes d'UltraDMD dans sa couleur par défaut, orange (FlexDMD.h,
// m_dmdColor = 0xFF5820), en RGB (UltraDMD.cpp, RenderMode_DMD_RGB ; « DMD Source Changed: format=2 » = SRGB888) :
// un DMD UltraDMD orange est normal tant qu'il n'affiche que du texte.

import { IniDocument } from './ini';

/** Les morceaux que VPX n'a pas trouvés (PlayMusic), sans doublon, dans l'ordre. */
export function musicNotFound(lines: readonly string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const m = /Failed to stream music:\s*(.+?)\s*$/.exec(line);
    if (m && !out.some((o) => o.toLowerCase() === m[1]!.toLowerCase())) out.push(m[1]!);
  }
  return out;
}

/** Les sorties du son ouvertes par VPX, celles qu'il n'a pas trouvées, et ses erreurs de son. */
export function vpxAudioDevices(lines: readonly string[]): { devices: string[]; notFound: string[]; errors: string[] } {
  const devices: string[] = [];
  const notFound: string[] = [];
  const errors: string[] = [];
  const push = (list: string[], value: string) => {
    if (!list.includes(value)) list.push(value);
  };
  for (const line of lines) {
    const device = /Audio device initialized\. Device: '([^']*)'/.exec(line);
    if (device) push(devices, device[1]!);
    const missing = /(Table|Backglass) sound device was not found \(([^)]*)\), using default: (.+?)\s*$/.exec(line);
    if (missing) push(notFound, `${missing[1]} : « ${missing[2]} » → « ${missing[3]} »`); // i18n-ignore : journal
    const error = /(Failed to open (?:default )?SDL (?:audio )?device.*|Failed to initialize miniaudio.*|SDL Init Audio failed.*|Failed to set audio stream format.*)$/.exec(line);
    if (error) push(errors, error[1]!.trim());
  }
  return { devices, notFound, errors };
}

/** Une ligne du journal de la borne sur le son de la partie ; undefined s'il n'y a rien d'utile à dire. */
export function vpxAudioJournal(table: string, lines: readonly string[]): string | undefined {
  const { devices, notFound, errors } = vpxAudioDevices(lines);
  const music = musicNotFound(lines);
  if (!devices.length && !notFound.length && !errors.length && !music.length) return undefined;
  const parts = [
    devices.length ? `sorties ${devices.map((d) => `« ${d} »`).join(', ')}` : 'aucune sortie ouverte', // i18n-ignore : journal
    ...notFound.map((n) => `sortie absente, remplacée : ${n}`), // i18n-ignore : journal
    ...errors.map((e) => `erreur : ${e}`), // i18n-ignore : journal
    ...(music.length ? [`musique introuvable (cherchée dans le dossier « music » de la table, puis celui de VPX) : ${music.map((m) => `« ${m} »`).join(', ')}`] : []), // i18n-ignore : journal
  ];
  return `Son de la partie (${table}) : ${parts.join(' ; ')}.`; // i18n-ignore : journal
}

/** Images du DMD (FlexDMD, UltraDMD) : le dossier, ce qui a été chargé, ce qui manque. */
export function flexAssets(lines: readonly string[]): { folders: string[]; loaded: number; missing: string[]; unsupported: string[]; notLoaded: string[] } {
  const folders: string[] = [];
  const loaded = new Set<string>();
  const missing: string[] = [];
  const unsupported: string[] = [];
  const notLoaded: string[] = [];
  const push = (list: string[], value: string) => {
    if (!list.some((v) => v.toLowerCase() === value.toLowerCase())) list.push(value);
  };
  for (const line of lines) {
    let m = /Base path set to:\s*(.+?)\s*$/.exec(line);
    if (m) push(folders, m[1]!);
    m = /Bitmap added to cache:\s*(.+?)\s*$/.exec(line);
    if (m && !/^FlexDMD\.Resources\./.test(m[1]!)) loaded.add(m[1]!.toLowerCase());
    m = /Failed to resolve asset:\s*(.+?)\s*$/.exec(line);
    if (m) push(missing, m[1]!);
    m = /Unsupported asset extension:\s*(.*?)\s*$/.exec(line);
    if (m) push(unsupported, m[1] || '(aucune)'); // i18n-ignore : journal
    m = /Asset not loaded:\s*(.+?)\s*$/.exec(line);
    if (m) push(notLoaded, m[1]!);
  }
  return { folders, loaded: loaded.size, missing, unsupported, notLoaded };
}

/** Une ligne du journal de la borne sur les images du DMD de la table ; undefined si la table n'en charge aucune. */
export function flexAssetsJournal(table: string, lines: readonly string[]): string | undefined {
  const a = flexAssets(lines);
  if (!a.folders.length && !a.loaded && !a.missing.length && !a.unsupported.length && !a.notLoaded.length) return undefined;
  const list = (items: string[]) => items.slice(0, 5).join(', ') + (items.length > 5 ? ` (et ${items.length - 5} autres)` : ''); // i18n-ignore : journal
  const parts = [
    a.folders.length ? `dossier ${a.folders.map((f) => `« ${f} »`).join(', ')}` : 'aucun dossier donné par le script', // i18n-ignore : journal
    `${a.loaded} image${a.loaded > 1 ? 's' : ''} chargée${a.loaded > 1 ? 's' : ''}`, // i18n-ignore : journal
    ...(a.missing.length ? [`introuvables : ${list(a.missing)}`] : []), // i18n-ignore : journal
    ...(a.notLoaded.length ? [`non chargées : ${list(a.notLoaded)}`] : []), // i18n-ignore : journal
    ...(a.unsupported.length ? [`formats non pris en charge : ${list(a.unsupported)}`] : []), // i18n-ignore : journal
  ];
  return `Images du DMD de la partie (${table}) : ${parts.join(' ; ')}.`; // i18n-ignore : journal
}

/**
 * Réglages du .ini de la table qui coupent un son : volume du fronton (musique, sons du script joués « au fronton »)
 * ou du plateau à 0 dans [Player] (Settings_properties.inl : MusicVolume, SoundVolume, 0 à 100), ou les anciens
 * interrupteurs PlayMusic / PlaySound à 0. Un .ini repris d'une autre installation peut les avoir.
 */
export function mutedAudioSettings(doc: IniDocument): { section: string; key: string; value: string }[] {
  return doc.entries().filter((e) => e.section.toLowerCase() === 'player' && /^(MusicVolume|SoundVolume|PlayMusic|PlaySound)$/i.test(e.key) && Number(e.value.trim()) === 0 && e.value.trim() !== '');
}
