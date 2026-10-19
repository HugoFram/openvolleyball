# Version 2.0.0-alpha.6

- Lecture locale conditionnée par le type de champ : e-mail ou texte ordinaire,
  sans affichage du préfixe technique ni correction automatique par dictionnaire.
- Adaptation personnalisée Windows, conservée localement. Comparaison préalable
  sur deux fiches exclues des six fiches d’apprentissage : e-mails exacts 1/7 →
  3/7, erreurs de caractères des e-mails 32 → 8 ; noms exacts 2/7 → 3/7.
  Échantillon limité, une seule capture, auteurs inconnus : relecture nécessaire.
- Modèle local final ajusté sur 61 champs exploitables des huit fiches après
  enregistrement de cette comparaison. Sa relecture du même lot mesure uniquement
  l’ajustement aux exemples, pas la précision sur de nouvelles écritures.
- Modèle personnalisé et données privées exclus du dépôt public. La compilation
  publique garde le lecteur générique ; recettes, rapports agrégés et garde-fous
  de compilation/export sont fournis dans les sources.
- Cellules d’e-mail 17 % plus larges sur les nouvelles fiches ; anciennes fiches
  reconnues avec leurs coordonnées enregistrées. Filtres supplémentaires contre
  les bordures et poussières dans les champs vides. Lecteur des scores inchangé.
- Validation : 67 tests de domaine/stockage/PDF/modèle, six tests d’entraînement
  et de protection des poids privés, 17 parcours Electron. Lecture réelle hors
  ligne, PDF/JPEG découpés et tournés, export et anciennes données conservés.

# Version 2.0.0-alpha.5

- **Exporter les inscriptions relues** dans Feuilles scannées : images brutes des
  champs, textes validés avec accents, propositions initiales, groupes de capture
  et empreintes des images. Champs vides conservés ; cases de niveaux exclues.
  Export local, sans modification des scans ni du tournoi ; noms/e-mails inclus.
- Les étiquettes proviennent de la validation de la fiche, même après une
  modification ultérieure de l’équipe. Les données alpha.4 restent exportables.
- Lecteur manuscrit adapté sur 8 391 exemples réels supplémentaires (GNHK et
  CREMMA-Wikipedia français), plus 2 400 champs courts synthétiques. Inférence CPU
  entièrement hors ligne. Le lecteur de scores accepté reste inchangé.
- Comparaison q8 CPU sur 128 lignes françaises hors entraînement : erreurs de
  caractères 52,5 % → 17,9 % ; sous-ensemble avec accents : 54,0 % → 18,9 %.
  Sur 128 mots anglais : 40 → 74 transcriptions exactes. Ce ne sont pas des taux
  de réussite sur les fiches réelles ; la relecture demeure indispensable.
- Recettes d’entraînement, tests d’alignement des cibles, provenances/licences,
  rapports de comparaison et poids contrôlés par SHA-256 fournis avec les sources.
- Validation : 67 tests de domaine/stockage/PDF/modèles, 17 essais Electron et
  trois tests de l’objectif d’entraînement. Export testé sur demi-feuilles PDF/JPEG,
  accents, champs vides, modifications ultérieures, annulation et conservation des
  originaux. Le modèle s’exécute réellement hors ligne pendant les essais.

# Version 2.0.0-alpha.4

- Deux fiches d’inscription identiques par A4 : titre, logo et site sur chaque
  moitié, ligne de découpe centrale, QR et quatre repères indépendants.
- Import de demi-feuilles découpées en PDF/PNG/JPEG, même tournées ou placées sur
  une page A4 ; recadrage propre à chaque fiche et lecture séparée des niveaux.
- Transcription manuscrite entièrement locale des équipes, joueurs, e-mails et
  clubs avec un modèle TrOCR quantifié embarqué. Cellules vides préservées,
  avertissements sur les e-mails invalides, image à côté de chaque proposition.
- Modèle conservé pendant le lot, progression par champ, interruption et reprise.
  Création d’équipe après relecture explicite, avec les protections habituelles.
