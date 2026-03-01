'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Lock, Eye, EyeOff, CheckCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { changePassword } from '@/lib/supabase';
import KarkoLogo from '@/components/KarkoLogo';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);

    const { error: changeError } = await changePassword(password);

    if (changeError) {
      setError(changeError.message || 'Failed to update password. Please try again.');
      setIsLoading(false);
    } else {
      setSuccess(true);
      setTimeout(() => router.push('/dashboard'), 2000);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-cream-100 via-cream-50 to-cream-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 text-center">
          <div className="w-16 h-16 bg-sage-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-sage-600" />
          </div>
          <h2 className="text-xl font-semibold text-charcoal mb-2">Password updated</h2>
          <p className="text-warm-gray mb-6">
            Your password has been changed successfully. Redirecting you to the dashboard...
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-cream-100 via-cream-50 to-cream-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3">
            <KarkoLogo variant="full" size="lg" theme="light" />
          </div>
          <p className="text-warm-gray mt-2">Enter your new password below.</p>
        </div>

        <Card className="p-8">
          <h1 className="text-xl font-semibold text-charcoal mb-6">Set New Password</h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-charcoal mb-1.5">
                New Password
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

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-charcoal mb-1.5">
                Confirm New Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-warm-gray" />
                <input
                  id="confirmPassword"
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pl-10 pr-12 py-2.5 border border-cream-300 rounded-lg focus:border-navy-500 focus:ring-1 focus:ring-navy-500 focus:outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-warm-gray hover:text-charcoal cursor-pointer"
                >
                  {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
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
                  Updating password...
                </>
              ) : (
                'Update Password'
              )}
            </Button>
          </form>
        </Card>

        <p className="text-center mt-6 text-warm-gray text-sm">
          Changed your mind?{' '}
          <Link href="/auth/login" className="text-navy-600 hover:text-navy-700 font-medium cursor-pointer">
            Back to Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}
