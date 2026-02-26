# Deploying the Scheduler API Worker

The `scheduler-api-worker.js` handles the `/api/availability` and `/api/book` endpoints.

## Setup Steps

### 1. Create the Worker in Cloudflare

```bash
# Deploy the API worker
wrangler deploy scheduler-api-worker.js --name scheduler-api
```

### 2. Set Environment Variables on the Worker

In Cloudflare Dashboard → Workers & Pages → `scheduler-api` → Settings:

**Variables (not secrets):**
- `BASE_URL` = `https://meet.mike.game`
- `EMAIL_WORKER_URL` = `https://scheduler-emailer.mikey-g-sanders.workers.dev`

### 3. Create KV Namespace for Storage

```bash
# Create KV namespace
wrangler kv:namespace create "SCHEDULER_KV"
wrangler kv:namespace create "SCHEDULER_KV" --preview
```

This will give you a KV namespace ID. Update your `wrangler.toml` if needed:

```toml
[[kv_namespaces]]
binding = "SCHEDULER_KV"
id = "your-kv-id-here"
```

### 4. Set Routes in Cloudflare Pages

In Cloudflare Pages → Your project → Settings → Functions:

Add these route bindings:
- **Route pattern**: `meet.mike.game/api/*`
- **Worker**: `scheduler-api`

### 5. Test It

Once deployed:

```bash
# Test availability
curl "https://meet.mike.game/api/availability?date=2026-03-09&meeting_type=gdc-quick-chat"

# Test booking
curl -X POST https://meet.mike.game/api/book \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "company": "Test Corp",
    "role": "Tester",
    "date": "2026-03-09",
    "time": "14:00",
    "timezone": "America/Los_Angeles",
    "meeting_type_id": "gdc-quick-chat",
    "discussion_topics": ["Collaboration"],
    "discussion_details": "Let'"'"'s discuss..."
  }'
```

## What This Worker Does

- **GET /api/availability** - Returns available time slots for a meeting type and date
- **POST /api/book** - Creates a pending meeting request with approval workflow
- Stores pending requests in Cloudflare KV
- Calls the scheduler-emailer worker to notify admin
- Validates dates, times, and meeting type availability

## Notes

- Pending requests are stored for 7 days in KV
- Uses Cloudflare's `crypto.getRandomValues()` for token generation
- CORS headers allow requests from any origin (can be restricted)
- All times are in the meeting's timezone (defaults to Pacific Time)
