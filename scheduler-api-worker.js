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
      } else if (url.pathname === '/api/book' && request.method === 'POST') {
        return handleBook(request, env, corsHeaders);
      } else if (url.pathname === '/api/admin/approve' && request.method === 'POST') {
        return handleApprove(request, env, corsHeaders);
      } else if (url.pathname === '/api/admin/deny' && request.method === 'POST') {
        return handleDeny(request, env, corsHeaders);
      } else if (url.pathname === '/api/admin/request' && request.method === 'GET') {
        return handleGetRequest(request, url, env, corsHeaders);
      } else if (url.pathname === '/api/cancel' && request.method === 'POST') {
        return handleCancel(request, env, corsHeaders);
      } else if (url.pathname === '/api/booking' && request.method === 'GET') {
        return handleGetBooking(request, url, env, corsHeaders);
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

const MEETING_TYPES = {
  'gdc-pleasant-talk': {
    id: 'gdc-pleasant-talk',
    title: 'Pleasant Talk',
    durationMinutes: 40,
    dateStart: new Date('2026-03-09'),
    dateEnd: new Date('2026-03-13'),
    dailyStart: 8.5,
    dailyEnd: 17.5,
  },
  'gdc-quick-chat': {
    id: 'gdc-quick-chat',
    title: 'Quick Chat',
    durationMinutes: 20,
    dateStart: new Date('2026-03-09'),
    dateEnd: new Date('2026-03-13'),
    dailyStart: 8.5,
    dailyEnd: 17.5,
  },
  'gdc-lunch': {
    id: 'gdc-lunch',
    title: 'Lunch',
    durationMinutes: 60,
    dateStart: new Date('2026-03-09'),
    dateEnd: new Date('2026-03-13'),
    dailyStart: 12,
    dailyEnd: 13.5,
  },
  'gdc-dinner': {
    id: 'gdc-dinner',
    title: 'Dinner',
    durationMinutes: 90,
    dateStart: new Date('2026-03-09'),
    dateEnd: new Date('2026-03-13'),
    dailyStart: 12,
    dailyEnd: 12.5,
  },
  'gdc-coffee': {
    id: 'gdc-coffee',
    title: 'Coffee or Breakfast',
    durationMinutes: 30,
    dateStart: new Date('2026-03-09'),
    dateEnd: new Date('2026-03-14'),
    dailyStart: 8,
    dailyEnd: 8.5,
  },
};

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

    const timeZone = env.TIME_ZONE || 'America/Los_Angeles';

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
  const timeZone = env.TIME_ZONE || 'America/Los_Angeles';

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
async function createCalendarEvent(booking, env, cancellationURL) {
  if (!env.GOOGLE_CALENDAR_ID) {
    console.warn('GOOGLE_CALENDAR_ID not configured, skipping calendar event creation');
    return null;
  }

  try {
    const accessToken = await getGoogleAccessToken(env);
    const calendarId = env.GOOGLE_CALENDAR_ID;

    // Parse the date and time properly with timezone
    const timezone = booking.timezone || 'America/Los_Angeles';
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
      attendees: [
        { email: booking.email }
      ],
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
    const busyIntervals = await getCalendarBusyIntervals(date, env);
    
    // Check if any busy interval on this date is from a lunch/coffee/dinner event
    for (const interval of busyIntervals) {
      // If there's any busy time on this date, assume it's a lunch/coffee/dinner booking
      // Since these are the only events that should be booked by others on this calendar
      return true;
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

function overlapsBlockedRangeMinutes(startMinutes, endMinutes, meetingType) {
  // Coffee/Breakfast buffer: 7:45-8:30 for non-coffee meetings
  // This prevents scheduling conflicts around morning coffee and accounts for 15-min buffer
  if (meetingType.id !== 'gdc-coffee') {
    const coffeeBlockedStart = 7 * 60 + 45; // 7:45am
    const coffeeBlockedEnd = 8 * 60 + 30; // 8:30am (accounts for 8:00-8:30 coffee + 15min buffer before)
    if (timesOverlapMinutes(startMinutes, endMinutes, coffeeBlockedStart, coffeeBlockedEnd)) {
      return true;
    }
  }

  // Lunch/Dinner buffer: 11:45-13:45 for non-lunch/dinner meetings
  // This prevents scheduling conflicts around the lunch period and accounts for 15-min buffer
  if (meetingType.id !== 'gdc-lunch' && meetingType.id !== 'gdc-dinner') {
    const blockedStart = 11 * 60 + 45; // 11:45
    const blockedEnd = 13 * 60 + 45; // 13:45 (1:45pm - accounts for 12:00-1:30 lunch + 15min buffer)
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

async function getAvailableSlots(dateStr, meetingTypeId, env) {
  const meetingType = getMeetingType(meetingTypeId);
  if (!meetingType) return [];

  const date = new Date(dateStr + 'T00:00:00');
  const slots = [];

  if (!dateInRange(date, meetingType.dateStart, meetingType.dateEnd)) {
    return slots;
  }

  const busyIntervals = await getCalendarBusyIntervals(dateStr, env);

  const slotIntervalMinutes = 10;
  const meetingDuration = meetingType.durationMinutes;

  const dayStartMinutes = meetingType.dailyStart * 60;
  const dayEndMinutes = meetingType.dailyEnd * 60;

  const specialMeetingTypes = ['gdc-lunch', 'gdc-coffee', 'gdc-dinner'];
  const isSpecialType = specialMeetingTypes.includes(meetingTypeId);

  for (let currentMinutes = dayStartMinutes; currentMinutes <= dayEndMinutes; currentMinutes += slotIntervalMinutes) {
    const slotEndMinutes = currentMinutes + meetingDuration;

    // For lunch/coffee/dinner, check buffer time as well
    let conflictCheckEnd = slotEndMinutes;
    if (isSpecialType) {
      conflictCheckEnd = slotEndMinutes + 15; // Add 15-minute buffer
    }

    const available =
      slotEndMinutes <= dayEndMinutes + meetingDuration &&
      !overlapsBlockedRangeMinutes(currentMinutes, slotEndMinutes, meetingType) &&
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

  if (!date || !meetingTypeId) {
    return new Response(
      JSON.stringify({
        error: 'Missing required parameters: date, meeting_type',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }

  const slots = await getAvailableSlots(date, meetingTypeId, env);

  return new Response(JSON.stringify(slots), {
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
  const dateObj = new Date(date + 'T00:00:00');
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
  const dayStartMinutes = meetingType.dailyStart * 60;
  const dayEndMinutes = meetingType.dailyEnd * 60;

  if (startMinutes < dayStartMinutes || startMinutes > dayEndMinutes || endMinutes > dayEndMinutes + meetingType.durationMinutes) {
    return new Response(
      JSON.stringify({ error: 'Selected time is outside of available hours' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }

  if (overlapsBlockedRangeMinutes(startMinutes, endMinutes, meetingType)) {
    return new Response(
      JSON.stringify({ error: 'Selected time overlaps a blocked period' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }

  // Check for conflicts with existing bookings
  const busyIntervals = await getCalendarBusyIntervals(date, env);
  console.log(`Checking availability for ${date} at ${time}: busyIntervals:`, busyIntervals);
  if (hasConflictWithIntervals(startMinutes, endMinutes, busyIntervals)) {
    return new Response(
      JSON.stringify({ error: 'Selected time conflicts with an existing booking' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }

  // For lunch/coffee/dinner, also check that buffer time is respected
  const specialMeetingTypes = ['gdc-lunch', 'gdc-coffee', 'gdc-dinner'];
  if (specialMeetingTypes.includes(meeting_type_id)) {
    // Add 15 minute buffer after the meeting
    const bufferMinutes = 15;
    const endTimeWithBuffer = endMinutes + bufferMinutes;
    console.log(`Checking buffer for ${meeting_type_id}: ${startMinutes}-${endMinutes} + ${bufferMinutes}min buffer = ${startMinutes}-${endTimeWithBuffer}`);
    console.log('busyIntervals:', JSON.stringify(busyIntervals));
    const hasConflict = hasConflictWithIntervals(startMinutes, endTimeWithBuffer, busyIntervals);
    console.log(`hasConflict result: ${hasConflict}`);
    if (hasConflict) {
      console.log('Buffer conflict detected, rejecting booking');
      return new Response(
        JSON.stringify({ error: 'Not enough buffer time before next appointment' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }
    console.log('No buffer conflict, continuing with booking');
  }

  // Check if there's already a lunch/coffee/dinner booking on this date
  if (specialMeetingTypes.includes(meeting_type_id)) {
    const existingSpecialBooking = await hasExistingSpecialBooking(date, meeting_type_id, env);
    if (existingSpecialBooking) {
      return new Response(
        JSON.stringify({ error: 'Only one lunch/coffee/dinner appointment is allowed per day' }),
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
    durationMinutes: meetingType.durationMinutes,
    requestedDate: date,
    requestedTime: time,
    timezone: timezone || 'America/Los_Angeles',
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
        headers: { 'Content-Type': 'application/json' },
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
          timezone: timezone || 'America/Los_Angeles',
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
  const calendarEvent = await createCalendarEvent(booking, env, cancellationURL);
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

      // Send confirmation email to attendee
      console.log('Sending approval email to attendee:', booking.email);
      const attendeeEmailResponse = await fetch(emailWorkerURL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        }),
      });
      const attendeeResult = await attendeeEmailResponse.json();
      console.log('Attendee email response:', attendeeResult);

      // Send notification to admin
      console.log('Sending admin confirmation to:', env.GOOGLE_CALENDAR_ID);
      const adminEmailResponse = await fetch(emailWorkerURL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'denial',
          to: pendingRequest.email,
          name: pendingRequest.name,
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
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
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
