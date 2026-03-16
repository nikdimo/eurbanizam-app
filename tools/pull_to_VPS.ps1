Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$keyPath = Join-Path $env:USERPROFILE ".ssh\contabo_nikola"
$hostName = "niki@5.189.136.118"
$repoPath = "/home/niki/eurbanizam-app"
$apiService = "eurbanizam-api.service"
$webService = "eurbanizam-web.service"
$botService = "eurbanizam-bot.service"

$requestedBranch = ""
$restartBot = $false
$skipDeps = $false
$withPlaywright = $false
$skipWebBuild = $false
$dryRun = $false
$interactiveSudo = $true

function Show-Help {
    @"
Usage:
  pull_to_VPS.bat [options]

Options:
  --branch <name>       Pull a specific branch on the VPS.
  --restart-bot         Restart eurbanizam-bot.service after deploy.
  --skip-deps           Skip Python package installation.
  --with-playwright     Run playwright install --with-deps after pip install.
  --skip-web-build      Skip npm install/build even if the web service exists.
  --non-interactive     Fail instead of prompting for sudo on the VPS.
  --dry-run             Print the remote deploy script without connecting.
  --help                Show this help text.
"@ | Write-Host
}

for ($index = 0; $index -lt $args.Count; $index++) {
    $arg = [string]$args[$index]
    switch ($arg) {
        "--branch" {
            if ($index + 1 -ge $args.Count) {
                throw "Missing branch name after --branch."
            }

            $index++
            $requestedBranch = [string]$args[$index]
        }
        "--restart-bot" {
            $restartBot = $true
        }
        "--skip-deps" {
            $skipDeps = $true
        }
        "--with-playwright" {
            $withPlaywright = $true
        }
        "--skip-web-build" {
            $skipWebBuild = $true
        }
        "--non-interactive" {
            $interactiveSudo = $false
        }
        "--dry-run" {
            $dryRun = $true
        }
        "--help" {
            Show-Help
            exit 0
        }
        default {
            throw "Unknown option: $arg"
        }
    }
}

if (-not (Test-Path $keyPath)) {
    throw "SSH key not found: $keyPath"
}

$null = Get-Command ssh -ErrorAction Stop

$remoteScript = @'
#!/usr/bin/env bash
set -euo pipefail

REPO_PATH="__REPO_PATH__"
REQUESTED_BRANCH="__REQUESTED_BRANCH__"
SKIP_DEPS="__SKIP_DEPS__"
WITH_PLAYWRIGHT="__WITH_PLAYWRIGHT__"
RESTART_BOT="__RESTART_BOT__"
SKIP_WEB_BUILD="__SKIP_WEB_BUILD__"
API_SERVICE="__API_SERVICE__"
WEB_SERVICE="__WEB_SERVICE__"
BOT_SERVICE="__BOT_SERVICE__"
INTERACTIVE_SUDO="__INTERACTIVE_SUDO__"

log() {
  echo "[VPS] $*"
}

unit_is_loaded() {
  local unit="$1"
  local load_state
  load_state="$(systemctl show "$unit" --property LoadState --value 2>/dev/null || true)"
  [ "$load_state" = "loaded" ]
}

find_python() {
  if [ -x "$REPO_PATH/.venv/bin/python" ]; then
    echo "$REPO_PATH/.venv/bin/python"
  elif [ -x "$REPO_PATH/venv/bin/python" ]; then
    echo "$REPO_PATH/venv/bin/python"
  elif command -v python3 >/dev/null 2>&1; then
    echo "python3"
  else
    echo "python"
  fi
}

restart_if_loaded() {
  local unit="$1"
  local label="$2"
  if ! unit_is_loaded "$unit"; then
    log "Skipping $label ($unit not installed)"
    return 0
  fi

  log "Restarting $label ($unit)"
  if sudo -n true >/dev/null 2>&1; then
    sudo -n systemctl restart "$unit"
  elif [ "$INTERACTIVE_SUDO" = "1" ]; then
    log "sudo requires a password for $unit"
    sudo systemctl restart "$unit"
  else
    log "sudo requires a password for $unit; re-run without --non-interactive or configure NOPASSWD sudo"
    return 1
  fi
  log "$unit is $(systemctl is-active "$unit")"
}

cd "$REPO_PATH"
git fetch --all --prune

if [ -n "$REQUESTED_BRANCH" ]; then
  TARGET_BRANCH="$REQUESTED_BRANCH"
  CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  if [ "$CURRENT_BRANCH" != "$TARGET_BRANCH" ]; then
    if git show-ref --verify --quiet "refs/heads/$TARGET_BRANCH"; then
      git checkout "$TARGET_BRANCH"
    else
      git checkout --track "origin/$TARGET_BRANCH"
    fi
  fi
