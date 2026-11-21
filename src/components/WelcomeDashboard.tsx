import React, { useMemo } from 'react';
import type { User } from 'firebase/auth';
import {
  Play,
  FolderOpen,
  BarChart3,
  Grid3X3,
  BookOpen,
  ArrowRight,
  Folder,
  Tag,
  Cloud,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';
import { AppView, CustomQuestion, MatchSession, QuestionGroupType } from '../types/assessment';
import { TIER_LABELS, summarizeAttempts } from '../utils/mathEngine';

interface WelcomeDashboardProps {
  customQuestions: CustomQuestion[];
  sessions: MatchSession[];
  user: User | null;
  onNavigate: (view: AppView) => void;
  onPlayFolder: (groupKey: string) => void;
  onQuickStartArena: () => void;
}

export const WelcomeDashboard: React.FC<WelcomeDashboardProps> = ({
  customQuestions,
  sessions,
  user,
  onNavigate,
  onPlayFolder,
  onQuickStartArena,
}) => {
  const activeQuestions = useMemo(
    () => customQuestions.filter((q) => q.isActive),
    [customQuestions]
  );

  const activeGroups = useMemo(() => {
    const map = new Map<
      string,
      { key: string; groupType: QuestionGroupType; groupName: string; count: number; synced: boolean }
    >();
    for (const q of activeQuestions) {
      const key = `${q.groupType}::${q.groupName}`;
      const existing = map.get(key) ?? {
        key,
        groupType: q.groupType,
        groupName: q.groupName,
        count: 0,
        synced: Boolean(q.ownerId),
      };
      existing.count += 1;
      if (q.ownerId) existing.synced = true;
      map.set(key, existing);
    }
    return Array.from(map.values());
  }, [activeQuestions]);

  const allBlueAttempts = useMemo(
    () => sessions.flatMap((s) => s.attempts.filter((a) => a.player === 'BLUE')),
    [sessions]
  );
  const overallSummary = useMemo(
    () => summarizeAttempts(allBlueAttempts),
    [allBlueAttempts]
  );

  const menuCards: Array<{
    view: AppView;
    title: string;
    description: string;
    badge: string;
    icon: React.ReactNode;
    accent: string;
  }> = [
    {
      view: 'ARENA',
      title: 'Play Arena',
      description:
        'Configure teams, player photos, pulls to win (3–10), AI voice feedback, and launch live Tug-of-War matches.',
      badge: activeGroups.length > 0 ? `${activeGroups.length} Active Folders` : 'Ready to Play',
      icon: <Play className="h-5 w-5 text-blue-600" />,
      accent: 'border-blue-200 hover:border-blue-400',
    },
    {
      view: 'BANK',
      title: 'Question Bank',
      description:
        'Copy & paste questions with auto symbol cleanup, build picture questions, organize folders, and sync to Cloud / Vercel.',
      badge: `${customQuestions.length} Saved Questions`,
      icon: <FolderOpen className="h-5 w-5 text-amber-600" />,
      accent: 'border-slate-200 hover:border-amber-400',
    },
    {
      view: 'REPORT',
      title: 'Assessment Report',
      description:
        'View match report cards showing top performers, questions needing improvement, and download PDF reports.',
      badge: `${sessions.length} ${sessions.length === 1 ? 'Match' : 'Matches'} Recorded`,
      icon: <BarChart3 className="h-5 w-5 text-emerald-600" />,
      accent: 'border-slate-200 hover:border-emerald-400',
    },
    {
      view: 'FLUENCY',
      title: 'Fact Fluency Matrix',
      description:
        'Track mastery across 1–20 addition combinations and identify mental math strategies needing extra practice.',
      badge: `${overallSummary.total} Facts Answered`,
      icon: <Grid3X3 className="h-5 w-5 text-indigo-600" />,
      accent: 'border-slate-200 hover:border-indigo-400',
    },
    {
      view: 'GUIDE',
      title: 'How to Play',
      description:
        'Review classroom duel rules, keyboard shortcuts (1–4 and 7–0), and formative math strategies.',
      badge: 'Classroom Guide',
      icon: <BookOpen className="h-5 w-5 text-slate-700" />,
      accent: 'border-slate-200 hover:border-slate-400',
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Welcoming Board */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 md:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">
              <Sparkles className="h-3.5 w-3.5" />
              Welcome Board · Interactive Classroom Tug-of-War
            </div>
            <h1 className="font-display text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
              Welcome to TUGofWAR
            </h1>
            <p className="text-sm leading-relaxed text-slate-600 sm:text-base">
              Run lively team or solo Tug-of-War quizzes with instant voice feedback, custom question folders, live turn lineups, and printable PDF assessment report cards.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onQuickStartArena}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 whitespace-nowrap"
            >
              <Play className="h-4 w-4" />
              Enter Play Arena
            </button>
            <button
              type="button"
              onClick={() => onNavigate('BANK')}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap"
            >
              <FolderOpen className="h-4 w-4 text-amber-600" />
              Manage Questions
            </button>
          </div>
        </div>

        {/* Snapshot Stats */}
        <div className="mt-6 grid grid-cols-2 gap-3 border-t border-slate-100 pt-6 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Active Folders
            </div>
            <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900">
              {activeGroups.length}
            </div>
            <div className="mt-0.5 text-xs text-slate-500 tabular-nums">
              {activeQuestions.length} active questions
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Matches Played
            </div>
            <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900">
              {sessions.length}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              {sessions.length === 0 ? 'Ready for first match' : 'Saved in reports'}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Class Accuracy
            </div>
            <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900">
              {overallSummary.total > 0 ? `${overallSummary.accuracy}%` : '—'}
            </div>
            <div className="mt-0.5 text-xs text-slate-500 tabular-nums">
              {overallSummary.total > 0
                ? `${overallSummary.correct}/${overallSummary.total} correct`
                : 'No answers yet'}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Cloud &amp; Vercel Sync
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-sm font-bold text-slate-900">
              <Cloud className={`h-4 w-4 ${user ? 'text-emerald-600' : 'text-blue-600'}`} />
              <span>{user ? 'Synced' : activeGroups.some((g) => g.synced) ? 'Cloud Ready' : 'Local'}</span>
            </div>
            <div className="mt-1 text-xs text-slate-500 truncate">
              {user ? user.email : 'Sync in Question Bank'}
            </div>
          </div>
        </div>
      </section>

      {/* Quick Launch Active Question Folders */}
      {activeGroups.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Quick Start: Active Question Folders
              </h2>
              <p className="text-xs text-slate-500">
                Select any active folder below to open it directly in the Play Arena.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('BANK')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700"
            >
              Edit Folders →
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {activeGroups.map((grp) => (
              <button
                key={grp.key}
                type="button"
                onClick={() => onPlayFolder(grp.key)}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-4 text-left transition-all hover:border-blue-400 hover:bg-blue-50/40"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white">
                    {grp.groupType === 'FOLDER' ? (
                      <Folder className="h-5 w-5 text-amber-600" />
                    ) : (
                      <Tag className="h-5 w-5 text-indigo-600" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-slate-900">
                      {grp.groupName}
                    </div>
                    <div className="text-xs text-slate-500 tabular-nums">
                      {grp.groupType === 'FOLDER' ? 'Folder' : 'Topic'} · {grp.count}{' '}
                      {grp.count === 1 ? 'question' : 'questions'}
                    </div>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-blue-600" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* All Menus Directory */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Choose a Menu</h2>
          <p className="text-xs text-slate-500">
            Jump into any workspace below.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {menuCards.map((card) => (
            <button
              key={card.view}
              type="button"
              onClick={() => onNavigate(card.view)}
              className={`group flex flex-col justify-between rounded-xl border bg-white p-5 text-left transition-all ${card.accent}`}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
                    {card.icon}
                  </div>
                  <span className="rounded-md bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                    {card.badge}
                  </span>
                </div>
                <h3 className="mt-4 text-base font-bold text-slate-900 group-hover:text-blue-700">
                  {card.title}
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                  {card.description}
                </p>
              </div>
              <div className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-blue-600">
                <span>Open {card.title}</span>
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Recent Matches Strip */}
      {sessions.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-500" />
              <h2 className="text-base font-bold text-slate-900">Recent Matches</h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('REPORT')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700"
            >
              View All Reports →
            </button>
          </div>
          <div className="mt-3 divide-y divide-slate-100">
            {sessions.slice(0, 3).map((s) => {
              const title = s.questionFolderName || s.customGroupLabel || TIER_LABELS[s.tier];
              const winnerLabel =
                s.winner === 'BLUE'
                  ? s.blueTeamName || 'Team Blue'
                  : s.winner === 'CORAL'
                  ? s.coralTeamName || 'Team Coral'
                  : 'Tie Match';
              return (
                <div
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs"
                >
                  <div className="flex items-center gap-2 font-semibold text-slate-800">
                    <Users className="h-3.5 w-3.5 text-slate-400" />
                    <span>{title}</span>
                    <span className="font-normal text-slate-500">
                      · {s.blueTeamName || 'Blue'} vs {s.coralTeamName || 'Coral'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 font-mono tabular-nums text-slate-600">
                    <span>
                      {s.bluePulls} – {s.coralPulls}
                    </span>
                    <span className="font-sans font-semibold text-blue-700">{winnerLabel}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};
