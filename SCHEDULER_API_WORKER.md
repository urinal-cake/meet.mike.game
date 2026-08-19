# Scheduler API Worker

`scheduler-api-worker.js` deploys as the `scheduler-api` Worker on `meet.mike.game/api/*`. It owns the meeting-type schedule, availability rules, the approval workflow, and all Google Calendar writes. State lives in the `SCHEDULER_KV` namespace.

## Deploy

```bash
npx wrangler deploy --config wrangler-api.toml --env production
```

Config in `wrangler-api.toml`: KV binding, `BASE_URL`, `EMAIL_WORKER_URL`, `TIME_ZONE`, and the route. Secrets: `GOOGLE_CALENDAR_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON` (see `GOOGLE_CALENDAR_SETUP.md`).

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/availability?date&meeting_type[&exclude_token]` | Slot list for a date; `exclude_token` ignores that booking's own slot (rescheduling) |
| POST | `/api/book` | Create a pending request; emails the admin a review link |
| GET | `/api/admin/request?token` | Load a request for the review page |
| POST | `/api/admin/approve` | Approve (optional `newDate`/`newTime`/`location`/`forceApprove`); creates the calendar event and sends confirmations |
| POST | `/api/admin/acknowledge` | Keep pending; email the requester that it's under review (repeatable) |
| POST | `/api/admin/deny` | Deny with optional reason |
| POST | `/api/admin/resend-confirmation` | Re-send the confirmation email (creates a calendar event only if missing) |
| GET | `/api/booking?token` | Load a booking by cancellation token |
| POST | `/api/cancel` | Cancel a booking; deletes the calendar event |
| POST | `/api/reschedule` | Store a proposal and email Accept/Decline links; nothing changes until accepted |
| GET | `/api/reschedule/respond?token&action` | Accept or decline a proposal (HTML response) |
| POST | `/api/reschedule/location` | Update the meeting location immediately; refreshes the calendar event and emails both parties updated confirmations |

## Schedule rules (all in `TIME_ZONE`, Europe/Berlin)

Meeting types are defined in `MEETING_TYPES` (`dailyEnd` is the latest *start*; `weekdayDailyEnd` overrides it Mon-Fri). Blocked-range logic on top:

- Non-dinner meetings must end by 15:00 Mon-Fri (work block) and 18:00 otherwise; dinner starts 19:00+.
- 9:00-9:30 is coffee-exclusive; 11:45-13:45 is reserved for lunch (relaxed during reschedules).
- `SPECIAL_MEETING_TYPES` (lunch/coffee/dinner) get a 15-minute buffer and a one-per-day limit, enforced by matching calendar event titles (`<title> - <name>`).

Admin approval with `newDate`/`newTime` intentionally bypasses the schedule rules (only the conflict check applies, and `forceApprove` bypasses that too).

## KV layout

| Key | Value | TTL |
|---|---|---|
| `request:<id>` | Pending/approved/denied request (incl. review token, `acknowledgedAt`) | 7 days |
| `booking:<id>` | Approved booking (incl. cancellation token, calendar event id) | 90 days |
| `reschedule-proposal:<token>` | Proposed date/time and status | 7-30 days |

## Testing

The live zone serves a managed bot challenge to non-browser clients, so test in a browser, or test the logic locally: copy the worker file to a `.mjs`, append `export { getAvailableSlots };`, and call it with `env = {}` (calendar checks degrade gracefully).

```bash
# Browser test (scripted curl gets a bot challenge page)
https://meet.mike.game/api/availability?date=2026-08-24&meeting_type=gamescom-chat
```
