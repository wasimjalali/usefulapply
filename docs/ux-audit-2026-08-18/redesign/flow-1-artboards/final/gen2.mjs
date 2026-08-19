// Flow 1, final direction: guided line for the first run, chat spine as the
// dashboard once the kit exists. Run: node gen2.mjs
import { writeFileSync } from 'node:fs';
import { I, wordmark, cvDoc, cvToolbar, jobText, stages, progress, wrap, frame } from '../lib.mjs';

const assistantAvatar = `<svg width="22" height="26" viewBox="0 0 84 100" aria-hidden="true" style="flex-shrink: 0; margin-top: 2px"><path d="M0 0 H24 V58 A18 18 0 0 0 60 58 V0 H62 L84 22 V58 A42 42 0 0 1 0 58 Z" fill="#0C1929"></path><path d="M62 0 V22 H84 Z" fill="#C4932E"></path></svg>`;

const EXTRA = {
  gear: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"></path></svg>',
  upload: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><path d="m17 8-5-5-5 5M12 3v12"></path></svg>',
  google: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z"></path><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3a7.2 7.2 0 0 1-10.8-3.8H1.3v3.1A12 12 0 0 0 12 24z"></path><path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1z"></path><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8z"></path></svg>',
  out: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><path d="m16 17 5-5-5-5M21 12H9"></path></svg>',
  card: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"></rect><path d="M2 10h20"></path></svg>',
  bell: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"></path></svg>',
  shield: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>',
  star: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9z"></path></svg>',
};

// ---------------------------------------------------------------------------
// The guided line (first run)
// ---------------------------------------------------------------------------
function lineHeader({ anonymous = true } = {}) {
  return `<div style="display: flex; align-items: center; gap: 12px; height: 52px; padding: 0 20px; background: #FEFDFB; border-bottom: 1px solid #F5F0E8; flex-shrink: 0">
    ${wordmark}
    <div style="flex: 1"></div>
    ${anonymous ? `<span style="font-size: 14px; font-weight: 500; color: #1E3A5F; padding: 0 10px">Log in</span><span class="btn-navy" style="height: 40px; padding: 0 16px; font-size: 14px">Sign up free</span>` : ''}
  </div>`;
}

function stepper(active) {
  const steps = ['Your CV', 'The job', 'Your fit', 'Your kit'];
  return `<div style="display: flex; align-items: center; gap: 0">${steps.map((s, i) => {
    const done = i < active, on = i === active;
    const dot = done
      ? `<span style="display: inline-flex; width: 28px; height: 28px; border-radius: 9999px; background: #D4A853; color: #FFFFFF; align-items: center; justify-content: center">${I.check}</span>`
      : on
        ? `<span style="display: inline-flex; width: 28px; height: 28px; border-radius: 9999px; background: #1E3A5F; color: #FFFFFF; font-size: 13px; font-weight: 700; align-items: center; justify-content: center">${i + 1}</span>`
        : `<span style="display: inline-flex; width: 28px; height: 28px; border-radius: 9999px; border: 1.5px solid #DED4C3; color: #6B7280; font-size: 13px; font-weight: 600; align-items: center; justify-content: center">${i + 1}</span>`;
    return `<div style="display: flex; align-items: center; gap: 10px">${dot}<span style="font-size: 14px; font-weight: ${on ? 600 : 500}; color: ${on ? '#182F4D' : done ? '#2D3748' : '#6B7280'}">${s}</span></div>${i < 3 ? `<span style="width: 64px; height: 1.5px; background: ${done ? '#D4A853' : '#DED4C3'}; margin: 0 16px"></span>` : ''}`;
  }).join('')}</div>`;
}

const lineFrame = (step, inner, { anonymous = true } = {}) => frame(`
  ${lineHeader({ anonymous })}
  <div style="flex: 1; display: flex; flex-direction: column; align-items: center; padding-top: 56px; gap: 36px">
    ${stepper(step)}
    ${inner}
  </div>`);

const lineCard = (inner, extra = '') => `<div class="card" style="width: 720px; padding: 32px; display: flex; flex-direction: column; gap: 22px; background: #FFFFFF; ${extra}">${inner}</div>`;
const h = (t) => `<span class="serif" style="font-size: 24px; color: #182F4D">${t}</span>`;

