# Deployment Guide for Personal Scheduler

This guide walks you through deploying your Personal Scheduler to production using Cloudflare Pages.

## Prerequisites

- Cloudflare account (free tier is fine)
- GitHub account with your repo
- Resend account for sending emails
- Custom domain (e.g., scheduler.yourdomain.com)

## Step 1: Set Up GitHub Repository

```bash
cd "path/to/personal-scheduler"
git add .
git commit -m "Initial scheduler setup"
git remote add origin https://github.com/YOUR_USERNAME/personal-scheduler.git
git push -u origin main
```

## Step 2: Connect to Cloudflare Pages

1. **Log in to Cloudflare Dashboard**
   - Go to https://dash.cloudflare.com/

2. **Navigate to Pages**
   - Click "Workers & Pages" in the left menu
   - Click "Pages" tab

3. **Connect to GitHub**
   - Click "Connect to Git"
   - Authorize Cloudflare to access your GitHub account
   - Select your repository: `personal-scheduler`

4. **Configure Build Settings**
   - **Framework preset**: None
   - **Build command**: `./build.sh` (or `build.bat` for Windows, but bash is needed)
   - **Build output directory**: `dist`
   - **Environment variables**: Set in next step

## Step 3: Set Environment Variables

In your Cloudflare Pages project settings:

1. Click "Settings" → "Environment variables"

2. **Production environment**, add:
   - **RESEND_API_KEY** = `your_resend_api_key_here`
   
   Optional (for future Google Calendar integration):
   - **GOOGLE_CALENDAR_ID** = `your_calendar_id@gmail.com`
   - **GOOGLE_SERVICE_ACCOUNT_JSON** = `{...}`

3. Save settings

### Getting Your Resend API Key

1. Create account at https://resend.com
2. Go to API Keys section
3. Create new API key
4. Copy and paste into Cloudflare

## Step 4: Configure Custom Domain

1. In Cloudflare Pages project → "Custom domains"
2. Add your custom domain (e.g., `scheduler.yourdomain.com`)
3. Cloudflare will show you DNS configuration
4. Add the DNS records to your Cloudflare zone
5. Wait for DNS propagation (usually instant)

## Step 5: Deploy Cloudflare Worker for Emails

### Create the Worker

1. In Cloudflare Dashboard → **Workers & Pages**
2. Click **Create application** → **Create Worker**
3. Name it: `scheduler-email`
4. Copy the code from `cloudflare-worker.js`
5. Paste into the Worker editor
6. **Save and Deploy**

### Add Environment Variables to Worker

1. Click the Worker name → **Settings**
2. Go to **Environment variables**
3. Add **RESEND_API_KEY** = `your_key`
4. Save

### Configure Worker Routes

1. Go to your Pages project → **Settings** → **Functions**
2. Configure route binding:
   - **Pattern**: `yourdomain.com/api/send-email*`
   - **Worker**: `scheduler-emailer`
   
   (Replace `yourdomain.com` with your actual domain)

OR manually in Cloudflare:

1. **Workers & Pages** → Your Worker → **Triggers**
2. Add custom route: `meet.mike.game/api/send-email*`

## Step 6: Verify Resend Domain

1. Log in to Resend at https://resend.com
2. Go to **Domains**
3. Add domain: `hello@yourdomain.com` (or your preferred email)
4. Follow verification steps:
   - Add DNS records to your Cloudflare zone
   - Usually need DKIM, SPF, DMARC records
5. Wait for verification (can take 24 hours)

### Resend DNS Records

Resend will provide you with specific DNS records. Add them to your Cloudflare zone:

1. Cloudflare Dashboard → Your domain
2. **DNS** section
3. Add the records from Resend

## Step 7: Deploy Your Site

Your site will automatically deploy when you push to GitHub!

```bash
git add .
git commit -m "Ready for production"
git push origin main
```

Cloudflare will:
1. Run your build script
2. Generate static files
3. Deploy to your custom domain

Check deployment status in Cloudflare Pages → **Deployments**

## Step 8: Test the Scheduler

1. Visit https://yourdomain.com (your scheduler domain)
2. Try booking a slot
3. Check your email for confirmation
4. Verify:
   - Email arrives at your booking email address
   - Email arrives at hello@mike.game (organizer notification)
   - Calendar invite (ICS file) is attached

## Troubleshooting

### Build Fails in Cloudflare

**Error: "bash: ./build.sh: No such file or directory"**
- Cloudflare may not support shell scripts directly on Windows
- Solution: Use `STATIC_DEPLOY=true go run main.go` as build command instead
- Update your Cloudflare Pages build command to:
  ```
  go run main.go
  ```

**Error: "RESEND_API_KEY not found"**
- Verify environment variable is set in Cloudflare Pages settings
- Make sure it's in "Production" environment, not preview
- Redeploy after adding variables

**Error: "Port already in use"**
- Change PORT in `main.go` to a different port
- Or set PORT environment variable in Cloudflare

### Emails Not Sending

**"Failed to send email"**
- Check RESEND_API_KEY is correct
- Verify domain is verified in Resend
- Check Cloudflare Worker logs for errors
- Verify Worker is deployed and routes are configured

**Emails going to spam**
- You need proper DNS records (SPF, DKIM, DMARC)
- Wait for Resend domain verification
- Check Resend dashboard for warnings

### Custom Domain Not Working

- Verify DNS records are added to Cloudflare
- DNS records added correctly:
  - CNAME record pointing to Cloudflare
- Wait up to 24 hours for DNS propagation
- Check in Cloudflare Pages → Custom domains → Status

## Database

By default, SQLite is used locally. For production:

- SQLite database is stored in the Pages container
- **Note**: Files in Cloudflare Pages containers are ephemeral
- **Recommendation**: Integrate with external database:
  - PostgreSQL (Railway, Heroku)
  - Neon
  - Planetscale

Update `main.go` database connection string as needed.

## Monitoring

### Check Deployment Status
- Cloudflare Dashboard → Pages → Deployments
- See build logs and deployment history

### Monitor Emails
- Resend Dashboard → Activity
- See all emails sent, delivery status, bounces

### Check Worker Performance
- Cloudflare Dashboard → Workers → Analytics
- Monitor API calls to email endpoint
- Check error rates and CPU usage

## Updates & Maintenance

### Update the Scheduler
```bash
# Make changes to code
git add .
git commit -m "Update feature"
git push origin main
# Cloudflare automatically rebuilds and deploys
```

### View Logs
- Cloudflare Pages → Deployments → Click a deployment → View logs
- Cloudflare Workers → Your worker → Logs tab

## Security Notes

- ✅ API Key stored as environment variable (not in code)
- ✅ Email validation on both client and server
- ✅ HTTPS enforced by Cloudflare
- ✅ Database accessible only to your backend
- ⚠️ Future: Add rate limiting for booking API
- ⚠️ Future: Add CSRF protection
- ⚠️ Future: Add spam detection

## Next Steps

After successful deployment:

1. Share https://meet.mike.game with contacts
2. Test booking a few slots
3. Verify emails are being received
4. Monitor Resend dashboard for deliverability
5. Integrate with Google Calendar (see separate guide)
6. Consider adding more customizations

## Support

- **Cloudflare Pages Docs**: https://developers.cloudflare.com/pages/
- **Cloudflare Workers Docs**: https://developers.cloudflare.com/workers/
- **Resend Docs**: https://resend.com/docs
- **Go Docs**: https://golang.org/doc/

---

**Congratulations!** Your Personal Scheduler is now live! 🚀
