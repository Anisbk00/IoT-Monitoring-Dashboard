'use client';

import {
  LayoutDashboard,
  Cpu,
  AlertTriangle,
  Settings,
  Radio,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/lib/store';
import type { ViewMode } from '@/lib/types';
import { Badge } from '@/components/ui/badge';

const navItems: { id: ViewMode; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'devices', label: 'Devices', icon: Cpu },
  { id: 'alerts', label: 'Alerts', icon: AlertTriangle },
  { id: 'simulator', label: 'Simulator', icon: Radio },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const { currentView, setCurrentView, alerts } = useAppStore();
  const unacknowledgedAlerts = alerts.filter((a) => !a.acknowledged).length;

  return (
    <aside className="hidden md:flex w-56 flex-col border-r bg-card/50 min-h-0 shrink-0">
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentView(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-emerald-600/15 text-emerald-600 dark:text-emerald-400 shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              )}
            >
              <item.icon
                className={cn(
                  'h-4 w-4 shrink-0',
                  isActive && 'text-emerald-600 dark:text-emerald-400'
                )}
              />
              <span className="flex-1 text-left">{item.label}</span>
              {item.id === 'alerts' && unacknowledgedAlerts > 0 && (
                <Badge
                  variant="destructive"
                  className="text-[10px] px-1.5 py-0 h-5 min-w-[20px] flex items-center justify-center"
                >
                  {unacknowledgedAlerts}
                </Badge>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom info */}
      <div className="p-3 border-t">
        <div className="text-xs text-muted-foreground space-y-1">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span>System Operational</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
