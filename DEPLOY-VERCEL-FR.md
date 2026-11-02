# Déployer Nova AI sur Vercel

## Important
GitHub affiche le fichier README quand on ouvre la page du dépôt. C'est normal : ce n'est pas l'application. Pour voir l'interface, il faut déployer le projet Next.js sur Vercel.

## Paramètres du projet Vercel
- Framework Preset : Next.js
- Root Directory : `./`
- Build Command : `npm run build`
- Output Directory : laisser vide
- Install Command : `npm install`

## Variables d'environnement
Dans Vercel > Project > Settings > Environment Variables, configurer au minimum :

- `DATABASE_URL` : URL de connexion PostgreSQL distante (par exemple une base Neon). Ne pas utiliser `127.0.0.1` en production.
- `POLLINATIONS_API_KEY` : clé API Pollinations (secret serveur, ne jamais préfixer par `NEXT_PUBLIC_`).
- `SESSION_SECRET` : chaîne aléatoire longue et privée.
- `AUTH_DISABLED` : `true` pour le mode ouvert prévu par le projet, ou `false` pour activer l'authentification.
- `OPEN_USER_EMAIL` : adresse du compte invité en mode ouvert.
- `OPEN_USER_NAME` : nom affiché du compte invité.
- `APP_BASE_URL` : URL publique Vercel du site, par exemple `https://mon-projet.vercel.app`.

Les variables de messagerie (`RESEND_API_KEY` ou paramètres SMTP) sont nécessaires si l'authentification par e-mail est activée.

## Base de données
Créer une base PostgreSQL hébergée (Neon, par exemple), puis copier son URL dans `DATABASE_URL`. Les tables doivent être créées avec le schéma Drizzle du projet (`npx drizzle-kit push`) depuis un environnement configuré avec cette même URL. Ne jamais publier les clés ou le fichier `.env` sur GitHub.

## Déploiement
1. Importer le dépôt GitHub dans Vercel.
2. Vérifier les paramètres ci-dessus.
3. Ajouter les variables d'environnement.
4. Déployer, puis consulter le domaine `*.vercel.app` fourni par Vercel — pas l'URL `github.com` du dépôt.
5. Après chaque modification des variables, relancer un déploiement.

Le code de l'interface dans `src/components/LandingClient.tsx` et les pages de l'application est conservé. Ce paquet ajoute uniquement les fichiers d'aide au déploiement et d'exclusion Git.
