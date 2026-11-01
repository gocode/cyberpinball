// Catalogue anglais : réglages en partie (position du DMD, menu de VPX). Clé : le texte français tel qu'il est passé à t() ou tn().
export const messages: Record<string, string> = {
  // packages/core/src/cabinetvolume.ts (volume de la borne, au menu comme en partie)
  Volume: 'Volume',
  'Son coupé': 'Sound muted',
  '{up} ou {mute} pour le rétablir ({percent} %)': '{up} or {mute} to restore it ({percent}%)',
  '{up} pour le rétablir ({percent} %)': '{up} to restore it ({percent}%)',

  // packages/core/src/buttons.ts (aide-mémoire de la partie)
  'Position du DMD, menu de VPX': 'DMD position, VPX menu',

  // packages/core/src/dmdplace.ts
  Format: 'Format',
  DMD: 'DMD',
  'Enregistrer pour cette table': 'Save for this table',
  'Revenir à la position générale': 'Back to the general position',
  'Tous les réglages de VPX': 'All VPX settings',
  'Reprendre la partie': 'Resume the game',
  'Cette table suit de nouveau la position générale de la configuration « {name} ».': 'This table follows the general position of the “{name}” configuration again.',
  'Cette table n’a pas de position à elle : elle suit déjà la position générale.': 'This table has no position of its own: it already follows the general position.',
  'Un seul écran branché.': 'Only one screen connected.',
  'DMD masqué : affichez-le d’abord (ligne « DMD »).': 'DMD hidden: show it first (“DMD” line).',
  masqué: 'hidden',
  affiché: 'shown',
  'Abandonner les changements': 'Discard the changes',
  'Continuer le réglage': 'Keep adjusting',
  'DMD sur l’écran {n} : relâchez pour l’y laisser.': 'DMD on screen {n}: release to leave it there.',
  '{previous} / {next} : choisir · {confirm} : valider · {exit} : continuer le réglage': '{previous} / {next}: choose · {confirm}: confirm · {exit}: keep adjusting',
  '{previous} / {next} : réduire ou agrandir (maintenir pour aller vite) · {confirm} : valider · {exit} : annuler': '{previous} / {next}: shrink or enlarge (hold to go faster) · {confirm}: confirm · {exit}: cancel',
  '{previous} / {next} : gauche, droite · {up} / {down} : haut, bas (maintenir pour aller vite) · {confirm} : valider · {exit} : annuler':
    '{previous} / {next}: left, right · {up} / {down}: up, down (hold to go faster) · {confirm}: confirm · {exit}: cancel',
  '{previous} / {next} : déplacer (maintenir pour aller vite) · {confirm} : valider · {exit} : annuler': '{previous} / {next}: move (hold to go faster) · {confirm}: confirm · {exit}: cancel',
  '{previous} / {next} : choisir une ligne · {confirm} : l’ouvrir · {exit} : reprendre la partie': '{previous} / {next}: choose a line · {confirm}: open it · {exit}: resume the game',
  'Réglages en partie': 'In-game settings',
  '{table} · configuration « {configuration} »': '{table} · “{configuration}” configuration',
  'Position du DMD · réglée pour cette table': 'DMD position · set for this table',
  'Position du DMD · position générale': 'DMD position · general position',
  'La position du DMD a changé sans être enregistrée.': 'The DMD position changed and hasn’t been saved.',
  'Souris : tirez le DMD pour le déplacer, jusque sur un autre écran ; tirez un coin pour le redimensionner ; Alt maintenu : sans aimantation.':
    'Mouse: drag the DMD to move it, even onto another screen; drag a corner to resize it; hold Alt: no snapping.',
  'DMD masqué · {width} × {height}': 'DMD hidden · {width} × {height}',
  'DMD · {width} × {height} en {x}, {y}': 'DMD · {width} × {height} at {x}, {y}',

  // app/src/in-game-menu.ts et app/renderer/in-game-menu.html
  'Cyber Pinball — Réglages en partie': 'Cyber Pinball — In-game settings',
  'VPX n’a pas ouvert de fenêtre pour le DMD dans cette partie (DMD éteint ou incrusté dans le plateau) : la place choisie se verra à la prochaine partie.':
    'VPX didn’t open a window for the DMD in this game (DMD off or embedded in the playfield): the chosen position will show in the next game.',
  'Aucune touche du clavier n’ouvre le menu de VPX : un bouton de la borne a pris F12.': 'No keyboard key opens the VPX menu: a cabinet button took F12.',
  'Enregistré pour cette table dans la configuration « {name} » : elle s’ouvrira ainsi à chaque partie.': 'Saved for this table in the “{name}” configuration: it will open like this in every game.',
};
