# V2 - Première étape : feuilles scannées, entièrement hors ligne

Version `2.0.0-alpha.5`. Cette préversion ajoute un parcours utilisable de bout en
bout : impression des nouvelles feuilles, import de scans, lecture locale des
chiffres, vérification et enregistrement des résultats. Aucun service cloud,
compte, clé API, téléchargement de modèle au lancement ou connexion Internet.

## Inscriptions : imprimer, couper et scanner

Après avoir vérifié et enregistré les équipes, ouvrir **Feuilles scannées →
Exporter les inscriptions relues** et choisir un dossier. Compresser le dossier
`inscriptions-relues-…` pour le transmettre. Il contient les extraits PNG de chaque
champ et `inscriptions.json` : texte corrigé, proposition initiale et groupes de
capture. Les champs vides sont inclus ; les niveaux cochés sont exclus. Seules
les fiches validées avec une image alignée sont exportées. Les corrections sont
celles de la validation de la fiche, même si l’équipe a été modifiée ensuite.

Cet export contient des noms et des e-mails : le transmettre directement aux
personnes concernées, sans le publier dans un dépôt public. L’application ne
l’envoie nulle part. Vérifier que le texte corrigé correspond bien à l’écriture
sur le papier ; exclure des données d’entraînement les corrections administratives
qui ne transcrivent pas ce qui est écrit. Scans et tournoi restent inchangés.

Dans **Inscriptions → Fiches d’inscription vierges**, choisir **2 fiches par page**.
Les deux moitiés ont maintenant exactement la même disposition : nom du tournoi,
logo, site en pied de fiche, titre, tableau, QR et quatre repères propres à la fiche.
Couper sur la ligne médiane. Les identifiants QR des fiches restent distincts.

1. Distribuer une demi-feuille à chaque équipe. Remplir le nom de l’équipe et
   trois ou quatre joueurs, une ligne par cellule. Cocher un seul niveau par joueur.
   E-mail et club sont facultatifs ; laisser les cellules inutiles vides.
2. Scanner les demi-feuilles à 200–300 ppp en PDF multipages, PNG ou JPEG. Le
   scanner peut détecter l’A5 ou utiliser une page A4 blanche autour de la fiche.
   Conserver le QR et les quatre repères de la demi-feuille, sans les rogner.
   Les fiches tournées et les A4 non découpées à deux fiches sont acceptées.
3. Importer dans **Feuilles scannées**. Le lecteur propose les noms, e-mails et
   clubs localement, en lisant les cases de niveaux séparément. La progression
   indique le champ en cours ; le modèle est gardé en mémoire pendant le lot.
   **Interrompre l’analyse** arrête le lecteur ; **Reprendre l’analyse** permet de
   continuer avec les sources conservées.
4. Comparer chaque proposition à son extrait d’image. Vérifier particulièrement
   les accents et les e-mails ; un format d’e-mail incorrect est signalé sans
   inventer les caractères manquants. Corriger ou laisser vide un champ facultatif.
   **Enregistrer le brouillon** permet de reprendre la relecture plus tard.
5. **Enregistrer l’équipe** ajoute uniquement l’équipe relue, dans la bonne
   catégorie. L’autre moitié reste indépendante. Les règles de trois/quatre joueurs
   et le verrouillage habituel des inscriptions restent appliqués.

Le modèle est fourni dans l’exécutable : aucun téléchargement, cache préalable,
GPU ou connexion réseau ne sont nécessaires. Le lecteur TrOCR a été adapté à des
écritures françaises contemporaines (CREMMA-Wikipedia), à des mots manuscrits
photographiés (GNHK) et à des champs courts synthétiques avec accents et e-mails.
Une proposition plausible peut être incorrecte. Aucune précision
chiffrée sur les vraies fiches n’est annoncée ; une relecture est nécessaire.
[Fiche technique et limites](../assets/models/registration-model-card.md).

Réimprimer les formulaires pour les découper : les anciennes fiches alpha.1–3
à deux par A4 avaient des repères communs à toute la page. Elles restent utilisables
comme A4 complètes ; elles ne bénéficient pas des nouveaux repères après découpe.

