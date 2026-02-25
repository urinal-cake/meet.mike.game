# Google Calendar Integration Guide

This guide explains how to integrate your Personal Scheduler with your Google Calendar (connected to hello@mike.game) to automatically fetch availability.

## Overview

Instead of manually setting availability, the scheduler will:
1. Query your Google Calendar API
2. Find free time slots in your working hours
3. Show only truly available time to your visitors

## Prerequisites

- Google Workspace account (or regular Google account)
- Calendar synced to hello@mike.game
- Google Cloud Project with Calendar API enabled
- Service Account with access to your calendar

## Step 1: Create Google Cloud Project

1. Go to https://console.cloud.google.com
2. Click **Create Project**
3. Name it: `Personal Scheduler`
4. Click **Create**
5. Wait for project to be created

## Step 2: Enable Google Calendar API

1. In Google Cloud console, go to **APIs & Services**
2. Click **+ Enable APIs and Services**
3. Search for "Google Calendar API"
4. Click on it, then click **Enable**

## Step 3: Create Service Account

1. Go to **APIs & Services** → **Credentials**
2. Click **+ Create Credentials** → **Service Account**
3. Fill in:
   - **Service account name**: `scheduler`
   - **Service account ID**: `scheduler-XXXXX` (auto-filled)
4. Click **Create and Continue**
5. **Grant this service account access to project**:
   - Select role: **Editor** (or Calendar Editor)
   - Click **Continue**
6. Click **Done**

## Step 4: Create and Download JSON Key

1. Go to **APIs & Services** → **Credentials**
2. Under "Service Accounts", click on the `scheduler` account
3. Go to **Keys** tab
4. Click **Add Key** → **Create new key**
5. Choose **JSON**
6. Click **Create** - the key file will download automatically
7. **IMPORTANT**: Keep this file secure! Don't commit to GitHub!

## Step 5: Share Calendar with Service Account

1. In the downloaded JSON file, find `client_email` (looks like `scheduler-XXX@project-id.iam.gserviceaccount.com`)
2. Go to Google Calendar (calendar.google.com)
3. Click on your calendar (hello@mike.game)
4. Click **Settings** → **Share with specific people**
5. Add the service account email with "See all event details" permission
6. Click **Share**

## Step 6: Set Up Environment Variables

Add these to your **Cloudflare Pages** environment variables:

1. **GOOGLE_CALENDAR_ID**: Your calendar ID
   - Found in calendar settings: `hello@mike.game` or something like `user@gmail.com`

2. **GOOGLE_SERVICE_ACCOUNT_JSON**: Full JSON credentials
   - Copy entire contents of downloaded JSON file
   - Paste as single environment variable

Or for local development, create `.env` file:
```
GOOGLE_CALENDAR_ID=hello@mike.game
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"..."}
```

## Step 7: Update Go Code

Replace the `getAvailableSlots()` function in `main.go`:

