# Production URL configuration (NEXT_PUBLIC_API_URL)

This doc explains how the frontend gets its API base URL, why production must use the public domain, and how to fix or avoid the “invoice links point to 127.0.0.1” issue in the future.

---

## Reference: servers and paths

| Item | Value |
|------|--------|
| **Public domain** | `https://eurbanizam.easy.mk` |
| **VPS host (IP)** | `5.189.136.118` |
| **VPS SSH** | `niki@5.189.136.118` (key: `~/.ssh/contabo_nikola` on Windows) |
| **Repo on VPS** | `/home/niki/eurbanizam-app` |
| **Runtime on VPS** | `/home/niki/.eurbanizam` |
| **Secrets env on VPS** | `/home/niki/.eurbanizam/secrets/.eurbanizam_secrets.env` |
| **Web app build dir** | `/home/niki/eurbanizam-app/apps/web` |
| **API systemd unit** | `eurbanizam-api.service` → file: `/etc/systemd/system/eurbanizam-api.service` |
| **Web systemd unit** | `eurbanizam-web.service` → file: `/etc/systemd/system/eurbanizam-web.service` |
| **Service templates in repo** | `deploy/vps/eurbanizam-api.service`, `deploy/vps/eurbanizam-web.service` |
| **Nginx site config** | `/etc/nginx/sites-available/eurbanizam-app` (enabled via `sites-enabled`) |
| **Nginx template in repo** | `deploy/vps/nginx-eurbanizam-app.conf` |
| **Deploy script (Windows)** | `tools/pull_to_VPS.ps1` (invoked via `pull_to_VPS.bat`) |
| **Frontend API client** | `apps/web/src/lib/api/client.ts` — uses `NEXT_PUBLIC_API_URL` with fallback |
| **Next.js config** | `apps/web/next.config.ts` — rewrites `/api/*` to `NEXT_PUBLIC_API_URL` |

---

## What the problem was

On the VPS, the web app was generating links (e.g. invoice “view” links) with:

- **URL:** `http://127.0.0.1:8000/api/finance/invoices/{id}/html`
- **Meaning:** `127.0.0.1` = this machine (loopback), `8000` = FastAPI port.

That works only when the request is made **from the server itself**. When a user opens the link in a browser, the browser tries to reach `127.0.0.1` on the **user’s** machine, not the VPS, so the link fails or points to the wrong place.

The correct base URL for the browser is the **public domain** so that Nginx can receive the request and proxy it to the backend:

- **Correct URL:** `https://eurbanizam.easy.mk/api/finance/invoices/{id}/html`

---

## Where the API base URL comes from

1. **Frontend (Next.js)**  
   - Uses `NEXT_PUBLIC_API_URL` (see `apps/web/src/lib/api/client.ts` and `apps/web/next.config.ts`).  
   - If unset, fallback is `http://127.0.0.1:8000` (for local dev).

2. **Build time**  
   - Next.js bakes `NEXT_PUBLIC_*` into the client bundle **at build time**.  
   - Changing the variable only at **runtime** (e.g. in systemd) does **not** change the already-built JS. You must **rebuild** the web app with the correct value.

3. **On the VPS**  
   - The value used at build time is whatever the **build process** sees (e.g. the shell that runs `npm run build`, or the systemd `Environment` if the app were built by a process that reads it).  
   - The **running** web process (systemd) also has `Environment=NEXT_PUBLIC_API_URL=...` in `eurbanizam-web.service`; that affects runtime env for the Node process but does **not** change the already-embedded URL in the built JS.

So for production:

- The **build** must see `NEXT_PUBLIC_API_URL=https://eurbanizam.easy.mk`.
- The **service file** on the VPS should also set `NEXT_PUBLIC_API_URL=https://eurbanizam.easy.mk` for consistency (and for any server-side code that might read it).

---

## How we fixed it (and how to fix it again)

### 1. Set the correct URL in the web service on the VPS

Edit the **installed** systemd unit (not only the repo template):

```bash
sudo nano /etc/systemd/system/eurbanizam-web.service
```

Set:

