// Menu système > Borne > Télécommande du téléphone (phone-remote.ts) : l'écran où le QR code vit
// hors du navigateur intégré. En grand à gauche, le QR à scanner, puis le code à comparer (Start
// accepte, Exit refuse), puis le téléphone connecté ; à droite, ce que fait le téléphone, l'envoi en
// cours, Déconnecter. Indisponible (pare-feu, pas de réseau local) : le bloc reste, grisé avec la
// raison. Le clavier à l'écran montre le même bloc, en bande, sous ses touches (library.ts).
// Sous « Téléphones gardés », ceux qui reviennent sans QR (remote-kept.ts) : en choisir un ouvre
// « Oublier ce téléphone ».
// Le nom de la borne sur le réseau ne se montre que s'il fait défaut (remote-name.ts) : sa raison, et
// ce qu'il change pour le téléphone (Android : l'adresse IP).

import { formatDate, formatSize, REMOTE_UPLOAD_MAX, remoteNameSummary, t, type KeptPhone } from '@cyberpinball/core';
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
 * (`keyboard`).
 */
/** Ce qu'un écran dit du téléphone à la place des phrases ordinaires (connexion dans Edge : le piloter). */
export interface RemoteWording {
  offer?: string;
  /** Phrases sous le titre d'un QR code qui n'appaire pas le téléphone (la page d'un auteur, crédits) : à la place de celles de la télécommande. */
  offerLines?: string[];
  paired?: string[];
}

export function remoteBlock(bar: RemoteBar, place: 'screen' | 'keyboard', wording?: RemoteWording): RemoteBlock {
  const big = place === 'screen';
  switch (bar.phase) {
    case 'offer':
      return {
        phase: 'offer',
        qr: bar.qr,
        title: wording?.offer ?? (big ? t('Connecter un téléphone') : t('Taper au téléphone')),
        lines: wording?.offerLines ?? (big
          ? [t('Scannez avec votre téléphone, connecté au même réseau Wi-Fi que la borne.'), t('Aucune application à installer. Accepté une fois, le téléphone revient ensuite sans QR code.')]
          : [t('Scannez ce QR sur le même réseau Wi-Fi que la borne.')]),
      };
    case 'pending':
      return {
        phase: 'pending',
        code: bar.code,
        title: t('Comparez les codes'),
        lines: big ? [t('Le même code doit apparaître sur le téléphone ({device}).', { device: bar.line }), t('Start : accepter · Exit : refuser')] : [t('Start : accepter · Exit : refuser')],
      };
    case 'paired':
      return { phase: 'paired', title: big ? t('Téléphone connecté') : t('Le téléphone connecté tape ici'), lines: wording?.paired ? [bar.line, ...wording.paired] : [bar.line] };
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

/** Jour court (« 10/11/2026 »), ou « aujourd’hui ». */
function day(ms: number, now = Date.now()): string {
  const same = new Date(ms).toDateString() === new Date(now).toDateString();
  return same ? t('aujourd’hui') : formatDate(ms, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Ligne d'un téléphone gardé : son nom, quand il a été accepté et vu pour la dernière fois. */
export function keptPhoneRow(phone: KeptPhone & { connected: boolean }, now = Date.now()): { text: string; detail: string; badges?: string[] } {
  return {
    text: phone.device,
    detail: t('Accepté le {added} · vu {seen}', { added: formatDate(phone.added, { day: '2-digit', month: '2-digit', year: 'numeric' }), seen: day(phone.seen, now) }),
    ...(phone.connected ? { badges: [t('Pilote maintenant')] } : {}),
  };
}

export function createPhoneRemoteMenu(host: PhoneRemoteMenuHost) {
  /** « Oublier ce téléphone » : il devra scanner le QR et être accepté de nouveau. */
  function buildForget(id: string): Built {
    const phone = host.remote.keptPhones().find((p) => p.id === id);
    const back = () => host.library.openCustom(build);
    if (!phone) return build();
    return {
      heading: t('Oublier ce téléphone ?'),
      icon: 'phone',
      lead: t('Il ne reviendra plus sans QR code : pour piloter de nouveau la borne, il devra scanner le QR et être accepté.'),
      sections: [{ rows: [{ ...keptPhoneRow(phone), icon: 'phone' }] }],
      actions: [
        { label: t('Oublier ce téléphone'), ...(phone.connected ? { detail: t('Il est connecté : il sera aussi déconnecté') } : {}), icon: 'trash', key: 'remote:forget', run: () => {
          host.remote.forget(id);
          back();
        } },
        { label: t('Retour'), icon: 'back', key: 'remote:forget-back', run: back },
      ],
      back,
    };
  }

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
      actions.push({ label: t('Déconnecter le téléphone'), detail: t('Il ne pilote plus la borne ; gardé, il pourra revenir sans QR code'), icon: 'close', key: 'remote:end', run: () => host.remote.end() });
    }
    // Le nom de la borne qui fait défaut, ou un téléphone qui ne le trouve pas : la raison.
    let nameSection: { title: string; rows: Row[] } | undefined;
    const name = host.remote.nameFacts();
    const said = name && remoteNameSummary(name);
    if (name && said && said.state !== 'ok') {
      nameSection = { title: t('Nom de la borne sur le réseau'), rows: [{ text: said.title, detail: said.detail, tone: 'warning' as const, badges: [t('À vérifier')], icon: 'network' as const }] };
    }
    actions.push({ label: t('Retour'), icon: 'back', key: 'remote:back', run: back });
    // Téléphones gardés : chacun une ligne à choisir, qui ouvre « Oublier ce téléphone ».
    const kept = host.remote.keptPhones();
    const keptRows: Row[] = kept.map((phone) => {
      actions.push({ label: phone.device, key: `remote:kept:${phone.id}`, run: () => host.library.openCustom(() => buildForget(phone.id)) });
      return { ...keptPhoneRow(phone), icon: 'phone', action: actions.length - 1, pick: true };
    });
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
    if (keptRows.length) sections.push({ title: t('Téléphones gardés'), rows: keptRows });
    if (nameSection) sections.push(nameSection);
    sections.push({ title: t('Ce que fait le téléphone'), rows });
    return {
      heading: t('Télécommande du téléphone'),
      icon: 'phone',
      lead: t('Accepté une fois, un téléphone est gardé : il revient ensuite sans QR code. Un seul pilote à la fois.'),
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
