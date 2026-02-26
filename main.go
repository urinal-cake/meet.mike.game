package main

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"html/template"
	"log"
	"net/http"
	"os"
	"sync"
	"time"
)

type Appointment struct {
	ID                string    `json:"id"`
	MeetingTypeID     string    `json:"meeting_type_id"`
	MeetingTypeTitle  string    `json:"meeting_type_title"`
	DurationMinutes   int       `json:"duration_minutes"`
	Email             string    `json:"email"`
	Name              string    `json:"name"`
	Company           string    `json:"company"`
	Role              string    `json:"role"`
	DiscussionTopics  []string  `json:"discussion_topics"`
	DiscussionDetails string    `json:"discussion_details"`
	StartTime         time.Time `json:"start_time"`
	EndTime           time.Time `json:"end_time"`
	Timezone          string    `json:"timezone"`
	CreatedAt         time.Time `json:"created_at"`
}

type PendingRequest struct {
	ID                string    `json:"id"`
	Token             string    `json:"token"`
	MeetingTypeID     string    `json:"meeting_type_id"`
	MeetingTypeTitle  string    `json:"meeting_type_title"`
	DurationMinutes   int       `json:"duration_minutes"`
	Email             string    `json:"email"`
	Name              string    `json:"name"`
	Company           string    `json:"company"`
	Role              string    `json:"role"`
	DiscussionTopics  []string  `json:"discussion_topics"`
	DiscussionDetails string    `json:"discussion_details"`
	RequestedDate     string    `json:"requested_date"`
	RequestedTime     string    `json:"requested_time"`
	Timezone          string    `json:"timezone"`
	Status            string    `json:"status"` // pending, approved, denied
	CreatedAt         time.Time `json:"created_at"`
}

type TimeSlot struct {
	Time      string `json:"time"`
	Available bool   `json:"available"`
}

type TimeRange struct {
	Start string `json:"start"`
	End   string `json:"end"`
}

type MeetingType struct {
	ID              string      `json:"id"`
	Title           string      `json:"title"`
	Description     string      `json:"description"`
	DurationMinutes int         `json:"duration_minutes"`
	Mode            string      `json:"mode"`
	DateStart       string      `json:"date_start"`
	DateEnd         string      `json:"date_end"`
	DailyStart      string      `json:"daily_start"`
	DailyEnd        string      `json:"daily_end"`
	Blocked         []TimeRange `json:"blocked"`
}

type AvailabilityRequest struct {
	Date          string `json:"date"`
	Timezone      string `json:"timezone"`
	MeetingTypeID string `json:"meeting_type_id"`
}

type BookingRequest struct {
	MeetingTypeID     string   `json:"meeting_type_id"`
	Name              string   `json:"name"`
	Email             string   `json:"email"`
	Company           string   `json:"company"`
	Role              string   `json:"role"`
	Date              string   `json:"date"`
	Time              string   `json:"time"`
	Timezone          string   `json:"timezone"`
	DiscussionTopics  []string `json:"discussion_topics"`
	DiscussionDetails string   `json:"discussion_details"`
}

type PageData struct {
	Title       string
	Description string
}

