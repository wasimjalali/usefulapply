import Link from 'next/link';
import { Home, FileText, BookOpen, Search } from 'lucide-react';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';
import BrandLogo from '@/components/BrandLogo';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-cream-100">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <div className="text-center">
          {/* 404 Visual */}
          <div className="mb-8">
            <BrandLogo variant="full" size="lg" theme="light" className="mx-auto mb-6" />
            <div className="text-8xl sm:text-9xl font-bold text-navy-600/10">404</div>
          </div>

          {/* Heading */}
          <h1 className="text-3xl sm:text-4xl font-bold text-navy-700 mb-4">
            Page Not Found
          </h1>
          <p className="text-lg text-charcoal mb-12 max-w-2xl mx-auto">
            The page you're looking for doesn't exist or has been moved. Let's get you back on track.
          </p>

          {/* Quick Links */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
            <Link
              href="/"
              className="flex flex-col items-center p-6 bg-white border-2 border-navy-200/40 rounded-xl hover:border-gold-400 hover:shadow-lg transition-all group"
            >
              <div className="w-12 h-12 rounded-full bg-navy-600 flex items-center justify-center mb-3 group-hover:bg-gold-500 transition-colors">
                <Home className="w-6 h-6 text-white" />
              </div>
              <span className="font-semibold text-navy-700">Home</span>
              <span className="text-sm text-charcoal/70 mt-1">Back to homepage</span>
            </Link>

            <Link
              href="/dashboard"
              className="flex flex-col items-center p-6 bg-white border-2 border-navy-200/40 rounded-xl hover:border-gold-400 hover:shadow-lg transition-all group"
            >
              <div className="w-12 h-12 rounded-full bg-navy-600 flex items-center justify-center mb-3 group-hover:bg-gold-500 transition-colors">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <span className="font-semibold text-navy-700">Try It Free</span>
              <span className="text-sm text-charcoal/70 mt-1">Start generating</span>
            </Link>

            <Link
              href="/blog"
              className="flex flex-col items-center p-6 bg-white border-2 border-navy-200/40 rounded-xl hover:border-gold-400 hover:shadow-lg transition-all group"
            >
              <div className="w-12 h-12 rounded-full bg-navy-600 flex items-center justify-center mb-3 group-hover:bg-gold-500 transition-colors">
                <BookOpen className="w-6 h-6 text-white" />
              </div>
              <span className="font-semibold text-navy-700">Blog</span>
              <span className="text-sm text-charcoal/70 mt-1">Career tips</span>
            </Link>

            <Link
              href="/ai-job-application"
              className="flex flex-col items-center p-6 bg-white border-2 border-navy-200/40 rounded-xl hover:border-gold-400 hover:shadow-lg transition-all group"
            >
              <div className="w-12 h-12 rounded-full bg-navy-600 flex items-center justify-center mb-3 group-hover:bg-gold-500 transition-colors">
                <Search className="w-6 h-6 text-white" />
              </div>
              <span className="font-semibold text-navy-700">AI Applications</span>
              <span className="text-sm text-charcoal/70 mt-1">Learn how it works</span>
            </Link>
          </div>

          {/* Additional Help */}
          <div className="bg-white border border-navy-200/40 rounded-xl p-6 max-w-2xl mx-auto">
            <h2 className="text-xl font-semibold text-navy-700 mb-2">Need help?</h2>
            <p className="text-charcoal mb-4">
              If you followed a link to get here, please{' '}
              <Link href="/contact" className="text-gold-600 hover:text-gold-700 font-medium underline">
                let us know
              </Link>{' '}
              so we can fix it.
            </p>
            <Link
              href="/"
              className="inline-flex items-center justify-center px-6 py-3 bg-navy-600 text-white font-semibold rounded-lg hover:bg-navy-700 transition-colors"
            >
              Go to Homepage
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
