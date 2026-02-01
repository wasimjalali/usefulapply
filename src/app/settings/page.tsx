'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  ArrowLeft, 
  User, 
  Mail, 
  Phone, 
  MapPin, 
  Camera,
  Save,
  LogOut,
  Trash2,
  CreditCard,
  Shield,
  Bell,
  Check,
  AlertTriangle,
  Crown,
  Sparkles,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/contexts/AuthContext';

export default function SettingsPage() {
  const router = useRouter();
  const { user: authUser, profile, isLoading: authLoading, signOut, updateProfile } = useAuth();
  
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    location: '',
    photoUrl: null as string | null,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeSection, setActiveSection] = useState<'profile' | 'account' | 'subscription' | 'notifications'>('profile');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Sync form data with profile
  useEffect(() => {
    if (profile) {
      setFormData({
        fullName: profile.full_name || '',
        email: profile.email || '',
        phone: profile.phone || '',
        location: profile.location || '',
        photoUrl: profile.avatar_url,
      });
    } else if (authUser) {
      setFormData(prev => ({
        ...prev,
        email: authUser.email || '',
      }));
    }
  }, [profile, authUser]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !authUser) {
      router.push('/auth/login');
    }
  }, [authLoading, authUser, router]);

  const handleSave = async () => {
    setIsSaving(true);
    const { error } = await updateProfile({
      full_name: formData.fullName,
      phone: formData.phone,
      location: formData.location,
      avatar_url: formData.photoUrl,
    });
    setIsSaving(false);
    if (!error) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, photoUrl: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleLogout = async () => {
    await signOut();
    router.push('/auth/login');
  };

  const handleDeleteAccount = () => {
    // TODO: Implement account deletion with Supabase
    console.log('Delete account');
    setShowDeleteConfirm(false);
  };

  // Show loading state
  if (authLoading) {
    return (
      <div className="min-h-screen bg-cream-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-navy-600" />
      </div>
    );
  }

  // Get subscription tier from profile
  const subscriptionTier = profile?.subscription_tier || 'free';

  const menuItems = [
    { id: 'profile', label: 'Profile', icon: User, description: 'Your personal information' },
    { id: 'account', label: 'Account', icon: Shield, description: 'Security and login settings' },
    { id: 'subscription', label: 'Subscription', icon: CreditCard, description: 'Manage your plan' },
    { id: 'notifications', label: 'Notifications', icon: Bell, description: 'Email preferences' },
  ];

  return (
    <div className="min-h-screen bg-cream-100">
      {/* Header */}
      <header className="bg-white border-b border-cream-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link 
                href="/"
                className="flex items-center gap-2 text-warm-gray hover:text-charcoal transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" />
                <span className="text-sm font-medium">Back to App</span>
              </Link>
            </div>
            <h1 className="text-lg font-semibold text-charcoal">Settings</h1>
            <div className="w-24" /> {/* Spacer for centering */}
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-8">
          {/* Sidebar Navigation */}
          <div className="w-64 flex-shrink-0">
            <nav className="space-y-1">
              {menuItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id as typeof activeSection)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all cursor-pointer ${
                    activeSection === item.id
                      ? 'bg-navy-600 text-white shadow-md'
                      : 'text-charcoal hover:bg-cream-200'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  <div>
                    <p className="font-medium text-sm">{item.label}</p>
                    <p className={`text-xs ${activeSection === item.id ? 'text-navy-200' : 'text-warm-gray'}`}>
                      {item.description}
                    </p>
                  </div>
                </button>
              ))}
            </nav>

            {/* Logout Button */}
            <div className="mt-8 pt-8 border-t border-cream-200">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
              >
                <LogOut className="w-5 h-5" />
                <span className="font-medium text-sm">Log Out</span>
              </button>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1">
            {/* Profile Section */}
            {activeSection === 'profile' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-charcoal">Profile Information</h2>
                  <p className="text-sm text-warm-gray mt-1">
                    Update your personal details and profile photo
                  </p>
                </div>

                {/* Profile Photo */}
                <Card className="p-6">
                  <h3 className="text-sm font-semibold text-charcoal mb-4">Profile Photo</h3>
                  <div className="flex items-center gap-6">
                    <div className="relative">
                      <div className="w-24 h-24 rounded-full bg-cream-200 flex items-center justify-center overflow-hidden ring-4 ring-cream-100">
                        {formData.photoUrl ? (
                          <img src={formData.photoUrl} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                          <User className="w-10 h-10 text-warm-gray" />
                        )}
                      </div>
                      <label className="absolute bottom-0 right-0 p-2 bg-navy-600 rounded-full text-white hover:bg-navy-700 transition-colors cursor-pointer shadow-lg">
                        <Camera className="w-4 h-4" />
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handlePhotoUpload}
                          className="hidden"
                        />
                      </label>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-charcoal">Upload a new photo</p>
                      <p className="text-xs text-warm-gray mt-1">
                        JPG, PNG or GIF. Max size 2MB.
                      </p>
                      {formData.photoUrl && (
                        <button
                          onClick={() => setFormData(prev => ({ ...prev, photoUrl: null }))}
                          className="text-xs text-red-500 hover:text-red-600 mt-2 cursor-pointer"
                        >
                          Remove photo
                        </button>
                      )}
                    </div>
                  </div>
                </Card>

                {/* Personal Information */}
                <Card className="p-6">
                  <h3 className="text-sm font-semibold text-charcoal mb-4">Personal Information</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">
                        Full Name
                      </label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-warm-gray" />
                        <input
                          type="text"
                          value={formData.fullName}
                          onChange={(e) => setFormData(prev => ({ ...prev, fullName: e.target.value }))}
                          placeholder="Enter your full name"
                          className="w-full pl-10 pr-4 py-2.5 border border-cream-300 rounded-lg focus:border-navy-500 focus:ring-1 focus:ring-navy-500 focus:outline-none transition-colors"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">
                        Email Address
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-warm-gray" />
                        <input
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                          placeholder="your@email.com"
                          className="w-full pl-10 pr-4 py-2.5 border border-cream-300 rounded-lg focus:border-navy-500 focus:ring-1 focus:ring-navy-500 focus:outline-none transition-colors"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">
                        Phone Number
                      </label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-warm-gray" />
                        <input
                          type="tel"
                          value={formData.phone}
                          onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                          placeholder="+1 (555) 000-0000"
                          className="w-full pl-10 pr-4 py-2.5 border border-cream-300 rounded-lg focus:border-navy-500 focus:ring-1 focus:ring-navy-500 focus:outline-none transition-colors"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">
                        Location
                      </label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-warm-gray" />
                        <input
                          type="text"
                          value={formData.location}
                          onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                          placeholder="City, Country"
                          className="w-full pl-10 pr-4 py-2.5 border border-cream-300 rounded-lg focus:border-navy-500 focus:ring-1 focus:ring-navy-500 focus:outline-none transition-colors"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex items-center justify-end gap-3">
                    {saveSuccess && (
                      <span className="flex items-center gap-1.5 text-sm text-sage-600">
                        <Check className="w-4 h-4" />
                        Changes saved
                      </span>
                    )}
                    <Button
                      variant="primary"
                      onClick={handleSave}
                      isLoading={isSaving}
                    >
                      <Save className="w-4 h-4 mr-2" />
                      Save Changes
                    </Button>
                  </div>
                </Card>
              </div>
            )}

            {/* Account Section */}
            {activeSection === 'account' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-charcoal">Account Settings</h2>
                  <p className="text-sm text-warm-gray mt-1">
                    Manage your account security and preferences
                  </p>
                </div>

                {/* Password */}
                <Card className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-charcoal">Password</h3>
                      <p className="text-xs text-warm-gray mt-1">
                        Change your password to keep your account secure
                      </p>
                    </div>
                    <Button variant="outline" size="sm">
                      Change Password
                    </Button>
                  </div>
                </Card>

                {/* Two-Factor Authentication */}
                <Card className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-charcoal">Two-Factor Authentication</h3>
                      <p className="text-xs text-warm-gray mt-1">
                        Add an extra layer of security to your account
                      </p>
                    </div>
                    <Button variant="outline" size="sm">
                      Enable 2FA
                    </Button>
                  </div>
                </Card>

                {/* Connected Accounts */}
                <Card className="p-6">
                  <h3 className="text-sm font-semibold text-charcoal mb-4">Connected Accounts</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-cream-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
                          <svg className="w-5 h-5" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-charcoal">Google</p>
                          <p className="text-xs text-warm-gray">Not connected</p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm">Connect</Button>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-cream-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-[#0A66C2] rounded-lg flex items-center justify-center shadow-sm">
                          <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-charcoal">LinkedIn</p>
                          <p className="text-xs text-warm-gray">Not connected</p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm">Connect</Button>
                    </div>
                  </div>
                </Card>

                {/* Danger Zone */}
                <Card className="p-6 border-red-200 bg-red-50/30">
                  <h3 className="text-sm font-semibold text-red-600 mb-4">Danger Zone</h3>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-charcoal">Delete Account</p>
                      <p className="text-xs text-warm-gray mt-1">
                        Permanently delete your account and all data. This action cannot be undone.
                      </p>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="border-red-300 text-red-600 hover:bg-red-100"
                      onClick={() => setShowDeleteConfirm(true)}
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                </Card>
              </div>
            )}

            {/* Subscription Section */}
            {activeSection === 'subscription' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-charcoal">Subscription</h2>
                  <p className="text-sm text-warm-gray mt-1">
                    Manage your subscription and billing
                  </p>
                </div>

                {/* Current Plan */}
                <Card className="p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold text-charcoal">
                          {subscriptionTier === 'free' ? 'Free Plan' : subscriptionTier === 'pro' ? 'Pro Plan' : 'Enterprise'}
                        </h3>
                        {subscriptionTier === 'free' && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-cream-200 text-warm-gray rounded-full">
                            Current
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-warm-gray mt-1">
                        {subscriptionTier === 'free' 
                          ? 'Basic features with limited usage'
                          : subscriptionTier === 'pro'
                          ? 'Unlimited applications and premium features'
                          : 'Custom solutions for teams'
                        }
                      </p>
                    </div>
                    {subscriptionTier !== 'free' && (
                      <Button variant="outline" size="sm">
                        Manage Billing
                      </Button>
                    )}
                  </div>

                  {subscriptionTier === 'free' && (
                    <div className="mt-4 p-4 bg-gradient-to-r from-gold-50 to-gold-100 rounded-xl border border-gold-200">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-gold-500 rounded-lg">
                          <Crown className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold text-charcoal">Upgrade to Pro</h4>
                          <p className="text-sm text-warm-gray mt-1">
                            Get unlimited job applications, advanced AI features, and priority support.
                          </p>
                          <Button variant="gold" size="sm" className="mt-3">
                            <Sparkles className="w-4 h-4 mr-1" />
                            Upgrade Now
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </Card>

                {/* Plan Comparison */}
                <Card className="p-6">
                  <h3 className="text-sm font-semibold text-charcoal mb-4">Compare Plans</h3>
                  <div className="grid grid-cols-3 gap-4">
                    {/* Free */}
                    <div className={`p-4 rounded-xl border-2 ${subscriptionTier === 'free' ? 'border-navy-500 bg-navy-50' : 'border-cream-200'}`}>
                      <h4 className="font-semibold text-charcoal">Free</h4>
                      <p className="text-2xl font-bold text-charcoal mt-2">$0<span className="text-sm font-normal text-warm-gray">/mo</span></p>
                      <ul className="mt-4 space-y-2 text-sm text-warm-gray">
                        <li className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-sage-500" />
                          5 applications/month
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-sage-500" />
                          Basic CV optimization
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-sage-500" />
                          Cover letter generation
                        </li>
                      </ul>
                    </div>

                    {/* Pro */}
                    <div className={`p-4 rounded-xl border-2 ${subscriptionTier === 'pro' ? 'border-navy-500 bg-navy-50' : 'border-cream-200'} relative`}>
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-gold-500 text-white text-xs font-medium rounded-full">
                        Popular
                      </div>
                      <h4 className="font-semibold text-charcoal">Pro</h4>
                      <p className="text-2xl font-bold text-charcoal mt-2">$19<span className="text-sm font-normal text-warm-gray">/mo</span></p>
                      <ul className="mt-4 space-y-2 text-sm text-warm-gray">
                        <li className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-sage-500" />
                          Unlimited applications
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-sage-500" />
                          Advanced AI optimization
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-sage-500" />
                          Company research
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-sage-500" />
                          Priority support
                        </li>
                      </ul>
                    </div>

                    {/* Enterprise */}
                    <div className={`p-4 rounded-xl border-2 ${subscriptionTier === 'enterprise' ? 'border-navy-500 bg-navy-50' : 'border-cream-200'}`}>
                      <h4 className="font-semibold text-charcoal">Enterprise</h4>
                      <p className="text-2xl font-bold text-charcoal mt-2">Custom</p>
                      <ul className="mt-4 space-y-2 text-sm text-warm-gray">
                        <li className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-sage-500" />
                          Everything in Pro
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-sage-500" />
                          Team management
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-sage-500" />
                          Custom integrations
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-sage-500" />
                          Dedicated support
                        </li>
                      </ul>
                    </div>
                  </div>
                </Card>
              </div>
            )}

            {/* Notifications Section */}
            {activeSection === 'notifications' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-charcoal">Notifications</h2>
                  <p className="text-sm text-warm-gray mt-1">
                    Manage how you receive notifications
                  </p>
                </div>

                <Card className="p-6">
                  <h3 className="text-sm font-semibold text-charcoal mb-4">Email Notifications</h3>
                  <div className="space-y-4">
                    {[
                      { id: 'tips', label: 'Tips & Tutorials', description: 'Get helpful tips to improve your applications' },
                      { id: 'updates', label: 'Product Updates', description: 'Be the first to know about new features' },
                      { id: 'weekly', label: 'Weekly Summary', description: 'Receive a weekly summary of your activity' },
                      { id: 'marketing', label: 'Marketing', description: 'Promotional offers and announcements' },
                    ].map((item) => (
                      <div key={item.id} className="flex items-center justify-between py-2">
                        <div>
                          <p className="text-sm font-medium text-charcoal">{item.label}</p>
                          <p className="text-xs text-warm-gray">{item.description}</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" className="sr-only peer" defaultChecked={item.id !== 'marketing'} />
                          <div className="w-11 h-6 bg-cream-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-navy-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-navy-600"></div>
                        </label>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md p-6 m-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-full">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-charcoal">Delete Account</h3>
            </div>
            <p className="text-sm text-warm-gray mb-6">
              Are you sure you want to delete your account? This will permanently remove all your data including:
            </p>
            <ul className="text-sm text-warm-gray mb-6 space-y-1 ml-4">
              <li>• All uploaded CVs and documents</li>
              <li>• Application history and chat messages</li>
              <li>• Generated cover letters and emails</li>
              <li>• Profile information</li>
            </ul>
            <p className="text-sm font-medium text-red-600 mb-6">
              This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
                Cancel
              </Button>
              <Button 
                variant="primary" 
                className="bg-red-600 hover:bg-red-700"
                onClick={handleDeleteAccount}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Delete Account
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  ArrowLeft, 
  User, 
  Mail, 
  Phone, 
  MapPin, 
  Camera,
  Save,
  LogOut,
  Trash2,
  CreditCard,
  Shield,
  Bell,
  Check,
  AlertTriangle,
  Crown,
  Sparkles,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/contexts/AuthContext';

export default function SettingsPage() {
  const router = useRouter();
  const { user: authUser, profile, isLoading: authLoading, signOut, updateProfile } = useAuth();
  
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    location: '',
    photoUrl: null as string | null,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeSection, setActiveSection] = useState<'profile' | 'account' | 'subscription' | 'notifications'>('profile');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Sync form data with profile
  useEffect(() => {
    if (profile) {
      setFormData({
        fullName: profile.full_name || '',
        email: profile.email || '',
        phone: profile.phone || '',
        location: profile.location || '',
        photoUrl: profile.avatar_url,
      });
    } else if (authUser) {
      setFormData(prev => ({
        ...prev,
        email: authUser.email || '',
      }));
    }
  }, [profile, authUser]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !authUser) {
      router.push('/auth/login');
    }
  }, [authLoading, authUser, router]);

  const handleSave = async () => {
    setIsSaving(true);
    const { error } = await updateProfile({
      full_name: formData.fullName,
      phone: formData.phone,
      location: formData.location,
      avatar_url: formData.photoUrl,
    });
    setIsSaving(false);
    if (!error) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !authUser) return;

    // Validate file size (5MB max)
    const MAX_SIZE = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_SIZE) {
      alert('File size must be less than 5MB');
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file');
      return;
    }

    // For now, use base64 for preview (will be uploaded to Supabase storage on save)
    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData(prev => ({ ...prev, photoUrl: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const handleLogout = async () => {
    await signOut();
    router.push('/auth/login');
  };

  const handleDeleteAccount = () => {
    // TODO: Implement account deletion with Supabase
    console.log('Delete account');
    setShowDeleteConfirm(false);
  };

  // Show loading state
  if (authLoading) {
    return (
      <div className="min-h-screen bg-cream-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-navy-600" />
      </div>
    );
  }

  // Get subscription tier from profile
  const subscriptionTier = profile?.subscription_tier || 'free';

  const menuItems = [
    { id: 'profile', label: 'Profile', icon: User, description: 'Your personal information' },
    { id: 'account', label: 'Account', icon: Shield, description: 'Security and login settings' },
    { id: 'subscription', label: 'Subscription', icon: CreditCard, description: 'Manage your plan' },
    { id: 'notifications', label: 'Notifications', icon: Bell, description: 'Email preferences' },
  ];

  return (
    <div className="min-h-screen bg-cream-100">
      {/* Header */}
      <header className="bg-white border-b border-cream-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link 
                href="/"
                className="flex items-center gap-2 text-warm-gray hover:text-charcoal transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" />
                <span className="text-sm font-medium">Back to App</span>
              </Link>
            </div>
            <h1 className="text-lg font-semibold text-charcoal">Settings</h1>
            <div className="w-24" /> {/* Spacer for centering */}
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-8">
          {/* Sidebar Navigation */}
          <div className="w-64 flex-shrink-0">
            <nav className="space-y-1">
              {menuItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id as typeof activeSection)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all cursor-pointer ${
                    activeSection === item.id
                      ? 'bg-navy-600 text-white shadow-md'
                      : 'text-charcoal hover:bg-cream-200'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  <div>
                    <p className="font-medium text-sm">{item.label}</p>
                    <p className={`text-xs ${activeSection === item.id ? 'text-navy-200' : 'text-warm-gray'}`}>
                      {item.description}
                    </p>
                  </div>
                </button>
              ))}
            </nav>

            {/* Logout Button */}
            <div className="mt-8 pt-8 border-t border-cream-200">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
              >
                <LogOut className="w-5 h-5" />
                <span className="font-medium text-sm">Log Out</span>
              </button>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1">
            {/* Profile Section */}
            {activeSection === 'profile' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-charcoal">Profile Information</h2>
                  <p className="text-sm text-warm-gray mt-1">
                    Update your personal details and profile photo
                  </p>
                </div>

                {/* Profile Photo */}
                <Card className="p-6">
                  <h3 className="text-sm font-semibold text-charcoal mb-4">Profile Photo</h3>
                  <div className="flex items-center gap-6">
                    <div className="relative">
                      <div className="w-24 h-24 rounded-full bg-cream-200 flex items-center justify-center overflow-hidden ring-4 ring-cream-100">
                        {formData.photoUrl ? (
                          <img src={formData.photoUrl} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                          <User className="w-10 h-10 text-warm-gray" />
                        )}
                      </div>
                      <label className="absolute bottom-0 right-0 p-2 bg-navy-600 rounded-full text-white hover:bg-navy-700 transition-colors cursor-pointer shadow-lg">
                        <Camera className="w-4 h-4" />
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handlePhotoUpload}
                          className="hidden"
                        />
                      </label>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-charcoal">Upload a new photo</p>
                      <p className="text-xs text-warm-gray mt-1">
                        JPG, PNG or GIF. Max size 5MB.
                      </p>
                      {formData.photoUrl && (
                        <button
                          onClick={() => setFormData(prev => ({ ...prev, photoUrl: null }))}
                          className="text-xs text-red-500 hover:text-red-600 mt-2 cursor-pointer"
                        >
                          Remove photo
                        </button>
                      )}
                    </div>
                  </div>
                </Card>

                {/* Personal Information */}
                <Card className="p-6">
                  <h3 className="text-sm font-semibold text-charcoal mb-4">Personal Information</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">
                        Full Name
                      </label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-warm-gray" />
                        <input
                          type="text"
                          value={formData.fullName}
                          onChange={(e) => setFormData(prev => ({ ...prev, fullName: e.target.value }))}
                          placeholder="Enter your full name"
                          className="w-full pl-10 pr-4 py-2.5 border border-cream-300 rounded-lg focus:border-navy-500 focus:ring-1 focus:ring-navy-500 focus:outline-none transition-colors"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">
                        Email Address
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-warm-gray" />
                        <input
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                          placeholder="your@email.com"
                          className="w-full pl-10 pr-4 py-2.5 border border-cream-300 rounded-lg focus:border-navy-500 focus:ring-1 focus:ring-navy-500 focus:outline-none transition-colors"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">
                        Phone Number
                      </label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-warm-gray" />
                        <input
                          type="tel"
                          value={formData.phone}
                          onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                          placeholder="+1 (555) 000-0000"
                          className="w-full pl-10 pr-4 py-2.5 border border-cream-300 rounded-lg focus:border-navy-500 focus:ring-1 focus:ring-navy-500 focus:outline-none transition-colors"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">
                        Location
                      </label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-warm-gray" />
                        <input
                          type="text"
                          value={formData.location}
                          onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                          placeholder="City, Country"
                          className="w-full pl-10 pr-4 py-2.5 border border-cream-300 rounded-lg focus:border-navy-500 focus:ring-1 focus:ring-navy-500 focus:outline-none transition-colors"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex items-center justify-end gap-3">
                    {saveSuccess && (
                      <span className="flex items-center gap-1.5 text-sm text-sage-600">
                        <Check className="w-4 h-4" />
                        Changes saved
                      </span>
                    )}
                    <Button
                      variant="primary"
                      onClick={handleSave}
                      isLoading={isSaving}
                    >
                      <Save className="w-4 h-4 mr-2" />
                      Save Changes
                    </Button>
                  </div>
                </Card>
              </div>
            )}

            {/* Account Section */}
            {activeSection === 'account' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-charcoal">Account Settings</h2>
                  <p className="text-sm text-warm-gray mt-1">
                    Manage your account security and preferences
                  </p>
                </div>

                {/* Password */}
                <Card className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-charcoal">Password</h3>
                      <p className="text-xs text-warm-gray mt-1">
                        Change your password to keep your account secure
                      </p>
                    </div>
                    <Button variant="outline" size="sm">
                      Change Password
                    </Button>
                  </div>
                </Card>

                {/* Two-Factor Authentication */}
                <Card className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-charcoal">Two-Factor Authentication</h3>
                      <p className="text-xs text-warm-gray mt-1">
                        Add an extra layer of security to your account
                      </p>
                    </div>
                    <Button variant="outline" size="sm">
                      Enable 2FA
                    </Button>
                  </div>
                </Card>

                {/* Connected Accounts */}
                <Card className="p-6">
                  <h3 className="text-sm font-semibold text-charcoal mb-4">Connected Accounts</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-cream-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
                          <svg className="w-5 h-5" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-charcoal">Google</p>
                          <p className="text-xs text-warm-gray">Not connected</p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm">Connect</Button>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-cream-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-[#0A66C2] rounded-lg flex items-center justify-center shadow-sm">
                          <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-charcoal">LinkedIn</p>
                          <p className="text-xs text-warm-gray">Not connected</p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm">Connect</Button>
                    </div>
                  </div>
                </Card>

                {/* Danger Zone */}
                <Card className="p-6 border-red-200 bg-red-50/30">
                  <h3 className="text-sm font-semibold text-red-600 mb-4">Danger Zone</h3>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-charcoal">Delete Account</p>
                      <p className="text-xs text-warm-gray mt-1">
                        Permanently delete your account and all data. This action cannot be undone.
                      </p>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="border-red-300 text-red-600 hover:bg-red-100"
                      onClick={() => setShowDeleteConfirm(true)}
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                </Card>
              </div>
            )}

            {/* Subscription Section */}
            {activeSection === 'subscription' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-charcoal">Subscription</h2>
                  <p className="text-sm text-warm-gray mt-1">
                    Manage your subscription and billing
                  </p>
                </div>

                {/* Current Plan */}
                <Card className="p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold text-charcoal">
                          {subscriptionTier === 'free' ? 'Free Plan' : subscriptionTier === 'pro' ? 'Pro Plan' : 'Enterprise'}
                        </h3>
                        {subscriptionTier === 'free' && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-cream-200 text-warm-gray rounded-full">
                            Current
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-warm-gray mt-1">
                        {subscriptionTier === 'free' 
                          ? 'Basic features with limited usage'
                          : subscriptionTier === 'pro'
                          ? 'Unlimited applications and premium features'
                          : 'Custom solutions for teams'
                        }
                      </p>
                    </div>
                    {subscriptionTier !== 'free' && (
                      <Button variant="outline" size="sm">
                        Manage Billing
                      </Button>
                    )}
                  </div>

                  {subscriptionTier === 'free' && (
                    <div className="mt-4 p-4 bg-gradient-to-r from-gold-50 to-gold-100 rounded-xl border border-gold-200">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-gold-500 rounded-lg">
                          <Crown className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold text-charcoal">Upgrade to Pro</h4>
                          <p className="text-sm text-warm-gray mt-1">
                            Get unlimited job applications, advanced AI features, and priority support.
                          </p>
                          <Button variant="gold" size="sm" className="mt-3">
                            <Sparkles className="w-4 h-4 mr-1" />
                            Upgrade Now
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </Card>

                {/* Plan Comparison */}
                <Card className="p-6">
                  <h3 className="text-sm font-semibold text-charcoal mb-4">Compare Plans</h3>
                  <div className="grid grid-cols-3 gap-4">
                    {/* Free */}
                    <div className={`p-4 rounded-xl border-2 ${subscriptionTier === 'free' ? 'border-navy-500 bg-navy-50' : 'border-cream-200'}`}>
                      <h4 className="font-semibold text-charcoal">Free</h4>
                      <p className="text-2xl font-bold text-charcoal mt-2">$0<span className="text-sm font-normal text-warm-gray">/mo</span></p>
                      <ul className="mt-4 space-y-2 text-sm text-warm-gray">
                        <li className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-sage-500" />
                          5 applications/month
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-sage-500" />
                          Basic CV optimization
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-sage-500" />
                          Cover letter generation
                        </li>
                      </ul>
                    </div>

                    {/* Pro */}
                    <div className={`p-4 rounded-xl border-2 ${subscriptionTier === 'pro' ? 'border-navy-500 bg-navy-50' : 'border-cream-200'} relative`}>
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-gold-500 text-white text-xs font-medium rounded-full">
                        Popular
                      </div>
                      <h4 className="font-semibold text-charcoal">Pro</h4>
                      <p className="text-2xl font-bold text-charcoal mt-2">$19<span className="text-sm font-normal text-warm-gray">/mo</span></p>
                      <ul className="mt-4 space-y-2 text-sm text-warm-gray">
                        <li className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-sage-500" />
                          Unlimited applications
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-sage-500" />
                          Advanced AI optimization
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-sage-500" />
                          Company research
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-sage-500" />
                          Priority support
                        </li>
                      </ul>
                    </div>

                    {/* Enterprise */}
                    <div className={`p-4 rounded-xl border-2 ${subscriptionTier === 'enterprise' ? 'border-navy-500 bg-navy-50' : 'border-cream-200'}`}>
                      <h4 className="font-semibold text-charcoal">Enterprise</h4>
                      <p className="text-2xl font-bold text-charcoal mt-2">Custom</p>
                      <ul className="mt-4 space-y-2 text-sm text-warm-gray">
                        <li className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-sage-500" />
                          Everything in Pro
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-sage-500" />
                          Team management
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-sage-500" />
                          Custom integrations
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-sage-500" />
                          Dedicated support
                        </li>
                      </ul>
                    </div>
                  </div>
                </Card>
              </div>
            )}

            {/* Notifications Section */}
            {activeSection === 'notifications' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-charcoal">Notifications</h2>
                  <p className="text-sm text-warm-gray mt-1">
                    Manage how you receive notifications
                  </p>
                </div>

                <Card className="p-6">
                  <h3 className="text-sm font-semibold text-charcoal mb-4">Email Notifications</h3>
                  <div className="space-y-4">
                    {[
                      { id: 'tips', label: 'Tips & Tutorials', description: 'Get helpful tips to improve your applications' },
                      { id: 'updates', label: 'Product Updates', description: 'Be the first to know about new features' },
                      { id: 'weekly', label: 'Weekly Summary', description: 'Receive a weekly summary of your activity' },
                      { id: 'marketing', label: 'Marketing', description: 'Promotional offers and announcements' },
                    ].map((item) => (
                      <div key={item.id} className="flex items-center justify-between py-2">
                        <div>
                          <p className="text-sm font-medium text-charcoal">{item.label}</p>
                          <p className="text-xs text-warm-gray">{item.description}</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" className="sr-only peer" defaultChecked={item.id !== 'marketing'} />
                          <div className="w-11 h-6 bg-cream-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-navy-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-navy-600"></div>
                        </label>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md p-6 m-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-full">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-charcoal">Delete Account</h3>
            </div>
            <p className="text-sm text-warm-gray mb-6">
              Are you sure you want to delete your account? This will permanently remove all your data including:
            </p>
            <ul className="text-sm text-warm-gray mb-6 space-y-1 ml-4">
              <li>• All uploaded CVs and documents</li>
              <li>• Application history and chat messages</li>
              <li>• Generated cover letters and emails</li>
              <li>• Profile information</li>
            </ul>
            <p className="text-sm font-medium text-red-600 mb-6">
              This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
                Cancel
              </Button>
              <Button 
                variant="primary" 
                className="bg-red-600 hover:bg-red-700"
                onClick={handleDeleteAccount}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Delete Account
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
