import { useEffect, useRef, useState } from 'react';
import {
  Search,
  PlusSquare,
  Zap,
  Activity,
  AlertTriangle,
  FileCheck
} from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAction: (actionKey: string) => void;
}

export default function CommandPalette({
  isOpen,
  onClose,
  onSelectAction
}: CommandPaletteProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Esc and Click outside listener
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);

    // Autofocus input on open
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const actions = [
    {
      key: 'task',
      label: 'Create new high-priority deadline',
      icon: PlusSquare,
      shortcut: 'N',
      category: 'General'
    },
    {
      key: 'panic',
      label: 'Activate Panic Mode Protocol',
      icon: Zap,
      shortcut: 'P',
      category: 'Critical'
    },
    {
      key: 'simulation',
      label: 'Run AI Risk Assessment Simulation',
      icon: Activity,
      shortcut: 'R',
      category: 'Intelligence'
    },
    {
      key: 'aws',
      label: 'Navigate to: AWS Architecture Planner',
      icon: FileCheck,
      shortcut: 'A',
      category: 'Navigation'
    },
    {
      key: 'risk',
      label: 'Navigate to: Risk Mitigation Logs',
      icon: AlertTriangle,
      shortcut: 'L',
      category: 'Navigation'
    }
  ];

  const filteredActions = actions.filter((act) =>
    act.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/65 backdrop-blur-md z-[100] flex items-start justify-center pt-32 select-none animate-in fade-in duration-200">
      <div
        ref={modalRef}
        className="w-full max-w-2xl glass-card rounded-2xl overflow-hidden shadow-2xl border border-outline/40 bg-surface-container-low/95 scale-100 animate-in zoom-in-95 duration-200"
      >
        {/* Search header bar */}
        <div className="p-4 flex items-center gap-4 border-b border-outline/30 bg-surface-container/30">
          <Search className="text-primary w-5 h-5 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            className="w-full bg-transparent border-none text-base text-white placeholder:text-on-surface-variant/30 outline-none focus:ring-0"
            placeholder="Type a command or search action..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <span className="px-2 py-0.5 bg-surface-container border border-outline/40 rounded text-[9px] font-mono text-on-surface-variant uppercase font-bold shrink-0">
            ESC
          </span>
        </div>

        {/* Command search list */}
        <div className="max-h-96 overflow-y-auto p-2.5">
          <div className="text-[9px] font-mono font-bold text-on-surface-variant/50 px-3 py-2 uppercase tracking-widest">
            Recent Actions &amp; Tools
          </div>

          <div className="space-y-1">
            {filteredActions.length > 0 ? (
              filteredActions.map((act) => {
                const Icon = act.icon;
                return (
                  <button
                    key={act.key}
                    onClick={() => {
                      onSelectAction(act.key);
                      onClose();
                    }}
                    className="w-full flex items-center gap-4 px-3 py-3 rounded-xl hover:bg-surface-container text-left transition-all duration-150 cursor-pointer group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-surface-container-high border border-outline/40 flex items-center justify-center group-hover:border-primary/20 group-hover:text-primary transition-colors shrink-0">
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="flex-1 text-xs font-sans font-medium text-on-surface group-hover:text-white transition-colors">
                      {act.label}
                    </span>
                    <span className="font-mono text-[9px] text-on-surface-variant/40 border border-outline px-1.5 py-0.5 rounded uppercase font-bold group-hover:border-primary/20 group-hover:text-primary/70 transition-all">
                      {act.shortcut}
                    </span>
                  </button>
                );
              })
            ) : (
              <p className="text-xs text-on-surface-variant/50 text-center py-6 font-sans">
                No matching tools or action guidelines found.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
