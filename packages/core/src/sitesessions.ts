// Comptes des sites sources (vpuniverse.com, vpforums.org, pinballnirvana.com,
// pinsound-community.org) : l'utilisateur s'y connecte une fois, dans la session de la
// fenêtre « Récupérer » (persist:acquisition), qui garde ses cookies d'un démarrage à
// l'autre, comme un navigateur. Cyber Pinball ne voit ni ne garde aucun mot de passe :
// il lit seulement, dans les cookies de cette session, si l'utilisateur est connecté et
// jusqu'à quand.

import type { LinkHostId } from './acquisition';
import { t, tn } from './i18n';

/** Cookie tel que la session d'Electron le donne (cookies.get). */
export interface SiteCookie {
  name: string;
  value: string;
  domain?: string;
  /** Fin de validité, en secondes depuis 1970 ; absent : cookie de session (perdu à la fermeture). */
  expirationDate?: number;
}

export interface SourceSite {
  id: LinkHostId;
  /** « vpuniverse.com » */
  label: string;
  /** Domaine des cookies. */
  domain: string;
  home: string;
  /** Page de connexion. */
  login: string;
  /** Moteur du forum : il dit quels cookies signalent un membre connecté. */
  engine: 'invision' | 'ipboard3' | 'xenforo';
}

export const SOURCE_SITES: readonly SourceSite[] = [
  { id: 'vpuniverse', label: 'vpuniverse.com', domain: 'vpuniverse.com', home: 'https://vpuniverse.com/', login: 'https://vpuniverse.com/login/', engine: 'invision' },
  { id: 'vpforums', label: 'vpforums.org', domain: 'vpforums.org', home: 'https://www.vpforums.org/', login: 'https://www.vpforums.org/index.php?app=core&module=global&section=login', engine: 'ipboard3' },
  { id: 'pinballnirvana', label: 'pinballnirvana.com', domain: 'pinballnirvana.com', home: 'https://pinballnirvana.com/', login: 'https://pinballnirvana.com/forums/login/', engine: 'xenforo' },
  { id: 'pinsound', label: 'pinsound-community.org', domain: 'pinsound-community.org', home: 'https://www.pinsound-community.org/', login: 'https://www.pinsound-community.org/index.php?/login/', engine: 'invision' },
];

export function sourceSite(id: LinkHostId): SourceSite | undefined {
  return SOURCE_SITES.find((s) => s.id === id);
}

export interface SiteState {
  connected: boolean;
  /** La connexion survit à la fermeture de Cyber Pinball (« se souvenir de moi » coché). */
  remembered: boolean;
  /** Fin de validité de la connexion gardée. */
  expires?: Date;
}

/** Cookies qui disent « membre connecté », et celui qui garde la connexion, selon le moteur. */
const MEMBER: Record<SourceSite['engine'], { member: string; keep: string[] }> = {
  // Invision Community : identifiant du membre (0 pour un visiteur) ; « se souvenir de moi » : clés de connexion et de l’appareil (environ 3 mois).
  invision: { member: 'ips4_member_id', keep: ['ips4_login_key', 'ips4_device_key'] },
  // IP.Board 3 : identifiant du membre et empreinte du mot de passe (pas le mot de passe).
  ipboard3: { member: 'member_id', keep: ['pass_hash', 'member_id'] },
  // XenForo 2 : « id,clé » quand « rester connecté » est coché (365 jours) ; xf_session seul ne prouve rien (un visiteur en a un).
  xenforo: { member: 'xf_user', keep: ['xf_user'] },
};

/** État de connexion d'après les cookies de la session pour ce site. */
export function siteState(site: SourceSite, cookies: SiteCookie[], now = new Date()): SiteState {
  const live = cookies.filter((c) => !c.expirationDate || c.expirationDate * 1000 > now.getTime());
  const rule = MEMBER[site.engine];
  const member = live.find((c) => c.name === rule.member || c.name.endsWith(`_${rule.member}`));
  const connected = Boolean(member && member.value && member.value !== '0' && member.value !== 'deleted');
  if (!connected) return { connected: false, remembered: false };
  const kept = live.filter((c) => rule.keep.some((k) => c.name === k || c.name.endsWith(`_${k}`)) && c.value && c.expirationDate);
  const expires = kept.length ? new Date(Math.min(...kept.map((c) => c.expirationDate! * 1000))) : undefined;
  return { connected: true, remembered: Boolean(expires), expires };
}

