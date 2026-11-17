[English](../manual/pup-pack-disabled-table-by-table.md) · Français · [Sommaire du manuel](../manuel.md)

## PuP-Pack désactivé, table par table

Pour retrouver une table dans sa situation la plus simple, sans ses vidéos, puis les remettre : fiche de la table > « Parties du jeu » > « PuP-Pack » > « Désactiver le PuP-Pack ».
La fiche montre alors « PuP-Pack · désactivé », et la même partie propose « Réactiver le PuP-Pack ».
Depuis l'écran des options d'un pack (fiche > « PuP-Pack »), « Désactiver le PuP-Pack » mène au même endroit.

**Ce qui se passe.**
Le dossier du pack passe de `<table>\pupvideos\<pack>` à `<table>\pupvideos (off)\<pack>`, tel quel : un seul renommage dans le dossier de la table, instantané même pour plusieurs gigaoctets, sans copie.
Le plugin PUP de VPX 10.8.1 ne cherche le pack que sous `pupvideos\<nom>` (à côté de la table, puis dans le dossier PinUP Player réglé dans VPX) ; PinUP Popper ne lit que `PinUPSystem\PUPVideos`.
Pour la partie, c'est donc une table sans pack : le script crée l'objet PuP, `B2SInit` ne trouve rien, la partie continue sans vidéos.
La réactivation remet le dossier à sa place : mêmes fichiers, mêmes dates, même option retenue dans le `.info`.

**Le script.**
Quand Cyber Pinball avait adapté le `.vbs` de la table pour le pack (interrupteur `usePUP` allumé, lancement ajouté, reconnaissance des images du DMD), il le remet comme le script de la table : seuls les correctifs du `core.vbs` restent, et un `.vbs` qui n'avait que ça part à la corbeille.
Sans pack, un interrupteur laissé allumé gênerait la partie : une PuP-DMD allumée laisse le DMD sans score, et *2001 : A Space Odyssey* ne joue sa musique que si `usePUP` est faux.
À la réactivation, le `.vbs` est refait à l'identique.
Un `.vbs` venu d'ailleurs n'est pas touché.

**Rien ne le rallume.**
Le médecin dit « PuP-Pack désactivé » (information) et ne réclame rien ; les réparations faites avant chaque partie remettent le script sans PuP, jamais le pack ; la santé de la borne et « Ce qu'il manque pour jouer » le comptent comme fait ; « Parties du jeu » ne cherche ni ne propose de pack à télécharger pour lui ; le partage entre amis ne l'envoie pas ; une mise à jour du pack installée par le plan d'ajout se range dans `pupvideos (off)` et reste désactivée.

**Pack partagé.**
`pupvideos` est commun aux tables d'un même dossier : les autres versions qui chargent le même pack (même ROM, même nom) se jouent aussi sans lui.
L'écran de confirmation les nomme avant de désactiver, et elles disent « désactivé » elles aussi ; le pack se réactive depuis n'importe laquelle.

**Sûreté.**
L'état est sur le disque, nulle part ailleurs : un pack est désactivé tant que son dossier est dans `pupvideos (off)` et pas dans `pupvideos`.
Si un renommage échoue (un fichier du pack ouvert par VPX ou l'Explorateur), ceux déjà faits sont défaits et le message le dit : rien n'est à moitié désactivé.
Si l'application s'arrête entre le déplacement du pack et la remise du script, la préparation de la partie suivante remet le script.
Un pack du même nom revenu dans `pupvideos` entre-temps l'emporte : la réactivation ne l'écrase jamais.

**Limite.**
Si le réglage « Dossier PinUP Player » de VPX (`[Plugin.PUP] PUPFolder`) pointe vers une collection qui a aussi ce pack, le plugin chargera celui-là : l'écran de confirmation le signale.