var (
	appointmentsMutex sync.RWMutex
	appointments      = make([]Appointment, 0)
	pendingRequests   = make([]PendingRequest, 0)
	meetingTypes      = map[string]MeetingType{
		"gdc-pleasant-talk": {
			ID:              "gdc-pleasant-talk",
			Title:           "GDC: A Pleasant Talk",
			Description:     "Have something you want to talk to me about specifically? A little more time will be good for us to run through it all.",
			DurationMinutes: 40,
			Mode:            "in-person",
			DateStart:       "2026-03-09",
			DateEnd:         "2026-03-13",
			DailyStart:      "09:00",
			DailyEnd:        "17:00",
			Blocked: []TimeRange{
				{Start: "11:45", End: "13:15"},
			},
		},
		"gdc-quick-chat": {
			ID:              "gdc-quick-chat",
			Title:           "GDC: A Quick Chat",
			Description:     "Let's meet quickly, catch up, and discuss what's happening!",
			DurationMinutes: 20,
			Mode:            "in-person",
			DateStart:       "2026-03-09",
			DateEnd:         "2026-03-13",
			DailyStart:      "09:00",
			DailyEnd:        "17:00",
			Blocked: []TimeRange{
				{Start: "11:45", End: "13:15"},
			},
		},
		"gdc-lunch": {
			ID:              "gdc-lunch",
			Title:           "GDC: Lunch",
			Description:     "Meet in person for lunch during GDC.",
			DurationMinutes: 60,
			Mode:            "in-person",
			DateStart:       "2026-03-09",
			DateEnd:         "2026-03-13",
			DailyStart:      "12:00",
			DailyEnd:        "13:00",
		},
		"gdc-dinner": {
			ID:              "gdc-dinner",
			Title:           "GDC: Dinner",
			Description:     "Meet in person for dinner during GDC.",
			DurationMinutes: 120,
			Mode:            "in-person",
			DateStart:       "2026-03-09",
			DateEnd:         "2026-03-13",
			DailyStart:      "17:30",
			DailyEnd:        "19:30",
		},
	}
)

func main() {
	// Middleware
	http.HandleFunc("/", handleIndex)
	http.HandleFunc("/api/availability", handleAvailability)
	http.HandleFunc("/api/book", handleBooking)
	http.HandleFunc("/admin/review", handleAdminReview)
	http.HandleFunc("/admin/approve", handleApprove)
	http.HandleFunc("/admin/deny", handleDeny)

	// Serve static files
	fs := http.FileServer(http.Dir("static"))
	http.Handle("/static/", http.StripPrefix("/static/", fs))

	port := os.Getenv("PORT")
	if port == "" {
		port = "3001"
	}

	log.Printf("Server running on port %s", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}

func handleIndex(w http.ResponseWriter, r *http.Request) {
	tmpl, err := template.ParseFiles("templates/index.html")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	data := PageData{
		Title:       "Schedule a Meeting - Mike Sanders",
		Description: "Book a time to meet with Mike Sanders for a conference or virtual meeting",
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	tmpl.Execute(w, data)
}

func handleAvailability(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req AvailabilityRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	if req.MeetingTypeID == "" {
		http.Error(w, "Meeting type is required", http.StatusBadRequest)
		return
	}

	meetingType, ok := meetingTypes[req.MeetingTypeID]
	if !ok {
		http.Error(w, "Invalid meeting type", http.StatusBadRequest)
		return
	}

	// Parse date
	date, err := time.Parse("2006-01-02", req.Date)
	if err != nil {
		http.Error(w, "Invalid date format", http.StatusBadRequest)
		return
	}

	if !dateInRange(date, meetingType.DateStart, meetingType.DateEnd) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]TimeSlot{})
		return
	}

	// Get availability (integrate with calendar API later)
	slots := getAvailableSlots(date, req.Timezone, meetingType)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(slots)
}

