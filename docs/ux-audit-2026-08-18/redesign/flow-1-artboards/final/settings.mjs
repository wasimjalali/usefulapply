// The settings modal (shell component, locked in flow 5). Gear in the sidebar
// opens it over whatever is on screen. Left nav: General, Usage & Billing,
// Notifications. One pane at a time.
import { I } from '../lib.mjs';

const ICON = {
  gear: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"></path></svg>',
  bars: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"></path><path d="M8 17V9M13 17V5M18 17v-7"></path></svg>',
  bell: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"></path></svg>',
  x: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"></path></svg>',
  copy: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
  ext: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><path d="M15 3h6v6M10 14 21 3"></path></svg>',
};

const caption = (t) => `<span style="font-size: 12px; font-weight: 600; letter-spacing: 0.06em; color: #6B7280; padding: 0 2px">${t}</span>`;
const group = (rows) => `<div style="display: flex; flex-direction: column; background: #FEFDFB; border: 1px solid #F5F0E8; border-radius: 16px; overflow: hidden">${rows.map((r, i) => `<div style="${i ? 'border-top: 1px solid #F5F0E8;' : ''}">${r}</div>`).join('')}</div>`;
const row = (label, right, sub = '') => `<div style="display: flex; align-items: center; gap: 16px; padding: 14px 16px"><div style="display: flex; flex-direction: column; gap: 3px; flex: 1; min-width: 0"><span style="font-size: 14px; color: #2D3748">${label}</span>${sub ? `<span class="muted" style="font-size: 12.5px; line-height: 1.45">${sub}</span>` : ''}</div>${right}</div>`;
const select = (v) => `<span style="display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 12px; border-radius: 10px; border: 1px solid #F5F0E8; background: #FFFFFF; font-size: 13px; font-weight: 500; color: #2D3748; white-space: nowrap">${v}${I.chev}</span>`;
const value = (v) => `<span style="font-size: 13.5px; color: #2D3748; white-space: nowrap">${v}</span>`;
const link = (t) => `<span style="font-size: 13px; font-weight: 600; color: #1E3A5F; white-space: nowrap">${t}</span>`;
const ghost = (t) => `<span class="btn-ghost" style="height: 36px; padding: 0 14px; font-size: 13px">${t}</span>`;
const toggle = (on) => `<span style="display: inline-flex; width: 40px; height: 24px; border-radius: 9999px; background: ${on ? '#D4A853' : '#DED4C3'}; padding: 2px; box-sizing: border-box; justify-content: ${on ? 'flex-end' : 'flex-start'}; flex-shrink: 0"><span style="display: block; width: 20px; height: 20px; border-radius: 9999px; background: #FFFFFF; box-shadow: 0 1px 2px 0 rgb(30 58 95 / 0.2)"></span></span>`;
const section = (cap, inner) => `<div style="display: flex; flex-direction: column; gap: 8px">${caption(cap)}${inner}</div>`;

function paneGeneral() {
  return `${section('ACCOUNT', group([`<div style="display: flex; align-items: center; gap: 14px; padding: 14px 16px"><span style="display: inline-flex; width: 44px; height: 44px; border-radius: 9999px; background: #1E3A5F; color: #FFFFFF; font-size: 15px; font-weight: 700; align-items: center; justify-content: center; flex-shrink: 0">AM</span><div style="display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0"><span style="font-size: 14px; font-weight: 600; color: #182F4D">Alex Morgan</span><span class="muted" style="font-size: 13px; display: inline-flex; align-items: center; gap: 6px">alex.morgan@email.com ${ICON.copy}</span></div>${ghost('Sign out')}</div>`]))}
  ${section('PROFILE', group([row('Name', value('Alex Morgan')), row('Phone', value('(415) 555-0182')), row('Location', value('San Francisco, US')), row('Photo', link('Change'))]))}
  ${section('SIGN-IN AND SECURITY', group([row('Password', link('Change'), 'Last changed 3 months ago'), row('Two-factor authentication', toggle(false)), row('Signed in with', value('Google · alex.morgan@gmail.com'))]))}
  ${section('PREFERENCES', group([row('Timezone', select('Auto-detect (Europe/Berlin)')), row('Date format', select('19 Aug 2026'))]))}
  ${section('ACCOUNT DATA', group([row('Delete account', link('Delete'), 'Removes your CV, applications and feed. This can\'t be undone.')]))}`;
}

