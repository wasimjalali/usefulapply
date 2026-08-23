// Shared spine partials (sidebar, conversation, canvas) for every flow.
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
// The chat spine (dashboard after the first kit)
// ---------------------------------------------------------------------------
function sidebar({ active = 0, apps, menuOpen = false, credits = '2.5 of 4 credits', pct = 62, plan = 'Free plan', feedActive = false, feedCount = 5 }) {
  const menu = menuOpen ? `
    <div style="position: absolute; left: 12px; right: 12px; bottom: 64px; background: #FFFFFF; border: 1px solid #F5F0E8; border-radius: 16px; box-shadow: 0 1px 0 0 rgb(30 58 95 / 0.05), 0 22px 46px -20px rgb(30 58 95 / 0.22); padding: 8px; display: flex; flex-direction: column; gap: 4px; z-index: 5">
      <div style="display: flex; flex-direction: column; gap: 10px; padding: 12px 12px 14px 12px; border-radius: 12px; background: #FBF7EE">
        <div style="display: flex; align-items: center; justify-content: space-between"><span style="font-size: 13px; font-weight: 600; color: #182F4D">${plan}</span><span style="font-size: 13px; font-weight: 600; color: #A37824">${credits}</span></div>
        <span style="display: block; height: 4px; border-radius: 9999px; background: #F5ECD5"><span style="display: block; width: ${pct}%; height: 4px; border-radius: 9999px; background: #D4A853"></span></span>
        <span class="btn-gold" style="height: 40px; font-size: 13px">Upgrade to Plus ${I.arrow}</span>
      </div>
      ${[[I.user, 'Profile & account'], [EXTRA.card, 'Plan & billing'], [EXTRA.bell, 'Notifications']].map(([ic, l]) => `<div style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px; font-size: 14px; font-weight: 500; color: #2D3748"><span class="muted">${ic}</span>${l}</div>`).join('')}
      <div class="line" style="margin: 4px 8px"></div>
      <div style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px; font-size: 14px; font-weight: 500; color: #2D3748"><span class="muted">${EXTRA.out}</span>Sign out</div>
    </div>` : '';
  return `<div style="position: relative; width: 248px; flex-shrink: 0; display: flex; flex-direction: column; gap: 16px; padding: 16px 12px 12px 12px; border-right: 1px solid #F5F0E8; background: #FAF7F2">
    <div style="padding: 2px 6px 4px 6px">${wordmark}</div>
    <span class="btn-ghost" style="height: 44px; font-size: 14px">${I.plus}New application</span>
    <div class="card" style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; ${feedActive ? 'background: #FFFFFF; border-color: #EBDAAE' : ''}">
      <span style="display: inline-flex; width: 30px; height: 30px; border-radius: 9999px; background: #F5ECD5; color: #A37824; align-items: center; justify-content: center">${I.briefcase}</span>
      <div style="display: flex; flex-direction: column; gap: 2px; flex: 1"><span style="font-size: 13px; font-weight: 600">Today's feed</span><span class="muted" style="font-size: 12px">${feedCount} new roles for you</span></div>
      <span style="display: inline-flex; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 9999px; background: #C4932E; color: #FFFFFF; font-size: 10px; font-weight: 700; align-items: center; justify-content: center">${feedCount}</span>
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
      <div style="display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0"><span style="font-size: 13px; font-weight: 600; color: #182F4D; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">Alex Morgan</span><span class="muted" style="font-size: 11px">${plan}</span></div>
      <span style="display: inline-flex; width: 36px; height: 36px; border-radius: 9999px; align-items: center; justify-content: center; ${menuOpen ? 'background: #FFFFFF; color: #182F4D; box-shadow: 0 1px 2px 0 rgb(30 58 95 / 0.06); border: 1px solid #F5F0E8' : 'color: #6B7280'}">${EXTRA.gear}</span>
    </div>
    ${menu}
  </div>`;
}

function convoHeader(title, sub) {
  return `<div style="display: flex; align-items: center; gap: 12px; padding: 14px 20px; border-bottom: 1px solid #F5F0E8">
    <div style="display: flex; flex-direction: column; gap: 2px; flex: 1"><span class="serif" style="font-size: 16px; color: #182F4D">${title}</span><span class="muted" style="font-size: 12px">${sub}</span></div>
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


export { assistantAvatar, EXTRA, sidebar, convoHeader, assistant, userMsg, composer, canvasKit, canvasBase, APPS_READY, APPS_LATER, spineFrame };
