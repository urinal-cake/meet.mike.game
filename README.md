# Personal Scheduler

A minimal, self-hosted meeting scheduler. Visitors can view your availability, book time slots, and receive email confirmations with iCal calendar invites. Perfect for independent contractors, consultants, and small business owners.

## Quick Start

### 1. Development
```bash
# Install dependencies
go mod download

# Start the development server
go run main.go

# Visit http://localhost:3001
```

### 2. Build for Deployment
```bash
# Windows
build.bat

# Linux/macOS
chmod +x build.sh
./build.sh
```

### 3. Deploy
```bash
# Push to GitHub for automatic Cloudflare Pages deployment
git add .
git commit -m "Initial scheduler setup"
git push origin main
```

Cloudflare will automatically:
1. Build the project
2. Generate static files
3. Deploy to your domain

## Features

- ✅ **Calendar Availability** - Shows available time slots (integrated with Google Calendar)
- ✅ **Custom Fields** - Collects name, email, company, and role
- ✅ **Timezone Support** - Automatically detects and handles timezones
- ✅ **iCal Invites** - Sends calendar invites via email
- ✅ **Email Notifications** - Both attendee and organizer get confirmations
- ✅ **Responsive Design** - Beautiful UI matching mike.game styling
- ✅ **Fast Deployment** - One-command Cloudflare Pages deployment

## Project Structure

```
.
├── main.go                          # Go backend API
├── cloudflare-worker.js            # Email handler (Cloudflare Worker)
├── templates/
│   └── index.html                  # Single-page scheduler UI
├── static/
│   ├── css/
│   │   └── style.css               # Scheduler styling
│   └── js/
│       └── scheduler.js            # Booking logic
├── build.bat                        # Windows build script
├── build.sh                         # Linux/macOS build script
├── _redirects                       # Cloudflare routing
├── _headers                         # Cloudflare caching
└── dist/                            # Generated static files (after build)
```

## Configuration

### Environment Variables (Cloudflare Pages)

Create these environment variables in your Cloudflare Pages settings:

1. **RESEND_API_KEY** - Your Resend API key for sending emails
   - Get from: https://resend.com

2. **GOOGLE_CALENDAR_ID** - Your Google Calendar ID (optional, for integration)
3. **GOOGLE_SERVICE_ACCOUNT_JSON** - Google Service Account credentials (optional)

### Database

The scheduler uses SQLite (automatically created):
- Location: `scheduler.db`
- Tables: `appointments`, `excluded_slots`

### Email Setup

Emails are sent using the Resend API:
1. Sign up at https://resend.com
2. Verify your domain (e.g., hello@yourdomain.com)
3. Get your API key from Resend dashboard
4. Add RESEND_API_KEY to Cloudflare Pages environment variables
5. Update the email sender in `cloudflare-worker.js` line 117

## API Endpoints

### GET /
Returns the scheduler HTML page

### POST /api/availability
Get available time slots for a specific date

**Request:**
```json
{
  "date": "2026-02-25",
  "timezone": "America/New_York"
}
```

**Response:**
```json
[
  {
    "time": "09:00",
    "available": true
  },
  {
    "time": "09:30",
    "available": false
  }
]
```

### POST /api/book
Book an appointment

**Request:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "company": "ACME Corp",
  "role": "Product Manager",
  "date": "2026-02-25",
  "time": "14:00",
  "timezone": "America/New_York"
}
```

**Response:**
```json
{
  "success": "true",
  "id": "1234567890-123456"
}
```

## Cloudflare Worker Setup

The scheduler uses a Cloudflare Worker to send emails:

### Deploy Worker

1. Go to Cloudflare Dashboard → Workers & Pages
2. Create a new Worker named `scheduler-email`
3. Copy contents of `cloudflare-worker.js`
4. Deploy and add to a route: `meet.mike.game/api/send-email*`
5. Add RESEND_API_KEY to Worker environment variables

### Worker Routes

Set up route binding in Cloudflare Pages:
```
Pattern: yourdomain.com/api/send-email*
Worker: scheduler-emailer
```
(Replace `yourdomain.com` with your custom domain)

## Styling

The scheduler uses:
- **Bootstrap 5** - Responsive layout
- **Font Awesome 6** - Icons
- **Custom CSS** - Purple gradient matching your brand
- **Dark mode** - Automatic dark mode support

Features a modern dark theme with customizable gradient colors (see Customization section)

## Customization

### Change Email Sender
Edit `cloudflare-worker.js` (search for all occurrences of 'hello@yourdomain.com'):
```javascript
// Line 117:
from: 'Scheduler <hello@yourdomain.com>',  // Change to your domain

// Line 210:
to: 'hello@yourdomain.com',  // Admin notification email

// Line 220:
from: 'Mike Sanders <hello@yourdomain.com>',  // Change name and domain
reply_to: 'hello@yourdomain.com',
```

### Change Meeting Duration
Edit `main.go`:
```go
appointment.EndTime = startTime.Add(30 * time.Minute)  // Change 30 to desired minutes
```

### Add More Timezones
Edit `templates/index.html` in the timezone select:
```html
<option value="Asia/Bangkok">Bangkok (ICT)</option>
```

### Customize Colors
Edit `static/css/style.css`:
```css
--primary-color: #2563eb;     /* Blue */
--secondary-color: #1e40af;   /* Darker blue */
```

## Troubleshooting

### Build Fails
- Ensure Go 1.14+ is installed: `go version`
- Check templates and static files exist
- Run `go mod tidy`

### Emails Not Sending
- Verify RESEND_API_KEY is set in Cloudflare Pages environment
- Check Cloudflare Worker logs for errors
- Verify domain is verified in Resend dashboard

### Availability Not Loading
- Check if Go server is running: `go run main.go`
- Verify database isn't corrupted: `rm scheduler.db` and restart
- Check browser console for API errors

### Static Files 404
- Ensure `dist/` folder exists after build
- Check file paths in `_redirects` and `_headers`
- Verify static folder was copied correctly

## Google Calendar Integration (Future)

To sync availability with your Google Calendar:

1. Create Google Service Account
2. Add calendar ID and credentials to environment
3. Update availability endpoint in `main.go` to query Google Calendar API
4. Set working hours and block out times as needed

See `GOOGLE_CALENDAR_SETUP.md` for detailed instructions.

## Deployment Checklist

- [ ] Cloudflare Pages project created
- [ ] GitHub repository connected
- [ ] Build command: `STATIC_DEPLOY=true ./build.sh`
- [ ] Output directory: `dist/`
- [ ] Environment variables set:
  - [ ] RESEND_API_KEY
  - [ ] (Optional) Google Calendar credentials
- [ ] Custom domain configured (your-scheduler-domain.com)
- [ ] Cloudflare Worker deployed for emails
- [ ] Worker routes configured
- [ ] Domain verified in Resend

## Support

For issues with:
- **Cloudflare Pages** - https://developers.cloudflare.com/pages/
- **Resend** - https://resend.com/docs
- **Go** - https://golang.org/doc/

## License

© 2026 Mike Sanders. All rights reserved.
