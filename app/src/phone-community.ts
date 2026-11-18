// Communauté au téléphone, côté borne (18/11/2026, maquettes « Communauté au téléphone ») : le profil
// d'un joueur tel que la borne le montre (profile-menu.ts, buildProfile), rangé pour la page du
// téléphone, et les gestes qu'on y fait.
//
// Une seule source : le téléphone ne recopie pas le profil, il reçoit celui de la borne, ses lignes et
// ses actions. Chaque action porte son identité dans l'écran de la borne (sa clé, sinon son libellé) ;
// le téléphone ne renvoie que cette identité et la clé du joueur, la borne refait le profil et ne lance
// que l'action qui la porte. Ce qui se passe au toucher (`where`) :
// - `here` : le profil change sur place (demande d'ami, « J'aime », masquer son activité) ;
// - `borne` : un écran s'ouvre à la borne (inviter à une partie, sa bibliothèque, un groupe) ;
// - `thread` : le fil s'ouvre au téléphone (écrire à un ami) ;
// - `confirm` : le téléphone demande d'abord (bloquer, retirer de mes amis), puis la borne le fait
//   sans rouvrir sa propre confirmation.
//
// Sans electron à l'exécution : les tests du cœur chargent ce module.

import { remoteText } from '@cyberpinball/core';
import type { Built, Row } from './library';
import type { RemoteProfile } from './phone-remote';
import type { ProfileMenu } from './profile-menu';
import type { SocialNet } from './social-net';

export interface PhoneCommunityHost {
  profiles: Pick<ProfileMenu, 'remote'>;
  net: Pick<SocialNet, 'publicCard' | 'likedByMe' | 'remove' | 'accept' | 'decline' | 'state'>;
  /** Bloquer un joueur, comme le profil de la borne le fait après sa confirmation. */
  block(key: string): void;
  /** Le téléphone doit recevoir le profil redessiné. */
  refresh(): void;
}

export interface PhoneCommunity {
  /** Le profil d'un joueur pour le téléphone ; undefined pour moi-même ou une clé inconnue. */
  profile(key: string): RemoteProfile | undefined;
  /** Une action du profil, par son identité dans l'écran de la borne. */
  act(key: string, act: string): void;
  /** Accepter ou refuser une demande reçue (liste « Joueurs »). */
  answer(key: string, yes: boolean): void;
}

/** Actions qui ouvrent un écran à la borne ; celles que le téléphone confirme lui-même. */
const AT_CABINET = new Set(['invite', 'library']);
const CONFIRMED = new Set(['block', 'unfriend']);
/** Les actions mises en avant, dans cet ordre : la première disponible devient le bouton principal. */
const PRIMARY = ['accept', 'request', 'write', 'invite'];

const TEXT_MAX = 300;
const clip = (s: string | undefined) => (s === undefined ? undefined : remoteText(s, TEXT_MAX));

