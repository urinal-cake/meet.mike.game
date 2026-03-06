/**
 * Cloudflare Worker for Email Notifications
 * Sends meeting request notifications, approvals with iCal, and denials via Resend
 * 
 * Environment Variables needed:
 * - RESEND_API_KEY: Your Resend API key
 */

export default {
  async fetch(request, env, ctx) {
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // Only allow POST
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const emailData = await request.json();
      
      // Route to appropriate handler based on email type
      switch (emailData.type) {
        case 'admin_notification':
          return await handleAdminNotification(emailData, env, corsHeaders);
        case 'admin_confirmed':
          return await handleAdminConfirmed(emailData, env, corsHeaders);
        case 'approval':
          return await handleApproval(emailData, env, corsHeaders);
        case 'reschedule_proposal':
          return await handleRescheduleProposal(emailData, env, corsHeaders);
        case 'denial':
          return await handleDenial(emailData, env, corsHeaders);
        case 'cancellation':
          return await handleCancellation(emailData, env, corsHeaders);
        case 'cancellation_admin':
          return await handleCancellationAdmin(emailData, env, corsHeaders);
        default:
          return new Response(JSON.stringify({ error: 'Unknown email type' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
      }
    } catch (error) {
      console.error('Error:', error);
      return new Response(JSON.stringify({
        error: 'Internal server error',
        message: error.message,
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
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

async function handleAdminNotification(emailData, env, corsHeaders) {
  const { reviewURL, name, email, company, role, meetingType, duration, date, time, timezone, location, topics, details } = emailData;
  
  const topicsHtml = topics && topics.length > 0 
    ? mapTopicLabels(topics).map(t => `<li>${t}</li>`).join('')
    : '<li>None selected</li>';

  const locationInfo = location ? `<p><strong>Location:</strong> ${location}</p>` : '';
  
  const adminHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f3f4f6; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #f18900 0%, #ff9101 100%); color: white; padding: 30px 20px; text-align: center; }
          .content { padding: 30px; }
          .details { background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f18900; }
          .details h3 { margin-top: 0; color: #1f2937; }
          .details p { margin: 8px 0; color: #4b5563; }
          .button { display: inline-block; background: linear-gradient(135deg, #f18900 0%, #ff9101 100%); color: white !important; padding: 14px 32px; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: 600; text-align: center; }
          .footer { color: #9ca3af; font-size: 13px; text-align: center; padding: 20px; border-top: 1px solid #e5e7eb; }
          ul { list-style: none; padding-left: 0; }
          ul li { padding: 4px 0; }
          ul li:before { content: "• "; color: #f18900; font-weight: bold; margin-right: 8px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0; font-size: 28px;">🔔 New Meeting Request</h1>
          </div>
          <div class="content">
            <p style="font-size: 16px; color: #1f2937;">You have a new meeting request pending your review.</p>
            
            <div class="details">
              <h3>Attendee Information</h3>
              <p><strong>Name:</strong> ${name}</p>
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Company:</strong> ${company}</p>
              <p><strong>Role:</strong> ${role}</p>
            </div>
            
            <div class="details">
              <h3>Meeting Details</h3>
              <p><strong>Type:</strong> ${meetingType} (${duration} minutes)</p>
              <p><strong>Requested:</strong> ${date} at ${time}</p>
              <p><strong>Timezone:</strong> ${timezone}</p>
              ${locationInfo}
            </div>
            
            <div class="details">
              <h3>Discussion Topics</h3>
              <ul>${topicsHtml}</ul>
              <p style="margin-top: 15px;"><strong>Details:</strong><br>${details.replace(/\n/g, '<br>')}</p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${reviewURL}" class="button">Review & Respond</a>
            </div>
            
            <p style="color: #6b7280; font-size: 14px;">Click the button above to approve or decline this meeting request.</p>
          </div>
          <div class="footer">
            <p>Personal Scheduler | <a href="https://mike.game" style="color: #f18900;">mike.game</a></p>
          </div>
        </div>
      </body>
    </html>
  `;

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Scheduler <notifications@mike.game>',
      to: 'hello@mike.game',
      subject: `🔔 New Meeting Request from ${name}`,
      html: adminHtml,
    }),
  });

  const resendData = await resendResponse.json();

  if (!resendResponse.ok) {
    return new Response(JSON.stringify({
      error: 'Failed to send admin notification',
      details: resendData,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  return new Response(JSON.stringify({
    success: true,
    message: 'Admin notification sent',
    id: resendData.id,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

async function handleAdminConfirmed(emailData, env, corsHeaders) {
  const { to, appointmentId, name, email, company, role, meetingType, duration, startTime, endTime, timezone, location, topics, details, calendarEventLink, cancellationURL, rescheduleURL } = emailData;
  
  const icalEvent = generateICalEvent({
    uid: appointmentId,
    name: name,
    email: email,
    company: company,
    role: role,
    meetingType: meetingType,
    startTime: startTime,
    endTime: endTime,
    attendee: email,
    location: location,
    topics: topics,
    details: details,
    cancellationURL: cancellationURL,
    rescheduleURL: rescheduleURL,
  });

  const topicsHtml = topics && topics.length > 0 
    ? `<p><strong>Topics:</strong> ${mapTopicLabels(topics).join(', ')}</p>`
    : '';

  const companyInfo = company ? `<p><strong>Company:</strong> ${company}</p>` : '';
  const roleInfo = role ? `<p><strong>Role:</strong> ${role}</p>` : '';
  const locationInfo = location ? `<p><strong>Location:</strong> ${location}</p>` : '';
  
  const calendarLink = calendarEventLink 
    ? `<p><a href="${calendarEventLink}" style="color: #f18900; text-decoration: none;">📅 View in Google Calendar</a></p>`
    : '';

  const emailHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f3f4f6; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px 20px; text-align: center; }
          .content { padding: 30px; }
          .details { background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981; }
          .details h3 { margin-top: 0; color: #1f2937; }
          .details p { margin: 8px 0; color: #4b5563; }
          .footer { color: #9ca3af; font-size: 13px; text-align: center; padding: 20px; border-top: 1px solid #e5e7eb; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0; font-size: 28px;">✅ Meeting Confirmed</h1>
          </div>
          <div class="content">
            <p style="font-size: 16px; color: #1f2937;">You have confirmed a meeting request.</p>
            
            <div class="details">
              <h3>Meeting Details</h3>
              <p><strong>Type:</strong> ${meetingType}</p>
              <p><strong>Date & Time:</strong> ${new Date(startTime).toLocaleString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric', 
                hour: 'numeric', 
                minute: '2-digit',
                timeZone: timezone || 'America/Los_Angeles'
              })}</p>
              <p><strong>Duration:</strong> ${duration} minutes</p>
              ${locationInfo}
            </div>

            <div class="details">
              <h3>Attendee Information</h3>
              <p><strong>Name:</strong> ${name}</p>
              <p><strong>Email:</strong> ${email}</p>
              ${companyInfo}
              ${roleInfo}
              ${topicsHtml}
            </div>

            ${calendarLink}

            <p style="background: #dbeafe; padding: 15px; border-radius: 8px; border-left: 4px solid #3b82f6; color: #1e40af; margin: 20px 0;">
              <strong>📧 Confirmation sent:</strong> The attendee has been notified and received a calendar invite.
            </p>

            ${cancellationURL || rescheduleURL ? `
            <p style="background: #fee2e2; padding: 15px; border-radius: 8px; border-left: 4px solid #ef4444; color: #991b1b; margin: 20px 0;">
              <strong>Need to change this meeting?</strong><br>
              ${cancellationURL ? `<a href="${cancellationURL}" style="color: #dc2626; text-decoration: underline;">Cancel meeting</a>` : ''}
              ${cancellationURL && rescheduleURL ? ' | ' : ''}
              ${rescheduleURL ? `<a href="${rescheduleURL}" style="color: #dc2626; text-decoration: underline;">Propose a new time</a>` : ''}
            </p>
            ` : ''}
          </div>
          <div class="footer">
            <p>Scheduler Admin Notification · <a href="https://meet.mike.game" style="color: #f18900; text-decoration: none;">meet.mike.game</a></p>
          </div>
        </div>
      </body>
    </html>
  `;

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Scheduler <hello@mike.game>',
      to: to,
      subject: `✅ Meeting Confirmed: ${name} - ${new Date(startTime).toLocaleDateString()}`,
      html: emailHtml,
      attachments: [
        {
          filename: 'meeting.ics',
          content: btoa(unescape(encodeURIComponent(icalEvent))),
        },
      ],
    }),
  });

  if (!resendResponse.ok) {
    const errorText = await resendResponse.text();
    console.error('Resend API error:', errorText);
    return new Response(JSON.stringify({
      error: 'Failed to send admin confirmation email',
      details: errorText
    }), {
      status: resendResponse.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const resendData = await resendResponse.json();

  return new Response(JSON.stringify({
    success: true,
    message: 'Admin confirmation sent',
    id: resendData.id,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

async function handleApproval(emailData, env, corsHeaders) {
  const { to, name, email, company, role, meetingType, duration, startTime, endTime, timezone, location, topics, details, appointmentId, cancellationURL, rescheduleURL } = emailData;
  
  // Validate required fields
  if (!to || !appointmentId || !name || !startTime || !endTime) {
    return new Response(JSON.stringify({
      error: 'Missing required fields for approval email'
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // Generate iCal format
  const icalEvent = generateICalEvent({
    uid: appointmentId,
    name: name,
    email: email,
    company: company,
    role: role,
    meetingType: meetingType,
    startTime: startTime,
    endTime: endTime,
    attendee: to,
    location: location,
    topics: topics,
    details: details,
    cancellationURL: cancellationURL,
    rescheduleURL: rescheduleURL,
  });

  const topicsHtml = topics && topics.length > 0 
    ? `<p><strong>Topics:</strong> ${mapTopicLabels(topics).join(', ')}</p>`
    : '';

  const locationInfo = location ? `<p><strong>Location:</strong> ${location}</p>` : '';

  // Create email HTML
  const emailHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f3f4f6; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #f18900 0%, #ff9101 100%); color: white; padding: 30px 20px; text-align: center; }
          .content { padding: 30px; }
          .details { background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f18900; }
          .details h3 { margin-top: 0; color: #1f2937; }
          .details p { margin: 8px 0; color: #4b5563; }
          .footer { color: #9ca3af; font-size: 13px; text-align: center; padding: 20px; border-top: 1px solid #e5e7eb; }
          .success { background: #d1fae5; color: #065f46; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0; font-size: 28px;">✅ Meeting Confirmed!</h1>
          </div>
          <div class="content">
            <div class="success">
              <strong>Your meeting request has been approved!</strong>
            </div>
            
            <p style="font-size: 16px; color: #1f2937;">Hi ${name},</p>
            <p>Great news! Your meeting with Mike Sanders has been confirmed.</p>
            
            <div class="details">
              <h3>Meeting Details</h3>
              <p><strong>Type:</strong> ${meetingType}</p>
              <p><strong>Date & Time:</strong> ${new Date(startTime).toLocaleString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric', 
                hour: 'numeric', 
                minute: '2-digit',
                timeZone: timezone || 'America/Los_Angeles'
              })}</p>
              <p><strong>Duration:</strong> ${duration} minutes</p>
              <p><strong>Timezone:</strong> ${timezone || 'America/Los_Angeles'}</p>
              ${locationInfo}
              ${topicsHtml}
            </div>

            <p>📅 <strong>A calendar invite (.ics file) has been attached to this email.</strong> Click it to add this meeting to your calendar.</p>
            
            ${cancellationURL || rescheduleURL ? `
            <p style="background: #fee2e2; padding: 15px; border-radius: 8px; border-left: 4px solid #ef4444; color: #991b1b; margin: 20px 0;">
              <strong>Need to change this meeting?</strong><br>
              ${cancellationURL ? `<a href="${cancellationURL}" style="color: #dc2626; text-decoration: underline;">Cancel meeting</a>` : ''}
              ${cancellationURL && rescheduleURL ? ' | ' : ''}
              ${rescheduleURL ? `<a href="${rescheduleURL}" style="color: #dc2626; text-decoration: underline;">Propose a new time</a>` : ''}
            </p>
            ` : `
            <p style="background: #fef3c7; padding: 15px; border-radius: 8px; border-left: 4px solid #f59e0b; color: #78350f; margin: 20px 0;">
              <strong>Need to reschedule or cancel?</strong><br>
              Just reply to this email at hello@mike.game and we'll be happy to help.
            </p>
            `}

            <p>Looking forward to connecting!</p>
            <p style="margin-top: 30px;"><strong>Mike Sanders</strong><br><a href="https://mike.game" style="color: #f18900; text-decoration: none;">mike.game</a></p>
          </div>
          <div class="footer">
            <p>This is an automated confirmation. Questions? Reply to hello@mike.game</p>
          </div>
        </div>
      </body>
    </html>
  `;

  // Send email via Resend with iCal attachment
  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Mike Sanders <hello@mike.game>',
      to: to,
      reply_to: 'hello@mike.game',
      subject: `✅ Meeting Confirmed with Mike Sanders - ${new Date(startTime).toLocaleDateString()}`,
      html: emailHtml,
      attachments: [
        {
          filename: 'meeting.ics',
          content: btoa(unescape(encodeURIComponent(icalEvent))),
        },
      ],
    }),
  });

  const resendData = await resendResponse.json();

  if (!resendResponse.ok) {
    return new Response(JSON.stringify({
      error: 'Failed to send approval email',
      details: resendData,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  return new Response(JSON.stringify({
    success: true,
    message: 'Approval email sent with calendar invite',
    id: resendData.id,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

async function handleRescheduleProposal(emailData, env, corsHeaders) {
  const {
    to,
    recipientType,
    meetingType,
    duration,
    timezone,
    attendeeName,
    attendeeEmail,
    currentDate,
    currentTime,
    proposedDate,
    proposedTime,
    acceptURL,
    declineURL,
  } = emailData;

  if (!to || !meetingType || !currentDate || !currentTime || !proposedDate || !proposedTime || !acceptURL || !declineURL) {
    return new Response(JSON.stringify({ error: 'Missing required fields for reschedule proposal email' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const subjectPrefix = recipientType === 'admin' ? 'Action Needed: ' : '';
  const currentReadable = new Date(`${currentDate}T${currentTime}:00`).toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone || 'America/Los_Angeles',
  });
  const proposedReadable = new Date(`${proposedDate}T${proposedTime}:00`).toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone || 'America/Los_Angeles',
  });

  const emailHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f3f4f6; padding: 20px; }
          .container { max-width: 620px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #0f766e 0%, #155e75 100%); color: white; padding: 28px 20px; text-align: center; }
          .content { padding: 28px; }
          .details { background: #f8fafc; padding: 18px; border-radius: 8px; margin: 18px 0; border-left: 4px solid #0d9488; }
          .details p { margin: 8px 0; color: #334155; }
          .actions { margin: 24px 0; }
          .btn { display: inline-block; padding: 12px 18px; border-radius: 8px; text-decoration: none; font-weight: 700; margin-right: 10px; }
          .btn-accept { background: #16a34a; color: #fff; }
          .btn-decline { background: #dc2626; color: #fff; }
          .footer { color: #94a3b8; font-size: 12px; text-align: center; padding: 18px; border-top: 1px solid #e5e7eb; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin:0; font-size:26px;">Proposed New Meeting Time</h1>
          </div>
          <div class="content">
            <p>A new time has been proposed for this meeting. Please choose whether to accept it.</p>

            <div class="details">
              <p><strong>Meeting Type:</strong> ${meetingType}</p>
              <p><strong>Duration:</strong> ${duration || 'N/A'} minutes</p>
              <p><strong>Attendee:</strong> ${attendeeName || 'N/A'} (${attendeeEmail || 'N/A'})</p>
              <p><strong>Current Time:</strong> ${currentReadable}</p>
              <p><strong>Proposed Time:</strong> ${proposedReadable}</p>
              <p><strong>Timezone:</strong> ${timezone || 'America/Los_Angeles'}</p>
            </div>

            <div class="actions">
              <a class="btn btn-accept" href="${acceptURL}">Accept New Time</a>
              <a class="btn btn-decline" href="${declineURL}">Keep Current Time</a>
            </div>

            <p>If you accept, the meeting invite and calendar event will be updated automatically for everyone.</p>
          </div>
          <div class="footer">
            <p>Sent by meet.mike.game scheduling assistant</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Mike Sanders <hello@mike.game>',
      to,
      reply_to: 'hello@mike.game',
      subject: `${subjectPrefix}Reschedule Proposal: ${meetingType} (${proposedDate} ${proposedTime})`,
      html: emailHtml,
    }),
  });

  if (!resendResponse.ok) {
    const errorText = await resendResponse.text();
    return new Response(JSON.stringify({
      error: 'Failed to send reschedule proposal email',
      details: errorText,
    }), {
      status: resendResponse.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const resendData = await resendResponse.json();
  return new Response(JSON.stringify({ success: true, id: resendData.id }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

async function handleDenial(emailData, env, corsHeaders) {
  const { to, name, reason } = emailData;
  
  if (!to || !name) {
    return new Response(JSON.stringify({
      error: 'Missing required fields for denial email'
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const denialHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f3f4f6; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%); color: white; padding: 30px 20px; text-align: center; }
          .content { padding: 30px; }
          .notice { background: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b; color: #78350f; }
          .reason { background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #6b7280; }
          .footer { color: #9ca3af; font-size: 13px; text-align: center; padding: 20px; border-top: 1px solid #e5e7eb; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0; font-size: 28px;">Meeting Request Update</h1>
          </div>
          <div class="content">
            <p style="font-size: 16px; color: #1f2937;">Hi ${name},</p>
            
            <p>Thank you for your meeting request.</p>
            
            <div class="notice">
              <p style="margin: 0;"><strong>Unfortunately, I'm unable to accommodate this meeting at the requested time.</strong></p>
            </div>
            ${reason ? `
            <div class="reason">
              <strong>Reason:</strong><br>
              ${reason.split('\n').join('<br>')}
            </div>
            ` : ''}
            
            <p>My schedule is quite full during this period, and I want to ensure I can give our conversation the time and attention it deserves.</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="https://meet.mike.game" style="display: inline-block; background-color: #f18900; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: bold;">Try Another Time</a>
            </div>
            
            <p>Alternatively, <strong>you can also reply to this email at hello@mike.game</strong> with:</p>
            <ul style="color: #4b5563; line-height: 1.8;">
              <li>A few alternative dates/times that work for you</li>
              <li>Your flexibility on the meeting format</li>
              <li>Any questions you may have</li>
            </ul>
            
            <p>I appreciate your understanding and look forward to the possibility of connecting at a more suitable time.</p>
            
            <p style="margin-top: 30px;">Best regards,<br><strong>Mike Sanders</strong><br><a href="https://mike.game" style="color: #f18900; text-decoration: none;">mike.game</a></p>
          </div>
          <div class="footer">
            <p>Questions or alternative times? Reply to hello@mike.game</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Mike Sanders <hello@mike.game>',
      to: to,
      reply_to: 'hello@mike.game',
      subject: 'Meeting Request Update',
      html: denialHtml,
    }),
  });

  const resendData = await resendResponse.json();

  if (!resendResponse.ok) {
    return new Response(JSON.stringify({
      error: 'Failed to send denial email',
      details: resendData,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  return new Response(JSON.stringify({
    success: true,
    message: 'Denial email sent',
    id: resendData.id,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

function generateICalEvent(event) {
  const startDate = new Date(event.startTime).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const endDate = new Date(event.endTime).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  
  // Build detailed description
  let descriptionParts = [
    'ATTENDEE INFORMATION',
    `Name: ${event.name}`,
    `Email: ${event.email || event.attendee}`,
  ];

  if (event.company) {
    descriptionParts.push(`Company: ${event.company}`);
  }

  if (event.role) {
    descriptionParts.push(`Role: ${event.role}`);
  }

  if (event.location) {
    descriptionParts.push('');
    descriptionParts.push('LOCATION');
    descriptionParts.push(event.location);
  }

  if (event.topics && event.topics.length > 0) {
    descriptionParts.push('');
    descriptionParts.push('DISCUSSION TOPICS');
    mapTopicLabels(event.topics).forEach(topic => {
      descriptionParts.push(`• ${topic}`);
    });
  }

  if (event.details) {
    descriptionParts.push('');
    descriptionParts.push('DETAILS & NOTES');
    descriptionParts.push(event.details);
  }

  if (event.cancellationURL) {
    descriptionParts.push('');
    descriptionParts.push('NEED TO CANCEL?');
    descriptionParts.push(`Cancel this meeting: ${event.cancellationURL}`);
  }

  if (event.rescheduleURL) {
    descriptionParts.push('');
    descriptionParts.push('NEED TO RESCHEDULE?');
    descriptionParts.push(`Propose a new time: ${event.rescheduleURL}`);
  }

  const description = descriptionParts.join('\\n');
  const location = event.location ? event.location.replace(/,/g, '\\,') : 'TBD - Details will be shared closer to the date';

  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Mike Sanders//Scheduler//EN
CALSCALE:GREGORIAN
METHOD:REQUEST
BEGIN:VEVENT
UID:${event.uid}@mike.game
DTSTART:${startDate}
DTEND:${endDate}
DTSTAMP:${now}
CREATED:${now}
LAST-MODIFIED:${now}
SUMMARY:${event.meetingType || 'Meeting with Mike Sanders'}
DESCRIPTION:${description}
LOCATION:${location}
ORGANIZER;CN=Mike Sanders:mailto:hello@mike.game
ATTENDEE;CN=${event.name};RSVP=TRUE:mailto:${event.attendee}
STATUS:CONFIRMED
SEQUENCE:0
TRANSP:OPAQUE
BEGIN:VALARM
TRIGGER:-PT15M
ACTION:DISPLAY
DESCRIPTION:Meeting with Mike Sanders in 15 minutes
END:VALARM
END:VEVENT
END:VCALENDAR`;
}

async function handleCancellation(emailData, env, corsHeaders) {
  const { to, name, meetingType, date, time, timezone } = emailData;

  const emailHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f3f4f6; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 30px 20px; text-align: center; }
          .content { padding: 30px; }
          .details { background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ef4444; }
          .footer { color: #9ca3af; font-size: 13px; text-align: center; padding: 20px; border-top: 1px solid #e5e7eb; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0; font-size: 28px;">❌ Meeting Cancelled</h1>
          </div>
          <div class="content">
            <p style="font-size: 16px; color: #1f2937;">Hi ${name},</p>
            <p>Your meeting has been cancelled as requested.</p>
            
            <div class="details">
              <h3 style="margin-top: 0; color: #1f2937;">Cancelled Meeting</h3>
              <p><strong>Type:</strong> ${meetingType}</p>
              <p><strong>Date:</strong> ${new Date(date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
              <p><strong>Time:</strong> ${time} ${timezone}</p>
            </div>

            <p>If you'd like to reschedule, please visit <a href="https://meet.mike.game" style="color: #f18900; text-decoration: none;">meet.mike.game</a> to book a new time.</p>
            
            <p style="margin-top: 30px;">Best regards,<br><strong>Mike Sanders</strong></p>
          </div>
          <div class="footer">
            <p>Questions? Reply to hello@mike.game</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Mike Sanders <hello@mike.game>',
      to: to,
      reply_to: 'hello@mike.game',
      subject: `Meeting Cancelled - ${meetingType}`,
      html: emailHtml,
    }),
  });

  if (!resendResponse.ok) {
    const errorText = await resendResponse.text();
    return new Response(JSON.stringify({
      error: 'Failed to send cancellation email',
      details: errorText
    }), {
      status: resendResponse.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const resendData = await resendResponse.json();
  return new Response(JSON.stringify({
    success: true,
    id: resendData.id,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

async function handleCancellationAdmin(emailData, env, corsHeaders) {
  const { to, name, email, meetingType, date, time, timezone } = emailData;

  const emailHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f3f4f6; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 30px 20px; text-align: center; }
          .content { padding: 30px; }
          .details { background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ef4444; }
          .footer { color: #9ca3af; font-size: 13px; text-align: center; padding: 20px; border-top: 1px solid #e5e7eb; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0; font-size: 28px;">❌ Meeting Cancelled by Attendee</h1>
          </div>
          <div class="content">
            <p style="font-size: 16px; color: #1f2937;">${name} has cancelled their meeting.</p>
            
            <div class="details">
              <h3 style="margin-top: 0; color: #1f2937;">Cancelled Meeting</h3>
              <p><strong>Attendee:</strong> ${name} (${email})</p>
              <p><strong>Type:</strong> ${meetingType}</p>
              <p><strong>Date:</strong> ${new Date(date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
              <p><strong>Time:</strong> ${time} ${timezone}</p>
            </div>

            <p>The event has been removed from your calendar.</p>
          </div>
          <div class="footer">
            <p>Scheduler Admin Notification · <a href="https://meet.mike.game" style="color: #f18900; text-decoration: none;">meet.mike.game</a></p>
          </div>
        </div>
      </body>
    </html>
  `;

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Scheduler <hello@mike.game>',
      to: to,
      subject: `Meeting Cancelled: ${name} - ${meetingType}`,
      html: emailHtml,
    }),
  });

  if (!resendResponse.ok) {
    const errorText = await resendResponse.text();
    return new Response(JSON.stringify({
      error: 'Failed to send admin cancellation email',
      details: errorText
    }), {
      status: resendResponse.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const resendData = await resendResponse.json();
  return new Response(JSON.stringify({
    success: true,
    id: resendData.id,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}
