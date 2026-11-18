-- Base D1 des retours des joueurs (liaison RETOURS de worker.mjs), nommée « cyberpinball-retours ».
-- Rejouable : node scripts/service-telephone.mjs d1 (ou deployer) l'applique à chaque fois.
-- Aucune adresse IP ni aucun nom : une borne n'y figure que par sa clé publique Ed25519 (hexadécimal),
-- que le service ne rend jamais.

-- Le tableau public des propositions. `author` : clé publique de la borne qui l'a publiée ; `t` : date
-- signée par la borne ; `at`, `updated` : dates du service (millisecondes). `merged_into` : la
-- proposition qui l'a absorbée (doublon fusionné par l'administrateur).
CREATE TABLE IF NOT EXISTS propositions (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  lang TEXT NOT NULL,
  author TEXT NOT NULL,
  t INTEGER NOT NULL,
  at INTEGER NOT NULL,
  updated INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  hidden INTEGER NOT NULL DEFAULT 0,
  merged_into TEXT,
  reply TEXT
);
-- Quota de propositions par borne sur 24 heures.
CREATE INDEX IF NOT EXISTS propositions_author ON propositions (author, at);
-- Doublons fusionnés dans une proposition.
CREATE INDEX IF NOT EXISTS propositions_merged ON propositions (merged_into);

-- Une voix par borne et par proposition. `at` : date signée du dernier vote (une date plus ancienne est un rejeu).
CREATE TABLE IF NOT EXISTS votes (
  proposition TEXT NOT NULL,
  voter TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (proposition, voter)
);

-- Réactions aux Nouveautés du front-end (packages/core/src/news.ts) : une par borne et par nouveauté,
-- l'une des sept réactions des messages. `at` : date signée de la dernière (une date plus ancienne est un rejeu).
CREATE TABLE IF NOT EXISTS reactions_nouveautes (
  item TEXT NOT NULL,
  voter TEXT NOT NULL,
  kind TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (item, voter)
);

-- Rapports chiffrés (boîtes scellées « CPR1 ») : le service ne peut pas les lire. Ni auteur ni adresse.
CREATE TABLE IF NOT EXISTS rapports (
  id TEXT PRIMARY KEY,
  at INTEGER NOT NULL,
  size INTEGER NOT NULL,
  data BLOB NOT NULL
);
CREATE INDEX IF NOT EXISTS rapports_at ON rapports (at);

-- Signatures déjà reçues (clé publique ou « admin », date signée), gardées vingt minutes : un rejeu est refusé.
CREATE TABLE IF NOT EXISTS signatures (
  pk TEXT NOT NULL,
  t INTEGER NOT NULL,
  PRIMARY KEY (pk, t)
);
CREATE INDEX IF NOT EXISTS signatures_t ON signatures (t);

-- Coffres des comptes (packages/core/src/vault.ts) : une copie chiffrée du compte d'un joueur, que le
-- service ne peut pas ouvrir, rangée sous sa clé publique. `t` : date signée du dernier envoi (un
-- envoi plus ancien est refusé) ; `at` : date du service.
CREATE TABLE IF NOT EXISTS coffres (
  pk TEXT PRIMARY KEY,
  data BLOB NOT NULL,
  hash TEXT NOT NULL,
  t INTEGER NOT NULL,
  at INTEGER NOT NULL
);

-- Mot de passe facultatif d'un coffre : l'identifiant réservé (le pseudo, sans casse), le sel de
-- scrypt, l'empreinte SHA-256 de la preuve du mot de passe et l'enveloppe de la clé des données.
-- Ni le mot de passe ni la clé : le service ne peut pas ouvrir le coffre.
CREATE TABLE IF NOT EXISTS coffres_mdp (
  login TEXT PRIMARY KEY,
  pk TEXT NOT NULL UNIQUE,
  salt BLOB NOT NULL,
  auth TEXT NOT NULL,
  wrap BLOB NOT NULL,
  at INTEGER NOT NULL
);

-- Essais manqués d'ouverture par identifiant, gardés une heure : au-delà de dix, l'identifiant attend.
CREATE TABLE IF NOT EXISTS coffres_essais (
  login TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS coffres_essais_login ON coffres_essais (login, at);
