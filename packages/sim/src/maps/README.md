# maps — helpers purs de génération et de collision

Helpers déterministes (labyrinthe Kruskal + boucles, bases 2/4 équipes, collisions cercle/mur,
vérification de connexité). **Ils ne sont pas encore branchés au runtime** (`ModeConfig`, serveur,
client) : il n'y a pas de mode labyrinthe complet à ce stade.

## Limites explicites (`MAZE_LIMITS`)

| Limite                     | Valeur    | Effet en cas de dépassement                                     |
| -------------------------- | --------- | --------------------------------------------------------------- |
| `maxArenaDimension`        | 50 000    | `RangeError` (maze et équipes)                                  |
| `maxGridCells`             | 200 / axe | grille clampée (cellules plus grandes, jamais plus de 40 000)   |
| `maxReservedZones`         | 256       | `RangeError` ; zones non finies ou de taille ≤ 0 : `RangeError` |
| `maxFloodfillCells`        | 4 194 304 | `RangeError` avant toute allocation                             |
| `maxFloodfillWalls`        | 200 000   | `RangeError`                                                    |
| `maxFloodfillCheckPoints`  | 250 000   | `RangeError`                                                    |
| `maxFloodfillIndexEntries` | 8 000 000 | `RangeError` (murs très étendus en grand nombre)                |
| `maxResolveIterations`     | 64        | `resolveCircleVsWalls` rejette `iterations` hors `[1, 64]`      |

Une arène de 50 000 avec un tank de rayon 25 (pas d'échantillonnage 25) tient exactement dans
le budget de cellules. Le générateur adapte le pas de vérification à la bande libre des
corridors (au plus la moitié) et rejette la configuration si même ce pas maximal dépasse le
budget ; il ne boucle jamais indéfiniment ni n'alloue de milliards de cellules.

## Comportements à connaître

- `verifyMazeConnectivity` est une **vérification par échantillonnage** d'un treillis de centres
  de tank, pas une preuve. Elle teste chaque cellule contre les seuls murs voisins (index spatial,
  résultat identique à un test exhaustif). Un passage plus étroit que le pas peut être manqué ;
  les points de contrôle sont tolérants à ±1 cellule du treillis.
- `generateMazeLayout` exécute cette vérification et lève une `Error` si elle échoue.
- Les zones réservées sont garanties **sans mur** : les murs sont découpés autour des zones
  (y compris la demi-épaisseur qui déborde des frontières de cellules).
- `sweepCircleVsWall` : un cercle déjà en pénétration au départ renvoie `hit` à `time = 0`, même
  s'il s'éloigne ; un contact tangent exactement à l'arrivée est un `hit` à `time = 1`
  (`sweepCircleVsWalls` est cohérent avec ce choix).
- `Rng.int(min, max)` est inclusif aux deux bornes ; le mélange de Fisher-Yates l'utilise avec
  `int(0, i)`. La graine est réduite par `seed >>> 0` : `1` et `1.5` (ou `2**32` et `0`) donnent
  le même labyrinthe.
- Équipes : la marge de spawn est retranchée sur les deux axes ; une zone de spawn de dimension
  ≤ 0 est rejetée.
