import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { SEO_SITE_URL } from '@/lib/seo/site-url';
import { BRAND } from '@/lib/brand';
import { isMcpEnabled } from '@/lib/mcp/config';

// Hidden until MCP launches. Read the flag per request, not at build.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Use Useful Apply from Claude, ChatGPT and other AI assistants',
  description:
    'Connect Useful Apply to Claude, ChatGPT, Claude Code, Cursor or any MCP client. See what your assistant can do, what it costs and how to revoke access.',
  canonical: '/integrations',
});

const MCP_URL = `${BRAND.url}/mcp`;

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: SEO_SITE_URL },
    { '@type': 'ListItem', position: 2, name: 'Integrations', item: `${SEO_SITE_URL}/integrations` },
  ],
};

const cursorConfig = `{
  "mcpServers": {
    "usefulapply": {
      "url": "${MCP_URL}"
    }
  }
}`;

const toolGroups: { title: string; body: string; tools: string }[] = [
  {
    title: 'Read your account',
    body: 'Check your plan, credits and daily agent credit limit. Get a morning briefing of what needs your attention.',
    tools: 'get_account, get_credit_history, morning_briefing',
  },
  {
    title: 'Read applications and CVs',
    body: 'Open your applications and check on any that are still being written. Read your CVs, browse the six templates and get a plain explanation of your fit.',
    tools: 'list_applications, get_application, get_operation, get_cv, get_cv_outline, list_cv_templates, explain_fit',
  },
  {
    title: 'Read your job feed',
    body: 'Browse your feed, feed settings and career profile.',
    tools: 'get_job_feed, get_feed_settings, get_career_profile',
  },
  {
    title: 'Manage applications',
    body: 'Create, update and delete applications. Move them through your tracker, set interview and follow-up dates and stop a generation in progress.',
    tools: 'create_application, update_application, update_application_status, delete_application, cancel_generation',
  },
  {
    title: 'Manage your CV and profile',
    body: 'Upload or remove a CV. Edit, add, hide, reorder or delete items, and undo your last edit. Pick a template and update your contact details and photo.',
    tools:
      'save_cv, delete_cv, update_profile, set_profile_photo, remove_profile_photo, update_cv_content, add_cv_item, set_cv_item_visibility, edit_cv_structure, delete_cv_item, undo_last_edit, set_cv_template',
  },
  {
    title: 'Edit documents and export',
    body: 'Edit a cover letter, email or follow-up directly. Export PDF, Word or text files. Each one comes with a download link.',
    tools: 'edit_document_text, export_documents',
  },
  {
    title: 'Run your job feed',
    body: 'Run today’s feed, change its settings and save or dismiss jobs. You can also turn off the feed and withdraw your consent.',
    tools: 'run_job_feed, update_feed_settings, give_job_feedback, withdraw_feed_consent',
  },
  {
    title: 'Update your settings',
    body: 'Choose which emails you get: product news, feed ready, follow-up due, interview tomorrow and low credits.',
    tools: 'update_notification_settings',
  },
];

const spendTools: { name: string; what: string; cost: string }[] = [
  { name: 'analyze_job_fit', what: 'Fit analysis for a job', cost: '0.5' },
  { name: 'generate_application_kit', what: 'CV, cover letter, email and follow-up', cost: '1.5 after a fit check, otherwise 2' },
  { name: 'regenerate_document', what: 'Rewrite a cover letter, email or follow-up', cost: '0.5' },
  { name: 'rewrite_cv_section', what: 'Rewrite one CV section', cost: '0.5, or free if it declines' },
  { name: 'apply_to_feed_job', what: 'Check your fit for a feed job or write the application', cost: '0.5 for a fit check, 2 for the application' },
  { name: 'draft_screening_answers', what: 'Answer screening questions (Plus and Max)', cost: 'Free on Plus and Max. 5 requests per application, up to 7 questions each. Needs Spend access.' },
];

const scopes: { name: string; body: string }[] = [
  { name: 'Read', body: 'See your account, CVs, applications, kit documents, job feed and credits.' },
  { name: 'Write', body: 'Create and change applications, CVs and settings, and export files. None of this spends credits.' },
  { name: 'Spend', body: 'Use your credits to check your fit and write applications. Any tool that costs credits needs this, and so do screening answers, which allow 5 requests per application.' },
];