## Nouveautés alpha.3

Dans une phase ouverte, **Imprimer toutes les feuilles** envoie tous ses documents
à l’imprimante choisie, en un seul travail et un seul dialogue. Les groupes suivent
l’ordre affiché ; toutes les pages des groupes à deux terrains sont incluses. Dans
un tableau final, les matchs suivent les tours, avec finale et Petite finale. Les
pages conservent leurs QR codes et identifiants. Une feuille absente ou invalide
interrompt la préparation avant impression ; utiliser la réparation dans Exports.

Le nouveau modèle local a été adapté aux « 1 » avec amorce et aux « 9 » bouclés,
avec répétition de chiffres publics pour conserver les autres écritures. Sur un
lot de 102 scores relus, 4 images vides et 4 différences entre l’écriture et le
résultat sportif validé ont été exclues. Sur les **94 scores exploitables**, alpha.2
donne 79 propositions correctes, 1 incorrecte et 14 à relire ; alpha.3 donne
**91 correctes, 0 incorrecte observée et 3 à relire**. Ce total comprend les données
d’adaptation : il ne mesure pas la précision sur des écritures nouvelles.

Une source de scan complète a été gardée hors entraînement : ses 31 scores donnent
27 lectures correctes et 4 à relire auparavant, contre **29 correctes et 2 à relire**
maintenant, sans erreur numérique observée. Les pages peuvent partager la même
écriture ; il faut encore des auteurs indépendants. [Mesures détaillées](reports/digits-alpha3-reviewed-summary.json)
et [fiche du modèle](../assets/models/model-card.md).

Le lecteur s’applique aux nouveaux imports et ne réécrit aucun résultat déjà relu.
Les anciens tirages restent utilisables. Conserver une copie avant de passer à une
nouvelle alpha. La relecture humaine reste nécessaire : « aucune erreur observée »
sur ce petit lot ne garantit pas l’absence d’erreurs futures.

## Scores et place pour le comptage

Les grandes cases au centre des cellules ont été remplacées par trois petites
cases **Final**, dans le coin inférieur droit. Elles mesurent chacune 14 × 18 points
PDF ; même dans un groupe de cinq sur un seul terrain, les cases occupent moins
de 15 % de la surface de la cellule. Le reste sert au comptage par bâtons, carrés
ou toute autre méthode de l’arbitre. Le lecteur utilise seulement la zone Final.

Le prétraitement conserve davantage des bords du chiffre, adapte le contraste à
chaque case, enlève les petites poussières et compare trois préparations :
centrage de l’encre, cadrage et correction d’inclinaison ou d’épaisseur du trait.
Les divergences et lectures peu nettes donnent **?**, avec des propositions.
Choisir une proposition ou saisir le score avant validation. Les règles sportives
ne servent jamais à transformer automatiquement un chiffre ambigu en score valide.
Si un trait descend sous le guide, une petite marge inférieure permet de récupérer
son pied sans incorporer la ligne imprimée pâle. Un score de match incompatible
avec la cible ou l’écart est également signalé, sans correction automatique.

Les petites cases facilitent la séparation des chiffres pour le modèle actuel.
Elles ne sont pas une nécessité universelle : un futur lecteur local de nombres
entiers pourrait les remplacer par une petite zone libre Final. La séparation
entre cette zone et le comptage resterait utile.

Les anciens tirages alpha.1 et leurs scans restent utilisables quand les rencontres,
participants et cibles n’ont pas changé. Leur géométrie originale est conservée.
Une modification sportive reste protégée comme avant.

## Essayer la préversion

1. Fermer Open Volleyball v1 puis lancer l’exécutable v2.
2. Créer un tournoi de test, ou copier intégralement un dossier `.openvolley`
   avant d’ouvrir sa copie dans v2. Les exemples livrés restent les originaux.
3. Imprimer les feuilles depuis v2 : QR codes, quatre repères noirs et cases de
   scores sont ajoutés automatiquement. Pour une inscription, chaque fiche a
   son propre identifiant, y compris les deux fiches d’une page A4.