func handleBooking(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req BookingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	if req.MeetingTypeID == "" {
		http.Error(w, "Meeting type is required", http.StatusBadRequest)
		return
	}

	meetingType, ok := meetingTypes[req.MeetingTypeID]
	if !ok {
		http.Error(w, "Invalid meeting type", http.StatusBadRequest)
		return
	}

	// Validate required fields
	if req.Name == "" || req.Email == "" || req.Date == "" || req.Time == "" || req.DiscussionDetails == "" {
		http.Error(w, "Missing required fields", http.StatusBadRequest)
		return
	}

	// Parse datetime and validate
	startTime, err := time.Parse("2006-01-02 15:04", req.Date+" "+req.Time)
	if err != nil {
		http.Error(w, "Invalid date/time format", http.StatusBadRequest)
		return
	}

	if !dateInRange(startTime, meetingType.DateStart, meetingType.DateEnd) {
		http.Error(w, "Selected date is not available for this meeting type", http.StatusBadRequest)
		return
	}

	endTime := startTime.Add(time.Duration(meetingType.DurationMinutes) * time.Minute)

	if !isWithinDailyWindow(startTime, endTime, meetingType) {
		http.Error(w, "Selected time is outside of available hours", http.StatusBadRequest)
		return
	}

	if overlapsBlockedRange(startTime, endTime, meetingType) {
		http.Error(w, "Selected time overlaps a blocked period", http.StatusBadRequest)
		return
	}

	// Create pending request instead of appointment
	token := generateToken()
	pendingRequest := PendingRequest{
		ID:                generateID(),
		Token:             token,
		MeetingTypeID:     meetingType.ID,
		MeetingTypeTitle:  meetingType.Title,
		DurationMinutes:   meetingType.DurationMinutes,
		Name:              req.Name,
		Email:             req.Email,
		Company:           req.Company,
		Role:              req.Role,
		DiscussionTopics:  req.DiscussionTopics,
		DiscussionDetails: req.DiscussionDetails,
		RequestedDate:     req.Date,
		RequestedTime:     req.Time,
		Timezone:          req.Timezone,
		Status:            "pending",
		CreatedAt:         time.Now(),
	}

	// Save pending request
	appointmentsMutex.Lock()
	pendingRequests = append(pendingRequests, pendingRequest)
	appointmentsMutex.Unlock()

	// Send email to admin for review
	sendAdminNotification(pendingRequest)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"success": "true",
		"id":      pendingRequest.ID,
	})
}

func getAvailableSlots(date time.Time, timezone string, meetingType MeetingType) []TimeSlot {
	slots := []TimeSlot{}
	_ = timezone

	slotIntervalMinutes := 10
	meetingDuration := time.Duration(meetingType.DurationMinutes) * time.Minute

	dailyStart, dailyEnd, ok := buildDailyWindow(date, meetingType)
	if !ok {
		return slots
	}

	appointmentsMutex.RLock()
	defer appointmentsMutex.RUnlock()

	for slotStart := dailyStart; slotStart.Add(meetingDuration).Before(dailyEnd) || slotStart.Add(meetingDuration).Equal(dailyEnd); slotStart = slotStart.Add(time.Duration(slotIntervalMinutes) * time.Minute) {
		slotEnd := slotStart.Add(meetingDuration)

		if overlapsBlockedRange(slotStart, slotEnd, meetingType) {
			continue
		}

		// Disable overlap checking until calendar integration is complete
		available := true
		// TODO: Re-enable when calendar integration is ready
		/*
			for _, appt := range appointments {
				if slotStart.Before(appt.EndTime) && slotEnd.After(appt.StartTime) {
					available = false
					break
				}
			}
		*/

		slots = append(slots, TimeSlot{
			Time:      slotStart.Format("15:04"),
			Available: available,
		})
	}

	return slots
}

func sendConfirmationEmail(appointment Appointment) {
	log.Printf("Sending confirmation email to: %s", appointment.Email)

	// Call Cloudflare Worker to send email
	workerURL := os.Getenv("EMAIL_WORKER_URL")
	if workerURL == "" {
		log.Println("EMAIL_WORKER_URL not set, skipping confirmation email")
		return
	}

	emailData := map[string]interface{}{
		"type":          "approval",
		"to":            appointment.Email,
		"name":          appointment.Name,
		"email":         appointment.Email,
		"company":       appointment.Company,
		"role":          appointment.Role,
		"meetingType":   appointment.MeetingTypeTitle,
		"duration":      appointment.DurationMinutes,
		"startTime":     appointment.StartTime.Format(time.RFC3339),
		"endTime":       appointment.EndTime.Format(time.RFC3339),
		"timezone":      appointment.Timezone,
		"topics":        appointment.DiscussionTopics,
		"details":       appointment.DiscussionDetails,
		"appointmentId": appointment.ID,
	}

	jsonData, _ := json.Marshal(emailData)
	resp, err := http.Post(workerURL, "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		log.Printf("Failed to send confirmation email: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		log.Printf("Email worker returned status %d", resp.StatusCode)
	} else {
		log.Println("Confirmation email sent successfully")
	}
}

