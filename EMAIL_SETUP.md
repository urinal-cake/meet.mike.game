# Personal Scheduler - Email Integration Setup

## Overview

The Personal Scheduler uses a Cloudflare Worker to send emails via Resend. This keeps the Resend API key secure and separate from the Go application.

## Cloudflare Worker Setup

### 1. Deploy the Worker

The worker code is in `cloudflare-worker.js`. Deploy it to Cloudflare Workers:

```bash
# If you haven't already, install Wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Deploy the worker
wrangler deploy cloudflare-worker.js --name scheduler-emailer
```

### 2. Set Environment Variables

In your Cloudflare Worker settings, add:

- `RESEND_API_KEY` - Your Resend API key (starts with `re_`)

You can set this via the Cloudflare dashboard or using Wrangler:

```bash
wrangler secret put RESEND_API_KEY
```

### 3. Get the Worker URL

After deployment, you'll get a URL like: `https://scheduler-emailer.YOUR_SUBDOMAIN.workers.dev`

## Go Server Setup

Set these environment variables for your Go server:

### Required for Email Sending

```powershell
# Windows PowerShell
$env:EMAIL_WORKER_URL = "https://scheduler-emailer.YOUR_CLOUDFLARE_SUBDOMAIN.workers.dev"
$env:BASE_URL = "https://yourdomain.com"  # Your scheduler domain

# Then start the server
.\main.exe
```

### Optional (for development)

```powershell
# If not set, defaults to http://localhost:3001
$env:BASE_URL = "http://localhost:3001"
```

Replace:
- `YOUR_CLOUDFLARE_SUBDOMAIN` - Your Cloudflare account subdomain (see after deployment)
- `yourdomain.com` - Your actual scheduler domain

## Email Flow

### 1. User Submits Meeting Request
- Go server creates `PendingRequest` with unique token
- Calls Cloudflare Worker with `type: admin_notification`
- Admin receives email with review link

### 2. Admin Reviews Request
- Clicks link from email → `/admin/review?token=...`
- Sees full request details
- Chooses to Approve or Deny

### 3. Admin Approves
- Creates `Appointment` from `PendingRequest`
- Calls Cloudflare Worker with `type: approval`
- User receives email with iCal attachment

### 4. Admin Denies
- Updates request status to "denied"
- Calls Cloudflare Worker with `type: denial`
- User receives decline email

## Resend Configuration

Make sure your Resend account has:

1. **Verified domain**: Your domain (yourdomain.com)
2. **From address configured**: hello@yourdomain.com (or your preferred email address)

## Testing Without Email

If `EMAIL_WORKER_URL` is not set, the server will:
- Log email details to console
- Skip actual email sending
- Continue functioning normally

This is useful for local development and testing.

## Troubleshooting

### Emails not sending?

1. Check `EMAIL_WORKER_URL` is set correctly
2. Verify Resend API key in Cloudflare Worker
3. Check server logs for error messages
4. Verify Resend domain is verified

### Admin not receiving notifications?

- Check Cloudflare Worker logs in dashboard
- Verify `hello@mike.game` is correct admin email
- Check spam folder

### Users not receiving confirmations?

- Check that approval handler is calling sendConfirmationEmail
- Verify user email address is valid
- Check Cloudflare Worker logs

## Security Notes

- **Never commit** `RESEND_API_KEY` to git
- Keep the API key in Cloudflare Worker secrets only
- Use environment variables for `EMAIL_WORKER_URL`
- Tokens in review URLs are 64-character random hex strings
