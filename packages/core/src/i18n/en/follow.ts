// Catalogue anglais : « Nous suivre » (packages/core/src/follow.ts, app/src/follow-menu.ts, le menu ⋮
// du téléphone, la question de sortie de l'assistant).
// Clé : le texte français tel qu'il est passé à t() ou tn().
export const messages: Record<string, string> = {
  // packages/core/src/follow.ts
  'Les nouveautés et tes questions': 'News and your questions',
  'Les tutoriels vidéo, pas à pas': 'Step-by-step video tutorials',
  'Les versions et le code source': 'Releases and source code',
  // app/src/follow-menu.ts, app/src/library.ts
  'Nous suivre': 'Follow us',
  '{name} sur ton téléphone': '{name} on your phone',
  'Tutoriels vidéo, nouveautés, réponses à tes questions : retrouve Cyber Pinball ici. Start ouvre la page ; son QR code l’ouvre sur ton téléphone.':
    'Video tutorials, news, answers to your questions: find Cyber Pinball here. Start opens the page; its QR code opens it on your phone.',
  'Vise ce code avec ton téléphone pour ouvrir la page.': 'Point your phone at this code to open the page.',
  'Tutoriels vidéo, nouveautés, questions': 'Video tutorials, news, questions',
  '{name} de Cyber Pinball. Fermer (Échap) revient au front-end.': 'Cyber Pinball on {name}. Close (Esc) returns to the front-end.',
  // app/renderer/telephone/telephone.js
  'Tutoriels vidéo, nouveautés, réponses à tes questions : retrouve Cyber Pinball ici.': 'Video tutorials, news, answers to your questions: find Cyber Pinball here.',
  // app/src/wizard.ts, app/renderer/screen.js
  'Bloqué ? Les tutoriels vidéo, pas à pas': 'Stuck? Step-by-step video tutorials',
  'QR code des tutoriels vidéo': 'QR code of the video tutorials',
};
