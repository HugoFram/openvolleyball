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
