# Deployment Guide

The scheduler deploys as three Cloudflare pieces: a Pages site (front-end) and two Workers (API + email). All three are already set up for meet.mike.game; this guide covers day-to-day deploys and the one-time setup for reference.

## Day-to-day deploys

### Front-end (Cloudflare Pages)

Push to `master` on GitHub (`urinal-cake/meet.mike.game`). Pages runs `build.sh` (a plain copy of `templates/` and `static/` into `dist/`) and deploys automatically.

```bash
git push origin master
```

If you changed `static/js/scheduler.js` or `static/css/style.css`, bump the `?v=` version query in `templates/index.html` first - assets are cached for a year (see `_headers`). HTML itself is cached for 5 minutes, so changes reach visitors quickly.

### API worker

```bash
npx wrangler deploy --config wrangler-api.toml --env production
```

Deploys `scheduler-api-worker.js` as `scheduler-api` on the route `meet.mike.game/api/*`.

### Email worker

```bash
npx wrangler deploy --env production
```

Deploys `cloudflare-worker.js` as `scheduler-emailer` at `https://scheduler-emailer.mikey-g-sanders.workers.dev`.

Wrangler needs authentication: run `npx wrangler login` (browser flow) or set `CLOUDFLARE_API_TOKEN`.

## One-time setup (reference)

### Pages project

1. Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git.
2. Select the repository, framework preset **None**.
3. Build command: `./build.sh`, output directory: `dist`.
4. Add the custom domain (meet.mike.game) under Custom domains.

No environment variables are needed for the Pages build - the site is fully static.

### API worker (`scheduler-api`)

Configured by `wrangler-api.toml`:

- KV namespace binding `SCHEDULER_KV` (stores pending requests, bookings, reschedule proposals).
- Vars: `BASE_URL`, `EMAIL_WORKER_URL`, `TIME_ZONE`.
- Route: `meet.mike.game/api/*` on the `mike.game` zone.

Secrets (set once):

```bash
npx wrangler secret put GOOGLE_CALENDAR_ID --config wrangler-api.toml --env production
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON --config wrangler-api.toml --env production
npx wrangler secret put EMAIL_WORKER_SECRET --config wrangler-api.toml --env production
```

`EMAIL_WORKER_SECRET` must match the same-named secret on the email worker; it authenticates the API worker's requests to the emailer.

See `GOOGLE_CALENDAR_SETUP.md` for creating the service account.

### Email worker (`scheduler-emailer`)

```bash
npx wrangler secret put RESEND_API_KEY --env production
npx wrangler secret put EMAIL_WORKER_SECRET --env production
```

The Resend domain (mike.game) must be verified with the DKIM/SPF/DMARC records Resend provides. See `EMAIL_SETUP.md`.

## Verifying a deploy

- Pages: Dashboard → Workers & Pages → the Pages project → Deployments (build logs live there), or `npx wrangler pages deployment list --project-name <project>`.
- Workers: `npx wrangler deployments list --config wrangler-api.toml --env production` (and the same without `--config` for the emailer).
- Note: scripted requests to meet.mike.game get a managed bot challenge, so `curl` checks of the live API return HTML. Test in a browser instead.

## Monitoring

- **Emails**: Resend Dashboard → Activity (delivery status, bounces).
- **Workers**: Dashboard → Workers → scheduler-api / scheduler-emailer → Logs & Analytics, or `npx wrangler tail scheduler-api`.
- **Pages builds**: Deployments tab of the Pages project.
