// Catalogue anglais : modération des salons (app/src/rooms-menu.ts : signaler, décider, sujet, file
// des signalements ; notices.ts : la notification d'un signalement ; l'entrée « Modération » du menu
// système). Clé : le texte français tel qu'il est passé à t() ou tn().
export const messages: Record<string, string> = {
  // Raisons
  'Insultes ou harcèlement': 'Insults or harassment',
  'Spam ou publicité': 'Spam or advertising',
  'Contenu choquant': 'Shocking content',
  'Informations personnelles': 'Personal information',
  'raison : {reason}': 'reason: {reason}',
  'Pourquoi ? La raison est jointe, et dite au joueur s’il est sanctionné.': 'Why? The reason is attached, and told to the player if they are sanctioned.',

  // Le joueur sanctionné
  'Décision de la modération : vous ne pouvez pas écrire pour l’instant': 'Moderation decision: you cannot write for now',
  'En sourdine jusqu’à {time}': 'Muted until {time}',
  'Exclu des salons par la modération': 'Banned from the rooms by the moderators',
  'décision de la modération': 'moderation decision',
  'message masqué par la modération': 'message hidden by the moderators',

  // Sujet du salon
  'Sujet : {text}': 'Topic: {text}',
  'Sujet du salon…': 'Room topic…',
  'Sujet du salon': 'Room topic',
  'Aucun sujet · modération': 'No topic · moderation',
  'Sujet posé': 'Topic set',
  'Sujet retiré': 'Topic removed',
  'Une ligne, 120 caractères au plus ; vide : plus de sujet.': 'One line, 120 characters at most; empty: no topic.',

  // Signaler
  'Envoyé chiffré aux modérateurs, avec la raison ; {name} ne saura pas qui': 'Sent encrypted to the moderators, with the reason; {name} will not know who',
  'Signalement envoyé aux modérateurs': 'Report sent to the moderators',

  // Décisions
  'Masquer ce message': 'Hide this message',
  'Ne plus masquer ce message': 'Unhide this message',
  'Modération · pour tous les joueurs': 'Moderation · for every player',
  'Message masqué pour tous': 'Message hidden for everyone',
  'Message de nouveau visible': 'Message visible again',
  'Lever la sanction de {name}': 'Lift {name}’s sanction',
  'Exclu des salons': 'Banned from the rooms',
  'Sanction levée': 'Sanction lifted',
  'Sourdine 1 h': 'Mute 1 h',
  'Sourdine 24 h': 'Mute 24 h',
  'Sourdine 7 jours': 'Mute 7 days',
  'Lecture seule dans tous les salons, et le message masqué': 'Read only in every room, and the message hidden',
  '{name} en sourdine': '{name} muted',
  'Exclure des salons': 'Ban from the rooms',
  'Sans limite de durée, et le message masqué': 'With no time limit, and the message hidden',
  '{name} exclu des salons': '{name} banned from the rooms',
  'Classer sans suite': 'Dismiss',
  'Rien n’est appliqué ; le signalement sort de la file': 'Nothing is applied; the report leaves the queue',

  // File des signalements
  'Modération': 'Moderation',
  'Signalements': 'Reports',
  'Signalements ({n})': 'Reports ({n})',
  'Modération : les lignes signalées, à traiter': 'Moderation: the reported lines, to handle',
  'Signalement de la ligne de {name}': 'Report on {name}’s line',
  '{n} signalement': '{n} report',
  '{n} signalements': '{n} reports',
  '{n} message à traiter': '{n} message to handle',
  '{n} messages à traiter': '{n} messages to handle',
  'Vos décisions sont signées de votre clé de modérateur et appliquées par toutes les bornes. Le joueur signalé ne sait pas qui l’a signalé.': 'Your decisions are signed with your moderator key and applied by every cabinet. The reported player does not know who reported them.',
  'Rien à traiter': 'Nothing to handle',
  'Déjà traité': 'Already handled',
  'Ligne de {name}': '{name}’s line',
  'Signalé par ({n})': 'Reported by ({n})',
  '{n} message signalé à traiter': '{n} reported message to handle',
  '{n} messages signalés à traiter': '{n} reported messages to handle',

  // Notification
  'Signalement · {room}': 'Report · {room}',
  '{n} signalement à traiter': '{n} report to handle',
  '{n} signalements à traiter': '{n} reports to handle',
};
