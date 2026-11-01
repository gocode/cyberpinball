// Shaders des animations d'ouverture (intro.js), en GLSL ES 3.00. Le plateau, « Soie » : un shader
// plein écran conçu avec Codex, directeur artistique (outils : docs/recherche/maquettes/ouverture). Contrat : u_res
// (pixels), u_time (ms depuis le départ, borné à la fin du rythme), u_brand (masque de la marque au
// cadrage de l'écran : R « CYBER », G « PINBALL », B les deux floutés), et les tableaux uniformes de
// `uniforms` (u_thread, u_pulse : les fils, voir le shader).
// i18n-ignore-file : du code GLSL et ses commentaires, aucun texte affiché.
window.CyberIntroShaders = {
  playfield: `#version 300 es
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform sampler2D u_brand;
out vec4 outColor;

// SOIE : une étincelle monte du bas de l'écran ; à 1 250 ms, ignition : un éclat anamorphique,
// et des fils de lumière se déploient en fuseau depuis le cœur, comme une soie tendue ; des
// impulsions les parcourent, tout ralentit jusqu'à l'immobilité ; la marque se matérialise dans
// une poussière lumineuse. Image fonction du seul instant (aucun état, aucun hasard : hachages).

const vec3 TEAL = vec3(0.212, 0.788, 0.706);
const vec3 LIME = vec3(0.545, 0.886, 0.227);
const vec3 INK = vec3(0.902, 0.941, 0.925);
const vec3 VOID = vec3(0.010, 0.026, 0.023);
const int THREADS = 30;
// Cœur du fuseau (fraction de la hauteur) et bas des fils, au-dessus de l'invite (0,605).
const float CORE_Y = 0.30;
const float FAN_END = 0.57;

float sat(float x) { return clamp(x, 0.0, 1.0); }
float ease(float x) { x = sat(x); return x * x * (3.0 - 2.0 * x); }
float easeOut(float x) { x = sat(x); return 1.0 - (1.0 - x) * (1.0 - x) * (1.0 - x); }
// Les fils (THREADS = 30), remplis par l'application (intro-shaders.js) : u_thread = (fréquence,
// phase, vitesse signée, profondeur), u_pulse = (vert, départs des trois impulsions). Ce sont les
// valeurs de fract(sin()) relevées sur la carte où le rendu a été validé (releve.cjs) : ce hachage
// varie d'une carte graphique à l'autre ; figé, il dessine partout les mêmes fils. En tableaux
// uniformes plutôt qu'en tables constantes : ANGLE sous Direct3D recopie une table constante lue
// avec l'indice de la boucle à chaque pixel (trois fois plus lent).
uniform vec4 u_thread[30];
uniform vec4 u_pulse[30];
float h21(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}

// Horloge du mouvement : vitesse 1 jusqu'à 2,4 s, puis elle tombe doucement à 0 à 4,1 s.
float clockMotion(float t) {
  float a = 2.4, l = 1.7;
  float s = sat((t - a) / l);
  return min(t, a) + l * (s - s * s + s * s * s / 3.0);
}

// Demi-largeur du fuseau à la hauteur y (unités de largeur, depuis le cœur) : étroit au cœur,
// évasé vers le haut de l'écran et vers le bas des fils.
float envelope(float y, float top, float bottom) {
  float r = y < 0.0 ? -y / top : y / bottom;
  return 0.012 + 0.44 * pow(sat(r), 0.85);
}

// Pente de l'enveloppe (dérivée de envelope en y), pour la distance vraie aux fils.
float envelopeSlope(float y, float top, float bottom) {
  float r = y < 0.0 ? -y / top : y / bottom;
  if (r >= 1.0) return 0.0;
  return 0.44 * 0.85 * pow(max(r, 1e-4), -0.15) * (y < 0.0 ? -1.0 / top : 1.0 / bottom);
}

// Le fil n à cette hauteur : sa position x et sa pente dx/dy. env, envD : l'enveloppe et sa pente ;
// shared, sharedD : l'ondulation commune (avant le déploiement) et sa pente, calculées une fois par pixel.
vec2 threadAt(int n, float y, float m, float spread, float env, float envD, float shared, float sharedD) {
  vec4 th = u_thread[n];
  float k = th.x;
  float a = y * k + th.y + m * th.z;
  float f = mix(shared * 0.35, sin(a), spread);
  float fD = mix(sharedD * 0.35, k * cos(a), spread);
  return vec2(env * f, envD * f + env * fD);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  uv.y = 1.0 - uv.y;
  float t = clamp(u_time, 0.0, 4100.0) * 0.001;
  float m = clockMotion(t);
  float aspect = u_res.y / u_res.x;
  float px = 1.0 / u_res.x;
  // Repère en unités de largeur, centré sur le cœur, y vers le bas.
  vec2 q = vec2(uv.x - 0.5, (uv.y - CORE_Y) * aspect);
  float top = CORE_Y * aspect;
  float bottom = (FAN_END - CORE_Y) * aspect;

  float ignite = smoothstep(1.18, 1.27, t);
  float spread = easeOut((t - 1.25) / 1.1);
  float alive = smoothstep(0.2, 0.6, t);

  // Fond : jamais du noir pur, une colonne de lumière très douce derrière le cœur.
  vec3 col = VOID * alive;
  col += TEAL * 0.035 * exp(-abs(q.x) * 5.0) * smoothstep(-0.2, 0.9, 1.0 - abs(uv.y - 0.32) * 1.6) * ignite;
  col += TEAL * 0.10 * exp(-length(q * vec2(1.0, 0.7)) * 4.0) * ignite;
  col += TEAL * 0.025 * noise(q * 3.0 + vec2(0.0, m * 0.08)) * exp(-length(q) * 1.5) * ignite;

  // L'étincelle qui monte (250–1 250 ms), sa traînée verticale.
  float rise = sat((t - 0.25) / 1.0);
  float headY = mix(1.05, CORE_Y, rise * rise * (3.0 - 2.0 * rise));
  float head = (headY - CORE_Y) * aspect;
  if (t > 0.22 && t < 1.6) {
    float fade = 1.0 - smoothstep(1.25, 1.5, t);
    float trail = smoothstep(head - 0.002, head + 0.6, q.y) * (1.0 - smoothstep(head, head + 0.9, q.y));
    float dy = q.y - head;
    float tail = dy > 0.0 ? exp(-dy * 2.6) : 0.0;
    float line = exp(-pow(q.x / (px * 1.6 + 0.0012), 2.0));
    col += (TEAL * 0.9 + INK * 0.4) * line * tail * fade * 0.9;
    col += TEAL * exp(-abs(q.x) / 0.02) * tail * fade * 0.06;
    float spark = exp(-length(vec2(q.x, dy)) / 0.006);
    col += (INK * 1.2 + LIME * 0.3) * spark * fade;
    col += TEAL * exp(-length(vec2(q.x, dy)) / 0.05) * 0.25 * fade;
  }

  // Les fils : chacun une courbe x(y), son cœur net et sa lueur ; la profondeur élargit et éteint.
  // Sous le bas du fuseau (q.y ≥ bottom), les fils sont éteints : la boucle n'y tourne pas.
  if (ignite > 0.0 && q.y < bottom) {
    float yFade = smoothstep(-top - 0.1, -top + 0.12, q.y) * pow(1.0 - smoothstep(0.0, bottom, q.y), 1.6);
    float env = envelope(q.y, top, bottom);
    float envD = envelopeSlope(q.y, top, bottom);
    float shared = sin(q.y * 4.2 + m * 0.6);
    float sharedD = 4.2 * cos(q.y * 4.2 + m * 0.6);
    for (int n = 0; n < THREADS; n++) {
      float z = u_thread[n].w;
      vec4 pu = u_pulse[n];
      vec2 at = threadAt(n, q.y, m, spread, env, envD, shared, sharedD);
      float d = abs(q.x - at.x) / sqrt(1.0 + at.y * at.y);
      float w = px * 1.0 + 0.0005 + z * z * 0.007;
      // Trop loin pour que le fil éclaire ce pixel : sa lueur y vaut moins d'un millième.
      if (d > (w * 6.0 + 0.012) * 7.0) continue;
      float core = exp(-(d * d) / (w * w));
      float halo = exp(-d / (w * 6.0 + 0.012));
      // Impulsions qui fuient le cœur après l'ignition, de plus en plus rares, éteintes à la fin.
      float along = abs(q.y);
      float pulse = 0.0;
      for (int k = 0; k < 3; k++) {
        float start = k == 0 ? pu.y : k == 1 ? pu.z : pu.w;
        float front = (t - start) * (1.1 - float(k) * 0.2);
        float on = step(start, t) * (1.0 - smoothstep(3.6, 4.05, t));
        float gap = (along - front) / 0.045;
        pulse += exp(-gap * gap) * on * (1.0 - float(k) * 0.25);
      }
      float bright = (1.0 - z * 0.8) * (0.42 + 1.5 * pulse);
      float lime = pu.x;
      vec3 tint = mix(mix(TEAL, INK, 0.18 * (1.0 - z)), LIME, lime * smoothstep(-0.1, 0.5, abs(q.y)));
      col += tint * (core * 0.8 + halo * 0.07) * bright * yFade * ignite;
    }
  }

  // Ignition : éclair au cœur, trait anamorphique horizontal qui reste en filet très fin.
  float flash = exp(-max(t - 1.25, 0.0) * 5.0) * ignite;
  float lineY = exp(-abs(q.y) / (px * 1.2 + 0.0015));
  float lineX = exp(-abs(q.x) / (0.18 + 0.55 * flash + 0.2 * spread));
  col += (TEAL * 0.8 + INK * 0.3) * lineY * lineX * (0.22 + 1.6 * flash) * ignite;
  col += TEAL * exp(-abs(q.y) / 0.02) * lineX * 0.06 * ignite;
  col += (INK * 1.4 + TEAL) * exp(-length(q) / 0.012) * (0.35 + 2.0 * flash) * ignite;
  col += TEAL * exp(-length(q) / 0.09) * (0.12 + 0.5 * flash) * ignite;

  // Onde de choc : un anneau fin qui s'élargit et s'éteint (1 250–1 900 ms).
  float age = t - 1.25;
  if (age > 0.0 && age < 0.7) {
    float r = 0.04 + easeOut(age / 0.7) * 0.55;
    float ring = exp(-pow((length(q * vec2(1.0, 1.25)) - r) / 0.004, 2.0));
    col += mix(TEAL, LIME, 0.3) * ring * (1.0 - age / 0.7) * 0.5;
  }

  // Poussière en bokeh : petits disques flous qui montent lentement et s'arrêtent avec le mouvement.
  {
    vec2 g = vec2(uv.x * 9.0, uv.y * 9.0 * aspect + m * 0.35);
    // Un disque ne dépasse pas 0,37 cellule de son centre : les quatre cellules les plus proches suffisent.
    vec2 cell = floor(g) - step(fract(g), vec2(0.5));
    for (int y = 0; y <= 1; y++) {
      for (int x = 0; x <= 1; x++) {
        vec2 id = cell + vec2(float(x), float(y));
        float h = h21(id);
        if (h < 0.55) continue;
        vec2 c = id + vec2(h21(id + 3.1), h21(id + 7.9));
        float size = 0.05 + 0.32 * h21(id + 5.5) * h21(id + 2.2);
        float dist = length(g - c);
        float disc = smoothstep(size, size * 0.72, dist);
        float near = exp(-pow((uv.y - CORE_Y) * 2.2, 2.0));
        col += TEAL * disc * (0.025 + 0.05 * near) * (1.0 - size * 1.6) * ignite;
      }
    }
  }

  // Exposition : les hautes lumières tirent vers le blanc-vert, les ombres restent profondes.
  col = 1.0 - exp(-col * 1.15);
  float vignette = 1.0 - 0.45 * smoothstep(0.35, 0.95, length((uv - vec2(0.5, 0.45)) * vec2(1.0, 0.8)));
  col *= vignette;

  // Marque : elle se matérialise dans une poussière lumineuse (1 950–2 900 ms), un éclat chromatique
  // sur le front, puis un reflet la parcourt (3 400–4 100 ms). Nette à la fin.
  // Seulement dans la bande de la marque (centre à 0,79, bloc et lueur entre 0,71 et 0,87).
  if (uv.y > 0.66 && uv.y < 0.92) {
  vec3 mask = texture(u_brand, uv).rgb;
  float th = ease((t - 1.95) / 0.95) * 1.6 - 0.15;
  float grainN = noise(uv * vec2(38.0, 38.0 * aspect)) * 0.45 + noise(uv * vec2(140.0, 140.0 * aspect)) * 0.15 + abs(uv.x - 0.5) * 0.9;
  float shown = smoothstep(grainN - 0.04, grainN, th);
  float edge = exp(-pow((grainN - th) / 0.06, 2.0)) * smoothstep(-0.15, 0.0, th) * (1.0 - smoothstep(1.3, 1.45, th));
  float split = px * 2.5 * edge;
  vec3 fr = texture(u_brand, uv + vec2(split, 0.0)).rgb;
  vec3 fl = texture(u_brand, uv - vec2(split, 0.0)).rgb;
  float cover = sat(mask.r + mask.g);
  vec3 letters = INK * mask.r + LIME * mask.g;
  col += TEAL * mask.b * 0.10 * smoothstep(1.95, 2.9, t);
  col += (TEAL * (fr.r + fr.g) + LIME * (fl.r + fl.g)) * edge * 0.6;
  col = mix(col, letters, cover * shown);
  col += (TEAL * 0.7 + INK * 0.3) * cover * edge * 0.9;
  float sweepX = mix(-0.2, 1.2, ease((t - 3.4) / 0.7));
  float sweep = exp(-pow((uv.x - sweepX + (uv.y - 0.78) * 0.4) / 0.05, 2.0)) * step(3.4, t) * (1.0 - step(4.1, t));
  col += INK * cover * sweep * 0.35;
  }

  // Grain de film fixe, très fin.
  col += (h21(floor(gl_FragCoord.xy)) - 0.5) * 0.012 * alive;
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`,
  playfieldUniforms: {
    u_thread: [7.216797, 4.246001, 1.058203, 0.6757812, 7.861328, 3.607874, 0.9544922, 0.1469727, 3.693359, 1.043093, 0.8015625, 0.75, 6.930786, 5.84132, 0.5490417, 0.75, 4.896484, 5.411811, -0.7101562, 0.7304687, 7.52832, 4.368718, -1.306055, 0.8227539, 7.657227, 5.559071, 0.5431641, 0.015625, 7.904297, 5.644973, 0.5800781, 0.4140625, 7.990234, 4.479163, 0.8182617, 0.015625, 8.097656, 1.546232, 0.5835937, 0.8447266, 7.748535, 4.595744, -1.156201, 0.7382812, 5.433594, 5.84132, -0.4816406, 0.07421875, 3.682617, 4.595744, 0.8507812, 0.6699219, 5.293945, 0.6381273, 0.5273437, 0.6621094, 5.712891, 0.05905746, 1.016016, 0.3203125, 7.442383, 2.84703, -0.9448242, 0.6875, 6.658203, 3.224384, -0.5976562, 0.1318359, 4.681641, 3.018833, -0.5791992, 0.9804687, 8.21582, 2.405249, -1.026562, 0.9257812, 4.960937, 5.91495, -0.8050781, 0.3515625, 6.352051, 2.626139, -0.6644531, 0.0859375, 5.605469, 1.619862, 1.019531, 0.05273437, 4.488281, 5.448626, 0.5567871, 0.7773437, 4.681641, 5.203192, 0.8929687, 0.8769531, 8.828125, 3.313353, 0.5695312, 0.996582, 6.733398, 3.902394, -0.8367187, 0.6054687, 8.441406, 4.773683, -0.9914062, 0.6757812, 4.964294, 2.589324, 1.056445, 0.5058594, 5.003906, 1.349885, -1.06875, 0.9521485, 4.069336, 0.3558787, 0.8516601, 0.2226562],
    u_pulse: [0.0, 1.418945, 1.848828, 2.393945, 0.0, 1.373535, 1.929883, 2.546289, 0.0, 1.48584, 1.85957, 2.354883, 0.0, 1.441895, 1.86543, 2.455957, 1.0, 1.358887, 1.804883, 2.485742, 0.0, 1.460266, 1.957227, 2.428125, 0.0, 1.474976, 2.043164, 2.452905, 0.0, 1.394043, 2.022656, 2.581848, 0.0, 1.392578, 1.954297, 2.499536, 0.0, 1.311035, 2.000195, 2.566797, 0.0, 1.427246, 1.942578, 2.591211, 1.0, 1.453125, 1.99043, 2.479395, 0.0, 1.307617, 1.916699, 2.530176, 0.0, 1.370117, 1.983594, 2.558008, 0.0, 1.295898, 1.883008, 2.372461, 0.0, 1.326172, 1.98335, 2.369531, 0.0, 1.457031, 1.882474, 2.471094, 0.0, 1.27832, 1.925366, 2.5375, 0.0, 1.445312, 1.855176, 2.450586, 0.0, 1.451172, 1.889844, 2.429102, 0.0, 1.443848, 2.012402, 2.369531, 1.0, 1.34668, 1.87959, 2.419336, 0.0, 1.32373, 1.837109, 2.582422, 0.0, 1.328125, 2.024609, 2.583887, 0.0, 1.453003, 1.820508, 2.433496, 0.0, 1.427155, 1.89082, 2.543115, 0.0, 1.401367, 1.952344, 2.549219, 0.0, 1.418945, 1.968945, 2.545312, 0.0, 1.495605, 1.847852, 2.520898, 0.0, 1.300781, 1.857617, 2.579004],
  },
};
