/**
 * Cloudflare Worker for Scheduler API
 * Handles meeting availability and booking requests
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      if (url.pathname === '/api/availability' && request.method === 'GET') {
        return handleAvailability(request, url, corsHeaders, env);
      } else if (url.pathname === '/api/availability-days' && request.method === 'GET') {
        return handleAvailabilityDays(url, corsHeaders, env);
      } else if (url.pathname === '/api/book' && request.method === 'POST') {
        return handleBook(request, env, corsHeaders);
      } else if (url.pathname === '/api/admin/approve' && request.method === 'POST') {
        return handleApprove(request, env, corsHeaders);
      } else if (url.pathname === '/api/admin/deny' && request.method === 'POST') {
        return handleDeny(request, env, corsHeaders);
      } else if (url.pathname === '/api/admin/acknowledge' && request.method === 'POST') {
        return handleAcknowledge(request, env, corsHeaders);
      } else if (url.pathname === '/api/admin/resend-confirmation' && request.method === 'POST') {
        return handleResendConfirmation(request, env, corsHeaders);
      } else if (url.pathname === '/api/admin/request' && request.method === 'GET') {
        return handleGetRequest(request, url, env, corsHeaders);
      } else if (url.pathname === '/api/cancel' && request.method === 'POST') {
        return handleCancel(request, env, corsHeaders);
      } else if (url.pathname === '/api/reschedule' && request.method === 'POST') {
        return handleReschedule(request, env, corsHeaders);
      } else if (url.pathname === '/api/reschedule/respond' && request.method === 'GET') {
        return handleRescheduleResponse(request, url, env, corsHeaders);
      } else if (url.pathname === '/api/booking' && request.method === 'GET') {
        return handleGetBooking(request, url, env, corsHeaders);
      } else if (url.pathname === '/api/calendly/login' && request.method === 'GET') {
        return handleCalendlyLogin(url, env);
      } else if (url.pathname === '/api/calendly/callback' && request.method === 'GET') {
        return handleCalendlyCallback(url, env);
      } else if (url.pathname === '/api/calendly/busy' && request.method === 'POST') {
        return handleCalendlyBusy(request, env, corsHeaders);
      } else {
        return new Response('Not found', { status: 404, headers: corsHeaders });
      }
    } catch (error) {
      console.error('Error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
  },
};

// dailyStart/dailyEnd are the start-time window in hours (dailyEnd = latest start).
// weekdayDailyEnd overrides dailyEnd on Mon-Fri: work calls run 15:00-18:00 Koln time,
// and evenings are reserved for dinner, so weekday daytime meetings must end by 15:00.
const MEETING_TYPES = {
  'gamescom-chat': {
    id: 'gamescom-chat',
    title: "Gamescom: Let's Chat!",
    durationMinutes: 25,
    dateStart: new Date('2026-08-23'),
    dateEnd: new Date('2026-08-28'),
    dailyStart: 9.5,
    dailyEnd: 17.5,
    weekdayDailyEnd: 14.5,
  },
  'gamescom-lunch': {
    id: 'gamescom-lunch',
    title: "Gamescom: Let's Grab Lunch!",
    durationMinutes: 50,
    dateStart: new Date('2026-08-23'),
    dateEnd: new Date('2026-08-28'),
    dailyStart: 12,
    dailyEnd: 12,
  },
  'gamescom-dinner': {
    id: 'gamescom-dinner',
    title: 'Gamescom: Dinner & Drinks',
    durationMinutes: 90,
    dateStart: new Date('2026-08-22'),
    dateEnd: new Date('2026-08-28'),
    dailyStart: 18.5,
    dailyEnd: 19.5,
  },
  'gamescom-coffee': {
    id: 'gamescom-coffee',
    title: 'Gamescom: Rise & Shine',
    durationMinutes: 30,
    dateStart: new Date('2026-08-23'),
    dateEnd: new Date('2026-08-28'),
    dailyStart: 9,
    dailyEnd: 9,
  },
  // Hidden types, only shown on the site after entering an access code.
  'gamescom-extended': {
    id: 'gamescom-extended',
    title: 'Gamescom: Extended Play',
    durationMinutes: 50,
    dateStart: new Date('2026-08-23'),
    dateEnd: new Date('2026-08-28'),
    dailyStart: 9.5,
    dailyEnd: 17,
    weekdayDailyEnd: 14,
  },
  'gamescom-hour': {
    id: 'gamescom-hour',
    title: 'Gamescom: The Full Hour',
    durationMinutes: 60,
    dateStart: new Date('2026-08-23'),
    dateEnd: new Date('2026-08-28'),
    dailyStart: 9.5,
    dailyEnd: 17,
    weekdayDailyEnd: 14,
  },
};

// Lunch/coffee/dinner get a one-per-day limit.
const SPECIAL_MEETING_TYPES = ['gamescom-lunch', 'gamescom-coffee', 'gamescom-dinner'];

// Lunch ends 12:50 and hands off to the 13:00 block (10 minutes of slack);
// dinner keeps 15. Coffee hands off directly to the 9:30 block.
function specialBufferMinutes(meetingTypeId) {
  if (meetingTypeId === 'gamescom-lunch') return 10;
  if (meetingTypeId === 'gamescom-dinner') return 15;
  return 0;
}

// The 11:30 block hands off to lunch: 5 minutes of it go to getting there.
function effectiveDurationMinutes(meetingType, time) {
  if (time === '11:30' && !SPECIAL_MEETING_TYPES.includes(meetingType.id)) {
    return meetingType.durationMinutes - 5;
  }
  return meetingType.durationMinutes;
}

const TOPIC_LABELS = {
  collaboration: 'Collaboration Opportunity',
  feedback: 'Project Feedback',
  career: 'Career Advice',
  speaking: 'Speaking/Panel Opportunity',
  technical: 'Technical Discussion',
  networking: 'Networking / Catch Up',
};

function mapTopicLabels(topics = []) {
  return topics.map(topic => TOPIC_LABELS[topic] || topic);
}

// ===== Google Calendar Integration =====

/**
 * Get OAuth 2.0 token for Google Calendar API using Service Account
 */
async function getGoogleAccessToken(env) {
  if (!env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not configured');
  }

  const serviceAccount = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const now = Math.floor(Date.now() / 1000);
  const expiry = now + 3600;

  // Create JWT header and claim set
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  const claimSet = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/calendar',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: expiry,
  };

  // Encode header and claim set
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedClaimSet = base64UrlEncode(JSON.stringify(claimSet));
  const signatureInput = `${encodedHeader}.${encodedClaimSet}`;

  // Sign with private key
  const signature = await signJWT(signatureInput, serviceAccount.private_key);
  const jwt = `${signatureInput}.${signature}`;

  // Exchange JWT for access token
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!tokenResponse.ok) {
    const error = await tokenResponse.text();
    throw new Error(`Failed to get access token: ${error}`);
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

/**
 * Sign JWT with RSA-SHA256
 */
async function signJWT(data, privateKeyPem) {
  // Parse PEM private key
  const pemContents = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');

  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  // Import key for signing
  const key = await crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  );

  // Sign the data
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    encoder.encode(data)
  );

  return base64UrlEncode(signature);
}

/**
 * Base64 URL encode
 */
