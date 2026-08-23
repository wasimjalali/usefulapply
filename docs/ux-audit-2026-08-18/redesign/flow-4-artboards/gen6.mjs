// Flow 4: the Tracker in the chat spine. Run: node gen6.mjs
import { writeFileSync } from 'node:fs';
import { I, wrap, frame } from '../flow-1-artboards/lib.mjs';
import { sidebar, convoHeader, assistant, userMsg, composer } from '../flow-1-artboards/final/spine.mjs';
import { EXTRA, spine3, chipRow } from '../flow-3-artboards/gen4.mjs';

const APPS = [['Avetta', 'Product Manager, B2B SaaS', 'now', 'Interview'], ['Pixellot', 'Product Manager, B2B Platform', 'draft', 'Kit ready'], ['TeamSnap', 'Senior Product Manager', 'applied', 'Applied']];
const side = (o = {}) => sidebar({ apps: APPS, active: -1, plan: 'Plus plan', credits: '40 of 50 credits', pct: 80, feedCount: 20, ...o });

const ROWS = [
  ['Avetta', 'Product Manager, B2B SaaS', '19 Aug 2026', 88, 'Interview', 'Thu 21 Aug, 14:00'],
  ['Pixellot', 'Product Manager, B2B Platform', '18 Aug 2026', 78, 'Drafted', 'Send it'],
  ['Zapier', 'Senior Product Manager, Integrations', '18 Aug 2026', 84, 'Applied', 'Follow up by 27 Aug'],
  ['Frontline Education', 'Group Product Manager', '23 Jul 2026', 72, 'Follow-up sent', 'Waiting'],
  ['Ellucian', 'Senior Product Manager II', '22 Jun 2026', 68, 'Applied', 'Follow up overdue'],
  ['Affinity', 'Senior Product Manager, CRM', '24 May 2026', 82, 'Rejected', ''],
  ['InRule', 'Product Manager, AI and Data', '24 May 2026', 72, 'Applied', 'Follow up overdue'],
  ['TeamSnap', 'Senior Product Manager', '12 Aug 2026', 76, 'Applied', 'Follow up by 21 Aug'],
];
const STATUS = {
  'Drafted': ['#F5ECD5', '#825E1C'], 'Applied': ['#E8EDF4', '#182F4D'], 'Follow-up sent': ['#E8EDF4', '#182F4D'],
  'Interview': ['#EEF4F1', '#3A5A4C'], 'Offer': ['#EEF4F1', '#3A5A4C'], 'Rejected': ['#F5F0E8', '#6B7280'],
};
const statusPill = (s, { open = false } = {}) => `<span style="display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border-radius: 9999px; background: ${STATUS[s][0]}; color: ${STATUS[s][1]}; font-size: 12px; font-weight: 600; white-space: nowrap; ${open ? 'box-shadow: 0 0 0 2px #EBDAAE' : ''}">${s}${I.chev}</span>`;
const nextCell = (n) => !n ? '<span class="muted" style="font-size: 12.5px">–</span>' : n.includes('overdue') ? `<span style="font-size: 12.5px; font-weight: 600; color: #A37824">${n}</span>` : n === 'Send it' ? `<span style="font-size: 12.5px; font-weight: 600; color: #1E3A5F">${n} ${I.arrow}</span>` : `<span style="font-size: 12.5px; color: #2D3748">${n}</span>`;

const datePicker = () => `<div style="display: flex; flex-direction: column; gap: 8px; padding: 6px 6px 4px 6px">
  <div style="display: flex; align-items: center; gap: 8px"><span style="display: inline-block; width: 8px; height: 8px; border-radius: 9999px; background: #3A5A4C"></span><span style="font-size: 13px; font-weight: 600; color: #182F4D">Interview</span><span class="muted" style="font-size: 12px">· when?</span></div>
  <div style="display: flex; gap: 6px; flex-wrap: wrap">${['Tomorrow', 'Thu 21', 'Fri 22', 'Pick a date'].map((t, i) => `<span style="display: inline-flex; align-items: center; height: 28px; padding: 0 10px; border-radius: 9999px; font-size: 12px; font-weight: 600; ${i === 1 ? 'background: #D4A853; color: #FFFFFF' : 'background: #FEFDFB; color: #182F4D; border: 1px solid #F5F0E8'}">${t}</span>`).join('')}</div>
  <div style="display: flex; gap: 6px; align-items: center"><div style="height: 32px; flex: 1; border: 1px solid #F5F0E8; border-radius: 8px; background: #FFFFFF; padding: 0 10px; display: flex; align-items: center; font-size: 13px; color: #2D3748">14:00</div><span class="btn-gold" style="height: 32px; padding: 0 14px; font-size: 12.5px">Save</span></div>
  <span class="muted" style="font-size: 11.5px">I'll remind you the day before. Skip the date and it just says Interview.</span>
</div>`;

