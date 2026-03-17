# VPS setup – step by step

Do these on the VPS (SSH as `niki@5.189.136.118`), one step at a time.  
After each step, check that it worked before continuing.

---

## Step 1 – Connect to the VPS

From your Windows machine:

```powershell
cd C:\Users\Nikola Dimovski\eurbanizam-app
.\connect_VPS.bat
```

Or manually:

```bash
ssh -i %USERPROFILE%\.ssh\contabo_nikola niki@5.189.136.118
```

You should see a shell prompt on the VPS (e.g. `niki@...$`).

---

## Step 2 – Clone the repo (first time only)

If the app is not yet on the VPS:

```bash
cd /home/niki
git clone https://github.com/nikdimo/eurbanizam-app.git
cd eurbanizam-app
```

If the repo is already there, skip to Step 3.

---

## Step 3 – Create Python virtualenv and install backend

```bash
cd /home/niki/eurbanizam-app
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
pip install -e .
```

Deactivate is optional for now: `deactivate`.

---

## Step 4 – Create runtime and secrets (first time only)

```bash
mkdir -p /home/niki/.eurbanizam
mkdir -p /home/niki/.eurbanizam/secrets
```

Create the secrets file (edit with your real values if needed):

```bash
nano /home/niki/.eurbanizam/secrets/.eurbanizam_secrets.env
```

Add lines like (adjust as needed):

```
# DB path and other secrets – example:
# EURBANIZAM_DB_PATH=/home/niki/.eurbanizam/db/eurbanizam_local.sqlite
```

Save (Ctrl+O, Enter) and exit (Ctrl+X).  
If the app does not need any env vars yet, you can leave the file empty or with comments only.

---

## Step 5 – Install web dependencies and build

```bash
cd /home/niki/eurbanizam-app/apps/web
npm install
NEXT_TELEMETRY_DISABLED=1 npm run build
cd /home/niki/eurbanizam-app
```

---

## Step 6 – Install systemd services (API + Web)

```bash
sudo cp /home/niki/eurbanizam-app/deploy/vps/eurbanizam-api.service /etc/systemd/system/
sudo cp /home/niki/eurbanizam-app/deploy/vps/eurbanizam-web.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable eurbanizam-api.service eurbanizam-web.service
sudo systemctl start eurbanizam-api.service eurbanizam-web.service
```

Check that both are running:

```bash
sudo systemctl status eurbanizam-api.service
sudo systemctl status eurbanizam-web.service
```

Both should show `active (running)`.

---

## Step 7 – Create Nginx password file (first time only)

The site uses HTTP basic auth. Create a user:

```bash
sudo apt-get install -y apache2-utils
sudo htpasswd -c /etc/nginx/.htpasswd niki
```

Enter the password when prompted. Use this password to log in to https://eurbanizam.easy.mk in the browser.

---

## Step 8 – Install and enable Nginx site

```bash
sudo cp /home/niki/eurbanizam-app/deploy/vps/nginx-eurbanizam-app.conf /etc/nginx/sites-available/eurbanizam-app
sudo ln -sf /etc/nginx/sites-available/eurbanizam-app /etc/nginx/sites-enabled/eurbanizam-app
sudo nginx -t
```

If `nginx -t` says "syntax is ok", reload Nginx:

```bash
sudo systemctl reload nginx
```

---

## Step 9 – Point domain to the VPS (DNS)

In your domain DNS (e.g. eurbanizam.easy.mk), set an **A** record to:

`5.189.136.118`

(If you use a CNAME or another setup, adjust accordingly.)  
Wait for DNS to propagate, then open https://eurbanizam.easy.mk in a browser; you should get the login prompt and then the app.

---

## Step 10 – (Optional) HTTPS with Let’s Encrypt

If you want HTTPS:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d eurbanizam.easy.mk
```

Follow the prompts. Certbot will adjust Nginx and set up auto-renewal.

---

## Later: deploy updates (after first setup)

From your Windows machine:

```powershell
cd C:\Users\Nikola Dimovski\eurbanizam-app
.\git_push.bat
.\pull_to_VPS.bat
```

That pushes to GitHub and runs pull + pip + npm build + service restarts on the VPS.

---

## Quick reference – useful VPS commands

| Task | Command |
|------|---------|
| Restart API | `sudo systemctl restart eurbanizam-api.service` |
| Restart Web | `sudo systemctl restart eurbanizam-web.service` |
| View API logs | `sudo journalctl -u eurbanizam-api.service -f` |
| View Web logs | `sudo journalctl -u eurbanizam-web.service -f` |
| Pull latest code | `cd /home/niki/eurbanizam-app && git pull` |