function paneUsage({ plan = 'plus' } = {}) {
  const isPlus = plan === 'plus';
  const used = isPlus ? 9 : 1.5, total = isPlus ? 50 : 4, left = total - used;
  const pct = Math.round((used / total) * 100);
  const planCard = (name, price, credits, line, { current = false, cta = null, highlight = false } = {}) => `<div style="flex: 1; display: flex; flex-direction: column; gap: 8px; padding: 14px; border-radius: 12px; background: ${highlight ? '#FBF7EE' : '#FFFFFF'}; border: 1px solid ${highlight ? '#EBDAAE' : '#F5F0E8'}">
    <div style="display: flex; align-items: center; gap: 8px"><span style="font-size: 14px; font-weight: 600; color: #182F4D">${name}</span>${current ? '<span class="status now" style="height: 18px; font-size: 10px">Current</span>' : ''}</div>
    <div style="display: flex; align-items: baseline; gap: 4px"><span class="serif" style="font-size: 20px; color: #182F4D">${price}</span>${price !== 'Free' ? '<span class="muted" style="font-size: 11px">/month</span>' : ''}</div>
    <span style="font-size: 12.5px; font-weight: 600; color: #A37824">${credits}</span>
    <span class="muted" style="font-size: 12px; line-height: 1.45">${line}</span>
    <div style="flex: 1"></div>
    ${cta ? `<span class="${cta[1] === 'gold' ? 'btn-gold' : 'btn-ghost'}" style="height: 34px; font-size: 12.5px">${cta[0]}</span>` : '<span style="height: 34px"></span>'}
  </div>`;
  return `${section('USAGE', group([`<div style="display: flex; flex-direction: column; gap: 10px; padding: 14px 16px">
      <div style="display: flex; align-items: center; justify-content: space-between"><span style="font-size: 14px; color: #2D3748"><strong>${left} of ${total} credits</strong> left this month</span><span class="muted" style="font-size: 12.5px">Resets 1 September</span></div>
      <span style="display: block; height: 6px; border-radius: 9999px; background: #F5F0E8"><span style="display: block; width: ${pct}%; height: 6px; border-radius: 9999px; background: #D4A853"></span></span>
      <span class="muted" style="font-size: 12.5px">${isPlus ? 'Used 9: three fit checks, two kits, one rewrite.' : 'Used 1.5: one fit check, one kit after the check.'} Fit check 0.5 · kit 2 (1.5 after a fit check) · rewrite 0.5.</span>
    </div>`]))}
  ${section('BILLING', group(isPlus
    ? [row('Plus plan', ghost(`Manage billing ${ICON.ext}`), '$19.99 a month · next invoice 1 September · invoices and card in Manage billing'), row('Credit pack', ghost('Add 50 credits · $19.99'), '50 extra credits, they roll over while you\'re subscribed.')]
    : [row('Free plan', value('No card on file'), 'Four credits a month, top-5 daily feed. Upgrade below to get more.')]))}
  ${section('PLANS', `<div style="display: flex; gap: 10px">
    ${planCard('Free', 'Free', '4 credits a month', 'Two applications, top-5 daily feed.', { current: !isPlus })}
    ${planCard('Plus', '$19.99', '50 credits a month', '25 applications, 20 roles a day, Edit feed.', isPlus ? { current: true } : { cta: ['Upgrade to Plus', 'gold'], highlight: true })}
    ${planCard('Max', '$79.99', '200 credits a month', '100 applications, priority generation.', isPlus ? { cta: ['Move to Max', 'gold'], highlight: true } : { cta: ['Go Max', 'ghost'] })}
  </div><span class="muted" style="font-size: 12px; padding: 0 2px">Card via Stripe, cancel any time. Credits stay until the period ends.</span>`)}`;
}

function paneNotifications() {
  return `${section('EMAIL ME WHEN', group([row('Today\'s feed is ready', toggle(true)), row('A follow-up is due', toggle(true)), row('An interview is tomorrow', toggle(true)), row('Credits are about to run out', toggle(false)), row('Product news, once a month at most', toggle(false))]))}
  ${section('SEND TO', group([row('alex.morgan@email.com', link('Change in General'))]))}`;
}

export function settingsModal({ tab = 'general', plan = 'plus' } = {}) {
  const items = [['general', ICON.gear, 'General'], ['usage', ICON.bars, 'Usage & Billing'], ['notifications', ICON.bell, 'Notifications']];
  const title = { general: 'General', usage: 'Usage & Billing', notifications: 'Notifications' }[tab];
  const pane = tab === 'general' ? paneGeneral() : tab === 'usage' ? paneUsage({ plan }) : paneNotifications();
  return `<div style="position: absolute; inset: 0; background: rgb(12 25 41 / 0.38); display: flex; align-items: center; justify-content: center; z-index: 20">
    <div style="width: 980px; height: 660px; display: flex; background: #FFFFFF; border-radius: 24px; box-shadow: 0 1px 0 0 rgb(30 58 95 / 0.06), 0 32px 60px -24px rgb(30 58 95 / 0.28); overflow: hidden; position: relative">
      <div style="width: 220px; flex-shrink: 0; background: #FAF7F2; border-right: 1px solid #F5F0E8; padding: 20px 12px; display: flex; flex-direction: column; gap: 4px">
        ${items.map(([k, ic, l]) => `<div style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px; font-size: 14px; font-weight: ${k === tab ? 600 : 500}; color: ${k === tab ? '#182F4D' : '#2D3748'}; ${k === tab ? 'background: #FFFFFF; box-shadow: 0 1px 2px 0 rgb(30 58 95 / 0.06); border: 1px solid #F5F0E8' : 'border: 1px solid transparent'}"><span style="color: ${k === tab ? '#C4932E' : '#6B7280'}">${ic}</span>${l}</div>`).join('')}
      </div>
      <div style="flex: 1; display: flex; flex-direction: column; min-width: 0">
        <div style="display: flex; align-items: center; padding: 22px 28px 6px 28px"><span class="serif" style="font-size: 20px; color: #182F4D">${title}</span></div>
        <div style="flex: 1; overflow: hidden; display: flex; flex-direction: column; gap: 18px; padding: 10px 28px 24px 28px">${pane}</div>
      </div>
      <span class="muted" style="position: absolute; top: 16px; right: 16px; display: inline-flex; width: 34px; height: 34px; border-radius: 9999px; align-items: center; justify-content: center">${ICON.x}</span>
    </div>
  </div>`;
}
