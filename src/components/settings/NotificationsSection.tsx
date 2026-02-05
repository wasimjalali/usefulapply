'use client';

import { Card } from '@/components/ui/Card';

interface NotificationPreferences {
  tips: boolean;
  updates: boolean;
  weekly: boolean;
  marketing: boolean;
}

interface NotificationsSectionProps {
  notifications: NotificationPreferences;
  onChange: (key: keyof NotificationPreferences, value: boolean) => Promise<void>;
}

export function NotificationsSection({ notifications, onChange }: NotificationsSectionProps) {
  const notificationItems = [
    { id: 'tips' as const, label: 'Tips & Tutorials', description: 'Get helpful tips to improve your applications' },
    { id: 'updates' as const, label: 'Product Updates', description: 'Be the first to know about new features' },
    { id: 'weekly' as const, label: 'Weekly Summary', description: 'Receive a weekly summary of your activity' },
    { id: 'marketing' as const, label: 'Marketing', description: 'Promotional offers and announcements' },
  ];

  return (
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
          {notificationItems.map((item) => (
            <div key={item.id} className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium text-charcoal">{item.label}</p>
                <p className="text-xs text-warm-gray">{item.description}</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={notifications[item.id]}
                  onChange={(e) => onChange(item.id, e.target.checked)}
                />
                <div className="w-11 h-6 bg-cream-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-navy-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-navy-600"></div>
              </label>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
