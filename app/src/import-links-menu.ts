// Plan d'ajout d'une installation reprise : ce qui sera lié (liens physiques, aucune place en plus)
// et ce qui sera copié (importLinks, @cyberpinball/core). Lignes placées en tête de « Place sur le
// disque » (import-space-menu.ts), qui dit ensuite la place à copier sur chaque disque. Une
// installation sur un autre disque que Cyber Pinball ne peut rien lier : le plan le dit, avec la
// place de la copie et le moyen de l'éviter.

import { formatSize, t, tn, type ImportLinks } from '@cyberpinball/core';
import type { Row } from './library-types';

export function importLinksRows(links: ImportLinks | undefined): Row[] {
  if (!links) return [];
  const rows: Row[] = [];
  if (links.linkedFiles) {
    rows.push({
      text: tn(links.linkedFiles, '{n} gros fichier lié, sans place en plus', '{n} gros fichiers liés, sans place en plus'),
      detail: t('{size} : tables, frontons, vidéos, images, sons et ROM. Liens physiques NTFS : les mêmes données sous un second nom, l’installation d’origine reste telle quelle.', { size: formatSize(links.linked) }),
      tone: 'ok',
      icon: 'check',
    });
  }
  if (links.copiedFiles && !links.otherDisk) {
    rows.push({
      text: tn(links.copiedFiles, '{n} fichier copié', '{n} fichiers copiés'),
      detail: t('{size} : les petits fichiers que VPX, PinMAME ou le PuP-Pack peuvent réécrire (.pup, .ini, .cfg, scripts…)', { size: formatSize(links.copied) }),
      tone: 'quiet',
    });
  }
  if (links.otherDisk) {
    const d = links.otherDisk;
    rows.push({
      text: t('Installation d’origine sur {from}, Cyber Pinball sur {to} : tout est copié', { from: d.from, to: d.to }),
      detail: t(
        'La copie prend {size} sur {to}. Un lien ne se fait que sur le même disque : Cyber Pinball installé sur {from} (dossier choisi à l’installation, ou /D= pour une installation silencieuse) reprendrait ces tables sans dupliquer {linkable}. « Installer » copie quand même.',
        { size: formatSize(d.bytes), to: d.to, from: d.from, linkable: formatSize(d.linkable) },
      ),
      tone: 'warning',
    });
  }
  return rows;
}
