# Open Volleyball

**Version officielle : 2.0.0**, publiée depuis la branche `main`.

Application de bureau en français pour préparer et conduire un tournoi local de volleyball. Implémentation indépendante de [la spécification](OpenVolleyball_Independent_Rebuild_Spec.md), sans code ni architecture de l’ancienne application.

## Lancer

**Windows x64, sans installation :** décompresser `release/Open-Volleyball-2.0.0-Windows.zip`, puis ouvrir `Open-Volleyball-2.0.0-Windows.exe`. Aucun compte, serveur, accès internet ou environnement de développement n’est nécessaire. Ces binaires locaux ne sont pas signés avec un certificat commercial.

Depuis les sources, avec Node.js **22.13 ou plus récent** :

```powershell
npm ci
npm run models:fetch
npm start
```

Construire le programme portable : `npm run package`. Le résultat est placé dans `release/`.
Après commit, `python scripts/package-release.py` prépare le ZIP, l’archive Git
des sources et les empreintes SHA-256. La publication d’un numéro officiel sur
`main` lance la construction et les vérifications Windows avant sa publication
dans les [versions GitHub](https://github.com/HugoFram/openvolleyball/releases).
`models:fetch` est une préparation des sources pour les développeurs : les fichiers
publics sont figés et contrôlés par SHA-256. L’application distribuée inclut déjà
le modèle et fonctionne intégralement hors ligne, y compris à son premier lancement.

Les anciens bundles de distribution ont été retirés. L’historique du code reste
consultable dans Git et le [journal des versions](docs/CHANGELOG.md).

La lecture des scores est acceptée. **La transcription manuscrite des inscriptions
reste expérimentale** : relire chaque proposition. Le lecteur intégré fonctionne
sans installation supplémentaire ; le pack avancé facultatif conserve les mêmes
modèles hors ligne et reste compatible avec une installation existante.
[Reconnaissance et lecteur avancé](docs/REGISTRATION-READERS.md).

Avant d’ouvrir un tournoi créé avec v1, conserver une copie complète de son dossier :
le format v2 n’est pas lisible avec l’ancienne application. Aucun tournoi ni scan
fourni pour les essais n’a été supprimé lors du nettoyage des distributions.

## Essayer immédiatement

Copier un des dossiers d’[examples](examples) vers un emplacement de travail, puis **Ouvrir un tournoi existant** :

- **01 — 17 équipes** : 28/28 résultats ; qualification Principale / Consolante à effectuer.
- **02 — 104 résultats** : Principale phases 2 et 3 terminées ; Consolante phase 2 et finale terminées. Créer la finale Principale à 8 équipes depuis son dernier nœud.
- **03 — Tableau Principale prêt à jouer** : même historique, avec le tableau à huit équipes créé et vierge.

Les exemples sont entièrement synthétiques et contiennent aussi huit équipes Femmes non engagées dans une phase. `npm run sample` génère de nouveaux exemples uniquement si leurs destinations n’existent pas ; il refuse de les écraser.

## Fonctionnalités

- Tournois locaux portables, récents, sauvegardes atomiques, contrôle d’intégrité, journal et versions historiques ; restauration dans une nouvelle copie.
- Hommes / Femmes indépendants ; équipes à noms uniques, trois ou quatre joueurs, niveaux N/R/D/U, génération volontaire d’équipes et retraits pour les phases futures.
- Structures mixtes de 3/4/5 équipes, équilibrage initial puis répartition selon les résultats précédents, échanges manuels, deux terrains réservés aux groupes de cinq, tours synchronisés et arbitrage explicite.
- Logo et site facultatifs ; feuilles A4 automatiques pour groupes et finales, mises à jour avec les participants. Tous les groupes tiennent sur une page ; cinq équipes sur deux terrains donnent deux pages de cinq matchs. Les deux colonnes de scores sont 37 % plus larges que les autres. Logo agrandi en en-tête et site web en pied de page. Affichage et impression à la demande ; l’impression attend le rendu complet de toutes les pages.
- Scores 21/25, zéro et prolongations avec écart fixe de deux points, sauvegarde au changement de focus, classements général et par groupe selon victoires/matchs joués puis différence/matchs joués, corrections explicites et scores aléatoires uniquement sur les rencontres vierges.
- Principale / Consolante, égalités décisives par sélecteurs nominatifs, comparaison normalisée des groupes inégaux et décisions propres à leur phase/contexte.
- Phases de groupes ultérieures sans maximum prédéfini ; progression commune à deux branches ; tableaux 2–64, exemptions, finale et Petite finale.
- Cartes de tableau reliées et accessibles au clavier ; rangs de la phase précédente ; échanges manuels du premier tour avant le premier résultat ; détails séparés ; progression des vainqueurs et perdants de demi-finale ; classement final.
- Formulaires d’inscription vierges, une ou deux fiches par page ; fiches des joueurs imprimables depuis le classement final.
- Import local de scans PDF/PNG/JPEG, lecture des scores et relecture avant validation ; transcription expérimentale des inscriptions et export des échantillons corrigés.
- Backup complet avec nom et destination au choix ; liste des joueurs exportable en CSV (virgule ou point-virgule) et Excel `.xlsx`.
- Correction avec annonce des conséquences et archivage des anciens résultats/étapes.

## Vérification et documentation

```powershell
npm test
npm run build
npm run test:ui
```

Les tests Electron utilisent uniquement des dossiers temporaires et simulent les choix des dialogues natifs. Ils exécutent les véritables interface, moteur, IPC et stockage. Aucun exemple n’est modifié.

- [Historique des versions](docs/CHANGELOG.md)
- [Guide de l’organisateur](docs/GUIDE.md)
- [Règlement et décisions sportives](docs/SPORTING-RULES.md)
- [Résultats, traçabilité A01–A21 et checklist](docs/ACCEPTANCE.md)
- [Choix techniques et organisation du code](docs/ARCHITECTURE.md)

## Limites

Le livrable testé est Windows x64. Aucun ancien tournoi n’ayant été fourni, une migration fidèle de l’ancien format n’est pas annoncée : l’inspection est en lecture seule et les formats inconnus sont refusés sans mutation. L’impression physique doit être vérifiée sur le matériel du site. Une correction des groupes ayant des descendants archive ceux-ci de façon conservatrice, même si la nouvelle qualification aurait été identique. Le stockage vise un seul opérateur par tournoi, sans édition simultanée sur partage réseau.

Code : [MIT](LICENSE). L’icône de volleyball a été fournie par le propriétaire du projet. Inter et la police dérivée embarquée pour les PDF : SIL Open Font License, dans `assets/fonts/OFL.txt`. Les licences Electron/Chromium et dépendances accompagnent la distribution. L’icône fournie est le seul élément repris à la demande de l’utilisateur ; le code et l’architecture restent indépendants.
