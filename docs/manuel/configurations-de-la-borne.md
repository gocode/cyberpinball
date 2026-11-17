[English](../manual/cabinet-configurations.md) · Français · [Sommaire du manuel](../manuel.md)

## Configurations de la borne

Une même installation peut servir sur plusieurs postes : trois écrans en plus du principal sur l'un, deux sur l'autre, une borne.
`data\cabinet.json` contient toutes les **configurations** ; chacune est un modèle de borne complet (écrans par empreinte EDID, rôles, zones, bord des flippers, diagonale, son, boutons, clés laissées à l'utilisateur) avec son **propre `VPinballX.ini`** et sa propre mémoire des clés écrites.
Les tables, les ROM, les médias, les réglages propres à chaque table et les statistiques restent communs.
Code : [packages/core/src/configurations.ts](../../packages/core/src/configurations.ts) (calcul), [packages/core/src/store.ts](../../packages/core/src/store.ts) (fichiers), [app/src/configurations-menu.ts](../../app/src/configurations-menu.ts) (écrans), tests dans [configurations.test.ts](../../packages/core/src/test/configurations.test.ts).

- **Migration** : un `cabinet.json` d'avant les configurations devient, à sa première lecture, la configuration « Borne », reprise telle quelle, qui garde `config\VPinballX.ini` et sa mémoire ; l'ancien fichier est gardé dans `data\cabinet-v1.json`.
  Rien à faire.
- **Reconnaissance** (démarrage, avant chaque partie, `sync`) : chaque configuration reçoit un score d'après les écrans branchés (`scoreConfiguration`) : 100 par écran retrouvé par son numéro de série, 60 par modèle et port (empreinte faible), 30 par modèle et taille seulement (câble changé de port), −50 par écran introuvable, −10 par écran branché en plus.
  Elle est candidate avec au moins un écran retrouvé, au plus un introuvable (un écran éteint) et pas plus d'écrans en trop que d'écrans retrouvés.
  La seule candidate complète est choisie d'office ; sinon un choix déjà fait pour ces mêmes écrans ; sinon la meilleure candidate si elle est seule à son score.
  Une configuration retrouvée en partie reste choisie avec un avertissement, et la synchronisation avertit pour le rôle de l'écran éteint (et bloque si c'est le playfield), comme avant.
  Chaque choix est expliqué : « « Second poste » reconnue : 3 écrans sur 3 retrouvés (2 par numéro de série, 1 par modèle et port) — score 260, devant « Borne » (score -110) ».
- **Ambiguïté ou aucune correspondance** : rien n'est écrit.
  Le front-end s'ouvre sur l'écran principal avec « Quelle configuration est branchée ? » : les configurations connues, de la plus proche à la plus lointaine avec leur score, « Nouvelle configuration » (assistant complet) et « Plus tard » (le front-end reste utilisable ; une partie redemande la configuration).
  Le choix est retenu pour ces écrans (10 jeux d'écrans mémorisés) et le front-end redémarre sur les bons écrans.
  En ligne de commande : code de sortie 3, et `npm run sync -- --configuration "Nom"` fait le même choix.
- **Changement de configuration** : constat de la synchronisation (« Configuration changée : « Borne » à la place de « Second poste »… ») et bandeau de 12 s en haut du front-end, sans bouton à presser.
- **Menu système > « Borne » > « Configuration de la borne » > « Configurations de la borne »** (son détail nomme la configuration active, et dit si elle est forcée) : la liste avec le score de chacune pour les écrans branchés ; pour chacune, « Utiliser avec ces écrans », « Toujours utiliser celle-ci » (forcée : la reconnaissance est suspendue jusqu'à « Reconnaissance automatique »), « Écran du navigateur intégré » (où s'ouvre la fenêtre « Récupérer », voir [Écran et pointeur](ajouter-une-table-l-entonnoir-le-catalogue.md#ajouter-une-table--lentonnoir-le-catalogue--récupérer--liste-dattente)), « Renommer » (clavier à l'écran, ou un vrai clavier), « Supprimer » (corbeille des configurations, restaurable avec son fichier ; la dernière ne se supprime pas) ; « Nouvelle configuration » relance l'assistant avec `--nouvelle-configuration`.
- **Nouvelle configuration** : l'assistant crée la configuration (« Poste à 3 écrans », à renommer), retenue pour les écrans branchés.
  Son fichier `VPinballX-<id>.ini` part d'une copie de celui de la configuration active : les réglages faits à la main qui ne dépendent pas des écrans (qualité graphique, physique, touches) suivent ; l'assistant y écrit ensuite les écrans, le son et les boutons.
  « Assistant complet » refait la configuration active, l'étape « Boutons » seule aussi.
- **Un `VPinballX.ini` par configuration, plutôt qu'un seul réécrit à chaque bascule** : VPX réenregistre lui-même son fichier, et l'utilisateur y règle aussi bien des clés gérées (gardées dans `vpxManual`) que des clés libres.
  Un fichier unique obligerait, à chaque bascule, à mettre de côté puis restaurer les valeurs propres à chaque poste, et la détection des modifications à la main prendrait les valeurs de l'autre poste pour des retouches : une valeur réglée à la main sur un poste serait écrasée ou perdue au retour.
  Avec un fichier chacun, synchroniser une configuration ne touche jamais au fichier d'une autre, et la mémoire des clés écrites reste celle de son fichier (test « bascule aller-retour »).
  Contrepartie : un réglage général changé plus tard (Réglages de VPX) ne vaut que pour la configuration active.
- **Garde-fou** : tout le code de l'application passe par le fichier de la configuration active (`activeVpxIni`, `syncConfiguration` dans [app/src/vpx-ini.ts](../../app/src/vpx-ini.ts)) ; un test refuse tout autre accès à `Locations.vpxIni`.
