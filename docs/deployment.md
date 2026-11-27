# Deployment (Cloudflare)

Barge Racer builds to a static site (`dist/`), deployed as a **Cloudflare Worker
with static assets**. No server code, no database. Cloudflare's free plan is
enough.

Files involved:

| File | Purpose |
| --- | --- |
| `wrangler.jsonc` | Worker name (`barge-racer`) and the assets directory (`./dist`) |
| `public/_headers` | Cache rules: `/assets/*` is immutable, `index.html` is always revalidated |
| `.github/workflows/ci.yml` | Type-check, tests and build on every branch and pull request |
| `.github/workflows/deploy.yml` | Tests, then deploys on every update of `main` |

The game will be live at `https://barge-racer.<your-subdomain>.workers.dev`
unless you attach a custom domain.

## Option 1: deploy from your computer (quickest)

```bash
npm install
npx wrangler login      # opens a browser once
npm run deploy          # builds, then uploads dist/
```

`npm run deploy:preview` uploads a new version without making it live, and
`npm run cf:dev` serves the production build locally the way Cloudflare will.

## Option 2: Cloudflare Git integration (no CI config needed)

1. Cloudflare dashboard, **Workers & Pages**, **Create**, **Import a repository**,
   and pick this GitHub repository.
2. Build command: `npm run build`. Deploy command: `npx wrangler deploy`.
3. Production branch: `main`. Other branches get preview URLs.

Cloudflare then rebuilds on every push.

## Option 3: GitHub Actions (deploys on every update of `main`)

`.github/workflows/deploy.yml` runs on every push to `main`, which includes a
merged pull request. It runs the type-check and tests, builds, then runs
`wrangler deploy`. If a test fails nothing is deployed. Deploys never overlap,
and you can also start one by hand from the Actions tab (**Run workflow**).
Other branches and pull requests only run the checks in `ci.yml`.

One-time setup:

1. Add two repository secrets (Settings, Secrets and variables, Actions):
   - `CLOUDFLARE_ACCOUNT_ID`: shown on the Workers & Pages overview page.
   - `CLOUDFLARE_API_TOKEN`: create one from the **Edit Cloudflare Workers**
     template under My Profile, API Tokens.
2. Get the code onto `main` (merge a pull request or push to it). The first run
   creates the `barge-racer` Worker if it doesn't exist yet.

Use either option 2 or option 3, not both, or every push deploys twice.

## Custom domain

Add it in the dashboard under the Worker, Settings, Domains & Routes (the domain
must be on Cloudflare DNS), or add this to `wrangler.jsonc`:

```jsonc
"routes": [{ "pattern": "barge-racer.example.com", "custom_domain": true }]
```

## Notes

- The Vite `base` is `./`, so the build also works under a sub-path.
- Phaser is split into its own chunk (`vite.config.ts`), so after a new release
  returning players re-download only the small game chunk (about 20 KB gzipped).
- When audio and image assets are added, put them in `public/assets/`; they are
  covered by the same immutable-cache rule only if their filenames change when
  their content changes. Otherwise add a shorter rule to `public/_headers`.
- If the app later needs a backend (shared best times, ghosts), add a `main`
  script and bindings (D1, KV) to the same Worker.
