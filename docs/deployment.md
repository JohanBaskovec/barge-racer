# Deployment (Cloudflare)

Cloudflare builds and deploys the game every time `main` is updated, through its
Git integration. Nothing in this repository needs secrets.

## One-time setup

1. In the Cloudflare dashboard: **Workers & Pages → Create → Import a repository**,
   and pick this repository.
2. Build command: `npm run build`. Deploy command: `npx wrangler deploy`.
   Production branch: `main`.

The game is then live at `https://barge-racer.<your-subdomain>.workers.dev`. (The Worker
keeps its original name `barge-racer`: the name in `wrangler.jsonc` must match the Worker
connected in the Cloudflare dashboard. Rename both together, or add a custom domain.)
Other branches get preview URLs. A custom domain can be added in the dashboard
under the Worker's **Settings → Domains & Routes**.

`wrangler.jsonc` tells Cloudflare to serve the built `dist/` folder.

## Deploying by hand (optional)

```bash
npx wrangler login
npm run deploy
```
