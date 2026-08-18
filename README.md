# Personal Scheduler

A self-hosted meeting scheduler running at https://meet.mike.game, currently configured for Gamescom 2026 in Köln (August 22-28). Visitors request a meeting slot, the request goes to an admin review queue, and only approved requests land on the calendar and trigger confirmation emails with iCal invites.

## Architecture

The system has three deployed parts, all on Cloudflare:

1. **Static front-end** (Cloudflare Pages) built from `templates/` and `static/` by `build.sh`. Auto-deploys on every push to `master`.
2. **API worker** (`scheduler-api-worker.js`, deployed as `scheduler-api`) serving `meet.mike.game/api/*`. Holds the meeting-type schedule, computes availability from Google Calendar free/busy, stores requests and bookings in Workers KV, and creates/deletes calendar events.
3. **Email worker** (`cloudflare-worker.js`, deployed as `scheduler-emailer`). Sends all email through Resend: admin notifications, approvals with .ics attachments, acknowledgments, denials, cancellations, and reschedule proposals.

There is no server-side rendering and no database beyond Workers KV. `build.sh` only copies files.

## Booking flow

1. Visitor picks a meeting type, date, and slot, fills in details, and submits. This creates a `pending` request in KV; nothing touches the calendar yet.
2. The admin (hello@mike.game) gets an email with a review link (`/admin/review?token=...`).
3. On the review page the admin can:
   - **Approve** (optionally adjusting time or location, or forcing past a conflict) - creates the Google Calendar event and emails the attendee a confirmation with an .ics invite plus cancel/reschedule links.
   - **Acknowledge** - the request stays pending; the requester gets a professionally worded "received and under review" email. Repeatable.
   - **Deny** (with optional reason) - the requester gets a decline email with a rebook link.
4. Attendees can self-serve cancel, or propose a new time; reschedule proposals only take effect after someone clicks Accept in the proposal email.

## Meeting types (Köln time, Europe/Berlin)

| Type | Duration | Dates | Start window |
|---|---|---|---|
| Gamescom: Dinner & Drinks | 90 min | Aug 22-28 | 7:00pm-8:30pm |
| Gamescom: Rise & Shine (coffee) | 30 min | Aug 23-28 | 9:00am only (exclusive window) |
| Gamescom: Let's Grab Lunch! | 60 min | Aug 23-28 | 12:00pm-1:30pm |
| Gamescom: Let's Chat! | 25 min | Aug 23-28 | from 9:30am |
| Gamescom: Extended Play (hidden) | 50 min | Aug 23-28 | from 9:30am |

Schedule rules enforced by the API worker:

- All meetings start on the hour or half hour (30-minute slot grid, validated server-side). Travel and transitions come out of the meeting, never the grid: a chat at the Radisson Blu or Dorint is effectively 20 minutes instead of 25, the 9:30 meeting after a coffee absorbs the walk back to the venue, and the 11:30 block is booked 5 minutes shorter (ends 11:50) to hand off to lunch.
- Mon-Fri, daytime meetings must end by 3:00pm (work commitments 3-6pm); on other days by 6:00pm. Evenings are reserved for dinner from 7pm.
- 9:00-9:30am is reserved exclusively for coffee. The lunch window (12:00-1:45) is reserved for lunch until the day's lunch is booked, then it opens up for other meetings.
- Lunch and dinner get a 15-minute buffer after them; lunch/coffee/dinner are limited to one per day.
- Coffee defaults to a date-based spot (Dorint Hotel an der Messe through Aug 25, Gamescom Business Area from Aug 26) and requesters can suggest their own.
- The venue preset for other meetings switches automatically: Gamescom Dev (Confex Center) through Aug 25, Business Area from Aug 26. Meetings at the Radisson Blu or Dorint hotels are 5 minutes shorter to allow walking time.

**Extended Play** is hidden until a visitor enters the access code (`UNLOCK_CODE` in `static/js/scheduler.js`, currently `EXTRATIME`) in the "Have an access code?" field.

The meeting-type config is intentionally duplicated: `scheduler-api-worker.js` (authoritative, enforces rules) and `static/js/scheduler.js` (display). Change both when editing the schedule.

## Project structure

```
.
├── scheduler-api-worker.js   # API worker (availability, booking, admin, reschedule)
├── cloudflare-worker.js      # Email worker (Resend)
├── wrangler-api.toml         # API worker config (KV binding, routes, TIME_ZONE)
├── wrangler.toml             # Email worker config
├── templates/
│   ├── index.html            # Booking page
│   ├── cancel.html           # Self-service cancellation
│   ├── reschedule.html       # Self-service reschedule proposal
│   └── admin/review.html     # Approve / Acknowledge / Deny
├── static/
│   ├── css/style.css
│   └── js/scheduler.js       # Booking logic + display copy of meeting types
├── build.sh / build.bat      # Copy templates+static into dist/
├── _headers                  # Cache policy (assets 1y immutable, HTML 5 min)
└── _routes.json              # Pages serves everything except /api/*
```

## Deployment

See `DEPLOY.md` for full details. Short version:

```bash
# Front-end: push to master, Cloudflare Pages builds and deploys
git push

# API worker
npx wrangler deploy --config wrangler-api.toml --env production

# Email worker
npx wrangler deploy --env production
```

When changing `static/js/scheduler.js` or `static/css/style.css`, bump the `?v=` query string in `templates/index.html` - static assets are cached for a year.

## Configuration

- **API worker vars** (`wrangler-api.toml`): `BASE_URL`, `EMAIL_WORKER_URL`, `TIME_ZONE` (`Europe/Berlin`). Secrets set via `wrangler secret put`: `GOOGLE_CALENDAR_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON` (see `GOOGLE_CALENDAR_SETUP.md`), `EMAIL_WORKER_SECRET`.
- **Email worker secrets**: `RESEND_API_KEY`, `EMAIL_WORKER_SECRET` (shared with the API worker; see `EMAIL_SETUP.md`).
- Sender/admin addresses are in `cloudflare-worker.js` (`hello@mike.game`, `notifications@mike.game`).

## License

© 2026 Mike Sanders. All rights reserved.