function countPills(active = 'All') {
  const counts = [['All', 8], ['Drafted', 1], ['Applied', 4], ['Follow-up sent', 1], ['Interview', 1], ['Offer', 0], ['Rejected', 1]];
  return `<div style="display: flex; gap: 6px; flex-wrap: wrap">${counts.map(([l, n]) => `<span style="display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border-radius: 9999px; font-size: 13px; font-weight: ${l === active ? 600 : 500}; ${l === active ? 'background: #FFFFFF; color: #182F4D; border: 1px solid #F5F0E8; box-shadow: 0 1px 2px 0 rgb(30 58 95 / 0.06)' : 'color: #6B7280; border: 1px solid transparent'}">${l}<span style="font-size: 11px; font-weight: 700; color: ${l === active ? '#A37824' : '#6B7280'}">${n}</span></span>`).join('')}</div>`;
}

function table(rows, { openRow = -1, selectedRow = -1, wide = false, datePick = false } = {}) {
  const cols = wide ? '1.6fr 130px 70px 150px 170px' : '1.5fr 56px 140px 150px';
  const head = `<div style="display: grid; grid-template-columns: ${cols}; gap: 12px; padding: 8px 16px; font-size: 11px; font-weight: 600; letter-spacing: 0.08em; color: #6B7280"><span>APPLICATION</span>${wide ? '<span>SAVED</span>' : ''}<span>MATCH</span><span>STATUS</span><span>NEXT</span></div>`;
  const body = rows.map(([co, role, date, match, st, next], i) => `<div style="display: grid; grid-template-columns: ${cols}; gap: 12px; align-items: center; padding: 12px 16px; border-top: 1px solid #F5F0E8; ${i === selectedRow ? 'background: #FBF7EE' : 'background: #FFFFFF'}; position: relative">
    <div style="display: flex; flex-direction: column; gap: 1px; min-width: 0"><span style="font-size: 14px; font-weight: 600; color: #182F4D; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">${co}</span><span class="muted" style="font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">${role}</span></div>
    ${wide ? `<span class="muted" style="font-size: 12.5px; white-space: nowrap">${date}</span>` : ''}
    <span style="font-size: 13px; font-weight: 600; color: ${match >= 80 ? '#3A5A4C' : '#A37824'}">${match}%</span>
    <div>${statusPill(st, { open: i === openRow })}${i === openRow ? `<div style="position: absolute; left: 0; top: 44px; margin-left: ${wide ? '53%' : '47%'}; z-index: 5; background: #FFFFFF; border: 1px solid #F5F0E8; border-radius: 12px; box-shadow: 0 1px 0 0 rgb(30 58 95 / 0.05), 0 22px 46px -20px rgb(30 58 95 / 0.22); padding: 6px; display: flex; flex-direction: column; gap: 2px; width: ${datePick ? '236px' : '170px'}">${datePick ? datePicker() : Object.keys(STATUS).map((s) => `<div style="display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px; font-size: 13px; font-weight: 500; color: #2D3748; ${s === st ? 'background: #FBF7EE' : ''}"><span style="display: inline-block; width: 8px; height: 8px; border-radius: 9999px; background: ${STATUS[s][1]}"></span>${s}${s === st ? `<span style="margin-left: auto; color: #A37824">${I.check}</span>` : ''}</div>`).join('')}</div>` : ''}</div>
    ${nextCell(next)}
  </div>`).join('');
  return `<div class="card" style="background: #FFFFFF; overflow: hidden">${head}${body}</div>`;
}

