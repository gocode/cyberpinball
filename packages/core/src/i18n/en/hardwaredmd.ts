// Catalogue anglais : DMD réel (packages/core/src/dmd.ts, app/src/hardware-dmd-menu.ts, santé et réglages).
// Clé : le texte français tel qu'il est passé à t() ou tn().
export const messages: Record<string, string> = {
  // dmd.ts
  'Indiquez le nom ou l’adresse IP du ZeDMD.': 'Enter the name or IP address of the ZeDMD.',
  'Le nom ou l’adresse seuls, sans « http:// » ni chemin : par exemple {example} ou 192.168.1.50.': 'Just the name or address, without “http://” or a path: for example {example} or 192.168.1.50.',
  'Lettres, chiffres, points et tirets seulement : par exemple {example} ou 192.168.1.50.': 'Letters, digits, dots and hyphens only: for example {example} or 192.168.1.50.',
  'Adresse IP impossible : chaque nombre va de 0 à 255.': 'Impossible IP address: each number goes from 0 to 255.',
  'code {code} du Gestionnaire de périphériques': 'Device Manager code {code}',
  ' (pilote actuel : {service})': ' (current driver: {service})',
  'PIN2DMD : Windows ne lui a pas donné de pilote USB générique (WinUSB ou libusbK){why}. VPX ne pourra pas l’ouvrir et le DMD restera noir. Installez ce pilote avec l’outil fourni avec le PIN2DMD ou avec Zadig, puis « Vérifier de nouveau ».':
    'PIN2DMD: Windows has not given it a generic USB driver (WinUSB or libusbK){why}. VPX will not be able to open it and the DMD will stay dark. Install that driver with the tool that comes with the PIN2DMD or with Zadig, then “Check again”.',
  'PIN2DMD : son pilote {service} ne s’ouvre que par libusbK.dll, absente de Windows. VPX ne pourra pas l’ouvrir et le DMD restera noir. Remplacez ce pilote par WinUSB avec Zadig (Options > List All Devices, choisir le PIN2DMD, WinUSB, Replace Driver), puis « Vérifier de nouveau ».':
    'PIN2DMD: its {service} driver can only be opened through libusbK.dll, which Windows does not have. VPX will not be able to open it and the DMD will stay dark. Replace that driver with WinUSB using Zadig (Options > List All Devices, pick the PIN2DMD, WinUSB, Replace Driver), then “Check again”.',
  'PIN2DMD : Windows le voit, mais la libusb de VPX ne le trouve pas. Débranchez-le, rebranchez-le, puis « Vérifier de nouveau ».':
    'PIN2DMD: Windows sees it, but VPX’s libusb cannot find it. Unplug it, plug it back in, then “Check again”.',
  'PIN2DMD : déjà ouvert par un autre programme ({programs}). VPX ne pourra pas l’allumer et le DMD restera noir. Fermez-le, ou retirez-le du démarrage de Windows, puis « Vérifier de nouveau ».':
    'PIN2DMD: already opened by another program ({programs}). VPX will not be able to light it and the DMD will stay dark. Close it, or remove it from Windows startup, then “Check again”.',
  'PIN2DMD : déjà ouvert par un autre programme (dmdext, un autre front-end, l’éditeur du PIN2DMD…). VPX ne pourra pas l’allumer et le DMD restera noir. Fermez-le, ou retirez-le du démarrage de Windows, puis « Vérifier de nouveau ».':
    'PIN2DMD: already opened by another program (dmdext, another frontend, the PIN2DMD editor…). VPX will not be able to light it and the DMD will stay dark. Close it, or remove it from Windows startup, then “Check again”.',
  'PIN2DMD : la libusb de VPX ne sait pas l’ouvrir avec son pilote actuel ({service}). Le DMD restera noir. Remplacez ce pilote par WinUSB avec Zadig (Options > List All Devices, choisir le PIN2DMD, WinUSB, Replace Driver), puis « Vérifier de nouveau ».':
    'PIN2DMD: VPX’s libusb cannot open it with its current driver ({service}). The DMD will stay dark. Replace that driver with WinUSB using Zadig (Options > List All Devices, pick the PIN2DMD, WinUSB, Replace Driver), then “Check again”.',
  'inconnu': 'unknown',
  'PIN2DMD : la libusb de VPX n’arrive pas à l’ouvrir (erreur {code}, étape {stage}). Le DMD restera sans doute noir. Débranchez-le, rebranchez-le, puis « Vérifier de nouveau » ; si rien ne change, envoyez un rapport (Menu système > Cyber Pinball > Avis et propositions).':
    'PIN2DMD: VPX’s libusb cannot open it (error {code}, step {stage}). The DMD will probably stay dark. Unplug it, plug it back in, then “Check again”; if nothing changes, send a report (System menu > Cyber Pinball > Feedback and ideas).',
  'DMD réel : {programs} est ouvert et garde peut-être le DMD réel ; VPX ne pourrait pas l’allumer. Fermez-le avant de jouer.':
    'Real DMD: {programs} is open and may be holding the real DMD; VPX could not light it. Close it before playing.',
  'DMD réel : {programs} sont ouverts et gardent peut-être le DMD réel ; VPX ne pourrait pas l’allumer. Fermez-les avant de jouer.':
    'Real DMD: {programs} are open and may be holding the real DMD; VPX could not light it. Close them before playing.',
  'ouvert puis relâché : VPX pourra l’allumer': 'opened then released: VPX will be able to light it',
  'pilote CH340/CH343 de WCH': 'WCH CH340/CH343 driver',
  'pilote CP210x de Silicon Labs': 'Silicon Labs CP210x driver',
  'pilote du port série USB': 'USB serial port driver',
  '{model} : Windows ne lui a pas donné de port COM{why}. VPX ne pourra pas l’ouvrir. Installez le {chip} (souvent proposé par Windows Update), débranchez et rebranchez, puis « Vérifier de nouveau ».':
    '{model}: Windows has not given it a COM port{why}. VPX will not be able to open it. Install the {chip} (often offered by Windows Update), unplug and plug it back in, then “Check again”.',
  '{model} reconnu ({usb}), mais éteint : « {model} : non » dans Menu système > Borne > DMD > DMD réel.': '{model} recognized ({usb}), but turned off: “{model}: no” in System menu > Cabinet > DMD > Real DMD.',
  "{model} : {usb} est un convertisseur USB-série courant. Si ce n'est pas un {model} (carte Arduino, contrôleur de boutons…), DMDUtil lui enverra quand même sa demande de connexion : choisissez « {model} : non » dans Menu système > Borne > DMD > DMD réel.":
    '{model}: {usb} is a common USB-serial converter. If it is not a {model} (Arduino board, button controller…), DMDUtil will still send it its connection request: choose “{model}: no” in System menu > Cabinet > DMD > Real DMD.',
  'ZeDMD en wifi ({address})': 'ZeDMD over Wi-Fi ({address})',
  // health.ts
  'Ouvrir DMD réel': 'Open Real DMD',
  'DMD réel prêt : {devices}': 'Real DMD ready: {devices}',
  'VPX l’alimente pendant les parties, le front-end entre elles (prise en charge en bêta)': 'VPX drives it during games, the menu between them (beta support)',
  'VPX l’alimente pendant les parties ; « Image du front-end » lui fait aussi montrer le front-end (prise en charge en bêta)':
    'VPX drives it during games; “Menu image” makes it show the menu too (beta support)',
  // settings.ts
  'Elle suit le DMD réel reconnu à son identifiant USB (ZeDMD, PIN2DMD, Pixelcade) et les choix de « DMD réel ».': 'It follows the real DMD recognized by its USB ID (ZeDMD, PIN2DMD, Pixelcade) and the choices in “Real DMD”.',
  'Elle change quand on branche le DMD, ou dans Menu système > Borne > DMD > DMD réel (automatique, oui, non, ZeDMD en wifi). {keep}': 'It changes when the DMD is plugged in, or in System menu > Cabinet > DMD > Real DMD (automatic, yes, no, ZeDMD over Wi-Fi). {keep}',
  // Rubrique Borne > DMD (systemmenu.ts, frontend.ts)
  'Écran du DMD, DMD du front-end et sa couleur, DMD réel (ZeDMD, PIN2DMD, Pixelcade)': 'DMD screen, menu DMD and its colour, real DMD (ZeDMD, PIN2DMD, Pixelcade)',
  'DMD du front-end': 'Menu DMD',
  'Indisponible : la borne n’a pas d’écran de DMD (assistant d’écrans, étape « Disposition »)': 'Unavailable: the cabinet has no DMD screen (screen wizard, “Disposition” (Layout) step)',
  // hardware-dmd-menu.ts
  'Toujours allumé, même s’il n’est pas reconnu : DMDUtil le cherche au début de chaque partie (Start : non)': 'Always on, even when not recognized: DMDUtil looks for it at the start of each game (Start: no)',
  'Jamais allumé : DMDUtil ne lui envoie rien, même branché (Start : automatique)': 'Never on: DMDUtil sends it nothing, even when plugged in (Start: automatic)',
  'Reconnu ({names}) : allumé pendant les parties (Start : oui)': 'Recognized ({names}): on during games (Start: yes)',
  'Allumé dès qu’un {model} est reconnu à son identifiant USB (Start : oui)': 'On as soon as a {model} is recognized by its USB ID (Start: yes)',
  'Borne à configurer': 'Cabinet to set up',
  'Les choix du DMD réel sont gardés avec la configuration de la borne : faites d’abord l’assistant d’écrans (Menu système > Borne > Configuration de la borne).':
    'The real DMD choices are kept with the cabinet configuration: run the screen wizard first (System menu > Cabinet > Cabinet setup).',
  '{width} × {height} points': '{width} × {height} dots',
  'éteint par « {model} : non »': 'turned off by “{model}: no”',
  'pilote à installer': 'driver to install',
  'pilote prêt': 'driver ready',
  'ZeDMD en wifi': 'ZeDMD over Wi-Fi',
  '{address} · VPX s’y connecte au début de chaque partie': '{address} · VPX connects to it at the start of each game',
  'Aucun DMD réel branché en USB': 'No real DMD plugged in over USB',
  'ZeDMD, PIN2DMD, Pixelcade : branchez-le, puis « Vérifier de nouveau ».': 'ZeDMD, PIN2DMD, Pixelcade: plug it in, then “Check again”.',
  Reconnus: 'Recognized',
  '{usb} est une puce USB-série courante : si ce n’est pas un {model} (carte Arduino, contrôleur de boutons…), choisissez « {model} : non ».':
    '{usb} is a common USB-serial chip: if it is not a {model} (Arduino board, button controller…), choose “{model}: no”.',
  '{model} : {choice}': '{model}: {choice}',
  'Indisponible : configurez d’abord la borne (assistant d’écrans)': 'Unavailable: set up the cabinet first (screen wizard)',
  '{model} : {choice}. Appliqué au lancement de la prochaine partie.': '{model}: {choice}. Applied when the next game starts.',
  'ZeDMD en wifi : {address}': 'ZeDMD over Wi-Fi: {address}',
  'ZeDMD en wifi : non': 'ZeDMD over Wi-Fi: no',
  'VPX s’y connecte au début de chaque partie (Start : changer l’adresse, ou la vider pour couper)': 'VPX connects to it at the start of each game (Start: change the address, or clear it to turn off)',
  'Un ZeDMD relié par le réseau, que l’USB ne voit pas (Start : indiquer son adresse)': 'A ZeDMD connected over the network, which USB cannot see (Start: enter its address)',
  'Relit les périphériques USB et leurs pilotes': 'Reads the USB devices and their drivers again',
  'Un afficheur à LED branché à la borne (ZeDMD, PIN2DMD, Pixelcade). VPX l’allume pendant les parties ; « Image du front-end » lui fait aussi montrer le front-end. Bêta : à confirmer sur les bornes équipées.':
    'An LED display connected to the cabinet (ZeDMD, PIN2DMD, Pixelcade). VPX lights it during games; “Menu image” makes it show the menu too. Beta: to be confirmed on equipped cabinets.',
  'Nom ou adresse IP du ZeDMD': 'Name or IP address of the ZeDMD',
  'ZeDMD en wifi coupé. Appliqué au lancement de la prochaine partie.': 'ZeDMD over Wi-Fi turned off. Applied when the next game starts.',
  'Adresse refusée': 'Address refused',
  'ZeDMD en wifi : {address}. Appliqué au lancement de la prochaine partie.': 'ZeDMD over Wi-Fi: {address}. Applied when the next game starts.',
  'Le ZeDMD et la borne sur le même réseau local. Sans réglage, le ZeDMD s’annonce sous le nom {name}. Laissez vide pour couper le wifi.':
    'The ZeDMD and the cabinet on the same local network. Without any setting, the ZeDMD announces itself as {name}. Leave empty to turn Wi-Fi off.',
  'ZeDMD, PIN2DMD, Pixelcade : aucun reconnu': 'ZeDMD, PIN2DMD, Pixelcade: none recognized',
  'ne s’ouvre pas : voir « À vérifier »': 'does not open: see “To check”',
  // Image du menu : le serveur du DMD (app/src/dmd-server.ts, packages/core/src/dmdserver.ts)
  'Le module DMD de VPX ne se charge pas (Visual C++ 2015-2022 x64 manquant ?)': 'The VPX DMD module does not load (Visual C++ 2015-2022 x64 missing?)',
  'Version de VPX non prise en charge par le serveur du DMD (VPX 10.8.1 attendu)': 'VPX version not supported by the DMD server (VPX 10.8.1 expected)',
  'Serveur du DMD lancé avec de mauvais arguments': 'DMD server started with wrong arguments',
  'Serveur du DMD absent de cette version de Cyber Pinball': 'DMD server missing from this version of Cyber Pinball',
  'VPX n’est pas installé : le serveur du DMD s’appuie sur ses fichiers': 'VPX is not installed: the DMD server relies on its files',
  'VPX sans son module DMD (plugins\\dmdutil) : réinstallez VPX depuis Cyber Pinball': 'VPX without its DMD module (plugins\\dmdutil): reinstall VPX from Cyber Pinball',
  'Serveur du DMD': 'DMD server',
  '{problem} ; VPX ouvre le DMD lui-même pendant les parties': '{problem}; VPX opens the DMD itself during games',
  'Le front-end tient le DMD réel ; VPX le reprend pendant les parties': 'The menu holds the real DMD; VPX takes it back during games',
  'Démarre, ou attend que le DMD réponde ; en attendant, VPX ouvre le DMD lui-même': 'Starting, or waiting for the DMD to answer; meanwhile, VPX opens the DMD itself',
  'Image du front-end : oui': 'Menu image: yes',
  'Image du front-end : non': 'Menu image: no',
  'Image du front-end': 'Menu image',
  'Le DMD réel montre aussi le DMD du front-end ; VPX le reprend pendant les parties (Start : non)': 'The real DMD also shows the menu DMD; VPX takes it back during games (Start: no)',
  'Indisponible : aucun DMD réel allumé (branchez-le, ou choisissez « oui » pour son modèle)': 'Unavailable: no real DMD turned on (plug it in, or choose “yes” for its model)',
  'Indisponible : {problem}': 'Unavailable: {problem}',
  'Le DMD réel montre aussi le DMD du front-end, entre les parties (Start : oui)': 'The real DMD also shows the menu DMD, between games (Start: yes)',
  'Image du front-end : non. VPX ouvre de nouveau le DMD lui-même.': 'Menu image: no. VPX opens the DMD itself again.',
  'Aucun DMD réel n’est allumé : branchez-le (puis « Vérifier de nouveau »), ou choisissez « oui » pour son modèle, ou indiquez un ZeDMD en wifi.':
    'No real DMD is turned on: plug it in (then “Check again”), or choose “yes” for its model, or enter a ZeDMD over Wi-Fi.',
  'Le DMD réel reste piloté par VPX pendant les parties.': 'The real DMD stays driven by VPX during games.',
  'Image du front-end : oui. Le serveur du DMD démarre ; le DMD réel montre le front-end dès qu’il répond.': 'Menu image: yes. The DMD server is starting; the real DMD shows the menu as soon as it answers.',
  'DMD réel : dmdserver tient l’afficheur (image du front-end, bêta) ; VPX lui envoie ses images pendant les parties.': 'Real DMD: dmdserver holds the display (menu image, beta); VPX sends it its frames during games.',
  'Image du front-end sur le DMD réel : {problem}': 'Menu image on the real DMD: {problem}',
  'Écrit par Cyber Pinball (Menu système > Borne > DMD > DMD réel) : réécrit à chaque lancement du serveur.': 'Written by Cyber Pinball (System menu > Cabinet > DMD > Real DMD): rewritten each time the server starts.',
};
