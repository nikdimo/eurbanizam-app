# VPS Notes

Expected Linux paths:

- repo: `/home/nikola/eurbanizam-app`
- runtime: `/home/nikola/.eurbanizam`
- secrets env: `/home/nikola/.eurbanizam/secrets/.eurbanizam_secrets.env`

Suggested deploy sequence:

```bash
cd /home/nikola
git clone https://github.com/nikdimo/eurbanizam-app.git
cd eurbanizam-app
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
pip install -e .
cd apps/web
npm install
npm run build
```

Install services:

```bash
sudo cp /home/nikola/eurbanizam-app/deploy/vps/eurbanizam-api.service /etc/systemd/system/
sudo cp /home/nikola/eurbanizam-app/deploy/vps/eurbanizam-web.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now eurbanizam-api.service eurbanizam-web.service
```

Nginx:

```bash
sudo cp /home/nikola/eurbanizam-app/deploy/vps/nginx-eurbanizam-app.conf /etc/nginx/sites-available/eurbanizam-app
sudo ln -sf /etc/nginx/sites-available/eurbanizam-app /etc/nginx/sites-enabled/eurbanizam-app
sudo nginx -t
sudo systemctl reload nginx
```

Before starting email features, restore real SMTP values into `finance_settings.json` on the VPS.