// 1. Your CV
const L1 = lineFrame(0, `
  ${lineCard(`
    ${h('Start with your CV')}
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; height: 240px; border: 2px dashed #E0C687; border-radius: 16px; background: #FBF7EE">
      <span style="display: inline-flex; width: 52px; height: 52px; border-radius: 9999px; background: #FFFFFF; color: #C4932E; align-items: center; justify-content: center; box-shadow: 0 1px 2px 0 rgb(30 58 95 / 0.06)">${EXTRA.upload}</span>
      <span style="font-size: 15px; font-weight: 600; color: #182F4D">Drop your CV here</span>
      <span class="muted" style="font-size: 13px">PDF or Word, up to 10 MB</span>
      <span class="btn-gold" style="height: 44px; padding: 0 20px; font-size: 14px; margin-top: 4px">Choose a file</span>
    </div>
    <span style="font-size: 13px; color: #1E3A5F; font-weight: 500; text-align: center">No file handy? Paste the text instead</span>
  `)}
  <span class="muted" style="width: 720px; font-size: 13px">Free to try. Your first fit check is on us, no account needed.</span>
`);

// 1b. Reading your CV (working), job paste available in parallel
const L1b = lineFrame(0, `
  ${lineCard(`
    <div style="display: flex; align-items: center; gap: 12px">${h('Reading Alex_Morgan_CV.pdf')}<div style="flex: 1"></div><span class="muted" style="font-size: 13px">About 40 seconds</span></div>
    ${stages([
      ['Opening the file', 'done', '2 pages, English'],
      ['Picking out your experience and skills', 'active', 'Roles, dates, tools, results'],
      ['Building your base CV', 'todo', 'Clean, ATS-friendly, yours to edit'],
    ])}
    ${progress(35)}
  `)}
  ${lineCard(`
    <span style="font-size: 15px; font-weight: 600; color: #182F4D">While I read, paste the job ad</span>
    <div style="border: 1px solid #F5F0E8; border-radius: 16px; background: #FFFFFF; padding: 14px 16px; height: 96px; font-size: 14px; color: #6B7280">Paste the whole ad. Title, company and requirements, all of it.</div>
  `, 'background: #FEFDFB')}
`);

// 2. The job (decision), anonymous
const L2 = lineFrame(1, `
  ${lineCard(`
    ${h('Which job are you applying for?')}
    <div style="border: 2px solid #E0C687; border-radius: 16px; background: #FFFFFF; padding: 14px 16px; height: 200px; overflow: hidden; font-size: 14px; line-height: 1.5; color: #2D3748; box-shadow: 0 0 0 4px rgb(212 168 83 / 0.12)"><strong>Product Manager, B2B Platform</strong><br>Pixellot · Remote, US<br><br>${jobText}</div>
    <div style="display: flex; align-items: center; gap: 16px">
      <span class="btn-gold" style="height: 48px; padding: 0 22px; font-size: 15px">${I.search}Check my fit <span class="cost">· free</span></span>
      <span style="font-size: 13px; color: #1E3A5F; font-weight: 500">Skip the check, generate the full kit now</span>
    </div>
  `)}
  <div style="width: 720px; display: flex; flex-direction: column; gap: 10px; font-size: 13px">
    <span style="display: inline-flex; align-items: center; gap: 8px; white-space: nowrap"><span style="display: inline-flex; width: 20px; height: 20px; border-radius: 9999px; background: #D4A853; color: #FFFFFF; align-items: center; justify-content: center">${I.check}</span><span><strong>Your CV:</strong> Alex Morgan, Product Manager</span><span style="color: #1E3A5F; font-weight: 500">Change</span></span>
    <span class="muted">Your first fit check is free. The full kit needs a free account, 4 credits included.</span>
  </div>
`);

