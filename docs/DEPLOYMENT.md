# Deployment

## Current setup (as of 9 Oct 2026)

| Item | Value |
|---|---|
| Vercel project | `kbm-crusher-monitor` (team `kmb-jaw`) |
| Production URL | https://kbm-crusher-monitor.vercel.app |
| Git connection | **None.** The project is not linked to GitHub; deployments were created through the Vercel API from branch `claude/great-sagan-lr6qih`. Pushing to GitHub does **not** deploy. |
| Live production deployment | `dpl_G91abh1sfaH9LHbJdM1GnQutWzZp` — commit `9e66e12`, app v1.1.1 |
| Earlier good deployment | `dpl_2rmAnN2NCr9yxNAFAdm9vn31gbrV` — commit `6761ba1` |
| Repository `main` | Only the initial README. All app code is in PR #1. |
| Deployment protection | Vercel Authentication on preview/deployment URLs; production domain public. |

## Rollback (works today, no Git needed)

Vercel dashboard → `kbm-crusher-monitor` → **Deployments** → `dpl_G91abh1sfaH9LHbJdM1GnQutWzZp`
→ **⋯ → Instant Rollback** (or **Promote to Production**). The production domain switches back
within seconds; nothing is rebuilt. The source of that build is also kept in git as tag
`live-v1.1.1` (commit `9e66e12`).

After a rollback, installed apps fetch the older service worker on their next visit. Users may
need to reload twice to see the older version.

## Moving to GitHub → Vercel (needs owner approval)

1. **Review & merge PR #1** into `main` (GitHub → PR #1 → *Ready for review* → *Merge*).
   *Effect:* `main` contains the app. No deployment yet, because Vercel is not linked.
2. **Connect the repository in Vercel** (Project → Settings → Git → *Connect Git Repository* →
   `KBMjaw/Crusher-KBM-AI-Dashboard`). Keep **Production Branch = `main`**.
   Build settings: Framework *Other*, Build Command empty, Output Directory `.`, Install Command empty.
   *Effect:* connecting creates no production deployment by itself.
3. **First Git deployment:** the next push to `main` (or *Redeploy* of the merge commit) builds
   production from `main`. Verify the deployment is *Ready*, open the production URL, run the checks
   below, and keep the rollback above at hand.
4. From then on: feature branch → PR (Vercel preview URL per PR) → merge to `main` → production.

## Post-deployment checks

- Open the production URL. Log in. Check Dashboard, Machine (Empty-only manual + PIN), Analytics →
  Audit Log, then download one report.
- If an older version was open: within ~30 min (or when the app is brought back to the front) the
  **"New version available — Reload"** banner appears.
- Installed PWA on Android/Windows: open it, then confirm it updates via the banner.
  This has **not yet been verified on real devices**.
