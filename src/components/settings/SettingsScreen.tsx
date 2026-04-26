'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, User, Shield, CreditCard, Bell, LogOut, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { ProfileSection } from '@/components/settings/ProfileSection';
import { AccountSection, PasswordModal, DeleteConfirmModal } from '@/components/settings/AccountSection';
import { SubscriptionSection } from '@/components/settings/SubscriptionSection';
import { NotificationsSection } from '@/components/settings/NotificationsSection';
import { uploadAvatar, deleteAvatar } from '@/lib/supabase/storage';
import {
  getSubscription,
  changePassword,
  type Subscription,
} from '@/lib/supabase';
import { getUserCredits, type UserCredits } from '@/lib/supabase/credits';

export type SettingsSection = 'profile' | 'account' | 'subscription' | 'notifications';

interface SettingsScreenProps {
  forcedSection?: SettingsSection;
}

const SETTINGS_ROUTE_MAP: Record<SettingsSection, string> = {
  profile: '/profile',
  account: '/account',
  subscription: '/subscription',
  notifications: '/notifications',
};

const SETTINGS_MENU_ITEMS = [
  { id: 'profile' as const, label: 'Profile', icon: User, description: 'Your personal information' },
  { id: 'account' as const, label: 'Account', icon: Shield, description: 'Security and login settings' },
  { id: 'subscription' as const, label: 'Subscription', icon: CreditCard, description: 'Manage your plan' },
  { id: 'notifications' as const, label: 'Notifications', icon: Bell, description: 'Email preferences' },
];

function getSectionFromQuery(section: string | null): SettingsSection {
  if (section && ['profile', 'account', 'subscription', 'notifications'].includes(section)) {
    return section as SettingsSection;
  }
  return 'profile';
}

export function SettingsScreenFallback() {
  return (
    <div className="min-h-screen bg-cream-100 flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-navy-600" />
    </div>
  );
}