// 3. Your fit (working)
const L3 = lineFrame(2, `
  ${lineCard(`
    <div style="display: flex; align-items: center; gap: 12px">${h('Checking your fit for Pixellot')}<div style="flex: 1"></div><span class="muted" style="font-size: 13px">About 10 seconds left</span></div>
    ${stages([
      ['Reading the job ad', 'done', 'Role, must-haves, nice-to-haves'],
      ['Matching your skills', 'done', '14 of 18 requirements covered'],
      ['Scoring the fit', 'active', 'Strengths, gaps and a recommendation'],
    ])}
    ${progress(70)}
  `)}
`);

// 3b. Fit result, anonymous, kit needs an account
function fitResult({ anonymous }) {
  const bullet = (t, good) => `<div style="display: flex; gap: 10px; align-items: flex-start; font-size: 14px; line-height: 1.5; color: #2D3748"><span style="display: inline-flex; width: 20px; height: 20px; flex-shrink: 0; border-radius: 9999px; background: ${good ? '#EEF4F1' : '#F5ECD5'}; color: ${good ? '#3A5A4C' : '#825E1C'}; align-items: center; justify-content: center; margin-top: 1px">${good ? I.check : '<span style="display:block;width:8px;height:2px;background:currentColor;border-radius:2px"></span>'}</span><span>${t}</span></div>`;
  return lineFrame(2, `
  ${lineCard(`
    <div style="display: flex; align-items: center; gap: 20px">
      <div style="display: flex; flex-direction: column; gap: 4px; flex: 1">${h('Good fit for Pixellot')}<span class="muted" style="font-size: 14px">You cover 14 of 18 requirements. Worth applying.</span></div>
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 84px; height: 84px; border-radius: 9999px; border: 4px solid #D4A853; background: #FBF7EE"><span class="serif" style="font-size: 26px; color: #182F4D; line-height: 1">76%</span><span style="font-size: 10px; font-weight: 600; color: #A37824; letter-spacing: 0.06em">MATCH</span></div>
    </div>
    <div class="line"></div>
    <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px">
      <div style="display: flex; flex-direction: column; gap: 10px"><span style="font-size: 12px; font-weight: 600; letter-spacing: 0.08em; color: #3A5A4C">STRONG</span>
        ${bullet('B2B SaaS product ownership, 6 years', true)}${bullet('API and integration roadmaps (Zendesk, Salesforce)', true)}${bullet('Data-driven prioritisation, 40% engagement lift', true)}</div>
      <div style="display: flex; flex-direction: column; gap: 10px"><span style="font-size: 12px; font-weight: 600; letter-spacing: 0.08em; color: #825E1C">GAPS</span>
        ${bullet('No sports-tech or video platform experience', false)}${bullet('They ask for SQL daily, your CV lists it once', false)}</div>
    </div>
    <div class="line"></div>
    <div style="display: flex; align-items: center; gap: 16px">
      <span class="btn-gold" style="height: 48px; padding: 0 22px; font-size: 15px">${I.spark}Generate the full kit <span class="cost">· 1.5 credits</span></span>
      <span class="muted" style="font-size: 13px">${anonymous ? 'Takes a free account first, 4 credits included, no card.' : 'Tailored CV, cover letter and two emails, about 50 seconds.'}</span>
    </div>
  `)}
  <span style="width: 720px; font-size: 13px; color: #1E3A5F; font-weight: 500">Not this one? Try another job</span>
`, { anonymous });
}
const L3b = fitResult({ anonymous: true });

// 4a. Sign up, inline at the kit step
const L4a = lineFrame(3, `
  ${lineCard(`
    <div style="display: flex; flex-direction: column; gap: 6px">${h('Create your free account to get the kit')}<span class="muted" style="font-size: 14px">4 credits included. Your CV and this fit check come with you.</span></div>
    <span class="btn-ghost" style="height: 48px; font-size: 15px; gap: 10px">${EXTRA.google}Continue with Google</span>
    <div style="display: flex; align-items: center; gap: 12px"><span class="line" style="flex: 1"></span><span class="muted" style="font-size: 12px">or</span><span class="line" style="flex: 1"></span></div>
    <div style="display: flex; flex-direction: column; gap: 10px">
      <div style="height: 48px; border: 1px solid #F5F0E8; border-radius: 12px; background: #FFFFFF; padding: 0 14px; display: flex; align-items: center; font-size: 14px; color: #6B7280">Email</div>
      <div style="height: 48px; border: 1px solid #F5F0E8; border-radius: 12px; background: #FFFFFF; padding: 0 14px; display: flex; align-items: center; font-size: 14px; color: #6B7280">Password</div>
    </div>
    <span class="btn-gold" style="height: 48px; font-size: 15px">Create account and generate the kit</span>
    <span class="muted" style="font-size: 12px; text-align: center">Already have an account? <span style="color: #1E3A5F; font-weight: 500">Log in</span></span>
  `)}
`);

