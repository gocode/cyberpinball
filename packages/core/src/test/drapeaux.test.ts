// Drapeaux des pays (app/renderer/drapeaux, de flag-icons, licence MIT) : chaque pays proposé au
// choix a le sien, chaque fichier sert un pays, la licence les accompagne, et aucun ne charge quoi
// que ce soit d'ailleurs. Les codes disparus qu'ICU sait encore nommer (URSS, RDA, Zaïre…) ne sont
// plus proposés. L'alignement des drapeaux dans le tableau des scores, au pixel, est vérifié à
// l'écran par le garde-fou de mise en page (app/src/layout-check.ts, data-aligned).
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { countryCodes, countryName, countryOfLocale, COUNTRY_CODES, flagSrc, flagView, knownCountry, NO_COUNTRY_FLAG, playerFlag } from '../rankings';

const REPO = path.join(__dirname, '..', '..', '..', '..');
const FLAGS = path.join(REPO, 'app', 'renderer', 'drapeaux');

test('drapeaux : un fichier par pays, aucun de trop, la licence à côté', () => {
  const files = fs.readdirSync(FLAGS);
  assert.ok(files.includes('LICENSE'), 'la licence MIT de flag-icons accompagne les drapeaux');
  const svgs = files.filter((f) => f.endsWith('.svg'));
  // Plus celui de Cyber Pinball : le drapeau d'un joueur sans pays (NO_COUNTRY_FLAG).
  const expected = [...COUNTRY_CODES.map((c) => `${c.toLowerCase()}.svg`), path.basename(NO_COUNTRY_FLAG)];
  assert.deepEqual(
    expected.filter((f) => !svgs.includes(f)),
    [],
    'pays sans drapeau',
  );
  assert.deepEqual(
    svgs.filter((f) => !expected.includes(f)),
    [],
    'drapeau sans pays',
  );
  assert.deepEqual(
    files.filter((f) => f !== 'LICENSE' && !f.endsWith('.svg')),
    [],
    'fichier inattendu',
  );
});

test('drapeaux : du SVG seul, sans script ni ressource extérieure, en 4:3', () => {
  for (const code of [...COUNTRY_CODES, 'cyberpinball']) {
    const svg = fs.readFileSync(path.join(FLAGS, `${code.toLowerCase()}.svg`), 'utf8');
    assert.match(svg, /^<svg[^>]*viewBox="0 0 640 480"/, `${code} : pas un SVG 4:3`);
    assert.doesNotMatch(svg, /<script|\son[a-z]+=|<foreignObject|href="(?!#)|url\((?!#)/i, `${code} : contenu actif ou ressource extérieure`);
  }
});

test('pays : tous nommés en français et en anglais, aucun disparu', () => {
  assert.equal(new Set(COUNTRY_CODES).size, COUNTRY_CODES.length, 'pays en double');
  for (const locale of ['fr-FR', 'en-GB']) {
    const codes = countryCodes(locale);
    assert.equal(codes.length, COUNTRY_CODES.length);
    for (const code of codes) assert.notEqual(countryName(code, locale), code, `${code} sans nom en ${locale}`);
  }
  for (const gone of ['SU', 'DD', 'YU', 'ZR', 'CS', 'BU', 'TP', 'AN', 'UK', 'EU', 'UN', 'ZZ']) assert.equal(knownCountry(gone), false, `${gone} ne se propose plus`);
  for (const here of ['FR', 'BE', 'CH', 'CA', 'US', 'GB', 'DE', 'JP', 'XK']) assert.ok(knownCountry(here), here);
});

test('pays : drapeau, nom, et région de Windows', () => {
  assert.equal(flagSrc('FR'), 'drapeaux/fr.svg');
  assert.equal(flagSrc('SU'), undefined, 'un code inconnu se montre en lettres, sans image');
  assert.equal(flagSrc(undefined), undefined);
  assert.deepEqual(flagView('BE', 'fr-FR'), { code: 'BE', name: 'Belgique', src: 'drapeaux/be.svg' });
  assert.deepEqual(flagView('SU', 'fr-FR').src, undefined);
  assert.equal(countryOfLocale('fr-FR'), 'FR');
  assert.equal(countryOfLocale('en_GB.UTF-8'), 'GB');
  assert.equal(countryOfLocale('ru-SU'), undefined, 'une région disparue ne devient pas un pays');
  assert.equal(countryOfLocale('fr'), undefined);
});

test('joueur sans pays : le drapeau Cyber Pinball, à la place du sien', () => {
  assert.deepEqual(playerFlag('BE', 'fr-FR'), flagView('BE', 'fr-FR'));
  const none = playerFlag(undefined, 'fr-FR');
  assert.equal(none.src, NO_COUNTRY_FLAG);
  assert.equal(none.code, '');
  assert.ok(fs.existsSync(path.join(FLAGS, path.basename(NO_COUNTRY_FLAG))));
});
