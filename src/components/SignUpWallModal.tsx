'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Sparkles, ArrowRight, Loader2, Mail, Lock, User, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import KarkoLogo from '@/components/KarkoLogo';

interface SignUpWallModalProps {
  isOpen: boolean;
  onClose: () => void;
  trigger: 'download' | 'new-application' | 'general';
}

const TRIGGER_MESSAGES: Record<string, { title: string; subtitle: string }> = {
  download: {
    title: 'Sign up to download your documents',
    subtitle: 'Free plan includes 10 credits (~5 applications/month)',
  },
  'new-application': {
    title: 'Sign up to apply to more jobs',
    subtitle: 'Free plan includes 10 credits (~5 applications/month)',
  },
  general: {
    title: 'Create your free account',
    subtitle: 'Free plan includes 10 credits (~5 applications/month)',
  },
};

export function SignUpWallModal({ isOpen, onClose, trigger }: SignUpWallModalProps) {
  const { signUp, signIn } = useAuth();

  const [mode, setMode] = useState<'signup' | 'login'>('signup');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { title, subtitle } = TRIGGER_MESSAGES[trigger] || TRIGGER_MESSAGES.general;

  // Escape key handler for accessibility
  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, handleEscape]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'signup' && password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setIsLoading(true);

    if (mode === 'signup') {
      const { error: signUpError } = await signUp(email, password, fullName);
      if (signUpError) {
        setError(signUpError.message);
        setIsLoading(false);
      } else {
        setSuccess(true);
        setIsLoading(false);
      }
    } else {
      // Login mode
      const { error: signInError } = await signIn(email, password);
      if (signInError) {
        setError(signInError.message);
        setIsLoading(false);
      } else {
        clearFreeGenerationFlag();
        onClose();
        setIsLoading(false);
      }
    }
  };

  if (success) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-md bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-gold-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Mail className="w-8 h-8 text-gold-600" />
          </div>
          <h2 className="text-xl font-serif font-semibold tracking-tight text-charcoal mb-2">Check your email</h2>
          <p className="text-warm-gray mb-6">
            We&apos;ve sent a confirmation link to <strong>{email}</strong>.
            Please click the link to verify your account.
          </p>
          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 border border-cream-300 rounded-lg text-charcoal font-medium hover:bg-cream-50 transition-colors cursor-pointer"
          >
            Got it
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="signup-wall-title">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-lg overflow-hidden">
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 p-1.5 rounded-lg text-warm-gray hover:text-charcoal hover:bg-cream-100 transition-all cursor-pointer z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="px-8 pt-8 pb-4 text-center">
          <div className="flex justify-center mb-4">
            <KarkoLogo variant="icon" size="md" theme="light" />
          </div>
          <h2 className="text-xl font-serif font-semibold tracking-tight text-navy-700 mb-1">{title}</h2>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-cream-50 rounded-lg border border-cream-200 mt-2">
            <Sparkles className="w-3.5 h-3.5 text-gold-500" />
            <span className="text-sm text-charcoal font-medium">{subtitle}</span>
          </div>
        </div>

        {/* Email Form */}
        <form onSubmit={handleSubmit} className="px-8 pb-8">
          {error && (
            <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="space-y-3">
            {mode === 'signup' && (
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-gray" />
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Full Name"
                  required
                  className="w-full pl-10 pr-4 py-2.5 border border-cream-300 rounded-lg focus:border-navy-500 focus:ring-1 focus:ring-navy-500 focus:outline-none transition-colors text-sm"
                />
              </div>
            )}

            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-gray" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                required
                className="w-full pl-10 pr-4 py-2.5 border border-cream-300 rounded-lg focus:border-navy-500 focus:ring-1 focus:ring-navy-500 focus:outline-none transition-colors text-sm"
              />
            </div>

            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-gray" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password (min. 6 characters)"
                required
                className="w-full pl-10 pr-10 py-2.5 border border-cream-300 rounded-lg focus:border-navy-500 focus:ring-1 focus:ring-navy-500 focus:outline-none transition-colors text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-warm-gray hover:text-charcoal cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-4 px-4 py-2.5 bg-gold-400 text-white font-semibold rounded-2xl hover:bg-gold-500 transition-all shadow-md disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                {mode === 'signup' ? 'Create Free Account' : 'Sign In'}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          {mode === 'signup' && (
            <p className="text-xs text-warm-gray text-center mt-3">
              By signing up, you agree to our{' '}
              <a href="/terms" className="text-navy-600 hover:underline">Terms</a>
              {' '}and{' '}
              <a href="/privacy" className="text-navy-600 hover:underline">Privacy Policy</a>
            </p>
          )}

          <p className="text-sm text-warm-gray text-center mt-4">
            {mode === 'signup' ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              type="button"
              onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setError(null); }}
              className="text-navy-600 hover:text-navy-700 font-medium cursor-pointer"
            >
              {mode === 'signup' ? 'Sign in' : 'Sign up'}
            </button>
          </p>

        </form>
      </div>
    </div>
  );
}

// =====================================================
// ANONYMOUS USAGE TRACKING
// =====================================================

const ANON_GENERATION_KEY = 'karko_anonymous_generation_used';

/** Check if anonymous user has already used their free generation */
export function hasUsedFreeGeneration(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(ANON_GENERATION_KEY) === 'true';
}

/** Mark that anonymous user has used their free generation */
export function markFreeGenerationUsed(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ANON_GENERATION_KEY, 'true');
}

/** Clear the free generation flag (called on successful signup) */
export function clearFreeGenerationFlag(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ANON_GENERATION_KEY);
}
