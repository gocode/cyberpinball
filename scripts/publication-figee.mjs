// Une publication porte un seul état du code : celui du commit « Version … » (ou de HEAD au départ).
//
// Le dossier principal reçoit les fusions des autres sessions pendant qu'une publication fabrique
// ses installeurs (une vingtaine de minutes). Le 17/11/2026, la 0.1.14 a été fabriquée sur le commit
// de version, mais l'instantané envoyé sur GitHub a pris HEAD au moment de l'envoi : trois fusions
// arrivées entre-temps (Mes badges, cadrage des tables reprises) sont parties dans le code public
// sans être dans les installeurs ni dans le CHANGELOG. Une fusion qui tombe pendant la fabrication
// peut aussi mêler deux états dans les installeurs eux-mêmes (fichiers copiés avant et après).
//
// D'où : publier.mjs retient le commit figé, envoie l'instantané de ce commit-là (jamais HEAD), et
// s'arrête avant toute release si un fichier que la fabrication embarque a changé pendant qu'elle
// tournait.

/** Fichiers que la fabrication n'embarque jamais : un changement de ces seuls fichiers ne gêne pas. */
const NOT_BUILT = /^(?:docs\/|interne\/|hors-depot\/|changements\/|video\/|[^/]+\.md$)/i;

/** Parmi des chemins du dépôt (séparés par « / »), ceux que la fabrication peut embarquer. */
export function buildInputs(files) {
  return files.filter((f) => f && !NOT_BUILT.test(f));
}

/**
 * Le dossier a-t-il changé depuis le commit figé, pour un fichier que la fabrication embarque ?
 * `git` : (args) => sortie texte de git dans le dépôt. Rend le message d'arrêt, ou undefined.
 */
export function frozenProblem(git, frozen) {
  const head = git(['rev-parse', 'HEAD']).trim();
  const moved = head === frozen ? [] : git(['diff', '--name-only', frozen, head]).split('\n').map((l) => l.trim());
  const dirty = git(['status', '--porcelain', '--untracked-files=no'])
    .split('\n')
    .map((l) => l.slice(3).trim().replace(/^.* -> /, ''));
  const inputs = [...new Set(buildInputs([...moved, ...dirty]))];
  if (!inputs.length) return undefined;
  const shown = inputs.slice(0, 8).join(', ') + (inputs.length > 8 ? `, et ${inputs.length - 8} autre(s)` : '');
  const how = head === frozen ? 'des modifications non enregistrées' : `HEAD est passé de ${frozen.slice(0, 7)} à ${head.slice(0, 7)} (une fusion)`;
  return `le dossier a changé pendant la fabrication : ${how}, sur des fichiers que les installeurs embarquent (${shown}). Les installeurs peuvent mêler deux états du code ; rien n'est publié. Relancez la même commande : le numéro de version est repris.`;
}
