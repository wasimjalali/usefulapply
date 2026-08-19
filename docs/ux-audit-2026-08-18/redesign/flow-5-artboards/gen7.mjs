// Flow 5: the settings modal (General, Usage & Billing, Notifications). Run: node gen7.mjs
import { writeFileSync } from 'node:fs';
import { I, wrap, frame } from '../flow-1-artboards/lib.mjs';
import { EXTRA, sidebar, convoHeader, assistant, composer, canvasKit } from '../flow-1-artboards/final/spine.mjs';
import { settingsModal } from '../flow-1-artboards/final/settings.mjs';

const APPS = [['Pixellot', 'Product Manager, B2B Platform', 'now', 'Kit ready'], ['TeamSnap', 'Senior Product Manager', 'applied', 'Applied']];
const convo = `${convoHeader('Pixellot, Product Manager', 'Kit ready')}
  <div style="flex: 1; display: flex; flex-direction: column; gap: 22px; padding: 22px 20px; overflow: hidden">
    ${assistant(`<span>Your kit for Pixellot is ready. Tailored CV (ATS 78%), a cover letter that opens with your 40% engagement result, and two emails. Nothing was invented.</span><div style="display: flex; flex-direction: column; gap: 10px; align-items: flex-start"><span class="chip primary">${I.download}Download the kit</span><span class="chip secondary">${EXTRA.star}Answer screening questions</span></div>`)}
  </div>
  ${composer()}`;

const withModal = (side, modal) => frame(`
  <div style="position: relative; flex: 1; display: flex; min-height: 0">
    ${side}
    <div style="width: 520px; flex-shrink: 0; display: flex; flex-direction: column; border-right: 1px solid #F5F0E8; background: #FEFDFB">${convo}</div>
    ${canvasKit()}
    ${modal}
  </div>`);

const sidePlus = sidebar({ apps: APPS, active: 0, plan: 'Plus plan', credits: '41 of 50 credits', pct: 82, feedCount: 20 });
const sideFree = sidebar({ apps: APPS, active: 0, plan: 'Free plan', credits: '2.5 of 4 credits', pct: 62, feedCount: 5 });

const out = {
  'Main.dc.html': withModal(sidePlus, settingsModal({ tab: 'general' })),
  'M2-Usage-Billing.dc.html': withModal(sidePlus, settingsModal({ tab: 'usage', plan: 'plus' })),
  'M3-Notifications.dc.html': withModal(sidePlus, settingsModal({ tab: 'notifications' })),
  'M4-Usage-Billing-Free.dc.html': withModal(sideFree, settingsModal({ tab: 'usage', plan: 'free' })),
};
for (const [name, body] of Object.entries(out)) writeFileSync(name, wrap(body));
console.log('wrote', Object.keys(out).join(', '));
