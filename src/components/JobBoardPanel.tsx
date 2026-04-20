'use client';

import { useState, useCallback } from 'react';
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
  Lock,
  Sparkles,
  AlertCircle,
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
}

interface SearchResponse {
  jobs: Job[];
  total: number;
  next_page_token?: string;
  searches_used: number;
  searches_limit: number;
  error?: string;
  upgrade_required?: boolean;
}

export function JobBoardPanel() {
  const { user, profile } = useAuth();
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [remote, setRemote] = useState<boolean | undefined>(undefined);
  const [showFilters, setShowFilters] = useState(false);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [searchesUsed, setSearchesUsed] = useState(0);
  const [searchesLimit, setSearchesLimit] = useState(0);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [copiedJobId, setCopiedJobId] = useState<string | null>(null);

  const tier = profile?.subscription_tier;
  const hasAccess = tier === 'plus' || tier === 'max' || tier === 'pro';

  const searchJobs = useCallback(async (pageToken?: string) => {
    if (!hasAccess) return;
    if (!query.trim()) {
      setError('Please enter a job title or keywords');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/jobs/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query.trim(),
          location: location.trim() || undefined,
          remote: remote === true ? true : undefined,
          next_page_token: pageToken,
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

      // If loading more, append to existing jobs
      if (pageToken) {
        setJobs(prev => [...prev, ...data.jobs]);
      } else {
        setJobs(data.jobs);
      }

      setNextPageToken(data.next_page_token || null);
      setSearchesUsed(data.searches_used);
      setSearchesLimit(data.searches_limit);
      setHasSearched(true);
    } catch {
      setError('Failed to search jobs. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [query, location, remote, hasAccess]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setJobs([]); // Clear previous results
    setNextPageToken(null);
    searchJobs();
  };

  const handleLoadMore = () => {
    if (nextPageToken) {
      searchJobs(nextPageToken);
    }
  };

  const copyJobToClipboard = async (job: Job) => {
    const applyLink = job.apply_options?.[0]?.link || job.share_link || '';
    const jobText = `Job Title: ${job.title}
Company: ${job.company}
Location: ${job.location}${job.remote ? ' (Remote)' : ''}
${job.salary ? `Salary: ${job.salary}` : ''}
${job.employment_type ? `Type: ${job.employment_type}` : ''}
${applyLink ? `Apply: ${applyLink}` : ''}
${job.description ? `\nDescription:\n${job.description}` : ''}`;

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
      {/* Search Header */}
      <div className="flex-shrink-0 p-4 sm:p-6 border-b border-cream-200 bg-white/80 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto">
          {/* Search Form */}
          <form onSubmit={handleSearch} className="space-y-3">
            <div className="flex gap-2">
              {/* Job Title / Keywords */}
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-gray" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Job title or keywords..."
                  className="w-full pl-10 pr-4 py-2.5 text-sm border border-cream-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-400/30 focus:border-navy-400 bg-white"
                />
              </div>

              {/* Location */}
              <div className="w-48 relative hidden sm:block">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-gray" />
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Location..."
                  className="w-full pl-10 pr-4 py-2.5 text-sm border border-cream-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-400/30 focus:border-navy-400 bg-white"
                />
              </div>

              {/* Filter Toggle */}
              <button
                type="button"
                onClick={() => setShowFilters(!showFilters)}
                className={`px-3 py-2.5 border rounded-lg transition-colors cursor-pointer ${
                  showFilters
                    ? 'border-navy-400 bg-navy-50 text-navy-600'
                    : 'border-cream-200 text-warm-gray hover:border-navy-300'
                }`}
              >
                <Filter className="w-4 h-4" />
              </button>

              {/* Search Button */}
              <Button type="submit" variant="primary" disabled={isLoading}>
                {isLoading && !nextPageToken ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Search'
                )}
              </Button>
            </div>

            {/* Expanded Filters */}
            {showFilters && (
              <div className="flex flex-wrap gap-3 pt-2">
                {/* Location (mobile) */}
                <div className="w-full sm:hidden relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-gray" />
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Location..."
                    className="w-full pl-10 pr-4 py-2 text-sm border border-cream-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-400/30 focus:border-navy-400 bg-white"
                  />
                </div>

                {/* Remote Toggle */}
                <div className="flex items-center gap-2">
                  <label className="text-sm text-charcoal">Remote:</label>
                  <select
                    value={remote === undefined ? '' : remote ? 'true' : 'false'}
                    onChange={(e) => {
                      if (e.target.value === '') setRemote(undefined);
                      else setRemote(e.target.value === 'true');
                    }}
                    className="px-3 py-1.5 text-sm border border-cream-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-400/30 bg-white"
                  >
                    <option value="">Any</option>
                    <option value="true">Remote Only</option>
                  </select>
                </div>
              </div>
            )}
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
              <p className="text-warm-gray max-w-sm">
                Enter a job title or keywords to find opportunities. Copy job details to chat and generate tailored applications instantly.
              </p>
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
                Try adjusting your search terms or location to find more opportunities.
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
                </p>
              </div>

              {/* Job Cards */}
              <div className="space-y-3">
                {jobs.map((job, index) => (
                  <div
                    key={`${job.id}-${index}`}
                    className="bg-white border border-cream-200 rounded-xl p-4 hover:border-navy-300 hover:shadow-sm transition-all"
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
                              onClick={() => copyJobToClipboard(job)}
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
                          <p className="mt-2 text-xs text-warm-gray line-clamp-2">
                            {job.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Load More Button */}
              {nextPageToken && (
                <div className="flex justify-center mt-6">
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
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
