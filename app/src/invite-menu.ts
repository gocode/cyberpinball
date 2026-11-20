// « Qui vous a fait découvrir Cyber Pinball ? » (personnes invitées, invitations.ts, 17/11/2026) :
// proposé à l'accueil du profil (profile-welcome.ts), puis dans « Mon profil public » (Menu système >
// Amis > Mon profil public) pendant les DECLARE_DAYS premiers jours. Le joueur choisit qui l'a invité (son réseau local d'abord, ses amis,
// ou une recherche dans l'annuaire), ou « Personne ». L'invitation compte à sa première partie menée
// au bout : sa borne signe alors une attestation pour l'inviteur. Le profil de la personne invitée ne
// dit jamais qui l'a invitée ; seul le profil de l'inviteur montre ses personnes invitées.
//
// Sans electron à l'exécution : les tests chargent ce module avec un réseau coupé.

import { avatarView, nearbyPlayers, searchDirectory, t, tn, type DirectoryEntry, type InvitationStore, type SocialState } from '@cyberpinball/core';
import { onGesture } from './gesture-flash';
import type { Action, Built, Row, Section } from './library';

export interface InviteMenuHost {
  library: {
    openCustom(build: () => Built, at?: number): void;
    openPrompt(heading: string, label: string, value: string, done: (value: string | undefined) => void, lead?: string): void;
  };
  net: {
    state(): SocialState;
    invitations(): InvitationStore;
    declareInviter(key: string, name: string): void;
    declineInviter(): void;
    confirmInvitation(): void;
    avatarFile(key: string): string | undefined;
  };
  /** Au moins une partie menée au bout : l'invitation déclarée compte tout de suite. */
  played(): boolean;
  now?(): Date;
}

export interface InviteMenu {
  /** Ouvre l'écran ; `back` : où revenir (Exit, ou après un choix). */
  open(back: () => void): void;
}

/** Joueurs montrés au plus par liste. */
const SHOWN = 8;

type Player = { key: string; name: string };

