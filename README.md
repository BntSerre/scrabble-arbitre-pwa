# Scrabble Arbitre IA — Progressive Web App (PWA) 100% Hors-Ligne

Application web progressive (PWA) complète, responsive en mode sombre, conçue prioritairement pour smartphone (format Samsung Galaxy S24 Ultra - 412 x 915 px) et fonctionnant **100 % en local (zéro cloud, zéro API)**.

Elle sert **d'arbitre officiel automatique, de détecteur de triche et de compteur de points par reconnaissance photo** pour le jeu de Scrabble francophone (ODS).

---

## 🚀 Fonctionnalités Clés

### 1. Vision par Ordinateur 100 % Locale (Zero Cloud / Zero API)
- **Capture Caméra & Calibration 4 Coins :** Flux vidéo avec mire interactive et repères tactiles d'angles (Haut-Gauche, Haut-Droit, Bas-Droit, Bas-Gauche) manipulables au doigt pour cadrer exactement les 4 coins de la grille 15x15.
- **Pipeline OpenCV.js :** Transformation homographique (`cv.getPerspectiveTransform` et `cv.warpPerspective`) avec algorithme de repli pur JS pour redresser le plateau en une image carrée parfaite de 900x900 px.
- **Découpage 15x15 & Colorimétrie HSV :** Segmentation virtuelle en 225 sous-images (60x60 px) et détection colorimétrique dans l'espace HSV pour isoler les tuiles bois/ivoire et ne scanner que les nouvelles tuiles posées au tour $N$ par rapport au tour $N-1$.
- **OCR Tesseract.js & Preprocessing :** Seuillage adaptatif (`cv.adaptiveThreshold`), suppression de la marge inférieure droite (chiffre de valeur de la lettre) et reconnaissance en mode caractère unique (`PSM_SINGLE_CHAR` / `psm: 10`, whitelist `A-Z`).
- **Détecteur automatique de Joker :** Détection de tuile par colorimétrie avec absence de glyphe au centre $\rightarrow$ qualification automatique en lettre blanche (Joker).
- **Grille 15x15 Interactive :** Affichage immédiat du plateau avec mise en valeur des nouvelles lettres, modification/correction tactile d'une tuile, et prévisualisation du score en direct.

### 2. Moteur de Règles Strictes & Détection Anti-Triche
Compare l'état du tour $N$ avec le tour $N-1$ et bloque la validation avec alerte visuelle et sonore **"TRICHE / COUP INVALIDE"** si une règle est enfreinte :
- **Règle du 1er tour :** Doit obligatoirement passer par la case centrale (H8, étoile) et compter au moins 2 lettres.
- **Alignement & Continuité :** Toutes les nouvelles lettres d'un tour doivent être sur une seule et même ligne ou colonne, sans trou entre elles (les trous doivent être comblés par des lettres des tours précédents).
- **Connexion obligatoire :** Au moins une nouvelle lettre doit toucher horizontalement ou verticalement une lettre existante.
- **Intégrité du plateau (Anti-Triche) :** Aucune lettre existante ne peut être retirée, déplacée ou modifiée.
- **Contrôle du chevalet :** Pas plus de 7 lettres posées en un seul tour.
- **Contrôle de la pioche officielle (102 jetons) :** Décompte exact des lettres restantes et alerte en cas de dépassement de stock (ex: 2e 'Z', 2e 'K', 3e Joker).
- **Validation Dictionnaire Francophone :** Dictionnaire officiel complet de 311 530 mots en local (`data/scrabble_ods.json`), validant à la fois le mot principal et tous les mots croisés créés lors du tour.

### 3. Calculateur de Points Officiel Francophone
- **Plateau Officiel 15x15 :** Mot Compte Triple (MT - Rouge), Mot Compte Double (MD - Rose), Lettre Compte Triple (LT - Bleu foncé), Lettre Compte Double (LD - Bleu ciel), Étoile centrale H8.
- **Barème Francophone :** Valeurs officielles de 1 pt (A, E, I, L, N, O, R, S, T, U) à 10 pts (K, W, X, Y, Z), Joker = 0 pt.
- **Règle d'usure des cases :** Un bonus multiplicateur ne s'applique QUE pendant le tour où une nouvelle tuile est posée dessus.
- **Multiplicateurs multiples :** Si une tuile posée sur un bonus forme à la fois un mot horizontal et un mot vertical, le bonus s'applique aux deux mots !
- **Prime Scrabble (Bingo) :** Poser les 7 lettres du chevalet en un seul tour ajoute automatiquement **+50 points**.
- **Gestion des actions :** Passer son tour (0 pt), échange de lettres et décompte de fin de partie.

### 4. Statistiques & Sauvegarde Locale
- Persistance automatique dans `localStorage` / `IndexedDB` avec boutons d'export et d'import en fichier JSON.
- Graphiques dynamiques **Chart.js** :
  - Courbe d'évolution des scores par tour pour chaque joueur.
  - Histogramme comparatif : victoires (%), moyennes de points, records de mots et **Indice Triche / Fautes**.

### 5. Vérification Autonome & Démonstration 3 Tours
- Générateur synthétique de plateau Scrabble avec texture bois et déformation en perspective sur `<canvas>`.
- Bouton de démonstration **"Simuler une séquence de 3 tours"** :
  1. Tour 1 : Mot légal d'ouverture au centre H8 avec 7 lettres ("ARBITRE" $\rightarrow$ Scrabble +50 pts).
  2. Tour 2 : Tentative de triche (placement illégal en diagonale) interceptée avec pop-up d'alerte officielle.
  3. Tour 3 : Coup légal magistral ("INVENTER" 7 nouvelles tuiles) touchant un **Mot Compte Triple (MT)** avec prime de 50 pts Scrabble.

---

## 🛠️ Démarrage Local

Lancez un serveur HTTP local (Python ou équivalent) :

```bash
# Avec Python 3
python -m http.server 8080
```

Ouvrez ensuite l'application dans votre navigateur :
`http://localhost:8080` (recommandé en mode responsive mobile 412 x 915 px).