const trackerHeader = (wide = false) => `<div style="display: flex; flex-direction: column; gap: 12px; padding: 16px 20px 12px 20px; border-bottom: 1px solid #F5F0E8">
  <div style="display: flex; align-items: center; gap: 12px"><div style="display: flex; flex-direction: column; gap: 2px; flex: 1"><span class="serif" style="font-size: 20px; color: #182F4D">Tracker</span><span class="muted" style="font-size: 12.5px">8 applications · 3 follow-ups due this week</span></div><div style="display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 12px; border-radius: 9999px; border: 1px solid #F5F0E8; background: #FEFDFB; width: ${wide ? '260px' : '200px'}; color: #6B7280; font-size: 13px">${I.search}Company or role</div></div>
  ${countPills('All')}
</div>`;
const canvasShell = (inner) => `<div style="flex: 1; display: flex; flex-direction: column; min-width: 0; background: #FAF7F2">${inner}</div>`;
const tableArea = (inner) => `<div style="flex: 1; overflow: hidden; padding: 16px 20px 0 20px">${inner}</div>`;

// Tracker conversation (variant A)
const trackerConvo = (tail) => `${convoHeader('Tracker', '8 applications')}
  <div style="flex: 1; display: flex; flex-direction: column; gap: 22px; padding: 22px 20px; overflow: hidden">${tail}</div>
  ${composer('"Avetta moved to interview", "what\'s due this week?"')}`;
const trackerAnnounce = assistant(`<span>Here's where things stand. <strong>One interview</strong> (Avetta, Thursday 14:00), <strong>two follow-ups overdue</strong> (Ellucian, InRule) and Pixellot's kit is ready but not sent.</span>
  <div style="display: flex; flex-wrap: wrap; gap: 8px"><span class="chip secondary" style="height: 36px; padding: 0 14px; font-size: 13px">Draft the Ellucian follow-up</span><span class="chip secondary" style="height: 36px; padding: 0 14px; font-size: 13px">Prep me for Avetta</span><span class="chip secondary" style="height: 36px; padding: 0 14px; font-size: 13px">Hide rejected</span></div>`);

// T1. Variant A: table in canvas + tracker conversation
const T1 = spine3(side(), trackerConvo(trackerAnnounce), canvasShell(`${trackerHeader()}${tableArea(table(ROWS))}`));

// T2. Variant B: table full width, conversation collapsed to a rail
const T2 = frame(`
  <div style="flex: 1; display: flex; min-height: 0">
    ${side()}
    <div style="width: 56px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 14px 0; border-right: 1px solid #F5F0E8; background: #FEFDFB"><span class="muted" style="display: inline-flex; width: 36px; height: 36px; border-radius: 9999px; align-items: center; justify-content: center; border: 1px solid #F5F0E8; background: #FFFFFF">${I.send}</span></div>
    ${canvasShell(`${trackerHeader(true)}${tableArea(table(ROWS, { wide: true }))}`)}
  </div>`);

// T3. Status change: inline dropdown on a row, and the same change by chat
const ROWS3 = ROWS.map((r) => r[0] === 'Zapier' ? ['Zapier', 'Senior Product Manager, Integrations', '18 Aug 2026', 84, 'Interview', 'Tue 26 Aug, 10:00'] : r);
const T3 = spine3(side(), trackerConvo(`${trackerAnnounce}${userMsg('Zapier moved to interview, Tuesday 26th at 10')}${assistant(`<span>Done. Zapier is <strong>Interview</strong>, Tuesday 26 Aug, 10:00. I'll remind you the day before. Want a prep note for it?</span><div style="display: flex; gap: 8px"><span class="chip primary" style="height: 36px; padding: 0 14px; font-size: 13px">${EXTRA.star}Prep me for Zapier</span></div>`)}`),
  canvasShell(`${trackerHeader()}${tableArea(table(ROWS3, { openRow: 4, selectedRow: 2 }))}`));

// T4. Picking Interview asks when, in the same popover. NEXT stays editable afterwards.
const ROWS4 = ROWS.map((r) => r[0] === 'Ellucian' ? ['Ellucian', 'Senior Product Manager II', '22 Jun 2026', 68, 'Interview', 'Thu 21 Aug, 14:00'] : r);
const T4 = spine3(side(), trackerConvo(`${trackerAnnounce}${assistant('<span style="font-size: 13px; color: #6B7280">Tip: you can also just tell me. "Ellucian interview Thursday at 2" does the same thing.</span>')}`),
  canvasShell(`${trackerHeader()}${tableArea(table(ROWS4, { openRow: 4, selectedRow: 4, datePick: true }))}`));

const out = { 'Main.dc.html': T1, 'T2-Full-Width.dc.html': T2, 'T3-Status-Change.dc.html': T3, 'T4-Interview-When.dc.html': T4 };
for (const [name, body] of Object.entries(out)) writeFileSync(name, wrap(body));
console.log('wrote', Object.keys(out).join(', '));
