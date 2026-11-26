import { contextBridge, ipcRenderer } from 'electron';

// Préchargement de chaque page de la session du navigateur intégré (acquire-window.ts), avant ses
// propres scripts. WebAuthn y est déjà retiré (disableBlinkFeatures) : la page qui le cherche ne le
// trouve pas et propose le mot de passe. Mais une page qui demande une clé d'accès sans vérifier
// attendait sans fin la réponse de navigator.credentials : la demande est ici refusée sur-le-champ
// (NotAllowedError, le refus de l'utilisateur), et la page passe à une autre méthode.
//
// Appareil photo et micro (getUserMedia), que la borne ne sert pas : refusés sur-le-champ aussi.
// Chromium démarrait d'abord ses services de périphériques, puis seulement demandait l'autorisation à
// la borne ; sur une machine chargée, la page attendait le refus plus de 30 s (banc du 26/11/2026). Le
// refus est signalé à la borne, qui le note (un événement au nom tiré au sort : la page n'y lit rien).
// Rien d'autre n'est touché ; rien de Cyber Pinball n'est exposé à la page.
const mediaRefused = `r${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
document.addEventListener(mediaRefused, () => ipcRenderer.send('acquire:media-refused'));
try {
  contextBridge.executeInMainWorld({
    func: (refusedEvent: string) => {
      const nav = (globalThis as { navigator?: { credentials?: object; mediaDevices?: object } }).navigator;
      const credentials = nav?.credentials;
      if (credentials) {
        const proto = Object.getPrototypeOf(credentials) as Record<string, unknown>;
        for (const name of ['get', 'create']) {
          const original = proto[name];
          if (typeof original !== 'function') continue;
          Object.defineProperty(proto, name, {
            configurable: true,
            writable: true,
            value: function (this: unknown, options?: unknown, ...rest: unknown[]) {
              if (options && typeof options === 'object' && 'publicKey' in options) return Promise.reject(new DOMException('Passkeys are not available in this browser.', 'NotAllowedError')); // i18n-ignore : réponse à la page
              return (original as (...a: unknown[]) => unknown).call(this, options, ...rest);
            },
          });
        }
      }
      const devices = nav?.mediaDevices;
      if (devices) {
        const proto = Object.getPrototypeOf(devices) as Record<string, unknown>;
        if (typeof proto.getUserMedia === 'function')
          Object.defineProperty(proto, 'getUserMedia', {
            configurable: true,
            writable: true,
            value: function () {
              document.dispatchEvent(new Event(refusedEvent));
              return Promise.reject(new DOMException('Permission denied', 'NotAllowedError')); // i18n-ignore : réponse à la page
            },
          });
      }
    },
    args: [mediaRefused],
  });
} catch {
  // Page sans monde principal accessible (document spécial) : WebAuthn y reste absent de toute façon.
}
