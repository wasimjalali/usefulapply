'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import {
  Search,
  MapPin,
  Building2,
  Calendar,
  DollarSign,
  ExternalLink,
  Copy,
  Check,
  Loader2,
  Filter,
  Briefcase,
  Globe,
  ChevronRight,
  ChevronDown,
  Lock,
  Sparkles,
  AlertCircle,
  X,
  ListChecks,
} from 'lucide-react';
import Link from 'next/link';

interface ApplyOption {
  title: string;
  link: string;
}

interface JobHighlight {
  title: string;
  items: string[];
}

interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  via?: string;
  share_link?: string;
  thumbnail?: string;
  posted_date?: string;
  employment_type?: string;
  salary?: string;
  description?: string;
  highlights?: JobHighlight[];
  apply_options?: ApplyOption[];
  extensions?: string[];
}

interface FilterOption {
  label: string;
  value: string;
}

interface SearchFilter {
  name: string;
  options: FilterOption[];
}

interface SearchResponse {
  jobs: Job[];
  filters: SearchFilter[];
  total: number;
  next_page_token?: string;
  searches_used: number;
  searches_limit: number;
  error?: string;
  upgrade_required?: boolean;
}

// localStorage key for persisting search state
const JOB_SEARCH_STORAGE_KEY = 'karko_job_search_state';

interface JobSearchState {
  query: string;
  location: string;
  country: string;
  jobs: Job[];
  availableFilters: SearchFilter[];
  selectedFilters: string[];
  nextPageToken: string | null;
  searchesUsed: number;
  searchesLimit: number;
  hasSearched: boolean;
  timestamp: number;
}

// Common country codes for the dropdown
// Use 'uk' (not 'gb') — SerpAPI/Google uses 'uk' for United Kingdom
const COUNTRY_OPTIONS = [
  { code: '', label: 'Any Country' },
  { code: 'us', label: 'United States' },
  { code: 'uk', label: 'United Kingdom' },
  { code: 'de', label: 'Germany' },
  { code: 'fr', label: 'France' },
  { code: 'nl', label: 'Netherlands' },
  { code: 'ca', label: 'Canada' },
  { code: 'au', label: 'Australia' },
  { code: 'in', label: 'India' },
  { code: 'sg', label: 'Singapore' },
  { code: 'ae', label: 'UAE' },
  { code: 'ch', label: 'Switzerland' },
  { code: 'se', label: 'Sweden' },
  { code: 'es', label: 'Spain' },
  { code: 'it', label: 'Italy' },
  { code: 'ie', label: 'Ireland' },
  { code: 'jp', label: 'Japan' },
  { code: 'br', label: 'Brazil' },
  { code: 'mx', label: 'Mexico' },
  { code: 'pl', label: 'Poland' },
  { code: 'at', label: 'Austria' },
  { code: 'dk', label: 'Denmark' },
  { code: 'no', label: 'Norway' },
  { code: 'fi', label: 'Finland' },
  { code: 'nz', label: 'New Zealand' },
  { code: 'za', label: 'South Africa' },
];

