# Gmail Companion

Crée une application web qui affiche mes emails Gmail en temps quasi-réel.

Fonctionnalités :

1. Page de connexion avec bouton "Se connecter avec Google" (OAuth Gmail, scope lecture email + brouillons)

2. Page principale "Inbox" qui liste les emails non lus, avec pour chacun :

   - Expéditeur, objet, date

   - Un badge "À traiter" ou "Automatique" (filtré : ignorer les emails dont l'expéditeur contient no-reply, notifications, security, ou dont le sujet contient welcome/new sign-in/newsletter)

3. Pour chaque email "À traiter", un bouton "Générer une réponse" qui appelle une fonction backend envoyant l'email à l'API Groq (modèle llama-3.1-8b-instant) avec ce prompt : "Rédige une proposition de réponse professionnelle et concise en français (max 150 mots) à cet email : [contenu email]"

4. La réponse générée s'affiche dans une zone éditable sous l'email, avec un bouton "Copier" et un bouton "Sauvegarder comme brouillon Gmail"

5. La liste des emails se rafraîchit automatiquement toutes les 2 minutes (polling), avec un indicateur visuel discret pendant le rafraîchissement

6. Utilise Supabase comme backend pour stocker le token OAuth et les brouillons générés

Design : interface épurée, liste façon "boîte de réception", cartes emails avec badges de statut colorés.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/ac2aab2e-310d-4895-9a61-61ada8b0f7e2).

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