- Les anciens formulaires restent reconnus comme A4 complètes ; réimprimer pour
  profiter des repères de chaque demi-feuille. Le lecteur de scores alpha.3 est conservé.
- Validation : 64 tests de domaine/stockage/PDF/modèles et 17 tests Electron, dont
  demi-PDF tournés, JPEG sur fond A4, modèle réellement exécuté hors ligne,
  interruption/reprise et correction d’une équipe avant enregistrement.

# Version 2.0.0-alpha.3

- Bouton **Imprimer toutes les feuilles** dans chaque phase confirmée : impression
  unique des groupes, des deux terrains éventuels ou des matchs du tableau final.
  Ordre sportif stable, QR codes conservés, préparation complète avant le dialogue.
- Nouveau CNN local adapté à 63 scores audités de trois sources de scan ; répétition
  de chiffres publics pour conserver les autres écritures. Une quatrième source est
  gardée hors adaptation. Les « 1 » avec amorce et « 9 » bouclés sont mieux lus ;
  les divergences restent à confirmer. Pas de correction par les règles sportives.
- Mesure sur 94 scores exploitables : 91 corrects, 0 erreur numérique observée,
  3 à relire ; sous-ensemble hors adaptation de 31 scores : 29 corrects, 2 à relire.
  Ces données de développement ne constituent pas une garantie de précision.
- Conservation des provenances alpha.2 ; les résultats approuvés sont préservés.
  Code d’entraînement, fiche du modèle et comparaison reproductible fournis ;
  images et étiquettes privées non publiées.
- Validation : 60 tests de domaine/stockage/PDF/modèle et 15 tests Electron,
  également réussis sur l’application Windows empaquetée. Les essais d’impression
  vérifient un travail unique, chaque page non vide et tous les QR codes décodés.

# Version 2.0.0-alpha.2

- Espace de comptage libre ; petites cases Final de 14 × 18 points dans le coin
  inférieur droit, moins de 15 % d’une cellule du groupe le plus dense.
- Lecture locale : contraste par case, réduction des poussières, cadrage moins
  serré, centrage de l’encre et trois préparations comparées. Les lectures ambiguës
  demandent un choix explicite, avec propositions cliquables.
- Une mise à jour de mise en page conserve les anciens tirages tant que leurs
  rencontres/participants/cibles restent identiques.
- Export local des scores relus : extraits PNG, étiquettes et propositions initiales
  conservées séparément du brouillon. Aucun apprentissage automatique implicite.
- Benchmark contrôlé reproductible et outil de comparaison sur les exports réels.
  Les mesures synthétiques ne constituent pas une précision annoncée sur le terrain.

# Version 2.0.0-alpha.1

- Première étape v2 entièrement hors ligne : nouvelles feuilles avec QR codes,
  repères d’alignement, cases de chiffres et niveaux N/R/D/U à cocher.
- Import PDF multipages/PNG/JPEG ; lecture locale des chiffres sur CPU avec un
  modèle embarqué et des niveaux cochés ; images et originaux conservés.
- File de vérification, agrandissement, extraits par champ, brouillons persistants,
  association manuelle, validation transactionnelle et reprise des imports.
- Protection contre les fichiers dupliqués, les feuilles remplacées, les anciens
  participants et les résultats contradictoires ; historique de la validation.
- Inscriptions identifiées et recopiées à côté de leur image ; texte libre
  manuscrit et téléphones prévus pour les étapes suivantes.
- Format 2 protégé contre la réécriture par v1. Utiliser une copie du tournoi.
- [Guide, limites et checklist v2](V2-OFFLINE.md).

# Version 1.3.0

