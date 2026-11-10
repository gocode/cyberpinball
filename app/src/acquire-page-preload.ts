import { contextBridge } from 'electron';

// Préchargement de chaque page de la session du navigateur intégré (acquire-window.ts), avant ses
// propres scripts. WebAuthn y est déjà retiré (disableBlinkFeatures) : la page qui le cherche ne le
// trouve pas et propose le mot de passe. Mais une page qui demande une clé d'accès sans vérifier
// attendait sans fin la réponse de navigator.credentials : la demande est ici refusée sur-le-champ
// (NotAllowedError, le refus de l'utilisateur), et la page passe à une autre méthode. Rien d'autre
// n'est touché ; rien de Cyber Pinball n'est exposé à la page.
try {
  contextBridge.executeInMainWorld({
    func: () => {
      const credentials = (globalThis as { navigator?: { credentials?: object } }).navigator?.credentials;
      if (!credentials) return;
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
    },
  });
} catch {
  // Page sans monde principal accessible (document spécial) : WebAuthn y reste absent de toute façon.
}
