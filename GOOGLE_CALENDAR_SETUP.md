# Google Calendar Integration

The API worker (`scheduler-api-worker.js`) reads and writes Google Calendar directly using a service account:

- **Availability**: free/busy for the requested date blocks conflicting slots.
- **Approval**: creates the calendar event (this is the source of truth for booked time).
- **Cancel / reschedule**: deletes and recreates events by stored event ID.
- **One-per-day meals**: checks event titles to limit lunch/coffee/dinner to one each per day.

Authentication is a service-account JWT signed in the worker (no OAuth flow, no Go code involved).

## Setup

### 1. Create a Google Cloud project and enable the Calendar API

1. https://console.cloud.google.com → Create Project.
2. APIs & Services → Enable APIs → enable **Google Calendar API**.

### 2. Create a service account and key

1. APIs & Services → Credentials → Create Credentials → **Service Account**.
2. After creating it, open the account → Keys → Add Key → **JSON**. Download the key file and keep it out of git.

### 3. Share your calendar with the service account

1. Find `client_email` in the key JSON (`...@...iam.gserviceaccount.com`).
2. In Google Calendar settings for the target calendar, share it with that email using **"Make changes to events"** permission (the worker creates and deletes events, so read-only is not enough).

### 4. Configure the worker

Set both values as secrets on the API worker:

```bash
npx wrangler secret put GOOGLE_CALENDAR_ID --config wrangler-api.toml --env production
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON --config wrangler-api.toml --env production
```

- `GOOGLE_CALENDAR_ID`: the calendar's ID (for a primary calendar, its email address).
- `GOOGLE_SERVICE_ACCOUNT_JSON`: the entire key file contents as one value.

The worker also uses the `TIME_ZONE` var (`Europe/Berlin`) from `wrangler-api.toml` when converting between wall-clock and UTC.

## Behavior without credentials

If `GOOGLE_CALENDAR_ID` is not configured, the worker degrades gracefully: availability ignores the calendar (all schedule-rule slots show as free) and event creation is skipped with a console warning. Bookings and emails still work.

## Troubleshooting

- **"Permission denied" / events not created**: the calendar must be shared with the service-account email with edit rights.
- **"Invalid credential"**: `GOOGLE_SERVICE_ACCOUNT_JSON` must be the complete, untruncated JSON.
- **Slots never blocked**: check `npx wrangler tail scheduler-api` while loading availability; errors from the free/busy call are logged and swallowed.
- **Duplicate meal bookings allowed**: the one-per-day check matches event titles like `Gamescom: Let's Grab Lunch! - <name>`; renaming events in Google Calendar breaks that match.
