# Lecture des inscriptions : fonctionnalité expérimentale

L’objectif est de reconnaître au moins **75 % des chaînes non vides exactement**,
en conservant les accents, chiffres, casse et ponctuation, sur les écritures
ordinaires de différentes équipes. Les lettres capitales et les cases par caractère
ne sont pas des conditions d’utilisation. La page reste marquée **expérimentale**.

## Comparaison

Les résultats et versions exactes sont dans
[le rapport agrégé](reports/registration-alpha7-readers.json). Aucun lecteur de cette
comparaison n’a été entraîné sur les inscriptions fournies. Le modèle personnalisé
alpha.6 est volontairement exclu : sa mémorisation ne mesure pas la généralisation.

Le lot comprend huit fiches, 65 champs non vides et 39 cellules vides. Quatre
étiquettes ne transcrivent pas l’encre ou concernent une adresse coupée ; elles sont
exclues des métriques, sans modifier les fichiers d’origine. Les comparaisons portent
donc sur **61 chaînes** : huit noms d’équipes, 24 noms de joueurs, 12 e-mails, 17 clubs.
Les 39 cellules vides sont mesurées séparément, sans améliorer artificiellement le
pourcentage de reconnaissance. Les noms et adresses ne sont pas publiés.

| Lecteur sans apprentissage sur vos fiches | Chaînes exactes | Pourcentage |
| --- | ---: | ---: |
| TrOCR générique intégré | 27/61 | 44,3 % |
| LightOnOCR-2 1B | 35/61 | 57,4 % |
| Qwen3-VL 4B | 40/61 | 65,6 % |
| Qwen3-VL 8B | 43/61 | 70,5 % |
| Qwen3.5 9B, configuration retenue et moteur de l’application | 45/61 | **73,8 %** |

Le lecteur retenu reconnaît exactement 19/24 noms de joueurs (79,2 %) et 8/12
e-mails (66,7 %). **Le minimum de 75 % au total n’est pas atteint.** Le pack est
disponible pour expérimenter, sans le présenter comme une fonctionnalité validée.

Ce lot a déjà été examiné pendant le développement. Les auteurs sont inconnus et
les fiches proviennent d’une seule capture. Il permet une **comparaison exploratoire**,
pas une validation sur des auteurs indépendants. Aucun résultat sur ces huit fiches
ne justifie à lui seul de retirer le statut expérimental. Les scores sont des
correspondances exactes, après normalisation Unicode et espaces de présentation ;
pas une précision par caractère ni une correspondance approximative de noms.

La comparaison inclut TrOCR générique, LightOnOCR-2 1B, Qwen3-VL 4B/8B et Qwen3.5
9B. Des essais globaux de résolution et nettoyage sont publiés aussi ; aucun choix
de modèle ou de résultat n’est effectué d’après la réponse attendue de chaque champ.
Les premiers essais utilisent les PNG exportés ; la configuration retenue est
rejouée avec le **véritable code de découpage et moteur natif de l’application**.

## Installation et utilisation

1. Lancer `Open-Volleyball-2.0.0-Windows.exe`.
2. Décompresser le pack facultatif `OpenVolleyball-LecteurAvance` dans un dossier
   permanent du PC. Il contient environ 7 Go de fichiers. Prévoir 32 Go de RAM de
   préférence ; l’accélération graphique est facultative, 12 Go de VRAM conseillés.
   Les mesures sont effectuées sur une RTX 5070 Ti 16 Go ; les autres machines
   peuvent avoir des performances différentes.
3. Ouvrir **Feuilles scannées → Installer le lecteur avancé…** et choisir ce dossier.
   L’application vérifie les tailles et empreintes de tous ses fichiers. Aucun
   téléchargement n’est effectué. Ne pas déplacer le dossier après installation ;
   utiliser à nouveau le bouton pour sélectionner un nouvel emplacement.
4. Importer un lot de fiches comme auparavant. Les propositions restent soumises à
   relecture et validation manuelle. Une adresse de format correct peut être fausse.
5. Si la carte graphique est incompatible, cocher **Utiliser seulement le processeur**.
   Le menu du lecteur permet de revenir au moteur intégré.

Le moteur natif est un processus llama.cpp indépendant de l’interface. Il écoute
uniquement sur `127.0.0.1`, avec un secret aléatoire par lancement. Il ne reçoit que
l’image de la cellule courante et une consigne fixe de transcription, sans liste de
noms ou de domaines suggérés. Modèles locaux, mode hors ligne forcé, interface web
désactivée, aucun journal des scans. Le processus est arrêté à l’interruption, à la
fin du lot ou à la fermeture normale de l’application. Les scores continuent à
utiliser le CNN accepté précédemment. Une absence du pack ou un échec du lecteur
est signalé ; aucun service distant ne prend le relais.

## Reproduction et maintenance

`npm run reader:prepare` prépare le pack Windows séparé à partir de téléchargements
publics explicitement demandés, épinglés par révision et SHA-256 dans
`assets/models/advanced-reader-recipe.json`. C’est une opération de préparation du
pack, pas une fonction réseau de l’application. Le pack complet peut être copié
sur un autre ordinateur sans Internet. Aucun modèle personnalisé n’y est inclus.

`scripts/benchmark-registration-readers.py` compare les lecteurs sans entraînement.
Il utilise Pillow et les dépendances de préparation existantes ; l’essai LightOn
demande un environnement Transformers 5 compatible, isolé de l’environnement
d’entraînement historique. Les poids sont préparés localement aux révisions du
rapport. `--exclude` retire uniquement les étiquettes incohérentes des métriques,
sans les fournir au modèle. `--min-tokens 1024` et `--clean` reproduisent les variantes.

`npx tsx scripts/evaluate-registration-native.ts EXPORT PACK NOM` utilise exactement
le moteur natif et le découpage de l’application. `--cpu --limit=3` permet un essai
court sur processeur. Les deux outils limitent leurs sorties détaillées au dossier
ignoré `tmp` ; seuls les agrégats sans texte personnel sont publiés.

Sources : [Qwen3.5](https://huggingface.co/Qwen/Qwen3.5-9B),
[quantification distribuée](https://huggingface.co/unsloth/Qwen3.5-9B-GGUF),
[Qwen3-VL](https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct-GGUF),
[LightOnOCR](https://huggingface.co/lightonai/LightOnOCR-2-1B),
[llama.cpp](https://github.com/ggml-org/llama.cpp/tree/b11669).
