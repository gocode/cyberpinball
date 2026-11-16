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