4. Utiliser la grande zone libre pour compter les points. À la fin, écrire le
   score dans les petites cases Final, un chiffre par case, de gauche à droite. Laisser les cases restantes
   vides ; ne pas écrire de tiret. Les scores à un, deux ou trois chiffres sont
   possibles. Cocher une seule case N/R/D/U par joueur sur les inscriptions.
5. Scanner en A4 (ou demi-A4 pour une inscription) à 200 ou 300 ppp, en conservant toute la page et ses quatre
   repères. Enregistrer en PDF multipages, PNG ou JPEG avec le logiciel du
   scanner. Aucun pilotage spécifique de l’imprimante n’est encore nécessaire.
6. Ouvrir **Feuilles scannées → Importer des scans**. Plusieurs fichiers peuvent
   être sélectionnés. La lecture s’exécute dans un processus de travail local.
7. Comparer les propositions avec les images des cases. Corriger les champs puis
   **Valider les résultats**. Une paire vide laisse la rencontre inchangée ; une
   seule valeur dans une paire est refusée. Les autres rencontres peuvent être
   scannées plus tard.
8. Pour une inscription, relire et corriger le nom de l’équipe, les noms des joueurs,
   e-mails et clubs proposés à côté des images. Vérifier les niveaux cochés. L’équipe
   n’est enregistrée qu’avec trois ou quatre joueurs et respecte le verrouillage
   habituel des inscriptions.

Les fichiers modifiés par v2 utilisent le format 2. V2 lit les anciens tournois ;
v1 refuse les tournois au format 2, ce qui évite qu’elle supprime les informations
de scan qu’elle ne connaît pas. Pour revenir à v1, conserver la copie d’origine.

## Relecture et reprise

- Les vues **À vérifier**, **Validées**, **Écartées** et **Toutes** conservent la
  provenance, les images et les valeurs validées.
- **Enregistrer le brouillon** conserve les corrections sans modifier les scores.
- **Agrandir la feuille** affiche la page complète ; les champs montrent leur
  zone manuscrite à côté de la saisie.
- Un QR code illisible permet une association manuelle explicite à une feuille
  imprimée du tournoi. Vérifier alors toute l’image et les participants. Si deux
  fiches de la même page ont des codes illisibles, rescanner la page.
- **Écarter cette feuille** retire une page de la file de vérification sans
  supprimer son original.
- Les pages terminées restent enregistrées si une analyse est interrompue.
  **Reprendre l’analyse** réessaie les sources inachevées sans dupliquer les pages
  déjà importées. Les fichiers strictement identiques sont dédupliqués par SHA-256.
- Une erreur de lecture ne valide aucun résultat. Une page sans repères complets
  reste consultable et se saisit manuellement.

Une feuille remplacée, une phase supprimée ou un changement de participants
empêche la validation. Un résultat différent déjà enregistré demande la correction
habituelle depuis la phase, avec ses protections sur les étapes suivantes. Une
feuille approuvée est une seule transaction, même si elle contient plusieurs
résultats. Les originaux sont stockés dans `scans/`, à conserver avec le tournoi.
La restauration d’une sauvegarde JSON recopie les scans accessibles dans le
tournoi d’origine ; un JSON isolé ne contient pas les images. Les feuilles en
attente de l’ancien tournoi sont conservées mais écartées dans la copie restaurée.

## Reconnaissance locale et limites

### Constituer les vrais exemples nécessaires

Après avoir corrigé et validé un lot, **Exporter les scores relus** crée un dossier
avec uniquement les zones Final en PNG et un fichier `scores.json` contenant les
scores validés. Les noms d’équipes, joueurs et fichiers d’origine ne figurent pas
dans les métadonnées. Les propositions initiales alpha.2 sont conservées même si
un brouillon a été corrigé ; pour les anciens imports, une proposition d’origine
non traçable est indiquée comme inconnue. Aucun modèle n’est réentraîné en direct.

