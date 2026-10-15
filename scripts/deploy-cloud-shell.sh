#!/usr/bin/env bash
# Run in YOUR Google Cloud Shell. No password or private key is sent to this repository.
set -euo pipefail
nightmess_deploy_dir=$(mktemp -d -t nightmess-deploy-XXXXXX)
git clone --depth 1 https://github.com/SiddharthaAryan/SitaRamam.git "$nightmess_deploy_dir/app"
cd "$nightmess_deploy_dir/app"
if ! npx --yes firebase-tools@14.0.0 projects:list --non-interactive >/dev/null; then
  npx --yes firebase-tools@14.0.0 login --no-localhost
fi
npm ci
npm test
DEPLOY_TARGET=firebase \
VITE_FIREBASE_API_KEY='AIzaSyA6iItMvz02WAa88LbkecUCBvNbvv8f5Dw' \
VITE_FIREBASE_AUTH_DOMAIN='night-mess-90b05.firebaseapp.com' \
VITE_FIREBASE_PROJECT_ID='night-mess-90b05' \
VITE_FIREBASE_APP_ID='1:428703603964:web:67229634b7257aa9760b79' \
VITE_OWNER_LOGIN_EMAIL='aryansiddhartha03@gmail.com' \
VITE_KITCHEN_LOGIN_EMAIL='aryansiddhartha03+nightmesskitchen@gmail.com' \
npm run build
npx --yes firebase-tools@14.0.0 deploy --project night-mess-90b05 --only hosting
