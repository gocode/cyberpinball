// Écran « Votre profil de joueur », proposé une seule fois, au premier démarrage du menu (juste
// après l'assistant d'écrans de l'installation) : choisir son pseudo au clavier à l'écran, et mettre
// un avatar (avatar-menu.ts : une photo ou une image, recadrée aux boutons). Rien d'obligatoire :
// « Continuer » (ou Exit) reprend le premier démarrage là où il en était (installer VPX, ajouter une
// table, la roue). Le même réglage reste ensuite dans Menu système > Amis > Partage et réseau.
//
// Proposé seulement si le profil porte encore le nom donné d'office et aucun avatar
// (profileWelcomeDue, social.ts) ; noté dans social.json dès qu'il s'ouvre, il ne revient jamais.
//
// Sans electron à l'exécution : les tests du cœur chargent ce module avec un réseau coupé.

import { avatarView, hasDefaultName, NAME_MAX, NAME_MIN, t } from '@cyberpinball/core';
import type { AvatarMenu } from './avatar-menu';
import type { Action, Built, Row } from './library';

export interface ProfileWelcomeHost {
  library: {
    openCustom(build: () => Built, at?: number): void;
    openPrompt(heading: string, label: string, value: string, done: (value: string | undefined) => void, lead?: string): void;
  };
  net: {
    state(): { key: { publicKey: string }; name: string; avatar?: string };
    rename(name: string): boolean;
    avatarFile(key: string): string | undefined;
    markProfileOffered(): void;
  };
  avatarMenu: Pick<AvatarMenu, 'open'>;
}

export interface ProfileWelcome {
  /** Ouvre l'écran ; `done` : la suite du premier démarrage (Continuer, ou Exit). */
  open(done: () => void): void;
}

/** Place des actions : la sélection y revient après chaque geste. */
const NAME_AT = 0;
const AVATAR_AT = 1;
const CONTINUE_AT = 2;

export function createProfileWelcome(host: ProfileWelcomeHost): ProfileWelcome {
  let done: () => void = () => undefined;
  let flash: Row | undefined;

  const me = () => host.net.state();
  /** Un geste de l'utilisateur : le message du geste précédent s'efface. */
  const gesture = (run: () => void) => () => {
    flash = undefined;
    run();
  };
  const show = (at: number) => host.library.openCustom(build, at);

  function askName(): void {
    const s = me();
    // Le nom donné d'office ne se garde pas en tapant : le champ part vide.
    host.library.openPrompt(t('Votre pseudo'), t('Pseudo'), hasDefaultName(s) ? '' : s.name, (value) => {
      if (value === undefined) return show(NAME_AT);
      if (!host.net.rename(value)) {
        flash = { text: t('Pseudo refusé : {min} à {max} lettres, chiffres, espaces, tirets ou points', { min: NAME_MIN, max: NAME_MAX }), tone: 'error' };
        return show(NAME_AT);
      }
      flash = { text: t('Pseudo choisi : {name}', { name: me().name }), tone: 'ok' };
      show(me().avatar ? CONTINUE_AT : AVATAR_AT);
    }, t('De {min} à {max} caractères : lettres, chiffres, espaces, tirets ou points.', { min: NAME_MIN, max: NAME_MAX }));
  }

  function build(): Built {
    const s = me();
    const named = !hasDefaultName(s);
    const pictured = Boolean(s.avatar);
    // Le message reste jusqu'au geste suivant : l'écran se redessine (changement du profil, 250 ms
    // plus tard) sans le perdre.
    const rows: Row[] = flash ? [flash] : [];
    rows.push(
      named
        ? { text: t('Pseudo : {name}', { name: s.name }), detail: t('Vu tel quel par les autres joueurs, à côté de votre avatar'), tone: 'ok', badges: [t('Choisi')], icon: 'friend-list' }
        : { text: t('Pseudo : {name}', { name: s.name }), detail: t('Donné d’office : choisissez le vôtre'), tone: 'info', icon: 'friend-list' },
      pictured
        ? { text: t('Avatar : une image à vous'), detail: t('Recadrée en carré, vue à côté de votre pseudo'), tone: 'ok', badges: [t('Choisi')], icon: 'avatar' }
        : { text: t('Avatar : vos initiales en attendant'), detail: t('Une photo ou une image, recadrée aux boutons de la borne'), tone: 'info', icon: 'avatar' },
      { text: t('Qui les voit'), detail: t('Vos amis et les classements : votre pseudo et votre avatar, à côté de vos scores publiés. L’annuaire des joueurs : votre pseudo seulement.'), icon: 'eye' },
    );
    const actions: Action[] = [
      { label: named ? t('Changer de pseudo…') : t('Choisir mon pseudo…'), detail: t('Au clavier à l’écran, de {min} à {max} caractères', { min: NAME_MIN, max: NAME_MAX }), icon: 'edit', ...(named ? {} : { tone: 'ok' as const }), run: gesture(askName) },
      {
        label: pictured ? t('Changer d’avatar…') : t('Mettre un avatar…'),
        detail: t('Une image de ce PC ou du web, recadrée aux boutons'),
        icon: 'image',
        ...(named && !pictured ? { tone: 'ok' as const } : {}),
        // Revenu sans avatar : la sélection reste dessus, pas sur « Continuer ».
        run: gesture(() => host.avatarMenu.open(() => show(me().avatar ? CONTINUE_AT : AVATAR_AT))),
      },
      { label: t('Continuer'), detail: named || pictured ? t('Tout se change plus tard : Menu système > Amis > Partage et réseau') : t('Plus tard : Menu système > Amis > Partage et réseau'), icon: 'check', ...(named && pictured ? { tone: 'ok' as const } : {}), run: gesture(() => done()) },
    ];
    return {
      heading: t('Votre profil de joueur'),
      icon: 'account',
      avatar: avatarView(s.key.publicKey, s.name, host.net.avatarFile(s.key.publicKey)),
      subheading: s.name,
      lead: t('Bienvenue ! Choisissez le pseudo et l’avatar que verront les autres joueurs. Rien d’obligatoire : vous pourrez les changer à tout moment.'),
      sections: [{ rows }],
      actions,
      back: gesture(() => done()),
    };
  }

  return {
    open(then) {
      done = then;
      // Proposé une fois : même quitté en route, il ne revient pas au démarrage suivant.
      host.net.markProfileOffered();
      show(NAME_AT);
    },
  };
}