Pour améliorer réellement le taux de lecture, réunir plusieurs écritures et les
scans PDF originaux à 300 ppp. Conserver un lot d’auteurs distincts pour vérifier
les améliorations, sans l’utiliser pour le réglage ou l’entraînement. Commencer
par examiner des échecs annotés : cadrage, contraste, chiffre confondu ou rature.
Un modèle local plus riche ou un lecteur de nombres entiers sera ensuite comparé
au lecteur actuel sur ces mêmes cas, en mesurant aussi les erreurs non signalées
et le temps de relecture.

Les développeurs peuvent comparer alpha.1, alpha.2 et le lecteur livré avec
`npx tsx scripts/evaluate-reviewed.ts <dossier-scores-relus>`. L’option
`--exclude <fichier.json>` accepte une liste auditée `{ "score-00008.png": "motif" }`.
Les valeurs sportives corrigées ne sont pas toujours des étiquettes de lecture :
exclure toute image qui ne correspond pas à sa valeur dans l’export.

### Mesure contrôlée, distincte d’un essai réel

Un [premier diagnostic réel](reports/digits-alpha2-reviewed-summary.json) sur trois
pages déjà approuvées, soit **52 scores complets**, donne 40 suggestions correctes
et 12 incorrectes avec alpha.1 ; alpha.2 donne **46 correctes, 1 incorrecte et 5
lectures signalées**. Les valeurs de référence sont celles approuvées par
l’organisateur. Ce lot a servi à diagnostiquer les traits coupés sous les guides
et a été utilisé pendant le développement. **Ce n’est donc pas un test indépendant**,
ni une mesure de la future précision sur les nouvelles petites cases ou d’autres
écritures. Les scans, noms et étiquettes détaillées restent locaux.

Le [rapport alpha.2](reports/digits-alpha2-controlled.json) utilise les mêmes
1 000 chiffres MNIST de test (indices 100–1099), rendus avec différentes conditions
simulées. Le modèle n’a pas changé ; la préparation et la gestion d’incertitude
changent. Les colonnes ci-dessous comptent des **chiffres**, pas des scores complets.

| Simulation | Alpha.1 : mauvaises suggestions numériques | Alpha.2 : mauvaises suggestions numériques | Alpha.2 : à relire explicitement |
|---|---:|---:|---:|
| Propre | 60 / 1 000 | 3 / 1 000 | 85 / 1 000 |
| Inclinaison simulée | 56 / 1 000 | 4 / 1 000 | 84 / 1 000 |
| Format compact | 105 / 1 000 | 4 / 1 000 | 131 / 1 000 |

Sur la simulation de crayon clair, l’ancien seuil ne détecte aucun des 1 000
chiffres ; alpha.2 émet 915 propositions, dont 912 correctes, et signale 85 cas.
Ce test volontairement contrôlé démontre la sensibilité au contraste, pas la
fréquence attendue de ce problème au tournoi. Les premières propositions alpha.2,
y compris celles soumises à relecture, sont correctes pour 975 / 1 000 images
propres et 960 / 1 000 compactes. Le bénéfice vient donc à la fois de la préparation
et du signalement ; certaines lectures correctes deviennent également à confirmer.

Reproduction : télécharger les fichiers de test MNIST `t10k-images-idx3-ubyte.gz`
et `t10k-labels-idx1-ubyte.gz` depuis le miroir PyTorch
`https://ossci-datasets.s3.amazonaws.com/mnist/`, puis exécuter
`npx tsx scripts/benchmark-digits.ts <images.gz> <labels.gz> 1000`.

**Ces résultats ne prédisent pas la précision sur vos feuilles.** Les mêmes
écritures sont réutilisées dans les quatre simulations. Il faut mesurer les
scores complets et les erreurs non signalées sur un ensemble réel indépendant.

Le lecteur alpha.3 utilise un CNN indépendant, préentraîné sur MNIST puis adapté
aux exemples relus, embarqué avec son empreinte SHA-256 et sa licence MIT, et
ONNX Runtime Web en WebAssembly sur le processeur. Le modèle MNIST-12 est conservé
comme référence de comparaison. QR codes,
redressement par quatre repères, découpage des cases, préparation des chiffres
et lecture des cases cochées restent locaux. Aucun GPU n’est requis.