else
  TARGET_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  if [ "$TARGET_BRANCH" = "HEAD" ]; then
    log "Remote repo is in detached HEAD. Re-run with --branch <name>."
    exit 1
  fi
fi

log "Pulling origin/$TARGET_BRANCH in $REPO_PATH"
git pull --ff-only origin "$TARGET_BRANCH"
log "Now at commit $(git rev-parse --short HEAD)"
git status -sb

if [ "$SKIP_DEPS" != "1" ]; then
  PYTHON_BIN="$(find_python)"
  log "Installing Python dependencies with $PYTHON_BIN"
  "$PYTHON_BIN" -m pip install -r "$REPO_PATH/requirements.txt"

  if [ -f "$REPO_PATH/pyproject.toml" ] || [ -f "$REPO_PATH/setup.py" ]; then
    log "Installing editable package from $REPO_PATH"
    "$PYTHON_BIN" -m pip install -e "$REPO_PATH"
  else
    log "Skipping editable install (no pyproject.toml or setup.py)"
  fi

  if [ "$WITH_PLAYWRIGHT" = "1" ]; then
    log "Ensuring Playwright browsers and Linux dependencies are installed"
    "$PYTHON_BIN" -m playwright install --with-deps
  fi
else
  log "Skipping pip install steps"
fi

if unit_is_loaded "$WEB_SERVICE"; then
  if [ "$SKIP_WEB_BUILD" = "1" ]; then
    log "Skipping web build"
  elif [ -f "$REPO_PATH/apps/web/package.json" ]; then
    if ! command -v npm >/dev/null 2>&1; then
      log "npm is required to build the web app but was not found"
      exit 1
    fi

    log "Installing web dependencies"
    cd "$REPO_PATH/apps/web"
    if [ -f "$REPO_PATH/apps/web/package-lock.json" ]; then
      npm ci
    else
      npm install
    fi

    log "Building web app"
    NEXT_TELEMETRY_DISABLED=1 npm run build
    cd "$REPO_PATH"
  else
    log "Skipping web build (apps/web/package.json not found)"
  fi
else
  log "Skipping web build (web service not installed)"
fi

restart_if_loaded "$API_SERVICE" "api service"
restart_if_loaded "$WEB_SERVICE" "web service"

if [ "$RESTART_BOT" = "1" ]; then
  restart_if_loaded "$BOT_SERVICE" "bot service"
else
  log "Bot restart not requested"
fi

log "Deploy completed"
'@

$replacements = @{
    "__REPO_PATH__" = $repoPath
    "__REQUESTED_BRANCH__" = $requestedBranch
    "__SKIP_DEPS__" = $(if ($skipDeps) { "1" } else { "0" })
    "__WITH_PLAYWRIGHT__" = $(if ($withPlaywright) { "1" } else { "0" })
    "__RESTART_BOT__" = $(if ($restartBot) { "1" } else { "0" })
    "__SKIP_WEB_BUILD__" = $(if ($skipWebBuild) { "1" } else { "0" })
    "__INTERACTIVE_SUDO__" = $(if ($interactiveSudo) { "1" } else { "0" })
    "__API_SERVICE__" = $apiService
    "__WEB_SERVICE__" = $webService
    "__BOT_SERVICE__" = $botService
}

foreach ($entry in $replacements.GetEnumerator()) {
    $remoteScript = $remoteScript.Replace($entry.Key, $entry.Value)
}

# Normalize to LF before sending to the Linux host.
$remoteScript = $remoteScript -replace "`r`n", "`n"

if ($dryRun) {
    Write-Host "[LOCAL] SSH target: $hostName"
    Write-Host "[LOCAL] Key: $keyPath"
    Write-Host ""
    Write-Host $remoteScript
    exit 0
}

Write-Host "[LOCAL] Deploying to $hostName"
$remoteTempPath = "/tmp/eurbanizam_deploy_$([guid]::NewGuid().ToString('N')).sh"
$uploadCommand = "cat > '$remoteTempPath' && chmod 700 '$remoteTempPath'"
$executeCommand = "bash '$remoteTempPath'; rc=`$?; rm -f '$remoteTempPath'; exit `$rc"

$remoteScript | & ssh -i $keyPath $hostName $uploadCommand
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

& ssh -tt -i $keyPath $hostName $executeCommand
exit $LASTEXITCODE

