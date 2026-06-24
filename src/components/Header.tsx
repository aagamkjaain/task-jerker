import { Search, Bell, Zap, ChevronDown } from 'lucide-react';

interface HeaderProps {
  placeholder?: string;
  onSearchFocus?: () => void;
  searchValue?: string;
  onSearchChange?: (val: string) => void;
}

export default function Header({
  placeholder = 'Search tasks, intelligence, or files...',
  onSearchFocus,
  searchValue = '',
  onSearchChange
}: HeaderProps) {
  return (
    <header className="h-16 flex justify-between items-center w-full px-10 py-3 sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-outline/40 select-none">
      {/* Universal Search Input */}
      <div className="flex items-center flex-1 max-w-xl">
        <div className="relative w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant w-4 h-4" />
          <input
            type="text"
            className="w-full bg-surface-container-low border border-outline/60 rounded-full pl-11 pr-4 py-2 text-sm text-white placeholder:text-on-surface-variant/50 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
            placeholder={placeholder}
            onFocus={onSearchFocus}
            value={searchValue}
            onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
          />
        </div>
      </div>

      {/* Header Actions */}
      <div className="flex items-center gap-4 ml-6">
        {/* Notifications Alert button */}
        <button className="p-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container-high/40 transition-all relative cursor-pointer">
          <Bell className="w-4.5 h-4.5" />
          <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-tertiary rounded-full ring-2 ring-background"></span>
        </button>

        {/* Quick Action Button */}
        <button className="p-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container-high/40 transition-all cursor-pointer">
          <Zap className="w-4.5 h-4.5" />
        </button>

        {/* Profile Dropdown */}
        <button className="flex items-center gap-2 p-1 pr-3 rounded-full border border-outline/30 hover:bg-surface-container-high transition-colors cursor-pointer bg-surface-container/30">
          <div className="w-6 h-6 rounded-full bg-secondary-container shrink-0 border border-secondary/30 flex items-center justify-center font-mono text-[10px] text-secondary font-bold">
            AC
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-on-surface-variant" />
        </button>
      </div>
    </header>
  );
}
