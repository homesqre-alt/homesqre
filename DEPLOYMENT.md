# Homesqre — VPS Deployment Guide

Complete step-by-step guide to deploy Homesqre on your **Hostinger Ubuntu 24.04 KVM VPS** with GitHub Actions CI/CD.

---

## Architecture

```
Internet (80 / 443)
        │
   [Host Nginx + SSL]          ← certbot manages Let's Encrypt certs
        │
   127.0.0.1:3000
        │
  [Frontend Container]         ← Nginx serves React SPA
  /api/* ──────────────────►  [Backend Container :8001]  ← FastAPI / Uvicorn
                                        │
                                [Host MongoDB :27017]     ← runs on VPS directly
```

---

## One-Time VPS Setup

### 1. SSH into your VPS
```bash
ssh root@YOUR_VPS_IP
```

### 2. Verify Docker is running
```bash
docker --version
docker compose version
```

### 3. Ensure MongoDB is running
```bash
systemctl status mongod
# If not running:
systemctl enable mongod && systemctl start mongod
```

### 4. Clone the repository
```bash
git clone https://github.com/homesqre-alt/homesqre.git /root/homesqre-app
cd /root/homesqre-app
```

### 5. Create the build-time `.env` file
This file is read by `docker-compose.prod.yml` at build time.

```bash
cat > /root/homesqre-app/.env << 'EOF'
REACT_APP_BACKEND_URL=https://yourdomain.com
REACT_APP_GOOGLE_CLIENT_ID=792218859682-0c3n97260bmmnihocosutpm00vvliivt.apps.googleusercontent.com
EOF
```

Replace `yourdomain.com` with your actual domain.

### 6. Create the backend production secrets
```bash
cp /root/homesqre-app/backend/.env.prod.example /root/homesqre-app/backend/.env.prod
nano /root/homesqre-app/backend/.env.prod
```

Fill in ALL values — especially:
- `JWT_SECRET` — generate with: `openssl rand -hex 32`
- `ADMIN_PASSWORD` — strong password for admin@homesqre.com
- `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` — live keys from Razorpay dashboard
- `EMERGENT_LLM_KEY` — from your Emergent profile

### 7. Set up Nginx on the host
```bash
# Install Nginx if not present
apt install -y nginx

# Copy the config (replace YOUR_DOMAIN with your actual domain)
cp /root/homesqre-app/nginx/homesqre.conf /etc/nginx/sites-available/homesqre
sed -i 's/YOUR_DOMAIN/yourdomain.com/g' /etc/nginx/sites-available/homesqre

# Enable the site
ln -sf /etc/nginx/sites-available/homesqre /etc/nginx/sites-enabled/homesqre
rm -f /etc/nginx/sites-enabled/default

# Test and reload
nginx -t && systemctl reload nginx
```

### 8. Get SSL certificate (Let's Encrypt)
```bash
apt install -y certbot python3-certbot-nginx

certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Auto-renewal is set up automatically. Test it:
certbot renew --dry-run
```

### 9. First deployment
```bash
cd /root/homesqre-app
docker compose -f docker-compose.prod.yml up -d --build
```

Check it's running:
```bash
docker compose -f docker-compose.prod.yml ps
curl http://localhost:3000           # frontend
curl http://localhost:8001/api/      # backend health
```

---

## GitHub Actions CI/CD Setup

Every push to `main` will automatically deploy to your VPS.

### Add GitHub Secrets

Go to: **GitHub repo → Settings → Secrets and variables → Actions → New repository secret**

| Secret name | Value |
|-------------|-------|
| `VPS_IP` | Your VPS IP address |
| `VPS_USER` | `root` (or your SSH username) |
| `VPS_SSH_KEY` | Your **private** SSH key (see below) |
| `VPS_PORT` | `22` (or your custom SSH port) |

### Generate an SSH key pair for GitHub Actions

On your **local machine** (or anywhere):
```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/homesqre_deploy
```

This creates:
- `~/.ssh/homesqre_deploy` — **private key** (add to GitHub secret `VPS_SSH_KEY`)
- `~/.ssh/homesqre_deploy.pub` — **public key** (add to VPS)

### Add the public key to your VPS
```bash
# On your VPS:
echo "PASTE_PUBLIC_KEY_HERE" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

### Copy the private key to GitHub
```bash
# On your local machine:
cat ~/.ssh/homesqre_deploy
# Copy the entire output (including -----BEGIN and -----END lines)
# Paste it as the VPS_SSH_KEY secret in GitHub
```

### Test the workflow
Push any small change to `main`:
```bash
git commit --allow-empty -m "trigger deploy"
git push origin main
```

Watch the **Actions** tab in your GitHub repo. Each deploy takes ~3-5 minutes.

---

## Rollback

To roll back to a previous deployment:
```bash
cd /root/homesqre-app
git log --oneline -10                    # find the commit hash
git reset --hard <COMMIT_HASH>
docker compose -f docker-compose.prod.yml up -d --build
```

---

## Useful Commands on VPS

```bash
# View running containers
docker compose -f docker-compose.prod.yml ps

# View backend logs (live)
docker logs -f homesqre_backend

# View frontend logs
docker logs -f homesqre_frontend

# Restart a specific service
docker compose -f docker-compose.prod.yml restart backend

# Stop everything
docker compose -f docker-compose.prod.yml down

# Check MongoDB
mongosh homesqre --eval "db.users.countDocuments()"
```

---

## Files Created

| File | Purpose |
|------|---------|
| `docker-compose.prod.yml` | Production container orchestration |
| `backend/Dockerfile` | FastAPI container image |
| `frontend/Dockerfile` | React build + Nginx container image |
| `frontend/default.conf` | Nginx config (SPA + /api proxy) |
| `nginx/homesqre.conf` | Host Nginx config (SSL + reverse proxy) |
| `backend/.env.prod.example` | Template for production secrets |
| `.github/workflows/deploy.yml` | GitHub Actions CI/CD pipeline |

---

## Security Checklist

- [ ] `backend/.env.prod` is on VPS only, **never committed to git**
- [ ] `.env` (build-time vars) is on VPS only, **never committed to git**
- [ ] MongoDB binds to `127.0.0.1` only (not exposed externally)
- [ ] Backend container port NOT exposed to public (internal Docker network only)
- [ ] SSL certificate obtained via Certbot
- [ ] `SEED_DEMO_USERS=false` in production `.env.prod`
- [ ] Strong `ADMIN_PASSWORD` set
