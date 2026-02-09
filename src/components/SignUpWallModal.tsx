'use client';

import { useState } from 'react';
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
    subtitle: 'Create a free account to download your optimized CV, cover letter, and email.',
  },
  'new-application': {
    title: 'Sign up to apply to more jobs',
    subtitle: 'Create a free account to generate unlimited applications with 40 free credits.',
  },
  general: {
    title: 'Create your free account',
    subtitle: 'Sign up to save your work and access all features.',
  },
};

export function SignUpWallModal({ isOpen, onClose, trigger }: SignUpWallModalProps) {
  const { signUp, signIn, signInWithGoogle } = useAuth();

  const [mode, setMode] = useState<'signup' | 'login'>('signup');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { title, subtitle } = TRIGGER_MESSAGES[trigger] || TRIGGER_MESSAGES.general;

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

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    const { error } = await signInWithGoogle();
    if (error) {
      setError(error.message);
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 text-center">
          <div className="w-16 h-16 bg-sage-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Mail className="w-8 h-8 text-sage-600" />
          </div>
          <h2 className="text-xl font-semibold text-charcoal mb-2">Check your email</h2>
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
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
          <h2 className="text-xl font-bold text-navy-700 mb-1">{title}</h2>
          <p className="text-sm text-warm-gray">{subtitle}</p>
        </div>

        {/* Google Sign-In */}
        <div className="px-8">
          <button
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-cream-300 rounded-xl text-charcoal font-medium hover:bg-cream-50 transition-colors cursor-pointer disabled:opacity-50"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-cream-200" />
            <span className="text-xs text-warm-gray">or</span>
            <div className="flex-1 h-px bg-cream-200" />
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
                  className="w-full pl-10 pr-4 py-2.5 border border-cream-300 rounded-xl focus:border-navy-500 focus:ring-1 focus:ring-navy-500 focus:outline-none transition-colors text-sm"
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
                className="w-full pl-10 pr-4 py-2.5 border border-cream-300 rounded-xl focus:border-navy-500 focus:ring-1 focus:ring-navy-500 focus:outline-none transition-colors text-sm"
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
                className="w-full pl-10 pr-10 py-2.5 border border-cream-300 rounded-xl focus:border-navy-500 focus:ring-1 focus:ring-navy-500 focus:outline-none transition-colors text-sm"
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
            className="w-full mt-4 px-4 py-2.5 bg-gradient-to-r from-gold-400 to-gold-500 text-white font-semibold rounded-xl hover:from-gold-500 hover:to-gold-600 transition-all shadow-md disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
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

          {/* Free tier highlight */}
          <div className="mt-4 p-3 bg-cream-50 rounded-xl border border-cream-200">
            <div className="flex items-center gap-2 text-sm">
              <Sparkles className="w-4 h-4 text-gold-500 flex-shrink-0" />
              <span className="text-charcoal font-medium">Free plan includes 40 credits (~20 applications/month)</span>
            </div>
          </div>
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