func generateICalContent(a Appointment) string {
	return fmt.Sprintf(`BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Mike Sanders//Scheduler//EN
CALSCALE:GREGORIAN
METHOD:REQUEST
BEGIN:VEVENT
UID:%s@mike.game
DTSTAMP:%s
DTSTART:%s
DTEND:%s
SUMMARY:%s
DESCRIPTION:%s
LOCATION:%s
ATTENDEE:mailto:%s
ORGANIZER:mailto:hello@mike.game
STATUS:CONFIRMED
SEQUENCE:0
END:VEVENT
END:VCALENDAR`,
		a.ID,
		time.Now().Format("20060102T150405Z"),
		a.StartTime.Format("20060102T150405Z"),
		a.EndTime.Format("20060102T150405Z"),
		fmt.Sprintf("%s with Mike Sanders", a.MeetingTypeTitle),
		fmt.Sprintf("Scheduled meeting: %s", a.MeetingTypeTitle),
		meetingLocation(a),
		a.Email,
	)
}

func dateInRange(date time.Time, startDate string, endDate string) bool {
	start, err := time.Parse("2006-01-02", startDate)
	if err != nil {
		return false
	}
	end, err := time.Parse("2006-01-02", endDate)
	if err != nil {
		return false
	}

	if date.Before(start) {
		return false
	}

	if date.After(end.Add(23 * time.Hour)) {
		return false
	}

	return true
}

func buildDailyWindow(date time.Time, meetingType MeetingType) (time.Time, time.Time, bool) {
	startClock, err := time.Parse("15:04", meetingType.DailyStart)
	if err != nil {
		return time.Time{}, time.Time{}, false
	}
	endClock, err := time.Parse("15:04", meetingType.DailyEnd)
	if err != nil {
		return time.Time{}, time.Time{}, false
	}

	start := time.Date(date.Year(), date.Month(), date.Day(), startClock.Hour(), startClock.Minute(), 0, 0, time.UTC)
	end := time.Date(date.Year(), date.Month(), date.Day(), endClock.Hour(), endClock.Minute(), 0, 0, time.UTC)
	return start, end, true
}

func overlapsBlockedRange(start time.Time, end time.Time, meetingType MeetingType) bool {
	for _, block := range meetingType.Blocked {
		blockStartClock, err := time.Parse("15:04", block.Start)
		if err != nil {
			continue
		}
		blockEndClock, err := time.Parse("15:04", block.End)
		if err != nil {
			continue
		}

		blockStart := time.Date(start.Year(), start.Month(), start.Day(), blockStartClock.Hour(), blockStartClock.Minute(), 0, 0, time.UTC)
		blockEnd := time.Date(start.Year(), start.Month(), start.Day(), blockEndClock.Hour(), blockEndClock.Minute(), 0, 0, time.UTC)

		if start.Before(blockEnd) && end.After(blockStart) {
			return true
		}
	}

	return false
}

func isWithinDailyWindow(start time.Time, end time.Time, meetingType MeetingType) bool {
	dailyStart, dailyEnd, ok := buildDailyWindow(start, meetingType)
	if !ok {
		return false
	}
	if start.Before(dailyStart) {
		return false
	}
	if end.After(dailyEnd) {
		return false
	}
	return true
}

func isOverlappingAppointment(start time.Time, end time.Time) bool {
	for _, appt := range appointments {
		if start.Before(appt.EndTime) && end.After(appt.StartTime) {
			return true
		}
	}
	return false
}

func meetingLocation(a Appointment) string {
	if a.MeetingTypeID == "" {
		return "Virtual"
	}
	meetingType, ok := meetingTypes[a.MeetingTypeID]
	if !ok {
		return "Virtual"
	}
	if meetingType.Mode == "in-person" {
		return "In-person (GDC)"
	}
	return "Virtual"
}

func generateID() string {
	return fmt.Sprintf("%d-%d", time.Now().Unix(), time.Now().Nanosecond())
}

