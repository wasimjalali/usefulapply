import { writeFileSync } from 'node:fs';
import { CSS, I, wordmark, creditChip, avatar, header, cvDoc, cvToolbar, jobText, stages, progress, wrap, frame } from './lib.mjs';
// ---------------------------------------------------------------------------
// OPTION A: the conversation is the spine. Sidebar of applications (one
// conversation each), conversation in the middle, result canvas on the right.
// ---------------------------------------------------------------------------
function sidebarA(active = 0) {
  const apps = [
    ['Pixellot', 'Product Manager, B2B Platform', 'now', 'Now'],
    ['Avetta', 'Product Manager, B2B SaaS', 'draft', 'Drafted'],
    ['TeamSnap', 'Senior Product Manager', 'applied', 'Applied'],
  ];
  return `<div style="width: 248px; flex-shrink: 0; display: flex; flex-direction: column; gap: 16px; padding: 16px 12px; border-right: 1px solid #F5F0E8; background: #FAF7F2">
    <span class="btn-navy" style="height: 44px; font-size: 14px">${I.plus}New application</span>
    <div style="display: flex; flex-direction: column; gap: 6px">
      <div class="card" style="display: flex; align-items: center; gap: 10px; padding: 10px 12px">
        <span style="display: inline-flex; width: 30px; height: 30px; border-radius: 9999px; background: #F5ECD5; color: #A37824; align-items: center; justify-content: center">${I.briefcase}</span>
        <div style="display: flex; flex-direction: column; gap: 2px; flex: 1"><span style="font-size: 13px; font-weight: 600">Today's feed</span><span class="muted" style="font-size: 12px">5 new roles for you</span></div>
        <span style="display: inline-flex; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 9999px; background: #C4932E; color: #FFFFFF; font-size: 10px; font-weight: 700; align-items: center; justify-content: center">5</span>
      </div>
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
  </div>`;
}

function convoHeader(sub) {
  return `<div style="display: flex; align-items: center; gap: 12px; padding: 14px 20px; border-bottom: 1px solid #F5F0E8">
    <div style="display: flex; flex-direction: column; gap: 2px; flex: 1"><span class="serif" style="font-size: 16px; color: #182F4D">Pixellot, Product Manager</span><span class="muted" style="font-size: 12px">${sub}</span></div>
    <span class="muted">${I.history}</span>
  </div>`;
}

const assistantAvatar = `<svg width="22" height="26" viewBox="0 0 84 100" aria-hidden="true" style="flex-shrink: 0; margin-top: 2px"><path d="M0 0 H24 V58 A18 18 0 0 0 60 58 V0 H62 L84 22 V58 A42 42 0 0 1 0 58 Z" fill="#0C1929"></path><path d="M62 0 V22 H84 Z" fill="#C4932E"></path></svg>`;

function assistant(inner) {
  return `<div style="display: flex; gap: 12px; align-items: flex-start">${assistantAvatar}<div style="display: flex; flex-direction: column; gap: 12px; flex: 1; font-size: 14px; line-height: 1.55; color: #2D3748">${inner}</div></div>`;
}
function userMsg(inner) {
  return `<div style="display: flex; justify-content: flex-end"><div style="max-width: 86%; background: #FFFFFF; border: 1px solid #F5F0E8; border-radius: 16px 16px 4px 16px; padding: 12px 14px; font-size: 14px; line-height: 1.5; color: #2D3748; box-shadow: 0 1px 2px 0 rgb(30 58 95 / 0.06)">${inner}</div></div>`;
}
const jobCard = `<div style="display: flex; flex-direction: column; gap: 6px"><span style="font-weight: 600; color: #182F4D">Product Manager, B2B Platform · Pixellot</span><span class="muted" style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden">${jobText}</span><span style="font-size: 12px; font-weight: 600; color: #1E3A5F; display: inline-flex; align-items: center; gap: 4px">${I.chev}Show more</span></div>`;

function composer(placeholder = 'Paste a job ad or ask anything', working = false) {
  return `<div style="padding: 12px 20px 16px 20px"><div style="display: flex; align-items: center; gap: 10px; height: 52px; padding: 0 8px 0 18px; border-radius: 16px; background: #FFFFFF; border: 1px solid #F5F0E8; box-shadow: 0 1px 2px 0 rgb(30 58 95 / 0.06)"><span class="muted" style="flex: 1; font-size: 14px">${placeholder}</span><span style="display: inline-flex; width: 38px; height: 38px; border-radius: 9999px; background: ${working ? '#F5ECD5' : '#D4A853'}; color: ${working ? '#A37824' : '#FFFFFF'}; align-items: center; justify-content: center">${working ? '<span style="display: block; width: 10px; height: 10px; border-radius: 2px; background: currentColor"></span>' : I.send}</span></div></div>`;
}