// Formats job descriptions that come in varying formats from different countries.
// US jobs tend to use double-newlines between sections. International jobs (DE, FR, etc.)
// often use single newlines, bullet characters (•, -, *, ►), or colons as section headers.
function FormattedDescription({ text }: { text: string }) {
  // Split on any newline — handles both \n and \n\n
  const lines = text.split(/\n/).map(l => l.trimEnd());

  const elements: React.ReactNode[] = [];
  let currentList: string[] = [];

  const flushList = () => {
    if (currentList.length > 0) {
      elements.push(
        <ul key={`list-${elements.length}`} className="space-y-1.5 my-2 ml-1">
          {currentList.map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-navy-500 mt-0.5 flex-shrink-0">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );
      currentList = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip empty lines (they become spacing between elements)
    if (!line.trim()) {
      flushList();
      continue;
    }

    // Detect bullet points: lines starting with •, -, *, ►, ●, ○, ■, ▪, –, ·
    const bulletMatch = line.match(/^\s*[•\-*►●○■▪–·]\s*(.+)/);
    if (bulletMatch) {
      currentList.push(bulletMatch[1].trim());
      continue;
    }

    // Detect section headers: short lines (under 60 chars) ending with colon,
    // or ALL-CAPS lines, or lines that are bold-looking (no punctuation at end, short)
    const trimmed = line.trim();
    const isHeader = (
      (trimmed.endsWith(':') && trimmed.length < 80) ||
      (trimmed === trimmed.toUpperCase() && trimmed.length > 3 && trimmed.length < 80 && /[A-Z]/.test(trimmed))
    );

    if (isHeader) {
      flushList();
      elements.push(
        <h4 key={`h-${elements.length}`} className="font-semibold text-charcoal mt-4 mb-1.5">
          {trimmed}
        </h4>
      );
      continue;
    }

    // Regular paragraph text
    flushList();
    elements.push(
      <p key={`p-${elements.length}`} className="mb-2">
        {trimmed}
      </p>
    );
  }

  flushList();
  return <div className="space-y-0.5">{elements}</div>;
}

export function JobBoardPanel() {
  const { user, profile } = useAuth();

  // Search inputs
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [country, setCountry] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Dynamic filters from API
  const [availableFilters, setAvailableFilters] = useState<SearchFilter[]>([]);
  const [selectedFilters, setSelectedFilters] = useState<string[]>([]);
  const [expandedFilterGroup, setExpandedFilterGroup] = useState<string | null>(null);

  // Results
  const [jobs, setJobs] = useState<Job[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchesUsed, setSearchesUsed] = useState(0);
  const [searchesLimit, setSearchesLimit] = useState(0);

  // UI State
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [copiedJobId, setCopiedJobId] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  const tier = profile?.subscription_tier;
  const hasAccess = tier === 'plus' || tier === 'max' || tier === 'pro';

  // Load persisted state from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(JOB_SEARCH_STORAGE_KEY);
      if (stored) {
        const state: JobSearchState = JSON.parse(stored);
        // Only restore if less than 1 hour old
        const ONE_HOUR = 60 * 60 * 1000;
        if (Date.now() - state.timestamp < ONE_HOUR) {
          setQuery(state.query || '');
          setLocation(state.location || '');
          setCountry(state.country || '');
          setJobs(state.jobs || []);
          setAvailableFilters(state.availableFilters || []);
          setSelectedFilters(state.selectedFilters || []);
          setNextPageToken(state.nextPageToken);
          setSearchesUsed(state.searchesUsed || 0);
          setSearchesLimit(state.searchesLimit || 0);
          setHasSearched(state.hasSearched || false);
        }
      }
    } catch (e) {
      console.error('Failed to load job search state:', e);
    }
    setIsInitialized(true);
  }, []);

  // Persist state to localStorage whenever it changes
  useEffect(() => {
    if (!isInitialized) return;

    const state: JobSearchState = {
      query,
      location,
      country,
      jobs,
      availableFilters,
      selectedFilters,
      nextPageToken,
      searchesUsed,
      searchesLimit,
      hasSearched,
      timestamp: Date.now(),
    };

    try {
      localStorage.setItem(JOB_SEARCH_STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Failed to save job search state:', e);
    }
  }, [
    isInitialized,
    query,
    location,
    country,
    jobs,
    availableFilters,
    selectedFilters,
    nextPageToken,
    searchesUsed,
    searchesLimit,
    hasSearched,
  ]);

  const searchJobs = useCallback(async (pageToken?: string, withFilters?: string[], page?: number) => {
    if (!hasAccess) return;
    if (!query.trim()) {
      setError('Please enter a job title, company, or keywords');
      return;
    }

    setIsLoading(true);
    setError(null);

    const pageNum = page || 1;

    try {
      const response = await fetch('/api/jobs/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query.trim(),
          location: location.trim() || undefined,
          country: country || undefined,
          filters: withFilters || selectedFilters,
          next_page_token: pageToken,
          page: pageNum,
        }),
      });

      const data: SearchResponse = await response.json();

      if (!response.ok) {
        if (data.upgrade_required) {
          setError('Upgrade to Plus or Max to access the Job Board');
        } else {
          setError(data.error || 'Search failed');
        }
        return;
      }

      if (pageToken) {
        setJobs(prev => [...prev, ...data.jobs]);
      } else {
        setJobs(data.jobs);
        if (data.filters && data.filters.length > 0) {
          setAvailableFilters(data.filters);
        }
      }

      setCurrentPage(pageNum);
      setNextPageToken(data.next_page_token || null);
      setSearchesUsed(data.searches_used);
      setSearchesLimit(data.searches_limit);
      setHasSearched(true);
    } catch {
      setError('Failed to search jobs. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [query, location, country, selectedFilters, hasAccess]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setJobs([]);
    setNextPageToken(null);
    setCurrentPage(1);
    setSelectedFilters([]);
    setAvailableFilters([]);
    searchJobs(undefined, undefined, 1);
  };

  const handleLoadMore = () => {
    if (nextPageToken) {
      const nextPage = currentPage + 1;
      searchJobs(nextPageToken, undefined, nextPage);
    }
  };

  const handleFilterToggle = (filterValue: string) => {
    const newFilters = selectedFilters.includes(filterValue)
      ? selectedFilters.filter(f => f !== filterValue)
      : [...selectedFilters, filterValue];

    setSelectedFilters(newFilters);
    setJobs([]);
    setNextPageToken(null);
    setCurrentPage(1);
    searchJobs(undefined, newFilters, 1);
  };

  const clearAllFilters = () => {
    setSelectedFilters([]);
    setJobs([]);
    setNextPageToken(null);
    setCurrentPage(1);
    searchJobs(undefined, [], 1);
  };

  const copyJobToClipboard = async (job: Job) => {
    const applyLink = job.apply_options?.[0]?.link || job.share_link || '';

    const highlightsText = job.highlights?.map(h =>
      `\n${h.title}:\n${h.items.map(item => `• ${item}`).join('\n')}`
    ).join('\n') || '';

    const jobText = `Job Title: ${job.title}
Company: ${job.company}
Location: ${job.location}${job.remote ? ' (Remote)' : ''}
${job.salary ? `Salary: ${job.salary}` : ''}
${job.employment_type ? `Type: ${job.employment_type}` : ''}
${job.posted_date ? `Posted: ${job.posted_date}` : ''}
${applyLink ? `Apply: ${applyLink}` : ''}
${job.description ? `\nDescription:\n${job.description}` : ''}${highlightsText}`;

    try {
      await navigator.clipboard.writeText(jobText);
      setCopiedJobId(job.id);
      setTimeout(() => setCopiedJobId(null), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = jobText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedJobId(job.id);
      setTimeout(() => setCopiedJobId(null), 2000);
    }
  };

  // Job Detail Modal Component
  const JobDetailModal = ({ job, onClose }: { job: Job; onClose: () => void }) => {
    const applyLink = job.apply_options?.[0]?.link || job.share_link;

    useEffect(() => {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }, [onClose]);

    return (
      <div
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 md:p-6"
        onClick={onClose}
      >
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal Header */}
          <div className="flex items-start gap-4 p-6 border-b border-cream-200 bg-cream-50">
            <div className="flex-shrink-0 w-16 h-16 bg-white rounded-xl flex items-center justify-center overflow-hidden border border-cream-200">
              {job.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={job.thumbnail}
                  alt={job.company}
                  className="w-full h-full object-contain"
                />
              ) : (
                <Building2 className="w-8 h-8 text-warm-gray" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-2xl font-bold text-charcoal">{job.title}</h2>
              <p className="text-lg text-warm-gray">{job.company}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-cream-100 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-6 h-6 text-warm-gray" />
            </button>
          </div>

          {/* Modal Body - Scrollable */}
          <div className="flex-1 overflow-auto p-6">
            {/* Meta Info */}
            <div className="flex flex-wrap gap-3 mb-6">
              <span className="inline-flex items-center gap-2 px-4 py-2 bg-cream-100 rounded-lg text-sm text-charcoal">
                <MapPin className="w-4 h-4 text-warm-gray" />
                {job.location}
              </span>
              {job.remote && (
                <span className="inline-flex items-center gap-2 px-4 py-2 bg-navy-50 rounded-lg text-sm text-navy-700">
                  <Globe className="w-4 h-4" />
                  Remote
                </span>
              )}
              {job.salary && (
                <span className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 rounded-lg text-sm text-emerald-700">
                  <DollarSign className="w-4 h-4" />
                  {job.salary}
                </span>
              )}
              {job.employment_type && (
                <span className="inline-flex items-center gap-2 px-4 py-2 bg-cream-100 rounded-lg text-sm text-charcoal">
                  <Briefcase className="w-4 h-4 text-warm-gray" />
                  {job.employment_type}
                </span>
              )}
              {job.posted_date && (
                <span className="inline-flex items-center gap-2 px-4 py-2 bg-cream-100 rounded-lg text-sm text-charcoal">
                  <Calendar className="w-4 h-4 text-warm-gray" />
                  {job.posted_date}
                </span>
              )}
            </div>

            {job.via && (
              <p className="text-sm text-warm-gray mb-6">via {job.via}</p>
            )}

            {/* Description */}
            {job.description && (
              <div className="mb-6">
                <h3 className="text-base font-semibold text-charcoal mb-3">Job Description</h3>
                <div className="text-sm text-charcoal/90 leading-relaxed">
                  <FormattedDescription text={job.description} />
                </div>
              </div>
            )}

            {/* Highlights */}
            {job.highlights && job.highlights.length > 0 && (
              <div className="mb-6 space-y-5">
                {job.highlights.map((highlight, idx) => (
                  <div key={idx}>
                    <h3 className="text-base font-semibold text-charcoal mb-3 flex items-center gap-2">
                      <ListChecks className="w-5 h-5 text-navy-600" />
                      {highlight.title}
                    </h3>
                    <ul className="space-y-2">
                      {highlight.items.map((item, itemIdx) => (
                        <li key={itemIdx} className="text-sm text-charcoal/90 flex items-start gap-2">
                          <span className="text-navy-500 mt-1">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            {/* Apply Options */}
            {job.apply_options && job.apply_options.length > 0 && (
              <div>
                <h3 className="text-base font-semibold text-charcoal mb-3">Apply via</h3>
                <div className="flex flex-wrap gap-2">
                  {job.apply_options.map((option, idx) => (
                    <a
                      key={idx}
                      href={option.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm text-navy-600 bg-navy-50 hover:bg-navy-100 rounded-lg transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      {option.title}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-between gap-4 p-6 border-t border-cream-200 bg-cream-50">
            <p className="text-sm text-warm-gray">
              Copy job details and paste into chat to generate your application
            </p>
            <div className="flex items-center gap-3">
              {applyLink && (
                <a
                  href={applyLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-5 py-2.5 text-sm font-medium text-navy-600 hover:bg-navy-50 rounded-lg transition-colors"
                >
                  Apply Directly
                </a>
              )}
              <Button
                variant="primary"
                onClick={() => {
                  copyJobToClipboard(job);
                  setTimeout(() => onClose(), 1500);
                }}
                className="gap-2"
              >
                {copiedJobId === job.id ? (
                  <>
                    <Check className="w-4 h-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy to Chat
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Upgrade prompt for non-authenticated users
  if (!user) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="max-w-md text-center">
          <div className="inline-flex p-4 bg-navy-50 rounded-2xl mb-4">
            <Lock className="w-8 h-8 text-navy-600" />
          </div>
          <h2 className="text-xl font-bold text-charcoal mb-2">Sign in to access Job Board</h2>
          <p className="text-warm-gray mb-6">
            Search thousands of jobs and apply directly from Karko AI.
          </p>
          <div className="flex gap-3 justify-center">
            <Link href="/auth/login">
              <Button variant="outline">Sign In</Button>
            </Link>
            <Link href="/auth/signup">
              <Button variant="primary">Sign Up</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Upgrade prompt for free users
  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="max-w-md text-center">
          <div className="inline-flex p-4 bg-gradient-to-br from-gold-100 to-gold-200 rounded-2xl mb-4">
            <Sparkles className="w-8 h-8 text-gold-600" />
          </div>
          <h2 className="text-xl font-bold text-charcoal mb-2">Upgrade to Access Job Board</h2>
          <p className="text-warm-gray mb-4">
            Search thousands of job listings and apply directly from your dashboard.
            Available for Plus and Max subscribers.
          </p>
          <div className="bg-cream-100 rounded-xl p-4 mb-6 text-left">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-charcoal">Plus Plan</span>
              <span className="text-sm text-warm-gray">50 searches/month</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-charcoal">Max Plan</span>
              <span className="text-sm text-warm-gray">100 searches/month</span>
            </div>
          </div>
          <Link href="/pricing">
            <Button variant="gold" className="w-full">
              <Sparkles className="w-4 h-4 mr-2" />
              View Plans
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Job Detail Modal */}
      {selectedJob && (
        <JobDetailModal job={selectedJob} onClose={() => setSelectedJob(null)} />
      )}

      {/* Search Header */}
      <div className="flex-shrink-0 p-4 sm:p-6 border-b border-cream-200 bg-white/80 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto">
          {/* Search Form */}
          <form onSubmit={handleSearch} className="space-y-3">
            {/* Row 1: Query + Search button */}
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-gray" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Job title, company, or keywords..."
                  className="w-full pl-10 pr-4 py-2.5 text-sm border border-cream-200 rounded-lg focus:outline-none focus:border-navy-400 bg-white transition-colors"
                />
              </div>

              {/* Search Button */}
              <Button type="submit" variant="primary" disabled={isLoading}>
                {isLoading && !nextPageToken ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Search'
                )}
              </Button>
            </div>

            {/* Row 2: Location + Country (always visible) */}
            <div className="flex gap-2">
              {/* Location — city, region, or zip code */}
              <div className="flex-1 relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-gray" />
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="City, state, or zip code..."
                  className="w-full pl-10 pr-4 py-2.5 text-sm border border-cream-200 rounded-lg focus:outline-none focus:border-navy-400 bg-white transition-colors"
                />
              </div>

              {/* Country — always visible */}
              <div className="relative w-40 sm:w-48">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-gray" />
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-sm border border-cream-200 rounded-lg focus:outline-none focus:border-navy-400 bg-white transition-colors appearance-none cursor-pointer"
                >
                  {COUNTRY_OPTIONS.map((c) => (
                    <option key={c.code} value={c.code}>{c.label}</option>
                  ))}
                </select>
              </div>

              {/* Filter Toggle (for dynamic API filters after search) */}
              {availableFilters.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowFilters(!showFilters)}
                  className={`px-3 py-2.5 border rounded-lg transition-colors cursor-pointer ${
                    showFilters
                      ? 'border-navy-400 bg-navy-50 text-navy-600'
                      : 'border-cream-200 text-warm-gray hover:border-navy-300'
                  }`}
                  title="Toggle result filters"
                >
                  <Filter className="w-4 h-4" />
                </button>
              )}
            </div>
          </form>

          {/* Search Usage Indicator */}
          {searchesLimit > 0 && (
            <div className="mt-3 flex items-center justify-between text-xs text-warm-gray">
              <span>
                {searchesUsed} / {searchesLimit} searches used this month
              </span>
              <div className="w-32 h-1.5 bg-cream-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    searchesUsed / searchesLimit > 0.9
                      ? 'bg-red-400'
                      : searchesUsed / searchesLimit > 0.7
                      ? 'bg-gold-400'
                      : 'bg-navy-400'
                  }`}
                  style={{ width: `${Math.min(100, (searchesUsed / searchesLimit) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dynamic Filters Bar (shown after search) */}
      {availableFilters.length > 0 && (
        <div className="flex-shrink-0 px-4 sm:px-6 py-3 border-b border-cream-200 bg-cream-50/50">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-warm-gray mr-1">Filters:</span>

              {/* Filter Groups */}
              {availableFilters.map((filterGroup, idx) => (
                <div key={`${filterGroup.name}-${idx}`} className="relative">
                  <button
                    type="button"
                    onClick={() => setExpandedFilterGroup(
                      expandedFilterGroup === filterGroup.name ? null : filterGroup.name
                    )}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer flex items-center gap-1 ${
                      selectedFilters.some(f => filterGroup.options.some(o => o.value === f))
                        ? 'bg-navy-50 border-navy-300 text-navy-700'
                        : 'bg-white border-cream-200 text-charcoal hover:border-navy-300'
                    }`}
                  >
                    {filterGroup.name}
                    <ChevronDown className={`w-3 h-3 transition-transform ${
                      expandedFilterGroup === filterGroup.name ? 'rotate-180' : ''
                    }`} />
                  </button>

                  {/* Dropdown */}
                  {expandedFilterGroup === filterGroup.name && (
                    <div className="absolute top-full left-0 mt-1 bg-white border border-cream-200 rounded-lg shadow-lg z-10 min-w-[160px] py-1">
                      {filterGroup.options.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            handleFilterToggle(option.value);
                            setExpandedFilterGroup(null);
                          }}
                          className={`w-full px-3 py-2 text-xs text-left hover:bg-cream-50 transition-colors cursor-pointer flex items-center justify-between ${
                            selectedFilters.includes(option.value)
                              ? 'text-navy-700 font-medium'
                              : 'text-charcoal'
                          }`}
                        >
                          {option.label}
                          {selectedFilters.includes(option.value) && (
                            <Check className="w-3 h-3 text-navy-600" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {/* Clear Filters */}
              {selectedFilters.length > 0 && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="px-2 py-1.5 text-xs text-warm-gray hover:text-charcoal transition-colors cursor-pointer"
                >
                  Clear all
                </button>
              )}
            </div>

            {/* Active filter chips */}
            {selectedFilters.length > 0 && (
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {selectedFilters.map((filterValue) => {
                  const filterOption = availableFilters
                    .flatMap(g => g.options)
                    .find(o => o.value === filterValue);
                  if (!filterOption) return null;
                  return (
                    <span
                      key={filterValue}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-navy-100 text-navy-700 text-xs rounded-md"
                    >
                      {filterOption.label}
                      <button
                        type="button"
                        onClick={() => handleFilterToggle(filterValue)}
                        className="hover:text-navy-900 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Results Area */}
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="max-w-4xl mx-auto">
          {/* Error State */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Loading State (initial search) */}
          {isLoading && jobs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-navy-600 mb-3" />
              <p className="text-sm text-warm-gray">Searching jobs...</p>
            </div>
          )}

          {/* Empty State - Before Search */}
          {!isLoading && !hasSearched && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="inline-flex p-4 bg-navy-50 rounded-2xl mb-4">
                <Briefcase className="w-8 h-8 text-navy-600" />
              </div>
              <h3 className="text-lg font-semibold text-charcoal mb-2">Search for Jobs</h3>
              <p className="text-warm-gray max-w-sm mb-4">
                Enter a job title, company name, or keywords to find opportunities worldwide.
              </p>
              <div className="text-xs text-warm-gray/70 space-y-1">
                <p>Examples: "Software Engineer", "Google", "Remote Data Analyst"</p>
                <p>Add a city or country to narrow results</p>
              </div>
            </div>
          )}

          {/* Empty State - No Results */}
          {!isLoading && hasSearched && jobs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="inline-flex p-4 bg-cream-100 rounded-2xl mb-4">
                <Search className="w-8 h-8 text-warm-gray" />
              </div>
              <h3 className="text-lg font-semibold text-charcoal mb-2">No jobs found</h3>
              <p className="text-warm-gray max-w-sm">
                Try different keywords, adjust your location, or remove some filters.
              </p>
            </div>
          )}

          {/* Job Results */}
          {jobs.length > 0 && (
            <>
              {/* Results Header */}
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-warm-gray">
                  {jobs.length} jobs found
                  {selectedFilters.length > 0 && ` (${selectedFilters.length} filter${selectedFilters.length > 1 ? 's' : ''} applied)`}
                </p>
              </div>

              {/* Job Cards */}
              <div className="space-y-3">
                {jobs.map((job, index) => (
                  <div
                    key={`${job.id}-${index}`}
                    className="bg-white border border-cream-200 rounded-xl p-4 hover:border-navy-300 hover:shadow-sm transition-all cursor-pointer"
                    onClick={() => setSelectedJob(job)}
                  >
                    <div className="flex items-start gap-4">
                      {/* Company Logo */}
                      <div className="flex-shrink-0 w-12 h-12 bg-cream-100 rounded-lg flex items-center justify-center overflow-hidden">
                        {job.thumbnail ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={job.thumbnail}
                            alt={job.company}
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <Building2 className="w-6 h-6 text-warm-gray" />
                        )}
                      </div>

                      {/* Job Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-semibold text-charcoal line-clamp-1">
                              {job.title}
                            </h3>
                            <p className="text-sm text-warm-gray">{job.company}</p>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                copyJobToClipboard(job);
                              }}
                              className={`p-2 rounded-lg transition-colors cursor-pointer ${
                                copiedJobId === job.id
                                  ? 'bg-emerald-50 text-emerald-600'
                                  : 'hover:bg-cream-100 text-warm-gray hover:text-navy-600'
                              }`}
                              title="Copy to clipboard"
                            >
                              {copiedJobId === job.id ? (
                                <Check className="w-4 h-4" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </button>
                            {job.apply_options?.[0]?.link && (
                              <a
                                href={job.apply_options[0].link}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="p-2 rounded-lg hover:bg-cream-100 text-warm-gray hover:text-navy-600 transition-colors"
                                title="Apply"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            )}
                          </div>
                        </div>

                        {/* Meta Info */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-warm-gray">
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {job.location}
                          </span>
                          {job.remote && (
                            <span className="flex items-center gap-1 text-navy-600">
                              <Globe className="w-3 h-3" />
                              Remote
                            </span>
                          )}
                          {job.salary && (
                            <span className="flex items-center gap-1 text-emerald-600">
                              <DollarSign className="w-3 h-3" />
                              {job.salary}
                            </span>
                          )}
                          {job.posted_date && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {job.posted_date}
                            </span>
                          )}
                          {job.employment_type && (
                            <span className="flex items-center gap-1">
                              <Briefcase className="w-3 h-3" />
                              {job.employment_type}
                            </span>
                          )}
                        </div>

                        {/* Source */}
                        {job.via && (
                          <p className="mt-1.5 text-xs text-warm-gray/70">
                            via {job.via}
                          </p>
                        )}

                        {/* Description Preview */}
                        {job.description && (
                          <p className="mt-2 text-xs text-charcoal/80 line-clamp-2">
                            {job.description.replace(/[•\-*►●○■▪–·]\s*/g, '').replace(/\n+/g, ' ')}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Load More Button */}
              {nextPageToken && (
                <div className="flex flex-col items-center gap-2 mt-6">
                  <Button
                    variant="outline"
                    onClick={handleLoadMore}
                    disabled={isLoading}
                    className="gap-2"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        Load More
                        <ChevronRight className="w-4 h-4" />
                      </>
                    )}
                  </Button>
                  {currentPage >= 3 && (
                    <p className="text-xs text-warm-gray">
                      Loading more results will use 1 search credit
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Click outside to close filter dropdown */}
      {expandedFilterGroup && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setExpandedFilterGroup(null)}
        />
      )}
    </div>
  );
}