func generateToken() string {
	b := make([]byte, 32)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func sendAdminNotification(pr PendingRequest) {
	baseURL := os.Getenv("BASE_URL")
	if baseURL == "" {
		baseURL = "http://localhost:3001"
	}

	reviewURL := fmt.Sprintf("%s/admin/review?token=%s", baseURL, pr.Token)

	log.Printf("=== NEW MEETING REQUEST ===")
	log.Printf("ID: %s", pr.ID)
	log.Printf("From: %s (%s)", pr.Name, pr.Email)
	log.Printf("Review URL: %s", reviewURL)
	log.Printf("===========================")

	// Call Cloudflare Worker to send email
	workerURL := os.Getenv("EMAIL_WORKER_URL")
	if workerURL == "" {
		log.Println("EMAIL_WORKER_URL not set, skipping email notification")
		return
	}

	emailData := map[string]interface{}{
		"type":        "admin_notification",
		"reviewURL":   reviewURL,
		"name":        pr.Name,
		"email":       pr.Email,
		"company":     pr.Company,
		"role":        pr.Role,
		"meetingType": pr.MeetingTypeTitle,
		"duration":    pr.DurationMinutes,
		"date":        pr.RequestedDate,
		"time":        pr.RequestedTime,
		"timezone":    pr.Timezone,
		"topics":      pr.DiscussionTopics,
		"details":     pr.DiscussionDetails,
	}

	jsonData, _ := json.Marshal(emailData)
	resp, err := http.Post(workerURL, "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		log.Printf("Failed to send admin notification email: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		log.Printf("Email worker returned status %d", resp.StatusCode)
	} else {
		log.Println("Admin notification email sent successfully")
	}
}

func handleAdminReview(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		http.Error(w, "Missing token", http.StatusBadRequest)
		return
	}

	appointmentsMutex.RLock()
	var request *PendingRequest
	for i := range pendingRequests {
		if pendingRequests[i].Token == token {
			request = &pendingRequests[i]
			break
		}
	}
	appointmentsMutex.RUnlock()

	if request == nil {
		http.Error(w, "Request not found", http.StatusNotFound)
		return
	}

	if request.Status != "pending" {
		w.Write([]byte(fmt.Sprintf("<html><body><h2>This request has already been %s</h2></body></html>", request.Status)))
		return
	}

	tmpl := `<!DOCTYPE html>
<html>
<head>
	<title>Review Meeting Request</title>
	<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
	<style>
		body { background: #212428; color: #fff; padding: 2rem; }
		.container { max-width: 800px; }
		.card { background: #1c1e22; border: 1px solid #2d3748; }
		.btn-success { background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); border: none; }
		.btn-danger { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); border: none; }
	</style>
</head>
<body>
	<div class="container">
		<div class="card p-4">
			<h2 class="mb-4">Meeting Request Review</h2>
			<div class="mb-3"><strong>Name:</strong> {{.Name}}</div>
			<div class="mb-3"><strong>Email:</strong> {{.Email}}</div>
			<div class="mb-3"><strong>Company:</strong> {{.Company}}</div>
			<div class="mb-3"><strong>Role:</strong> {{.Role}}</div>
			<div class="mb-3"><strong>Meeting Type:</strong> {{.MeetingTypeTitle}} ({{.DurationMinutes}} minutes)</div>
			<div class="mb-3"><strong>Requested Date:</strong> {{.RequestedDate}} at {{.RequestedTime}} ({{.Timezone}})</div>
			<div class="mb-3"><strong>Discussion Topics:</strong> {{.TopicsStr}}</div>
			<div class="mb-3"><strong>Discussion Details:</strong><br>{{.DiscussionDetails}}</div>
			<div class="d-grid gap-2 mt-4">
				<form method="POST" action="/admin/approve">
					<input type="hidden" name="token" value="{{.Token}}">
					<button type="submit" class="btn btn-success btn-lg w-100">Approve Meeting</button>
				</form>
				<form method="POST" action="/admin/deny" class="mt-2">
					<input type="hidden" name="token" value="{{.Token}}">
					<button type="submit" class="btn btn-danger btn-lg w-100">Decline Meeting</button>
				</form>
			</div>
		</div>
	</div>
</body>
</html>`

	topicsStr := "None selected"
	if len(request.DiscussionTopics) > 0 {
		topicsStr = ""
		for i, topic := range request.DiscussionTopics {
			if i > 0 {
				topicsStr += ", "
			}
			topicsStr += topic
		}
	}

	data := struct {
		*PendingRequest
		TopicsStr string
	}{
		PendingRequest: request,
		TopicsStr:      topicsStr,
	}

	t, _ := template.New("review").Parse(tmpl)
	t.Execute(w, data)
}

