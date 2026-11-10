// Compte YouTube du Juke-box (youtube-account.ts) : état de connexion d'après les cookies, fichier
// Netscape pour yt-dlp (écrit, relu, cookies renouvelés), playlists du compte, recherche filtrée.
// Cookies et playlists entièrement fictifs : aucune valeur réelle.

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { setLanguage } from '../i18n';
import {
  accountPlaylistsArgs,
  browserCookiesArgs,
  browserCookiesError,
  browserCookiesProblem,
  changedCookies,
  isGoogleDomain,
  isYoutubeAccountDomain,
  netscapeCookies,
  parseAccountPlaylists,
  parseNetscapeCookies,
  youtubePlaylistSearchUrl,
  youtubeState,
  type CookieRecord,
} from '../youtube-account';

setLanguage('fr');

const NOW = new Date('2026-11-10T12:00:00Z');
const LATER = NOW.getTime() / 1000 + 400 * 86400;
const fake = (name: string, domain = '.youtube.com', extra: Partial<CookieRecord> = {}): CookieRecord => ({ name, value: `valeur-fictive-${name}`, domain, path: '/', secure: true, expirationDate: LATER, ...extra });

test('compte YouTube : connecté seulement avec une session et la clé de l’API', () => {
  // Un visiteur : cookies de préférences seulement.
  assert.deepEqual(youtubeState([fake('VISITOR_INFO1_LIVE'), fake('YSC', '.youtube.com', { expirationDate: undefined }), fake('PREF')], NOW), { connected: false, remembered: false });
  // Session sans clé (ou l'inverse) : pas connecté.
  assert.equal(youtubeState([fake('SID')], NOW).connected, false);
  assert.equal(youtubeState([fake('SAPISID')], NOW).connected, false);
  // Les cookies de Google seuls ne suffisent pas : yt-dlp lit ceux de youtube.com.
  assert.equal(youtubeState([fake('SID', '.google.com'), fake('SAPISID', '.google.com')], NOW).connected, false);
  // Connecté, connexion gardée jusqu'à l'échéance la plus proche.
  const soon = NOW.getTime() / 1000 + 30 * 86400;
  const state = youtubeState([fake('__Secure-3PSID'), fake('__Secure-3PAPISID', '.youtube.com', { expirationDate: soon }), fake('PREF')], NOW);
  assert.equal(state.connected, true);
  assert.equal(state.remembered, true);
  assert.equal(state.expires?.getTime(), soon * 1000);
  // Expirés ou vides : pas connecté.
  assert.equal(youtubeState([fake('SID', '.youtube.com', { expirationDate: NOW.getTime() / 1000 - 1 }), fake('SAPISID')], NOW).connected, false);
  assert.equal(youtubeState([fake('SID', '.youtube.com', { value: '' }), fake('SAPISID')], NOW).connected, false);
});

test('compte YouTube : domaines du compte (YouTube et Google, régionaux compris), rien d’autre', () => {
  for (const d of ['.youtube.com', 'www.youtube.com', 'm.youtube.com', '.google.com', 'accounts.google.com', '.google.fr', '.google.co.uk']) assert.equal(isYoutubeAccountDomain(d), true, d);
  for (const d of ['.vpuniverse.com', 'exemple.test', 'notgoogle.com', 'google.com.exemple.test', 'youtube.com.exemple.test']) assert.equal(isYoutubeAccountDomain(d), false, d);
  assert.equal(isGoogleDomain('.google.de'), true);
});

test('fichier de cookies Netscape : écrit pour yt-dlp, relu à l’identique', () => {
  const cookies: CookieRecord[] = [
    fake('SID'),
    { name: 'LOGIN_INFO', value: 'jeton:fictif', domain: 'www.youtube.com', hostOnly: true, path: '/', secure: true, httpOnly: true, expirationDate: LATER },
    { name: 'YSC', value: 'session-fictive', domain: '.youtube.com', path: '/', secure: true, httpOnly: true },
    { name: 'CASSE', value: 'avec\ttabulation', domain: '.youtube.com' },
  ];
  const text = netscapeCookies(cookies);
  const lines = text.trim().split('\n');
  assert.equal(lines[0], '# Netscape HTTP Cookie File');
  assert.ok(lines.includes(`.youtube.com\tTRUE\t/\tTRUE\t${Math.floor(LATER)}\tSID\tvaleur-fictive-SID`));
  // Cookie d'un seul hôte, HttpOnly : préfixe #HttpOnly_ que yt-dlp comprend.
  assert.ok(lines.includes(`#HttpOnly_www.youtube.com\tFALSE\t/\tTRUE\t${Math.floor(LATER)}\tLOGIN_INFO\tjeton:fictif`));
  // Cookie de session : échéance 0.
  assert.ok(lines.includes('#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t0\tYSC\tsession-fictive'));
  // Valeur impossible à écrire : laissée de côté.
  assert.ok(!text.includes('CASSE'));
  const back = parseNetscapeCookies(text);
  assert.deepEqual(back.map((c) => [c.name, c.domain, c.hostOnly, c.httpOnly, c.expirationDate]), [
    ['SID', '.youtube.com', false, false, Math.floor(LATER)],
    ['LOGIN_INFO', 'www.youtube.com', true, true, Math.floor(LATER)],
    ['YSC', '.youtube.com', false, true, undefined],
  ]);
  // Fichier d'un navigateur (CRLF, BOM, lignes vides et commentaires).
  assert.equal(parseNetscapeCookies(`\uFEFF# Netscape HTTP Cookie File\r\n\r\n# commentaire\r\n.google.com\tTRUE\t/\tTRUE\t0\tNID\tfictif\r\n`).length, 1);
});

