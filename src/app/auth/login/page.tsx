'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mail, Lock, Eye, EyeOff, ArrowRight, Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import BrandLogo from '@/components/BrandLogo';

export default function LoginPage() {
  const router = useRouter();
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailNotConfirmed, setEmailNotConfirmed] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  const handleResendConfirmation = async () => {
    setResendLoading(true);
    setResendSuccess(false);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, resendOnly: true }),
      });
      if (res.ok) {
        setResendSuccess(true);
      } else {
        setError('Failed to resend confirmation email. Please try again.');
      }
    } catch {
      setError('Failed to resend confirmation email. Please try again.');
    } finally {
      setResendLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setEmailNotConfirmed(false);
    setResendSuccess(false);
    setIsLoading(true);

    const { error: signInError } = await signIn(email, password);

    if (signInError) {
      if (signInError.message === 'EMAIL_NOT_CONFIRMED') {
        setEmailNotConfirmed(true);
      } else {
        setError(signInError.message);
      }
      setIsLoading(false);
    } else {
      router.push('/dashboard');
    }
  };

  return (
    <div className="min-h-screen bg-cream-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo/Brand */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3">
            <BrandLogo variant="full" size="lg" theme="light" />
          </div>
          <p className="text-warm-gray mt-2">Welcome back! Sign in to continue.</p>
        </div>

        <Card className="p-8">
          {/* Email Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {emailNotConfirmed && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm">
                <p className="text-amber-800 font-medium mb-1">Please confirm your email address</p>
                <p className="text-amber-700 mb-3">
                  We sent a confirmation link to <span className="font-medium">{email}</span>. Check your inbox (and spam folder) and click the link to activate your account.
                </p>
                {resendSuccess ? (
                  <p className="text-green-700 font-medium">Confirmation email sent! Check your inbox.</p>
                ) : (
                  <button
                    type="button"
                    onClick={handleResendConfirmation}
                    disabled={resendLoading}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-600 hover:text-navy-700 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${resendLoading ? 'animate-spin' : ''}`} />
                    {resendLoading ? 'Sending...' : 'Resend confirmation email'}
                  </button>
                )}
              </div>
            )}

            {error && !emailNotConfirmed && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-charcoal mb-1.5">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-warm-gray" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full pl-10 pr-4 py-2.5 border border-cream-300 rounded-lg focus:border-navy-500 focus:ring-1 focus:ring-navy-500 focus:outline-none transition-colors"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-charcoal mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-warm-gray" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pl-10 pr-12 py-2.5 border border-cream-300 rounded-lg focus:border-navy-500 focus:ring-1 focus:ring-navy-500 focus:outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-warm-gray hover:text-charcoal cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end">
              <Link href="/auth/forgot-password" className="text-sm text-navy-600 hover:text-navy-700 cursor-pointer">
                Forgot password?
              </Link>
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign In
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </form>
        </Card>

        {/* Sign Up Link */}
        <p className="text-center mt-6 text-warm-gray">
          Don't have an account?{' '}
          <Link href="/auth/signup" className="text-navy-600 hover:text-navy-700 font-medium cursor-pointer">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