export function createPhoneCommunity(host: PhoneCommunityHost): PhoneCommunity {
  const idOf = (a: { key?: string; label: string }) => a.key ?? a.label;
  const whereOf = (id: string): RemoteProfile['actions'][number]['where'] =>
    id === 'write' ? 'thread' : CONFIRMED.has(id) ? 'confirm' : AT_CABINET.has(id) || id.startsWith('group:') ? 'borne' : 'here';

  function profile(key: string): RemoteProfile | undefined {
    if (key === host.net.state().key.publicKey) return undefined;
    const built = host.profiles.remote(key, host.refresh);
    return fromBuilt(key, built);
  }

  /** Le profil de la borne, rangé pour la page : en-tête, niveau, badges, activité, groupes, actions. */
  function fromBuilt(key: string, built: Built): RemoteProfile {
    const card = host.net.publicCard(key);
    const line = (r: Row) => ({ text: clip(r.text) ?? '', ...(r.detail ? { detail: clip(r.detail) } : {}), ...(r.tone ? { tone: r.tone } : {}), ...(r.icon ? { icon: r.icon } : {}) });
    const out: RemoteProfile = { key, name: clip(built.heading) ?? '', avatar: built.avatar!, subheading: clip(built.subheading) ?? '', rows: [], notes: [], actions: [] };
    const flag = card?.country ? `drapeaux/${card.country.toLowerCase()}.svg` : undefined;
    if (flag && /^drapeaux\/[a-z]{2}\.svg$/.test(flag)) out.flag = flag;
    built.sections.forEach((section, n) => {
      switch (section.kind) {
        case 'profile-head':
          out.rows.push(...section.rows.map(line));
          return;
        case 'profile-level': {
          const r = section.rows[0];
          if (r) out.level = { text: clip(r.text) ?? '', ...(r.detail ? { detail: clip(r.detail) } : {}), ...(r.progress ? { progress: r.progress.value } : {}) };
          return;
        }
        case 'profile-badges': {
          const r = section.rows[0];
          if (!r) return;
          const medals = (r.medals ?? []).map((m) => ({ icon: m.icon, rarity: m.rarity, label: clip(m.label) ?? '' }));
          out.badges = { text: clip(r.text) ?? '', ...(r.detail ? { detail: clip(r.detail) } : {}), medals };
          return;
        }
        case 'profile-activity':
          out.activity = {
            title: clip(section.title) ?? '',
            rows: section.rows.map((r) => {
              const id = r.action !== undefined ? built.actions[r.action]?.key : undefined;
              const like = id?.startsWith('like:') ? id.slice(5) : undefined;
              return {
                ...line(r),
                ...(like && card ? { likes: card.likes[like] ?? 0, liked: host.net.likedByMe(key, like), act: id } : {}),
              };
            }),
          };
          return;
        case 'profile-groups':
          out.groups = section.rows.flatMap((r) => {
            const id = r.action !== undefined ? built.actions[r.action]?.key : undefined;
            return id ? [{ text: clip(r.text) ?? '', ...(r.detail ? { detail: clip(r.detail) } : {}), act: id }] : [];
          });
          return;
        case 'profile-note':
          out.notes.push(...section.rows.map((r) => clip(r.text) ?? ''));
          return;
        default:
          // Le constat de la dernière action, en tête ; les autres faits (personnes invitées) parmi les lignes.
          if (n === 0 && !section.title && section.rows.length === 1) {
            const r = section.rows[0]!;
            out.flash = { text: clip(r.text) ?? '', ...(r.detail ? { detail: clip(r.detail) } : {}), ...(r.tone ? { tone: r.tone } : {}) };
          } else out.rows.push(...section.rows.map(line));
      }
    });
    // Les actions du profil, sans Retour (le téléphone a le sien) ni les « J'aime » et les groupes,
    // montrés sur leur ligne.
    const shown = built.actions.filter((a) => a.key !== 'back' && !a.key?.startsWith('like:') && !a.key?.startsWith('group:'));
    const primary = PRIMARY.find((id) => shown.some((a) => idOf(a) === id && a.tone !== 'quiet'));
    out.actions = shown.map((a) => {
      const id = idOf(a);
      return {
        act: id,
        label: clip(a.label) ?? '',
        ...(a.detail ? { detail: clip(a.detail) } : {}),
        ...(a.icon ? { icon: a.icon } : {}),
        ...(a.tone === 'quiet' ? { quiet: true } : {}),
        ...(id === primary ? { primary: true } : {}),
        where: whereOf(id),
      };
    });
    return out;
  }

  function act(key: string, id: string): void {
    if (key === host.net.state().key.publicKey) return;
    // Déjà confirmé au téléphone : la borne le fait sans rouvrir sa propre confirmation.
    if (id === 'block') {
      host.block(key);
      return host.refresh();
    }
    if (id === 'unfriend') {
      if (host.net.state().friends.some((f) => f.key === key)) host.net.remove(key);
      return host.refresh();
    }
    const built = host.profiles.remote(key, host.refresh);
    const action = built.actions.find((a) => idOf(a) === id);
    // Retour, une action grisée, ou une identité que le profil n'a plus : rien.
    if (!action || action.key === 'back' || action.tone === 'quiet') return;
    action.run();
    host.refresh();
  }

  function answer(key: string, yes: boolean): void {
    if (!host.net.state().incoming.some((r) => r.key === key)) return;
    if (yes) host.net.accept(key);
    else host.net.decline(key);
    host.refresh();
  }

  return { profile, act, answer };
}