// 4b. Your kit (working), signed in now
const L4b = lineFrame(3, `
  ${lineCard(`
    <div style="display: flex; align-items: center; gap: 12px">${h('Building your kit for Pixellot')}<div style="flex: 1"></div><span class="muted" style="font-size: 13px">About 30 seconds left</span></div>
    ${stages([
      ['Tailoring your CV', 'done', 'Keywords from the ad, nothing invented'],
      ['Writing the cover letter', 'active', 'Opens with your 40% engagement result'],
      ['Drafting the application email', 'todo', ''],
      ['Drafting the follow-up email', 'todo', 'With the right day to send it'],
    ])}
    ${progress(45)}
    <div class="line"></div>
    <span class="muted" style="font-size: 13px">When this finishes your workspace opens with everything in it.</span>
  `)}
`, { anonymous: false });

// ---------------------------------------------------------------------------
// The chat spine (dashboard after the first kit)
// ---------------------------------------------------------------------------
function sidebar({ active = 0, apps, menuOpen = false, credits = '2.5 of 4 credits', pct = 62 }) {
  const menu = menuOpen ? `
    <div style="position: absolute; left: 12px; right: 12px; bottom: 64px; background: #FFFFFF; border: 1px solid #F5F0E8; border-radius: 16px; box-shadow: 0 1px 0 0 rgb(30 58 95 / 0.05), 0 22px 46px -20px rgb(30 58 95 / 0.22); padding: 8px; display: flex; flex-direction: column; gap: 4px; z-index: 5">
      <div style="display: flex; flex-direction: column; gap: 10px; padding: 12px 12px 14px 12px; border-radius: 12px; background: #FBF7EE">
        <div style="display: flex; align-items: center; justify-content: space-between"><span style="font-size: 13px; font-weight: 600; color: #182F4D">Free plan</span><span style="font-size: 13px; font-weight: 600; color: #A37824">${credits}</span></div>
        <span style="display: block; height: 4px; border-radius: 9999px; background: #F5ECD5"><span style="display: block; width: ${pct}%; height: 4px; border-radius: 9999px; background: #D4A853"></span></span>
        <span class="btn-gold" style="height: 40px; font-size: 13px">Upgrade to Plus ${I.arrow}</span>
      </div>
      ${[[I.user, 'Profile & account'], [EXTRA.card, 'Plan & billing'], [EXTRA.bell, 'Notifications']].map(([ic, l]) => `<div style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px; font-size: 14px; font-weight: 500; color: #2D3748"><span class="muted">${ic}</span>${l}</div>`).join('')}
      <div class="line" style="margin: 4px 8px"></div>
      <div style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px; font-size: 14px; font-weight: 500; color: #2D3748"><span class="muted">${EXTRA.out}</span>Sign out</div>
    </div>` : '';
  return `<div style="position: relative; width: 248px; flex-shrink: 0; display: flex; flex-direction: column; gap: 16px; padding: 16px 12px 12px 12px; border-right: 1px solid #F5F0E8; background: #FAF7F2">
    <div style="padding: 2px 6px 4px 6px">${wordmark}</div>
    <span class="btn-navy" style="height: 44px; font-size: 14px">${I.plus}New application</span>
    <div class="card" style="display: flex; align-items: center; gap: 10px; padding: 10px 12px">
      <span style="display: inline-flex; width: 30px; height: 30px; border-radius: 9999px; background: #F5ECD5; color: #A37824; align-items: center; justify-content: center">${I.briefcase}</span>
      <div style="display: flex; flex-direction: column; gap: 2px; flex: 1"><span style="font-size: 13px; font-weight: 600">Today's feed</span><span class="muted" style="font-size: 12px">5 new roles for you</span></div>
      <span style="display: inline-flex; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 9999px; background: #C4932E; color: #FFFFFF; font-size: 10px; font-weight: 700; align-items: center; justify-content: center">5</span>
    </div>
    <div style="display: flex; flex-direction: column; gap: 6px">
      <span class="muted" style="font-size: 11px; font-weight: 600; letter-spacing: 0.08em; padding: 0 6px">APPLICATIONS</span>
      ${apps.map(([co, role, st, stl], i) => `<div style="display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border-radius: 12px; ${i === active ? 'background: #FFFFFF; box-shadow: 0 1px 2px 0 rgb(30 58 95 / 0.06), 0 1px 1px -1px rgb(30 58 95 / 0.05); border: 1px solid #F5F0E8' : 'border: 1px solid transparent'}">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px"><span style="font-size: 13px; font-weight: 600; color: #182F4D">${co}</span><span class="status ${st}">${stl}</span></div>
        <span class="muted" style="font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">${role}</span>
      </div>`).join('')}
    </div>
    <div style="flex: 1"></div>
    <span class="muted" style="display: flex; align-items: center; gap: 8px; padding: 8px 6px; font-size: 13px; font-weight: 500">${I.clipboard}Tracker table</span>
    <div class="line"></div>
    <div style="display: flex; align-items: center; gap: 10px; padding: 4px 6px">
      <span style="display: inline-flex; width: 32px; height: 32px; border-radius: 9999px; background: #1E3A5F; color: #FFFFFF; font-size: 12px; font-weight: 700; align-items: center; justify-content: center">AM</span>
      <div style="display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0"><span style="font-size: 13px; font-weight: 600; color: #182F4D; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">Alex Morgan</span><span class="muted" style="font-size: 11px">Free plan</span></div>
      <span style="display: inline-flex; width: 36px; height: 36px; border-radius: 9999px; align-items: center; justify-content: center; ${menuOpen ? 'background: #FFFFFF; color: #182F4D; box-shadow: 0 1px 2px 0 rgb(30 58 95 / 0.06); border: 1px solid #F5F0E8' : 'color: #6B7280'}">${EXTRA.gear}</span>
    </div>
    ${menu}
  </div>`;
}

function convoHeader(title, sub) {
  return `<div style="display: flex; align-items: center; gap: 12px; padding: 14px 20px; border-bottom: 1px solid #F5F0E8">
    <div style="display: flex; flex-direction: column; gap: 2px; flex: 1"><span class="serif" style="font-size: 16px; color: #182F4D">${title}</span><span class="muted" style="font-size: 12px">${sub}</span></div>
    <span class="muted">${I.history}</span>
  </div>`;
}
function assistant(inner) {
  return `<div style="display: flex; gap: 12px; align-items: flex-start">${assistantAvatar}<div style="display: flex; flex-direction: column; gap: 12px; flex: 1; font-size: 14px; line-height: 1.55; color: #2D3748">${inner}</div></div>`;
}
function userMsg(inner) {
  return `<div style="display: flex; justify-content: flex-end"><div style="max-width: 86%; background: #FFFFFF; border: 1px solid #F5F0E8; border-radius: 16px 16px 4px 16px; padding: 12px 14px; font-size: 14px; line-height: 1.5; color: #2D3748; box-shadow: 0 1px 2px 0 rgb(30 58 95 / 0.06)">${inner}</div></div>`;
}
function composer(placeholder = 'Ask for a change, or paste a screening question') {
  return `<div style="padding: 12px 20px 16px 20px"><div style="display: flex; align-items: center; gap: 10px; height: 52px; padding: 0 8px 0 18px; border-radius: 16px; background: #FFFFFF; border: 1px solid #F5F0E8; box-shadow: 0 1px 2px 0 rgb(30 58 95 / 0.06)"><span class="muted" style="flex: 1; font-size: 14px">${placeholder}</span><span style="display: inline-flex; width: 38px; height: 38px; border-radius: 9999px; background: #D4A853; color: #FFFFFF; align-items: center; justify-content: center">${I.send}</span></div></div>`;
}

function canvasKit({ tabsActive = 'cv' } = {}) {
  const tab = (label, icon, key) => `<span class="tab${tabsActive === key ? ' on' : ''}">${icon}${label}</span>`;
  return `<div style="flex: 1; display: flex; flex-direction: column; min-width: 0; background: #FAF7F2">
    <div style="display: flex; align-items: center; gap: 12px; padding: 12px 20px; border-bottom: 1px solid #F5F0E8">
      <div class="pillgroup">${tab('CV', I.file, 'cv')}${tab('Cover letter', I.mail, 'cl')}${tab('Emails', I.send, 'em')}</div>
      <div style="flex: 1"></div>
      <span style="display: inline-flex; align-items: center; gap: 8px; height: 36px; padding: 0 12px; border-radius: 9999px; background: #EEF4F1; color: #3A5A4C; font-size: 13px; font-weight: 600">${EXTRA.shield}ATS 78% <span style="font-weight: 500; opacity: 0.8">· see every change</span></span>
    </div>
    <div style="display: flex; align-items: center; gap: 12px; padding: 10px 20px; border-bottom: 1px solid #F5F0E8">
      <div class="pillgroup"><span class="tab">Original</span><span class="tab on">Tailored</span></div>
      <span class="muted" style="font-size: 13px">Tailored for Pixellot. Nothing invented.</span>
    </div>
    <div style="display: flex; align-items: center; gap: 12px; padding: 10px 20px; border-bottom: 1px solid #F5F0E8">${cvToolbar}</div>
    <div style="flex: 1; overflow: hidden; display: flex; justify-content: center; padding: 28px 0 0 0">${cvDoc({ width: 600 })}</div>
  </div>`;
}

function canvasBase() {
  return `<div style="flex: 1; display: flex; flex-direction: column; min-width: 0; background: #FAF7F2">
    <div style="display: flex; align-items: center; gap: 12px; padding: 12px 20px; border-bottom: 1px solid #F5F0E8">
      <div class="pillgroup"><span class="tab on"><span style="color: #C4932E">${I.file}</span>CV</span><span class="tab" style="opacity: 0.45">${I.mail}Cover letter</span><span class="tab" style="opacity: 0.45">${I.send}Emails</span></div>
    </div>
    <div style="display: flex; align-items: center; gap: 12px; padding: 10px 20px; border-bottom: 1px solid #F5F0E8">${cvToolbar}</div>
    <div style="display: flex; align-items: center; gap: 10px; padding: 10px 20px; border-bottom: 1px solid #F5F0E8; font-size: 13px"><span style="font-weight: 600">Base CV.</span><span class="muted">Not tailored to this job yet.</span></div>
    <div style="flex: 1; overflow: hidden; display: flex; justify-content: center; padding: 28px 0 0 0">${cvDoc({ width: 600 })}</div>
  </div>`;
}

const APPS_READY = [
  ['Pixellot', 'Product Manager, B2B Platform', 'now', 'Kit ready'],
];
const APPS_LATER = [
  ['Avetta', 'Product Manager, B2B SaaS', 'now', 'Now'],
  ['Pixellot', 'Product Manager, B2B Platform', 'draft', 'Drafted'],
  ['TeamSnap', 'Senior Product Manager', 'applied', 'Applied'],
];

const spineFrame = (side, convo, canvas) => frame(`
  <div style="flex: 1; display: flex; min-height: 0">
    ${side}
    <div style="width: 520px; flex-shrink: 0; display: flex; flex-direction: column; border-right: 1px solid #F5F0E8; background: #FEFDFB">${convo}</div>
    ${canvas}
  </div>`);

// S1. Kit ready, the workspace opens
const S1 = spineFrame(
  sidebar({ apps: APPS_READY }),
  `${convoHeader('Pixellot, Product Manager', 'Kit ready · 2.5 credits left')}
   <div style="flex: 1; display: flex; flex-direction: column; gap: 22px; padding: 22px 20px; overflow: hidden">
     ${assistant(`<span>Your kit for Pixellot is ready. Everything is on the right: a tailored CV (ATS 78%), a cover letter that opens with your 40% engagement result, and two emails. Nothing was invented, every claim is from your CV.</span>
       <div style="display: flex; flex-direction: column; gap: 10px; align-items: flex-start">
         <span class="chip primary">${I.download}Download the kit</span>
         <span class="chip secondary">${EXTRA.star}Answer screening questions</span>
       </div>
       <span class="muted" style="font-size: 13px">Want changes? Just say so. "Make the cover letter shorter" works.</span>`)}
     ${assistant(`<span style="font-size: 13px; color: #6B7280">This is your workspace. Each application is a conversation on the left. Today's feed has 5 roles picked for you.</span>`)}
   </div>
   ${composer()}`,
  canvasKit()
);

// S2. Settings menu open
const S2 = spineFrame(
  sidebar({ apps: APPS_READY, menuOpen: true }),
  `${convoHeader('Pixellot, Product Manager', 'Kit ready · 2.5 credits left')}
   <div style="flex: 1; display: flex; flex-direction: column; gap: 22px; padding: 22px 20px; overflow: hidden">
     ${assistant(`<span>Your kit for Pixellot is ready. Everything is on the right: a tailored CV (ATS 78%), a cover letter that opens with your 40% engagement result, and two emails.</span>
       <div style="display: flex; flex-direction: column; gap: 10px; align-items: flex-start">
         <span class="chip primary">${I.download}Download the kit</span>
         <span class="chip secondary">${EXTRA.star}Answer screening questions</span>
       </div>`)}
   </div>
   ${composer()}`,
  canvasKit()
);

// S3. A later application, short on credits: the price and the wall live on the chip
const S3 = spineFrame(
  sidebar({ apps: APPS_LATER, credits: '0.5 of 4 credits', pct: 12 }),
  `${convoHeader('Avetta, Product Manager', 'Started just now')}
   <div style="flex: 1; display: flex; flex-direction: column; gap: 22px; padding: 22px 20px; overflow: hidden">
     ${userMsg(`<div style="display: flex; flex-direction: column; gap: 6px"><span style="font-weight: 600; color: #182F4D">Product Manager, B2B SaaS · Avetta</span><span class="muted" style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden">Avetta is hiring a Product Manager to lead our supplier-risk platform. You'll own the roadmap for our B2B SaaS offering, partner closely with engineering and design, and ship features used by 500+ enterprise customers.</span><span style="font-size: 12px; font-weight: 600; color: #1E3A5F; display: inline-flex; align-items: center; gap: 4px">${I.chev}Show more</span></div>`)}
     ${assistant(`<span>Avetta, Product Manager on a supplier-risk platform. You have 0.5 credits left this month, so here's what's open to you:</span>
       <div style="display: flex; flex-direction: column; gap: 10px; align-items: flex-start">
         <span class="chip primary">${I.search}Check fit first <span class="cost">· 0.5 credits</span></span>
         <span class="chip secondary" style="color: #825E1C; border-color: #EBDAAE; background: #FBF7EE">${I.arrow}Upgrade to Plus to generate the kit <span class="cost">· 50 credits a month</span></span>
       </div>
       <span class="muted" style="font-size: 13px">The full kit needs 1.5. Your free credits reset on 1 September.</span>`)}
   </div>
   ${composer('Paste a job ad or ask anything')}`,
  canvasBase()
);

const out = {
  'Main.dc.html': L1,
  'L1b-Reading-CV.dc.html': L1b,
  'L2-The-Job.dc.html': L2,
  'L3-Fit-Working.dc.html': L3,
  'L3b-Fit-Result.dc.html': L3b,
  'L4a-Sign-Up.dc.html': L4a,
  'L4b-Kit-Working.dc.html': L4b,
  'S1-Kit-Ready.dc.html': S1,
  'S2-Settings-Menu.dc.html': S2,
  'S3-Short-On-Credits.dc.html': S3,
};
for (const [name, body] of Object.entries(out)) writeFileSync(name, wrap(body));
console.log('wrote', Object.keys(out).join(', '));
