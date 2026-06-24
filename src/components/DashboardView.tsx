import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  AlertTriangle,
  ArrowRight,
  Play,
  CheckCircle,
  CalendarDays,
  Clock,
  Check,
  Pause,
  RefreshCw
} from 'lucide-react';
import { TaskType, RiskAlert } from '../types';
import { generateScopeReduction, getApiKey } from '../services/gemini';

interface DashboardViewProps {
  onNavigate: (screen: 'intelligence' | 'panicMode' | 'riskCenter') => void;
  tasks: TaskType[];
  setTasks: React.Dispatch<React.SetStateAction<TaskType[]>>;
  activeSessionTaskId: string | null;
  setActiveSessionTaskId: (id: string | null) => void;
  sessionActive: boolean;
  setSessionActive: (active: boolean) => void;
  sessionTime: number;
  setSessionTime: (time: number | ((prev: number) => number)) => void;
}

export default function DashboardView({
  onNavigate,
  tasks,
  setTasks,
  activeSessionTaskId,
  setActiveSessionTaskId,
  sessionActive,
  setSessionActive,
  sessionTime,
  setSessionTime
}: DashboardViewProps) {
  // Local states for interactive items
  const [appliedAIChanges, setAppliedAIChanges] = useState(false);
  const [checkedAlerts, setCheckedAlerts] = useState<string[]>([]);
  
  // Anti-procrastination states
  const [scopeTrimming, setScopeTrimming] = useState(false);
  const [trimJustification, setTrimJustification] = useState<string | null>(null);

  // Local Alerts
  const [alerts, setAlerts] = useState<RiskAlert[]>([
    { id: 'a1', title: 'Client Feedback Loop', timeStatus: '3h overdue • Escalation risk: High', level: 'high' },
    { id: 'a2', title: 'Security Audit Logs', timeStatus: 'Due in 2h • Dependencies pending', level: 'medium' }
  ]);

  const formatSessionTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const formatCountdown = (secs: number) => {
    const h = Math.floor(secs / 3600).toString().padStart(2, '0');
    const m = Math.floor((secs % 3600) / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  const toggleAlert = (id: string) => {
    if (checkedAlerts.includes(id)) {
      setCheckedAlerts(checkedAlerts.filter((item) => item !== id));
    } else {
      setCheckedAlerts([...checkedAlerts, id]);
    }
  };

  // Find highly postponed tasks (Feature 5: Anti-procrastination)
  const highlyPostponedTask = tasks.find(t => (t.postponedCount || 0) >= 3);
  const hasApiKey = !!getApiKey();

  const handlePostponeTask = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // prevent starting focus session
    
    // Optimistic UI update
    setTasks(prevTasks => prevTasks.map(t => {
      if (t.id === taskId) {
        return {
          ...t,
          postponedCount: (t.postponedCount || 0) + 1,
          countdownSeconds: t.countdownSeconds + 3600 // Delay countdown by 1 hour
        };
      }
      return t;
    }));

    try {
      const { postponeTask, isSupabaseConfigured } = await import('../services/supabase');
      if (isSupabaseConfigured()) {
        await postponeTask(taskId);
      }
    } catch (err) {
      console.error('Failed to sync postponed task state to Supabase:', err);
    }
  };

  const handleReduceScope = async (taskId: string) => {
    const targetTask = tasks.find(t => t.id === taskId);
    if (!targetTask) return;

    setScopeTrimming(true);
    setTrimJustification(null);
    try {
      const subtaskStrings = targetTask.subtasks?.map(st => st.text) || [];
      const result = await generateScopeReduction(targetTask.title, subtaskStrings);
      
      const trimmedSubtasks = result.subtasks.map(text => ({ text, completed: false }));

      const { supabase, isSupabaseConfigured } = await import('../services/supabase');
      if (isSupabaseConfigured()) {
        await supabase
          .from('tasks')
          .update({
            subtasks: trimmedSubtasks,
            progress: 0,
            postponed_count: 0
          })
          .eq('id', taskId);
      }

      setTasks(prevTasks => prevTasks.map(t => {
        if (t.id === taskId) {
          return {
            ...t,
            subtasks: trimmedSubtasks,
            postponedCount: 0, // Reset postponement count
            progress: 0
          };
        }
        return t;
      }));
      setTrimJustification(result.justification);
    } catch (err: any) {
      alert(err.message || 'Error occurred during scope trim generation.');
    } finally {
      setScopeTrimming(false);
    }
  };

  // Select the focus task: either the active session task, or the highest priority task (first sorted item)
  const focusTask = tasks.find(t => t.id === activeSessionTaskId) || tasks[0];

  const handleStartSession = () => {
    if (!focusTask) return;
    if (sessionActive) {
      setSessionActive(false);
    } else {
      setActiveSessionTaskId(focusTask.id);
      setSessionTime(0);
      setSessionActive(true);
    }
  };

  const handleApplyAIChanges = () => {
    setAppliedAIChanges(true);
    // Optimizing schedule shifts countdown of tasks to resolve risk overlap
    setTasks(prev => prev.map(t => {
      if (t.status === 'critical') {
        // AI extends critical paths slightly or resolves conflict by delaying deferred items
        return { ...t, countdownSeconds: t.countdownSeconds + 3600 * 2 };
      }
      return t;
    }));
  };

  return (
    <div className="space-y-10 pb-20 select-none animate-in fade-in duration-500">
      
      {/* Dynamic Session HUD banner when active */}
      {sessionActive && focusTask && (
        <div className="bg-primary/10 border-y border-primary/30 py-3 px-10 -mx-10 flex justify-between items-center animate-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-secondary animate-pulse"></span>
            <span className="font-mono text-xs font-semibold text-primary uppercase tracking-wider">
              Active Focus Session: {focusTask.title}
            </span>
          </div>
          <div className="flex items-center gap-6">
            <span className="font-mono text-sm font-bold text-white">
              Elapsed: {formatSessionTime(sessionTime)}
            </span>
            <button
              onClick={() => {
                setSessionActive(false);
                setSessionTime(0);
              }}
              className="text-xs bg-error/20 hover:bg-error/30 text-error font-semibold px-3 py-1 rounded transition-colors cursor-pointer"
            >
              Stop Session
            </button>
          </div>
        </div>
      )}

      {/* Anti-procrastination Overlay warning (Feature 5) */}
      {highlyPostponedTask && (
        <div className="bg-error/10 border border-error/30 p-6 rounded-2xl animate-in slide-in-from-top-4 duration-300 space-y-4">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-error/20 rounded-xl flex items-center justify-center border border-error/30 shrink-0">
              <AlertTriangle className="text-error w-5 h-5 animate-bounce" />
            </div>
            <div className="flex-1 space-y-1">
              <h4 className="font-sans text-sm font-bold text-white uppercase tracking-wider">
                Procrastination Warning Detect
              </h4>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                You have postponed "<span className="text-error font-semibold">{highlyPostponedTask.title}</span>" {highlyPostponedTask.postponedCount} times. At your current pace, you risk missing the target milestone.
              </p>
            </div>
            
            <button
              onClick={() => handleReduceScope(highlyPostponedTask.id)}
              disabled={!hasApiKey || scopeTrimming}
              className="py-2.5 px-5 bg-error hover:brightness-110 text-on-error font-sans font-bold text-xs rounded-xl shadow-lg shadow-error/20 active:scale-95 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-40"
            >
              {scopeTrimming ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Trimming Scope...</span>
                </>
              ) : (
                <span>Auto-Reduce Scope (AI)</span>
              )}
            </button>
          </div>

          {trimJustification && (
            <div className="bg-surface-container/40 p-4 border border-outline/30 rounded-xl text-xs text-secondary font-mono italic animate-in fade-in duration-300">
              💡 Coach: "{trimJustification}"
            </div>
          )}
        </div>
      )}

      {/* Greeting & Productivity Section */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        <div className="lg:col-span-8">
          <h2 className="font-sans text-white text-3xl font-bold tracking-tight mb-3">
            Good morning, Alex.
          </h2>
          <p className="text-on-surface-variant text-base leading-relaxed max-w-2xl">
            You have{' '}
            <button
              onClick={() => onNavigate('panicMode')}
              className="text-error font-bold underline decoration-2 underline-offset-4 hover:text-error/80 transition-colors cursor-pointer bg-transparent border-none p-0 inline"
            >
              3 high-priority deadlines
            </button>{' '}
            pending. DeadlineOS has prioritized your active work blocks dynamically.
          </p>
        </div>

        {/* Productivity Circle Score widget */}
        <div className="lg:col-span-4 flex justify-end">
          <div className="glass-card p-5 rounded-2xl flex items-center gap-5 w-fit bg-surface-container/40">
            <div className="relative w-16 h-16 shrink-0">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  className="text-surface-container-highest"
                  cx="32"
                  cy="32"
                  fill="transparent"
                  r="28"
                  stroke="currentColor"
                  strokeWidth="3.5"
                ></circle>
                <circle
                  className="text-secondary transition-all duration-1000"
                  cx="32"
                  cy="32"
                  fill="transparent"
                  r="28"
                  stroke="currentColor"
                  strokeDasharray="175.9"
                  strokeDashoffset={175.9 * (1 - 0.88)}
                  strokeWidth="3.5"
                ></circle>
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="font-mono text-sm font-bold text-secondary">88%</span>
              </div>
            </div>
            <div>
              <p className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider">
                Productivity Score
              </p>
              <p className="text-sm text-white font-semibold mt-0.5">
                +12% from yesterday
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Main Bento Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Today's Focus Card & Alerts/AI Panels */}
        <div className="lg:col-span-8 flex flex-col gap-8">
          
          {/* Today's Focus Card */}
          {focusTask ? (
            <div className="glass-card rounded-2xl overflow-hidden group border border-outline/40 hover:border-primary/50 transition-all duration-500">
              <div className="relative h-60 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-10"></div>
                <img
                  className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-700 font-sans"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuBKRNCEnW-EvJfJjgil554axICuX1f5dg6iTFBbywE2wUUtle0Wh2df-VQdcQOYAVaMlLOM8_OkI6JQpXwxv9ZdTXYP1Fxu5-b2IgIU58dSjS4BX_kw-cwMP0J_T7Ro5jgMAzveYOs0Znou5YjhLFA3MQn2hhtvUEQSE01l1i9mqoJvOCofzAHPGL3_bWXjdX8rXEGRoAGhVlMZRiV2kqIeCIxmu7tRmAcwEf7XfxUgRgeH80hSjucrA4MQlYODNExRqjEkyhKSq2Yj"
                  alt="Task Infrastructure Planning Dashboard"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute top-4 left-4 z-20">
                  <span className={`px-3 py-1 text-on-primary font-mono text-[9px] font-bold rounded-full tracking-widest uppercase shadow ${
                    focusTask.status === 'critical' ? 'bg-error' : 'bg-primary'
                  }`}>
                    {focusTask.status === 'critical' ? 'CRITICAL PATH' : 'HIGHEST PRIORITY'}
                  </span>
                </div>
              </div>

              <div className="p-6 relative z-20 bg-surface-container/10">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h3 className="font-sans text-xl font-bold text-primary mb-1">
                      {focusTask.title}
                    </h3>
                    <p className="text-on-surface-variant text-xs">
                      Project: <span className="text-white font-semibold">{focusTask.project}</span> • Dynamic Priority Score: <span className="text-secondary font-mono font-semibold">{focusTask.priorityScore || 50}/100</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-[9px] text-on-surface-variant uppercase tracking-wider">
                      EST. TIME
                    </p>
                    <p className="font-sans text-xl font-bold text-white">
                      {Math.ceil(focusTask.countdownSeconds / 3600)}h
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  {/* Avatars */}
                  <div className="flex -space-x-2.5">
                    <div className="w-8 h-8 rounded-full border-2 border-background bg-surface-container-high flex items-center justify-center font-mono text-[9px] font-bold text-on-surface">
                      JD
                    </div>
                    <div className="w-8 h-8 rounded-full border-2 border-background bg-surface-container flex items-center justify-center font-mono text-[9px] font-bold text-primary">
                      AC
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="h-1 flex-1 bg-surface-container-highest rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-500"
                      style={{ width: `${focusTask.progress || 0}%` }}
                    ></div>
                  </div>
                  <span className="text-[10px] text-on-surface-variant font-mono">{focusTask.progress || 0}% Done</span>

                  {/* Action button */}
                  <button
                    onClick={handleStartSession}
                    className={`px-5 py-2.5 rounded-lg font-sans font-bold text-xs flex items-center gap-2 transition-all duration-300 active:scale-95 cursor-pointer shadow-lg ${
                      sessionActive && activeSessionTaskId === focusTask.id
                        ? 'bg-secondary text-on-secondary shadow-secondary/20 hover:brightness-110'
                        : 'bg-primary text-on-primary shadow-primary/20 hover:brightness-110'
                    }`}
                  >
                    {sessionActive && activeSessionTaskId === focusTask.id ? (
                      <>
                        <Pause className="w-3.5 h-3.5 fill-current" />
                        <span>Active Session</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Start Session</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="glass-card p-10 rounded-2xl border border-outline/30 text-center text-on-surface-variant italic">
              No tasks available. Create a new task to start planning.
            </div>
          )}

          {/* Grid: Risk Alerts & AI Strategist */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* Risk Alerts Panel */}
            <div className="glass-card rounded-2xl p-5 border-error/20 risk-glow-red flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle className="w-4 h-4 text-error animate-pulse" />
                  <h4 className="font-mono text-[10px] text-error font-bold uppercase tracking-wider">
                    Risk Alerts
                  </h4>
                </div>
                <div className="space-y-3">
                  {alerts.map((alert) => {
                    const isChecked = checkedAlerts.includes(alert.id);
                    return (
                      <div
                        key={alert.id}
                        onClick={() => toggleAlert(alert.id)}
                        className={`p-3 rounded border transition-all duration-200 cursor-pointer flex justify-between items-center ${
                          isChecked
                            ? 'bg-surface-container/30 border-outline/30 opacity-60'
                            : alert.level === 'high'
                            ? 'bg-error-container/10 border-error/30 hover:bg-error-container/15'
                            : 'bg-tertiary-container/10 border-tertiary/30 hover:bg-tertiary-container/15'
                        }`}
                      >
                        <div>
                          <p className={`font-sans text-xs font-semibold ${isChecked ? 'line-through text-on-surface-variant' : 'text-white'}`}>
                            {alert.title}
                          </p>
                          <p className="text-[10px] text-on-surface-variant mt-0.5">
                            {alert.timeStatus}
                          </p>
                        </div>
                        {isChecked && <Check className="w-3.5 h-3.5 text-secondary shrink-0" />}
                      </div>
                    );
                  })}
                </div>
              </div>
              <button
                onClick={() => onNavigate('panicMode')}
                className="mt-4 font-mono text-[10px] text-error flex items-center justify-between hover:underline pt-2 border-t border-outline/20 bg-transparent text-left cursor-pointer border-none"
              >
                <span>VISIT PANIC MITIGATION PANEL</span>
                <ArrowRight className="w-3 h-3 text-error" />
              </button>
            </div>

            {/* AI Strategist Recommendations Panel */}
            <div className="glass-card rounded-2xl p-5 border-primary/20 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <h4 className="font-mono text-[10px] text-primary font-bold uppercase tracking-wider">
                    AI Strategist
                  </h4>
                </div>
                {appliedAIChanges ? (
                  <div className="p-3 rounded bg-secondary-container/10 border border-secondary/30 text-xs text-on-surface-variant leading-relaxed animate-in zoom-in-95 duration-300">
                    <div className="flex items-center gap-2 text-secondary font-bold mb-1">
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>Mitigation Applied</span>
                    </div>
                    Dynamic rescheduling completes. Added buffer blocks to critical paths automatically to prevent deadline conflicts.
                  </div>
                ) : (
                  <p className="text-xs text-on-surface-variant leading-relaxed">
                    "Based on your current progress and velocity, I suggest applying schedule buffers to your critical projects. I will delay the Docker Port Audits task automatically."
                  </p>
                )}
              </div>
              <button
                disabled={appliedAIChanges}
                onClick={handleApplyAIChanges}
                className={`mt-4 font-mono text-[10px] flex items-center gap-1.5 pt-2 border-t border-outline/20 w-full transition-all bg-transparent border-none ${
                  appliedAIChanges
                    ? 'text-secondary/50 cursor-not-allowed'
                    : 'text-primary hover:underline cursor-pointer'
                }`}
              >
                <span>{appliedAIChanges ? 'Changes Applied' : 'Apply Schedule Changes'}</span>
                {!appliedAIChanges && <ArrowRight className="w-3 h-3 text-primary" />}
              </button>
            </div>

          </div>
        </div>

        {/* Right Column: Sidebar (Upcoming Deadlines & Weekly Velocity chart) */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="flex items-center justify-between px-1">
            <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              Task Priority Queue
            </h3>
            <button
              onClick={() => onNavigate('intelligence')}
              className="text-primary font-mono text-[10px] font-semibold hover:underline flex items-center gap-1 cursor-pointer bg-transparent border-none"
            >
              <CalendarDays className="w-3 h-3" />
              <span>Architect Plan</span>
            </button>
          </div>

          {/* List of Countdown cards */}
          <div className="space-y-4">
            {tasks.map((task) => {
              const countdownStr = formatCountdown(task.countdownSeconds);
              const isCritical = task.status === 'critical';
              const isNormal = task.status === 'normal';

              return (
                <div
                  key={task.id}
                  onClick={() => {
                    setActiveSessionTaskId(task.id);
                    setSessionTime(0);
                    setSessionActive(true);
                  }}
                  className={`glass-card rounded-xl p-4 hover:bg-surface-container-high transition-all cursor-pointer group flex flex-col justify-between border ${
                    activeSessionTaskId === task.id ? 'border-primary animate-pulse-subtle' : 'border-outline/30'
                  }`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <span
                      className={`px-2 py-0.5 rounded font-mono text-[9px] font-bold tracking-wider ${
                        isCritical
                          ? 'bg-error-container/20 text-error border border-error/10'
                          : isNormal
                          ? 'bg-primary-container/20 text-primary border border-primary/10'
                          : 'bg-secondary-container/20 text-secondary border border-secondary/10'
                      }`}
                    >
                      {task.status.toUpperCase()}
                    </span>
                    <div className="text-right">
                      <span className="font-mono text-[8px] text-on-surface-variant block tracking-wider">
                        DEADLINE
                      </span>
                      <span
                        className={`font-mono text-xs font-bold tabular-nums ${
                          isCritical ? 'text-error' : 'text-white'
                        }`}
                      >
                        {countdownStr}
                      </span>
                    </div>
                  </div>
                  <h4 className="font-sans font-bold text-xs text-white group-hover:text-primary transition-colors">
                    {task.title}
                  </h4>
                  
                  {/* Task details containing postponement warning and reschedule/postpone action */}
                  <div className="flex justify-between items-center mt-3 pt-2 border-t border-outline/10">
                    <p className="font-mono text-[8px] text-on-surface-variant/70">
                      Postponed: <span className={task.postponedCount && task.postponedCount >= 3 ? 'text-error font-bold font-sans' : 'text-white font-mono'}>{task.postponedCount || 0}</span>
                    </p>
                    <button
                      onClick={(e) => handlePostponeTask(task.id, e)}
                      className="px-2 py-1 bg-surface-container hover:bg-surface-container-high border border-outline/50 hover:text-primary font-mono text-[8px] rounded uppercase font-bold transition-all cursor-pointer"
                      title="Delay task by 1 hour"
                    >
                      Postpone +1h
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Weekly Velocity Chart Card */}
            <div className="glass-card rounded-xl p-4 bg-gradient-to-br from-primary-container/10 to-transparent">
              <h4 className="font-mono text-[10px] font-bold uppercase tracking-wider mb-4 flex items-center gap-2 text-white">
                <Clock className="w-3.5 h-3.5 text-primary" />
                <span>Weekly Velocity</span>
              </h4>
              <div className="flex items-end gap-1.5 h-12 px-2">
                <div className="w-full bg-primary/20 h-1/2 rounded-t-sm" title="Monday"></div>
                <div className="w-full bg-primary/20 h-2/3 rounded-t-sm" title="Tuesday"></div>
                <div className="w-full bg-primary/40 h-1/3 rounded-t-sm" title="Wednesday"></div>
                <div className="w-full bg-primary/20 h-4/5 rounded-t-sm" title="Thursday"></div>
                <div className="w-full bg-primary h-full rounded-t-sm shadow shadow-primary/50 relative group" title="Wednesday (Peak!)">
                  <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-surface border border-outline px-1 rounded font-mono text-[7px] text-white hidden group-hover:block whitespace-nowrap">
                    100%
                  </span>
                </div>
                <div className="w-full bg-primary/60 h-2/3 rounded-t-sm" title="Friday"></div>
                <div className="w-full bg-primary/30 h-1/2 rounded-t-sm" title="Saturday"></div>
              </div>
              <p className="font-mono text-[8px] text-on-surface-variant mt-3 text-center opacity-70">
                Peak efficiency reached on Wednesday
              </p>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