export function createInviteMenu(host: InviteMenuHost): InviteMenu {
  const now = () => host.now?.() ?? new Date();
  let back: () => void = () => undefined;
  let flash: Row | undefined;
  onGesture(() => (flash = undefined));

  const avatar = (key: string, name: string) => avatarView(key, name, host.net.avatarFile(key));
  const show = () => host.library.openCustom(build);

  function choose(key: string, name: string): void {
    host.net.declareInviter(key, name);
    // Déjà une partie menée au bout : l'invitation compte maintenant.
    if (host.played()) host.net.confirmInvitation();
    flash = { text: t('Merci ! {name} le verra sur son profil', { name }), tone: 'ok' };
    show();
  }

  function playerRows(list: readonly Player[], actions: Action[], detail: string): Row[] {
    const declared = host.net.invitations().declared?.by;
    return list.slice(0, SHOWN).map((p) => {
      const index = actions.push({ label: p.name, key: `inviter:${p.key}`, icon: 'friend-add', run: () => choose(p.key, p.name) }) - 1;
      return { text: p.name, avatar: avatar(p.key, p.name), detail, ...(declared === p.key ? { current: true, badges: [t('Choisi')] } : {}), action: index, pick: true } satisfies Row;
    });
  }
  const players = (list: readonly DirectoryEntry[]): Player[] => list.map((d) => ({ key: d.profile.key, name: d.profile.name }));

  function askSearch(value = ''): void {
    host.library.openPrompt(t('Qui vous a fait découvrir Cyber Pinball ?'), t('Nom du joueur'), value, (query) => (query && query.trim() ? host.library.openCustom(() => buildResults(query.trim())) : show()));
  }

  function buildResults(query: string): Built {
    const s = host.net.state();
    const me = s.key.publicKey;
    const found = searchDirectory(s, query).filter((d) => d.profile.key !== me);
    const actions: Action[] = [];
    const rows = playerRows(players(found), actions, t('Dans l’annuaire'));
    actions.push({ label: t('Chercher un autre nom…'), icon: 'search', run: () => askSearch(query) }, { label: t('Retour'), icon: 'back', run: show });
    return {
      heading: t('Résultats'),
      icon: 'friend-add',
      subheading: t('« {query} » · {count}', { query, count: tn(found.length, '{n} joueur', '{n} joueurs') }),
      sections: [{ rows: rows.length ? rows : [{ text: t('Personne de ce nom dans l’annuaire'), detail: t('L’annuaire ne connaît que les bornes vues depuis le démarrage du partage : réessayez quand sa borne est allumée'), tone: 'info' }] }],
      actions,
      back: show,
    };
  }

  function build(): Built {
    const s = host.net.state();
    const inv = host.net.invitations();
    const me = s.key.publicKey;
    const rows: Row[] = flash ? [flash] : [];
    const actions: Action[] = [];
    const sections: Section[] = [];
    if (inv.mine) {
      // Confirmé : plus rien à changer.
      rows.push({ text: t('{name} vous a fait découvrir Cyber Pinball', { name: inv.declared?.name ?? inv.mine.name }), detail: inv.sent ? t('C’est compté : il le voit sur son profil') : t('C’est compté : il le verra sur son profil dès que sa borne sera en ligne'), tone: 'ok', icon: 'check' });
      sections.push({ rows });
      actions.push({ label: t('Retour'), icon: 'back', run: back });
      return { heading: t('Qui vous a fait découvrir Cyber Pinball ?'), icon: 'friend-add', sections, actions, back };
    }
    if (inv.declared) {
      rows.push({
        text: t('Vous avez choisi {name}', { name: inv.declared.name }),
        detail: t('Ça comptera à votre première partie menée au bout : il le verra alors sur son profil'),
        tone: 'ok',
        icon: 'check',
      });
    }
    if (rows.length) sections.push({ rows });
    const near = nearbyPlayers(s, now()).filter((d) => d.profile.key !== me);
    const nearKeys = new Set(near.map((d) => d.profile.key));
    if (near.length) sections.push({ title: t('Sur votre réseau local'), rows: playerRows(players(near), actions, t('Sa borne est sur votre réseau local')) });
    const friends: Player[] = s.friends.filter((f) => !nearKeys.has(f.key)).map((f) => ({ key: f.key, name: f.name }));
    if (friends.length) sections.push({ title: t('Vos amis'), rows: playerRows(friends, actions, t('Ami')) });
    actions.push({ label: t('Chercher un joueur…'), detail: t('Son pseudo, ou l’identifiant vu sur sa fiche'), icon: 'search', run: () => askSearch() });
    actions.push({
      label: t('Personne : je l’ai trouvé seul'),
      detail: t('La question ne sera plus posée'),
      icon: 'close',
      run: () => {
        host.net.declineInviter();
        back();
      },
    });
    actions.push(inv.declared ? { label: t('Valider'), icon: 'check', tone: 'ok', run: back } : { label: t('Plus tard'), detail: t('Menu système > Communauté > Mon profil > Confidentialité > Mon profil public, pendant un mois'), icon: 'back', run: back });
    if (!sections.length) sections.push({ rows: [{ text: t('Personne sur votre réseau local pour l’instant'), detail: t('Cherchez son pseudo dans l’annuaire'), tone: 'info', icon: 'info' }] });
    return {
      heading: t('Qui vous a fait découvrir Cyber Pinball ?'),
      icon: 'friend-add',
      lead: t('Un joueur vous a fait découvrir Cyber Pinball ? Dites-le : il le verra sur son profil, parmi les personnes qu’il a invitées. Votre profil, lui, n’en dit rien.'),
      sections,
      actions,
      back,
    };
  }

  return {
    open(then) {
      back = then;
      flash = undefined;
      show();
    },
  };
}
