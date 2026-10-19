# V2 - Première étape : feuilles scannées, entièrement hors ligne

Version `2.0.0-alpha.1`. Cette préversion ajoute un parcours utilisable de bout en
bout : impression des nouvelles feuilles, import de scans, lecture locale des
chiffres, vérification et enregistrement des résultats. Aucun service cloud,
compte, clé API, téléchargement de modèle au lancement ou connexion Internet.

## Essayer la préversion

1. Fermer Open Volleyball v1 puis lancer l’exécutable v2.
2. Créer un tournoi de test, ou copier intégralement un dossier `.openvolley`
   avant d’ouvrir sa copie dans v2. Les exemples livrés restent les originaux.
3. Imprimer les feuilles depuis v2 : QR codes, quatre repères noirs et cases de
   scores sont ajoutés automatiquement. Pour une inscription, chaque fiche a
   son propre identifiant, y compris les deux fiches d’une page A4.
4. Écrire un chiffre par case, de gauche à droite. Laisser les cases restantes
   vides ; ne pas écrire de tiret. Les scores à un, deux ou trois chiffres sont
   possibles. Cocher une seule case N/R/D/U par joueur sur les inscriptions.
5. Scanner en A4 à 200 ou 300 ppp, en conservant toute la page et ses quatre
   repères. Enregistrer en PDF multipages, PNG ou JPEG avec le logiciel du
   scanner. Aucun pilotage spécifique de l’imprimante n’est encore nécessaire.
6. Ouvrir **Feuilles scannées → Importer des scans**. Plusieurs fichiers peuvent
   être sélectionnés. La lecture s’exécute dans un processus de travail local.
7. Comparer les propositions avec les images des cases. Corriger les champs puis
   **Valider les résultats**. Une paire vide laisse la rencontre inchangée ; une
   seule valeur dans une paire est refusée. Les autres rencontres peuvent être
   scannées plus tard.
8. Pour une inscription, recopier le nom de l’équipe, les noms des joueurs,
   e-mails et clubs depuis les images. Vérifier les niveaux cochés. L’équipe
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

Le lecteur utilise le modèle CNN MNIST-12, embarqué avec son empreinte SHA-256 et
sa licence MIT, et ONNX Runtime Web en WebAssembly sur le processeur. QR codes,
redressement par quatre repères, découpage des cases, préparation des chiffres
et lecture des cases cochées restent locaux. Aucun GPU n’est requis.

Le modèle reconnaît des chiffres isolés, pas du texte libre. Les noms, clubs et
e-mails restent à recopier à cette étape. Les propositions et l’indicateur de
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
2. Ajouter un modèle local de texte manuscrit pour les inscriptions, après mesure
   de sa qualité en français, de sa vitesse et de la taille distribuée.
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
- [ ] Importer deux inscriptions sur une A4 ; vérifier les cases N/R/D/U et créer
      une équipe à trois joueurs, puis une à quatre.
- [ ] Enregistrer un brouillon, fermer et rouvrir le tournoi.
- [ ] Réimporter le même fichier : aucune duplication.
- [ ] Essayer une ancienne feuille après échange des équipes du tableau : refus.
- [ ] Vérifier qu’un score contradictoire renvoie vers la correction explicite.

Depuis les sources : `npm ci`, puis `npm start`. `npm test` et `npm run test:ui`
exécutent respectivement les tests de domaine/PDF et les essais Electron. Les
tests utilisent uniquement des dossiers jetables.