Le modèle de scores reconnaît des chiffres isolés ; un modèle distinct transcrit
les inscriptions manuscrites. Les propositions et l’indicateur de
lecture incertaine ne sont pas une garantie d’exactitude. Une vérification humaine
reste obligatoire, même si le score proposé respecte les règles du volleyball.

Les essais automatisés utilisent de vrais chiffres manuscrits MNIST placés dans
les cases et des PDF tournés. Ils vérifient l’intégration, pas la précision sur les
écritures des participants. Une campagne sur de vrais scans de plusieurs personnes
reste nécessaire : chiffres qui se touchent, ratures, stylos clairs, pages rognées,
compression JPEG et ombres peuvent réduire la qualité. Les photos très inclinées
ne sont pas la cible de cette première étape.

Limites d’import : 30 fichiers à la fois, 40 Mo par fichier, 100 pages par PDF.
TIFF/HEIC, dossier surveillé, commande directe du scanner et accès depuis les
téléphones ne sont pas encore intégrés.

## Étapes suivantes

1. Mesurer le taux d’erreurs et le temps de relecture avec de vrais scans de tournoi,
   sur un jeu de validation distinct. Ajuster les cases et le prétraitement.
2. Évaluer puis améliorer le lecteur d’inscriptions sur de vraies écritures
   françaises, en particulier les noms propres, accents et e-mails.
3. Ajouter le compagnon local pour téléphones : envoi de photos et saisie directe
   des scores, avec appairage et validation sur le poste principal.
4. Ajouter le dossier de scans surveillé et les intégrations de scanner utiles
   après identification du matériel.

## Checklist manuelle

- [ ] Déconnecter Internet ; imprimer, scanner et importer un groupe complet.
- [ ] Vérifier la lisibilité des QR codes et des quatre repères après impression.
- [ ] Essayer les scores 21–0, 21–19, 26–24 et un score à corriger manuellement.
- [ ] Vérifier qu’aucun classement ne change avant validation.
- [ ] Importer un groupe de cinq sur deux terrains : deux pages, bons matchs.
- [ ] Imprimer toutes les feuilles d’une phase de groupes : un seul dialogue,
      tous les groupes, y compris les deux pages d’un groupe à deux terrains.
- [ ] Imprimer toutes les feuilles d’un tableau final, finale/Petite finale comprises.
- [ ] Essayer des « 1 » avec amorce, « 7 » barrés et « 9 » bouclés ; vérifier les
      propositions et corriger les lectures encore signalées.
- [ ] Importer deux inscriptions sur une A4 ; vérifier les cases N/R/D/U et créer
      une équipe à trois joueurs, puis une à quatre.
- [ ] Imprimer deux fiches par A4 ; vérifier le même titre/logo/site sur les deux,
      couper au centre et scanner chaque moitié indépendamment, dont une tournée.
- [ ] Tester une demi-feuille sur un fond A4 : bon recadrage, bon QR et bons niveaux.
- [ ] Vérifier noms, accents, clubs et e-mails ; laisser la quatrième ligne vide,
      corriger une proposition puis enregistrer une seule équipe.
- [ ] Interrompre puis reprendre un lot ; vérifier les brouillons et données déjà relues.
- [ ] Valider des inscriptions, puis **Exporter les inscriptions relues**. Vérifier
      les images et accents dans `inscriptions.json`, y compris une quatrième ligne
      vide ; compresser le dossier pour le transmettre directement.
- [ ] Enregistrer un brouillon, fermer et rouvrir le tournoi.
- [ ] Réimporter le même fichier : aucune duplication.
- [ ] Essayer une ancienne feuille après échange des équipes du tableau : refus.
- [ ] Vérifier qu’un score contradictoire renvoie vers la correction explicite.

Depuis les sources : `npm ci`, `npm run models:fetch`, puis `npm start`. `npm test` et `npm run test:ui`
exécutent respectivement les tests de domaine/PDF et les essais Electron. Les
tests utilisent uniquement des dossiers jetables.