- Chaque équipe du tableau final affiche son rang général de la dernière phase de groupes, y compris après qualification automatique, progression ou échange. Les égalités conservent leur rang partagé. Les anciens tableaux restent compatibles.
- Avant le premier résultat de la phase, **Échanger des équipes** permet de sélectionner deux équipes du premier tour pour inverser leurs places, y compris le bénéficiaire d’une exemption. Les échanges sont enregistrés immédiatement et peuvent être inversés.
- Les participants des tours suivants et leurs feuilles PDF sont actualisés automatiquement. Les rangs, les qualifiés, les identifiants des rencontres et l’historique des autres phases sont conservés. L’ordre initial des têtes de série reste disponible dans les données.
- Le premier résultat, ou un forfait enregistré, verrouille les échanges de cette phase. L’interface et le moteur appliquent la même restriction.
- Validation : 47 tests de moteur/stockage/PDF et 10 tests Electron, incluant les tableaux 4/8/16, les exemptions 3/5/6/7, la reprise des anciens tableaux, la persistance, les nouvelles feuilles et le verrouillage.

# Version 1.2.1

- Texte centré verticalement dans les cellules, y compris les noms sur plusieurs lignes et les fiches d’inscription.
- Hauteur maximale des lignes : 5 cm. Les feuilles des matchs de finale n’étirent plus une seule ligne jusqu’au bas de la page.
- Les feuilles de groupes/finales existantes sont actualisées à l’ouverture du tournoi.

# Version 1.2.0

- Icône fournie intégrée à l’exécutable, à la fenêtre et à l’interface ; palette bleue. La construction ne régénère plus l’ancienne icône verte.
- Impression corrigée : préparation des pages PDF dans une vue dédiée, attente du rendu complet à 200 ppp, puis impression HTML A4. Afficher conserve le PDF original. L’aperçu natif de Windows peut rester indisponible selon sa boîte de dialogue ; la feuille préparée contient son contenu.
- Tous les groupes sur une page, sauf cinq équipes avec Deux terrains : deux pages de cinq matchs.
- Colonnes Équipe 1, Équipe 2, Score 1, Score 2, Arbitre ; scores environ 37 % plus larges que les autres colonnes. Noms 1/2 harmonisés dans l’interface.
- En-tête limité au nom du tournoi et au logo agrandi ; URL déplacée dans le pied de page, y compris les fiches d’inscription. Les feuilles de groupes/finales sont actualisées à l’ouverture des anciens tournois.
- Validation : 37 tests moteur/stockage/PDF et 9 tests Electron, dont deux qui vérifient le contenu réel de la sortie d’impression (une/deux pages). Exemples d’origine inchangés.

# Version 1.1.0

- Création d’un tournoi avec logo PNG/JPEG facultatif et site web, intégrés dans les feuilles de groupes et de matchs. Le logo est embarqué pour les copies/sauvegardes.
- Finales : arbitre facultatif et vide par défaut ; feuilles préparées automatiquement avec Afficher/Imprimer. Les participants sont actualisés après progression ou correction.
- Terminologie « Tournoi » dans toute l’interface ; titres simplifiés et textes décoratifs supprimés.
- Inscription : listes N/R/D/U utilisables au clavier, légende, trois ou quatre joueurs obligatoires à la création comme à la modification.
- Formulaires d’inscription vierges, une ou deux fiches par page A4, en plusieurs pages ; fiche complète de chaque équipe imprimable depuis le classement final.
- Règlement fixe : écart de deux points ; victoires/matchs joués puis différence/matchs joués puis départage manuel. Suppression de l’onglet Règlement et de « Priorité » dans les sélecteurs.
- Phases de groupes suivantes réparties en serpent d’après les résultats précédents ; badges de rang précédent et départages pertinents avant génération.
- Deux terrains réservés aux groupes de cinq ; classement général entre groupes dans l’onglet Classements.
- Feuilles de groupes : colonnes de scores élargies, noms sans numéro de rencontre, phase complète, suppression de la phrase de prolongation.
- Compatibilité avec les tournois 1.0 : résultats, calendriers et répartitions enregistrés préservés ; les nouvelles décisions suivent les règles fixes. Les feuilles sont actualisées à l’ouverture. Les exemples livrés précédemment sont inchangés.

Validation : 35 tests de moteur/stockage/PDF et 8 tests Electron d’interface/impression. Ces derniers sont aussi exécutés sur l’application Windows empaquetée. Les mises en page PDF sont rendues puis relues visuellement. L’imprimante physique reste à vérifier sur le site du tournoi.
