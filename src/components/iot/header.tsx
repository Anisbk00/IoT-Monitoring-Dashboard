'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  Cpu,
  Menu,
  LogOut,
  Settings,
  Bell,
  User,
  Radio,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useAppStore } from '@/lib/store';
import { createClient } from '@/lib/supabase/client';

export function Header() {
  const { user, isRealtimeConnected, alerts, setCurrentView, clearAuth } = useAppStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const unacknowledgedAlerts = alerts.filter((a) => !a.acknowledged).length;

  const navItems = [
    { id: 'dashboard' as const, label: 'Dashboard', icon: Activity },
    { id: 'devices' as const, label: 'Devices', icon: Cpu },
    { id: 'alerts' as const, label: 'Alerts', icon: Bell },
    { id: 'simulator' as const, label: 'Simulator', icon: Radio },
    { id: 'settings' as const, label: 'Settings', icon: Settings },
  ];

  const handleNavClick = (view: 'dashboard' | 'devices' | 'alerts' | 'simulator' | 'settings') => {
    setCurrentView(view);
    setMobileMenuOpen(false);
  };

  const handleLogout = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      // Continue with local cleanup even if signOut fails
    }
    clearAuth();
  };

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() || 'U';

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
      <div className="flex h-14 items-center px-4 md:px-6 gap-4">
        {/* Mobile hamburger */}
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="p-4 border-b">
              <SheetTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-emerald-500" />
                IoT Monitor
              </SheetTitle>
            </SheetHeader>
            <nav className="p-2">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className="flex items-center gap-3 w-full rounded-lg px-3 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                  {item.id === 'alerts' && unacknowledgedAlerts > 0 && (
                    <Badge variant="destructive" className="ml-auto text-xs px-1.5 py-0.5">
                      {unacknowledgedAlerts}
                    </Badge>
                  )}
                </button>
              ))}
            </nav>
          </SheetContent>
        </Sheet>

        {/* Logo */}
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-emerald-500" />
          <span className="font-semibold text-lg hidden sm:inline">IoT Monitor</span>
          <span className="font-semibold text-base sm:hidden">IoT</span>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Connection Status */}
        <div className="flex items-center gap-2 text-sm">
          <div className="flex items-center gap-1.5">
            <motion.div
              animate={{
                scale: isRealtimeConnected ? [1, 1.2, 1] : 1,
                opacity: isRealtimeConnected ? [0.7, 1, 0.7] : 0.5,
              }}
              transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
              className={`h-2 w-2 rounded-full ${
                isRealtimeConnected ? 'bg-emerald-500' : 'bg-red-500'
              }`}
            />
            <span className="text-muted-foreground text-xs hidden sm:inline">
              {isRealtimeConnected ? 'Live' : 'Offline'}
            </span>
          </div>
        </div>

        {/* Alerts indicator */}
        {unacknowledgedAlerts > 0 && (
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            onClick={() => setCurrentView('alerts')}
          >
            <Bell className="h-4 w-4" />
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground flex items-center justify-center">
              {unacknowledgedAlerts > 9 ? '9+' : unacknowledgedAlerts}
            </span>
          </Button>
        )}

        {/* User Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 px-2">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-emerald-600/20 text-emerald-600 text-xs">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium hidden sm:inline max-w-[120px] truncate">
                {user?.name || user?.email}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem className="flex items-center gap-2 text-muted-foreground">
              <User className="h-4 w-4" />
              {user?.email}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setCurrentView('settings')}>
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
