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
  title: 'Use Useful Apply from Claude, ChatGPT and any AI assistant',
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
    body: 'Check your plan, credit balance, daily agent limit, credit history and a morning briefing of what needs attention.',
    tools: 'get_account, get_credit_history, morning_briefing',
  },
  {
    title: 'Read applications and CVs',
    body: 'List and open applications, see the status of a generation, read your CVs and CV outline, see the six templates and get a plain-language fit explanation.',
    tools: 'list_applications, get_application, get_operation, get_cv, get_cv_outline, list_cv_templates, explain_fit',
  },
  {
    title: 'Read your job feed',
    body: 'Browse your feed, feed settings and career profile.',
    tools: 'get_job_feed, get_feed_settings, get_career_profile',
  },
  {
    title: 'Manage applications',
    body: 'Create, update and delete applications, move them through your tracker and set interview and follow-up dates.',
    tools: 'create_application, update_application, update_application_status, delete_application, cancel_generation',
  },
  {
    title: 'Manage your CV and profile',
    body: 'Upload or remove a CV, edit your own words, add, hide, reorder or delete items, undo the last edit, pick a template and update your contact details and photo.',
    tools:
      'save_cv, delete_cv, update_profile, set_profile_photo, remove_profile_photo, update_cv_content, add_cv_item, set_cv_item_visibility, edit_cv_structure, delete_cv_item, undo_last_edit, set_cv_template',
  },
  {
    title: 'Edit documents and export',
    body: 'Edit a cover letter, email or follow-up directly. Export PDF, Word or text files and get a signed download link.',
    tools: 'edit_document_text, export_documents',
  },
  {
    title: 'Run your job feed',
    body: 'Run today’s feed, update feed settings, save or dismiss jobs and withdraw feed consent.',
    tools: 'run_job_feed, update_feed_settings, give_job_feedback, withdraw_feed_consent',
  },
  {
    title: 'Notifications',
    body: 'Change email notifications, reminders and your default template.',
    tools: 'update_notification_settings',
  },
];

const spendTools: { name: string; what: string; cost: string }[] = [
  { name: 'analyze_job_fit', what: 'Fit analysis for a job', cost: '0.5' },
  { name: 'generate_application_kit', what: 'CV, cover letter, email and follow-up', cost: '1.5 after a fit check, otherwise 2' },
  { name: 'regenerate_document', what: 'Rewrite a cover letter, email or follow-up', cost: '0.5' },
  { name: 'rewrite_cv_section', what: 'Rewrite one CV section', cost: '0.5 (free if refused)' },
  { name: 'apply_to_feed_job', what: 'Turn a feed job into an application', cost: '0.5 or 2' },
  { name: 'draft_screening_answers', what: 'Screening answers on Plus and Max', cost: 'Same as the web app' },
];

const scopes: { name: string; body: string }[] = [
  { name: 'Read', body: 'See your account, CVs, applications, kit documents, job feed and credits.' },
  { name: 'Write', body: 'Create and change applications, CVs, settings and exports. These actions don’t spend credits.' },
  { name: 'Spend', body: 'Use your credits for fit checks and generation. Needed for any tool that costs credits.' },
];

