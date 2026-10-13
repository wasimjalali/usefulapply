'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export default function AuthCodeErrorPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-cream-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 text-center">
          <p className="text-warm-gray">Loading...</p>
        </Card>
      </div>
    }>
      <AuthCodeErrorContent />
    </Suspense>
  );
}

function AuthCodeErrorContent() {
  const searchParams = useSearchParams();
  const errorMessage = searchParams.get('error') || '';
  const errorDesc = searchParams.get('error_description');
  const errorDescription = errorDesc ? decodeURIComponent(errorDesc) : '';

  const getErrorTitle = () => {
    switch (errorMessage) {
      case 'access_denied':
        return 'Access Denied';
      case 'server_error':
        return 'Server Error';
      case 'temporarily_unavailable':
        return 'Service Temporarily Unavailable';
      default:
        return 'Authentication Error';
    }
  };

  const getErrorExplanation = () => {
    switch (errorMessage) {
      case 'access_denied':
        return 'You denied access to your account or the authentication request was cancelled.';
      case 'server_error':
        return 'An error occurred on the authentication server. Please try again.';
      case 'temporarily_unavailable':
        return 'The authentication service is temporarily unavailable. Please try again in a few moments.';
      default:
        return errorDescription || 'An error occurred during authentication. Please try again.';
    }
  };

  const getSuggestions = () => {
    const suggestions = [];
    
    switch (errorMessage) {
      case 'access_denied':
        suggestions.push('Try signing in again and grant the necessary permissions');
        suggestions.push('Make sure you\'re using the correct account');
        break;
      case 'server_error':
      case 'temporarily_unavailable':
        suggestions.push('Wait a few moments and try again');
        suggestions.push('Check your internet connection');
        suggestions.push('Try using a different browser');
        break;
      default:
        suggestions.push('Try signing in again');
        suggestions.push('Clear your browser cache and cookies');
        suggestions.push('Try using a different authentication method');
    }
    
    return suggestions;
  };

  return (
    <div className="min-h-screen bg-cream-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-navy-600 mb-2">
            {getErrorTitle()}
          </h1>
          <p className="text-warm-gray">
            {getErrorExplanation()}
          </p>
        </div>

        {errorMessage && (
          <div className="mb-6 p-3 bg-cream-200 rounded-lg">
            <p className="text-xs text-warm-gray font-mono">
              Error Code: {errorMessage}
            </p>
          </div>
        )}

        <div className="mb-6">
          <h2 className="text-sm font-semibold text-charcoal mb-3">What you can try:</h2>
          <ul className="space-y-2">
            {getSuggestions().map((suggestion, index) => (
              <li key={index} className="flex items-start gap-2 text-sm text-warm-gray">
                <span className="text-navy-600 mt-0.5">•</span>
                <span>{suggestion}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-3">
          <Link href="/auth/login">
            <Button variant="primary" className="w-full">
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
          </Link>
          <Link href="/">
            <Button variant="outline" className="w-full">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </Link>
        </div>

        <div className="mt-6 text-center">
          <p className="text-sm text-warm-gray">
            Still having issues?{' '}
            <Link href="/contact" className="text-navy-600 font-medium hover:text-navy-700">
              Contact Support
            </Link>
          </p>
        </div>
      </Card>
    </div>
  );
}
