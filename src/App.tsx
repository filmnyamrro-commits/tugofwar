import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import {
  AppView,
  CurriculumTier,
  CustomQuestion,
  MatchSession,
  QuestionGroupType,
} from './types/assessment';
import { extractMissedPairs } from './utils/mathEngine';
import { auth, signInWithGoogle, signOutUser } from './firebase';
import {
  decodeSharedFolderFromLocation,
  deleteGroupInCloud,
  deleteQuestionInCloud,
  saveQuestionsToCloud,
  subscribeOwnerQuestions,
  subscribePublicActiveQuestions,
  toggleGroupActiveInCloud,
  toggleQuestionActiveInCloud,
} from './utils/cloudSync';
import { TugPlayArena } from './components/TugPlayArena';
import { WelcomeDashboard } from './components/WelcomeDashboard';
import { QuestionBankView } from './components/QuestionBankView';
import { AssessmentReportView } from './components/AssessmentReportView';
import { FactFluencyMatrix } from './components/FactFluencyMatrix';
import { HowToPlayView } from './components/HowToPlayView';

const SESSIONS_STORAGE_KEY = 'ropesum_sessions_v1';
const CUSTOM_QUESTIONS_STORAGE_KEY = 'ropesum_custom_questions_v1';

function migrateRawQuestions(rawList: unknown[]): CustomQuestion[] {
  return rawList.map((raw) => {
    const q = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    if (
      Array.isArray(q.choices) &&
      q.choices.length > 0 &&
      typeof q.choices[0] === 'object'
    ) {
      return {
        ...q,
        answer: String(q.answer ?? ''),
        correctChoiceIndex:
          typeof q.correctChoiceIndex === 'number' ? q.correctChoiceIndex : 0,
      } as CustomQuestion;
    }
    const ansNum = Number(q.answer ?? 0);
    const ansStr = String(q.answer ?? '');
    const fallbackChoices = [ansNum, ansNum + 1, Math.max(1, ansNum - 1), ansNum + 2].map(
      (val, idx) => ({
        id: `mig-${String(q.id ?? 'q')}-${idx}`,
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
}

export default function App() {
  const [activeView, setActiveView] = useState<AppView>('WELCOME');
  const [arenaResetKey, setArenaResetKey] = useState<number>(0);
  const [requestedTier, setRequestedTier] = useState<CurriculumTier | undefined>(undefined);
  const [requestedFolderKey, setRequestedFolderKey] = useState<string | null>(null);

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

  const [localQuestions, setLocalQuestions] = useState<CustomQuestion[]>(() => {
    let stored: CustomQuestion[] = [];
    try {
      const raw = localStorage.getItem(CUSTOM_QUESTIONS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          stored = migrateRawQuestions(parsed);
        }
      }
    } catch {
      stored = [];
    }

    const sharedFromUrl = decodeSharedFolderFromLocation();
    if (sharedFromUrl.length > 0) {
      const existingSig = new Set(
        stored.map((q) => `${q.groupType}::${q.groupName}::${q.prompt}`)
      );
      const fresh = sharedFromUrl.filter(
        (q) => !existingSig.has(`${q.groupType}::${q.groupName}::${q.prompt}`)
      );
      stored = [...fresh, ...stored];
    }
    return stored;
  });

  const [user, setUser] = useState<User | null>(null);
  const [publicCloudQuestions, setPublicCloudQuestions] = useState<CustomQuestion[]>([]);
  const [ownerCloudQuestions, setOwnerCloudQuestions] = useState<CustomQuestion[]>([]);
  const [cloudSyncBusy, setCloudSyncBusy] = useState<boolean>(false);
  const [cloudMessage, setCloudMessage] = useState<string | null>(null);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const autoSyncedUidRef = useRef<string | null>(null);

  // Detect shared folder in URL on first load and clean URL
  useEffect(() => {
    const sharedFromUrl = decodeSharedFolderFromLocation();
    if (sharedFromUrl.length > 0) {
      setRequestedTier('CUSTOM_ACTIVE');
      setRequestedFolderKey(
        `${sharedFromUrl[0].groupType}::${sharedFromUrl[0].groupName}`
      );
      setActiveView('ARENA');
      setArenaResetKey((k) => k + 1);
      const folderName = sharedFromUrl[0]?.groupName || 'Shared Folder';
      setCloudMessage(
        `Loaded "${folderName}" (${sharedFromUrl.length} questions) from link.`
      );
      try {
        const cleanUrl = window.location.pathname;
        window.history.replaceState(null, '', cleanUrl);
      } catch {
        // Ignore history restrictions
      }
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
    } catch {
      // Ignore storage quota errors
    }
  }, [sessions]);

  useEffect(() => {
    try {
      localStorage.setItem(CUSTOM_QUESTIONS_STORAGE_KEY, JSON.stringify(localQuestions));
    } catch {
      // Ignore storage quota errors
    }
  }, [localQuestions]);

  // Firebase Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      if (!nextUser) {
        setOwnerCloudQuestions([]);
        autoSyncedUidRef.current = null;
      }
    });
    return () => unsub();
  }, []);

  // Always subscribe to published active questions so Vercel / classroom links load folders without sign-in
  useEffect(() => {
    const unsub = subscribePublicActiveQuestions(
      (items) => {
        setPublicCloudQuestions(items);
      },
      (err) => {
        setCloudError(err.message);
      }
    );
    return () => unsub();
  }, []);

  // Subscribe to all questions owned by the signed-in user (including inactive/draft folders)
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeOwnerQuestions(
      user.uid,
      (items) => {
        setOwnerCloudQuestions(items);
      },
      (err) => {
        setCloudError(err.message);
      }
    );
    return () => unsub();
  }, [user]);

  const unsyncedLocalQuestions = useMemo(() => {
    const cloudIdSet = new Set([
      ...ownerCloudQuestions.map((q) => q.id),
      ...publicCloudQuestions.map((q) => q.id),
    ]);
    const ownerSigSet = new Set(
      ownerCloudQuestions.map((q) => `${q.groupType}::${q.groupName}::${q.prompt}`)
    );
    return localQuestions.filter(
      (q) =>
        !q.ownerId &&
        !cloudIdSet.has(q.id) &&
        !ownerSigSet.has(`${q.groupType}::${q.groupName}::${q.prompt}`)
    );
  }, [localQuestions, ownerCloudQuestions, publicCloudQuestions]);

  const syncLocalQuestionsToCloud = useCallback(
    async (targetUser: User, itemsToSync: CustomQuestion[]) => {
      if (itemsToSync.length === 0) return;
      setCloudSyncBusy(true);
      setCloudError(null);
      try {
        const saved = await saveQuestionsToCloud(itemsToSync, targetUser.uid);
        const syncedIds = new Set(itemsToSync.map((i) => i.id));
        setLocalQuestions((prev) => prev.filter((q) => !syncedIds.has(q.id)));
        setCloudMessage(
          `Synced ${saved.length} ${saved.length === 1 ? 'question' : 'questions'} to Cloud — now available on Vercel & across devices.`
        );
      } catch (err) {
        setCloudError(
          err instanceof Error ? err.message : 'Failed to sync folders to Cloud.'
        );
      } finally {
        setCloudSyncBusy(false);
      }
    },
    []
  );

  // Automatically upload local-only folders once when the user signs in
  useEffect(() => {
    if (!user) return;
    if (autoSyncedUidRef.current === user.uid) return;
    autoSyncedUidRef.current = user.uid;
    if (unsyncedLocalQuestions.length > 0) {
      void syncLocalQuestionsToCloud(user, unsyncedLocalQuestions);
    }
  }, [syncLocalQuestionsToCloud, unsyncedLocalQuestions, user]);

  // Merge owner cloud questions, public active cloud questions, and any local-only questions
  const customQuestions = useMemo(() => {
    const byId = new Map<string, CustomQuestion>();
    const seenSig = new Set<string>();

    const addIfNew = (q: CustomQuestion) => {
      if (byId.has(q.id)) return;
      const sig = `${q.groupType}::${q.groupName}::${q.prompt}`;
      if (seenSig.has(sig)) return;
      byId.set(q.id, q);
      seenSig.add(sig);
    };

    ownerCloudQuestions.forEach(addIfNew);
    publicCloudQuestions.forEach(addIfNew);
    unsyncedLocalQuestions.forEach(addIfNew);

    return Array.from(byId.values()).sort((a, b) => b.createdAt - a.createdAt);
  }, [ownerCloudQuestions, publicCloudQuestions, unsyncedLocalQuestions]);

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
    setRequestedFolderKey(null);
    setArenaResetKey((k) => k + 1);
    setActiveView('ARENA');
  };

  const handlePlayActiveQuestions = () => {
    setRequestedTier('CUSTOM_ACTIVE');
    setRequestedFolderKey(null);
    setArenaResetKey((k) => k + 1);
    setActiveView('ARENA');
  };

  const handlePlayFolderFromDashboard = (groupKey: string) => {
    setRequestedTier('CUSTOM_ACTIVE');
    setRequestedFolderKey(groupKey);
    setArenaResetKey((k) => k + 1);
    setActiveView('ARENA');
  };

  const handleNewMatch = () => {
    setRequestedTier(undefined);
    setRequestedFolderKey(null);
    setArenaResetKey((k) => k + 1);
    setActiveView('ARENA');
  };

  const handleSignIn = async () => {
    setCloudError(null);
    setCloudMessage(null);
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('auth/unauthorized-domain')) {
        setCloudError(
          `Sign-in is blocked on "${window.location.hostname}". Add this domain in Firebase Console → Authentication → Settings → Authorized domains, or sync your folders from AI Studio / use Share Link.`
        );
      } else if (!msg.includes('auth/popup-closed-by-user')) {
        setCloudError(msg);
      }
    }
  };

  const handleSignOut = async () => {
    setCloudError(null);
    await signOutUser();
  };

  const handleSaveCustomQuestions = async (newItems: CustomQuestion[]) => {
    if (newItems.length === 0) return;
    setCloudError(null);
    if (user) {
      setCloudSyncBusy(true);
      try {
        await saveQuestionsToCloud(
          newItems.map((q) => ({ ...q, isPublished: q.isActive })),
          user.uid
        );
        setCloudMessage(
          `Saved ${newItems.length} ${newItems.length === 1 ? 'question' : 'questions'} to Cloud (synced across AI Studio & Vercel).`
        );
      } catch (err) {
        setCloudError(
          err instanceof Error
            ? err.message
            : 'Could not save to Cloud; kept locally on this device.'
        );
        setLocalQuestions((prev) => [...newItems, ...prev]);
      } finally {
        setCloudSyncBusy(false);
      }
    } else {
      setLocalQuestions((prev) => [...newItems, ...prev]);
    }
  };

  const handleImportQuestions = async (imported: CustomQuestion[]) => {
    if (imported.length === 0) return;
    await handleSaveCustomQuestions(imported);
    setRequestedTier('CUSTOM_ACTIVE');
    setArenaResetKey((k) => k + 1);
  };

  const handleToggleQuestionActive = async (id: string) => {
    const target = customQuestions.find((q) => q.id === id);
    if (!target) return;
    if (user && (!target.ownerId || target.ownerId === user.uid)) {
      if (target.ownerId === user.uid) {
        await toggleQuestionActiveInCloud(target, user.uid);
        return;
      }
    }
    setLocalQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, isActive: !q.isActive } : q))
    );
  };

  const handleToggleGroupActive = async (
    groupType: QuestionGroupType,
    groupName: string,
    active: boolean
  ) => {
    const groupItems = customQuestions.filter(
      (q) => q.groupType === groupType && q.groupName === groupName
    );
    if (user) {
      const ownedItems = groupItems.filter((q) => q.ownerId === user.uid);
      if (ownedItems.length > 0) {
        await toggleGroupActiveInCloud(ownedItems, active, user.uid);
      }
    }
    setLocalQuestions((prev) =>
      prev.map((q) =>
        q.groupType === groupType && q.groupName === groupName
          ? { ...q, isActive: active }
          : q
      )
    );
  };

  const handleDeleteQuestion = async (id: string) => {
    const target = customQuestions.find((q) => q.id === id);
    if (user && target?.ownerId === user.uid) {
      await deleteQuestionInCloud(id);
    }
    setLocalQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  const handleDeleteGroup = async (groupType: QuestionGroupType, groupName: string) => {
    const groupItems = customQuestions.filter(
      (q) => q.groupType === groupType && q.groupName === groupName
    );
    if (user) {
      const ownedItems = groupItems.filter((q) => q.ownerId === user.uid);
      if (ownedItems.length > 0) {
        await deleteGroupInCloud(ownedItems, user.uid);
      }
    }
    setLocalQuestions((prev) =>
      prev.filter((q) => !(q.groupType === groupType && q.groupName === groupName))
    );
  };

  const navItems: Array<{ id: AppView; label: string }> = [
    { id: 'WELCOME', label: 'Dashboard' },
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
            onClick={() => setActiveView('WELCOME')}
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
        {activeView === 'WELCOME' && (
          <WelcomeDashboard
            customQuestions={customQuestions}
            sessions={sessions}
            user={user}
            onNavigate={(view) => setActiveView(view)}
            onPlayFolder={handlePlayFolderFromDashboard}
            onQuickStartArena={handleNewMatch}
          />
        )}

        {activeView === 'ARENA' && (
          <TugPlayArena
            key={arenaResetKey}
            missedPairs={missedPairs}
            customQuestions={customQuestions}
            initialTier={requestedTier}
            initialFolderKey={requestedFolderKey}
            user={user}
            cloudMessage={cloudMessage}
            onSignIn={handleSignIn}
            onImportQuestions={handleImportQuestions}
            onSessionComplete={handleSessionComplete}
            onViewReport={() => setActiveView('REPORT')}
            onOpenQuestionBank={() => setActiveView('BANK')}
            onBackToWelcome={() => setActiveView('WELCOME')}
          />
        )}

        {activeView === 'BANK' && (
          <QuestionBankView
            questions={customQuestions}
            user={user}
            unsyncedCount={unsyncedLocalQuestions.length}
            cloudSyncBusy={cloudSyncBusy}
            cloudMessage={cloudMessage}
            cloudError={cloudError}
            onSignIn={handleSignIn}
            onSignOut={handleSignOut}
            onSyncLocalToCloud={() => {
              if (user) void syncLocalQuestionsToCloud(user, unsyncedLocalQuestions);
            }}
            onImportQuestions={handleImportQuestions}
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