function canvasA({ banner = null, tabsActive = 'cv' } = {}) {
  const tab = (label, icon, key, disabled = false) => `<span class="tab${tabsActive === key ? ' on' : ''}" style="${disabled ? 'opacity: 0.45' : ''}">${icon}${label}</span>`;
  return `<div style="flex: 1; display: flex; flex-direction: column; min-width: 0; background: #FAF7F2">
    <div style="display: flex; align-items: center; gap: 12px; padding: 12px 20px; border-bottom: 1px solid #F5F0E8">
      <div class="pillgroup">${tab('CV', I.file, 'cv')}${tab('Cover letter', I.mail, 'cl', true)}${tab('Email', I.send, 'em', true)}</div>
    </div>
    <div style="display: flex; align-items: center; gap: 12px; padding: 10px 20px; border-bottom: 1px solid #F5F0E8">${cvToolbar}</div>
    ${banner ? `<div style="display: flex; align-items: center; gap: 10px; padding: 10px 20px; background: #FBF7EE; border-bottom: 1px solid #EBDAAE; font-size: 13px; color: #825E1C">${banner}</div>` : `<div style="display: flex; align-items: center; gap: 10px; padding: 10px 20px; border-bottom: 1px solid #F5F0E8; font-size: 13px"><span style="font-weight: 600">Base CV.</span><span class="muted">Not tailored to a job yet.</span></div>`}
    <div style="flex: 1; overflow: hidden; display: flex; justify-content: center; padding: 28px 0 0 0">${cvDoc({ width: 600 })}</div>
  </div>`;
}

const A_decision = frame(`
  ${header({ tabs: false })}
  <div style="flex: 1; display: flex; min-height: 0">
    ${sidebarA(0)}
    <div style="width: 520px; flex-shrink: 0; display: flex; flex-direction: column; border-right: 1px solid #F5F0E8; background: #FEFDFB">
      ${convoHeader('Started just now')}
      <div style="flex: 1; display: flex; flex-direction: column; gap: 22px; padding: 22px 20px; overflow: hidden">
        ${assistant(`<span>Your CV is in. I read it as <strong>Alex Morgan, Product Manager, 6 years in B2B SaaS</strong>. It's on the right. Paste a job ad whenever you're ready.</span>`)}
        ${userMsg(jobCard)}
        ${assistant(`<span>Pixellot, Product Manager on their B2B platform. Two ways to start:</span>
          <div style="display: flex; flex-direction: column; gap: 10px; align-items: flex-start">
            <span class="chip primary">${I.search}Check fit first <span class="cost">· 0.5 credits</span></span>
            <span class="chip secondary">${I.spark}Generate the full kit <span class="cost">· 2 credits</span></span>
          </div>
          <span class="muted" style="font-size: 13px">You have 4 credits. If you check fit first, the kit costs 1.5 instead of 2.</span>`)}
      </div>
      ${composer()}
    </div>
    ${canvasA()}
  </div>`);

const A_working = frame(`
  ${header({ tabs: false, credits: '3.5 credits', pct: 88 })}
  <div style="flex: 1; display: flex; min-height: 0">
    ${sidebarA(0)}
    <div style="width: 520px; flex-shrink: 0; display: flex; flex-direction: column; border-right: 1px solid #F5F0E8; background: #FEFDFB">
      ${convoHeader('Checking fit · 12 seconds')}
      <div style="flex: 1; display: flex; flex-direction: column; gap: 22px; padding: 22px 20px; overflow: hidden">
        ${userMsg(jobCard)}
        ${assistant(`<span>Pixellot, Product Manager on their B2B platform. Two ways to start:</span>
          <div style="display: flex; gap: 8px; align-items: center"><span class="chip secondary" style="height: 36px; padding: 0 14px; font-size: 13px; opacity: 0.6">${I.spark}Generate the full kit · 2</span></div>`)}
        ${userMsg(`<span style="display: inline-flex; align-items: center; gap: 8px; font-weight: 600; color: #182F4D">${I.search}Check fit first <span class="cost muted" style="font-weight: 500">· 0.5 credits</span></span>`)}
        ${assistant(`<span>On it. About 20 seconds.</span>
          <div class="card" style="padding: 14px; display: flex; flex-direction: column; gap: 12px">
            ${stages([
              ['Reading the job ad', 'done', 'Role, must-haves, nice-to-haves'],
              ['Matching your skills', 'done', '14 of 18 requirements covered'],
              ['Scoring the fit', 'active', 'Strengths, gaps and a recommendation'],
            ])}
            ${progress(70)}
          </div>`)}
      </div>
      ${composer('Working... you can keep typing', true)}
    </div>
    ${canvasA({ banner: `${I.loader}<span><strong>Checking fit for Pixellot.</strong> Your CV stays here. The score lands in the chat.</span>` })}
  </div>`);