const h2 = 'text-[28px] md:text-[34px] font-bold text-navy-600 leading-[1.1] mb-4';
const p = 'text-warm-gray leading-relaxed';
const card = 'bg-white rounded-2xl p-6 border border-cream-200 shadow-sm';
const code = 'font-mono text-sm bg-cream-100 border border-cream-200 rounded px-1.5 py-0.5 text-charcoal whitespace-nowrap';
const pre =
  'font-mono text-sm bg-navy-800 text-cream-100 rounded-xl p-4 whitespace-pre overflow-x-auto leading-relaxed';

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
            <p className="text-xs font-semibold text-gold-600 uppercase tracking-[0.12em] mb-4">
              Integrations
            </p>
            <h1 className="font-bold text-navy-600 text-[40px] sm:text-[48px] leading-[1.05] tracking-tight mb-6">
              Use Useful Apply from your AI assistant.
            </h1>
            <p className="text-xl text-warm-gray max-w-2xl leading-relaxed">
              Connect Claude, ChatGPT, Claude Code, Cursor or any MCP client. Your assistant can
              check your fit, write your application and update your tracker. You approve what it
              can do, and you review before anything is sent.
            </p>
          </div>
        </section>

        <section className="py-12 px-4 sm:px-6 lg:px-8 bg-cream-50">
          <div className="max-w-4xl mx-auto">
            <h2 className={h2}>Connect</h2>
            <p className={`${p} mb-8`}>
              The server address is <code className={code}>{MCP_URL}</code>. You sign in with your
              Useful Apply account and approve access.
            </p>
            <div className="grid md:grid-cols-2 gap-6">
              <div className={card}>
                <h3 className="text-xl font-semibold text-charcoal mb-3">Claude.ai and Desktop</h3>
                <p className={p}>
                  Open Settings, then Connectors, then Add custom connector. Paste{' '}
                  <code className={code}>{MCP_URL}</code>. Once our listing is live, choose Browse
                  connectors instead.
                </p>
              </div>
              <div className={card}>
                <h3 className="text-xl font-semibold text-charcoal mb-3">ChatGPT</h3>
                <p className={p}>
                  Find Useful Apply in the ChatGPT app directory. Or turn on developer mode and add{' '}
                  <code className={code}>{MCP_URL}</code> as a connector.
                </p>
              </div>
              <div className={card}>
                <h3 className="text-xl font-semibold text-charcoal mb-3">Claude Code</h3>
                {/* The plugin line (/plugin marketplace add wasimjalali/usefulapply-plugin) is added at launch, when that repo ships. */}
                <p className={`${p} mb-3`}>Add the server:</p>
                <pre className={pre}>
                  <code>{`claude mcp add --transport http usefulapply ${MCP_URL}`}</code>
                </pre>
              </div>
              <div className={card}>
                <h3 className="text-xl font-semibold text-charcoal mb-3">Cursor</h3>
                <p className={`${p} mb-3`}>
                  Add this to your <code className={code}>mcp.json</code>:
                </p>
                <pre className={pre}>
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
              These tools use the same credits as the web app. Everything else is free.
            </p>
            <div className="overflow-x-auto bg-white rounded-2xl border border-cream-200 shadow-sm">
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="border-b border-cream-200 text-charcoal">
                    <th className="py-3 px-4 font-semibold">Tool</th>
                    <th className="py-3 px-4 font-semibold">What it does</th>
                    <th className="py-3 px-4 font-semibold">Credits</th>
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

        <section className="py-12 px-4 sm:px-6 lg:px-8 bg-cream-50">
          <div className="max-w-4xl mx-auto">
            <h2 className={h2}>Permissions</h2>
            <p className={`${p} mb-8`}>
              When you connect, you choose which of three scopes to grant.
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
              A daily agent credit limit caps what assistants can spend. It starts at 10 credits a
              day and you can change it in Settings, under Connected apps.
            </p>
            <p className={p}>
              To revoke access, open Settings, then Connected apps, and remove the app. Access
              stops within a minute. Work that is already paid for finishes and appears in the
              web app.
            </p>
          </div>
        </section>

        <section className="py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className={h2}>Safety</h2>
            <p className={`${p} mb-4`}>
              Assistants follow the same rules as the web app. Every skill, metric and claim in a
              CV or cover letter has to trace back to your own CV. We built it to avoid inventing
              facts about you, and we don’t treat that as a guarantee. Read what you send.
            </p>
            <p className={p}>
              You review before anything goes to an employer. Actions that overwrite or delete
              ask for your approval in your assistant, and you can undo CV edits.
            </p>
          </div>
        </section>

        <section className="py-12 pb-20 px-4 sm:px-6 lg:px-8 bg-cream-50">
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