function base64UrlEncode(data) {
  let base64;
  if (typeof data === 'string') {
    base64 = btoa(data);
  } else if (data instanceof ArrayBuffer) {
    const bytes = new Uint8Array(data);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    base64 = btoa(binary);
  } else {
    throw new Error('Unsupported data type for base64 encoding');
  }

  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Get calendar events for a specific date
 */
async function getCalendarEvents(dateStr, env) {
  if (!env.GOOGLE_CALENDAR_ID) {
    console.warn('GOOGLE_CALENDAR_ID not configured, skipping calendar check');
    return [];
  }

  try {
    const accessToken = await getGoogleAccessToken(env);
    const calendarId = env.GOOGLE_CALENDAR_ID;

    const timeZone = env.TIME_ZONE || 'Europe/Berlin';

    // Set time range for the entire day using timezone-aware conversion
    const startOfDay = getUtcDateForLocal(dateStr, '00:00:00', timeZone);
    const endOfDay = getUtcDateForLocal(dateStr, '23:59:59', timeZone);

    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        calendarId
      )}/events`
    );
    url.searchParams.set('timeMin', startOfDay.toISOString());
    url.searchParams.set('timeMax', endOfDay.toISOString());
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Calendar API error: ${error}`);
    }

    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.error('Error fetching calendar events:', error);
    // Return empty array to gracefully degrade if calendar unavailable
    return [];
  }
}

/**
 * Get local date parts and minutes for a given Date in a specific timezone
 */
function getLocalDateParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type) => parts.find(p => p.type === type).value;
  const year = get('year');
  const month = get('month');
  const day = get('day');
  const hour = parseInt(get('hour'), 10);
  const minute = parseInt(get('minute'), 10);

  return {
    dateStr: `${year}-${month}-${day}`,
    minutes: hour * 60 + minute,
  };
}

/**
 * Get timezone offset in minutes for a given UTC Date
 */
function getTimeZoneOffsetMinutes(utcDate, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(utcDate);

  const get = (type) => parts.find(p => p.type === type).value;
  const localAsUtc = Date.UTC(
    parseInt(get('year'), 10),
    parseInt(get('month'), 10) - 1,
    parseInt(get('day'), 10),
    parseInt(get('hour'), 10),
    parseInt(get('minute'), 10),
    parseInt(get('second'), 10)
  );

  return (localAsUtc - utcDate.getTime()) / 60000;
}

/**
 * Convert local date/time to a UTC Date using timezone rules
 */
function getUtcDateForLocal(dateStr, timeStr, timeZone) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute, second = 0] = timeStr.split(':').map(Number);

  let utcDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const offsetMinutes = getTimeZoneOffsetMinutes(utcDate, timeZone);
  utcDate = new Date(utcDate.getTime() - offsetMinutes * 60000);
  return utcDate;
}

/**
 * Get calendar busy intervals in local minutes for a specific date
 */
async function getCalendarBusyIntervals(dateStr, env) {
  const timeZone = env.TIME_ZONE || 'Europe/Berlin';

  if (!env.GOOGLE_CALENDAR_ID) {
    console.warn('GOOGLE_CALENDAR_ID not configured, skipping calendar check');
    return [];
  }

  try {
    const accessToken = await getGoogleAccessToken(env);
    const calendarId = env.GOOGLE_CALENDAR_ID;

    const timeMin = getUtcDateForLocal(dateStr, '00:00:00', timeZone).toISOString();
    const timeMax = getUtcDateForLocal(dateStr, '23:59:59', timeZone).toISOString();

    const response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        timeMin,
        timeMax,
        timeZone,
        items: [{ id: calendarId }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`FreeBusy API error: ${error}`);
    }

    const data = await response.json();
    const busy = (data.calendars && data.calendars[calendarId] && data.calendars[calendarId].busy) || [];

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
    console.error('Error fetching free/busy:', error);
    return [];
  }
}

/**
 * Create a calendar event for an approved booking
 */
async function createCalendarEvent(booking, env, cancellationURL, rescheduleURL) {
  if (!env.GOOGLE_CALENDAR_ID) {
    console.warn('GOOGLE_CALENDAR_ID not configured, skipping calendar event creation');
    return null;
  }

  try {
    const accessToken = await getGoogleAccessToken(env);
    const calendarId = env.GOOGLE_CALENDAR_ID;

    // Parse the date and time properly with timezone
    const timezone = booking.timezone || 'Europe/Berlin';
    const startDateTime = `${booking.date}T${booking.time}:00`;
    
    // Calculate end time
    const [hours, minutes] = booking.time.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes + booking.durationMinutes;
    const endHours = Math.floor(totalMinutes / 60);
    const endMinutes = totalMinutes % 60;
    const endTime = `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
    const endDateTime = `${booking.date}T${endTime}:00`;

    console.log('Creating calendar event:', {
      startDateTime,
      endDateTime,
      timezone,
      calendarId
    });

    // Build detailed description
    let descriptionParts = [
      `ATTENDEE INFORMATION`,
      `Name: ${booking.name}`,
      `Email: ${booking.email}`,
    ];

    if (booking.company) {
      descriptionParts.push(`Company: ${booking.company}`);
    }

    if (booking.role) {
      descriptionParts.push(`Role: ${booking.role}`);
    }

    if (booking.location) {
      descriptionParts.push('');
      descriptionParts.push('LOCATION');
      descriptionParts.push(booking.location);
    }

    if (booking.discussionTopics && booking.discussionTopics.length > 0) {
      descriptionParts.push('');
      descriptionParts.push('DISCUSSION TOPICS');
      mapTopicLabels(booking.discussionTopics).forEach(topic => {
        descriptionParts.push(`• ${topic}`);
      });
    }

    if (booking.discussionDetails) {
      descriptionParts.push('');
      descriptionParts.push('DETAILS & NOTES');
      descriptionParts.push(booking.discussionDetails);
    }

    if (cancellationURL) {
      descriptionParts.push('');
      descriptionParts.push('NEED TO CANCEL?');
      descriptionParts.push(`Cancel this meeting: ${cancellationURL}`);
    }

    if (rescheduleURL) {
      descriptionParts.push('');
      descriptionParts.push('NEED TO RESCHEDULE?');
      descriptionParts.push(`Propose a new time: ${rescheduleURL}`);
    }

    const description = descriptionParts.join('\n');

    // Create event object
    const event = {
      summary: `${booking.meetingTypeTitle} - ${booking.name}`,
      description: description,
      location: booking.location || '',
      start: {
        dateTime: startDateTime,
        timeZone: timezone,
      },
      end: {
        dateTime: endDateTime,
        timeZone: timezone,
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 30 },
        ],
      },
    };

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        calendarId
      )}/events`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('Calendar API error response:', error);
      throw new Error(`Failed to create calendar event: ${error}`);
    }

    const createdEvent = await response.json();
    console.log('Calendar event created successfully:', createdEvent.id, createdEvent.htmlLink);
    return createdEvent;
  } catch (error) {
    console.error('Error creating calendar event:', error);
    console.error('Booking details:', {
      date: booking.date,
      time: booking.time,
      timezone: booking.timezone,
      duration: booking.durationMinutes
    });
    return null;
  }
}

// ===== End Google Calendar Integration =====

async function hasExistingSpecialBooking(date, meetingTypeId, env) {
  try {
    const timeZone = env.TIME_ZONE || 'Europe/Berlin';

    if (!env.GOOGLE_CALENDAR_ID) {
      return false;
    }

    const accessToken = await getGoogleAccessToken(env);
    const calendarId = env.GOOGLE_CALENDAR_ID;

    const timeMin = getUtcDateForLocal(date, '00:00:00', timeZone).toISOString();
    const timeMax = getUtcDateForLocal(date, '23:59:59', timeZone).toISOString();

    // Query events for this date to check if this specific meeting type already exists
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Error fetching calendar events:', await response.text());
      return false;
    }

    const data = await response.json();
    const events = data.items || [];

    if (!SPECIAL_MEETING_TYPES.includes(meetingTypeId)) return false;
    const targetTitle = MEETING_TYPES[meetingTypeId] && MEETING_TYPES[meetingTypeId].title;
    if (!targetTitle) return false;

    // Calendar events are created as "<meeting type title> - <attendee name>"
    for (const event of events) {
      if (event.summary && (event.summary === targetTitle || event.summary.startsWith(`${targetTitle} -`))) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('Error checking for existing special booking:', error);
    return false;
  }
}

