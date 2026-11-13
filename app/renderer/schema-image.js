// La page qui fabrique l'image de la pause en partie (app/src/schema-image.ts) : le schéma des manettes, ces
// commandes en vert, et la ligne d'aide, son début (la commande) en vert. Paramètres : ?titre=…&titreVert=1&vert=a,b&texte=…&lead=….
const params = new URLSearchParams(location.search);
const image = document.getElementById('image');
// Le titre (« Caler la borne », ou « Borne calée » en vert après un calage), comme sur la planche.
const titre = params.get('titre');
if (titre) {
  const h = document.createElement('h1');
  h.textContent = titre;
  if (params.get('titreVert') === '1') h.className = 'vert';
  image.append(h);
}
const schema = schemaManettes((params.get('vert') ?? '').split(',').filter(Boolean), 'schema-image');
if (schema) image.append(schema);
const texte = params.get('texte') ?? '';
const lead = params.get('lead') ?? '';
const ligne = document.createElement('p');
const at = lead ? texte.indexOf(lead) : -1;
if (at >= 0) {
  const b = document.createElement('b');
  b.textContent = lead;
  ligne.append(texte.slice(0, at), b, texte.slice(at + lead.length));
} else ligne.textContent = texte;
image.append(ligne);
