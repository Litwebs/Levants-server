#!/bin/bash
set -Eeuo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: DEPLOY_SHA=<commit-sha> $0 <GitHubRepoURL>"
  exit 1
fi

REPO_URL="$1"
DEPLOY_SHA="${DEPLOY_SHA:-}"
APP_NAME="${APP_NAME:-express-app}"
HEALTH_URL="${HEALTH_URL:-https://api.levantsdairy.co.uk/health}"
BASE_DIR="/root/LWS-Scripts"

if [[ ! "$DEPLOY_SHA" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "ERROR: DEPLOY_SHA must be a complete 40-character Git commit SHA."
  exit 1
fi

DEPLOY_SHA="${DEPLOY_SHA,,}"

if [[ "$REPO_URL" =~ ^https://github\.com/(.*)\.git$ ]]; then
  REPO_URL="git@github.com:${BASH_REMATCH[1]}.git"
fi

PROJECT_DIR="$(basename "$REPO_URL" .git)"
PROJECT_PATH="$BASE_DIR/$PROJECT_DIR"
PREVIOUS_SHA=""
SERVER_DIR=""
ROLLBACK_REQUIRED=0

mkdir -p "$BASE_DIR"
cd "$BASE_DIR"

if [ ! -d "$PROJECT_PATH/.git" ]; then
  git clone --no-checkout "$REPO_URL" "$PROJECT_DIR"
else
  PREVIOUS_SHA="$(git -C "$PROJECT_PATH" rev-parse HEAD 2>/dev/null || true)"
fi

rollback_deployment() {
  ORIGINAL_EXIT_CODE=$?
  trap - ERR
  set +e

  echo "ERROR: Deployment failed."

  if [ "$ROLLBACK_REQUIRED" -eq 1 ] && [ -n "$PREVIOUS_SHA" ]; then
    echo "Rolling back to $PREVIOUS_SHA"

    cd "$PROJECT_PATH"
    git checkout --detach "$PREVIOUS_SHA"

    if [ -d "server" ]; then
      cd server
    elif [ -d "backend" ]; then
      cd backend
    else
      exit "$ORIGINAL_EXIT_CODE"
    fi

    npm ci --omit=dev

    if [ -f "server.js" ]; then
      ROLLBACK_ENTRY="server.js"
    elif [ -f "index.js" ]; then
      ROLLBACK_ENTRY="index.js"
    elif [ -f "app.js" ]; then
      ROLLBACK_ENTRY="app.js"
    else
      exit "$ORIGINAL_EXIT_CODE"
    fi

    pm2 reload "$APP_NAME" --update-env ||
      pm2 start "$ROLLBACK_ENTRY" --name "$APP_NAME"

    pm2 save
    echo "Rollback completed."
  fi

  exit "$ORIGINAL_EXIT_CODE"
}

trap rollback_deployment ERR

cd "$PROJECT_PATH"

echo "Fetching tested commit $DEPLOY_SHA"
git fetch --prune origin main

if ! git cat-file -e "${DEPLOY_SHA}^{commit}" 2>/dev/null; then
  echo "ERROR: Commit $DEPLOY_SHA was not found."
  false
fi

git checkout --detach "$DEPLOY_SHA"
ROLLBACK_REQUIRED=1

ACTUAL_SHA="$(git rev-parse HEAD)"

if [ "$ACTUAL_SHA" != "$DEPLOY_SHA" ]; then
  echo "ERROR: Checked-out commit does not match DEPLOY_SHA."
  false
fi

if [ -d "server" ]; then
  SERVER_DIR="server"
elif [ -d "backend" ]; then
  SERVER_DIR="backend"
else
  echo "ERROR: No server/backend directory found."
  false
fi

cd "$SERVER_DIR"

echo "Installing production dependencies"
npm ci --omit=dev

if [ -f "server.js" ]; then
  ENTRY="server.js"
elif [ -f "index.js" ]; then
  ENTRY="index.js"
elif [ -f "app.js" ]; then
  ENTRY="app.js"
else
  echo "ERROR: No entry file found."
  false
fi

echo "Reloading PM2 application: $APP_NAME"
pm2 reload "$APP_NAME" --update-env ||
  pm2 start "$ENTRY" --name "$APP_NAME"

pm2 save

HEALTHY=0

for ATTEMPT in {1..12}; do
  if curl \
    --fail \
    --silent \
    --show-error \
    --max-time 10 \
    "${HEALTH_URL}?deploy_sha=${DEPLOY_SHA}&attempt=${ATTEMPT}" \
    >/dev/null; then
    HEALTHY=1
    break
  fi

  echo "Health check $ATTEMPT/12 failed; retrying..."
  sleep 5
done

if [ "$HEALTHY" -ne 1 ]; then
  echo "ERROR: Application health check failed."
  false
fi

FINAL_SHA="$(git -C "$PROJECT_PATH" rev-parse HEAD)"

if [ "$FINAL_SHA" != "$DEPLOY_SHA" ]; then
  echo "ERROR: Deployed commit does not match tested commit."
  false
fi

ROLLBACK_REQUIRED=0
trap - ERR

echo "Deployment successful."
echo "Commit: $FINAL_SHA"
echo "Health: $HEALTH_URL"