// ---------------------------------------------------------------------------
// OPTION B: same room as today, sequence fixed. Two panels, chat on the right.
// ---------------------------------------------------------------------------
function leftPanelB({ banner = null } = {}) {
  return `<div style="flex: 1; display: flex; flex-direction: column; min-width: 0; background: #FAF7F2; border-right: 1px solid #F5F0E8">
    <div style="display: flex; align-items: center; gap: 12px; padding: 12px 20px">
      <div class="pillgroup"><span class="tab on"><span style="color: #C4932E">${I.file}</span>CV</span><span class="tab">${I.mail}Cover Letter</span><span class="tab">${I.send}Email</span></div>
    </div>
    <div style="display: flex; align-items: center; gap: 12px; padding: 4px 20px 12px 20px">${cvToolbar}</div>
    ${banner ? `<div style="display: flex; align-items: center; gap: 10px; padding: 10px 20px; background: #FBF7EE; border-top: 1px solid #EBDAAE; border-bottom: 1px solid #EBDAAE; font-size: 13px; color: #825E1C">${banner}</div>` : `<div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 20px; border-top: 1px solid #F5F0E8; border-bottom: 1px solid #F5F0E8; font-size: 13px"><span><span style="font-weight: 600">This is your base CV.</span> <span class="muted">It isn't tailored to a job yet.</span></span></div>`}
    <div style="flex: 1; overflow: hidden; display: flex; justify-content: center; padding: 28px 0 0 0">${cvDoc({ width: 620 })}</div>
  </div>`;
}

function rightHeaderB() {
  return `<div style="display: flex; align-items: center; gap: 12px; padding: 16px 20px">
    <span style="color: #C4932E">${I.spark}</span><span style="font-size: 15px; font-weight: 600; color: #182F4D">New Application</span>
    <div style="flex: 1"></div>
    <span class="muted">${I.history}</span><span style="display: inline-flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 500; color: #182F4D">${I.plus}New</span>
  </div>`;
}

const B_decision = frame(`
  ${header()}
  <div style="flex: 1; display: flex; min-height: 0">
    ${leftPanelB()}
    <div style="width: 430px; flex-shrink: 0; display: flex; flex-direction: column; background: #FEFDFB">
      ${rightHeaderB()}
      <div style="flex: 1; display: flex; flex-direction: column; gap: 16px; padding: 4px 20px">
        <div style="border: 2px solid #E0C687; border-radius: 16px; background: #FFFFFF; padding: 14px 16px; height: 220px; overflow: hidden; font-size: 14px; line-height: 1.5; color: #2D3748; box-shadow: 0 0 0 4px rgb(212 168 83 / 0.12)"><strong>Product Manager, B2B Platform</strong><br>Pixellot · Remote, US<br><br>${jobText}<br><br>What you'll do: own the roadmap for our B2B admin platform and partner integrations...</div>
        <div style="display: flex; flex-direction: column; gap: 10px">
          <span class="btn-gold" style="height: 48px; font-size: 15px">${I.search}Check fit first <span class="cost">· 0.5 credits</span></span>
          <span style="text-align: center; font-size: 13px; color: #1E3A5F; font-weight: 500">Or generate the full kit now, 2 credits</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px; font-size: 13px"><span class="muted">You have 4 credits. Checking fit first makes the kit 1.5 instead of 2.</span><span style="color: #1E3A5F; font-weight: 500; display: inline-flex; align-items: center; gap: 4px">No job in mind? Pick one from your Job Feed ${I.arrow}</span></div>
      </div>
    </div>
  </div>`);

const B_working = frame(`
  ${header({ credits: '3.5 credits', pct: 88 })}
  <div style="flex: 1; display: flex; min-height: 0">
    ${leftPanelB({ banner: `${I.loader}<span><strong>Checking fit for Pixellot.</strong> Your CV stays put while the score comes in.</span>` })}
    <div style="width: 430px; flex-shrink: 0; display: flex; flex-direction: column; background: #FEFDFB">
      ${rightHeaderB()}
      <div style="flex: 1; display: flex; flex-direction: column; gap: 18px; padding: 4px 20px">
        ${userMsg(jobCard)}
        <div style="display: flex; flex-direction: column; gap: 12px">
          <div style="display: flex; align-items: center; gap: 10px">${assistantAvatar}<span style="font-size: 14px; font-weight: 600; color: #182F4D">Useful Apply</span><div style="flex: 1"></div><span style="font-size: 12px; font-weight: 600; color: #A37824">70%</span></div>
          ${stages([
            ['Reading the job ad', 'done', 'Role, must-haves, nice-to-haves'],
            ['Matching your skills', 'done', '14 of 18 requirements covered'],
            ['Scoring the fit', 'active', 'Strengths, gaps and a recommendation'],
          ])}
        </div>
      </div>
      ${composer('Paste a job description or ask me anything', true)}
    </div>
  </div>`);

// ---------------------------------------------------------------------------
// OPTION C: the guided line. One column, a stepper, one card, one button.
// Feed and Tracker hidden until the first kit exists.
// ---------------------------------------------------------------------------
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

const C_decision = frame(`
  ${header({ tabs: false, upgrade: false, panelToggle: false })}
  <div style="flex: 1; display: flex; flex-direction: column; align-items: center; padding-top: 56px; gap: 36px">
    ${stepper(1)}
    <div class="card" style="width: 720px; padding: 32px; display: flex; flex-direction: column; gap: 22px; background: #FFFFFF">
      <div style="display: flex; flex-direction: column; gap: 6px"><span class="serif" style="font-size: 24px; color: #182F4D">Which job are you applying for?</span></div>
      <div style="border: 2px solid #E0C687; border-radius: 16px; background: #FFFFFF; padding: 14px 16px; height: 200px; overflow: hidden; font-size: 14px; line-height: 1.5; color: #2D3748; box-shadow: 0 0 0 4px rgb(212 168 83 / 0.12)"><strong>Product Manager, B2B Platform</strong><br>Pixellot · Remote, US<br><br>${jobText}</div>
      <div style="display: flex; align-items: center; gap: 16px">
        <span class="btn-gold" style="height: 48px; padding: 0 22px; font-size: 15px">${I.search}Check my fit <span class="cost">· 0.5 credits</span></span>
        <span style="font-size: 13px; color: #1E3A5F; font-weight: 500">Skip the check, generate the full kit now (2 credits)</span>
      </div>
    </div>
    <div style="width: 720px; display: flex; flex-direction: column; gap: 10px; font-size: 13px">
      <span style="display: inline-flex; align-items: center; gap: 8px; white-space: nowrap"><span style="display: inline-flex; width: 20px; height: 20px; border-radius: 9999px; background: #D4A853; color: #FFFFFF; align-items: center; justify-content: center">${I.check}</span><span><strong>Your CV:</strong> Alex Morgan, Product Manager</span><span style="color: #1E3A5F; font-weight: 500">Change</span></span>
      <span class="muted">You have 4 credits. Check fit first and the kit costs 1.5 instead of 2.</span>
    </div>
  </div>`);

const C_working = frame(`
  ${header({ tabs: false, upgrade: false, panelToggle: false, credits: '3.5 credits', pct: 88 })}
  <div style="flex: 1; display: flex; flex-direction: column; align-items: center; padding-top: 56px; gap: 36px">
    ${stepper(2)}
    <div class="card" style="width: 720px; padding: 32px; display: flex; flex-direction: column; gap: 22px; background: #FFFFFF">
      <div style="display: flex; align-items: center; gap: 12px"><span class="serif" style="font-size: 24px; color: #182F4D">Checking your fit for Pixellot</span><div style="flex: 1"></div><span class="muted" style="font-size: 13px">About 10 seconds left</span></div>
      ${stages([
        ['Reading the job ad', 'done', 'Role, must-haves, nice-to-haves'],
        ['Matching your skills', 'done', '14 of 18 requirements covered'],
        ['Scoring the fit', 'active', 'Strengths, gaps and a recommendation'],
      ])}
      ${progress(70)}
      <div class="line"></div>
      <span class="muted" style="font-size: 13px">Next you'll see your match score, what's strong, what's missing, and whether the full kit is worth 1.5 credits.</span>
    </div>
  </div>`);

const out = {
  'Main.dc.html': A_decision,
  'A-Spine-Working.dc.html': A_working,
  'B-Room-Decision.dc.html': B_decision,
  'B-Room-Working.dc.html': B_working,
  'C-Line-Decision.dc.html': C_decision,
  'C-Line-Working.dc.html': C_working,
};
for (const [name, body] of Object.entries(out)) writeFileSync(name, wrap(body));
console.log('wrote', Object.keys(out).join(', '));
