// Son des pages web de la fenêtre « Récupérer » (acquire-window.ts) sur la sortie de la
// borne. Electron n'a pas de sortie audio par fenêtre : chaque élément <audio> ou <video>
// d'une page part sur la sortie par défaut de Windows, qui n'est pas forcément branchée à
// la borne (PinCab : écran HDMI sans haut-parleurs, vibreurs). Le script ci-dessous, joué
// dans chaque cadre chargé, retrouve la sortie par son nom Windows (comme menu-audio.js)
// et y envoie tout élément de la page, présent ou à venir (événement play, en capture).

/**
 * Code à exécuter dans un cadre de page web ; rejouable sans effet de plus (un seul
 * écouteur par document). Sa valeur : l'identifiant Chromium de la sortie trouvée, '' si
 * elle est introuvable (le son reste alors sur la sortie par défaut).
 */
export function audioSinkScript(outputName: string): string {
  return `(() => {
  const name = ${JSON.stringify(outputName)};
  const USB_IDS = / \\([0-9a-f]{4}:[0-9a-f]{4}\\)$/i;
  const state = window.__cyberpinballSink || (window.__cyberpinballSink = { id: '' });
  const route = (el) => {
    if (state.id && el && typeof el.setSinkId === 'function' && el.sinkId !== state.id) el.setSinkId(state.id).catch(() => {});
  };
  const routeAll = () => document.querySelectorAll('audio, video').forEach(route);
  if (!state.listening) {
    state.listening = true;
    document.addEventListener('play', (e) => route(e.target), true);
  }
  if (state.name === name) {
    routeAll();
    return state.id;
  }
  state.name = name;
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return '';
  return navigator.mediaDevices.enumerateDevices().then((devices) => {
    const hit = devices.find((d) => d.kind === 'audiooutput' && d.deviceId !== 'default' && d.deviceId !== 'communications' && (d.label === name || d.label.replace(USB_IDS, '') === name));
    state.id = hit ? hit.deviceId : '';
    routeAll();
    return state.id;
  }, () => '');
})()`;
}
