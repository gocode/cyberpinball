// Profil de Chromium d'un bac à sable (CYBERPINBALL_HOME : essais sans opérateur, démonstrations) :
// le sien, dans le bac à sable, plutôt que celui de l'application (%APPDATA%\@cyberpinball\app).
// Deux démonstrations lancées en même temps (deux worktrees, deux sessions) se partageaient ce
// profil : la seconde n'avait pas le droit d'en déplacer le cache (« Unable to move the cache :
// Accès refusé »), message qu'un script PowerShell en mode Stop prend pour une erreur fatale, et
// l'écran capturé était écarté (06/11/2026). Importé tout de suite après le garde-fou (main.ts),
// avant que quoi que ce soit ne lise le profil.

import { app } from 'electron';
import * as path from 'node:path';

if (process.env.CYBERPINBALL_HOME) app.setPath('userData', path.join(process.env.CYBERPINBALL_HOME, 'electron'));
