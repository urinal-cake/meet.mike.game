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
    dailyStart: 9,
    dailyEnd: 17,
  },
  'gdc-quick-chat': {
    id: 'gdc-quick-chat',
    title: 'Quick Chat',
    durationMinutes: 20,
    dateStart: new Date('2026-03-09'),
    dateEnd: new Date('2026-03-13'),
    dailyStart: 9,
    dailyEnd: 17,
  },
  'gdc-lunch': {
    id: 'gdc-lunch',
    title: 'Lunch',
    durationMinutes: 60,
    dateStart: new Date('2026-03-09'),
    dateEnd: new Date('2026-03-13'),
    dailyStart: 12,
    dailyEnd: 13,
  },
  'gdc-dinner': {
    id: 'gdc-dinner',
    title: 'Dinner',
    durationMinutes: 120,
    dateStart: new Date('2026-03-09'),
    dateEnd: new Date('2026-03-13'),
    dailyStart: 17,
    dailyEnd: 19,
  },
};

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

function overlapsBlockedRange(startTime, endTime, meetingType) {
  // Lunch buffer: 11:45-13:15 for non-lunch meetings
  if (meetingType.id !== 'gdc-lunch') {
    const blockedStart = new Date(startTime);
    blockedStart.setHours(11, 45, 0, 0);
    const blockedEnd = new Date(startTime);
    blockedEnd.setHours(13, 15, 0, 0);

    if (startTime < blockedEnd && endTime > blockedStart) {
      return true;
    }
  }
  return false;
}

// Check if two time ranges overlap
function timesOverlap(start1, end1, start2, end2) {
  return start1 < end2 && end1 > start2;
}

// Check if a proposed slot conflicts with existing bookings
function hasConflictWithBookings(slotStart, slotEnd, bookings) {
  for (const booking of bookings) {
    const bookingStart = new Date(booking.date + ' ' + booking.time);
    const bookingEnd = new Date(bookingStart);
    bookingEnd.setMinutes(bookingEnd.getMinutes() + booking.durationMinutes);

    if (timesOverlap(slotStart, slotEnd, bookingStart, bookingEnd)) {
      return true;
    }
  }
  return false;
}

// Get all approved bookings for a specific date
async function getBookingsForDate(dateStr, env) {
  if (!env || !env.SCHEDULER_KV) return [];
  
  const bookings = [];
  const listResult = await env.SCHEDULER_KV.list({ prefix: 'booking:' });
  
  for (const key of listResult.keys) {
    const data = await env.SCHEDULER_KV.get(key.name);
    if (data) {
      const booking = JSON.parse(data);
      // Only include approved bookings for the requested date
      if (booking.status === 'approved' && booking.date === dateStr) {
        bookings.push(booking);
      }
    }
  }
  
  return bookings;
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

  // Get all existing bookings for this date
  const existingBookings = await getBookingsForDate(dateStr, env);

  const slotIntervalMinutes = 10;
  const meetingDuration = meetingType.durationMinutes;

  const dayStart = new Date(date);
  dayStart.setHours(meetingType.dailyStart, 0, 0, 0);

  const dayEnd = new Date(date);
  dayEnd.setHours(meetingType.dailyEnd, 0, 0, 0);

  let current = new Date(dayStart);

  while (current < dayEnd) {
    const slotEnd = new Date(current);
    slotEnd.setMinutes(current.getMinutes() + meetingDuration);

    const available =
      isWithinDailyWindow(current, slotEnd, meetingType) &&
      !overlapsBlockedRange(current, slotEnd, meetingType) &&
      !hasConflictWithBookings(current, slotEnd, existingBookings);

    slots.push({
      time: current.toTimeString().slice(0, 5),
      available: available,
    });

    current.setMinutes(current.getMinutes() + slotIntervalMinutes);
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
  } = body;

  // Validate required fields
  if (!name || !email || !date || !time || !meeting_type_id || !discussion_details) {
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

  // Parse and validate datetime
  const dateObj = new Date(date + ' ' + time);
  if (isNaN(dateObj.getTime())) {
    return new Response(JSON.stringify({ error: 'Invalid date/time format' }), {
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

  const endTime = new Date(dateObj);
  endTime.setMinutes(endTime.getMinutes() + meetingType.durationMinutes);

  if (!isWithinDailyWindow(dateObj, endTime, meetingType)) {
    return new Response(
      JSON.stringify({ error: 'Selected time is outside of available hours' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }

  if (overlapsBlockedRange(dateObj, endTime, meetingType)) {
    return new Response(
      JSON.stringify({ error: 'Selected time overlaps a blocked period' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }

  // Check for conflicts with existing bookings
  const existingBookings = await getBookingsForDate(date, env);
  if (hasConflictWithBookings(dateObj, endTime, existingBookings)) {
    return new Response(
      JSON.stringify({ error: 'Selected time conflicts with an existing booking' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
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

  // Check for conflicts one more time before approving
  const dateObj = new Date(pendingRequest.requestedDate + ' ' + pendingRequest.requestedTime);
  const endTime = new Date(dateObj);
  endTime.setMinutes(endTime.getMinutes() + pendingRequest.durationMinutes);

  const existingBookings = await getBookingsForDate(pendingRequest.requestedDate, env);
  if (hasConflictWithBookings(dateObj, endTime, existingBookings)) {
    return new Response(
      JSON.stringify({ error: 'Time slot is no longer available due to a conflict' }),
      { status: 409, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }

  // Create the approved booking
  const booking = {
    id: pendingRequest.id,
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
    discussionTopics: pendingRequest.discussionTopics,
    discussionDetails: pendingRequest.discussionDetails,
    status: 'approved',
    approvedAt: new Date().toISOString(),
  };

  // Store the approved booking
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

  // Send confirmation email to user
  const emailWorkerURL = env.EMAIL_WORKER_URL;
  if (emailWorkerURL) {
    try {
      await fetch(emailWorkerURL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'approval',
          to: booking.email,
          name: booking.name,
          meetingType: booking.meetingTypeTitle,
          date: booking.date,
          time: booking.time,
          timezone: booking.timezone,
          duration: booking.durationMinutes,
        }),
      });
    } catch (err) {
      console.error('Failed to send approval email:', err);
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