export function SettingsScreen({ forcedSection }: SettingsScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user: authUser, profile, isLoading: authLoading, signOut, updateProfile } = useAuth();
  const isStandalone = !!forcedSection;
  const resolvedSection = forcedSection ?? getSectionFromQuery(searchParams.get('section'));

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    location: '',
    photoUrl: null as string | null,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeSection, setActiveSection] = useState<SettingsSection>(resolvedSection);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);

  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [userCredits, setUserCredits] = useState<UserCredits | null>(null);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [notifications, setNotifications] = useState({
    tips: true,
    updates: true,
    weekly: true,
    marketing: false,
  });

  useEffect(() => {
    setActiveSection(resolvedSection);
  }, [resolvedSection]);

  useEffect(() => {
    if (profile) {
      setFormData({
        fullName: profile.full_name || '',
        email: profile.email || '',
        phone: profile.phone || '',
        location: profile.location || '',
        photoUrl: profile.avatar_url,
      });
      setNotifications({
        tips: (profile as any).notify_tips ?? true,
        updates: (profile as any).notify_updates ?? true,
        weekly: (profile as any).notify_weekly ?? true,
        marketing: (profile as any).notify_marketing ?? false,
      });
    } else if (authUser) {
      setFormData(prev => ({
        ...prev,
        email: authUser.email || '',
      }));
    }
  }, [profile, authUser]);

  useEffect(() => {
    const loadAccountData = async () => {
      if (!authUser) return;

      setIsLoadingAccounts(true);

      try {
        const creditsResult = await getUserCredits(authUser.id);
        if (creditsResult.credits) {
          setUserCredits(creditsResult.credits);
          console.log('[Settings] Loaded user_credits:', creditsResult.credits.plan_tier, 'status:', creditsResult.credits.subscription_status);
        } else {
          console.warn('[Settings] No user_credits found for user:', authUser.id, creditsResult.error);
        }
      } catch (error) {
        console.error('[Settings] Error loading user credits:', error);
      }

      try {
        const sub = await getSubscription(authUser.id);
        setSubscription(sub);
      } catch (error) {
        console.warn('[Settings] Error loading subscription (non-fatal):', error);
      }

      setIsLoadingAccounts(false);
    };

    loadAccountData();
  }, [authUser]);

  useEffect(() => {
    const isSuccess = searchParams.get('success') === 'true';
    const isAddonSuccess = searchParams.get('addon_success') === 'true';
    if ((!isSuccess && !isAddonSuccess) || !authUser) return;
    if (forcedSection && forcedSection !== 'subscription') return;

    setActiveSection('subscription');

    let attempts = 0;
    const maxAttempts = 10;
    const pollInterval = 2000;
    const initialAddonCredits = userCredits?.addon_credits ?? -1;

    const poll = async () => {
      attempts += 1;
      try {
        const creditsResult = await getUserCredits(authUser.id);
        if (creditsResult.credits) {
          setUserCredits(creditsResult.credits);
          const tier = creditsResult.credits.plan_tier;
          if (isSuccess && tier !== 'free') return;
          if (isAddonSuccess && creditsResult.credits.addon_credits > initialAddonCredits) return;
          if (attempts >= maxAttempts) return;
        }
      } catch {
        // Ignore transient polling errors.
      }

      if (attempts < maxAttempts) {
        setTimeout(poll, pollInterval);
      }
    };

    setTimeout(poll, 1500);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser, forcedSection]);

  useEffect(() => {
    if (!authLoading && !authUser) {
      router.push('/auth/login');
    }
  }, [authLoading, authUser, router]);

  const handleSectionSelect = (section: SettingsSection) => {
    setActiveSection(section);
    if (!isStandalone) {
      router.replace(`/settings?section=${section}`, { scroll: false });
    }
  };

  const handleSave = async () => {
    setIsSaving(true);

    let avatarUrl = formData.photoUrl;

    if (pendingPhotoFile && authUser) {
      setIsUploadingPhoto(true);
      const { url, error: uploadError } = await uploadAvatar(authUser.id, pendingPhotoFile);
      setIsUploadingPhoto(false);

      if (uploadError) {
        alert('Failed to upload photo: ' + uploadError.message);
        setIsSaving(false);
        return;
      }

      avatarUrl = url;
      setPendingPhotoFile(null);
    }

    const avatarToSave = avatarUrl?.startsWith('data:')
      ? profile?.avatar_url
      : avatarUrl;

    const { error } = await updateProfile({
      full_name: formData.fullName,
      phone: formData.phone,
      location: formData.location,
      avatar_url: avatarToSave,
    });
    setIsSaving(false);
    if (!error) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
  };

  const handlePhotoUpload = async (file: File) => {
    if (!authUser) return;

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      alert('File size must be less than 5MB');
      return;
    }

    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file');
      return;
    }

    setPendingPhotoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData(prev => ({ ...prev, photoUrl: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = async () => {
    if (authUser && profile?.avatar_url) {
      await deleteAvatar(authUser.id);
    }
    setPendingPhotoFile(null);
    setFormData(prev => ({ ...prev, photoUrl: null }));
  };

  const handleLogout = async () => {
    await signOut();
    router.push('/auth/login');
  };

  const handleDeleteAccount = async () => {
    if (!authUser) return;

    const typedConfirm = window.prompt('Type "DELETE" to permanently delete your account and all data:');
    if (typedConfirm !== 'DELETE') {
      setShowDeleteConfirm(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/delete-account', { method: 'DELETE' });
      const data = await res.json();

      if (!res.ok) {
        alert('Failed to delete account: ' + (data.error || 'Unknown error'));
        return;
      }

      try {
        localStorage.removeItem('session-store');
        localStorage.removeItem('cv-store');
        localStorage.removeItem('job-copilot-storage');
      } catch {
        // Ignore localStorage cleanup failures.
      }

      router.push('/');
    } catch (err) {
      console.error('Delete account error:', err);
      alert('An error occurred while deleting your account. Please contact support.');
    } finally {
      setShowDeleteConfirm(false);
    }
  };

  const handleChangePassword = async (newPassword: string, confirmPassword: string) => {
    setPasswordError(null);

    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    setIsChangingPassword(true);
    const { error } = await changePassword(newPassword);
    setIsChangingPassword(false);

    if (error) {
      setPasswordError(error.message);
    } else {
      setShowPasswordModal(false);
      alert('Password changed successfully!');
    }
  };

  const handleManageBilling = async () => {
    if (!authUser) return;
    try {
      const res = await fetch('/api/stripe/create-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: authUser.id }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || 'Failed to open billing portal');
      }
    } catch {
      alert('Something went wrong. Please try again.');
    }
  };

  const handleBuyAddon = async (packSize: string) => {
    if (!authUser) return;
    const res = await fetch('/api/stripe/create-addon-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: authUser.id, packSize }),
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      alert(data.error || 'Failed to start checkout');
    }
  };

  const handleUpgrade = async (planTier: 'plus' | 'max') => {
    if (!authUser) return;
    try {
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: authUser.id, planTier }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || 'Failed to start checkout');
      }
    } catch {
      alert('Something went wrong. Please try again.');
    }
  };

  const handleNotificationChange = async (key: keyof typeof notifications, value: boolean) => {
    setNotifications(prev => ({ ...prev, [key]: value }));

    const updateKey = `notify_${key}` as const;
    const { error } = await updateProfile({ [updateKey]: value } as any);

    if (error) {
      setNotifications(prev => ({ ...prev, [key]: !value }));
      alert('Failed to save notification preference');
    }
  };

  if (authLoading) {
    return <SettingsScreenFallback />;
  }

  const subscriptionTier = userCredits?.plan_tier || subscription?.tier || profile?.subscription_tier || 'free';
  const activeItem = SETTINGS_MENU_ITEMS.find((item) => item.id === activeSection) || SETTINGS_MENU_ITEMS[0];

  const sectionContent = (
    <>
      {activeSection === 'profile' && (
        <ProfileSection
          formData={formData}
          onChange={(data) => setFormData(prev => ({ ...prev, ...data }))}
          onSave={handleSave}
          onPhotoUpload={handlePhotoUpload}
          onPhotoRemove={handleRemovePhoto}
          isSaving={isSaving || isUploadingPhoto}
          saveSuccess={saveSuccess}
        />
      )}

      {activeSection === 'account' && (
        <AccountSection
          onChangePassword={() => setShowPasswordModal(true)}
          onDeleteAccount={() => setShowDeleteConfirm(true)}
        />
      )}

      {activeSection === 'subscription' && (
        <SubscriptionSection
          subscriptionTier={subscriptionTier}
          userCredits={userCredits}
          userId={authUser?.id}
          onManageBilling={handleManageBilling}
          onUpgrade={handleUpgrade}
          onBuyAddon={handleBuyAddon}
        />
      )}

      {activeSection === 'notifications' && (
        <NotificationsSection
          notifications={notifications}
          onChange={handleNotificationChange}
        />
      )}
    </>
  );

  const standaloneNav = (
    <>
      <div className="hidden md:flex items-center gap-2 rounded-full border border-cream-200 bg-white/90 p-1 shadow-sm">
        {SETTINGS_MENU_ITEMS.map((item) => (
          <Link
            key={item.id}
            href={SETTINGS_ROUTE_MAP[item.id]}
            className={`flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-all ${
              activeSection === item.id
                ? 'bg-navy-700 text-white shadow-sm'
                : 'text-warm-gray hover:text-navy-600'
            }`}
          >
            <item.icon className={`w-4 h-4 ${activeSection === item.id ? 'text-gold-300' : ''}`} />
            {item.label}
          </Link>
        ))}
      </div>

      <div className="md:hidden -mx-1 overflow-x-auto pb-1 scrollbar-hide">
        <div className="inline-flex items-center gap-2 rounded-full border border-cream-200 bg-white/90 p-1 shadow-sm">
          {SETTINGS_MENU_ITEMS.map((item) => (
            <Link
              key={item.id}
              href={SETTINGS_ROUTE_MAP[item.id]}
              className={`flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium whitespace-nowrap transition-all ${
                activeSection === item.id
                  ? 'bg-navy-700 text-white shadow-sm'
                  : 'text-warm-gray'
              }`}
            >
              <item.icon className={`w-4 h-4 ${activeSection === item.id ? 'text-gold-300' : ''}`} />
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-cream-100">
      <header className="bg-white/95 backdrop-blur-md border-b border-cream-200 sticky top-0 z-50 shadow-sm">
        <div className={`${isStandalone ? 'max-w-4xl' : 'max-w-6xl'} mx-auto px-4 sm:px-6 lg:px-8`}>
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard"
                className="flex items-center gap-2 text-warm-gray hover:text-navy-600 transition-colors cursor-pointer group"
              >
                <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
                <span className="text-sm font-medium">Back to App</span>
              </Link>
            </div>
            <div className="text-center">
              <h1 className="text-base font-semibold text-charcoal">{isStandalone ? activeItem.label : 'Settings'}</h1>
              {isStandalone && (
                <p className="text-[11px] text-warm-gray leading-none mt-0.5">{activeItem.description}</p>
              )}
            </div>
            <div className="w-24" />
          </div>
        </div>
      </header>

      <div className={`${isStandalone ? 'max-w-4xl' : 'max-w-6xl'} mx-auto px-4 sm:px-6 lg:px-8 ${isStandalone ? 'py-6 md:py-8' : 'py-4 md:py-8'}`}>
        {isStandalone ? (
          <div className="space-y-6">
            {standaloneNav}
            <div className="min-w-0">{sectionContent}</div>
          </div>
        ) : (
          <>
            <div className="md:hidden mb-4">
              <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
                {SETTINGS_MENU_ITEMS.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleSectionSelect(item.id)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-medium whitespace-nowrap transition-all cursor-pointer ${
                      activeSection === item.id
                        ? 'bg-navy-600 text-white shadow-md'
                        : 'bg-white text-charcoal border border-cream-200 hover:shadow-sm'
                    }`}
                  >
                    <item.icon className={`w-4 h-4 ${activeSection === item.id ? 'text-gold-300' : ''}`} />
                    {item.label}
                  </button>
                ))}
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-medium whitespace-nowrap text-red-500 bg-white border border-cream-200 hover:bg-red-50 transition-all cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  Log Out
                </button>
              </div>
            </div>

            <div className="flex gap-8">
              <div className="hidden md:block w-64 flex-shrink-0">
                <nav className="space-y-1.5">
                  {SETTINGS_MENU_ITEMS.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleSectionSelect(item.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-all cursor-pointer ${
                        activeSection === item.id
                          ? 'bg-navy-600 text-white shadow-md'
                          : 'text-charcoal hover:bg-white hover:shadow-sm'
                      }`}
                    >
                      <item.icon className={`w-5 h-5 ${activeSection === item.id ? 'text-gold-300' : ''}`} />
                      <div>
                        <p className="font-medium text-sm">{item.label}</p>
                        <p className={`text-xs ${activeSection === item.id ? 'text-navy-200' : 'text-warm-gray'}`}>
                          {item.description}
                        </p>
                      </div>
                    </button>
                  ))}
                </nav>

                <div className="mt-8 pt-8 border-t border-cream-200">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-red-500 hover:bg-red-50 hover:text-red-600 transition-all cursor-pointer"
                  >
                    <LogOut className="w-5 h-5" />
                    <span className="font-medium text-sm">Log Out</span>
                  </button>
                </div>
              </div>

              <div className="flex-1 min-w-0">{sectionContent}</div>
            </div>
          </>
        )}
      </div>

      <PasswordModal
        isOpen={showPasswordModal}
        onClose={() => {
          setShowPasswordModal(false);
          setPasswordError(null);
        }}
        onSubmit={handleChangePassword}
        isChanging={isChangingPassword || isLoadingAccounts}
        error={passwordError}
      />

      <DeleteConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDeleteAccount}
      />
    </div>
  );
}
