// Pastille d'un joueur (packages/core/src/avatar.ts, AvatarView) : partagée par les écrans du menu
// (library.js), les notifications (frontend.js) et les fenêtres posées pendant la partie
// (game-notice.js). Son image, sinon ses initiales sur la teinte tirée de sa clé (la même sur
// toutes les bornes) ; la taille et l'anneau viennent du CSS de chaque fenêtre (classe `avatar`).

/**
 * Pastille ronde d'un joueur. Une image qui ne se lit pas (fichier rangé entre-temps) laisse les
 * initiales, jamais un carré vide.
 */
function avatarNode(a, className) {
  const node = document.createElement('span');
  node.className = className ? `avatar ${className}` : 'avatar';
  node.style.setProperty('--avatar-hue', String(Number(a?.hue) || 0));
  const initials = document.createElement('span');
  initials.className = 'avatar-initials';
  initials.textContent = a?.initials ?? '?';
  node.append(initials);
  if (a?.src) {
    const img = document.createElement('img');
    img.className = 'avatar-image';
    img.alt = '';
    img.draggable = false;
    img.addEventListener('error', () => img.remove());
    img.src = a.src;
    node.append(img);
  }
  return node;
}
