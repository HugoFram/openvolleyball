# Open Volleyball

Application de bureau en français pour préparer et conduire un tournoi local de volleyball. Implémentation indépendante de [la spécification](OpenVolleyball_Independent_Rebuild_Spec.md), sans code ni architecture de l’ancienne application.

## Lancer

**Windows x64, sans installation :** ouvrir `release/Open-Volleyball-1.0.0-Windows.exe`. Aucun compte, serveur, accès internet ou environnement de développement n’est nécessaire. Ce binaire local n’est pas signé avec un certificat commercial.

Depuis les sources, avec Node.js **22.12 ou plus récent** :

```powershell
npm ci
npm start
```

Construire le programme portable : `npm run package`. Le résultat est placé dans `release/`.

## Essayer immédiatement

Copier un des dossiers d’[examples](examples) vers un emplacement de travail, puis **Ouvrir un package existant** :

- **01 — 17 équipes** : 28/28 résultats ; qualification Principale / Consolante à effectuer.
- **02 — 104 résultats** : Principale phases 2 et 3 terminées ; Consolante phase 2 et finale terminées. Créer la finale Principale à 8 équipes depuis son dernier nœud.
- **03 — Tableau Principale prêt à jouer** : même historique, avec le tableau à huit équipes créé et vierge.

Les exemples sont entièrement synthétiques et contiennent aussi huit équipes Femmes non engagées dans une phase. `npm run sample` génère de nouveaux exemples uniquement si leurs destinations n’existent pas ; il refuse de les écraser.

## Fonctionnalités

- Packages locaux portables, récents, sauvegardes atomiques, contrôle d’intégrité, journal et versions historiques ; restauration dans une nouvelle copie.
- Hommes / Femmes indépendants ; équipes à noms uniques, effectifs variables, joueurs de niveau 0–3, moyenne de force, génération volontaire d’équipes et retraits pour les phases futures.
- Structures mixtes de 3/4/5 équipes, équilibrage, échanges manuels, un/deux terrains, tours synchronisés et arbitrage explicite.
- Feuilles A4 automatiques à la confirmation. Cinq équipes sur deux terrains : dix matchs, deux pages de cinq. Affichage et impression à la demande.
- Scores 21/25, zéro et prolongations selon règlement, sauvegarde au changement de focus, classements 2/1 points, corrections explicites et scores aléatoires uniquement sur les rencontres vierges.
- Principale / Consolante, égalités décisives par sélecteurs nominatifs, comparaison normalisée des groupes inégaux et décisions propres à leur phase/contexte.
- Phases de groupes ultérieures sans maximum prédéfini ; progression commune à deux branches ; tableaux 2–64, exemptions, finale et Petite finale.
- Cartes de tableau reliées et accessibles au clavier ; détails séparés ; progression des vainqueurs et perdants de demi-finale ; classement final.
- Correction avec annonce des conséquences et archivage des anciens résultats/étapes.

## Vérification et documentation

```powershell
npm test
npm run build
npm run test:ui
```

Les tests Electron utilisent uniquement des dossiers temporaires et simulent les choix des dialogues natifs. Ils exécutent les véritables interface, moteur, IPC et stockage. Aucun exemple n’est modifié.

- [Guide de l’organisateur](docs/GUIDE.md)
- [Règlement et décisions sportives](docs/SPORTING-RULES.md)
- [Résultats, traçabilité A01–A21 et checklist](docs/ACCEPTANCE.md)
- [Choix techniques et organisation du code](docs/ARCHITECTURE.md)

## Limites

Le livrable testé est Windows x64. Aucun ancien package n’ayant été fourni, une migration fidèle de l’ancien format n’est pas annoncée : l’inspection est en lecture seule et les formats inconnus sont refusés sans mutation. L’impression physique doit être vérifiée sur le matériel du site. Une correction des groupes ayant des descendants archive ceux-ci de façon conservatrice, même si la nouvelle qualification aurait été identique. Le stockage vise un seul opérateur par package, sans édition simultanée sur partage réseau.

Code et dessin original du ballon : [MIT](LICENSE). Inter et la police dérivée embarquée pour les PDF : SIL Open Font License, dans `assets/fonts/OFL.txt`. Les licences Electron/Chromium et dépendances accompagnent la distribution. Aucun asset de l’ancienne application n’a été utilisé.
