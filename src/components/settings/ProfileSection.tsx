'use client';

import { useState } from 'react';
import { User, Mail, Phone, MapPin, Camera, Save, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

interface ProfileData {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  photoUrl: string | null;
}

interface ProfileSectionProps {
  formData: ProfileData;
  onChange: (data: Partial<ProfileData>) => void;
  onSave: () => Promise<void>;
  onPhotoUpload: (file: File) => Promise<void>;
  onPhotoRemove: () => Promise<void>;
  isSaving: boolean;
  saveSuccess: boolean;
}

export function ProfileSection({
  formData,
  onChange,
  onSave,
  onPhotoUpload,
  onPhotoRemove,
  isSaving,
  saveSuccess,
}: ProfileSectionProps) {
  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await onPhotoUpload(file);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-charcoal">Profile Information</h2>
        <p className="text-sm text-warm-gray mt-1">
          Update your personal details and profile photo
        </p>
      </div>

      {/* Profile Photo */}
      <Card className="p-6 rounded-2xl border-cream-200 shadow-sm">
        <h3 className="text-sm font-semibold text-charcoal mb-4">Profile Photo</h3>
        <div className="flex items-center gap-6">
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-cream-100 flex items-center justify-center overflow-hidden ring-4 ring-gold-100/50">
              {formData.photoUrl ? (
                <img src={formData.photoUrl} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <User className="w-10 h-10 text-warm-gray" />
              )}
            </div>
            <label className="absolute bottom-0 right-0 p-2 bg-gradient-to-br from-navy-600 to-navy-700 rounded-full text-white hover:from-navy-700 hover:to-navy-800 transition-all cursor-pointer shadow-lg">
              <Camera className="w-4 h-4" />
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoChange}
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
                onClick={onPhotoRemove}
                className="text-xs text-red-500 hover:text-red-600 mt-2 cursor-pointer"
              >
                Remove photo
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* Personal Information */}
      <Card className="p-6 rounded-2xl border-cream-200 shadow-sm">
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
                onChange={(e) => onChange({ fullName: e.target.value })}
                placeholder="Enter your full name"
                className="w-full pl-10 pr-4 py-2.5 border border-cream-200 rounded-xl bg-white focus:border-gold-400 focus:ring-2 focus:ring-gold-100 focus:outline-none transition-all"
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
                onChange={(e) => onChange({ email: e.target.value })}
                placeholder="your@email.com"
                className="w-full pl-10 pr-4 py-2.5 border border-cream-200 rounded-xl bg-white focus:border-gold-400 focus:ring-2 focus:ring-gold-100 focus:outline-none transition-all"
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
                onChange={(e) => onChange({ phone: e.target.value })}
                placeholder="+1 (555) 000-0000"
                className="w-full pl-10 pr-4 py-2.5 border border-cream-200 rounded-xl bg-white focus:border-gold-400 focus:ring-2 focus:ring-gold-100 focus:outline-none transition-all"
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
                onChange={(e) => onChange({ location: e.target.value })}
                placeholder="City, Country"
                className="w-full pl-10 pr-4 py-2.5 border border-cream-200 rounded-xl bg-white focus:border-gold-400 focus:ring-2 focus:ring-gold-100 focus:outline-none transition-all"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          {saveSuccess && (
            <span className="flex items-center gap-1.5 text-sm text-gold-600">
              <Check className="w-4 h-4" />
              Changes saved
            </span>
          )}
          <Button
            variant="primary"
            onClick={onSave}
            isLoading={isSaving}
          >
            <Save className="w-4 h-4 mr-2" />
            Save Changes
          </Button>
        </div>
      </Card>
    </div>
  );
}