function getMeetingType(id) {
  const mt = MEETING_TYPES[id];
  if (!mt) return null;
  return { ...mt };
}

function getMeetingTypes() {
  return Object.values(MEETING_TYPES).map(mt => ({
    id: mt.id,
    title: mt.title,
    durationMinutes: mt.durationMinutes,
  }));
}

function dateInRange(date, startDate, endDate) {
  return date >= startDate && date <= endDate;
}

function parseTimeToMinutes(timeStr) {
  const [hour, minute] = timeStr.split(':').map(Number);
  return hour * 60 + minute;
}

function minutesToTime(minutes) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

function getDayOfWeek(dateStr) {
  return new Date(dateStr + 'T00:00:00Z').getUTCDay();
}

function isWorkWeekday(dateStr) {
  const day = getDayOfWeek(dateStr);
  return day >= 1 && day <= 5;
}

// Latest-start window for a meeting type on a specific date (Mon-Fri may end earlier).
function getDailyWindowMinutes(meetingType, dateStr) {
  const endHours = (isWorkWeekday(dateStr) && meetingType.weekdayDailyEnd !== undefined)
    ? meetingType.weekdayDailyEnd
    : meetingType.dailyEnd;
  return {
    startMinutes: meetingType.dailyStart * 60,
    endMinutes: endHours * 60,
  };
}

function overlapsBlockedRangeMinutes(startMinutes, endMinutes, meetingType, dateStr, options = {}) {
  const { allowLunchWindow = false } = options;

  // Dinner & drinks only happen from 6:30pm onward.
  if (meetingType.id === 'gamescom-dinner') {
    return startMinutes < 18 * 60 + 30;
  }

  // Non-dinner meetings must end by 15:00 Mon-Fri (work calls 15:00-18:00 Koln time,
  // evenings reserved for dinner) and by 18:00 on other days.
  const daytimeEnd = isWorkWeekday(dateStr) ? 15 * 60 : 18 * 60;
  if (endMinutes > daytimeEnd) {
    return true;
  }

  // The 9:00-9:30 window is reserved exclusively for coffee/breakfast.
  if (meetingType.id !== 'gamescom-coffee' &&
      timesOverlapMinutes(startMinutes, endMinutes, 9 * 60, 9 * 60 + 30)) {
    return true;
  }

  // Reserve the lunch hour (12:00-12:50 + handoff) until a lunch is booked
  if (!allowLunchWindow && meetingType.id !== 'gamescom-lunch') {
    const blockedStart = 12 * 60; // 12:00
    const blockedEnd = 13 * 60; // 13:00
    return timesOverlapMinutes(startMinutes, endMinutes, blockedStart, blockedEnd);
  }
  return false;
}

// Check if two time ranges overlap (in minutes)
function timesOverlapMinutes(start1, end1, start2, end2) {
  return start1 < end2 && end1 > start2;
}

// Check if a proposed slot conflicts with existing busy intervals
function hasConflictWithIntervals(slotStartMinutes, slotEndMinutes, intervals) {
  for (const interval of intervals) {
    if (timesOverlapMinutes(slotStartMinutes, slotEndMinutes, interval.startMinutes, interval.endMinutes)) {
      return true;
    }
  }
  return false;
}

// Remove a specific interval from busy intervals (used when rescheduling the same meeting)
function removeIntervalFromBusyIntervals(intervals, excludeStartMinutes, excludeEndMinutes) {
  const result = [];

  for (const interval of intervals) {
    const start = interval.startMinutes;
    const end = interval.endMinutes;

    // No overlap
    if (!timesOverlapMinutes(start, end, excludeStartMinutes, excludeEndMinutes)) {
      result.push(interval);
      continue;
    }

    // Left side remains busy
    if (start < excludeStartMinutes) {
      result.push({ startMinutes: start, endMinutes: Math.min(end, excludeStartMinutes) });
    }

    // Right side remains busy
    if (end > excludeEndMinutes) {
      result.push({ startMinutes: Math.max(start, excludeEndMinutes), endMinutes: end });
    }
  }

  return result.filter(i => i.endMinutes > i.startMinutes);
}

function isWithinDailyWindow(startTime, endTime, meetingType) {
  const startHour = startTime.getHours();
  const startMinutes = startTime.getMinutes();
  const endHour = endTime.getHours();
  const endMinutes = endTime.getMinutes();

  const startDecimal = startHour + startMinutes / 60;
  const endDecimal = endHour + endMinutes / 60;

  return (
    startDecimal >= meetingType.dailyStart &&
    endDecimal <= meetingType.dailyEnd
  );
}

async function getAvailableSlots(dateStr, meetingTypeId, env, excludeCurrentSlot = null, options = {}) {
  const meetingType = getMeetingType(meetingTypeId);
  if (!meetingType) return [];

  const date = new Date(dateStr + 'T00:00:00Z');
  const slots = [];

  if (!dateInRange(date, meetingType.dateStart, meetingType.dateEnd)) {
    return slots;
  }

  let busyIntervals = await getCalendarBusyIntervals(dateStr, env);

  // When rescheduling, ignore this meeting's current slot so it doesn't block its own alternatives.
  if (excludeCurrentSlot && excludeCurrentSlot.date === dateStr) {
    const excludeEndWithBuffer = excludeCurrentSlot.endMinutes + (excludeCurrentSlot.bufferMinutes || 0);
    busyIntervals = removeIntervalFromBusyIntervals(
      busyIntervals,
      excludeCurrentSlot.startMinutes,
      excludeEndWithBuffer
    );
  }

  // Once the day's lunch is booked, its reserved window opens up for other
  // meetings (real conflicts are still covered by the busy intervals).
  if (!options.allowLunchWindow && meetingTypeId !== 'gamescom-lunch') {
    if (await hasExistingSpecialBooking(dateStr, 'gamescom-lunch', env)) {
      options = { ...options, allowLunchWindow: true };
    }
  }

  // Meetings only start on the hour or half hour
  const slotIntervalMinutes = 30;
  const meetingDuration = meetingType.durationMinutes;

  const dailyWindow = getDailyWindowMinutes(meetingType, dateStr);
  const dayStartMinutes = dailyWindow.startMinutes;
  const dayEndMinutes = dailyWindow.endMinutes;

  const bufferMinutes = specialBufferMinutes(meetingTypeId);

  for (let currentMinutes = dayStartMinutes; currentMinutes <= dayEndMinutes; currentMinutes += slotIntervalMinutes) {
    const slotEndMinutes = currentMinutes + meetingDuration;

    // For lunch/dinner, check buffer time as well
    const conflictCheckEnd = slotEndMinutes + bufferMinutes;

    const available =
      slotEndMinutes <= dayEndMinutes + meetingDuration &&
      !overlapsBlockedRangeMinutes(currentMinutes, slotEndMinutes, meetingType, dateStr, options) &&
      !hasConflictWithIntervals(currentMinutes, conflictCheckEnd, busyIntervals);

    slots.push({
      time: minutesToTime(currentMinutes),
      available: available,
    });
  }

  return slots;
}

