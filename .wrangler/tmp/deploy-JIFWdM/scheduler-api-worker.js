var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// scheduler-api-worker.js
var scheduler_api_worker_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }
    try {
      if (url.pathname === "/api/availability" && request.method === "GET") {
        return handleAvailability(request, url, corsHeaders, env);
      } else if (url.pathname === "/api/book" && request.method === "POST") {
        return handleBook(request, env, corsHeaders);
      } else if (url.pathname === "/api/admin/approve" && request.method === "POST") {
        return handleApprove(request, env, corsHeaders);
      } else if (url.pathname === "/api/admin/deny" && request.method === "POST") {
        return handleDeny(request, env, corsHeaders);
      } else if (url.pathname === "/api/admin/request" && request.method === "GET") {
        return handleGetRequest(request, url, env, corsHeaders);
      } else if (url.pathname === "/api/cancel" && request.method === "POST") {
        return handleCancel(request, env, corsHeaders);
      } else if (url.pathname === "/api/booking" && request.method === "GET") {
        return handleGetBooking(request, url, env, corsHeaders);
      } else {
        return new Response("Not found", { status: 404, headers: corsHeaders });
      }
    } catch (error) {
      console.error("Error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }
  }
};
var MEETING_TYPES = {
  "gdc-pleasant-talk": {
    id: "gdc-pleasant-talk",
    title: "Pleasant Talk",
    durationMinutes: 40,
    dateStart: /* @__PURE__ */ new Date("2026-03-09"),
    dateEnd: /* @__PURE__ */ new Date("2026-03-13"),
    dailyStart: 8.5,
    dailyEnd: 17.5
  },
  "gdc-quick-chat": {
    id: "gdc-quick-chat",
    title: "Quick Chat",
    durationMinutes: 20,
    dateStart: /* @__PURE__ */ new Date("2026-03-09"),
    dateEnd: /* @__PURE__ */ new Date("2026-03-13"),
    dailyStart: 8.5,
    dailyEnd: 17.5
  },
  "gdc-lunch": {
    id: "gdc-lunch",
    title: "Lunch",
    durationMinutes: 60,
    dateStart: /* @__PURE__ */ new Date("2026-03-09"),
    dateEnd: /* @__PURE__ */ new Date("2026-03-13"),
    dailyStart: 12,
    dailyEnd: 13
  },
  "gdc-dinner": {
    id: "gdc-dinner",
    title: "Dinner",
    durationMinutes: 90,
    dateStart: /* @__PURE__ */ new Date("2026-03-09"),
    dateEnd: /* @__PURE__ */ new Date("2026-03-13"),
    dailyStart: 18,
    dailyEnd: 18.5
  }
};
function getTimezoneOffset(timezone) {
  const tzOffsets = {
    "America/Los_Angeles": "-08:00",
    // PST
    "America/Denver": "-07:00",
    "America/Chicago": "-06:00",
    "America/New_York": "-05:00",
    "UTC": "+00:00"
  };
  return tzOffsets[timezone] || "-08:00";
}
__name(getTimezoneOffset, "getTimezoneOffset");
async function getGoogleAccessToken(env) {
  if (!env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not configured");
  }
  const serviceAccount = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const now = Math.floor(Date.now() / 1e3);
  const expiry = now + 3600;
  const header = {
    alg: "RS256",
    typ: "JWT"
  };
  const claimSet = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/calendar",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: expiry
  };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedClaimSet = base64UrlEncode(JSON.stringify(claimSet));
  const signatureInput = `${encodedHeader}.${encodedClaimSet}`;
  const signature = await signJWT(signatureInput, serviceAccount.private_key);
  const jwt = `${signatureInput}.${signature}`;
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    })
  });
  if (!tokenResponse.ok) {
    const error = await tokenResponse.text();
    throw new Error(`Failed to get access token: ${error}`);
  }
  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}