// ---------------------------------------------------------------------------
// Téléchargement direct : une sonde par moteur de forum
//
// Sur demande de l'utilisateur, et seulement quand il est connecté, la fiche est chargée
// dans une vue cachée de sa session ; la sonde lit la page et dit quoi faire : suivre
// le lien de téléchargement que le site propose à ce membre, ou s'arrêter et montrer la
// page. On ne fabrique jamais d'adresse (pas de « confirm=1 » ni de « t=1 » ajoutés), on
// n'accepte aucune condition, on n'attend aucun délai, on ne résout aucune vérification :
// tout cela revient à l'utilisateur, dans la fenêtre visible. Parcours relevés le
// 22 octobre 2026 (docs/recherche/acquisition.md, § 14).

/**
 * Pourquoi montrer la page : un code, que probeReasonText dit dans la langue de
 * l'interface (la sonde tourne dans la page du site, sans le catalogue).
 */
export type ProbeReason = 'challenge' | 'down' | 'captcha' | 'forbidden' | 'choice' | 'delay' | 'elsewhere' | 'terms' | 'no-button' | 'proxy' | 'quota' | 'unreadable';

/** Ce que la sonde a vu dans la page. */
export type ProbeResult =
  /** Suivre ce lien, que le site donne au membre. */
  | { kind: 'follow'; href: string }
  /** Montrer la page à l'utilisateur, et pourquoi (count : fichiers au choix). */
  | { kind: 'show'; reason: ProbeReason; count?: number }
  /** La page dit que l'utilisateur n'est pas connecté. */
  | { kind: 'login' };

/** Raison de montrer la page, en clair, sans majuscule ni point final. */
export function probeReasonText(probe: { reason: ProbeReason; count?: number }): string {
  switch (probe.reason) {
    case 'challenge':
      return t('le site fait une vérification (Cloudflare) : à faire vous-même');
    case 'down':
      return t('le site ne répond pas pour l’instant');
    case 'captcha':
      return t('le site demande un CAPTCHA : à faire vous-même');
    case 'forbidden':
      return t('votre compte n’a pas le droit de télécharger ce fichier');
    case 'choice':
      return tn(probe.count ?? 2, '{n} fichier au choix : choisissez celui qu’il faut', '{n} fichiers au choix : choisissez celui qu’il faut');
    case 'delay':
      return t('le site impose un délai avant le téléchargement');
    case 'elsewhere':
      return t('le fichier est sur un autre site');
    case 'terms':
      return t('des conditions sont à accepter : à faire vous-même');
    case 'no-button':
      return t('pas de bouton de téléchargement reconnu sur la page');
    case 'proxy':
      return t('le site refuse les connexions par proxy ou VPN');
    case 'quota':
      return t('plafond de téléchargements du compte atteint');
    case 'unreadable':
      return t('page illisible');
  }
}

/** Partie commune des scripts de page : vérification de Cloudflare, site en panne, lien hors du site. */
export const COMMON_PROBE = String.raw`
  const text = (document.body && document.body.innerText) || '';
  if (document.querySelector('#challenge-form, #cf-challenge-running, .cf-turnstile, iframe[src*="challenges.cloudflare.com"]') || /^Just a moment/i.test(document.title))
    return { kind: 'show', reason: 'challenge' };
  if (/\b52[0-9]\b/.test(document.title) && /cloudflare/i.test(text)) return { kind: 'show', reason: 'down' };
  if (/captcha/i.test(document.body ? document.body.innerHTML.slice(0, 200000) : '') && document.querySelector('iframe[src*="captcha"], .g-recaptcha, .h-captcha'))
    return { kind: 'show', reason: 'captcha' };
  const same = (a) => { try { return new URL(a.href, location.href).hostname.replace(/^www\./, '') === location.hostname.replace(/^www\./, ''); } catch (e) { return false; } };
`;

/** Invision Community (vpuniverse.com, pinsound-community.org). */
const INVISION = /* i18n-ignore : script de la page du site, commentaires et motifs */ String.raw`(() => {${COMMON_PROBE}
  if ((window.ipsSettings && window.ipsSettings.memberID === 0) || document.querySelector('#elUserSignIn')) return { kind: 'login' };
  if (/download_no_perm|You do not have permission/i.test(text)) return { kind: 'show', reason: 'forbidden' };
  // Page de choix : une ligne par fichier.
  const rows = [...document.querySelectorAll('.ipsDataItem')].filter((r) => r.querySelector('a[href*="do=download"]'));
  if (rows.length > 1) return { kind: 'show', reason: 'choice', count: rows.length };
  if (rows.length === 1) {
    const a = rows[0].querySelector('a[href*="do=download"]');
    if (a.dataset.wait === 'true' || a.getAttribute('data-wait') === 'true') return { kind: 'show', reason: 'delay' };
    return same(a) ? { kind: 'follow', href: a.href } : { kind: 'show', reason: 'elsewhere' };
  }
  if (document.querySelector('form [name="agree"], #elDownloadTerms, .ipsType_richText + .ipsButton[href*="agree"]')) return { kind: 'show', reason: 'terms' };
  // Fiche : le bouton de téléchargement.
  const button = [...document.querySelectorAll('a[href*="do=download"]')].find((a) => !/[?&]r=/.test(a.href));
  if (button) {
    if (button.dataset.wait === 'true') return { kind: 'show', reason: 'delay' };
    return same(button) ? { kind: 'follow', href: button.href } : { kind: 'show', reason: 'elsewhere' };
  }
  return { kind: 'show', reason: 'no-button' };
})()`;