async function handleAvailability(request, url, corsHeaders, env) {
  const date = url.searchParams.get('date');
  const meetingTypeId = url.searchParams.get('meeting_type');
  const excludeToken = url.searchParams.get('exclude_token');

  if (!date || !meetingTypeId) {
    return new Response(
      JSON.stringify({
        error: 'Missing required parameters: date, meeting_type',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }

  let excludeCurrentSlot = null;
  if (excludeToken) {
    const bookingListResult = await env.SCHEDULER_KV.list({ prefix: 'booking:' });
    for (const key of bookingListResult.keys) {
      const data = await env.SCHEDULER_KV.get(key.name);
      if (data) {
        const booking = JSON.parse(data);
        if (booking.cancellationToken === excludeToken) {
          const existingStartMinutes = parseTimeToMinutes(booking.time);
          const existingEndMinutes = existingStartMinutes + booking.durationMinutes;
          const bufferMinutes = specialBufferMinutes(booking.meetingTypeId);

          excludeCurrentSlot = {
            date: booking.date,
            startMinutes: existingStartMinutes,
            endMinutes: existingEndMinutes,
            bufferMinutes,
            meetingTypeId: booking.meetingTypeId,
          };
          break;
        }
      }
    }
  }

  const availabilityOptions = {
    // During rescheduling, allow proposing times inside the lunch window.
    allowLunchWindow: Boolean(excludeToken),
  };

  const slots = await getAvailableSlots(date, meetingTypeId, env, excludeCurrentSlot, availabilityOptions);

  return new Response(JSON.stringify(slots), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

// List each date in a meeting type's range with whether any slot is still open,
// so the date picker can gray out full days.
async function handleAvailabilityDays(url, corsHeaders, env) {
  const meetingTypeId = url.searchParams.get('meeting_type');
  const meetingType = getMeetingType(meetingTypeId);
  if (!meetingType) {
    return new Response(JSON.stringify({ error: 'Invalid meeting type' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const days = [];
  for (let d = new Date(meetingType.dateStart); d <= meetingType.dateEnd; d = new Date(d.getTime() + 24 * 60 * 60 * 1000)) {
    const dateStr = d.toISOString().slice(0, 10);
    const slots = await getAvailableSlots(dateStr, meetingTypeId, env);
    days.push({ date: dateStr, available: slots.some(s => s.available) });
  }

  return new Response(JSON.stringify({ days }), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

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
    location,
  } = body;

  // Validate required fields
  if (!name || !email || !date || !time || !meeting_type_id || !discussion_details || !location) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const meetingType = getMeetingType(meeting_type_id);
  if (!meetingType) {
    return new Response(JSON.stringify({ error: 'Invalid meeting type' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // Validate date and time
  const dateObj = new Date(date + 'T00:00:00Z');
  if (isNaN(dateObj.getTime())) {
    return new Response(JSON.stringify({ error: 'Invalid date format' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  if (!/^\d{2}:\d{2}$/.test(time)) {
    return new Response(JSON.stringify({ error: 'Invalid time format' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  if (!dateInRange(dateObj, meetingType.dateStart, meetingType.dateEnd)) {
    return new Response(
      JSON.stringify({ error: 'Selected date is not available for this meeting type' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }

  const startMinutes = parseTimeToMinutes(time);
  const endMinutes = startMinutes + meetingType.durationMinutes;

  // Meetings only start on the hour or half hour
  if (startMinutes % 30 !== 0) {
    return new Response(
      JSON.stringify({ error: 'Meetings start on the hour or half hour' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }

  const dailyWindow = getDailyWindowMinutes(meetingType, date);
  const dayStartMinutes = dailyWindow.startMinutes;
  const dayEndMinutes = dailyWindow.endMinutes;

  if (startMinutes < dayStartMinutes || startMinutes > dayEndMinutes || endMinutes > dayEndMinutes + meetingType.durationMinutes) {
    return new Response(
      JSON.stringify({ error: 'Selected time is outside of available hours' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }

  // The reserved lunch window opens up once the day's lunch is booked
  const allowLunchWindow = meeting_type_id !== 'gamescom-lunch' &&
    await hasExistingSpecialBooking(date, 'gamescom-lunch', env);

  if (overlapsBlockedRangeMinutes(startMinutes, endMinutes, meetingType, date, { allowLunchWindow })) {
    return new Response(
      JSON.stringify({ error: 'Selected time overlaps a blocked period' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }

  // Check for conflicts with existing bookings
  const busyIntervals = await getCalendarBusyIntervals(date, env);
  if (hasConflictWithIntervals(startMinutes, endMinutes, busyIntervals)) {
    return new Response(
      JSON.stringify({ error: 'Selected time conflicts with an existing booking' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }

  // For lunch/dinner, also check that buffer time is respected
  const bufferMinutes = specialBufferMinutes(meeting_type_id);
  if (bufferMinutes > 0) {
    const endTimeWithBuffer = endMinutes + bufferMinutes;
    if (hasConflictWithIntervals(startMinutes, endTimeWithBuffer, busyIntervals)) {
      return new Response(
        JSON.stringify({ error: 'Not enough buffer time before next appointment' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }
  }

  // Check if there's already a lunch/coffee/dinner booking of the same type on this date
  if (SPECIAL_MEETING_TYPES.includes(meeting_type_id)) {
    const existingSpecialBooking = await hasExistingSpecialBooking(date, meeting_type_id, env);
    if (existingSpecialBooking) {
      const typeNames = {
        'gamescom-lunch': 'lunch',
        'gamescom-dinner': 'dinner',
        'gamescom-coffee': 'coffee/breakfast'
      };
      const typeName = typeNames[meeting_type_id] || 'special';
      return new Response(
        JSON.stringify({ error: `You can only have one ${typeName} appointment per day` }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }
  }

  // Generate request ID and token
  const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2);
  const token = await generateToken();

  // Store pending request in KV
  const pendingRequest = {
    id: requestId,
    token: token,
    name: name,
    email: email,
    company: company,
    role: role,
    meetingTypeId: meeting_type_id,
    meetingTypeTitle: meetingType.title,
    durationMinutes: effectiveDurationMinutes(meetingType, time),
    requestedDate: date,
    requestedTime: time,
    timezone: timezone || 'Europe/Berlin',
    location: location,
    discussionTopics: discussion_topics || [],
    discussionDetails: discussion_details,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  // Store in KV (using email as part of key for easy lookup)
  await env.SCHEDULER_KV.put(
    `request:${requestId}`,
    JSON.stringify(pendingRequest),
    { expirationTtl: 7 * 24 * 60 * 60 } // 7 days
  );

  // Send admin notification
  const baseURL = env.BASE_URL || 'https://meet.mike.game';
  const reviewURL = `${baseURL}/admin/review?token=${token}`;

  const emailWorkerURL = env.EMAIL_WORKER_URL;
  if (emailWorkerURL) {
    try {
      await fetch(emailWorkerURL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Scheduler-Auth': env.EMAIL_WORKER_SECRET || '' },
        body: JSON.stringify({
          type: 'admin_notification',
          reviewURL: reviewURL,
          name: name,
          email: email,
          company: company,
          role: role,
          meetingType: meetingType.title,
          duration: meetingType.durationMinutes,
          date: date,
          time: time,
          timezone: timezone || 'Europe/Berlin',
          location: location,
          topics: discussion_topics || [],
          details: discussion_details,
        }),
      });
    } catch (err) {
      console.error('Failed to send admin notification:', err);
    }
  }

  return new Response(JSON.stringify({ success: true, id: requestId }), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

async function generateToken() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// Get a pending request by token
async function handleGetRequest(request, url, env, corsHeaders) {
  const token = url.searchParams.get('token');
  if (!token) {
    return new Response(JSON.stringify({ error: 'Missing token' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // Find the request with this token
  const listResult = await env.SCHEDULER_KV.list({ prefix: 'request:' });
  for (const key of listResult.keys) {
    const data = await env.SCHEDULER_KV.get(key.name);
    if (data) {
      const req = JSON.parse(data);
      if (req.token === token) {
        return new Response(JSON.stringify(req), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    }
  }

  return new Response(JSON.stringify({ error: 'Request not found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

// Approve a booking request
async function handleApprove(request, env, corsHeaders) {
  const body = await request.json();
  const { token, location, newDate, newTime, forceApprove } = body;

  if (!token) {
    return new Response(JSON.stringify({ error: 'Missing token' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // Find the request
  const listResult = await env.SCHEDULER_KV.list({ prefix: 'request:' });
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
    return new Response(JSON.stringify({ error: 'Request not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  if (pendingRequest.status !== 'pending') {
    return new Response(
      JSON.stringify({ error: `Request already ${pendingRequest.status}` }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }

  // Update location if provided
  if (location !== undefined) {
    pendingRequest.location = location;
  }

  // Update date/time if provided
  if (newDate && newTime) {
    pendingRequest.requestedDate = newDate;
    pendingRequest.requestedTime = newTime;
    const meetingType = getMeetingType(pendingRequest.meetingTypeId);
    if (meetingType) {
      pendingRequest.durationMinutes = effectiveDurationMinutes(meetingType, newTime);
    }
  }

  // Check for conflicts one more time before approving (unless forced)
  if (!forceApprove) {
    const startMinutes = parseTimeToMinutes(pendingRequest.requestedTime);
    const endMinutes = startMinutes + pendingRequest.durationMinutes;

    const busyIntervals = await getCalendarBusyIntervals(pendingRequest.requestedDate, env);
    if (hasConflictWithIntervals(startMinutes, endMinutes, busyIntervals)) {
      return new Response(
        JSON.stringify({ error: 'Time slot is no longer available due to a conflict' }),
        { status: 409, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }
  }

  // Check if there's an existing booking to get the old calendar event ID
  const existingBookingKey = `booking:${pendingRequest.id}`;
  const existingBookingData = await env.SCHEDULER_KV.get(existingBookingKey);
  let existingBooking = null;
  if (existingBookingData) {
    existingBooking = JSON.parse(existingBookingData);
  }

  // Create the approved booking
  const cancellationToken = existingBooking?.cancellationToken || await generateToken();
  const booking = {
    id: pendingRequest.id,
    cancellationToken: cancellationToken,
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
    status: 'approved',
    approvedAt: new Date().toISOString(),
  };

  const baseURL = env.BASE_URL || 'https://meet.mike.game';
  const cancellationURL = `${baseURL}/cancel?token=${cancellationToken}`;
  const rescheduleURL = `${baseURL}/reschedule?token=${cancellationToken}`;

  // Delete old calendar event if this is a reschedule
  if (existingBooking?.calendarEventId) {
    try {
      console.log('Deleting old calendar event:', existingBooking.calendarEventId);
      await deleteCalendarEvent(existingBooking.calendarEventId, env);
    } catch (error) {
      console.error('Failed to delete old calendar event:', error);
      // Continue anyway - we'll create the new event
    }
  }

  // Create calendar event (this is now the source of truth)
  const calendarEvent = await createCalendarEvent(booking, env, cancellationURL, rescheduleURL);
  if (calendarEvent) {
    booking.calendarEventId = calendarEvent.id;
    booking.calendarEventLink = calendarEvent.htmlLink;
  }

  // Store the approved booking in KV as backup/cache
  await env.SCHEDULER_KV.put(
    `booking:${booking.id}`,
    JSON.stringify(booking),
    { expirationTtl: 90 * 24 * 60 * 60 } // 90 days
  );

  // Update the request status
  pendingRequest.status = 'approved';
  await env.SCHEDULER_KV.put(requestKey, JSON.stringify(pendingRequest), {
    expirationTtl: 7 * 24 * 60 * 60,
  });

  // Send emails
  const emailWorkerURL = env.EMAIL_WORKER_URL;
  if (emailWorkerURL) {
    try {
      // Calculate start and end times as ISO strings using the booking timezone (DST-safe)
      const startDateTime = getUtcDateForLocal(booking.date, booking.time, booking.timezone);
      const endDateTime = new Date(startDateTime.getTime() + booking.durationMinutes * 60000);

      const baseURL = env.BASE_URL || 'https://meet.mike.game';
      const cancellationURL = `${baseURL}/cancel?token=${cancellationToken}`;
      const rescheduleURL = `${baseURL}/reschedule?token=${cancellationToken}`;

      // Send confirmation email to attendee
      console.log('Sending approval email to attendee:', booking.email);
      const attendeeEmailResponse = await fetch(emailWorkerURL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Scheduler-Auth': env.EMAIL_WORKER_SECRET || '' },
        body: JSON.stringify({
          type: 'approval',
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
          cancellationURL: cancellationURL,
          rescheduleURL: rescheduleURL,
        }),
      });
      const attendeeResult = await attendeeEmailResponse.json();
      console.log('Attendee email response:', attendeeResult);

      // Send notification to admin
      console.log('Sending admin confirmation to:', env.GOOGLE_CALENDAR_ID);
      const adminEmailResponse = await fetch(emailWorkerURL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Scheduler-Auth': env.EMAIL_WORKER_SECRET || '' },
        body: JSON.stringify({
          type: 'admin_confirmed',
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
          cancellationURL: cancellationURL,
          rescheduleURL: rescheduleURL,
        }),
      });
      const adminResult = await adminEmailResponse.json();
      console.log('Admin email response:', adminResult);
    } catch (err) {
      console.error('Failed to send emails:', err);
    }
  }

  return new Response(JSON.stringify({ success: true, booking }), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

// Deny a booking request
async function handleDeny(request, env, corsHeaders) {
  const body = await request.json();
  const { token, reason } = body;

  if (!token) {
    return new Response(JSON.stringify({ error: 'Missing token' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // Find the request
  const listResult = await env.SCHEDULER_KV.list({ prefix: 'request:' });
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
    return new Response(JSON.stringify({ error: 'Request not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  if (pendingRequest.status !== 'pending') {
    return new Response(
      JSON.stringify({ error: `Request already ${pendingRequest.status}` }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }

  // Update the request status
  pendingRequest.status = 'denied';
  pendingRequest.deniedAt = new Date().toISOString();
  pendingRequest.denialReason = reason;
  await env.SCHEDULER_KV.put(requestKey, JSON.stringify(pendingRequest), {
    expirationTtl: 7 * 24 * 60 * 60,
  });

  // Send denial email to user
  const emailWorkerURL = env.EMAIL_WORKER_URL;
  if (emailWorkerURL) {
    try {
      await fetch(emailWorkerURL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Scheduler-Auth': env.EMAIL_WORKER_SECRET || '' },
        body: JSON.stringify({
          type: 'denial',
          to: pendingRequest.email,
          name: pendingRequest.name,
          reason: reason,
        }),
      });
    } catch (err) {
      console.error('Failed to send denial email:', err);
    }
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

// Acknowledge a pending request without deciding yet: the request stays pending and
// the requester gets an email saying it is still under review. Repeatable.
async function handleAcknowledge(request, env, corsHeaders) {
  const body = await request.json();
  const { token } = body;

  if (!token) {
    return new Response(JSON.stringify({ error: 'Missing token' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // Find the request
  const listResult = await env.SCHEDULER_KV.list({ prefix: 'request:' });
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
    return new Response(JSON.stringify({ error: 'Request not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  if (pendingRequest.status !== 'pending') {
    return new Response(
      JSON.stringify({ error: `Request already ${pendingRequest.status}` }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }

  pendingRequest.acknowledgedAt = new Date().toISOString();
  pendingRequest.acknowledgedCount = (pendingRequest.acknowledgedCount || 0) + 1;
  await env.SCHEDULER_KV.put(requestKey, JSON.stringify(pendingRequest), {
    expirationTtl: 7 * 24 * 60 * 60,
  });

  const emailWorkerURL = env.EMAIL_WORKER_URL;
  if (emailWorkerURL) {
    try {
      const emailResponse = await fetch(emailWorkerURL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Scheduler-Auth': env.EMAIL_WORKER_SECRET || '' },
        body: JSON.stringify({
          type: 'acknowledgment',
          to: pendingRequest.email,
          name: pendingRequest.name,
          meetingType: pendingRequest.meetingTypeTitle,
          date: pendingRequest.requestedDate,
          time: pendingRequest.requestedTime,
          timezone: pendingRequest.timezone,
        }),
      });
      if (!emailResponse.ok) {
        const errorText = await emailResponse.text();
        console.error('Acknowledgment email failed:', errorText);
        return new Response(
          JSON.stringify({ error: 'Failed to send acknowledgment email' }),
          { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }
    } catch (err) {
      console.error('Failed to send acknowledgment email:', err);
      return new Response(
        JSON.stringify({ error: 'Failed to send acknowledgment email' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

// Re-send confirmation email for a scheduled booking
async function handleResendConfirmation(request, env, corsHeaders) {
  const body = await request.json();
  const { token } = body;

  if (!token) {
    return new Response(JSON.stringify({ error: 'Missing token' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // Find the request by token
  const listResult = await env.SCHEDULER_KV.list({ prefix: 'request:' });
  let scheduledRequest = null;

  for (const key of listResult.keys) {
    const data = await env.SCHEDULER_KV.get(key.name);
    if (data) {
      const req = JSON.parse(data);
      if (req.token === token) {
        scheduledRequest = req;
        break;
      }
    }
  }

  if (!scheduledRequest) {
    return new Response(JSON.stringify({ error: 'Request not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  if (scheduledRequest.status !== 'approved' && scheduledRequest.status !== 'scheduled') {
    return new Response(
      JSON.stringify({ error: 'Can only resend confirmation for approved/scheduled requests' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }

  // Find the booking associated with this request
  const bookingListResult = await env.SCHEDULER_KV.list({ prefix: 'booking:' });
  let booking = null;
  let bookingKey = null;

  for (const key of bookingListResult.keys) {
    const data = await env.SCHEDULER_KV.get(key.name);
    if (data) {
      const b = JSON.parse(data);
      if (b.id === scheduledRequest.id) {
        booking = b;
        bookingKey = key.name;
        break;
      }
    }
  }

  if (!booking) {
    return new Response(JSON.stringify({ error: 'Booking details not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // Ensure a calendar event exists; don't create a duplicate on every resend
  if (!booking.calendarEventId) {
    try {
      const baseURL = env.BASE_URL || 'https://meet.mike.game';
      const cancellationURL = `${baseURL}/cancel?token=${booking.cancellationToken}`;
      const rescheduleURL = `${baseURL}/reschedule?token=${booking.cancellationToken}`;
      const calendarEvent = await createCalendarEvent(booking, env, cancellationURL, rescheduleURL);
      if (calendarEvent) {
        booking.calendarEventId = calendarEvent.id;
        booking.calendarEventLink = calendarEvent.htmlLink;
        await env.SCHEDULER_KV.put(bookingKey, JSON.stringify(booking), {
          expirationTtl: 90 * 24 * 60 * 60,
        });
      } else {
        console.warn('Failed to create calendar event when resending confirmation');
      }
    } catch (err) {
      console.error('Error creating calendar event on resend:', err);
      // Don't fail the entire operation if calendar creation fails
    }
  }

  // Send approval email to user with .ics attachment
  const emailWorkerURL = env.EMAIL_WORKER_URL;
  if (emailWorkerURL) {
    try {
      const baseURL = env.BASE_URL || 'https://meet.mike.game';
      const cancellationURL = `${baseURL}/cancel?token=${booking.cancellationToken}`;
      const rescheduleURL = `${baseURL}/reschedule?token=${booking.cancellationToken}`;
      const startDateTime = getUtcDateForLocal(booking.date, booking.time, booking.timezone);
      const endDateTime = new Date(startDateTime.getTime() + booking.durationMinutes * 60000);
      
      await fetch(emailWorkerURL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Scheduler-Auth': env.EMAIL_WORKER_SECRET || '' },
        body: JSON.stringify({
          type: 'approval',
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
          cancellationURL: cancellationURL,
          rescheduleURL: rescheduleURL,
        }),
      });
    } catch (err) {
      console.error('Failed to resend confirmation email:', err);
      return new Response(
        JSON.stringify({ error: 'Failed to send email' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

// Get booking details by cancellation token
async function handleGetBooking(request, url, env, corsHeaders) {
  const token = url.searchParams.get('token');
  if (!token) {
    return new Response(JSON.stringify({ error: 'Missing token' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // Find the booking with this cancellation token
  const listResult = await env.SCHEDULER_KV.list({ prefix: 'booking:' });
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
    return new Response(JSON.stringify({ error: 'Booking not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  if (booking.status === 'cancelled') {
    return new Response(JSON.stringify({ error: 'Booking already cancelled' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  return new Response(JSON.stringify(booking), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

// Cancel a booking
async function handleCancel(request, env, corsHeaders) {
  const body = await request.json();
  const { token } = body;

  if (!token) {
    return new Response(JSON.stringify({ error: 'Missing token' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // Find the booking with this cancellation token
  const listResult = await env.SCHEDULER_KV.list({ prefix: 'booking:' });
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
    return new Response(JSON.stringify({ error: 'Booking not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  if (booking.status === 'cancelled') {
    return new Response(JSON.stringify({ error: 'Booking already cancelled' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // Delete the calendar event if it exists
  if (booking.calendarEventId) {
    try {
      await deleteCalendarEvent(booking.calendarEventId, env);
    } catch (error) {
      console.error('Failed to delete calendar event:', error);
      // Continue with cancellation even if calendar deletion fails
    }
  }

  // Update booking status
  booking.status = 'cancelled';
  booking.cancelledAt = new Date().toISOString();
  await env.SCHEDULER_KV.put(bookingKey, JSON.stringify(booking), {
    expirationTtl: 30 * 24 * 60 * 60, // Keep for 30 days
  });

  // Send cancellation emails
  const emailWorkerURL = env.EMAIL_WORKER_URL;
  if (emailWorkerURL) {
    try {
      const startDateTime = new Date(`${booking.date}T${booking.time}`);

      // Email to attendee
      await fetch(emailWorkerURL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Scheduler-Auth': env.EMAIL_WORKER_SECRET || '' },
        body: JSON.stringify({
          type: 'cancellation',
          to: booking.email,
          name: booking.name,
          meetingType: booking.meetingTypeTitle,
          date: booking.date,
          time: booking.time,
          timezone: booking.timezone,
        }),
      });

      // Email to admin
      await fetch(emailWorkerURL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Scheduler-Auth': env.EMAIL_WORKER_SECRET || '' },
        body: JSON.stringify({
          type: 'cancellation_admin',
          to: env.GOOGLE_CALENDAR_ID,
          name: booking.name,
          email: booking.email,
          meetingType: booking.meetingTypeTitle,
          date: booking.date,
          time: booking.time,
          timezone: booking.timezone,
        }),
      });
    } catch (err) {
      console.error('Failed to send cancellation emails:', err);
    }
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

async function findBookingByCancellationToken(token, env) {
  const listResult = await env.SCHEDULER_KV.list({ prefix: 'booking:' });
  for (const key of listResult.keys) {
    const data = await env.SCHEDULER_KV.get(key.name);
    if (data) {
      const booking = JSON.parse(data);
      if (booking.cancellationToken === token) {
        return { booking, bookingKey: key.name };
      }
    }
  }
  return { booking: null, bookingKey: null };
}

async function validateRescheduleSlot(booking, date, time, env) {
  const meetingType = getMeetingType(booking.meetingTypeId);
  if (!meetingType) return 'Invalid meeting type';

  const dateObj = new Date(date + 'T00:00:00Z');
  if (isNaN(dateObj.getTime()) || !dateInRange(dateObj, meetingType.dateStart, meetingType.dateEnd)) {
    return 'Selected date is not available for this meeting type';
  }

  const startMinutes = parseTimeToMinutes(time);
  const endMinutes = startMinutes + meetingType.durationMinutes;

  if (startMinutes % 30 !== 0) {
    return 'Meetings start on the hour or half hour';
  }

  const dailyWindow = getDailyWindowMinutes(meetingType, date);
  if (startMinutes < dailyWindow.startMinutes || startMinutes > dailyWindow.endMinutes) {
    return 'Selected time is outside of available hours';
  }

  if (overlapsBlockedRangeMinutes(startMinutes, endMinutes, meetingType, date, { allowLunchWindow: true })) {
    return 'Selected time overlaps a blocked period';
  }

  let busyIntervals = await getCalendarBusyIntervals(date, env);
  if (booking.date === date) {
    const existingStartMinutes = parseTimeToMinutes(booking.time);
    const existingEndMinutes = existingStartMinutes + booking.durationMinutes;
    busyIntervals = removeIntervalFromBusyIntervals(
      busyIntervals,
      existingStartMinutes,
      existingEndMinutes + specialBufferMinutes(booking.meetingTypeId)
    );
  }

  const conflictCheckEnd = endMinutes + specialBufferMinutes(booking.meetingTypeId);

  if (hasConflictWithIntervals(startMinutes, conflictCheckEnd, busyIntervals)) {
    return 'Selected time conflicts with an existing booking';
  }

  return null;
}

async function applyRescheduleAndNotify(booking, bookingKey, date, time, env) {
  const meetingType = getMeetingType(booking.meetingTypeId);
  const oldDate = booking.date;
  const oldTime = booking.time;

  booking.date = date;
  booking.time = time;
  booking.timezone = booking.timezone || 'Europe/Berlin';
  booking.durationMinutes = effectiveDurationMinutes(meetingType, time);
  booking.status = 'approved';
  booking.rescheduledAt = new Date().toISOString();
  booking.previousDate = oldDate;
  booking.previousTime = oldTime;

  if (booking.calendarEventId) {
    try {
      await deleteCalendarEvent(booking.calendarEventId, env);
    } catch (error) {
      console.error('Failed to delete old calendar event during reschedule:', error);
    }
  }

  const baseURL = env.BASE_URL || 'https://meet.mike.game';
  const cancellationURL = `${baseURL}/cancel?token=${booking.cancellationToken}`;
  const rescheduleURL = `${baseURL}/reschedule?token=${booking.cancellationToken}`;
  const calendarEvent = await createCalendarEvent(booking, env, cancellationURL, rescheduleURL);

  if (calendarEvent) {
    booking.calendarEventId = calendarEvent.id;
    booking.calendarEventLink = calendarEvent.htmlLink;
  }

  await env.SCHEDULER_KV.put(bookingKey, JSON.stringify(booking), {
    expirationTtl: 90 * 24 * 60 * 60,
  });

  const emailWorkerURL = env.EMAIL_WORKER_URL;
  if (emailWorkerURL) {
    try {
      const startDateTime = getUtcDateForLocal(booking.date, booking.time, booking.timezone);
      const endDateTime = new Date(startDateTime.getTime() + booking.durationMinutes * 60000);

      await fetch(emailWorkerURL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Scheduler-Auth': env.EMAIL_WORKER_SECRET || '' },
        body: JSON.stringify({
          type: 'approval',
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
          cancellationURL: cancellationURL,
          rescheduleURL: rescheduleURL,
        }),
      });

      await fetch(emailWorkerURL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Scheduler-Auth': env.EMAIL_WORKER_SECRET || '' },
        body: JSON.stringify({
          type: 'admin_confirmed',
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
          cancellationURL: cancellationURL,
          rescheduleURL: rescheduleURL,
        }),
      });
    } catch (err) {
      console.error('Failed to send reschedule emails:', err);
    }
  }

  return booking;
}

function htmlRescheduleResponse(title, body, isSuccess = true) {
  const border = isSuccess ? '#10b981' : '#ef4444';
  return new Response(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title></head><body style="font-family:Arial,sans-serif;background:#f3f4f6;padding:24px;"><div style="max-width:640px;margin:0 auto;background:white;border-radius:12px;padding:24px;border-left:6px solid ${border};box-shadow:0 8px 24px rgba(0,0,0,0.1);"><h2 style="margin-top:0;">${title}</h2><p>${body}</p><p><a href="https://meet.mike.game" style="color:#f18900;">Return to scheduler</a></p></div></body></html>`, {
    headers: { 'Content-Type': 'text/html; charset=UTF-8' },
  });
}

// Propose a new time; does not update calendar until accepted.
async function handleReschedule(request, env, corsHeaders) {
  const body = await request.json();
  const { token, date, time } = body;

  if (!token || !date || !time) {
    return new Response(JSON.stringify({ error: 'Missing required fields: token, date, time' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const { booking } = await findBookingByCancellationToken(token, env);
  if (!booking) {
    return new Response(JSON.stringify({ error: 'Booking not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  if (booking.status === 'cancelled') {
    return new Response(JSON.stringify({ error: 'Booking already cancelled' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const validationError = await validateRescheduleSlot(booking, date, time, env);
  if (validationError) {
    return new Response(JSON.stringify({ error: validationError }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const proposalToken = await generateToken();
  const proposal = {
    token: proposalToken,
    bookingToken: booking.cancellationToken,
    bookingId: booking.id,
    proposedDate: date,
    proposedTime: time,
    timezone: booking.timezone || 'Europe/Berlin',
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  await env.SCHEDULER_KV.put(`reschedule-proposal:${proposalToken}`, JSON.stringify(proposal), {
    expirationTtl: 7 * 24 * 60 * 60,
  });

  const baseURL = env.BASE_URL || 'https://meet.mike.game';
  const acceptURL = `${baseURL}/api/reschedule/respond?token=${proposalToken}&action=accept`;
  const declineURL = `${baseURL}/api/reschedule/respond?token=${proposalToken}&action=decline`;

  const emailWorkerURL = env.EMAIL_WORKER_URL;
  if (emailWorkerURL) {
    try {
      const payload = {
        type: 'reschedule_proposal',
        meetingType: booking.meetingTypeTitle,
        duration: booking.durationMinutes,
        timezone: booking.timezone,
        attendeeName: booking.name,
        attendeeEmail: booking.email,
        currentDate: booking.date,
        currentTime: booking.time,
        proposedDate: date,
        proposedTime: time,
        acceptURL,
        declineURL,
      };

      await fetch(emailWorkerURL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Scheduler-Auth': env.EMAIL_WORKER_SECRET || '' },
        body: JSON.stringify({ ...payload, to: booking.email, recipientType: 'attendee' }),
      });

      await fetch(emailWorkerURL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Scheduler-Auth': env.EMAIL_WORKER_SECRET || '' },
        body: JSON.stringify({ ...payload, to: env.GOOGLE_CALENDAR_ID, recipientType: 'admin' }),
      });
    } catch (err) {
      console.error('Failed to send reschedule proposal emails:', err);
    }
  }

  return new Response(JSON.stringify({ success: true, message: 'Proposal sent for acceptance.' }), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

async function handleRescheduleResponse(request, url, env, corsHeaders) {
  const token = url.searchParams.get('token');
  const action = (url.searchParams.get('action') || '').toLowerCase();

  if (!token || (action !== 'accept' && action !== 'decline')) {
    return htmlRescheduleResponse('Invalid Link', 'This reschedule response link is invalid.', false);
  }

  const proposalKey = `reschedule-proposal:${token}`;
  const proposalData = await env.SCHEDULER_KV.get(proposalKey);
  if (!proposalData) {
    return htmlRescheduleResponse('Proposal Not Found', 'This proposal has expired or could not be found.', false);
  }

  const proposal = JSON.parse(proposalData);
  if (proposal.status !== 'pending') {
    return htmlRescheduleResponse('Already Responded', `This proposal is already ${proposal.status}.`, false);
  }

  const { booking, bookingKey } = await findBookingByCancellationToken(proposal.bookingToken, env);
  if (!booking) {
    return htmlRescheduleResponse('Booking Not Found', 'The related booking no longer exists.', false);
  }

  if (action === 'decline') {
    proposal.status = 'declined';
    proposal.respondedAt = new Date().toISOString();
    await env.SCHEDULER_KV.put(proposalKey, JSON.stringify(proposal), {
      expirationTtl: 30 * 24 * 60 * 60,
    });
    return htmlRescheduleResponse('Proposal Declined', 'The meeting remains at its current time.');
  }

  const validationError = await validateRescheduleSlot(booking, proposal.proposedDate, proposal.proposedTime, env);
  if (validationError) {
    proposal.status = 'expired';
    proposal.respondedAt = new Date().toISOString();
    await env.SCHEDULER_KV.put(proposalKey, JSON.stringify(proposal), {
      expirationTtl: 30 * 24 * 60 * 60,
    });
    return htmlRescheduleResponse('Slot No Longer Available', `Could not accept this proposal: ${validationError}`, false);
  }

  await applyRescheduleAndNotify(booking, bookingKey, proposal.proposedDate, proposal.proposedTime, env);

  proposal.status = 'accepted';
  proposal.respondedAt = new Date().toISOString();
  await env.SCHEDULER_KV.put(proposalKey, JSON.stringify(proposal), {
    expirationTtl: 30 * 24 * 60 * 60,
  });

  return htmlRescheduleResponse('Proposal Accepted', 'The meeting has been moved to the proposed new time and confirmation emails have been sent.');
}

// ===== Calendly visitor integration =====
// Lets a visitor overlay their own Calendly busy times on the slot grid.
// The OAuth token is handed straight back to the visitor's browser and is
// never stored server-side; the busy endpoint only relays it per request.

function calendlyRedirectUri(env) {
  const baseURL = env.BASE_URL || 'https://meet.mike.game';
  return `${baseURL}/api/calendly/callback`;
}

function handleCalendlyLogin(url, env) {
  if (!env.CALENDLY_CLIENT_ID || !env.CALENDLY_CLIENT_SECRET) {
    return new Response('Calendly integration is not configured', { status: 501 });
  }
  const state = (url.searchParams.get('state') || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const authorize = new URL('https://auth.calendly.com/oauth/authorize');
  authorize.searchParams.set('client_id', env.CALENDLY_CLIENT_ID);
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('redirect_uri', calendlyRedirectUri(env));
  if (state) authorize.searchParams.set('state', state);
  return Response.redirect(authorize.toString(), 302);
}

function calendlyPopupResponse(env, token, error, state) {
  const baseURL = env.BASE_URL || 'https://meet.mike.game';
  const payload = JSON.stringify({
    type: 'calendly-connect',
    token: token || null,
    error: error || null,
    state: (state || '').replace(/[^a-zA-Z0-9_-]/g, ''),
  });
  return new Response(
    `<!DOCTYPE html><html><body><script>if (window.opener) { window.opener.postMessage(${payload}, ${JSON.stringify(baseURL)}); } window.close();</script><p>${error ? error : 'Connected. You can close this window.'}</p></body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=UTF-8' } }
  );
}

async function handleCalendlyCallback(url, env) {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code) {
    return calendlyPopupResponse(env, null, 'Calendly connection was cancelled.', state);
  }

  try {
    const tokenResponse = await fetch('https://auth.calendly.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: env.CALENDLY_CLIENT_ID,
        client_secret: env.CALENDLY_CLIENT_SECRET,
        redirect_uri: calendlyRedirectUri(env),
        code: code,
      }),
    });

    if (!tokenResponse.ok) {
      console.error('Calendly token exchange failed:', await tokenResponse.text());
      return calendlyPopupResponse(env, null, 'Could not connect to Calendly.', state);
    }

    const tokenData = await tokenResponse.json();
    return calendlyPopupResponse(env, tokenData.access_token, null, state);
  } catch (error) {
    console.error('Calendly callback error:', error);
    return calendlyPopupResponse(env, null, 'Could not connect to Calendly.', state);
  }
}

async function handleCalendlyBusy(request, env, corsHeaders) {
  const { token, startTime, endTime } = await request.json();
  if (!token || !startTime || !endTime) {
    return new Response(JSON.stringify({ error: 'Missing required fields: token, startTime, endTime' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const meResponse = await fetch('https://api.calendly.com/users/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!meResponse.ok) {
    return new Response(JSON.stringify({ error: 'Calendly authorization expired' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
  const me = await meResponse.json();
  const userUri = me.resource && me.resource.uri;

  const busyUrl = new URL('https://api.calendly.com/user_busy_times');
  busyUrl.searchParams.set('user', userUri);
  busyUrl.searchParams.set('start_time', startTime);
  busyUrl.searchParams.set('end_time', endTime);

  const busyResponse = await fetch(busyUrl.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!busyResponse.ok) {
    console.error('Calendly busy times failed:', await busyResponse.text());
    return new Response(JSON.stringify({ error: 'Could not read Calendly busy times' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const busyData = await busyResponse.json();
  const busy = (busyData.collection || []).map(b => ({ start: b.start_time, end: b.end_time }));

  return new Response(JSON.stringify({ busy }), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

// Delete a calendar event
async function deleteCalendarEvent(eventId, env) {
  if (!env.GOOGLE_CALENDAR_ID) {
    console.warn('GOOGLE_CALENDAR_ID not configured');
    return;
  }

  const accessToken = await getGoogleAccessToken(env);
  const calendarId = env.GOOGLE_CALENDAR_ID;

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      calendarId
    )}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok && response.status !== 404) {
    const error = await response.text();
    throw new Error(`Failed to delete calendar event: ${error}`);
  }
}
