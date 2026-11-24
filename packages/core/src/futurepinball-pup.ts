// PuP-Packs des tables de Future Pinball (24/11/2026). Certaines tables (« PinEvent ») pilotent un PuP-Pack : les vidéos
// du fronton, du DMD et du topper. Future Pinball n'a pas de lecteur à lui : la table appelle le serveur COM
// « PinUpPlayer.PinDisplay » (PinUP Player), inscrit par l'installation de PinUP Popper (ensemble PinUPSystem).
// VPX n'en a pas besoin : son plugin PUP lit les PuP-Packs. Le script d'un .fpt étant compressé, une table PinEvent
// ne se reconnaît qu'à son nom (indice, jamais une certitude). Lecture du registre : app/src/pinup-player.ts.

/** Valeur de LocalServer32 : « "C:\…\PinUpPlayer.exe" /automation » ou le chemin nu. */
export function localServerExe(value: string): string {
  const v = value.trim();
  const quoted = /^"([^"]+)"/.exec(v);
  if (quoted) return quoted[1]!;
  const exe = /^(.+?\.exe)(?=\s|$)/i.exec(v);
  return exe ? exe[1]! : v;
}

/** Nom (titre ou fichier) d'une table qui annonce un PuP-Pack : « PinEvent », « PE », « PuP ». */
export function looksLikePupTable(name: string): boolean {
  return /pin[\s_-]*event|(?:^|[\s_(\[-])pup(?:[\s_)\].-]|pack|$)|(?:^|[\s_(\[-])pe(?:[\s_)\].-]|$)/i.test(name);
}