/** IP.Board 3 (vpforums.org). */
const IPBOARD3 = /* i18n-ignore : script de la page du site, motifs de recherche */ String.raw`(() => {${COMMON_PROBE}
  if (/Attention Proxy Users/i.test(text)) return { kind: 'show', reason: 'proxy' };
  if (document.querySelector('#sign_in, a[href*="section=login"]') && !document.querySelector('#user_link')) return { kind: 'login' };
  if (document.querySelector('a#agree_disclaimer')) return { kind: 'show', reason: 'terms' };
  const files = [...document.querySelectorAll('#files li a[href]')];
  if (files.length > 1) return { kind: 'show', reason: 'choice', count: files.length };
  if (files.length === 1) return same(files[0]) ? { kind: 'follow', href: files[0].href } : { kind: 'show', reason: 'elsewhere' };
  if (/download limit|limite de téléchargement/i.test(text)) return { kind: 'show', reason: 'quota' };
  const button = document.querySelector('a.download_button');
  if (button) return same(button) ? { kind: 'follow', href: button.href } : { kind: 'show', reason: 'elsewhere' };
  return { kind: 'show', reason: 'no-button' };
})()`;

/** XenForo 2 avec le module de ressources (pinballnirvana.com). */
const XENFORO = String.raw`(() => {${COMMON_PROBE}
  if (document.documentElement.getAttribute('data-logged-in') === 'false') return { kind: 'login' };
  if ([...document.querySelectorAll('span.is-disabled')].some((s) => /permission/i.test(s.textContent || ''))) return { kind: 'show', reason: 'forbidden' };
  const files = [...document.querySelectorAll('a[href*="/download?file="]')];
  if (files.length > 1) return { kind: 'show', reason: 'choice', count: files.length };
  if (files.length === 1) return same(files[0]) ? { kind: 'follow', href: files[0].href } : { kind: 'show', reason: 'elsewhere' };
  const button = document.querySelector('.p-title-pageAction a[href*="/download"]');
  if (button) return same(button) ? { kind: 'follow', href: button.href } : { kind: 'show', reason: 'elsewhere' };
  return { kind: 'show', reason: 'no-button' };
})()`;

/** Script à exécuter dans la page pour ce moteur ; il renvoie un ProbeResult. */
export const DOWNLOAD_PROBES: Record<SourceSite['engine'], string> = {
  invision: INVISION,
  ipboard3: IPBOARD3,
  xenforo: XENFORO,
};

/** Au plus, pages traversées avant d'abandonner (fiche, page de choix, confirmation). */
export const DIRECT_MAX_STEPS = 4;

/** Le site d'un lien, s'il a un moteur connu. */
export function siteOfUrl(url: string): SourceSite | undefined {
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
  return SOURCE_SITES.find((s) => host === s.domain || host.endsWith(`.${s.domain}`));
}

/**
 * Minuteur d'un site (VPUniverse : environ 45 s par fichier pour un compte gratuit),
 * pour un téléchargement que l'utilisateur a demandé en acceptant d'attendre : `click`
 * clique le lien comme un membre (la page demande l'attente au serveur, puis décompte
 * et lance le fichier d'elle-même) et renvoie true s'il l'a trouvé ; `counter` lit les
 * secondes affichées. Le serveur tient l'attente : rien n'est raccourci. Relevé dans le
 * script du site (downloads.front.view.download, doDownload) le 24/10/2026.
 */
export const WAIT_PROBES: Partial<Record<SourceSite['engine'], { click: string; counter: string }>> = {
  invision: {
    click: String.raw`(() => {
      const links = [...document.querySelectorAll('a[data-action="download"][data-wait], a[href*="do=download"][data-wait]')];
      if (links.length !== 1) return false;
      links[0].click();
      return true;
    })()`,
    counter: String.raw`(() => {
      const c = document.querySelector('[data-role="downloadCounter"]');
      const n = c ? parseInt(c.textContent || '', 10) : NaN;
      return Number.isFinite(n) ? n : null;
    })()`,
  },
};