__name(getGoogleAccessToken, "getGoogleAccessToken");
async function signJWT(data, privateKeyPem) {
  const pemContents = privateKeyPem.replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\s/g, "");
  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    encoder.encode(data)
  );
  return base64UrlEncode(signature);
}
__name(signJWT, "signJWT");
function base64UrlEncode(data) {
  let base64;
  if (typeof data === "string") {
    base64 = btoa(data);
  } else if (data instanceof ArrayBuffer) {
    const bytes = new Uint8Array(data);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    base64 = btoa(binary);
  } else {
    throw new Error("Unsupported data type for base64 encoding");
  }
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
__name(base64UrlEncode, "base64UrlEncode");
function getLocalDateParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const get = /* @__PURE__ */ __name((type) => parts.find((p) => p.type === type).value, "get");
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = parseInt(get("hour"), 10);
  const minute = parseInt(get("minute"), 10);
  return {
    dateStr: `${year}-${month}-${day}`,
    minutes: hour * 60 + minute
  };
}
__name(getLocalDateParts, "getLocalDateParts");
function getTimeZoneOffsetMinutes(utcDate, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(utcDate);
  const get = /* @__PURE__ */ __name((type) => parts.find((p) => p.type === type).value, "get");
  const localAsUtc = Date.UTC(
    parseInt(get("year"), 10),
    parseInt(get("month"), 10) - 1,
    parseInt(get("day"), 10),
    parseInt(get("hour"), 10),
    parseInt(get("minute"), 10),
    parseInt(get("second"), 10)
  );
  return (localAsUtc - utcDate.getTime()) / 6e4;
}
__name(getTimeZoneOffsetMinutes, "getTimeZoneOffsetMinutes");
function getUtcDateForLocal(dateStr, timeStr, timeZone) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute, second = 0] = timeStr.split(":").map(Number);
  let utcDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const offsetMinutes = getTimeZoneOffsetMinutes(utcDate, timeZone);
  utcDate = new Date(utcDate.getTime() - offsetMinutes * 6e4);
  return utcDate;
}
__name(getUtcDateForLocal, "getUtcDateForLocal");
async function getCalendarBusyIntervals(dateStr, env) {
  const timeZone = env.TIME_ZONE || "America/Los_Angeles";
  if (!env.GOOGLE_CALENDAR_ID) {
    console.warn("GOOGLE_CALENDAR_ID not configured, skipping calendar check");
    return [];
  }
  try {
    const accessToken = await getGoogleAccessToken(env);
    const calendarId = env.GOOGLE_CALENDAR_ID;
    const timeMin = getUtcDateForLocal(dateStr, "00:00:00", timeZone).toISOString();
    const timeMax = getUtcDateForLocal(dateStr, "23:59:59", timeZone).toISOString();
    const response = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        timeMin,
        timeMax,
        timeZone,
        items: [{ id: calendarId }]
      })
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`FreeBusy API error: ${error}`);
    }
    const data = await response.json();
    const busy = data.calendars && data.calendars[calendarId] && data.calendars[calendarId].busy || [];
    const intervals = [];
    for (const block of busy) {
      const blockStart = new Date(block.start);
      const blockEnd = new Date(block.end);
      const startParts = getLocalDateParts(blockStart, timeZone);
      const endParts = getLocalDateParts(blockEnd, timeZone);
      if (startParts.dateStr > dateStr || endParts.dateStr < dateStr) {
        continue;
      }
      let startMinutes = startParts.minutes;
      let endMinutes = endParts.minutes;
      if (startParts.dateStr < dateStr) {
        startMinutes = 0;
      }
      if (endParts.dateStr > dateStr) {
        endMinutes = 24 * 60;
      }
      intervals.push({ startMinutes, endMinutes });
    }
    return intervals;
  } catch (error) {
    console.error("Error fetching free/busy:", error);
    return [];
  }
}
__name(getCalendarBusyIntervals, "getCalendarBusyIntervals");
async function createCalendarEvent(booking, env) {
  if (!env.GOOGLE_CALENDAR_ID) {
    console.warn("GOOGLE_CALENDAR_ID not configured, skipping calendar event creation");
    return null;
  }
  try {
    const accessToken = await getGoogleAccessToken(env);
    const calendarId = env.GOOGLE_CALENDAR_ID;
    const timezone = booking.timezone || "America/Los_Angeles";
    const startDateTime = `${booking.date}T${booking.time}:00`;
    const [hours, minutes] = booking.time.split(":").map(Number);
    const totalMinutes = hours * 60 + minutes + booking.durationMinutes;
    const endHours = Math.floor(totalMinutes / 60);
    const endMinutes = totalMinutes % 60;
    const endTime = `${String(endHours).padStart(2, "0")}:${String(endMinutes).padStart(2, "0")}`;
    const endDateTime = `${booking.date}T${endTime}:00`;
    console.log("Creating calendar event:", {
      startDateTime,
      endDateTime,
      timezone,
      calendarId
    });
    let descriptionParts = [
      `ATTENDEE INFORMATION`,
      `Name: ${booking.name}`,
      `Email: ${booking.email}`
    ];
    if (booking.company) {
      descriptionParts.push(`Company: ${booking.company}`);
    }
    if (booking.role) {
      descriptionParts.push(`Role: ${booking.role}`);
    }
    if (booking.location) {
      descriptionParts.push("");
      descriptionParts.push("LOCATION");
      descriptionParts.push(booking.location);
    }
    if (booking.discussionTopics && booking.discussionTopics.length > 0) {
      descriptionParts.push("");
      descriptionParts.push("DISCUSSION TOPICS");
      booking.discussionTopics.forEach((topic) => {
        descriptionParts.push(`\u2022 ${topic}`);
      });
    }
    if (booking.discussionDetails) {
      descriptionParts.push("");
      descriptionParts.push("DETAILS & NOTES");
      descriptionParts.push(booking.discussionDetails);
    }
    const description = descriptionParts.join("\n");
    const event = {
      summary: `${booking.meetingTypeTitle} - ${booking.name}`,
      description,
      location: booking.location || "",
      start: {
        dateTime: startDateTime,
        timeZone: timezone
      },
      end: {
        dateTime: endDateTime,
        timeZone: timezone
      },
      // Note: Not adding attendees because service accounts need Domain-Wide Delegation to invite
      // The attendee gets a separate .ics file via email
      reminders: {
        useDefault: false,
        overrides: [
          { method: "email", minutes: 24 * 60 },
          { method: "popup", minutes: 30 }
        ]
      }
    };
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        calendarId
      )}/events`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(event)
      }
    );
    if (!response.ok) {
      const error = await response.text();
      console.error("Calendar API error response:", error);
      throw new Error(`Failed to create calendar event: ${error}`);
    }
    const createdEvent = await response.json();
    console.log("Calendar event created successfully:", createdEvent.id, createdEvent.htmlLink);
    return createdEvent;
  } catch (error) {
    console.error("Error creating calendar event:", error);
    console.error("Booking details:", {
      date: booking.date,
      time: booking.time,
      timezone: booking.timezone,
      duration: booking.durationMinutes
    });
    return null;
  }
}
__name(createCalendarEvent, "createCalendarEvent");
function getMeetingType(id) {
  const mt = MEETING_TYPES[id];
  if (!mt) return null;
  return { ...mt };
}
__name(getMeetingType, "getMeetingType");
function dateInRange(date, startDate, endDate) {
  return date >= startDate && date <= endDate;
}
__name(dateInRange, "dateInRange");
function parseTimeToMinutes(timeStr) {
  const [hour, minute] = timeStr.split(":").map(Number);
  return hour * 60 + minute;
}
__name(parseTimeToMinutes, "parseTimeToMinutes");
function minutesToTime(minutes) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
}
__name(minutesToTime, "minutesToTime");
function overlapsBlockedRangeMinutes(startMinutes, endMinutes, meetingType) {
  if (meetingType.id !== "gdc-lunch") {
    const blockedStart = 11 * 60 + 45;
    const blockedEnd = 13 * 60 + 15;
    return timesOverlapMinutes(startMinutes, endMinutes, blockedStart, blockedEnd);
  }
  return false;
}
__name(overlapsBlockedRangeMinutes, "overlapsBlockedRangeMinutes");
function timesOverlapMinutes(start1, end1, start2, end2) {
  return start1 < end2 && end1 > start2;
}
__name(timesOverlapMinutes, "timesOverlapMinutes");
function hasConflictWithIntervals(slotStartMinutes, slotEndMinutes, intervals) {
  for (const interval of intervals) {
    if (timesOverlapMinutes(slotStartMinutes, slotEndMinutes, interval.startMinutes, interval.endMinutes)) {
      return true;
    }
  }
  return false;
}
__name(hasConflictWithIntervals, "hasConflictWithIntervals");
async function getAvailableSlots(dateStr, meetingTypeId, env) {
  const meetingType = getMeetingType(meetingTypeId);
  if (!meetingType) return [];
  const date = /* @__PURE__ */ new Date(dateStr + "T00:00:00");
  const slots = [];
  if (!dateInRange(date, meetingType.dateStart, meetingType.dateEnd)) {
    return slots;
  }
  const busyIntervals = await getCalendarBusyIntervals(dateStr, env);
  const slotIntervalMinutes = 10;
  const meetingDuration = meetingType.durationMinutes;
  const dayStartMinutes = meetingType.dailyStart * 60;
  const dayEndMinutes = meetingType.dailyEnd * 60;
  for (let currentMinutes = dayStartMinutes; currentMinutes <= dayEndMinutes; currentMinutes += slotIntervalMinutes) {
    const slotEndMinutes = currentMinutes + meetingDuration;
    const available = slotEndMinutes <= dayEndMinutes + meetingDuration && !overlapsBlockedRangeMinutes(currentMinutes, slotEndMinutes, meetingType) && !hasConflictWithIntervals(currentMinutes, slotEndMinutes, busyIntervals);
    slots.push({
      time: minutesToTime(currentMinutes),
      available
    });
  }
  return slots;
}
__name(getAvailableSlots, "getAvailableSlots");
async function handleAvailability(request, url, corsHeaders, env) {
  const date = url.searchParams.get("date");
  const meetingTypeId = url.searchParams.get("meeting_type");
  if (!date || !meetingTypeId) {
    return new Response(
      JSON.stringify({
        error: "Missing required parameters: date, meeting_type"
      }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
  const slots = await getAvailableSlots(date, meetingTypeId, env);
  return new Response(JSON.stringify(slots), {
    headers: { "Content-Type": "application/json", ...corsHeaders }
  });
}
__name(handleAvailability, "handleAvailability");
async function handleBook(request, env, corsHeaders) {
  const body = await request.json();
  const {
    name,
    email,
    company,
    role,
    date,
    time,
    timezone,
    meeting_type_id,
    discussion_topics,
    discussion_details,
    location
  } = body;
  if (!name || !email || !date || !time || !meeting_type_id || !discussion_details || !location) {
    return new Response(JSON.stringify({ error: "Missing required fields" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }
  const meetingType = getMeetingType(meeting_type_id);
  if (!meetingType) {
    return new Response(JSON.stringify({ error: "Invalid meeting type" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }
  const dateObj = /* @__PURE__ */ new Date(date + "T00:00:00");
  if (isNaN(dateObj.getTime())) {
    return new Response(JSON.stringify({ error: "Invalid date format" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }
  if (!/^\d{2}:\d{2}$/.test(time)) {
    return new Response(JSON.stringify({ error: "Invalid time format" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }
  if (!dateInRange(dateObj, meetingType.dateStart, meetingType.dateEnd)) {
    return new Response(
      JSON.stringify({ error: "Selected date is not available for this meeting type" }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
  const startMinutes = parseTimeToMinutes(time);
  const endMinutes = startMinutes + meetingType.durationMinutes;
  const dayStartMinutes = meetingType.dailyStart * 60;
  const dayEndMinutes = meetingType.dailyEnd * 60;
  if (startMinutes < dayStartMinutes || startMinutes > dayEndMinutes || endMinutes > dayEndMinutes + meetingType.durationMinutes) {
    return new Response(
      JSON.stringify({ error: "Selected time is outside of available hours" }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
  if (overlapsBlockedRangeMinutes(startMinutes, endMinutes, meetingType)) {
    return new Response(
      JSON.stringify({ error: "Selected time overlaps a blocked period" }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
  const busyIntervals = await getCalendarBusyIntervals(date, env);
  if (hasConflictWithIntervals(startMinutes, endMinutes, busyIntervals)) {
    return new Response(
      JSON.stringify({ error: "Selected time conflicts with an existing booking" }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
  const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2);
  const token = await generateToken();
  const pendingRequest = {
    id: requestId,
    token,
    name,
    email,
    company,
    role,
    meetingTypeId: meeting_type_id,
    meetingTypeTitle: meetingType.title,
    durationMinutes: meetingType.durationMinutes,
    requestedDate: date,
    requestedTime: time,
    timezone: timezone || "America/Los_Angeles",
    location,
    discussionTopics: discussion_topics || [],
    discussionDetails: discussion_details,
    status: "pending",
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  await env.SCHEDULER_KV.put(
    `request:${requestId}`,
    JSON.stringify(pendingRequest),
    { expirationTtl: 7 * 24 * 60 * 60 }
    // 7 days
  );
  const baseURL = env.BASE_URL || "https://meet.mike.game";
  const reviewURL = `${baseURL}/admin/review?token=${token}`;
  const emailWorkerURL = env.EMAIL_WORKER_URL;
  if (emailWorkerURL) {
    try {
      await fetch(emailWorkerURL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "admin_notification",
          reviewURL,
          name,
          email,
          company,
          role,
          meetingType: meetingType.title,
          duration: meetingType.durationMinutes,
          date,
          time,
          timezone: timezone || "America/Los_Angeles",
          location,
          topics: discussion_topics || [],
          details: discussion_details
        })
      });
    } catch (err) {
      console.error("Failed to send admin notification:", err);
    }
  }
  return new Response(JSON.stringify({ success: true, id: requestId }), {
    headers: { "Content-Type": "application/json", ...corsHeaders }
  });
}
__name(handleBook, "handleBook");
async function generateToken() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(generateToken, "generateToken");
async function handleGetRequest(request, url, env, corsHeaders) {
  const token = url.searchParams.get("token");
  if (!token) {
    return new Response(JSON.stringify({ error: "Missing token" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }
  const listResult = await env.SCHEDULER_KV.list({ prefix: "request:" });
  for (const key of listResult.keys) {
    const data = await env.SCHEDULER_KV.get(key.name);
    if (data) {
      const req = JSON.parse(data);
      if (req.token === token) {
        return new Response(JSON.stringify(req), {
          headers: { "Content-Type": "application/json", ...corsHeaders }
        });
      }
    }
  }
  return new Response(JSON.stringify({ error: "Request not found" }), {
    status: 404,
    headers: { "Content-Type": "application/json", ...corsHeaders }
  });
}
__name(handleGetRequest, "handleGetRequest");
async function handleApprove(request, env, corsHeaders) {
  const body = await request.json();
  const { token } = body;
  if (!token) {
    return new Response(JSON.stringify({ error: "Missing token" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }
  const listResult = await env.SCHEDULER_KV.list({ prefix: "request:" });
  let pendingRequest = null;
  let requestKey = null;
  for (const key of listResult.keys) {
    const data = await env.SCHEDULER_KV.get(key.name);
    if (data) {
      const req = JSON.parse(data);
      if (req.token === token) {
        pendingRequest = req;
        requestKey = key.name;
        break;
      }
    }
  }
  if (!pendingRequest) {
    return new Response(JSON.stringify({ error: "Request not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }
  if (pendingRequest.status !== "pending") {
    return new Response(
      JSON.stringify({ error: `Request already ${pendingRequest.status}` }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
  const startMinutes = parseTimeToMinutes(pendingRequest.requestedTime);
  const endMinutes = startMinutes + pendingRequest.durationMinutes;
  const busyIntervals = await getCalendarBusyIntervals(pendingRequest.requestedDate, env);
  if (hasConflictWithIntervals(startMinutes, endMinutes, busyIntervals)) {
    return new Response(
      JSON.stringify({ error: "Time slot is no longer available due to a conflict" }),
      { status: 409, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
  const cancellationToken = await generateToken();
  const booking = {
    id: pendingRequest.id,
    cancellationToken,
    name: pendingRequest.name,
    email: pendingRequest.email,
    company: pendingRequest.company,
    role: pendingRequest.role,
    meetingTypeId: pendingRequest.meetingTypeId,
    meetingTypeTitle: pendingRequest.meetingTypeTitle,
    durationMinutes: pendingRequest.durationMinutes,
    date: pendingRequest.requestedDate,
    time: pendingRequest.requestedTime,
    timezone: pendingRequest.timezone,
    location: pendingRequest.location,
    discussionTopics: pendingRequest.discussionTopics,
    discussionDetails: pendingRequest.discussionDetails,
    status: "approved",
    approvedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  const calendarEvent = await createCalendarEvent(booking, env);
  if (calendarEvent) {
    booking.calendarEventId = calendarEvent.id;
    booking.calendarEventLink = calendarEvent.htmlLink;
  }
  await env.SCHEDULER_KV.put(
    `booking:${booking.id}`,
    JSON.stringify(booking),
    { expirationTtl: 90 * 24 * 60 * 60 }
    // 90 days
  );
  pendingRequest.status = "approved";
  await env.SCHEDULER_KV.put(requestKey, JSON.stringify(pendingRequest), {
    expirationTtl: 7 * 24 * 60 * 60
  });
  const emailWorkerURL = env.EMAIL_WORKER_URL;
  if (emailWorkerURL) {
    try {
      const [year, month, day] = booking.date.split("-").map(Number);
      const [hours, minutes] = booking.time.split(":").map(Number);
      const tzOffset = getTimezoneOffset(booking.timezone);
      const startDateTime = /* @__PURE__ */ new Date(`${booking.date}T${booking.time}:00${tzOffset}`);
      const endDateTime = new Date(startDateTime);
      endDateTime.setMinutes(endDateTime.getMinutes() + booking.durationMinutes);
      const baseURL = env.BASE_URL || "https://meet.mike.game";
      const cancellationURL = `${baseURL}/cancel?token=${cancellationToken}`;
      console.log("Sending approval email to attendee:", booking.email);
      const attendeeEmailResponse = await fetch(emailWorkerURL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "approval",
          to: booking.email,
          appointmentId: booking.id,
          name: booking.name,
          email: booking.email,
          company: booking.company,
          role: booking.role,
          meetingType: booking.meetingTypeTitle,
          duration: booking.durationMinutes,
          startTime: startDateTime.toISOString(),
          endTime: endDateTime.toISOString(),
          timezone: booking.timezone,
          location: booking.location,
          topics: booking.discussionTopics,
          details: booking.discussionDetails,
          cancellationURL
        })
      });
      const attendeeResult = await attendeeEmailResponse.json();
      console.log("Attendee email response:", attendeeResult);
      console.log("Sending admin confirmation to:", env.GOOGLE_CALENDAR_ID);
      const adminEmailResponse = await fetch(emailWorkerURL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "admin_confirmed",
          to: env.GOOGLE_CALENDAR_ID,
          appointmentId: booking.id,
          name: booking.name,
          email: booking.email,
          company: booking.company,
          role: booking.role,
          meetingType: booking.meetingTypeTitle,
          duration: booking.durationMinutes,
          startTime: startDateTime.toISOString(),
          endTime: endDateTime.toISOString(),
          timezone: booking.timezone,
          location: booking.location,
          topics: booking.discussionTopics,
          details: booking.discussionDetails,
          calendarEventLink: calendarEvent ? calendarEvent.htmlLink : null,
          cancellationURL
        })
      });
      const adminResult = await adminEmailResponse.json();
      console.log("Admin email response:", adminResult);
    } catch (err) {
      console.error("Failed to send emails:", err);
    }
  }
  return new Response(JSON.stringify({ success: true, booking }), {
    headers: { "Content-Type": "application/json", ...corsHeaders }
  });
}
__name(handleApprove, "handleApprove");
async function handleDeny(request, env, corsHeaders) {
  const body = await request.json();
  const { token, reason } = body;
  if (!token) {
    return new Response(JSON.stringify({ error: "Missing token" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }
  const listResult = await env.SCHEDULER_KV.list({ prefix: "request:" });
  let pendingRequest = null;
  let requestKey = null;
  for (const key of listResult.keys) {
    const data = await env.SCHEDULER_KV.get(key.name);
    if (data) {
      const req = JSON.parse(data);
      if (req.token === token) {
        pendingRequest = req;
        requestKey = key.name;
        break;
      }
    }
  }
  if (!pendingRequest) {
    return new Response(JSON.stringify({ error: "Request not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }
  if (pendingRequest.status !== "pending") {
    return new Response(
      JSON.stringify({ error: `Request already ${pendingRequest.status}` }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
  pendingRequest.status = "denied";
  pendingRequest.deniedAt = (/* @__PURE__ */ new Date()).toISOString();
  pendingRequest.denialReason = reason;
  await env.SCHEDULER_KV.put(requestKey, JSON.stringify(pendingRequest), {
    expirationTtl: 7 * 24 * 60 * 60
  });
  const emailWorkerURL = env.EMAIL_WORKER_URL;
  if (emailWorkerURL) {
    try {
      await fetch(emailWorkerURL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "denial",
          to: pendingRequest.email,
          name: pendingRequest.name
        })
      });
    } catch (err) {
      console.error("Failed to send denial email:", err);
    }
  }
  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json", ...corsHeaders }
  });
}
__name(handleDeny, "handleDeny");
async function handleGetBooking(request, url, env, corsHeaders) {
  const token = url.searchParams.get("token");
  if (!token) {
    return new Response(JSON.stringify({ error: "Missing token" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }
  const listResult = await env.SCHEDULER_KV.list({ prefix: "booking:" });
  let booking = null;
  for (const key of listResult.keys) {
    const data = await env.SCHEDULER_KV.get(key.name);
    if (data) {
      const b = JSON.parse(data);
      if (b.cancellationToken === token) {
        booking = b;
        break;
      }
    }
  }
  if (!booking) {
    return new Response(JSON.stringify({ error: "Booking not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }
  if (booking.status === "cancelled") {
    return new Response(JSON.stringify({ error: "Booking already cancelled" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }
  return new Response(JSON.stringify(booking), {
    headers: { "Content-Type": "application/json", ...corsHeaders }
  });
}
__name(handleGetBooking, "handleGetBooking");
async function handleCancel(request, env, corsHeaders) {
  const body = await request.json();
  const { token } = body;
  if (!token) {
    return new Response(JSON.stringify({ error: "Missing token" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }
  const listResult = await env.SCHEDULER_KV.list({ prefix: "booking:" });
  let booking = null;
  let bookingKey = null;
  for (const key of listResult.keys) {
    const data = await env.SCHEDULER_KV.get(key.name);
    if (data) {
      const b = JSON.parse(data);
      if (b.cancellationToken === token) {
        booking = b;
        bookingKey = key.name;
        break;
      }
    }
  }
  if (!booking) {
    return new Response(JSON.stringify({ error: "Booking not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }
  if (booking.status === "cancelled") {
    return new Response(JSON.stringify({ error: "Booking already cancelled" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }
  if (booking.calendarEventId) {
    try {
      await deleteCalendarEvent(booking.calendarEventId, env);
    } catch (error) {
      console.error("Failed to delete calendar event:", error);
    }
  }
  booking.status = "cancelled";
  booking.cancelledAt = (/* @__PURE__ */ new Date()).toISOString();
  await env.SCHEDULER_KV.put(bookingKey, JSON.stringify(booking), {
    expirationTtl: 30 * 24 * 60 * 60
    // Keep for 30 days
  });
  const emailWorkerURL = env.EMAIL_WORKER_URL;
  if (emailWorkerURL) {
    try {
      const startDateTime = /* @__PURE__ */ new Date(`${booking.date}T${booking.time}`);
      await fetch(emailWorkerURL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "cancellation",
          to: booking.email,
          name: booking.name,
          meetingType: booking.meetingTypeTitle,
          date: booking.date,
          time: booking.time,
          timezone: booking.timezone
        })
      });
      await fetch(emailWorkerURL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "cancellation_admin",
          to: env.GOOGLE_CALENDAR_ID,
          name: booking.name,
          email: booking.email,
          meetingType: booking.meetingTypeTitle,
          date: booking.date,
          time: booking.time,
          timezone: booking.timezone
        })
      });
    } catch (err) {
      console.error("Failed to send cancellation emails:", err);
    }
  }
  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json", ...corsHeaders }
  });
}
__name(handleCancel, "handleCancel");
async function deleteCalendarEvent(eventId, env) {
  if (!env.GOOGLE_CALENDAR_ID) {
    console.warn("GOOGLE_CALENDAR_ID not configured");
    return;
  }
  const accessToken = await getGoogleAccessToken(env);
  const calendarId = env.GOOGLE_CALENDAR_ID;
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      calendarId
    )}/events/${encodeURIComponent(eventId)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );
  if (!response.ok && response.status !== 404) {
    const error = await response.text();
    throw new Error(`Failed to delete calendar event: ${error}`);
  }
}
__name(deleteCalendarEvent, "deleteCalendarEvent");
export {
  scheduler_api_worker_default as default
};
//# sourceMappingURL=scheduler-api-worker.js.map
