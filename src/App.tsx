import { useEffect, useState } from 'react';
import {
  AppView,
  CurriculumTier,
  CustomQuestion,
  MatchSession,
  QuestionGroupType,
} from './types/assessment';
import { extractMissedPairs } from './utils/mathEngine';
import { TugPlayArena } from './components/TugPlayArena';
import { QuestionBankView } from './components/QuestionBankView';
import { AssessmentReportView } from './components/AssessmentReportView';
import { FactFluencyMatrix } from './components/FactFluencyMatrix';
import { HowToPlayView } from './components/HowToPlayView';

const SESSIONS_STORAGE_KEY = 'ropesum_sessions_v1';
const CUSTOM_QUESTIONS_STORAGE_KEY = 'ropesum_custom_questions_v1';

export default function App() {
  const [activeView, setActiveView] = useState<AppView>('ARENA');
  const [arenaResetKey, setArenaResetKey] = useState<number>(0);
  const [requestedTier, setRequestedTier] = useState<CurriculumTier | undefined>(undefined);

  const [sessions, setSessions] = useState<MatchSession[]>(() => {
    try {
      const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const [customQuestions, setCustomQuestions] = useState<CustomQuestion[]>(() => {
    try {
      const raw = localStorage.getItem(CUSTOM_QUESTIONS_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((q) => {
        if (Array.isArray(q.choices) && q.choices.length > 0 && typeof q.choices[0] === 'object') {
          return {
            ...q,
            answer: String(q.answer ?? ''),
            correctChoiceIndex: typeof q.correctChoiceIndex === 'number' ? q.correctChoiceIndex : 0,
          } as CustomQuestion;
        }
        const ansNum = Number(q.answer ?? 0);
        const ansStr = String(q.answer ?? '');
        const fallbackChoices = [ansNum, ansNum + 1, Math.max(1, ansNum - 1), ansNum + 2].map(
          (val, idx) => ({
            id: `mig-${q.id}-${idx}`,
            text: idx === 0 ? ansStr : String(val),
          })
        );
        return {
          ...q,
          answer: ansStr,
          choices: fallbackChoices,
          correctChoiceIndex: 0,
        } as CustomQuestion;
      });
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
    } catch {
      // Ignore storage quota errors
    }
  }, [sessions]);

  useEffect(() => {
    try {
      localStorage.setItem(CUSTOM_QUESTIONS_STORAGE_KEY, JSON.stringify(customQuestions));
    } catch {
      // Ignore storage quota errors
    }
  }, [customQuestions]);

  const missedPairs = extractMissedPairs(sessions);

  const handleSessionComplete = (session: MatchSession) => {
    setSessions((prev) => [session, ...prev].slice(0, 50));
  };

  const handleClearHistory = () => {
    setSessions([]);
    try {
      localStorage.removeItem(SESSIONS_STORAGE_KEY);
    } catch {
      // Ignore
    }
  };

  const handlePracticeMissed = () => {
    setRequestedTier('MISSED_REVIEW');
    setArenaResetKey((k) => k + 1);
    setActiveView('ARENA');
  };

  const handlePlayActiveQuestions = () => {
    setRequestedTier('CUSTOM_ACTIVE');
    setArenaResetKey((k) => k + 1);
    setActiveView('ARENA');
  };

  const handleNewMatch = () => {
    setRequestedTier(undefined);
    setArenaResetKey((k) => k + 1);
    setActiveView('ARENA');
  };

  const handleSaveCustomQuestions = (newItems: CustomQuestion[]) => {
    setCustomQuestions((prev) => [...newItems, ...prev]);
  };

  const handleToggleQuestionActive = (id: string) => {
    setCustomQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, isActive: !q.isActive } : q))
    );
  };

  const handleToggleGroupActive = (
    groupType: QuestionGroupType,
    groupName: string,
    active: boolean
  ) => {
    setCustomQuestions((prev) =>
      prev.map((q) =>
        q.groupType === groupType && q.groupName === groupName
          ? { ...q, isActive: active }
          : q
      )
    );
  };

  const handleDeleteQuestion = (id: string) => {
    setCustomQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  const handleDeleteGroup = (groupType: QuestionGroupType, groupName: string) => {
    setCustomQuestions((prev) =>
      prev.filter((q) => !(q.groupType === groupType && q.groupName === groupName))
    );
  };

  const navItems: Array<{ id: AppView; label: string }> = [
    { id: 'ARENA', label: 'Play Arena' },
    { id: 'BANK', label: 'Question Bank' },
    { id: 'REPORT', label: 'Assessment Report' },
    { id: 'FLUENCY', label: 'Fact Fluency' },
    { id: 'GUIDE', label: 'How to Play' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* 3-Zone Top Bar Contract */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-6 py-3.5">
          {/* Zone 1: Single text element wordmark */}
          <button
            onClick={() => setActiveView('ARENA')}
            className="font-display text-xl font-extrabold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            RopeSum
          </button>

          {/* Zone 2: 5 concise single-line text navigation links */}
          <nav
            aria-label="Primary Navigation"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600"
          >
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className={`whitespace-nowrap shrink-0 pb-0.5 transition-colors ${
                  activeView === item.id
                    ? 'border-b-2 border-blue-600 font-semibold text-slate-900'
                    : 'hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="shrink-0">
            <button
              onClick={handleNewMatch}
              className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 whitespace-nowrap shrink-0"
            >
              New Match
            </button>
          </div>
        </div>

        {/* Mobile Secondary Nav */}
        <nav
          aria-label="Mobile Navigation"
          className="flex md:hidden items-center gap-4 overflow-x-auto border-t border-slate-100 px-4 py-2 text-xs font-medium text-slate-600"
        >
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={`whitespace-nowrap shrink-0 py-1 ${
                activeView === item.id ? 'font-semibold text-blue-600' : 'text-slate-600'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Main Content */}
      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
        {activeView === 'ARENA' && (
          <TugPlayArena
            key={arenaResetKey}
            missedPairs={missedPairs}
            customQuestions={customQuestions}
            initialTier={requestedTier}
            onSessionComplete={handleSessionComplete}
            onViewReport={() => setActiveView('REPORT')}
            onOpenQuestionBank={() => setActiveView('BANK')}
          />
        )}

        {activeView === 'BANK' && (
          <QuestionBankView
            questions={customQuestions}
            onSaveQuestions={handleSaveCustomQuestions}
            onToggleQuestionActive={handleToggleQuestionActive}
            onToggleGroupActive={handleToggleGroupActive}
            onDeleteQuestion={handleDeleteQuestion}
            onDeleteGroup={handleDeleteGroup}
            onPlayActiveQuestions={handlePlayActiveQuestions}
          />
        )}

        {activeView === 'REPORT' && (
          <AssessmentReportView
            sessions={sessions}
            onPracticeMissed={handlePracticeMissed}
            onClearHistory={handleClearHistory}
            onStartPlay={() => setActiveView('ARENA')}
          />
        )}

        {activeView === 'FLUENCY' && <FactFluencyMatrix sessions={sessions} />}

        {activeView === 'GUIDE' && (
          <HowToPlayView onStartPlay={() => setActiveView('ARENA')} />
        )}
      </main>
    </div>
  );
}
