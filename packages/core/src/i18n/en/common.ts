// Catalogue anglais : common (langue de l'interface, textes partagés).
// Clé : le texte français tel qu'il est passé à t() ou tn().
export const messages: Record<string, string> = {
  'Langue / Language': 'Language / Langue',
  'Langue / Language : {name}': 'Language / Langue: {name}',
  'Langue de tous les écrans de Cyber Pinball : menu, fiches, assistant et réglages.': 'Language of every Cyber Pinball screen: menu, game pages, setup wizard and settings.',
  'Langue actuelle': 'Current language',
  'Français ou anglais, pour tous les écrans': 'French or English, for every screen',
  Retour: 'Back',

  // Demandes d’autorisation de Windows, prévenues avant (uac-confirm.ts)
  'Plus tard, au bureau': 'Later, at the desk',
  'Continuer : Windows demande l’autorisation': 'Continue: Windows asks for permission',
  'Windows va demander une autorisation': 'Windows is going to ask for permission',
  'Répondez au clavier ou à la souris : Alt+O pour Oui, Échap pour Non. Les boutons de la borne n’y peuvent rien : Windows refuse toute réponse qui ne vient pas d’un vrai clavier ou d’une vraie souris. Sans réponse dans les {min} minutes, Cyber Pinball cesse d’attendre.': 'Answer with the keyboard or the mouse: Alt+Y for Yes, Esc for No. The cabinet buttons cannot do it: Windows refuses any answer that does not come from a real keyboard or a real mouse. With no answer within {min} minutes, Cyber Pinball stops waiting.',
  'Pas de réponse à la demande de Windows en {min} minutes : Cyber Pinball n’attend plus. Si elle est encore affichée, répondez Non (Échap).': 'No answer to the Windows request within {min} minutes: Cyber Pinball no longer waits. If it is still shown, answer No (Esc).',
  'Activer la borne dédiée pour ce compte (Shell Launcher).': 'Enable the dedicated cabinet for this account (Shell Launcher).',
  'Désactiver la borne dédiée et rétablir le bureau.': 'Disable the dedicated cabinet and restore the desktop.',
  'Terminer l’activation de la borne dédiée.': 'Finish enabling the dedicated cabinet.',
  'Annuler et rétablir le bureau.': 'Cancel and restore the desktop.',
  'Lancer Cyber Pinball au démarrage de Windows, bureau masqué.': 'Start Cyber Pinball with Windows, desktop hidden.',
  'Remplacer le bureau de Windows par Cyber Pinball pour ce compte.': 'Replace the Windows desktop with Cyber Pinball for this account.',
  'Remettre les réglages de Windows d’avant.': 'Put back the previous Windows settings.',
  'Autoriser Cyber Pinball dans le pare-feu de Windows : ouvert aux autres bornes, VPX fermé au réseau.': 'Allow Cyber Pinball in the Windows firewall: open to other cabinets, VPX closed to the network.',
  'Installer le pilote de la Kinect (Microsoft), sans fenêtre.': 'Install the Kinect driver (Microsoft), with no window.',
};
