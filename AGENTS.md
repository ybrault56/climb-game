# AGENTS.md

## Mission
Construire un jeu web 2D mobile-first avec Phaser 3 + TypeScript + Vite.
Le jeu doit viser une experience moderne, minimaliste, premium et ultra lisible.
Le coeur du gameplay est une chute verticale avec controle horizontal continu.

## Product Direction
- Eviter le style arcade retro
- Viser une sensation de flux, de matiere et de controle direct
- Interface discrete, overlays sobes, retry quasi instantane
- Priorite au ressenti tactile percu, a la fairness et a la fluidite

## Architecture
- Un seul repo
- Un seul build
- Un seul deploiement
- Decoupage modulaire interne
- Pas de microservices
- Pas de backend tant qu'il n'y a pas un vrai besoin produit

## Regles de conception
- Les scenes Phaser orchestrent, elles ne portent pas toute la logique metier
- Extraire la logique pure dans des systemes/services testables
- Pas de dependances circulaires
- Pas d'abstraction prematuree
- Preferer composition simple > architecture complexe
- Pas d'ECS custom
- Pas de React dans la boucle de rendu gameplay

## Gameplay Rules
- Controle horizontal continu (mobile drag/hold, desktop fallback)
- Pas de logique 3 lanes
- Obstacles continus ou semi-continus avec ouvertures lisibles
- Fairness stricte: pas de patterns injustes
- Difficulte progressive et lisible

## Performance
- Minimiser les allocations dans les boucles chaudes
- Eviter les recreations d'objets en update
- Utiliser pooling si necessaire
- Priorite au ressenti de fluidite
- La lisibilite mobile prime sur la densite visuelle

## Style de code
- TypeScript strict
- Noms explicites
- Fonctions courtes
- Fichiers coherents
- Commentaires seulement si utiles
- Eviter le code clever
- Eviter la duplication

## Dependances
- Ne pas ajouter de dependance de production sans justification explicite
- Favoriser les API natives et les utilitaires maison simples
- Preferer pnpm si installation necessaire

## Qualite
Avant de terminer une tache:
- verifier typage
- verifier imports
- verifier coherence architecture
- verifier impact sur mobile
- verifier que le gameplay reste simple, lisible et juste

## Workflow
Pour chaque tache significative:
1. expliquer brievement l'objectif
2. faire le changement minimal coherent
3. verifier le resultat
4. resumer ce qui a ete fait
5. proposer la prochaine etape utile
