// L'inspector de VPX (plugin « Inspector » de VPX 10.8.1) pour une partie entre amis sur une table
// Stern SAM : ce qu'il faut poser dans le double de la table pour que le relevé (livestate.ts) lise
// joueur, bille et fin de partie hors de la NVRAM. Rien n'est posé ailleurs que dans le double :
// - pinmame\memmaps\index.json et cyberpinball.json : une carte réduite aux valeurs à lire. Le
//   module PinMAME de VPX la cherche à côté de la table, sous le nom du jeu (celui que le script
//   demande, et celui que PinMAME charge par alias.txt : les deux sont posés). Les valeurs y sont
//   brutes (entier ou BCD, sans masque ni inversion) : le relevé applique le reste, ce qui ne
//   dépend pas de la façon dont une version de libpinmame lit ces options ;
// - VPinballX.ini : une copie de celui de la borne, l'inspector activé sur un port libre. VPX la
//   reçoit par -Ini pour cette partie seulement ; le VPinballX.ini habituel n'est jamais touché, et
//   ce que VPX écrit dans la copie part avec le double (le journal dit ce qui a changé).
// L'inspector écoute sur toutes les adresses : il n'est activé que quand la règle du pare-feu qui
// ferme VPX au réseau est posée (firewall.ts) ; le relevé le lit par 127.0.0.1.

import type { InspectorState } from './livestate';

/** Nom du plugin dans VPinballX.ini ([Plugin.Inspector]). */
export const INSPECTOR_PLUGIN = 'Inspector';

/** Ports essayés, dans l'ordre : celui de VPX par défaut, puis les suivants. */
export const INSPECTOR_PORTS: readonly number[] = Array.from({ length: 10 }, (_, i) => 2113 + i);

/** Nom de la carte posée dans le double, sous pinmame\memmaps. */
export const INSPECTOR_MAP = 'cyberpinball.json';

const hex = (n: number) => `0x${n.toString(16).toUpperCase().padStart(8, '0')}`;

/**
 * Les fichiers de la carte réduite, chemins relatifs au dossier du double : l'index (chaque nom de
 * jeu vers la carte) et la carte. Chaque valeur est un nœud à part, nommé par son `label`, que
 * l'inspector rend tel quel dans /api/tree.
 */
export function inspectorMemMapFiles(states: readonly InspectorState[], games: readonly string[]): { rel: string; text: string }[] {
  const names = [...new Set(games.map((g) => g.trim()).filter(Boolean))];
  const nodes = Object.fromEntries(
    states.map((s) => [s.name, { label: s.name, start: hex(s.start), length: s.length, encoding: s.bcd ? 'bcd' : 'int', endian: s.little ? 'little' : 'big', nibble: 'both' }]),
  );
  const map = { _metadata: { notes: 'Cyber Pinball : partie entre amis, valeurs lues par l’inspector de VPX (d’après Pinball Memory Maps).' }, cyberpinball: nodes }; // i18n-ignore : note du fichier posé dans le double
  return [
    { rel: 'pinmame/memmaps/index.json', text: JSON.stringify(Object.fromEntries(names.map((g) => [g, INSPECTOR_MAP])), null, 2) },
    { rel: `pinmame/memmaps/${INSPECTOR_MAP}`, text: JSON.stringify(map, null, 2) },
  ];
}

/** Le VPinballX.ini de la partie : celui de la borne, [Plugin.Inspector] activé sur ce port. */
export function iniWithInspector(text: string, port: number): string {
  const eol = /\r\n/.test(text) ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const header = (l: string) => /^\s*\[.*\]\s*$/.test(l);
  const at = lines.findIndex((l) => new RegExp(`^\\s*\\[Plugin\\.${INSPECTOR_PLUGIN}\\]\\s*$`, 'i').test(l));
  const section = ['Enable = 1', `port = ${port}`];
  if (at < 0) {
    while (lines.length && lines.at(-1)!.trim() === '') lines.pop();
    return [...lines, '', `[Plugin.${INSPECTOR_PLUGIN}]`, ...section, ''].join(eol);
  }
  let end = at + 1;
  while (end < lines.length && !header(lines[end]!)) end++;
  const kept = lines.slice(at + 1, end).filter((l) => !/^\s*(enable|port)\s*=/i.test(l));
  return [...lines.slice(0, at + 1), ...section, ...kept, ...lines.slice(end)].join(eol);
}

/**
 * Les réglages que VPX a changés dans la copie pendant la partie, « [Section] clé », pour le journal
 * (l'inspector excepté) : ils partent avec le double, le VPinballX.ini habituel n'est pas touché.
 */
export function iniChanges(before: string, after: string): string[] {
  const read = (text: string) => {
    const values = new Map<string, string>();
    let section = '';
    for (const line of text.split(/\r?\n/)) {
      const head = /^\s*\[(.*)\]\s*$/.exec(line);
      if (head) section = head[1]!;
      else {
        const kv = /^\s*([^=;#]+?)\s*=\s*(.*?)\s*$/.exec(line);
        if (kv && section.toLowerCase() !== `plugin.${INSPECTOR_PLUGIN.toLowerCase()}`) values.set(`[${section}] ${kv[1]}`, kv[2]!);
      }
    }
    return values;
  };
  const a = read(before);
  const b = read(after);
  return [...new Set([...a.keys(), ...b.keys()])].filter((k) => (a.get(k) ?? '') !== (b.get(k) ?? ''));
}
