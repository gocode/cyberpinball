[English](../manual/kept-phone.md) · Français · [Sommaire du manuel](../manuel.md)

## Téléphone gardé

Accepté une fois à la borne, un téléphone est **gardé** : il revient ensuite sans QR code ni acceptation, d'un raccourci sur son écran d'accueil.
Rien à installer, aucun magasin d'applications : la page reste celle que sert la borne, sur tous les téléphones (Android, iPhone).

- **Clé gardée** : à l'acceptation (Start), la clé de session du téléphone devient la sienne.
  La borne la range dans `<racine>\data\telephones.json` (`packages/core/src/remote-kept.ts` : nom du téléphone, jour de l'ajout, dernière venue ; **huit au plus**, le plus anciennement vu cède sa place ; un fichier illisible est mis de côté, `telephones.illisible-<date>.json`).
  Le téléphone la range dans le stockage de son navigateur et dans l'adresse de la page (`#g=…`) : le raccourci de l'écran d'accueil la porte, ce qui compte sur iPhone, où l'application de l'écran d'accueil a un stockage à part.
  Pas de manifeste d'application : son adresse de départ perdrait la clé.
  Les sauvegardes de la borne emportent le fichier avec ses réglages.
- **Écoute continue** : tant que la borne garde un téléphone, elle écoute dès le démarrage, dans le front-end comme en partie, sur un **port fixe**, `47820` (`REMOTE_PORT`) : le navigateur du téléphone range la clé par adresse et port, un port qui changerait la lui ferait perdre.
  Port déjà pris par un autre programme : un port libre, le QR marche toujours, un téléphone gardé doit le scanner de nouveau (journal).
  Seules les clés gardées ouvrent la liaison : un téléphone inconnu lit toujours le QR et attend d'être accepté.
  Les règles du réseau ne changent pas (adresses du réseau local seulement, règle du pare-feu de Cyber Pinball, 127.0.0.1 pendant un essai).
  Plus aucun téléphone gardé ni QR affiché : plus rien n'écoute.
- **Un seul pilote** : le dernier téléphone gardé qui se connecte prend la main, même sur un autre qui pilotait ou attendait d'être accepté ; l'autre affiche « Un autre téléphone a pris la main » et ne se reconnecte pas tout seul (sinon les deux se la reprendraient sans fin).
- **Sur le téléphone** : juste après l'acceptation, une fois, « Gardez la télécommande sous la main » dit comment ajouter la page à l'écran d'accueil (Safari : Partager, « Sur l'écran d'accueil » ; Android : menu ⋮, « Ajouter à l'écran d'accueil ») ; ensuite dans « Plus ».
  Icône de Cyber Pinball, opaque sur le noir sarcelle : `/icone-180.png` pour l'iPhone (`apple-touch-icon`, qui arrondit lui-même les coins), `/icone-192.png` pour Android ; elles sont rangées avec la page du téléphone, comme tout ce qu'elle sert, pour partir avec l'application et ses mises à jour légères (`scripts/icone.mjs` les refait).
  Plein écran sur iPhone (`apple-mobile-web-app-capable`).
  Coupé à la borne (« Déconnecter »), après 20 minutes sans geste ou remplacé par un autre téléphone : **« Reprendre »** revient d'un geste, sans QR.
  Cyber Pinball fermé : « Ce téléphone se reconnectera tout seul dès que Cyber Pinball sera relancé » (un essai toutes les 5 s).
  Oublié à la borne : « Ce téléphone n'est plus reconnu », sa clé est effacée.
- **À la borne** : Menu système > Ma borne > Télécommande du téléphone, section « Téléphones gardés » : chaque téléphone, « Accepté le … · vu … », « Pilote maintenant » pour celui qui pilote.
  Le choisir ouvre « Oublier ce téléphone ? » ; oublié, il devra scanner le QR et être accepté de nouveau (déconnecté s'il pilotait).
  « Déconnecter le téléphone » ne l'oublie pas.
- **Plein écran sur Android** : Chrome ouvre le raccourci d'une page HTTP dans un onglet, barre d'adresse comprise (seule une page HTTPS installable s'ouvre sans elle).
  La page demande donc le plein écran (API Fullscreen, `navigationUI: 'hide'`) au premier toucher, et de nouveau après une sortie subie (autre application, écran verrouillé : la page passe en arrière-plan).
  Quitté exprès (le geste « glisser pour quitter » de Chrome, ou « Quitter le plein écran » du menu ⋮), il n'est plus repris de lui-même, d'une visite à l'autre : l'entrée **« Plein écran »** du menu ⋮ le rend.
  L'avertissement « glisser pour quitter » est celui de Chrome, à chaque entrée en plein écran : la page ne peut ni le masquer ni le remplacer, d'où des demandes aussi rares que possible.
  Le toucher fait aussi ce qu'il touche : la demande part au relâchement du doigt, sans rien empêcher.
  La hauteur suit la zone visible : rien ne saute à la bascule, le clavier du téléphone, les feuilles et le menu ⋮ restent utilisables, le champ qui a le clavier le garde.
  Rien sur l'iPhone (le raccourci y est déjà plein écran), ni quand le navigateur n'a pas de plein écran ; refusé par le navigateur, il n'est plus redemandé pendant la visite.
  Les autres voies (HTTPS sur le réseau local, page publique installable) ont été écartées : service de noms et de certificats à tenir, box qui bloquent les adresses privées, relais sur Internet.
- **Port de la télécommande** : le navigateur du téléphone range la clé gardée par adresse **et port** ; un autre port, et le raccourci ne la retrouve plus.
  À une relève (mise à jour, relance), le nouveau Cyber Pinball démarre pendant que l'ancien tient encore le port 47820 : il attend que le port se libère (jusqu'à 45 s, un essai par seconde, `PORT_WAIT_MS`) et le reprend.
  Un port libre en dernier recours seulement, si un autre programme le garde : le journal le dit, et l'écran de la télécommande aussi (« Port habituel pris par un autre programme : les téléphones gardés doivent scanner ce QR une fois »).
  Une écoute dépassée (télécommande endormie ou relancée entre-temps) ne laisse aucun serveur ouvert et ne remplace jamais celui qui écoute.
  Incident du 11/11/2026 (0.1.9-essai.72) : le téléphone gardé devait rescanner le QR après chaque mise à jour.
- **Adresse de la borne** : le QR donne l'adresse IP de la borne, que le DHCP du routeur peut changer à un redémarrage ; le raccourci du téléphone mène alors à l'ancienne, et le stockage du navigateur, rangé par adresse, ne suit pas.
  Incident du 12/11/2026 : PinCab redémarré, passé de 192.168.68.54 à .52, QR à rescanner.
  La borne retient son adresse (`telephones.json`) : changée alors qu'elle garde des téléphones, le journal le dit, et l'écran de la télécommande aussi (« Adresse de la borne changée : un téléphone gardé par l'ancienne adresse doit scanner ce QR une fois »).
- **Nom de la borne** (`remote-name.ts`, `app/src/mdns-responder.ts`) : Cyber Pinball annonce son propre nom sur le réseau local, `cyberpinball.local`, par son propre répondeur mDNS, jamais le nom de la machine Windows.
  Il sonde d'abord (trois requêtes, 250 ms d'écart) : une autre borne porte déjà ce nom, il prend `cyberpinball-2.local`, puis -3… ; le nom choisi est retenu (`telephones.json`, `name`) et redemandé d'abord au démarrage suivant.
  Puis il s'annonce et ne répond qu'à ce nom, par son adresse, en multidiffusion, en unicast (bit QU) ou à l'ancienne (question d'un autre port que 5353).
  Il partage UDP 5353 avec le service DNS client de Windows ; CyberPinball.exe a déjà sa règle d'entrée dans le pare-feu, rien d'autre à autoriser, ni la règle mDNS de Windows, ni son réglage `EnableMDNS`, ni le profil du réseau.
  Un autre appareil qui se met à répondre au même nom : il en prend un autre.
  Gardé, le téléphone reçoit ce nom ; la page, ouverte par l'adresse, demande à la machine que désigne ce nom de prouver qu'elle garde sa clé (`GET /nom` : l'empreinte de la clé et un défi tiré au hasard ; réponse `keptNameProof`, l'étiquette ChaCha20-Poly1305 d'un texte fixe sous la clé et le défi).
  Prouvé, elle passe par le nom, la clé dans le fragment de l'adresse, jamais vers une machine qui ne l'a pas prouvé ; le téléphone déjà gardé est invité une fois à refaire son raccourci.
  **Ce que le nom ne fait pas** : les navigateurs d'Android (Chrome, Brave) ne trouvent pas les noms en `.local` (essai du 12/11/2026, Android et Brave : jamais passé par le nom) ; seuls l'iPhone (Safari) et les ordinateurs le trouvent.
  La page dit alors à la borne ce qu'elle a obtenu (message `name` : passée, injoignable, autre borne), le dit une fois à l'utilisateur, et toujours dans le menu ⋮ (« Adresse de la borne : … », et pourquoi) ; la borne l'écrit au journal et dans la Santé (ligne « Télécommande du téléphone »).
  Un téléphone Android reste sur l'adresse IP : l'adresse stable par Internet (point suivant) suit ce changement.
  Autre borne au même nom : son refus de la preuve est lisible par la page (CORS sur le 404), qui le dit.
  Un onglet resté ouvert sur l'ancienne adresse, injoignable, cherche la borne par le nom retenu (`cyberpinball.nom`), preuve à l'appui.
  Essais : `telephone-nom.test.ts` (répondeur sur un réseau simulé : aucun paquet ne part).
- **Adresse stable par Internet** (`packages/core/src/remote-relay.ts`, `app/src/phone-relay.ts`, service `packages/service-telephone`) : pour qu'un téléphone Android retrouve la borne quand le routeur change son adresse, sans QR.
  La borne déclare son adresse locale et son port au service du projet, `https://t.cyberpinball.com`, sous un identifiant tiré de sa propre clé Ed25519 (graine dans `telephones.json`, distincte de l'identité du joueur chez les amis).
  La déclaration ne contient rien de lisible : pour chaque téléphone gardé, l'adresse et le port sont scellés en ChaCha20-Poly1305 sous la clé de ce téléphone (données associées liées à l'identifiant de la borne), avec l'empreinte de la clé (`keptFingerprint`) pour qu'il retrouve son entrée.
  Le tout est signé et daté : le service (Cloudflare Workers, KV) vérifie que la clé publique donne l'identifiant, la signature, l'horloge (10 min d'écart au plus) et que la date avance ; rien d'autre n'écrit sous cet identifiant.
  Seules une IPv4 privée (10/8, 172.16/12, 192.168/16) et un port se déclarent, jamais un nom ni rien de la machine.
  La borne déclare au démarrage, quand l'adresse change, quand un téléphone est gardé ou oublié, et au moins une fois par semaine (le service oublie une borne silencieuse après 60 jours) ; un échec est retenté après 1 min, 5 min, 30 min puis toutes les 2 h.
  Plus aucun téléphone gardé, ou fonction coupée : la déclaration vide efface l'entrée.
  Le téléphone gardé reçoit l'adresse de son raccourci, `https://t.cyberpinball.com/b/<id>` ; resté sur l'adresse IP (Android), il propose une fois « Un raccourci qui suit la borne », puis dans le menu ⋮ (« Raccourci qui suit la borne »).
  Ce raccourci ouvre la page du service, la clé dans le fragment (`#g=…`, jamais envoyé au service) : la page lit la déclaration, la déchiffre sur le téléphone et renvoie à `http://<ip>:<port>/`, la clé recopiée dans le fragment.
  Elle ne suit qu'une IPv4 privée, même bien chiffrée.
  Service injoignable : la dernière adresse connue, gardée sur le téléphone (la page du service reste disponible hors ligne, service worker) ; aucune : « Borne introuvable ».
  Le service ne fait que renvoyer : une page HTTPS ne peut pas ouvrir de WebSocket en HTTP vers la borne.
  À la borne : Menu système > Ma borne > Télécommande du téléphone, « Couper l'adresse stable par Internet » (active par défaut ; son détail dit si la déclaration est passée).
  Jamais pendant un essai : `CYBERPINBALL_RELAIS` désigne un autre service.
  Mise en ligne du service : `node scripts/service-telephone.mjs kv` (une fois), puis `deployer`, avec le compte Cloudflare de `npx wrangler login`, gardé hors du dépôt.
  Essais : `telephone-domaine.test.ts` (rien de lisible dans la déclaration, signature, rejeu, horloge, effacement, adresse publique refusée, repli, nouvel essai espacé, en-têtes du service).
- **Borne injoignable** (autre Wi-Fi, borne éteinte) : la page réessaie seule, sans fin, de plus en plus espacé (5 s au plus) ; une connexion pendante est abandonnée après 8 s (`CONNECT_MS`) ; après trois essais manqués, elle dit « Borne injoignable » (même Wi-Fi que la borne, Cyber Pinball ouvert).
  Le Wi-Fi retrouvé (événement `online`) ou la page revenue au premier plan relancent un essai aussitôt, sans actualiser.
  Un échec de liaison n'efface jamais la clé gardée : seule la borne qui ne la connaît plus (« unknown », ou « forgotten » scellé) le fait.
- **Pas de doublon** : un téléphone déjà gardé qui repasse par un QR envoie l'empreinte de son ancienne clé (`prev`, `keptFingerprint` : l'étiquette ChaCha20-Poly1305 d'un texte fixe sous cette clé, calculée par la page et par la borne ; elle ne dit rien de la clé) ; à l'acceptation, la borne remplace son entrée au lieu d'en ajouter une.
  Essais : `telephone-port.test.ts`.
- **Au démarrage** : avec un téléphone gardé, la télécommande se réveille dès que le front-end est prêt (`setMenu`, réveil différé d'un tour : rien n'est lu pendant l'initialisation du front-end).
  Une écoute qui ne s'ouvre pas (réseau pas encore là, pare-feu pas encore autorisé, erreur) est retentée seule après 5 s, 15 s, 30 s puis chaque minute (`LISTEN_RETRY_MS`) ; l'écran de la télécommande dit « la télécommande n'a pas pu démarrer ; nouvel essai dans un instant », le détail va au journal.
  Incident du 11/11/2026 (0.1.9-essai.66) : la règle du pare-feu était lue avant d'être créée, `undefined` dans l'application assemblée ; `avant-declaration.test.ts` refuse désormais toute nouvelle fermeture de `frontend.ts` qui lirait une constante déclarée plus bas sans avoir été relue.
- **Limites** : la page vient de la borne (HTTP, sans service worker, réservé aux sites HTTPS) : borne éteinte ou Cyber Pinball fermé, le raccourci ouvre la page d'erreur du navigateur.
  Sur Android, Chrome ouvre le raccourci d'une page HTTP dans un onglet, barre d'adresse comprise.
  Si la box donne une autre adresse à la borne, seul le raccourci qui suit la borne (adresse stable par Internet) ou le nom de la borne (iPhone) la retrouvent ; un raccourci vers l'adresse IP oblige à scanner le QR une fois (réserver l'adresse de la borne dans la box l'évite).
  La page voyage toujours en clair (limite décrite pour la télécommande du navigateur intégré).
- **Essais** : `remote.test.ts` (reconnu sans QR, après un redémarrage, prise de main, oublié) ; `remote-kept.test.ts` (fichier, huit au plus, entrées douteuses, fichier abîmé) ; `telecommande.test.ts` rejoue un scénario hors écran : deux vraies pages du téléphone hors écran, chacune son stockage, l'acceptation, l'astuce, l'écran quitté, Déconnecter puis Reprendre, la page rouverte sans adresse, la prise de main, Oublier, Cyber Pinball fermé puis relancé sur le même port, et aucune clé au journal.
