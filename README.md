# Open Volleyball

La branche `feature/offline-scan-inbox` contient la préversion **2.0.0-alpha.8** :
import de feuilles scannées, QR codes, lecture locale des chiffres et validation
avec l’image. Aucun accès Internet requis. Les inscriptions manuscrites sont
transcrites localement puis relues. Les téléphones restent une prochaine étape.
[Guide et checklist v2](docs/V2-OFFLINE.md).

Alpha.8 simplifie **Exports et diagnostic** à deux boutons : **Créer un instantané
du tournoi**, copie complète et réouvrable dans le dossier choisi, et **Exporter
les joueurs (CSV)**, avec nom et emplacement du fichier au choix. Le CSV contient
nom du joueur, équipe, niveau N/R/D/U, e-mail et club, pour toutes les catégories.
La reconnaissance manuscrite expérimentale et les modèles restent inchangés.

Alpha.7 marque **Feuilles scannées comme expérimental** et ajoute un lecteur
avancé entièrement local, fourni dans un pack facultatif séparé. Comparaison de
TrOCR, LightOnOCR et plusieurs modèles Qwen sans apprentissage sur les fiches
fournies. Le seuil demandé est de **75 % de chaînes non vides entièrement
correctes**, sans compter les cellules vides. Il n’est pas encore validé sur des
écritures variées. Aucune obligation de lettres capitales ou de cases individuelles.
[Résultats, limites et installation du lecteur](docs/REGISTRATION-READERS.md).
Le lecteur intégré de cette version conserve le modèle public générique ; aucun
modèle personnalisé ni aucune inscription privée ne sont distribués.

Alpha.6 permet une adaptation locale du lecteur aux inscriptions relues, en
séparant la lecture des e-mails de celle du texte ordinaire. Le modèle personnalisé
reste local ; il n’est pas publié avec le dépôt. La compilation publique conserve
le modèle générique, et la compilation Windows locale peut inclure l’adaptation.
Les nouvelles fiches donnent aussi 17 % de largeur supplémentaire aux e-mails.

Alpha.5 ajoute **Exporter les inscriptions relues** : extraits manuscrits,
textes corrigés et propositions initiales, sans modifier les scans. Le lecteur
embarqué bénéficie d’un entraînement supplémentaire sur des données publiques,
dont des écritures françaises avec accents. Une relecture reste nécessaire.

Alpha.4 rend les deux fiches d’inscription d’une A4 identiques et autonomes : titre,
logo, site, QR et quatre repères sur chaque moitié. Imprimer, couper au milieu,
faire remplir, puis importer les demi-feuilles en PDF/PNG/JPEG. Noms d’équipes et
de joueurs, e-mails et clubs sont proposés par un lecteur manuscrit embarqué ;
les niveaux cochés sont lus séparément. Vérifier et corriger avant d’enregistrer.

Alpha.3 ajoute **Imprimer toutes les feuilles** dans chaque phase : tous les
groupes/terrains ou matchs du tableau dans une seule impression. Le nouveau CNN
local est adapté aux chiffres manuscrits relus, avec un lot séparé par scan pour
vérifier le progrès. Les erreurs ambiguës restent signalées et à vérifier.

La majorité de chaque cellule reste libre pour compter les points ; les
petites cases Final servent au score terminé. Le lecteur adapte le contraste et
signale ses divergences avec des propositions. L’export des scores relus permet
de constituer un jeu réel pour améliorer et vérifier la reconnaissance.

Tester avec un nouveau tournoi ou une copie complète : les tournois mis à jour au
format 2 ne peuvent pas être ouverts par v1. Les distributions v1 sont conservées.

Application de bureau en français pour préparer et conduire un tournoi local de volleyball. Implémentation indépendante de [la spécification](OpenVolleyball_Independent_Rebuild_Spec.md), sans code ni architecture de l’ancienne application.

## Lancer

**Windows x64, sans installation :** ouvrir `release/Open-Volleyball-2.0.0-alpha.6-Windows.exe` pour la préversion v2, ou `release/Open-Volleyball-1.3.0-Windows.exe` pour la version stable. Aucun compte, serveur, accès internet ou environnement de développement n’est nécessaire. Ces binaires locaux ne sont pas signés avec un certificat commercial.

Depuis les sources, avec Node.js **22.13 ou plus récent** :

```powershell
npm ci
npm run models:fetch
npm start
```

Construire le programme portable : `npm run package`. Le résultat est placé dans `release/`.
`models:fetch` est une préparation des sources pour les développeurs : les fichiers
publics sont figés et contrôlés par SHA-256. L’application distribuée inclut déjà
le modèle et fonctionne intégralement hors ligne, y compris à son premier lancement.

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
- Correction avec annonce des conséquences et archivage des anciens résultats/étapes.

## Vérification et documentation

```powershell
npm test
npm run build
npm run test:ui
```

Les tests Electron utilisent uniquement des dossiers temporaires et simulent les choix des dialogues natifs. Ils exécutent les véritables interface, moteur, IPC et stockage. Aucun exemple n’est modifié.

- [Nouveautés de la version 1.3](docs/CHANGELOG.md)
- [Guide de l’organisateur](docs/GUIDE.md)
- [Règlement et décisions sportives](docs/SPORTING-RULES.md)
- [Résultats, traçabilité A01–A21 et checklist](docs/ACCEPTANCE.md)
- [Choix techniques et organisation du code](docs/ARCHITECTURE.md)

## Limites

Le livrable testé est Windows x64. Aucun ancien tournoi n’ayant été fourni, une migration fidèle de l’ancien format n’est pas annoncée : l’inspection est en lecture seule et les formats inconnus sont refusés sans mutation. L’impression physique doit être vérifiée sur le matériel du site. Une correction des groupes ayant des descendants archive ceux-ci de façon conservatrice, même si la nouvelle qualification aurait été identique. Le stockage vise un seul opérateur par tournoi, sans édition simultanée sur partage réseau.

Code : [MIT](LICENSE). L’icône de volleyball a été fournie par le propriétaire du projet. Inter et la police dérivée embarquée pour les PDF : SIL Open Font License, dans `assets/fonts/OFL.txt`. Les licences Electron/Chromium et dépendances accompagnent la distribution. L’icône fournie est le seul élément repris à la demande de l’utilisateur ; le code et l’architecture restent indépendants.
