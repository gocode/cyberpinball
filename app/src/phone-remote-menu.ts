// Menu système > Borne > Télécommande du téléphone (phone-remote.ts) : l'écran où le QR code vit
// hors du navigateur intégré. En grand à gauche, le QR à scanner, puis le code à comparer (Start
// accepte, Exit refuse), puis le téléphone connecté ; à droite, ce que fait le téléphone, l'envoi en
// cours, Déconnecter. Indisponible (pare-feu, pas de réseau local) : le bloc reste, grisé avec la
// raison. Le clavier à l'écran montre le même bloc, en bande, sous ses touches (library.ts).

import { formatSize, REMOTE_UPLOAD_MAX, t } from '@cyberpinball/core';
import type { Action, Built, ProvidedSystemItem, Row } from './library';
import type { PhoneRemote, RemoteBar } from './phone-remote';

/** Le bloc de la télécommande tel que le menu le dessine (library.js, renderRemote). */
export interface RemoteBlock {
  phase: RemoteBar['phase'];
  /** Lignes du QR code, « 1 » pour un module sombre (offer). */
  qr?: string[];
  /** Code à comparer (pending). */
  code?: string;
  title: string;
  lines: string[];
}

/**
 * Textes du bloc, sur l'écran de la télécommande (`screen`) ou sous le clavier à l'écran
 * (`keyboard`) : textes revus par Codex le 06/11/2026 (docs/Design/telecommande-menu).
 */
export function remoteBlock(bar: RemoteBar, place: 'screen' | 'keyboard'): RemoteBlock {
  const big = place === 'screen';
  switch (bar.phase) {
    case 'offer':
      return {
        phase: 'offer',
        qr: bar.qr,
        title: big ? t('Connecter un téléphone') : t('Taper au téléphone'),
        lines: big
          ? [t('Scannez avec votre téléphone, connecté au même réseau Wi-Fi que la borne.'), t('Aucune application à installer. Le QR code change toutes les 3 minutes et ne sert qu’une fois.')]
          : [t('Scannez ce QR sur le même réseau Wi-Fi que la borne.')],
      };
    case 'pending':
      return {
        phase: 'pending',
        code: bar.code,
        title: t('Comparez les codes'),
        lines: big ? [t('Le même code doit apparaître sur le téléphone ({device}).', { device: bar.line }), t('Start : accepter · Exit : refuser')] : [t('Start : accepter · Exit : refuser')],
      };
    case 'paired':
      return { phase: 'paired', title: big ? t('Téléphone connecté') : t('Le téléphone connecté tape ici'), lines: [bar.line] };
    default:
      return { phase: 'off', title: big ? t('Télécommande indisponible') : t('Saisie au téléphone indisponible'), lines: [bar.line] };
  }
}

export interface PhoneRemoteMenuHost {
  remote: PhoneRemote;
  library: {
    openCustom(build: () => Built, at?: number): void;
    openSystem(): void;
    /** L'écran affiché est-il celui-ci (pour que le QR ne vive que pendant qu'on le regarde) ? */
    showing(build: () => Built): boolean;
  };
  /** Envoi en cours, pour sa barre. */
  upload(): { name: string; received: number; size: number } | undefined;
}

export function createPhoneRemoteMenu(host: PhoneRemoteMenuHost) {
  function build(): Built {
    const bar: RemoteBar | undefined = host.remote.bar();
    const connected = host.remote.connected();
    const actions: Action[] = [];
    const back = () => host.library.openSystem();
    if (bar?.phase === 'pending') {
      actions.push(
        { label: t('Accepter ce téléphone'), detail: t('Start : le même code est affiché sur le téléphone'), icon: 'check', tone: 'ok', key: 'remote:accept', run: () => void host.remote.accept() },
        { label: t('Refuser'), detail: t('Exit : ce n’est pas mon téléphone'), icon: 'close', key: 'remote:refuse', run: () => void host.remote.refuse() },
      );
    }
    if (bar?.phase === 'paired') {
      actions.push({ label: t('Déconnecter le téléphone'), detail: t('Il ne pilote plus la borne ; un QR code neuf s’affiche'), icon: 'close', key: 'remote:end', run: () => host.remote.end() });
    }
    actions.push({ label: t('Retour'), icon: 'back', key: 'remote:back', run: back });
    const up = host.upload();
    // Une ligne chacune : l'écran tient sans zone de lecture, même avec le téléphone connecté.
    const rows: Row[] = [
      { text: t('Boutons de la borne : Start, flippers, Exit, MagnaSave'), icon: 'gamepad' },
      { text: t('Clavier : il tape à la place du clavier à l’écran'), icon: 'keyboard' },
      { text: t('Envoyer un fichier : dans le dossier d’import, {max} au plus', { max: formatSize(REMOTE_UPLOAD_MAX) }), icon: 'upload' },
      { text: t('Navigateur intégré : pavé tactile et clavier, dans « Récupérer »'), icon: 'globe' },
    ];
    const sections = [];
    if (up) {
      sections.push({
        title: t('Envoi en cours'),
        rows: [{ text: up.name, detail: t('{received} sur {size}', { received: formatSize(up.received), size: formatSize(up.size) }), icon: 'upload' as const, progress: { value: up.size ? up.received / up.size : 0 } }],
      });
    }
    sections.push({ title: t('Ce que fait le téléphone'), rows });
    return {
      heading: t('Télécommande du téléphone'),
      icon: 'phone',
      lead: t('Accepté à la borne, un seul à la fois ; la liaison se coupe après 20 minutes sans geste au menu.'),
      remote: bar,
      sections,
      actions,
      back,
      hint: bar?.phase === 'pending' ? t('Start : accepter ce téléphone · Exit : le refuser · Flippers ou Tab : choisir') : undefined,
    };
  }

  const item: ProvidedSystemItem = {
    get detail() {
      const connected = host.remote.connected();
      return connected ? t('Téléphone connecté : il pilote le menu, tape, envoie des fichiers') : t('Piloter la borne, taper et envoyer un fichier depuis son téléphone');
    },
    run: () => host.library.openCustom(build),
  };

  return {
    item,
    build,
    /** L'écran est affiché : son QR code vit (phone-remote.ts, show). */
    shown: () => host.library.showing(build),
  };
}
