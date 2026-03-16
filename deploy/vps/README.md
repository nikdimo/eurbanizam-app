# VPS Notes

Expected Linux paths:

- repo: `/home/niki/eurbanizam-app`
- runtime: `/home/niki/.eurbanizam`
- secrets env: `/home/niki/.eurbanizam/secrets/.eurbanizam_secrets.env`

Suggested deploy sequence:

```bash
cd /home/niki
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
sudo cp /home/niki/eurbanizam-app/deploy/vps/eurbanizam-api.service /etc/systemd/system/
sudo cp /home/niki/eurbanizam-app/deploy/vps/eurbanizam-web.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now eurbanizam-api.service eurbanizam-web.service
```

Nginx:

```bash
sudo cp /home/niki/eurbanizam-app/deploy/vps/nginx-eurbanizam-app.conf /etc/nginx/sites-available/eurbanizam-app
sudo ln -sf /etc/nginx/sites-available/eurbanizam-app /etc/nginx/sites-enabled/eurbanizam-app
sudo nginx -t
sudo systemctl reload nginx
```
