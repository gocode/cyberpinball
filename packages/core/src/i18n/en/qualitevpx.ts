// Catalogue anglais : pré-réglages de qualité de VPX (app/src/qualite-vpx.ts, Menu système > Ma borne > VPX).
// Clé : le texte français tel qu'il est passé à t() ou tn().
export const messages: Record<string, string> = {
  'Pré-réglages': 'Presets',
  Auto: 'Auto',
  'Choix actuel': 'Current choice',
  Performance: 'Performance',
  'Équilibré': 'Balanced',
  'Qualité': 'Quality',
  Ultra: 'Ultra',
  'Personnalisé': 'Custom',
  'Auto · actuellement {mode}': 'Auto · currently {mode}',
  'Auto · choisi à la prochaine partie': 'Auto · chosen at the next game',
  'Actuellement : {mode}': 'Currently: {mode}',
  'Choisi d’après la carte graphique et le playfield, puis ajusté après chaque partie d’après le temps de rendu.':
    'Chosen from the graphics card and the playfield, then adjusted after each game from the rendering time.',
  'Le plus fluide : anticrénelage rapide, reflets fixes, sans ombrage ni halo. Petite carte graphique, ou grand écran à haute fréquence.':
    'The smoothest: fast anti-aliasing, static reflections, no shading or glow. Small graphics card, or a large screen at a high refresh rate.',
  'Anticrénelage standard et image affinée, reflets des billes, ombrage fixe. Convient à la plupart des bornes.':
    'Standard anti-aliasing and a sharpened image, ball reflections, static shading. Suits most cabinets.',
  'Comme Équilibré, avec les reflets et l’ombrage qui suivent ce qui bouge. Carte graphique puissante.':
    'Like Balanced, with reflections and shading that follow what moves. Powerful graphics card.',
  'Image calculée en plus haute définition puis réduite : la plus belle, la plus coûteuse. Très grosse carte graphique.':
    'Image computed at a higher resolution then scaled down: the most beautiful, the most demanding. Very large graphics card.',
  'Tes propres réglages (Réglages de VPX) : Cyber Pinball n’y touche pas. Choisis un mode pour reprendre.':
    'Your own settings (VPX settings): Cyber Pinball leaves them alone. Choose a mode to switch back.',
  'Qualité de l’image et fluidité de VPX en un choix. Les réglages un par un restent dans Réglages de VPX ; en changer un te fait passer en Personnalisé.':
    'VPX image quality and smoothness in one choice. The individual settings stay in VPX settings; changing one of them switches you to Custom.',
};
