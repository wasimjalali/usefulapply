'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, User, Shield, CreditCard, Bell, LogOut, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { ProfileSection } from '@/components/settings/ProfileSection';
import { AccountSection, PasswordModal, DeleteConfirmModal } from '@/components/settings/AccountSection';
import { SubscriptionSection } from '@/components/settings/SubscriptionSection';
import { NotificationsSection } from '@/components/settings/NotificationsSection';
import { uploadAvatar, deleteAvatar } from '@/lib/supabase/storage';
import { 
  getConnectedAccounts, 
  disconnectAccount, 
  getSubscription,
  changePassword,
  connectOAuthProvider,
  deleteUserAccount,
  type ConnectedAccount,
  type Subscription,
} from '@/lib/supabase';
import { getUserCredits, type UserCredits } from '@/lib/supabase/credits';

type SectionType = 'profile' | 'account' | 'subscription' | 'notifications';

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
  const [activeSection, setActiveSection] = useState<SectionType>('profile');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);
  
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [userCredits, setUserCredits] = useState<UserCredits | null>(null);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isConnectingOAuth, setIsConnectingOAuth] = useState<string | null>(null);
  
  const [notifications, setNotifications] = useState({
    tips: true,
    updates: true,
    weekly: true,
    marketing: false,
  });

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
        const [accounts, sub, creditsResult] = await Promise.all([
          getConnectedAccounts(authUser.id),
          getSubscription(authUser.id),
          getUserCredits(authUser.id),
        ]);
        setConnectedAccounts(accounts);
        setSubscription(sub);
        if (creditsResult.credits) {
          setUserCredits(creditsResult.credits);
        }
      } catch (error) {
        console.error('Error loading account data:', error);
      } finally {
        setIsLoadingAccounts(false);
      }
    };
    
    loadAccountData();
  }, [authUser]);

  useEffect(() => {
    if (!authLoading && !authUser) {
      router.push('/auth/login');
    }
  }, [authLoading, authUser, router]);

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

    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
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
      const { error } = await deleteUserAccount(authUser.id);
      
      if (error) {
        alert('Failed to delete account: ' + error.message);
        return;
      }
      
      localStorage.removeItem('job-copilot-storage');
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

  const handleConnectOAuth = async (provider: 'google' | 'linkedin') => {
    setIsConnectingOAuth(provider);
    const oauthProvider = provider === 'linkedin' ? 'linkedin_oidc' : 'google';
    const { error } = await connectOAuthProvider(oauthProvider);
    if (error) {
      alert('Failed to connect: ' + error.message);
      setIsConnectingOAuth(null);
    }
  };

  const handleDisconnectAccount = async (provider: 'google' | 'linkedin') => {
    if (!authUser) return;
    
    const { error } = await disconnectAccount(authUser.id, provider);
    if (error) {
      alert('Failed to disconnect: ' + error.message);
    } else {
      setConnectedAccounts(prev => prev.filter(a => a.provider !== provider));
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
    return (
      <div className="min-h-screen bg-cream-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-navy-600" />
      </div>
    );
  }

  const subscriptionTier = userCredits?.plan_tier || subscription?.tier || profile?.subscription_tier || 'starter' as string;

  const menuItems = [
    { id: 'profile' as const, label: 'Profile', icon: User, description: 'Your personal information' },
    { id: 'account' as const, label: 'Account', icon: Shield, description: 'Security and login settings' },
    { id: 'subscription' as const, label: 'Subscription', icon: CreditCard, description: 'Manage your plan' },
    { id: 'notifications' as const, label: 'Notifications', icon: Bell, description: 'Email preferences' },
  ];

  return (
    <div className="min-h-screen bg-cream-100">
      <header className="bg-white border-b border-cream-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link 
                href="/dashboard"
                className="flex items-center gap-2 text-warm-gray hover:text-charcoal transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" />
                <span className="text-sm font-medium">Back to App</span>
              </Link>
            </div>
            <h1 className="text-lg font-semibold text-charcoal">Settings</h1>
            <div className="w-24" />
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
                  onClick={() => setActiveSection(item.id)}
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
            {activeSection === 'profile' && (
              <ProfileSection
                formData={formData}
                onChange={(data) => setFormData(prev => ({ ...prev, ...data }))}
                onSave={handleSave}
                onPhotoUpload={handlePhotoUpload}
                onPhotoRemove={handleRemovePhoto}
                isSaving={isSaving}
                saveSuccess={saveSuccess}
              />
            )}

            {activeSection === 'account' && (
              <AccountSection
                connectedAccounts={connectedAccounts}
                isLoadingAccounts={isLoadingAccounts}
                onChangePassword={() => setShowPasswordModal(true)}
                onConnectOAuth={handleConnectOAuth}
                onDisconnectAccount={handleDisconnectAccount}
                onDeleteAccount={() => setShowDeleteConfirm(true)}
                isConnectingOAuth={isConnectingOAuth}
              />
            )}

            {activeSection === 'subscription' && (
              <SubscriptionSection
                subscriptionTier={subscriptionTier}
                userCredits={userCredits}
              />
            )}

            {activeSection === 'notifications' && (
              <NotificationsSection
                notifications={notifications}
                onChange={handleNotificationChange}
              />
            )}
          </div>
        </div>
      </div>

      <PasswordModal
        isOpen={showPasswordModal}
        onClose={() => {
          setShowPasswordModal(false);
          setPasswordError(null);
        }}
        onSubmit={handleChangePassword}
        isChanging={isChangingPassword}
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
