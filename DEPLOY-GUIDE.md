# SARAS ERP v2 — Deployment Protocol (Supabase + Vercel)

## Prerequisites
- Your GitHub repo: `https://github.com/sarasjaipur2026-stack/saras-erp-v2.git`
- Supabase project: `kcnujpvzewtuttfcrtyz` (already set up with all tables + migrations)
- A Vercel account (free tier works)

---

## STEP 1: Push Latest Code to GitHub

Open a terminal in the `saras-erp-v2` folder on your computer and run:

```bash
cd saras-erp-v2
git add -A
git commit -m "v2 rewrite: Order module + Masters + Import + Settings"
git push origin main
```

If `git push` asks for authentication, use a GitHub Personal Access Token (not your password):
- Go to https://github.com/settings/tokens → Generate new token (classic) → Select `repo` scope → Copy the token
- Use it as your password when git asks

---

## STEP 2: Deploy to Vercel

### Option A: Vercel Dashboard (Easiest)

1. Go to https://vercel.com and sign in with your GitHub account
2. Click **"Add New Project"**
3. Select your repo: `sarasjaipur2026-stack/saras-erp-v2`
4. Vercel will auto-detect Vite. Verify these settings:
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** `npm install`
5. Click **"Environment Variables"** and add:
   - `VITE_SUPABASE_URL` = `https://kcnujpvzewtuttfcrtyz.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = (your anon key from .env file)
6. Click **"Deploy"**
7. Wait 1-2 minutes. You'll get a live URL like `saras-erp-v2.vercel.app`

### Option B: Vercel CLI (From Terminal)

```bash
npm install -g vercel
cd saras-erp-v2
vercel login
vercel
```

Follow the prompts:
- Set up and deploy? **Y**
- Which scope? **Your account**
- Link to existing project? **N**
- Project name? **saras-erp-v2**
- Directory? **./dist** (or leave default, Vercel detects Vite)
- Override settings? **N**

Then add environment variables:
```bash
vercel env add VITE_SUPABASE_URL
# Paste: https://kcnujpvzewtuttfcrtyz.supabase.co

vercel env add VITE_SUPABASE_ANON_KEY
# Paste: your anon key

vercel --prod
```

---

## STEP 3: Configure Supabase for Production

### 3a. Set Allowed Redirect URLs

1. Go to https://supabase.com/dashboard/project/kcnujpvzewtuttfcrtyz/auth/url-configuration
2. Under **Site URL**, set: `https://your-app.vercel.app`
3. Under **Redirect URLs**, add:
   - `https://your-app.vercel.app/**`
   - `http://localhost:5173/**` (keep for local dev)
4. Click **Save**

### 3b. Enable Row Level Security (Already Done)

Your migrations already enabled RLS on all tables. Verify at:
https://supabase.com/dashboard/project/kcnujpvzewtuttfcrtyz/auth/policies

### 3c. Create Your First User

1. Go to https://supabase.com/dashboard/project/kcnujpvzewtuttfcrtyz/auth/users
2. Click **"Add User"** → **"Create New User"**
3. Enter your email and password
4. This creates the admin user that can log into the ERP

---

## STEP 4: Set Up SPA Routing on Vercel

React Router needs all routes to serve `index.html`. Create this file in your project root:

**File: `vercel.json`**
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

Then push and redeploy:
```bash
git add vercel.json
git commit -m "Add Vercel SPA routing config"
git push origin main
```

Vercel will auto-redeploy on push.

---

## STEP 5: Verify Everything Works

1. Open your Vercel URL (e.g., `https://saras-erp-v2.vercel.app`)
2. You should see the login page
3. Log in with the user you created in Step 3c
4. Check: Dashboard, Orders, Masters, Settings, Import pages all load
5. Try creating a test order

---

## Ongoing: Auto-Deploy on Every Push

Once connected, every `git push origin main` automatically triggers a new Vercel deployment. No manual steps needed.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Blank page after deploy | Check `vercel.json` SPA rewrite is in place |
| "Invalid API key" error | Verify env vars in Vercel dashboard → Settings → Environment Variables |
| Login doesn't work | Check Supabase Auth → URL Configuration has your Vercel domain |
| 404 on page refresh | The `vercel.json` rewrite is missing |
| Build fails on Vercel | Run `npm run build` locally first to check for errors |
| CORS errors | Add your Vercel domain to Supabase → Settings → API → Additional allowed origins |

---

## Costs

- **Vercel Free Tier**: Unlimited deploys, custom domain, HTTPS — free for personal projects
- **Supabase Free Tier**: 500MB database, 1GB storage, 50K monthly active users — free
- **Custom Domain**: Optional. In Vercel dashboard → Settings → Domains → Add your domain
