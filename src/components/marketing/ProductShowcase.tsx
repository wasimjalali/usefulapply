import Image from 'next/image';
import { FileText, Mail, MailCheck, Target, BarChart3, ClipboardList } from 'lucide-react';
import { ScrollReveal } from './ScrollReveal';

const FEATURES = [
  {
    id: 'cv',
    label: 'Tailored CV',
    description: 'Skills reordered to match the job. Keywords optimized for ATS screening. Professional formatting for US and EU markets.',
    icon: FileText,
    src: '/screenshots/showcase-cv.jpg',
    width: 4096,
    height: 2964,
    alt: 'KarKo AI tailored CV panel showing ATS-optimized resume',
    accent: 'from-navy-600 to-navy-700',
    accentLight: 'from-navy-50 to-navy-100',
    iconColor: 'text-navy-600',
    number: '01',
  },
  {
    id: 'cover-letter',
    label: 'Cover Letter',
    description: 'Company-specific opening. Your achievements matched to their requirements. Tone adapted to company culture.',
    icon: Target,
    src: '/screenshots/showcase-cover-letter.jpg',
    width: 4096,
    height: 2960,
    alt: 'KarKo AI personalized cover letter tailored to the company',
    accent: 'from-gold-400 to-gold-500',
    accentLight: 'from-gold-50 to-gold-100',
    iconColor: 'text-gold-500',
    number: '02',
  },
  {
    id: 'email',
    label: 'Application Email',
    description: 'Ready to send with the right subject line, professional tone, and your key qualifications highlighted.',
    icon: Mail,
    src: '/screenshots/showcase-email.jpg',
    width: 4096,
    height: 2948,
    alt: 'KarKo AI professional application email ready to send',
    accent: 'from-navy-600 to-navy-700',
    accentLight: 'from-navy-50 to-navy-100',
    iconColor: 'text-navy-600',
    number: '03',
  },
  {
    id: 'follow-up',
    label: 'Follow-Up Email',
    description: 'A timed follow-up email that highlights a different achievement. Sent 5 to 7 business days after your application.',
    icon: MailCheck,
    src: '/screenshots/showcase-follow-up.jpg',
    width: 1888,
    height: 1356,
    alt: 'KarKo AI follow-up email with a different achievement highlighted',
    accent: 'from-gold-400 to-gold-500',
    accentLight: 'from-gold-50 to-gold-100',
    iconColor: 'text-gold-500',
    number: '04',
  },
  {
    id: 'tracker',
    label: 'Application Tracker',
    description: 'Track every application with match scores, statuses, and company details in one place.',
    icon: ClipboardList,
    src: '/screenshots/showcase-tracker.jpg',
    width: 1896,
    height: 1374,
    alt: 'KarKo AI application tracker with match scores and status tracking',
    accent: 'from-navy-600 to-navy-700',
    accentLight: 'from-navy-50 to-navy-100',
    iconColor: 'text-navy-600',
    number: '05',
  },
  {
    id: 'ats-score',
    label: 'ATS Score',
    description: 'See exactly what was changed and why. Detailed strategy breakdown, ATS compatibility score, and key improvements.',
    icon: BarChart3,
    src: '/screenshots/showcase-ats-score.jpg',
    width: 2854,
    height: 1380,
    alt: 'KarKo AI ATS compatibility score and optimization report',
    accent: 'from-gold-400 to-gold-500',
    accentLight: 'from-gold-50 to-gold-100',
    iconColor: 'text-gold-500',
    number: '06',
  },
];

export function ProductShowcase() {
  return (
    <div className="space-y-10">
      {FEATURES.map((feature, i) => {
        const Icon = feature.icon;
        return (
          <ScrollReveal key={feature.id} delay={0} distance={40}>
            <div className="group relative bg-white rounded-2xl border border-cream-200 shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden">
              <div className={`h-1.5 bg-gradient-to-r ${feature.accent}`} />

              {/* Label bar */}
              <div className="px-6 py-5 flex items-center gap-4 border-b border-cream-100">
                <div className={`w-11 h-11 bg-gradient-to-br ${feature.accentLight} rounded-xl flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-300`}>
                  <Icon className={`w-5 h-5 ${feature.iconColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-bold text-cream-300">{feature.number}</span>
                    <h3 className="text-lg font-bold text-navy-600">{feature.label}</h3>
                  </div>
                  <p className="text-sm text-warm-gray mt-0.5 leading-relaxed">{feature.description}</p>
                </div>
              </div>

              {/* Full-width screenshot */}
              <div className="relative overflow-hidden bg-cream-50">
                <Image
                  src={feature.src}
                  alt={feature.alt}
                  width={feature.width}
                  height={feature.height}
                  className="w-full h-auto"
                  quality={90}
                  sizes="(max-width: 1280px) 100vw, 1280px"
                  priority={i === 0}
                />
              </div>
            </div>
          </ScrollReveal>
        );
      })}
    </div>
  );
}