test('cookies renouvelés par YouTube pendant un appel : reportés dans la session, ceux du compte seulement', () => {
  const before = [fake('SID'), fake('__Secure-3PSIDTS'), fake('NID', '.google.com')];
  const after = [fake('SID'), { ...fake('__Secure-3PSIDTS'), value: 'renouvele-fictif' }, { ...fake('NID', '.google.com'), value: 'autre-fictif' }, { ...fake('AUTRE', '.exemple.test'), value: 'x' }];
  assert.deepEqual(changedCookies(before, after).map((c) => [c.name, c.value]), [
    ['__Secure-3PSIDTS', 'renouvele-fictif'],
    ['NID', 'autre-fictif'],
  ]);
});

test('playlists du compte : J’aime et À regarder plus tard en tête, puis celles du compte, sans doublon', () => {
  const json = {
    entries: [
      { _type: 'url', url: 'https://www.youtube.com/playlist?list=PLexempleCompte0001', title: 'Néon nocturne', playlist_count: 21, thumbnails: [{ url: 'https://i.ytimg.com/a.jpg' }, { url: 'https://i.ytimg.com/b.jpg' }] },
      { _type: 'url', id: 'PLexempleCompte0002', title: '  ' },
      { _type: 'url', url: 'https://www.youtube.com/playlist?list=PLexempleCompte0001', title: 'Doublon' },
      { _type: 'url', url: 'https://www.youtube.com/playlist?list=WL', title: 'Watch later' },
      'pas une entrée',
    ],
  };
  const lists = parseAccountPlaylists(json);
  assert.deepEqual(lists.map((p) => [p.list, p.title, p.count, p.personal]), [
    ['LL', 'Vidéos « J’aime »', undefined, true],
    ['WL', 'À regarder plus tard', undefined, true],
    ['PLexempleCompte0001', 'Néon nocturne', 21, undefined],
    ['PLexempleCompte0002', 'PLexempleCompte0002', undefined, undefined],
  ]);
  assert.equal(lists[2]!.thumbnail, 'https://i.ytimg.com/b.jpg');
  // Réponse illisible : les deux personnelles quand même.
  assert.equal(parseAccountPlaylists(undefined).length, 2);
});

test('yt-dlp : cookies passés par fichier, jamais en clair sur la ligne de commande', () => {
  const args = accountPlaylistsArgs('C:\\Temp\\cyberpinball-cookies\\c.txt', 'node.exe');
  assert.deepEqual(args.slice(-4), ['--cookies', 'C:\\Temp\\cyberpinball-cookies\\c.txt', '--', 'https://www.youtube.com/feed/playlists']);
  const browser = browserCookiesArgs('firefox', 'sortie.txt');
  assert.deepEqual(browser.slice(browser.indexOf('--cookies-from-browser'), browser.indexOf('--cookies-from-browser') + 4), ['--cookies-from-browser', 'firefox', '--cookies', 'sortie.txt']);
  assert.match(browserCookiesError('ERROR: Could not copy Chrome cookie database. See …', 'Google Chrome'), /fermez-le/);
  assert.match(browserCookiesError('ERROR: Failed to decrypt with DPAPI', 'Google Chrome'), /Firefox/);
});

test('recherche de playlists sur YouTube : filtre « Playlists », accueil sans texte', () => {
  assert.equal(youtubePlaylistSearchUrl('synthwave années 80'), 'https://www.youtube.com/results?search_query=synthwave+ann%C3%A9es+80&sp=EgIQAw%3D%3D');
  assert.equal(youtubePlaylistSearchUrl('  '), 'https://www.youtube.com/');
});

// Défaut du 10/11/2026 (PinCab) : « Utiliser la connexion d'un navigateur » ne connectait rien, et un
// Chrome dont aucun cookie ne se déchiffrait disait « pas de connexion à YouTube dans Chrome ». Toute la
// sortie de yt-dlp compte désormais, avertissements et relevé compris. Sorties imitées de yt-dlp.
test('connexion d’un navigateur pas reprise : la raison vraie, avec la marche à suivre', () => {
  const chrome = 'Google Chrome';
  const v20 = ['[Cookies] Extracting cookies from chrome', 'WARNING: cannot decrypt v20 cookies: https://github.com/yt-dlp/yt-dlp/issues/10927', '[Cookies] Extracted 3 cookies from chrome (1487 could not be decrypted)', 'ERROR: [youtube:tab] playlists: This playlist does not exist'];
  const encrypted = browserCookiesProblem(v20, chrome, 0);
  assert.match(encrypted, /Google Chrome chiffre ses cookies/);
  assert.match(encrypted, /Prenez Firefox : connectez-vous à YouTube dans Firefox, fermez-le, puis choisissez Firefox ici/);
  assert.match(browserCookiesProblem(['[Cookies] Extracted 0 cookies from edge (212 could not be decrypted)'], 'Microsoft Edge', 0), /Microsoft Edge chiffre ses cookies/);
  assert.match(browserCookiesProblem(['ERROR: Could not copy Chrome cookie database. See https://github.com/yt-dlp/yt-dlp/issues/7271 for more info'], chrome, 0), /fermez-le complètement/);
  assert.match(browserCookiesProblem(['ERROR: could not find firefox cookies database in D:/Profils/Mozilla/Firefox/Profiles'], 'Firefox', 0), /n’est pas installé sur ce PC/);
  // Firefox lu, mais pas connecté à YouTube : on le dit, sans parler de chiffrement.
  assert.match(browserCookiesProblem(['[Cookies] Extracting cookies from firefox', '[Cookies] Extracted 412 cookies from firefox'], 'Firefox', 2), /^Pas de connexion à YouTube dans Firefox : connectez-vous à YouTube dans Firefox/);
  assert.equal(browserCookiesProblem([], 'Firefox', 0), 'Firefox n’a rien donné');
});
