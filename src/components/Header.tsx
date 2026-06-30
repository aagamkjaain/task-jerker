import { useState } from 'react';
import { Bell, ChevronDown, Settings, LogOut, User } from 'lucide-react';
import { ScreenType, TaskType } from '../types';

interface HeaderProps {
  tasks: TaskType[];
  session: any;
  onSignOut: () => void;
  onScreenChange: (screen: ScreenType) => void;
}

export default function Header({
  tasks = [],
  session,
  onSignOut,
  onScreenChange
}: HeaderProps) {
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const remainingTasks = tasks.filter((t) => t.progress !== 100);
  const hasRemaining = remainingTasks.length > 0;

  const handleBellClick = () => {
    if (hasRemaining) {
      setIsNotifOpen(!isNotifOpen);
      setIsProfileOpen(false);
    }
  };

  const handleProfileClick = () => {
    setIsProfileOpen(!isProfileOpen);
    setIsNotifOpen(false);
  };

  return (
    <header className="h-16 flex justify-between items-center w-full px-10 py-3 sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-outline/40 select-none">
      {/* Click Outside Dismissal Backdrop */}
      {(isNotifOpen || isProfileOpen) && (
        <div
          className="fixed inset-0 z-40 bg-transparent cursor-default"
          onClick={() => {
            setIsNotifOpen(false);
            setIsProfileOpen(false);
          }}
        />
      )}

      {/* Spacer to push actions to the right, since search bar is removed */}
      <div className="flex-1" />

      {/* Header Actions */}
      <div className="flex items-center gap-4 ml-6 relative z-50">
        {/* Notifications Alert button */}
        <div className="relative">
          <button
            onClick={handleBellClick}
            className={`p-2 rounded-lg text-on-surface-variant transition-all relative ${
              hasRemaining
                ? 'hover:text-primary hover:bg-surface-container-high/40 cursor-pointer'
                : 'opacity-50 cursor-default'
            }`}
            title={hasRemaining ? `You have ${remainingTasks.length} remaining tasks` : 'No remaining tasks'}
          >
            <Bell className="w-4.5 h-4.5" />
            {hasRemaining && (
              <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-tertiary rounded-full ring-2 ring-background animate-pulse"></span>
            )}
          </button>

          {/* Notifications Dropdown */}
          {isNotifOpen && hasRemaining && (
            <div className="absolute right-0 mt-2 w-80 bg-surface-container-high border border-outline/30 rounded-xl shadow-2xl p-4 z-50 text-left animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="flex items-center justify-between pb-2.5 border-b border-outline/20 mb-2">
                <h4 className="font-sans font-bold text-sm text-white flex items-center gap-2">
                  <Bell className="w-4 h-4 text-primary" />
                  <span>Remaining Tasks</span>
                </h4>
                <span className="px-2 py-0.5 bg-primary/10 border border-primary/20 text-[10px] font-mono text-primary rounded-full font-bold">
                  {remainingTasks.length} left
                </span>
              </div>
              <div className="max-h-60 overflow-y-auto no-scrollbar space-y-2">
                {remainingTasks.map((task) => {
                  const statusColor =
                    task.status === 'critical'
                      ? 'bg-error'
                      : task.status === 'normal'
                      ? 'bg-primary'
                      : 'bg-outline/65';
                  return (
                    <div
                      key={task.id}
                      className="p-2.5 bg-surface-container/60 hover:bg-surface-container-highest/60 border border-outline/10 rounded-lg transition-all flex flex-col gap-1.5 cursor-pointer"
                      onClick={() => {
                        setIsNotifOpen(false);
                        onScreenChange('dashboard');
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusColor}`} title={`${task.status} priority`} />
                          <span className="font-sans font-medium text-xs text-white truncate" title={task.title}>
                            {task.title}
                          </span>
                        </div>
                        <span className="font-mono text-[9px] text-on-surface-variant shrink-0 font-bold">
                          {task.progress || 0}%
                        </span>
                      </div>
                      <div className="flex justify-between items-center gap-2">
                        <span className="font-mono text-[9px] text-on-surface-variant truncate">
                          {task.project || 'No Project'}
                        </span>
                        {task.status === 'critical' && (
                          <span className="font-mono text-[8px] bg-error/10 border border-error/20 text-error px-1 rounded uppercase font-bold shrink-0">
                            Critical
                          </span>
                        )}
                      </div>
                      <div className="w-full bg-outline/10 h-1 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all duration-300"
                          style={{ width: `${task.progress || 0}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Profile Dropdown Container */}
        <div className="relative">
          <button
            onClick={handleProfileClick}
            className="flex items-center gap-2 p-1 pr-3 rounded-full border border-outline/30 hover:bg-surface-container-high transition-colors cursor-pointer bg-surface-container/30"
          >
            <div className="w-6 h-6 rounded-full bg-secondary-container shrink-0 border border-secondary/30 flex items-center justify-center font-mono text-[10px] text-secondary font-bold">
              {session?.user?.email?.charAt(0).toUpperCase() || 'AC'}
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-on-surface-variant" />
          </button>

          {isProfileOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-surface-container-high border border-outline/30 rounded-xl shadow-2xl p-4 z-50 text-left animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="flex items-center gap-3 mb-3 pb-3 border-b border-outline/20">
                <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
                  <span className="font-sans font-bold text-sm text-primary">
                    {session?.user?.email?.charAt(0).toUpperCase() || 'AC'}
                  </span>
                </div>
                <div className="flex flex-col overflow-hidden">
                  <span className="font-sans font-semibold text-xs text-white truncate">
                    {session?.user?.email?.split('@')[0] || 'Guest Account'}
                  </span>
                  <span className="font-sans text-[10px] text-on-surface-variant truncate">
                    {session?.user?.email || 'Not signed in'}
                  </span>
                </div>
              </div>
              <div className="space-y-1">
                <button
                  onClick={() => {
                    setIsProfileOpen(false);
                    onScreenChange('settings');
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-on-surface-variant hover:text-white hover:bg-surface-container-highest/50 transition-colors text-left cursor-pointer"
                >
                  <Settings className="w-4 h-4" />
                  <span>Account Settings</span>
                </button>
                {session?.user ? (
                  <button
                    onClick={() => {
                      setIsProfileOpen(false);
                      onSignOut();
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-error/85 hover:text-error hover:bg-error/10 transition-colors text-left cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setIsProfileOpen(false);
                      onScreenChange('landing');
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-primary hover:text-white hover:bg-primary/10 transition-colors text-left cursor-pointer"
                  >
                    <User className="w-4 h-4" />
                    <span>Go to Login</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