```ini
Environment=NEXT_PUBLIC_API_URL=https://eurbanizam.easy.mk
```

(Not `http://127.0.0.1:8000`.)

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl restart eurbanizam-web.service
```

### 2. Rebuild the web app with the correct URL

Restarting is not enough; the already-built JS still contains the old URL. Rebuild on the VPS with the variable set:

```bash
cd /home/niki/eurbanizam-app/apps/web
NEXT_PUBLIC_API_URL=https://eurbanizam.easy.mk NEXT_TELEMETRY_DISABLED=1 npm run build
cd /home/niki/eurbanizam-app
sudo systemctl restart eurbanizam-web.service
```

### 3. Verify

- In the browser, open an invoice “view” link and check the address bar: it should show  
  `https://eurbanizam.easy.mk/api/finance/invoices/<id>/html`  
  not `http://127.0.0.1:8000/...`.
- From the VPS you can also:  
  `curl -s -o /dev/null -w "%{http_code}" https://eurbanizam.easy.mk/api/finance/invoices/2/html`  
  (expect 200 or similar; 405 for HEAD is normal if the endpoint only allows GET with body).

---

## Making sure future deploys keep the correct URL

The deploy script runs `npm run build` on the VPS over SSH. That shell does **not** automatically read the systemd `Environment`, so if we don’t pass the URL, the build can again use the default `http://127.0.0.1:8000`.

In **`tools/pull_to_VPS.ps1`** the remote build step is:

```bash
NEXT_PUBLIC_API_URL=https://eurbanizam.easy.mk NEXT_TELEMETRY_DISABLED=1 npm run build
```

So every deploy from `pull_to_VPS.bat` bakes the production URL into the app. Do not remove `NEXT_PUBLIC_API_URL=https://eurbanizam.easy.mk` from that line.

---

## Nginx (for context)

Nginx on the VPS serves the public domain and proxies to local services:

- **Site config:** `/etc/nginx/sites-available/eurbanizam-app` (symlinked in `sites-enabled`).
- **`/`** → `http://127.0.0.1:3000` (Next.js).
- **`/api/`** → `http://127.0.0.1:8000` (FastAPI).

So the browser only talks to `https://eurbanizam.easy.mk`; Nginx forwards to the right internal port. The frontend must therefore use the public base URL `https://eurbanizam.easy.mk`, not `http://127.0.0.1:8000`.

To inspect the effective Nginx config on the VPS:

```bash
sudo nginx -T
```

---

## Repo template vs installed service

- **Repo:** `deploy/vps/eurbanizam-web.service` is a template and may still show `NEXT_PUBLIC_API_URL=http://127.0.0.1:8000` for local/dev reference.
- **VPS:** The **installed** file `/etc/systemd/system/eurbanizam-web.service` is outside the repo. After you fix it once (and set the production URL), it stays that way until you overwrite it (e.g. by copying the template again). So normal `git pull` + `pull_to_VPS.bat` does **not** overwrite the fix.

If you ever re-copy the service file from the repo to the VPS:

```bash
sudo cp /home/niki/eurbanizam-app/deploy/vps/eurbanizam-web.service /etc/systemd/system/
```

then you must edit `/etc/systemd/system/eurbanizam-web.service` again and set `NEXT_PUBLIC_API_URL=https://eurbanizam.easy.mk`, then rebuild the web app and restart the service as above.

---

## Short checklist (production URL wrong again)

1. **Edit** `/etc/systemd/system/eurbanizam-web.service` →  
   `Environment=NEXT_PUBLIC_API_URL=https://eurbanizam.easy.mk`
2. **Reload & restart:**  
   `sudo systemctl daemon-reload && sudo systemctl restart eurbanizam-web.service`
3. **Rebuild web app with URL:**  
   `cd /home/niki/eurbanizam-app/apps/web`  
   `NEXT_PUBLIC_API_URL=https://eurbanizam.easy.mk NEXT_TELEMETRY_DISABLED=1 npm run build`
4. **Restart web again:**  
   `sudo systemctl restart eurbanizam-web.service`
5. **Verify** in browser: invoice link should show `https://eurbanizam.easy.mk/...`.