func handleApprove(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	token := r.FormValue("token")
	if token == "" {
		http.Error(w, "Missing token", http.StatusBadRequest)
		return
	}

	appointmentsMutex.Lock()
	defer appointmentsMutex.Unlock()

	var request *PendingRequest
	for i := range pendingRequests {
		if pendingRequests[i].Token == token && pendingRequests[i].Status == "pending" {
			request = &pendingRequests[i]
			break
		}
	}

	if request == nil {
		http.Error(w, "Request not found or already processed", http.StatusNotFound)
		return
	}

	// Create appointment
	startTime, _ := time.Parse("2006-01-02 15:04", request.RequestedDate+" "+request.RequestedTime)
	endTime := startTime.Add(time.Duration(request.DurationMinutes) * time.Minute)

	appointment := Appointment{
		ID:                generateID(),
		MeetingTypeID:     request.MeetingTypeID,
		MeetingTypeTitle:  request.MeetingTypeTitle,
		DurationMinutes:   request.DurationMinutes,
		Email:             request.Email,
		Name:              request.Name,
		Company:           request.Company,
		Role:              request.Role,
		DiscussionTopics:  request.DiscussionTopics,
		DiscussionDetails: request.DiscussionDetails,
		StartTime:         startTime,
		EndTime:           endTime,
		Timezone:          request.Timezone,
		CreatedAt:         time.Now(),
	}

	appointments = append(appointments, appointment)
	request.Status = "approved"

	// Send confirmation with iCal to attendee
	sendConfirmationEmail(appointment)

	w.Header().Set("Content-Type", "text/html")
	w.Write([]byte("<html><body><h2>Meeting Approved!</h2><p>A calendar invitation has been sent to the attendee.</p></body></html>"))
}

func handleDeny(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	token := r.FormValue("token")
	if token == "" {
		http.Error(w, "Missing token", http.StatusBadRequest)
		return
	}

	appointmentsMutex.Lock()
	defer appointmentsMutex.Unlock()

	var request *PendingRequest
	for i := range pendingRequests {
		if pendingRequests[i].Token == token && pendingRequests[i].Status == "pending" {
			request = &pendingRequests[i]
			break
		}
	}

	if request == nil {
		http.Error(w, "Request not found or already processed", http.StatusNotFound)
		return
	}

	request.Status = "denied"

	// Send polite decline email
	sendDeclineEmail(*request)

	w.Header().Set("Content-Type", "text/html")
	w.Write([]byte("<html><body><h2>Meeting Declined</h2><p>A polite message has been sent to the requester.</p></body></html>"))
}

func sendDeclineEmail(pr PendingRequest) {
	log.Printf("=== MEETING REQUEST DECLINED ===")
	log.Printf("To: %s (%s)", pr.Name, pr.Email)
	log.Printf("================================")

	// Call Cloudflare Worker to send email
	workerURL := os.Getenv("EMAIL_WORKER_URL")
	if workerURL == "" {
		log.Println("EMAIL_WORKER_URL not set, skipping denial email")
		return
	}

	emailData := map[string]interface{}{
		"type":        "denial",
		"to":          pr.Email,
		"name":        pr.Name,
		"meetingType": pr.MeetingTypeTitle,
		"date":        pr.RequestedDate,
		"time":        pr.RequestedTime,
		"timezone":    pr.Timezone,
	}

	jsonData, _ := json.Marshal(emailData)
	resp, err := http.Post(workerURL, "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		log.Printf("Failed to send denial email: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		log.Printf("Email worker returned status %d", resp.StatusCode)
	} else {
		log.Println("Denial email sent successfully")
	}
}
