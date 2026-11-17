[Français](../manuel/telephone-garde.md) · English · [Manual contents](../manual.md)

## Kept phone

Once accepted at the cabinet, a phone is **kept**: it then comes back without a QR code or acceptance, from a shortcut on its Home screen.
Nothing to install, no app store: the page is still the one the cabinet serves, on every phone (Android, iPhone).

- **Kept key**: on acceptance (Start), the phone's session key becomes its own.
  The cabinet stores it in `<root>\data\telephones.json` (`packages/core/src/remote-kept.ts`: phone name, day added, last visit; **eight at most**, the one seen longest ago gives way; an unreadable file is set aside, `telephones.illisible-<date>.json`).
  The phone stores it in its browser storage and in the page address (`#g=…`): the Home screen shortcut carries it, which matters on iPhone, where the Home screen app has separate storage.
  No app manifest: its start address would lose the key.
  Cabinet backups take the file along with its settings.
- **Continuous listening**: as long as the cabinet keeps a phone, it listens from startup, in the menu as in a game, on a **fixed port**, `47820` (`REMOTE_PORT`): the phone's browser stores the key per address and port, a changing port would make it lose the key.
  Port already taken by another program: a free port, the QR code still works, a kept phone must scan it again (log).
  Only kept keys open the link: an unknown phone still reads the QR code and waits to be accepted.
  The network rules do not change (local network addresses only, Cyber Pinball's firewall rule, 127.0.0.1 during a test).
  No kept phone left and no QR code shown: nothing listens any more.
- **One in control**: the last kept phone to connect takes over, even from another that was in control or waiting to be accepted; the other shows “Un autre téléphone a pris la main” (Another phone took over) and does not reconnect by itself (otherwise both would keep taking it back).
- **On the phone**: right after acceptance, once, “Gardez la télécommande sous la main” (Keep the remote at hand) explains how to add the page to the Home screen (Safari: Share, “Add to Home Screen”; Android: ⋮ menu, “Add to Home screen”); afterwards in “Plus” (More).
  Cyber Pinball icon, opaque on the teal black: `/icone-180.png` for iPhone (`apple-touch-icon`, which rounds the corners itself), `/icone-192.png` for Android; they are stored with the phone page, like everything it serves, so they ship with the application and its light updates (`scripts/icone.mjs` regenerates them).
  Full screen on iPhone (`apple-mobile-web-app-capable`).
  Cut at the cabinet (“Déconnecter”), after 20 minutes without a gesture, or replaced by another phone: **“Reprendre” (Resume)** comes back in one tap, without a QR code.
  Cyber Pinball closed: “Ce téléphone se reconnectera tout seul dès que Cyber Pinball sera relancé” (This phone will reconnect by itself as soon as Cyber Pinball is started again; one try every 5 s).
  Forgotten at the cabinet: “Ce téléphone n’est plus reconnu” (This phone is no longer recognised), its key is erased.
- **At the cabinet**: System menu > Cabinet > Phone remote, “Téléphones gardés” (Kept phones) section: each phone, “Accepté le … · vu …” (Accepted on … · seen …), “Pilote maintenant” (In control now) for the one in control.
  Choosing it opens “Oublier ce téléphone ?” (Forget this phone?); forgotten, it will have to scan the QR code and be accepted again (disconnected if it was in control). “Déconnecter le téléphone” (Disconnect the phone) does not forget it.
- **Full screen on Android**: Chrome opens the shortcut of an HTTP page in a tab, address bar included (only an installable HTTPS page opens without it).
  The page therefore asks for full screen (Fullscreen API, `navigationUI: 'hide'`) at the first tap, and again after an unwanted exit (another app, screen locked: the page goes to the background).
  Left on purpose (Chrome's "swipe to exit" gesture, or "Quitter le plein écran" (Exit full screen) in the ⋮ menu), it is no longer taken back by itself, from one visit to the next: the **"Plein écran"** (Full screen) entry of the ⋮ menu brings it back.
  The "swipe to exit" warning is Chrome's own, at every entry into full screen: the page can neither hide nor replace it, hence requests as rare as possible.
  The tap also does what it touches: the request goes when the finger lifts, preventing nothing.
  The height follows the visible area: nothing jumps at the switch, the phone keyboard, the sheets and the ⋮ menu stay usable, the field that has the keyboard keeps it.
  Nothing on iPhone (the shortcut is already full screen there), nor when the browser has no full screen; refused by the browser, it is not asked again during the visit.
  The other ways (HTTPS on the local network, an installable public page) were set aside: a name and certificate service to run, routers that block private addresses, a relay on the Internet.
- **Remote port**: the phone's browser stores the kept key by address **and port**; another port, and the shortcut no longer finds it.
  At a handover (update, restart), the new Cyber Pinball starts while the old one still holds port 47820: it waits for the port to be released (up to 45 s, one try per second, `PORT_WAIT_MS`) and takes it back.
  A free port only as a last resort, if another program keeps it: the log says so, and so does the remote screen ("Port habituel pris par un autre programme : les téléphones gardés doivent scanner ce QR une fois", usual port taken by another program: kept phones must scan this QR code once).
  Outdated listening (remote put to sleep or restarted meanwhile) leaves no server open and never replaces the one listening.
  Incident of 11/11/2026 (0.1.9-essai.72): the kept phone had to rescan the QR code after every update.
- **Cabinet address**: the QR code gives the cabinet's IP address, which the router's DHCP can change at a restart; the phone's shortcut then leads to the old one, and the browser's storage, kept by address, doesn't follow.
  Incident of 12/11/2026: PinCab restarted, moved from 192.168.68.54 to .52, QR code to rescan.
  The cabinet remembers its address (`telephones.json`): if it changes while it keeps phones, the log says so, and so does the remote screen ("Adresse de la borne changée : un téléphone gardé par l'ancienne adresse doit scanner ce QR une fois", cabinet address changed: a phone kept by the old address must scan this QR code once).
- **Cabinet name** (`remote-name.ts`, `app/src/mdns-responder.ts`): Cyber Pinball announces its own name on the local network, `cyberpinball.local`, through its own mDNS responder, never the Windows machine name.
  It probes first (three queries, 250 ms apart): if another cabinet already has this name, it takes `cyberpinball-2.local`, then -3…; the chosen name is remembered (`telephones.json`, `name`) and asked for first at the next start.
  Then it announces itself and answers only to that name, with its address, by multicast, unicast (QU bit) or legacy style (a question from a port other than 5353).
  It shares UDP 5353 with the Windows DNS Client service; CyberPinball.exe already has its inbound firewall rule, nothing else to allow, neither the Windows mDNS rule, nor its `EnableMDNS` setting, nor the network profile.
  If another device starts answering to the same name, it takes another one.
  A kept phone receives this name; the page, opened by the address, asks the machine this name designates to prove it keeps its key (`GET /nom`: the key's fingerprint and a random challenge; answer `keptNameProof`, the ChaCha20-Poly1305 tag of a fixed text under the key and the challenge).
  Once proven, it goes through the name, the key in the address fragment, never towards a machine that hasn't proven it; an already kept phone is asked once to redo its shortcut.
  **What the name doesn't do**: Android browsers (Chrome, Brave) don't find `.local` names (test of 12/11/2026, Android and Brave: never went through the name); only the iPhone (Safari) and computers find it.
  The page then tells the cabinet what it got (`name` message: moved, unreachable, another cabinet), says it once to the user, and always in the ⋮ menu ("Adresse de la borne : …", cabinet address, and why); the cabinet writes it in the log and in Health ("Télécommande du téléphone", phone remote line).
  An Android phone stays on the IP address: the stable address over the Internet (next point) follows that change.
  Another cabinet with the same name: its refusal of the proof is readable by the page (CORS on the 404), which says so.
  A tab left open on the old address, unreachable, looks for the cabinet by its remembered name (`cyberpinball.nom`), with the proof.
  Tests: `telephone-nom.test.ts` (responder on a simulated network: no packet leaves).
- **Stable address over the Internet** (`packages/core/src/remote-relay.ts`, `app/src/phone-relay.ts`, service `packages/service-telephone`): so that an Android phone finds the cabinet again when the router changes its address, without a QR code.
  The cabinet declares its local address and port to the project's service, `https://t.cyberpinball.com`, under an identifier derived from its own Ed25519 key (seed in `telephones.json`, separate from the player's identity among friends).
  The declaration contains nothing readable: for each kept phone, the address and port are sealed with ChaCha20-Poly1305 under that phone's key (associated data bound to the cabinet's identifier), with the key's fingerprint (`keptFingerprint`) so that the phone finds its entry.
  The whole is signed and dated: the service (Cloudflare Workers, KV) checks that the public key gives the identifier, the signature, the clock (10 min apart at most) and that the date moves forward; nothing else writes under that identifier.
  Only a private IPv4 address (10/8, 172.16/12, 192.168/16) and a port are declared, never a name or anything about the machine.
  The cabinet declares at startup, when the address changes, when a phone is kept or forgotten, and at least once a week (the service forgets a silent cabinet after 60 days); a failure is retried after 1 min, 5 min, 30 min, then every 2 h.
  No kept phone left, or the feature turned off: the empty declaration deletes the entry.
  The kept phone receives its shortcut's address, `https://t.cyberpinball.com/b/<id>`; left on the IP address (Android), it offers "Un raccourci qui suit la borne" (a shortcut that follows the cabinet) once, then in the ⋮ menu ("Raccourci qui suit la borne").
  That shortcut opens the service's page with the key in the fragment (`#g=…`, never sent to the service): the page reads the declaration, decrypts it on the phone and sends it on to `http://<ip>:<port>/`, the key copied into the fragment.
  It only follows a private IPv4 address, even when properly encrypted.
  Service unreachable: the last known address, kept on the phone (the service's page stays available offline, service worker); none: "Borne introuvable" (cabinet not found).
  The service only redirects: an HTTPS page cannot open an HTTP WebSocket to the cabinet.
  At the cabinet: System menu > Cabinet > Phone remote, "Couper l'adresse stable par Internet" (turn off the stable address over the Internet; on by default, its detail says whether the declaration went through).
  Never during a test: `CYBERPINBALL_RELAIS` points to another service.
  Putting the service online: `node scripts/service-telephone.mjs kv` (once), then `deployer`, with the Cloudflare account of `npx wrangler login`, kept outside the repository.
  Tests: `telephone-domaine.test.ts` (nothing readable in the declaration, signature, replay, clock, deletion, public address refused, fallback, spaced retries, service headers).
- **Cabinet unreachable** (another Wi-Fi, cabinet off): the page retries by itself, endlessly, more and more spaced out (5 s at most); a pending connection is dropped after 8 s (`CONNECT_MS`); after three missed tries, it says "Borne injoignable" (Cabinet unreachable: same Wi-Fi as the cabinet, Cyber Pinball open).
  Wi-Fi back (`online` event) or the page back in the foreground start a try at once, without reloading.
  A failed link never erases the kept key: only the cabinet that no longer knows it ("unknown", or a sealed "forgotten") does.
- **No duplicate**: a kept phone that goes through a QR code again sends the fingerprint of its old key (`prev`, `keptFingerprint`: the ChaCha20-Poly1305 tag of a fixed text under that key, computed by the page and by the cabinet; it reveals nothing about the key); on acceptance, the cabinet replaces its entry instead of adding one.
  Tests: `telephone-port.test.ts`.
- **At start-up**: with a kept phone, the remote wakes as soon as the menu is ready (`setMenu`, wake deferred by one turn: nothing is read while the menu initialises).
  Listening that does not open (network not there yet, firewall not yet allowed, an error) is retried by itself after 5 s, 15 s, 30 s then every minute (`LISTEN_RETRY_MS`); the remote screen says "la télécommande n'a pas pu démarrer ; nouvel essai dans un instant" (the remote could not start; trying again in a moment), the details go to the log.
  Incident of 11/11/2026 (0.1.9-essai.66): the firewall rule was read before being created, `undefined` in the bundled application; `avant-declaration.test.ts` now refuses any new closure in `frontend.ts` that would read a constant declared further down without having been reviewed.
- **Limits**: the page comes from the cabinet (HTTP, no service worker, which is reserved for HTTPS sites): cabinet off or Cyber Pinball closed, the shortcut opens the browser's error page.
  On Android, Chrome opens the shortcut of an HTTP page in a tab, address bar included.
  If the router gives the cabinet another address, only the shortcut that follows the cabinet (stable address over the Internet) or the cabinet's name (iPhone) finds it; a shortcut to the IP address means scanning the QR code once (reserving the cabinet's address in the router avoids it).
  The page still travels in clear text (limit described for the built-in browser remote).
- **Tests**: `remote.test.ts` (recognised without a QR code, after a restart, takeover, forgotten); `remote-kept.test.ts` (file, eight at most, dubious entries, damaged file); `telecommande.test.ts` replays an off-screen scenario: two real phone pages off screen, each with its own storage, acceptance, the tip, the screen left, Disconnect then Resume, the page reopened without an address, takeover, Forget, Cyber Pinball closed then restarted on the same port, and no key in the log.