const h2 = 'text-[28px] md:text-[34px] font-semibold text-navy-600 leading-[1.1] mb-4';
const p = 'text-warm-gray leading-relaxed';
const card = 'bg-cream-50 rounded-2xl p-6 border border-cream-200 shadow-sm';
const code = 'font-mono text-sm bg-cream-100 border border-cream-200 rounded-lg px-1.5 py-0.5 text-charcoal whitespace-nowrap';
const pre =
  'font-mono text-sm bg-navy-800 text-cream-100 rounded-xl p-4 whitespace-pre overflow-x-auto leading-relaxed';
// Shell commands wrap instead of scrolling, so the whole command is visible in a half-width card.
const commandPre = pre.replace('whitespace-pre overflow-x-auto', 'whitespace-pre-wrap wrap-anywhere');

export default function IntegrationsPage() {
  if (!isMcpEnabled()) notFound();
  return (
    <div className="min-h-screen bg-cream-100">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <Navbar />
      <main>
        <section className="pt-20 pb-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <p className="text-xs font-semibold text-gold-700 uppercase tracking-[0.12em] mb-4">
              Integrations
            </p>
            <h1 className="font-semibold text-navy-600 text-[40px] sm:text-[48px] leading-[1.05] tracking-tight mb-6">
              Use Useful Apply from your AI assistant.
            </h1>
            <p className="text-xl text-warm-gray max-w-2xl leading-relaxed">
              Connect Claude, ChatGPT, Claude Code, Cursor or another MCP app. Your assistant can
              check your fit, write your application and update your tracker. You choose what it
              can do, and you review everything before it goes anywhere.
            </p>
          </div>
        </section>

        <section className="py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className={h2}>Connect</h2>
            <p className={`${p} mb-8`}>
              Your connection link is <code className={code}>{MCP_URL}</code>. You&apos;ll sign in to
              Useful Apply and approve access.
            </p>
            <div className="grid md:grid-cols-2 gap-6">
              <div className={card}>
                <h3 className="text-xl font-semibold text-charcoal mb-3">Claude.ai and Desktop</h3>
                <p className={p}>
                  Open Settings, then Connectors, then Add custom connector. Paste{' '}
                  <code className={code}>{MCP_URL}</code>. Once we&apos;re listed, you can pick
                  Useful Apply from Browse connectors instead.
                </p>
              </div>
              <div className={card}>
                <h3 className="text-xl font-semibold text-charcoal mb-3">ChatGPT</h3>
                <p className={p}>
                  Once we&apos;re listed, find Useful Apply in the ChatGPT app directory. Until then, turn
                  on developer mode and add{' '}
                  <code className={code}>{MCP_URL}</code> as a connector.
                </p>
              </div>
              <div className={card}>
                <h3 className="text-xl font-semibold text-charcoal mb-3">Claude Code</h3>
                <p className={`${p} mb-3`}>Install the plugin. It adds the connector and an apply-to-job skill:</p>
                <pre className={commandPre} tabIndex={0} role="region" aria-label="Claude Code plugin commands">
                  <code>{`/plugin marketplace add wasimjalali/usefulapply-plugin\n/plugin install usefulapply@usefulapply`}</code>
                </pre>
                <p className={`${p} mt-3 mb-3`}>Or add just the connector from your terminal:</p>
                <pre className={commandPre} tabIndex={0} role="region" aria-label="Claude Code command">
                  <code>{`claude mcp add --transport http usefulapply ${MCP_URL}`}</code>
                </pre>
                <p className={`${p} mt-3`}>
                  Then run <code className={code}>/mcp</code> in Claude Code to sign in.
                </p>
              </div>
              <div className={card}>
                <h3 className="text-xl font-semibold text-charcoal mb-3">Cursor</h3>
                <p className={`${p} mb-3`}>
                  Add this to <code className={code}>.cursor/mcp.json</code> in a project, or{' '}
                  <code className={code}>~/.cursor/mcp.json</code> for all projects:
                </p>
                <pre className={pre} tabIndex={0} role="region" aria-label="Cursor mcp.json">
                  <code>{cursorConfig}</code>
                </pre>
              </div>
            </div>
          </div>
        </section>

        <section className="py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className={h2}>What your assistant can do</h2>
            <div className="grid md:grid-cols-2 gap-6 mt-8">
              {toolGroups.map((group) => (
                <div key={group.title} className={card}>
                  <h3 className="text-lg font-semibold text-charcoal mb-2">{group.title}</h3>
                  <p className={`${p} mb-3`}>{group.body}</p>
                  <p className="text-xs text-warm-gray font-mono break-words">{group.tools}</p>
                </div>
              ))}
            </div>

            <h3 className="text-2xl font-semibold text-navy-600 mt-12 mb-2">What costs credits</h3>
            <p className={`${p} mb-4`}>
              These tools cost the same as in the web app. Screening answers are free but need Spend access. Everything else is free.
            </p>
            <div
              className="overflow-x-auto bg-cream-50 rounded-2xl border border-cream-200 shadow-sm"
              tabIndex={0}
              role="region"
              aria-label="Tools that cost credits"
            >
              <table className="w-full text-sm text-left border-collapse">
                <caption className="sr-only">Tools that cost credits and what each one costs</caption>
                <thead>
                  <tr className="border-b border-cream-200 text-charcoal">
                    <th scope="col" className="py-3 px-4 font-semibold">Tool</th>
                    <th scope="col" className="py-3 px-4 font-semibold">What it does</th>
                    <th scope="col" className="py-3 px-4 font-semibold">Credits</th>
                  </tr>
                </thead>
                <tbody className="text-warm-gray">
                  {spendTools.map((tool) => (
                    <tr key={tool.name} className="border-b border-cream-200 last:border-0 align-top">
                      <td className="py-3 px-4 font-mono text-xs text-charcoal">{tool.name}</td>
                      <td className="py-3 px-4">{tool.what}</td>
                      <td className="py-3 px-4">{tool.cost}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className={h2}>Permissions</h2>
            <p className={`${p} mb-8`}>
              When you connect, you choose what your assistant can do.
            </p>
            <div className="grid md:grid-cols-3 gap-6 mb-8">
              {scopes.map((scope) => (
                <div key={scope.name} className={card}>
                  <h3 className="text-lg font-semibold text-charcoal mb-2">{scope.name}</h3>
                  <p className={p}>{scope.body}</p>
                </div>
              ))}
            </div>
            <p className={`${p} mb-4`}>
              Assistants can spend up to 10 credits a day. You can change that daily agent credit
              limit in Settings, under Connected apps.
            </p>
            <p className={p}>
              To revoke access, open Settings, then Connected apps, and remove the app. Access
              stops within a minute. Anything already paid for still finishes, and you&apos;ll find it in the
              web app.
            </p>
          </div>
        </section>

        <section className="py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className={h2}>Safety</h2>
            <p className={`${p} mb-4`}>
              Assistants follow the same rules as the web app. Every skill, metric and claim in your
              CV or cover letter has to come from your own CV. It&apos;s designed not to invent facts
              about you, and you review everything before it goes anywhere.
            </p>
            <p className={`${p} mb-4`}>
              Useful Apply doesn&apos;t send anything to employers. You do, after you&apos;ve read it.
            </p>
            <p className={`${p} mb-4`}>
              Your assistant&apos;s provider receives the CV and job data it reads, under its own
              privacy terms. We treat job-ad text as untrusted data, not as instructions.
            </p>
            <p className={`${p} mb-4`}>
              Tools that overwrite or delete ask you to confirm, if your assistant supports
              confirmation prompts. Dismissing a job, marking it not relevant, deleting and
              withdrawing feed consent can&apos;t be undone. Undo covers only the last 10 saved
              versions of your tailored CV, cover letters and emails, kept for 30 days. It doesn&apos;t
              cover uploading or deleting a CV.
            </p>
            <p className={`${p} mb-4`}>
              Export links are signed and expire after 15 minutes. Daily limits apply: 20 CV
              uploads, 30 screening answer requests and 60 exported files.
            </p>
            <p className={p}>
              We log which tool ran, which app called it, how long it took and whether it worked.
              We never log your content.
            </p>
          </div>
        </section>

        <section className="py-12 pb-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className={h2}>Support</h2>
            <p className={p}>
              Questions or problems? Email{' '}
              <a href={`mailto:${BRAND.supportEmail}`} className="text-navy-600 hover:underline">
                {BRAND.supportEmail}
              </a>{' '}
              or use the{' '}
              <Link href="/contact" className="text-navy-600 hover:underline">
                contact page
              </Link>
              . See our{' '}
              <Link href="/privacy" className="text-navy-600 hover:underline">
                Privacy Policy
              </Link>{' '}
              and{' '}
              <Link href="/terms" className="text-navy-600 hover:underline">
                Terms of Service
              </Link>
              .
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
