'use client';

import { useState } from 'react';
import { Shield, Loader2, Trash2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

interface AccountSectionProps {
  onChangePassword: () => void;
  onDeleteAccount: () => void;
}

export function AccountSection({
  onChangePassword,
  onDeleteAccount,
}: AccountSectionProps) {

  return (
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
          <Button variant="outline" size="sm" onClick={onChangePassword}>
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
            onClick={onDeleteAccount}
          >
            <Trash2 className="w-4 h-4 mr-1" />
            Delete
          </Button>
        </div>
      </Card>
    </div>
  );
}

export function PasswordModal({
  isOpen,
  onClose,
  onSubmit,
  isChanging,
  error,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (newPassword: string, confirmPassword: string) => Promise<void>;
  isChanging: boolean;
  error: string | null;
}) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async () => {
    await onSubmit(newPassword, confirmPassword);
    setNewPassword('');
    setConfirmPassword('');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md p-6 m-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-navy-100 rounded-full">
            <Shield className="w-6 h-6 text-navy-600" />
          </div>
          <h3 className="text-lg font-semibold text-charcoal">Change Password</h3>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">
              New Password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              className="w-full px-4 py-2.5 border border-cream-300 rounded-lg focus:border-navy-500 focus:ring-1 focus:ring-navy-500 focus:outline-none transition-colors"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              className="w-full px-4 py-2.5 border border-cream-300 rounded-lg focus:border-navy-500 focus:ring-1 focus:ring-navy-500 focus:outline-none transition-colors"
            />
          </div>
          
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          
          <p className="text-xs text-warm-gray">
            Password must be at least 8 characters long.
          </p>
        </div>
        
        <div className="flex gap-3 justify-end mt-6">
          <Button 
            variant="outline" 
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button 
            variant="primary"
            onClick={handleSubmit}
            isLoading={isChanging}
          >
            Change Password
          </Button>
        </div>
      </Card>
    </div>
  );
}

export function DeleteConfirmModal({
  isOpen,
  onClose,
  onConfirm,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  if (!isOpen) return null;

  return (
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
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            variant="primary" 
            className="bg-red-600 hover:bg-red-700"
            onClick={onConfirm}
          >
            <Trash2 className="w-4 h-4 mr-1" />
            Delete Account
          </Button>
        </div>
      </Card>
    </div>
  );
}
