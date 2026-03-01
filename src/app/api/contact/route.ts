import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { getPostHogServer } from '@/lib/posthog-server';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';

export const runtime = 'nodejs';

// Input length limits
const MAX_NAME_LENGTH = 200;
const MAX_EMAIL_LENGTH = 254; // RFC 5321
const MAX_SUBJECT_LENGTH = 300;
const MAX_MESSAGE_LENGTH = 5_000;

/** Escape HTML special characters to prevent XSS in email templates */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

interface ContactFormData {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const clientIP = getClientIP(request);
    const rateLimitResult = checkRateLimit(`contact:${clientIP}`, RATE_LIMITS['contact']);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const body: ContactFormData = await request.json();
    const { name, email, subject, message } = body;

    // Validate required fields
    if (!name || !email || !subject || !message) {
      return NextResponse.json(
        { error: 'All fields are required' },
        { status: 400 }
      );
    }

    // Input length validation
    if (name.length > MAX_NAME_LENGTH || email.length > MAX_EMAIL_LENGTH ||
        subject.length > MAX_SUBJECT_LENGTH || message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        { error: 'One or more fields exceed the maximum allowed length.' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      );
    }

    // Save to Supabase using the anon key — the contact_submissions table allows public inserts via RLS
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseAnonKey) {
      const supabase = createClient(supabaseUrl, supabaseAnonKey);

      // Create contact_submissions table if it doesn't exist (admin should do this)
      // For now, just log the submission
      const { error: dbError } = await supabase
        .from('contact_submissions')
        .insert({
          name,
          email,
          subject,
          message,
          submitted_at: new Date().toISOString(),
        });

      if (dbError) {
        console.error('Failed to save contact submission:', dbError);
        // Don't fail the request if DB save fails
      }
    }

    // Send email notification via Resend
    const resend = new Resend(process.env.RESEND_API_KEY);

    try {
      // Escape all user input to prevent XSS in email HTML
      const safeName = escapeHtml(name);
      const safeEmail = escapeHtml(email);
      const safeSubject = escapeHtml(subject);
      const safeMessage = escapeHtml(message);

      const emailContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1e3a8a; margin-bottom: 20px;">New Contact Form Submission</h2>

          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <p style="margin: 0 0 10px 0;"><strong>Name:</strong> ${safeName}</p>
            <p style="margin: 0 0 10px 0;"><strong>Email:</strong> ${safeEmail}</p>
            <p style="margin: 0 0 10px 0;"><strong>Subject:</strong> ${safeSubject}</p>
          </div>

          <div style="background: #f1f5f9; padding: 20px; border-radius: 8px;">
            <h3 style="margin: 0 0 10px 0; color: #334155;">Message:</h3>
            <p style="margin: 0; white-space: pre-wrap;">${safeMessage}</p>
          </div>

          <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
            <p style="margin: 0; color: #64748b; font-size: 14px;">
              This message was sent from the KarKo AI contact form.
            </p>
          </div>
        </div>
      `;

      await resend.emails.send({
        from: 'KarKo AI <noreply@karkoai.com>',
        to: 'wasim@karkoai.com',
        subject: `KarKo AI Contact: ${safeSubject}`,
        html: emailContent,
      });
    } catch (emailError) {
      console.error('Failed to send email:', emailError);
      // Don't fail the request if email sending fails
    }

    return NextResponse.json({
      success: true,
      message: 'Thank you for your message. We will get back to you soon!',
    });
  } catch (error) {
    const posthog = getPostHogServer();
    posthog.captureException(error as Error, 'server_error', {
      endpoint: '/api/contact',
      method: 'POST',
    });
    await posthog.flush();
    console.error('Contact form error:', error);
    return NextResponse.json(
      { error: 'Failed to submit form. Please try again.' },
      { status: 500 }
    );
  }
}
