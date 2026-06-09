# 🌍 Les Capitales du Monde

Une application web pour apprendre les capitales des pays du monde.
Elle fonctionne entièrement dans le navigateur, sans installation ni serveur.

## 📂 Contenu du projet

- `capitales-du-monde.html` — l'application complète (HTML + CSS + JavaScript dans un seul fichier).

Pour l'ouvrir : double-clique simplement sur le fichier, il s'ouvre dans ton navigateur.

## ✨ Fonctionnalités actuelles

- **Mode Révision** : parcourir toutes les fiches (drapeau + pays + capitale).
- **Mode Quiz** : un pays est affiché, il faut choisir la bonne réponse parmi 4 propositions.
- **Mode Clavier** : taper la réponse au clavier (les accents et la casse sont tolérés).
- **Mode Défi** : contre la montre, un maximum de bonnes réponses en 60 secondes.
- **Sens réversible** : deviner la capitale d'un pays *ou* deviner le pays d'une capitale.
- **Niveau de difficulté** : Facile (propositions variées + indice du continent) ou Difficile
  (propositions du même continent, sans indice).
- **Filtre par continent** : Europe, Asie, Afrique, Amérique du Nord, Amérique du Sud, Océanie.
- **Score, nombre de questions et série** de bonnes réponses d'affilée (avec un 🔥 dès 3 d'affilée).
- **Records sauvegardés** : meilleure série et record du Défi conservés même après rechargement
  (via `localStorage`).
- **Sons** (bonnes/mauvaises réponses, fanfare) avec un bouton 🔊/🔇 et **confettis** de récompense
  tous les 5 d'affilée et sur nouveau record.
- **Design coloré** : fond en dégradé, une couleur par continent, animations légères.
- **195 pays** dans la base de données (tous les États du monde).

## 🛠️ Détails techniques

- Aucune dépendance (pas de framework). Juste du HTML, du CSS et du JavaScript « vanilla ».
- Les données des pays sont dans la constante `DATA` dans le `<script>` :
  chaque entrée est `{c: "Pays", cap: "Capitale", k: "Continent", f: "🇫🇷 (drapeau)"}`.
- Les couleurs des continents sont définies dans l'objet `COLORS` et dans les variables CSS (`--eu`, `--as`, etc.).
- Les records sont stockés dans `localStorage` sous la clé `capitales_records_v1`
  (`{bestStreak, bestTimed}`). Le score de la session en cours, lui, repart à zéro à chaque rechargement.
- Les sons sont générés à la volée avec l'API Web Audio (aucun fichier audio).

## 💡 Idées d'améliorations (à demander à Claude Code)

- Une **carte du monde** interactive où les pays s'allument.
- Un mode **apprentissage espacé** (revoir en priorité les pays ratés).
- Des **statistiques détaillées** par continent.
- Un **classement** ou le partage de son record.

## 🗣️ Comment continuer avec Claude Code

Ouvre ce dossier avec Claude Code, puis demande par exemple :
- « Ajoute tous les pays manquants pour avoir les 195 du monde. »
- « Ajoute un mode où je tape la réponse au clavier. »
- « Sauvegarde mon meilleur score même si je recharge la page. »