```go
import (
	"context"
	"encoding/json"
	"os"
	"time"

	"google.golang.org/api/calendar/v3"
	"google.golang.org/api/option"
)

func getAvailableSlots(date time.Time, timezone string) []TimeSlot {
	slots := []TimeSlot{}

	// Get Google Calendar service
	ctx := context.Background()
	credentialJSON := os.Getenv("GOOGLE_SERVICE_ACCOUNT_JSON")
	calendarID := os.Getenv("GOOGLE_CALENDAR_ID")

	service, err := calendar.NewService(ctx, option.WithCredentialsJSON([]byte(credentialJSON)))
	if err != nil {
		// Fallback to default slots if calendar API fails
		return getDefaultSlots(date, timezone)
	}

	// Query calendar for events on this date
	startOfDay := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, time.UTC)
	endOfDay := startOfDay.Add(24 * time.Hour)

	events, err := service.Events.List(calendarID).
		TimeMin(startOfDay.Format(time.RFC3339)).
		TimeMax(endOfDay.Format(time.RFC3339)).
		SingleEvents(true).
		OrderBy("startTime").
		Do()

	if err != nil {
		// Fallback to default slots if query fails
		return getDefaultSlots(date, timezone)
	}

	// Build map of busy times
	busyTimes := make(map[string]bool)
	for _, event := range events.Items {
		if !event.Transparency == "transparent" { // Skip "free" marked events
			eventStart, _ := time.Parse(time.RFC3339, event.Start.DateTime)
			if eventStart.IsZero() {
				eventStart, _ = time.Parse("2006-01-02", event.Start.Date)
			}
			busyTimes[eventStart.Format("15:04")] = true
		}
	}

	// Generate slots
	startHour := 9
	endHour := 17

	for hour := startHour; hour < endHour; hour++ {
		for minute := 0; minute < 60; minute += 30 {
			slotTime := time.Date(date.Year(), date.Month(), date.Day(), hour, minute, 0, 0, time.UTC)
			timeStr := slotTime.Format("15:04")
			available := !busyTimes[timeStr]

			slots = append(slots, TimeSlot{
				Time:      timeStr,
				Available: available,
			})
		}
	}

	return slots
}

func getDefaultSlots(date time.Time, timezone string) []TimeSlot {
	// Fallback if calendar API unavailable
	slots := []TimeSlot{}
	startHour := 9
	endHour := 17

	for hour := startHour; hour < endHour; hour++ {
		for minute := 0; minute < 60; minute += 30 {
			slotTime := time.Date(date.Year(), date.Month(), date.Day(), hour, minute, 0, 0, time.UTC)
			slots = append(slots, TimeSlot{
				Time:      slotTime.Format("15:04"),
				Available: true,
			})
		}
	}

	return slots
}
```

## Step 8: Add Google Calendar Dependency

Update `go.mod`:
```bash
go get google.golang.org/api/calendar/v3
go mod tidy
```

## Step 9: Deploy

```bash
git add .
git commit -m "Add Google Calendar integration"
git push origin main
```

Cloudflare will rebuild and deploy automatically.

## Testing

1. Visit https://meet.mike.game
2. Try a date with events in your calendar
3. Verify blocked time slots don't appear
4. Add/remove events from calendar and refresh

## Troubleshooting

### "Permission denied" error
- Make sure service account email is shared in calendar settings
- Verify calendar sharing permissions
- Check GOOGLE_CALENDAR_ID is correct

### "Invalid credential" error
- Verify GOOGLE_SERVICE_ACCOUNT_JSON is set
- Make sure it's the full JSON, not truncated
- Check for extra spaces or line breaks

### Slots always showing as available
- Cloudflare may have cached the fallback
- Check if Calendar API is enabled
- Verify service account has access
- Check application logs

### Google Calendar API quota exceeded
- You're under free tier quota (default high)
- If limit exceeded, upgrade to paid plan
- Consider caching results to reduce API calls

## Customization

### Change Working Hours
Edit the `startHour` and `endHour` variables:
```go
startHour := 9      // 9 AM
endHour := 17       // 5 PM
```

### Change Slot Duration
Edit the minute increment (currently 30 minutes):
```go
for minute := 0; minute < 60; minute += 30 { // Change 30 to 15, 45, etc.
```

### Skip Weekends
Add this before generating slots:
```go
if date.Weekday() == time.Saturday || date.Weekday() == time.Sunday {
    return []TimeSlot{} // No slots on weekends
}
```

### Add Buffer Time
Add this before checking availability:
```go
bufferMinutes := 15 // Time between meetings
bufferTimes := make(map[string]bool)
for eventTime := range busyTimes {
    // Mark time before and after as busy
}
```

## Security Notes

⚠️ **Important**: 
- Never commit the JSON credentials to GitHub
- Always use environment variables for sensitive data
- Google Cloud charges for API usage (free tier very generous)
- Consider API key rotation annually

## Support

- Google Calendar API: https://developers.google.com/calendar
- Service Accounts: https://cloud.google.com/iam/docs/service-accounts
- Go Client Library: https://github.com/googleapis/google-api-go-client

---

Once set up, your scheduler will automatically show real availability from your calendar!
