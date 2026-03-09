# Phase 1 - Cadrage V1

## Concept V1 (1 page max)

### 1) Fantasy / theme visuel minimal
**Nom:** Neon Shaft.
Un avatar abstrait (capsule lumineuse) chute dans un puits vertical premium, noir carbone + accents cyan. Le monde est ultra epure: 3 lanes, obstacles geometriques nets, trainees de lumiere courtes.

### 2) Boucle de 5 a 15 secondes
- 0-2s: start instantane, vitesse faible, pattern simple.
- 2-8s: densite + vitesse augmentent, lecture des lanes devient critique.
- 8-15s: pression maximale, fenetres de decision tres courtes.
- echec -> ecran resultat < 1s -> retry immediat.

### 3) Controle joueur
- Mobile first: **tap gauche / tap droite** pour changer de lane.
- Desktop: fleches gauche/droite ou A/D.
- Une seule mecanique centrale: **lane switch ultra reactif**.

### 4) Regles de score
- Score principal = temps de survie (base) + bonus precision (chaines sans collision proche).
- Best score stocke localement.
- UI montre score live + best en permanence.

### 5) Regles de difficulte
- Difficulty curve continue par temps de run:
  - acceleration scroll
  - reduction de l espacement vertical
  - mix d obstacles plus contraignant
- Pas de RNG injuste: generation avec garde-fous de faisabilite lane-to-lane.

### 6) Causes d echec
- Collision avec obstacle plein.
- Sortie de zone de survie (si mecanique de chute depassee).

### 7) Facteurs d addiction
- Input instantane et lisible.
- Retry en un tap.
- Progression claire de la vitesse.
- Feedback premium (hit stop tres court, flash, shake discret, score pop).
- Meilleur score toujours visible -> objectif immediat.

### 8) Elements V2 possibles
- Variantes d obstacles (mobile, pulse, faux trous).
- Missions courtes (survivre 20s sans erreur).
- Skins visuels cosme.
- Leaderboard distant via port d integration deja prevu.
- Analytics de funnel run/retry.

## Architecture repo cible

```text
src/
  app/
    bootstrap/
      createGame.ts
      config.ts
    core/
      events/
      state/
      time/
      math/
      utils/
    gameplay/
      scenes/
        BootScene.ts
        MenuScene.ts
        GameScene.ts
        UIScene.ts
        ResultScene.ts
      contracts/
      player/
      obstacles/
      spawning/
      difficulty/
      scoring/
      progression/
      fx/
    ui/
      hud/
      menus/
      transitions/
    data/
      storage/
      settings/
      highscore/
      save/
    audio/
    analytics/
    integrations/
```

## Responsabilites modules

- `bootstrap`: instanciation Phaser, wire des scenes, injection de services.
- `core`: briques transverses pures (event bus, store, clock, math, utils).
- `gameplay/scenes`: orchestration Phaser uniquement (render/input/flow scene).
- `gameplay/* systems`: logique metier testable hors Phaser.
- `ui`: mapping view-model et transitions d interface.
- `data`: persistance locale + repositories.
- `audio`: facade audio pour SFX gameplay.
- `analytics`: port d instrumentation et implementation no-op.
- `integrations`: contrats externes (leaderboard futur).

## Types principaux

- `RunStatus`: `"idle" | "running" | "failed"`.
- `InputFrame`: intention joueur normalisee (delta lane).
- `PlayerState`: lane courante + fenetres de lock mouvement.
- `ObstacleState`: id, lane, y, type obstacle.
- `DifficultySnapshot`: vitesse, cadence spawn, mix patterns.
- `ScoreState`: score courant, best score, combo precision.
- `RunSnapshot`: etat global run a un instant t.
- `GameEventMap`: evenements typed entre modules.

## Contrat scenes <-> systemes

- Les scenes n executent pas de logique metier complexe.
- Les scenes appellent les systemes via une interface `SceneSystems`.
- Les systemes renvoient des structures de donnees pures, appliquees ensuite au rendu Phaser.

Contrat minimal:
- `SceneServices` expose `systems`, `store`, `events`, `analytics`, `audio`.
- `GameScene`:
  - lit input brut,
  - convertit via `PlayerInputSystem`,
  - fait avancer la simulation via `DifficultySystem`, `SpawnSystem`, `ObstacleSystem`, `ScoreSystem`,
  - emet `run:failed` si collision.
- `UIScene` ecoute le store/events et met a jour HUD.
- `ResultScene` lit snapshot final + best score, propose retry.

## Conventions de nommage

- Fichiers: `PascalCase.ts` pour classes/services, `camelCase.ts` pour helpers simples.
- Types/interfaces: `PascalCase` + suffixes explicites (`State`, `Snapshot`, `Port`, `Repository`).
- Evenements: namespace string (`run:started`, `run:failed`, `score:updated`).
- Fonctions pures: verbe + domaine (`computeDifficulty`, `resolveCollision`).
- Scenes: suffixe `Scene` obligatoire.

## Mini plan implementation (etapes)

1. Initialiser base Vite + Phaser + TS strict.
2. Poser core (`EventBus`, `GameStore`, utilitaires).
3. Poser contrats gameplay (`types`, `SceneSystems`).
4. Scaffolder scenes minces avec flux boot/menu/game/ui/result.
5. Implementer boucle V1 systemes pures (input/difficulty/spawn/collision/score).
6. Ajouter persistance highscore/settings.
7. Ajouter feedback premium (fx + audio minimal).
8. Stabiliser mobile (lisibilite, perf, hitboxes) + tests unitaires systemes purs.
