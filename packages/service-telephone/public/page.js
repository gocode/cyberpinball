// Page du raccourci qui suit la borne (https://t.cyberpinball.com/b/<id>#g=<clé>), servie par le
// service de l'adresse stable (worker.mjs). Elle retrouve la borne sur le réseau local et y renvoie le
// téléphone, sa clé dans le fragment :
// 1. la clé du téléphone gardé est lue dans le fragment de l'adresse (#g=…), que le navigateur
//    n'envoie jamais : ni le service ni personne d'autre ne la voit ;
// 2. la déclaration de la borne (GET /api/b/<id>) est lue, et l'entrée de ce téléphone déchiffrée ici,
//    avec sa clé (ChaCha20-Poly1305, telephone-core.js, le même que la page de la borne) ;
// 3. la page part vers http://<adresse locale>:<port>/#g=<clé>&d=1 ; la page de la borne retrouve
//    ainsi la clé, quelle que soit son adresse.
// Le service injoignable (pas d'Internet, panne) : la dernière adresse trouvée par ce téléphone,
// gardée dans son stockage (sw.js garde la page elle-même). La page ne garde jamais la clé.
// « r=1 » : la page de la borne y envoie pour créer le raccourci ; elle explique comment l'ajouter à
// l'écran d'accueil, puis ouvre la télécommande.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.cyberRelayPage = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TEXTS = {
    fr: {
      searching: 'Recherche de la borne…',
      searchingText: 'Le téléphone et la borne doivent être sur le même Wi-Fi.',
      installTitle: 'Ajoutez ce raccourci à l’écran d’accueil',
      installText: 'Il retrouve la borne même si le routeur change son adresse, sans QR code.',
      howIphone: 'Dans Safari : touchez Partager, puis « Sur l’écran d’accueil ».',
      howAndroid: 'Dans le menu du navigateur (⋮) : « Ajouter à l’écran d’accueil ». Supprimez ensuite l’ancien raccourci.',
      howOther: 'Dans le menu du navigateur : « Ajouter à l’écran d’accueil ».',
      open: 'Ouvrir la télécommande',
      retry: 'Réessayer',
      lostTitle: 'Borne introuvable',
      lostText: 'Vérifiez que Cyber Pinball est ouvert sur la borne et que la borne est reliée à Internet. Sinon, scannez le QR code de la borne : Menu système > Borne > Télécommande du téléphone.',
      forgottenTitle: 'Ce téléphone n’est plus reconnu',
      forgottenText: 'La borne l’a oublié. Pour le connecter de nouveau : Menu système > Borne > Télécommande du téléphone, puis scannez le QR code.',
      noKeyTitle: 'Télécommande de Cyber Pinball',
      noKeyText: 'Cette page s’ouvre depuis le raccourci que la borne propose au téléphone. Sur la borne : Menu système > Borne > Télécommande du téléphone, puis scannez le QR code.',
    },
    en: {
      searching: 'Looking for the cabinet…',
      searchingText: 'The phone and the cabinet must be on the same Wi-Fi.',
      installTitle: 'Add this shortcut to your home screen',
      installText: 'It finds the cabinet even if the router changes its address, with no QR code.',
      howIphone: 'In Safari: tap Share, then “Add to Home Screen”.',
      howAndroid: 'In the browser menu (⋮): “Add to Home screen”. Then delete the old shortcut.',
      howOther: 'In the browser menu: “Add to Home screen”.',
      open: 'Open the remote',
      retry: 'Try again',
      lostTitle: 'Cabinet not found',
      lostText: 'Check that Cyber Pinball is open on the cabinet and that the cabinet is connected to the Internet. Otherwise, scan the cabinet’s QR code: System menu > Cabinet > Phone remote.',
      forgottenTitle: 'This phone is no longer recognised',
      forgottenText: 'The cabinet forgot it. To connect it again: System menu > Cabinet > Phone remote, then scan the QR code.',
      noKeyTitle: 'Cyber Pinball remote',
      noKeyText: 'This page opens from the shortcut the cabinet offers to the phone. On the cabinet: System menu > Cabinet > Phone remote, then scan the QR code.',
    },
  };

  /** Langue de la page : celle du téléphone, français ou anglais. */
  function language(languages) {
    const first = String((languages && languages[0]) || 'en').toLowerCase();
    return first.startsWith('fr') ? 'fr' : 'en';
  }

  /** Ce que porte l'adresse : l'identifiant de la borne, la clé du téléphone (fragment), le mode « créer le raccourci ». */
  function parse(location, core) {
    const m = /^\/b\/([A-Za-z0-9_-]{22})\/?$/.exec(location.pathname);
    const params = new URLSearchParams(String(location.hash || '').slice(1));
    const key = core.fromB64(params.get('g') || '');
    return { id: m ? m[1] : '', key: key && key.length === 32 ? key : null, install: params.get('r') === '1' };
  }

  /** Une adresse vers laquelle la page accepte de renvoyer : IPv4 privée et port (relayAddressOk, remote-relay.ts). */
  function localAddress(host, port) {
    if (typeof host !== 'string' || typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) return false;
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
    if (!m) return false;
    const [a, b, c, d] = m.slice(1).map(Number);
    if ([a, b, c, d].some((x) => x > 255)) return false;
    return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }

  /**
   * L'adresse de la borne pour ce téléphone, déchiffrée de la déclaration ({ b, s }) : { host, port, t },
   * 'absent' (la borne ne connaît pas ce téléphone), ou null (déclaration illisible, autre borne).
   * Même calcul que relayOpen (remote-relay.ts).
   */
  function openEntry(core, key, id, payload) {
    let body;
    try {
      body = JSON.parse(payload.b);
    } catch {
      return null;
    }
    if (!body || body.id !== id || !Array.isArray(body.e)) return null;
    const f = core.keptFingerprint(key);
    const entry = body.e.find((x) => x && x.f === f);
    if (!entry) return 'absent';
    const raw = core.fromB64(entry.c);
    if (!raw || raw.length < 28) return null;
    const plain = core.aeadOpen(key, raw.subarray(0, 12), new TextEncoder().encode(`cyberpinball:adresse:${id}`), raw.subarray(12));
    if (!plain) return null;
    try {
      const a = JSON.parse(new TextDecoder().decode(plain));
      return localAddress(a.h, a.p) && typeof a.t === 'number' ? { host: a.h, port: a.p, t: a.t } : null;
    } catch {
      return null;
    }
  }

  /** La page de la borne, la clé dans le fragment (jamais envoyée sur le réseau). */
  function target(core, host, port, key) {
    return `http://${host}:${port}/#g=${core.toB64(key)}&d=1`;
  }

  const MEMORY = (id) => `cyberpinball.adresse.${id}`;

  function remembered(storage, id) {
    try {
      const a = JSON.parse(storage.getItem(MEMORY(id)) || 'null');
      return a && localAddress(a.host, a.port) ? a : null;
    } catch {
      return null;
    }
  }

  function remember(storage, id, address) {
    try {
      if (address) storage.setItem(MEMORY(id), JSON.stringify({ host: address.host, port: address.port, t: address.t }));
      else storage.removeItem(MEMORY(id));
    } catch {
      // Stockage refusé (navigation privée) : rien de gardé, la page demande au service à chaque fois.
    }
  }

  /**
   * Où envoyer le téléphone : { kind: 'go', url, from: 'service' | 'memoire' }, { kind: 'forgotten' }
   * ou { kind: 'lost' }. Une seule requête : GET /api/b/<id>, sans clé ni empreinte.
   */
  async function locate(env) {
    const { core, id, key, storage } = env;
    let address;
    const ctl = typeof AbortController === 'function' ? new AbortController() : undefined;
    const timer = setTimeout(() => ctl && ctl.abort(), env.timeoutMs || 6000);
    try {
      const r = await env.fetch(`/api/b/${id}`, { cache: 'no-store', credentials: 'omit', signal: ctl && ctl.signal });
      if (r.status === 200) {
        const opened = openEntry(core, key, id, await r.json());
        if (opened === 'absent') {
          remember(storage, id, null);
          return { kind: 'forgotten' };
        }
        address = opened || undefined;
      }
    } catch {
      // Service injoignable : la dernière adresse connue.
    } finally {
      clearTimeout(timer);
    }
    if (address) {
      remember(storage, id, address);
      return { kind: 'go', url: target(core, address.host, address.port, key), from: 'service' };
    }
    const last = remembered(storage, id);
    if (last) return { kind: 'go', url: target(core, last.host, last.port, key), from: 'memoire' };
    return { kind: 'lost' };
  }

  function how(userAgent, tx) {
    if (/iPhone|iPad|iPod/.test(userAgent)) return tx.howIphone;
    if (/Android/.test(userAgent)) return tx.howAndroid;
    return tx.howOther;
  }

  /** La page dans le navigateur. */
  function start(win) {
    const doc = win.document;
    const core = win.cyberRemoteCore;
    const tx = TEXTS[language(win.navigator.languages || [win.navigator.language])];
    doc.documentElement.lang = tx === TEXTS.fr ? 'fr' : 'en';
    const show = (title, text, actions = []) => {
      doc.getElementById('title').textContent = title;
      doc.getElementById('text').textContent = text;
      doc.getElementById('actions').replaceChildren(
        ...actions.map((a) => {
          const b = doc.createElement('button');
          b.type = 'button';
          b.className = a.primary ? 'primary' : '';
          b.textContent = a.label;
          b.addEventListener('click', a.run);
          return b;
        }),
      );
      doc.body.dataset.busy = actions.length ? '' : '1';
    };
    const { id, key, install } = parse(win.location, core);
    if (!id || !key) return show(tx.noKeyTitle, tx.noKeyText);
    // L'adresse du raccourci garde la clé (l'iPhone donne au raccourci un stockage à part), sans « r=1 ».
    win.history.replaceState(null, '', `${win.location.pathname}#g=${core.toB64(key)}`);
    const go = async () => {
      show(tx.searching, tx.searchingText);
      const where = await locate({ core, id, key, storage: win.localStorage, fetch: win.fetch.bind(win) });
      if (where.kind === 'go') return win.location.replace(where.url);
      if (where.kind === 'forgotten') return show(tx.forgottenTitle, tx.forgottenText);
      show(tx.lostTitle, tx.lostText, [{ label: tx.retry, primary: true, run: go }]);
    };
    if (install) return show(tx.installTitle, `${tx.installText}\n\n${how(win.navigator.userAgent, tx)}`, [{ label: tx.open, primary: true, run: go }]);
    void go();
  }

  return { TEXTS, language, parse, localAddress, openEntry, target, locate, start, MEMORY };
});

// Dans le navigateur : la page démarre, et garde de quoi s'ouvrir sans Internet (sw.js).
if (typeof window !== 'undefined' && window.document && window.cyberRemoteCore) {
  window.cyberRelayPage.start(window);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => undefined);
}
