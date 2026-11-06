// Pointeur du téléphone (remote-pointer.html) : flash() fait partir l'anneau d'un clic (phone-remote.ts).
window.flash = () => {
  const ring = document.getElementById('ring');
  ring.classList.remove('on');
  void ring.offsetWidth;
  ring.classList.add('on');
};
