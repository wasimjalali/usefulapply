// Flow 6: auth pages (log in, sign up, forgot password, check your email). Run: node gen8.mjs
import { writeFileSync } from 'node:fs';
import { I, wordmark, wrap, frame } from '../flow-1-artboards/lib.mjs';
import { EXTRA } from '../flow-1-artboards/final/spine.mjs';

const header = (right) => `<div style="display: flex; align-items: center; gap: 12px; height: 52px; padding: 0 20px; background: #FEFDFB; border-bottom: 1px solid #F5F0E8; flex-shrink: 0">${wordmark}<div style="flex: 1"></div>${right}</div>`;
const page = (right, inner, foot = '') => frame(`
  ${header(right)}
  <div style="flex: 1; display: flex; flex-direction: column; align-items: center; padding-top: 84px; gap: 20px">
    <div class="card" style="width: 440px; padding: 32px; display: flex; flex-direction: column; gap: 18px; background: #FFFFFF">${inner}</div>
    ${foot}
  </div>`);
const h = (t) => `<span class="serif" style="font-size: 24px; color: #182F4D">${t}</span>`;
const input = (label, value, { icon = '', right = '' } = {}) => `<div style="display: flex; flex-direction: column; gap: 6px"><span style="font-size: 12px; font-weight: 600; letter-spacing: 0.06em; color: #2D3748">${label}</span><div style="height: 48px; box-sizing: border-box; border: 1px solid #F5F0E8; border-radius: 12px; background: #FFFFFF; padding: 0 14px; display: flex; align-items: center; gap: 10px; font-size: 14px; color: ${value.startsWith('•') || value === value.toLowerCase() && value.includes('@') ? '#2D3748' : '#6B7280'}">${icon}<span style="flex: 1">${value}</span>${right}</div></div>`;
const google = `<span class="btn-ghost" style="height: 48px; font-size: 15px; gap: 10px">${EXTRA.google}Continue with Google</span>`;
const or = `<div style="display: flex; align-items: center; gap: 12px"><span class="line" style="flex: 1"></span><span class="muted" style="font-size: 12px">or</span><span class="line" style="flex: 1"></span></div>`;
const gold = (t) => `<span class="btn-gold" style="height: 48px; font-size: 15px">${t}</span>`;
const link = (t) => `<span style="color: #1E3A5F; font-weight: 600">${t}</span>`;
const back = `<span style="display: inline-flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 500; color: #1E3A5F">${EXTRA.back || ''}Back to usefulapply.com</span>`;
const eye = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#6B7280"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
const mailIcon = '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="m22 7-10 6L2 7"></path></svg>';

// A1. Log in
const A1 = page(`<span style="font-size: 14px; font-weight: 500; color: #1E3A5F; padding: 0 10px">New here? Try it free</span>`, `
  ${h('Log in')}
  ${google}${or}
  ${input('EMAIL', 'alex.morgan@email.com')}
  ${input('PASSWORD', '••••••••••••', { right: eye })}
  <div style="display: flex; justify-content: flex-end; margin-top: -8px">${link('Forgot password?')}</div>
  ${gold('Log in')}`,
  `<span class="muted" style="font-size: 14px">Don't have an account? ${link('Sign up')}</span>`);

// A2. Sign up (standalone, for links from the site and email). Same card as flow 1 step 4a.
const A2 = page(`<span style="font-size: 14px; font-weight: 500; color: #1E3A5F; padding: 0 10px">Log in</span>`, `
  <div style="display: flex; flex-direction: column; gap: 6px">${h('Create your free account')}<span class="muted" style="font-size: 14px">4 credits a month, no card.</span></div>
  ${google}${or}
  ${input('NAME', 'Your name')}
  ${input('EMAIL', 'you@example.com')}
  ${input('PASSWORD', 'At least 8 characters', { right: eye })}
  ${gold('Create account')}
  <span class="muted" style="font-size: 12px; text-align: center; line-height: 1.5">By continuing you agree to the ${link('Terms')} and ${link('Privacy policy')}.</span>`,
  `<span class="muted" style="font-size: 14px">Already have an account? ${link('Log in')}</span>`);

// A3. Forgot password
const A3 = page(`<span style="font-size: 14px; font-weight: 500; color: #1E3A5F; padding: 0 10px">Log in</span>`, `
  <div style="display: flex; flex-direction: column; gap: 6px">${h('Reset your password')}<span class="muted" style="font-size: 14px">We'll email you a link. It works for 30 minutes.</span></div>
  ${input('EMAIL', 'alex.morgan@email.com')}
  ${gold('Send the link')}`,
  `<span class="muted" style="font-size: 14px">${link('Back to log in')}</span>`);

// A4. Check your email (after reset or after sign-up verification)
const A4 = page(`<span style="font-size: 14px; font-weight: 500; color: #1E3A5F; padding: 0 10px">Log in</span>`, `
  <div style="display: flex; flex-direction: column; align-items: center; gap: 14px; text-align: center; padding: 8px 0">
    <span style="display: inline-flex; width: 64px; height: 64px; border-radius: 9999px; background: #FBF7EE; color: #C4932E; align-items: center; justify-content: center">${mailIcon}</span>
    ${h('Check your email')}
    <span style="font-size: 14px; line-height: 1.55; color: #2D3748">We sent a link to <strong>alex.morgan@email.com</strong>. Open it on this device and you're back in.</span>
    <span class="muted" style="font-size: 13px">Nothing after a minute? Check spam, or ${link('send it again')}.</span>
  </div>`,
  `<span class="muted" style="font-size: 14px">Wrong address? ${link('Start over')}</span>`);

const out = { 'Main.dc.html': A1, 'A2-Sign-Up.dc.html': A2, 'A3-Forgot-Password.dc.html': A3, 'A4-Check-Email.dc.html': A4 };
for (const [name, body] of Object.entries(out)) writeFileSync(name, wrap(body));
console.log('wrote', Object.keys(out).join(', '));
