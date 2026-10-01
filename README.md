# Genesis Explorer

Crée une application web appelée "OGameX Genesis Screener".

C'est un outil de recherche de joueurs pour l'univers Genesis d'OGameX.

Je vais connecter l'application à une base de données Supabase contenant une table nommée "planets".

La table planets contient exactement ces colonnes :

- Coordinates : text, clé primaire. Exemple : "6:80:6"

- Planet : text, nom de la planète

- Player : text, pseudo du joueur

- PlayerId : text, identifiant unique du joueur

- Moon : text, valeur "Oui" ou "Non"

Fonction principale :

Créer une grande barre de recherche permettant de rechercher un joueur par son pseudo.

La recherche doit être insensible à la casse et permettre une recherche partielle du pseudo.

Pendant que l'utilisateur tape, afficher des suggestions de joueurs correspondants.

Lorsqu'un joueur est sélectionné, utiliser son PlayerId pour récupérer toutes les planètes appartenant à ce joueur. Le PlayerId ne doit pas être affiché dans l'interface.

Afficher ensuite :

- le pseudo du joueur

- le nombre total de planètes trouvées

- le nombre de planètes possédant une lune

Puis afficher un tableau avec :

- Coordonnées

- Nom de la planète

- Lune : Oui / Non

Les coordonnées doivent être triées numériquement par galaxie, système puis position.

Prévoir également un bouton permettant de copier une coordonnée.

Design :

- thème sombre

- interface inspirée d'un univers spatial / jeu de stratégie

- moderne et simple

- responsive ordinateur et mobile

- couleurs bleu foncé / noir avec accents bleu clair

- pas besoin de système de connexion utilisateur pour le moment

Ne crée pas de fausses données. L'application devra utiliser les données réelles de Supabase une fois la connexion effectuée.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/35965881-d512-470c-8b09-dcc493dccb50).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
