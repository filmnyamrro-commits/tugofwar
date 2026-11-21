import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Volume2,
  VolumeX,
  Play,
  RotateCcw,
  Lightbulb,
  CheckCircle2,
  XCircle,
  Flag,
  BarChart3,
  Users,
  Folder,
  Tag,
  Layers,
  Camera,
  Trophy,
  X,
  Sparkles,
  Loader2,
  BellRing,
  Upload,
  LogIn,
  Pause,
  SlidersHorizontal,
  Square,
  LayoutDashboard,
  Image as ImageIcon,
} from 'lucide-react';
import {
  AdditionQuestion,
  AttemptRecord,
  BotDifficulty,
  CurriculumTier,
  CustomQuestion,
  GameMode,
  GamePhase,
  MatchSession,
  QuestionChoice,
  QuestionGroupType,
} from '../types/assessment';
import {
  STRATEGY_LABELS,
  TIER_LABELS,
  compressImageFile,
  generateQuestion,
  getStrategyTip,
  summarizeAttempts,
} from '../utils/mathEngine';
import { parseImportedQuestionsJson } from '../utils/cloudSync';
import { soundFx } from '../utils/soundFx';
import { TugArenaSvg } from './TugArenaSvg';
import { TenFrameHint } from './TenFrameHint';

interface TugPlayArenaProps {
  missedPairs: Array<{ a: number; b: number }>;
  customQuestions: CustomQuestion[];
  initialTier?: CurriculumTier;
  initialFolderKey?: string | null;
  user?: User | null;
  cloudMessage?: string | null;
  onSignIn?: () => void;
  onImportQuestions?: (imported: CustomQuestion[]) => Promise<void> | void;
  onSessionComplete: (session: MatchSession) => void;
  onViewReport: () => void;
  onOpenQuestionBank: () => void;
  onBackToWelcome?: () => void;
}

const BOT_INTERVAL_MS: Record<BotDifficulty, number> = {
  GENTLE: 8500,
  STEADY: 5500,
  VARSITY: 3500,
};

const TEAMS_STORAGE_KEY = 'ropesum_teams_v1';
const AI_SOUND_STORAGE_KEY = 'ropesum_ai_sound_v1';
const ARENA_BG_STORAGE_KEY = 'ropesum_arena_bg_v1';

type AiVoiceName = 'Kore' | 'Puck' | 'Fenrir' | 'Charon' | 'Zephyr';

interface AiSoundConfig {
  enabled: boolean;
  voiceName: AiVoiceName;
  messageTemplate: string;
  answerFeedbackEnabled: boolean;
  correctPhrase: string;
  wrongPhrase: string;
}

const DEFAULT_ALMOST_WIN_MESSAGE =
  'Watch out! {team} is just one pull away from winning!';
const DEFAULT_CORRECT_PHRASE = 'Good job, {player}!';
const DEFAULT_WRONG_PHRASE = 'Oops, try again, {player}.';

const CORRECT_PHRASE_PRESETS = [
  'Good job, {player}!',
  'Correct, {player}!',
  'Excellent, {player}!',
  'Great work, {player}!',
];

const WRONG_PHRASE_PRESETS = [
  'Oops, try again, {player}.',
  'Sorry, you are wrong, {player}.',
  'Not quite, {player}.',
];

const AI_VOICE_OPTIONS: Array<{ id: AiVoiceName; label: string; styleLabel: string }> = [
  { id: 'Kore', label: 'Kore', styleLabel: 'Energetic Announcer' },
  { id: 'Puck', label: 'Puck', styleLabel: 'Playful Host' },
  { id: 'Fenrir', label: 'Fenrir', styleLabel: 'Stadium Coach' },
  { id: 'Charon', label: 'Charon', styleLabel: 'Classic Broadcaster' },
  { id: 'Zephyr', label: 'Zephyr', styleLabel: 'Warm Cheerleader' },
];

function resolveAlmostWinText(template: string, teamName: string): string {
  const base = template.trim() || DEFAULT_ALMOST_WIN_MESSAGE;
  return base.replace(/\{team\}/gi, teamName);
}

function resolveAnswerFeedbackText(
  template: string,
  playerName: string,
  isCorrect: boolean
): string {
  const cleanName = playerName.trim() || 'Player';
  const base =
    template.trim() || (isCorrect ? DEFAULT_CORRECT_PHRASE : DEFAULT_WRONG_PHRASE);
  if (/\{player\}/i.test(base)) {
    return base.replace(/\{player\}/gi, cleanName);
  }
  const hasTrailingPunct = /[.!?]$/.test(base);
  return hasTrailingPunct
    ? `${base} ${cleanName}!`
    : `${base}, ${cleanName}${isCorrect ? '!' : '.'}`;
}

interface SavedTeamsState {
  blueTeamName: string;
  blueCount: number;
  bluePlayers: string[];
  bluePhotos: string[];
  coralTeamName: string;
  coralCount: number;
  coralPlayers: string[];
  coralPhotos: string[];
}

function resizeNameList(existing: string[], count: number, prefix: string): string[] {
  return Array.from({ length: count }, (_, i) => {
    const val = existing[i];
    return val !== undefined ? val : `${prefix} ${i + 1}`;
  });
}

function resizePhotoList(existing: string[], count: number): string[] {
  return Array.from({ length: count }, (_, i) => existing[i] ?? '');
}

function getPlayerInitials(name: string, index: number): string {
  const cleaned = name.trim();
  if (!cleaned) return `P${index + 1}`;
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}

export const TugPlayArena: React.FC<TugPlayArenaProps> = ({
  missedPairs,
  customQuestions,
  initialTier,
  initialFolderKey,
  user,
  cloudMessage,
  onSignIn,
  onImportQuestions,
  onSessionComplete,
  onViewReport,
  onOpenQuestionBank,
  onBackToWelcome,
}) => {
  const activeCustomCount = customQuestions.filter((q) => q.isActive).length;

  const activeCustomGroups = useMemo(() => {
    const map = new Map<
      string,
      { key: string; groupType: QuestionGroupType; groupName: string; count: number }
    >();
    for (const q of customQuestions) {
      if (!q.isActive) continue;
      const key = `${q.groupType}::${q.groupName}`;
      const existing = map.get(key) ?? {
        key,
        groupType: q.groupType,
        groupName: q.groupName,
        count: 0,
      };
      existing.count += 1;
      map.set(key, existing);
    }
    return Array.from(map.values());
  }, [customQuestions]);

  // Configuration state
  const [mode, setMode] = useState<GameMode>('SOLO_BOT');
  const [tier, setTier] = useState<CurriculumTier>(initialTier ?? 'ALL_1_TO_20');
  const [selectedCustomGroup, setSelectedCustomGroup] = useState<string | null>(
    initialFolderKey ?? null
  );
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('STEADY');
  const [maxSteps, setMaxSteps] = useState<number>(6);
  const [muted, setMuted] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);

  // Keep selectedCustomGroup synchronized with available active folders
  useEffect(() => {
    if (activeCustomGroups.length === 0) {
      if (selectedCustomGroup !== null) setSelectedCustomGroup(null);
      return;
    }
    if (
      selectedCustomGroup !== null &&
      !activeCustomGroups.some((g) => g.key === selectedCustomGroup)
    ) {
      setSelectedCustomGroup(
        activeCustomGroups.length === 1 ? activeCustomGroups[0].key : null
      );
      return;
    }
    if (activeCustomGroups.length === 1 && selectedCustomGroup === null) {
      setSelectedCustomGroup(activeCustomGroups[0].key);
    }
  }, [activeCustomGroups, selectedCustomGroup]);

  const selectedGroupInfo = useMemo(
    () => activeCustomGroups.find((g) => g.key === selectedCustomGroup) ?? null,
    [activeCustomGroups, selectedCustomGroup]
  );

  const activeSourceLabel = useMemo(() => {
    if (tier === 'CUSTOM_ACTIVE') {
      if (selectedGroupInfo) {
        return `${selectedGroupInfo.groupType === 'FOLDER' ? 'Folder' : 'Topic'}: ${selectedGroupInfo.groupName} (${selectedGroupInfo.count})`;
      }
      return `All Active Folders (${activeCustomCount})`;
    }
    return TIER_LABELS[tier];
  }, [activeCustomCount, selectedGroupInfo, tier]);

  // Team & Group Roster State
  const [teamsState, setTeamsState] = useState<SavedTeamsState>(() => {
    try {
      const raw = localStorage.getItem(TEAMS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SavedTeamsState>;
        const bCount = Math.max(1, Math.min(6, parsed.blueCount ?? 3));
        const cCount = Math.max(1, Math.min(6, parsed.coralCount ?? 3));
        return {
          blueTeamName: parsed.blueTeamName || 'Team Blue',
          blueCount: bCount,
          bluePlayers: resizeNameList(parsed.bluePlayers ?? [], bCount, 'Player'),
          bluePhotos: resizePhotoList(parsed.bluePhotos ?? [], bCount),
          coralTeamName: parsed.coralTeamName || 'Team Coral',
          coralCount: cCount,
          coralPlayers: resizeNameList(parsed.coralPlayers ?? [], cCount, 'Player'),
          coralPhotos: resizePhotoList(parsed.coralPhotos ?? [], cCount),
        };
      }
    } catch {
      // Ignore
    }
    return {
      blueTeamName: 'Team Blue',
      blueCount: 3,
      bluePlayers: ['Player 1', 'Player 2', 'Player 3'],
      bluePhotos: ['', '', ''],
      coralTeamName: 'Team Coral',
      coralCount: 3,
      coralPlayers: ['Player 1', 'Player 2', 'Player 3'],
      coralPhotos: ['', '', ''],
    };
  });

  const [photoError, setPhotoError] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(TEAMS_STORAGE_KEY, JSON.stringify(teamsState));
    } catch {
      // Ignore
    }
  }, [teamsState]);

  const updateBlueCount = (rawCount: number) => {
    const count = Math.max(1, Math.min(6, Number.isNaN(rawCount) ? 1 : rawCount));
    setTeamsState((prev) => ({
      ...prev,
      blueCount: count,
      bluePlayers: resizeNameList(prev.bluePlayers, count, 'Player'),
      bluePhotos: resizePhotoList(prev.bluePhotos, count),
    }));
  };

  const updateCoralCount = (rawCount: number) => {
    const count = Math.max(1, Math.min(6, Number.isNaN(rawCount) ? 1 : rawCount));
    setTeamsState((prev) => ({
      ...prev,
      coralCount: count,
      coralPlayers: resizeNameList(prev.coralPlayers, count, 'Player'),
      coralPhotos: resizePhotoList(prev.coralPhotos, count),
    }));
  };

  const handlePlayerPhotoUpload = async (
    team: 'BLUE' | 'CORAL',
    index: number,
    file?: File
  ) => {
    if (!file) return;
    setPhotoError(null);
    try {
      const dataUrl = await compressImageFile(file, 240, 240);
      setTeamsState((prev) => {
        if (team === 'BLUE') {
          return {
            ...prev,
            bluePhotos: prev.bluePhotos.map((p, i) => (i === index ? dataUrl : p)),
          };
        }
        return {
          ...prev,
          coralPhotos: prev.coralPhotos.map((p, i) => (i === index ? dataUrl : p)),
        };
      });
    } catch {
      setPhotoError('Could not load that photo. Please try PNG, JPG, or WebP.');
    }
  };

  const handleClearPlayerPhoto = (team: 'BLUE' | 'CORAL', index: number) => {
    setTeamsState((prev) => {
      if (team === 'BLUE') {
        return {
          ...prev,
          bluePhotos: prev.bluePhotos.map((p, i) => (i === index ? '' : p)),
        };
      }
      return {
        ...prev,
        coralPhotos: prev.coralPhotos.map((p, i) => (i === index ? '' : p)),
      };
    });
  };

  // Custom Arena JPEG Background State (auto-fitted to 960x270 arena)
  const [arenaBackgroundUrl, setArenaBackgroundUrl] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ARENA_BG_STORAGE_KEY) || null;
    } catch {
      return null;
    }
  });
  const [arenaBgError, setArenaBgError] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (arenaBackgroundUrl) {
        localStorage.setItem(ARENA_BG_STORAGE_KEY, arenaBackgroundUrl);
      } else {
        localStorage.removeItem(ARENA_BG_STORAGE_KEY);
      }
    } catch {
      // Ignore storage quota errors while keeping current session background active
    }
  }, [arenaBackgroundUrl]);

  const handleArenaBackgroundUpload = async (file?: File) => {
    if (!file) return;
    setArenaBgError(null);
    const isJpeg =
      file.type === 'image/jpeg' || /\.(jpe?g)$/i.test(file.name);
    if (!isJpeg) {
      setArenaBgError('Please upload a JPEG (.jpg or .jpeg) photo for the arena background.');
      return;
    }
    try {
      const dataUrl = await compressImageFile(file, 1440, 810);
      setArenaBackgroundUrl(dataUrl);
    } catch {
      setArenaBgError('Could not load that JPEG photo. Please try another .jpg/.jpeg file.');
    }
  };

  const handleClearArenaBackground = () => {
    setArenaBgError(null);
    setArenaBackgroundUrl(null);
  };

  const resolvedBluePlayers = teamsState.bluePlayers.map(
    (n, i) => n.trim() || `Player ${i + 1}`
  );
  const resolvedCoralPlayers =
    mode === 'SOLO_BOT'
      ? teamsState.coralPlayers.map((n, i) =>
          n.trim() && !n.startsWith('Player ') ? n.trim() : `Bot ${i + 1}`
        )
      : teamsState.coralPlayers.map((n, i) => n.trim() || `Player ${i + 1}`);

  const resolvedBlueLabel = teamsState.blueTeamName.trim() || 'Team Blue';
  const resolvedCoralLabel =
    mode === 'SOLO_BOT' && teamsState.coralTeamName.trim() === 'Team Coral'
      ? 'Coach Bot'
      : teamsState.coralTeamName.trim() || (mode === 'SOLO_BOT' ? 'Coach Bot' : 'Team Coral');

  // Sync external tier request
  useEffect(() => {
    if (initialTier) {
      setTier(initialTier);
    }
  }, [initialTier]);

  // Active match state
  const [phase, setPhase] = useState<GamePhase>('TITLE_MENU');
  const [ropePosition, setRopePosition] = useState<number>(0);
  const [lastPuller, setLastPuller] = useState<'BLUE' | 'CORAL' | null>(null);
  const [lastEventText, setLastEventText] = useState<string | null>(null);
  const [blueTurnIndex, setBlueTurnIndex] = useState<number>(0);
  const [coralTurnIndex, setCoralTurnIndex] = useState<number>(0);

  // Questions & timing
  const [blueQuestion, setBlueQuestion] = useState<AdditionQuestion>(() =>
    generateQuestion('ALL_1_TO_20')
  );
  const [coralQuestion, setCoralQuestion] = useState<AdditionQuestion>(() =>
    generateQuestion('ALL_1_TO_20')
  );
  const blueStartRef = useRef<number>(Date.now());
  const coralStartRef = useRef<number>(Date.now());
  const matchStartRef = useRef<number>(Date.now());

  // Solo feedback & hint
  const [showHint, setShowHint] = useState<boolean>(false);
  const [usedHintOnCurrent, setUsedHintOnCurrent] = useState<boolean>(false);
  const [soloFeedback, setSoloFeedback] = useState<{
    chosenIdx: number;
    correctIdx: number;
    chosenText: string;
    correctText: string;
    isCorrect: boolean;
    label: string;
  } | null>(null);

  // 2P cooldown lockouts
  const [blueLockedUntil, setBlueLockedUntil] = useState<number>(0);
  const [coralLockedUntil, setCoralLockedUntil] = useState<number>(0);
  const [blueMissedBy, setBlueMissedBy] = useState<string | null>(null);
  const [coralMissedBy, setCoralMissedBy] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState<number>(Date.now());
  const matchEpochRef = useRef<number>(0);

  // Bot progress
  const [botProgress, setBotProgress] = useState<number>(0);

  // Telemetry for current match
  const [attempts, setAttempts] = useState<AttemptRecord[]>([]);
  const [bluePulls, setBluePulls] = useState<number>(0);
  const [coralPulls, setCoralPulls] = useState<number>(0);
  const [blueStreak, setBlueStreak] = useState<number>(0);
  const [coralStreak, setCoralStreak] = useState<number>(0);
  const [maxStreak, setMaxStreak] = useState<number>(0);
  const [completedSession, setCompletedSession] = useState<MatchSession | null>(null);
  const [showWinPopup, setShowWinPopup] = useState<boolean>(false);

  // Customizable AI Almost-Win Sound Notification + Answer Feedback Voice
  const [aiSoundConfig, setAiSoundConfig] = useState<AiSoundConfig>(() => {
    try {
      const raw = localStorage.getItem(AI_SOUND_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AiSoundConfig>;
        const validVoice = AI_VOICE_OPTIONS.some((v) => v.id === parsed.voiceName)
          ? (parsed.voiceName as AiVoiceName)
          : 'Kore';
        return {
          enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : true,
          voiceName: validVoice,
          messageTemplate:
            typeof parsed.messageTemplate === 'string' && parsed.messageTemplate.trim()
              ? parsed.messageTemplate
              : DEFAULT_ALMOST_WIN_MESSAGE,
          answerFeedbackEnabled:
            typeof parsed.answerFeedbackEnabled === 'boolean'
              ? parsed.answerFeedbackEnabled
              : true,
          correctPhrase:
            typeof parsed.correctPhrase === 'string' && parsed.correctPhrase.trim()
              ? parsed.correctPhrase
              : DEFAULT_CORRECT_PHRASE,
          wrongPhrase:
            typeof parsed.wrongPhrase === 'string' && parsed.wrongPhrase.trim()
              ? parsed.wrongPhrase
              : DEFAULT_WRONG_PHRASE,
        };
      }
    } catch {
      // Ignore
    }
    return {
      enabled: true,
      voiceName: 'Kore',
      messageTemplate: DEFAULT_ALMOST_WIN_MESSAGE,
      answerFeedbackEnabled: true,
      correctPhrase: DEFAULT_CORRECT_PHRASE,
      wrongPhrase: DEFAULT_WRONG_PHRASE,
    };
  });

  const [testingAiVoice, setTestingAiVoice] = useState<boolean>(false);
  const [testingFeedbackKind, setTestingFeedbackKind] = useState<'CORRECT' | 'WRONG' | null>(null);
  const [aiVoiceError, setAiVoiceError] = useState<string | null>(null);
  const [almostWinAlertBanner, setAlmostWinAlertBanner] = useState<{
    team: 'BLUE' | 'CORAL';
    text: string;
  } | null>(null);

  const ttsCacheRef = useRef<Map<string, { audioBase64: string; mimeType: string }>>(new Map());
  const ttsInFlightRef = useRef<
    Map<string, Promise<{ audioBase64: string; mimeType: string } | null>>
  >(new Map());
  const lastAlmostWinSideRef = useRef<'BLUE' | 'CORAL' | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(AI_SOUND_STORAGE_KEY, JSON.stringify(aiSoundConfig));
    } catch {
      // Ignore
    }
  }, [aiSoundConfig]);

  const fetchAiVoiceAudio = useCallback(
    async (
      text: string,
      voiceName: AiVoiceName,
      surfaceErrors = false
    ): Promise<{ audioBase64: string; mimeType: string } | null> => {
      const cacheKey = `${voiceName}::${text}`;
      const cached = ttsCacheRef.current.get(cacheKey);
      if (cached) return cached;

      const existing = ttsInFlightRef.current.get(cacheKey);
      if (existing) return existing;

      const requestPromise = (async () => {
        try {
          const res = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, voiceName }),
          });
          const data = (await res.json().catch(() => ({}))) as {
            audioBase64?: string;
            mimeType?: string;
            error?: string;
          };
          if (!res.ok || !data.audioBase64) {
            const errMsg = data.error || 'Failed to generate AI voice sound.';
            if (surfaceErrors) setAiVoiceError(errMsg);
            return null;
          }
          const clip = {
            audioBase64: data.audioBase64,
            mimeType: data.mimeType || 'audio/wav',
          };
          ttsCacheRef.current.set(cacheKey, clip);
          return clip;
        } catch {
          if (surfaceErrors) {
            setAiVoiceError('Could not reach the AI voice server. Please try again.');
          }
          return null;
        } finally {
          ttsInFlightRef.current.delete(cacheKey);
        }
      })();

      ttsInFlightRef.current.set(cacheKey, requestPromise);
      return requestPromise;
    },
    []
  );

  const playAnswerVoiceFeedback = useCallback(
    (isCorrect: boolean, playerName: string) => {
      if (!aiSoundConfig.answerFeedbackEnabled || muted) return;
      const template = (
        isCorrect ? aiSoundConfig.correctPhrase : aiSoundConfig.wrongPhrase
      ).trim();
      if (!template) return;

      const spokenText = resolveAnswerFeedbackText(template, playerName, isCorrect);
      const cacheKey = `${aiSoundConfig.voiceName}::${spokenText}`;
      const cached = ttsCacheRef.current.get(cacheKey);
      if (cached) {
        void soundFx.playBase64Wav(cached.audioBase64, cached.mimeType);
      } else {
        soundFx.speakPhrase(spokenText);
        void fetchAiVoiceAudio(spokenText, aiSoundConfig.voiceName, false);
      }
    },
    [
      aiSoundConfig.answerFeedbackEnabled,
      aiSoundConfig.correctPhrase,
      aiSoundConfig.voiceName,
      aiSoundConfig.wrongPhrase,
      fetchAiVoiceAudio,
      muted,
    ]
  );

  // Pre-warm personalized voice clips for the active and next player on each turn
  useEffect(() => {
    if (phase !== 'PLAYING' || !aiSoundConfig.answerFeedbackEnabled || muted) return;

    const namesToWarm = new Set<string>();
    const bLen = resolvedBluePlayers.length;
    if (bLen > 0) {
      namesToWarm.add(resolvedBluePlayers[blueTurnIndex % bLen]);
      namesToWarm.add(resolvedBluePlayers[(blueTurnIndex + 1) % bLen]);
    }
    if (mode === 'DUEL_2P') {
      const cLen = resolvedCoralPlayers.length;
      if (cLen > 0) {
        namesToWarm.add(resolvedCoralPlayers[coralTurnIndex % cLen]);
        namesToWarm.add(resolvedCoralPlayers[(coralTurnIndex + 1) % cLen]);
      }
    }

    namesToWarm.forEach((pName) => {
      if (aiSoundConfig.correctPhrase.trim()) {
        const cText = resolveAnswerFeedbackText(aiSoundConfig.correctPhrase, pName, true);
        void fetchAiVoiceAudio(cText, aiSoundConfig.voiceName, false);
      }
      if (aiSoundConfig.wrongPhrase.trim()) {
        const wText = resolveAnswerFeedbackText(aiSoundConfig.wrongPhrase, pName, false);
        void fetchAiVoiceAudio(wText, aiSoundConfig.voiceName, false);
      }
    });
  }, [
    aiSoundConfig.answerFeedbackEnabled,
    aiSoundConfig.correctPhrase,
    aiSoundConfig.voiceName,
    aiSoundConfig.wrongPhrase,
    blueTurnIndex,
    coralTurnIndex,
    fetchAiVoiceAudio,
    mode,
    muted,
    phase,
    resolvedBluePlayers,
    resolvedCoralPlayers,
  ]);

  const handleTestAiVoice = async () => {
    setAiVoiceError(null);
    soundFx.unlock();
    setTestingAiVoice(true);
    try {
      const sampleText = resolveAlmostWinText(aiSoundConfig.messageTemplate, resolvedBlueLabel);
      const clip = await fetchAiVoiceAudio(sampleText, aiSoundConfig.voiceName, true);
      if (clip) {
        if (muted) {
          setMuted(false);
          soundFx.setMuted(false);
        }
        await soundFx.playBase64Wav(clip.audioBase64, clip.mimeType);
      }
    } finally {
      setTestingAiVoice(false);
    }
  };

  const handleTestAnswerFeedback = async (kind: 'CORRECT' | 'WRONG') => {
    setAiVoiceError(null);
    soundFx.unlock();
    const template = (
      kind === 'CORRECT' ? aiSoundConfig.correctPhrase : aiSoundConfig.wrongPhrase
    ).trim();
    if (!template) return;
    const samplePlayer = resolvedBluePlayers[0] || 'Yura';
    const spokenText = resolveAnswerFeedbackText(template, samplePlayer, kind === 'CORRECT');
    setTestingFeedbackKind(kind);
    try {
      if (muted) {
        setMuted(false);
        soundFx.setMuted(false);
      }
      const clip = await fetchAiVoiceAudio(spokenText, aiSoundConfig.voiceName, true);
      if (clip) {
        await soundFx.playBase64Wav(clip.audioBase64, clip.mimeType);
      } else {
        soundFx.speakPhrase(spokenText);
      }
    } finally {
      setTestingFeedbackKind(null);
    }
  };

  // Trigger AI notification when a team is 1 pull away from winning
  useEffect(() => {
    if (phase !== 'PLAYING') {
      lastAlmostWinSideRef.current = null;
      setAlmostWinAlertBanner(null);
      return;
    }

    const almostThreshold = maxSteps - 1;
    let almostSide: 'BLUE' | 'CORAL' | null = null;
    if (ropePosition === -almostThreshold) {
      almostSide = 'BLUE';
    } else if (ropePosition === almostThreshold) {
      almostSide = 'CORAL';
    }

    if (!almostSide) {
      if (Math.abs(ropePosition) < almostThreshold) {
        lastAlmostWinSideRef.current = null;
        setAlmostWinAlertBanner(null);
      }
      return;
    }

    if (lastAlmostWinSideRef.current === almostSide) return;
    lastAlmostWinSideRef.current = almostSide;

    const leadingTeam = almostSide === 'BLUE' ? resolvedBlueLabel : resolvedCoralLabel;
    const spokenText = resolveAlmostWinText(aiSoundConfig.messageTemplate, leadingTeam);
    setAlmostWinAlertBanner({ team: almostSide, text: spokenText });

    if (aiSoundConfig.enabled && !muted) {
      let cancelled = false;
      fetchAiVoiceAudio(spokenText, aiSoundConfig.voiceName, false).then((clip) => {
        if (!cancelled && clip) {
          soundFx.playBase64Wav(clip.audioBase64, clip.mimeType);
        }
      });
      return () => {
        cancelled = true;
      };
    }
  }, [
    aiSoundConfig.enabled,
    aiSoundConfig.messageTemplate,
    aiSoundConfig.voiceName,
    fetchAiVoiceAudio,
    maxSteps,
    muted,
    phase,
    resolvedBlueLabel,
    resolvedCoralLabel,
    ropePosition,
  ]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    soundFx.setMuted(next);
  };

  const finishMatch = useCallback(
    (
      winner: 'BLUE' | 'CORAL' | 'DRAW',
      finalAttempts: AttemptRecord[],
      finalBluePulls: number,
      finalCoralPulls: number,
      finalMaxStreak: number
    ) => {
      const resolvedFolderName =
        tier === 'CUSTOM_ACTIVE'
          ? selectedGroupInfo
            ? selectedGroupInfo.groupName
            : 'All Active Folders'
          : TIER_LABELS[tier];

      const session: MatchSession = {
        id: `match-${Date.now()}`,
        startedAt: matchStartRef.current,
        endedAt: Date.now(),
        mode,
        tier,
        customGroupLabel: tier === 'CUSTOM_ACTIVE' ? activeSourceLabel : undefined,
        questionFolderName: resolvedFolderName,
        botDifficulty: mode === 'SOLO_BOT' ? botDifficulty : undefined,
        blueTeamName: resolvedBlueLabel,
        coralTeamName: resolvedCoralLabel,
        winner,
        bluePulls: finalBluePulls,
        coralPulls: finalCoralPulls,
        maxStreak: finalMaxStreak,
        attempts: finalAttempts,
      };
      setIsPaused(false);
      setCompletedSession(session);
      setShowWinPopup(true);
      setPhase('ROUND_SUMMARY');
      soundFx.playVictory(winner === 'BLUE');
      onSessionComplete(session);
    },
    [
      activeSourceLabel,
      botDifficulty,
      mode,
      onSessionComplete,
      resolvedBlueLabel,
      resolvedCoralLabel,
      selectedGroupInfo,
      tier,
    ]
  );

  const handleEndGameNow = useCallback(() => {
    const winner: 'BLUE' | 'CORAL' | 'DRAW' =
      ropePosition < 0 ? 'BLUE' : ropePosition > 0 ? 'CORAL' : 'DRAW';
    finishMatch(winner, attempts, bluePulls, coralPulls, maxStreak);
  }, [attempts, bluePulls, coralPulls, finishMatch, maxStreak, ropePosition]);

  const startNewMatch = useCallback(
    (overrideTier?: CurriculumTier) => {
      const activeTier = overrideTier ?? tier;
      if (overrideTier) setTier(overrideTier);
      const groupFilter = activeTier === 'CUSTOM_ACTIVE' ? selectedCustomGroup : null;

      const qBlue = generateQuestion(
        activeTier,
        missedPairs,
        undefined,
        customQuestions,
        groupFilter
      );
      const qCoral = generateQuestion(
        activeTier,
        missedPairs,
        qBlue.prompt ?? `${qBlue.a}+${qBlue.b}`,
        customQuestions,
        groupFilter
      );

      matchEpochRef.current += 1;
      setRopePosition(0);
      setLastPuller(null);
      setLastEventText('Match Started — First Pull!');
      setBlueQuestion(qBlue);
      setCoralQuestion(qCoral);
      setAttempts([]);
      setBluePulls(0);
      setCoralPulls(0);
      setBlueStreak(0);
      setCoralStreak(0);
      setMaxStreak(0);
      setBlueTurnIndex(0);
      setCoralTurnIndex(0);
      setShowHint(false);
      setUsedHintOnCurrent(false);
      setSoloFeedback(null);
      setBotProgress(0);
      setBlueLockedUntil(0);
      setCoralLockedUntil(0);
      setBlueMissedBy(null);
      setCoralMissedBy(null);
      setCompletedSession(null);
      setShowWinPopup(false);
      setIsPaused(false);
      setAlmostWinAlertBanner(null);
      lastAlmostWinSideRef.current = null;
      soundFx.unlock();
      soundFx.stopAiVoice();

      if (aiSoundConfig.enabled && !muted) {
        const blueClipText = resolveAlmostWinText(
          aiSoundConfig.messageTemplate,
          resolvedBlueLabel
        );
        const coralClipText = resolveAlmostWinText(
          aiSoundConfig.messageTemplate,
          resolvedCoralLabel
        );
        void fetchAiVoiceAudio(blueClipText, aiSoundConfig.voiceName, false);
        void fetchAiVoiceAudio(coralClipText, aiSoundConfig.voiceName, false);
      }

      const now = Date.now();
      matchStartRef.current = now;
      blueStartRef.current = now;
      coralStartRef.current = now;
      setPhase('PLAYING');
    },
    [
      aiSoundConfig.answerFeedbackEnabled,
      aiSoundConfig.correctPhrase,
      aiSoundConfig.enabled,
      aiSoundConfig.messageTemplate,
      aiSoundConfig.voiceName,
      aiSoundConfig.wrongPhrase,
      customQuestions,
      fetchAiVoiceAudio,
      missedPairs,
      muted,
      resolvedBlueLabel,
      resolvedCoralLabel,
      selectedCustomGroup,
      tier,
    ]
  );

  // Handle Solo answer selection
  const handleSoloAnswer = useCallback(
    (choiceIdx: number) => {
      if (phase !== 'PLAYING' || isPaused || soloFeedback !== null) return;
      const choice: QuestionChoice | undefined = blueQuestion.choices[choiceIdx];
      if (!choice) return;

      const now = Date.now();
      const responseTimeMs = Math.max(150, now - blueStartRef.current);
      const isCorrect = choiceIdx === blueQuestion.correctChoiceIndex;
      const currentPlayerName = resolvedBluePlayers[blueTurnIndex % resolvedBluePlayers.length];
      const questionLabel = blueQuestion.prompt ?? `${blueQuestion.a} + ${blueQuestion.b}`;
      const chosenNum = parseInt(choice.text, 10);

      const record: AttemptRecord = {
        id: `att-${now}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: now,
        prompt: blueQuestion.prompt,
        a: blueQuestion.a,
        b: blueQuestion.b,
        correctAnswer: blueQuestion.answer,
        chosenAnswer: Number.isNaN(chosenNum) ? 0 : chosenNum,
        correctAnswerText: blueQuestion.answerText,
        chosenAnswerText: choice.text || `Option ${choiceIdx + 1}`,
        isCustom: blueQuestion.isCustom,
        isCorrect,
        responseTimeMs,
        strategy: blueQuestion.strategy,
        groupLabel: blueQuestion.groupLabel,
        usedHint: usedHintOnCurrent,
        player: 'BLUE',
        playerName: currentPlayerName,
      };

      const nextAttempts = [...attempts, record];
      setAttempts(nextAttempts);
      setSoloFeedback({
        chosenIdx: choiceIdx,
        correctIdx: blueQuestion.correctChoiceIndex,
        chosenText: choice.text || `Option ${choiceIdx + 1}`,
        correctText:
          blueQuestion.choices[blueQuestion.correctChoiceIndex]?.text || blueQuestion.answerText,
        isCorrect,
        label: questionLabel,
      });

      const epochAtAnswer = matchEpochRef.current;

      if (isCorrect) {
        const nextStreak = blueStreak + 1;
        const nextMaxStreak = Math.max(maxStreak, nextStreak);
        const pullPower = nextStreak > 0 && nextStreak % 3 === 0 ? 2 : 1;
        const nextRope = Math.max(-maxSteps, ropePosition - pullPower);
        const nextBluePulls = bluePulls + pullPower;

        setBlueStreak(nextStreak);
        setMaxStreak(nextMaxStreak);
        setBluePulls(nextBluePulls);
        setRopePosition(nextRope);
        setLastPuller('BLUE');
        setLastEventText(
          pullPower === 2
            ? `${currentPlayerName} 3-Streak Power Pull!`
            : `${currentPlayerName} Pulls! (${resolvedBlueLabel})`
        );
        soundFx.playPullCorrect(nextStreak);
        playAnswerVoiceFeedback(true, currentPlayerName);

        if (nextRope <= -maxSteps) {
          setTimeout(() => {
            if (matchEpochRef.current !== epochAtAnswer) return;
            finishMatch('BLUE', nextAttempts, nextBluePulls, coralPulls, nextMaxStreak);
          }, 420);
          return;
        }

        setTimeout(() => {
          if (matchEpochRef.current !== epochAtAnswer) return;
          setSoloFeedback(null);
          setShowHint(false);
          setUsedHintOnCurrent(false);
          setBlueTurnIndex((idx) => (idx + 1) % resolvedBluePlayers.length);
          setBlueQuestion(
            generateQuestion(
              tier,
              missedPairs,
              blueQuestion.prompt ?? `${blueQuestion.a}+${blueQuestion.b}`,
              customQuestions,
              selectedCustomGroup
            )
          );
          blueStartRef.current = Date.now();
        }, 480);
      } else {
        setBlueStreak(0);
        const nextRope = Math.min(maxSteps, ropePosition + 1);
        const nextCoralPulls = coralPulls + 1;

        setCoralPulls(nextCoralPulls);
        setRopePosition(nextRope);
        setLastPuller('CORAL');
        setLastEventText(
          `Slip by ${currentPlayerName}! Answer: ${
            blueQuestion.choices[blueQuestion.correctChoiceIndex]?.text || blueQuestion.answerText
          }`
        );
        if (!blueQuestion.isCustom) {
          setShowHint(true);
        }
        soundFx.playMiss();
        playAnswerVoiceFeedback(false, currentPlayerName);

        if (nextRope >= maxSteps) {
          setTimeout(() => {
            if (matchEpochRef.current !== epochAtAnswer) return;
            finishMatch('CORAL', nextAttempts, bluePulls, nextCoralPulls, maxStreak);
          }, 600);
          return;
        }

        setTimeout(() => {
          if (matchEpochRef.current !== epochAtAnswer) return;
          setSoloFeedback(null);
          setShowHint(false);
          setUsedHintOnCurrent(false);
          setBlueTurnIndex((idx) => (idx + 1) % resolvedBluePlayers.length);
          setBlueQuestion(
            generateQuestion(
              tier,
              missedPairs,
              blueQuestion.prompt ?? `${blueQuestion.a}+${blueQuestion.b}`,
              customQuestions,
              selectedCustomGroup
            )
          );
          blueStartRef.current = Date.now();
        }, 1650);
      }
    },
    [
      attempts,
      bluePulls,
      blueQuestion,
      blueStreak,
      blueTurnIndex,
      coralPulls,
      customQuestions,
      finishMatch,
      isPaused,
      maxSteps,
      maxStreak,
      missedPairs,
      phase,
      playAnswerVoiceFeedback,
      resolvedBlueLabel,
      resolvedBluePlayers,
      ropePosition,
      selectedCustomGroup,
      soloFeedback,
      tier,
      usedHintOnCurrent,
    ]
  );

  // Handle 2-Player Duel answer
  const handleDuelAnswer = useCallback(
    (player: 'BLUE' | 'CORAL', choiceIdx: number) => {
      if (phase !== 'PLAYING' || isPaused) return;
      const now = Date.now();

      if (player === 'BLUE' && now < blueLockedUntil) return;
      if (player === 'CORAL' && now < coralLockedUntil) return;

      const question = player === 'BLUE' ? blueQuestion : coralQuestion;
      const choice = question.choices[choiceIdx];
      if (!choice) return;

      const startTime = player === 'BLUE' ? blueStartRef.current : coralStartRef.current;
      const responseTimeMs = Math.max(150, now - startTime);
      const isCorrect = choiceIdx === question.correctChoiceIndex;
      const chosenNum = parseInt(choice.text, 10);

      const activePlayerName =
        player === 'BLUE'
          ? resolvedBluePlayers[blueTurnIndex % resolvedBluePlayers.length]
          : resolvedCoralPlayers[coralTurnIndex % resolvedCoralPlayers.length];

      const record: AttemptRecord = {
        id: `att-${now}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: now,
        prompt: question.prompt,
        a: question.a,
        b: question.b,
        correctAnswer: question.answer,
        chosenAnswer: Number.isNaN(chosenNum) ? 0 : chosenNum,
        correctAnswerText: question.answerText,
        chosenAnswerText: choice.text || `Option ${choiceIdx + 1}`,
        isCustom: question.isCustom,
        isCorrect,
        responseTimeMs,
        strategy: question.strategy,
        groupLabel: question.groupLabel,
        usedHint: false,
        player,
        playerName: activePlayerName,
      };

      const nextAttempts = [...attempts, record];
      setAttempts(nextAttempts);

      if (isCorrect) {
        if (player === 'BLUE') {
          const nextStreak = blueStreak + 1;
          const nextMax = Math.max(maxStreak, nextStreak);
          const nextRope = Math.max(-maxSteps, ropePosition - 1);
          const nextBluePulls = bluePulls + 1;

          setBlueStreak(nextStreak);
          setMaxStreak(nextMax);
          setBluePulls(nextBluePulls);
          setRopePosition(nextRope);
          setLastPuller('BLUE');
          setBlueMissedBy(null);
          setLastEventText(`${activePlayerName} Pulls! (${resolvedBlueLabel})`);
          soundFx.playPullCorrect(nextStreak);
          playAnswerVoiceFeedback(true, activePlayerName);

          if (nextRope <= -maxSteps) {
            finishMatch('BLUE', nextAttempts, nextBluePulls, coralPulls, nextMax);
            return;
          }

          setBlueTurnIndex((idx) => (idx + 1) % resolvedBluePlayers.length);
          setBlueQuestion(
            generateQuestion(
              tier,
              missedPairs,
              question.prompt ?? `${question.a}+${question.b}`,
              customQuestions,
              selectedCustomGroup
            )
          );
          blueStartRef.current = Date.now();
        } else {
          const nextStreak = coralStreak + 1;
          const nextRope = Math.min(maxSteps, ropePosition + 1);
          const nextCoralPulls = coralPulls + 1;

          setCoralStreak(nextStreak);
          setCoralPulls(nextCoralPulls);
          setRopePosition(nextRope);
          setLastPuller('CORAL');
          setCoralMissedBy(null);
          setLastEventText(`${activePlayerName} Pulls! (${resolvedCoralLabel})`);
          soundFx.playPullCorrect(nextStreak);
          playAnswerVoiceFeedback(true, activePlayerName);

          if (nextRope >= maxSteps) {
            finishMatch('CORAL', nextAttempts, bluePulls, nextCoralPulls, maxStreak);
            return;
          }

          setCoralTurnIndex((idx) => (idx + 1) % resolvedCoralPlayers.length);
          setCoralQuestion(
            generateQuestion(
              tier,
              missedPairs,
              question.prompt ?? `${question.a}+${question.b}`,
              customQuestions,
              selectedCustomGroup
            )
          );
          coralStartRef.current = Date.now();
        }
      } else {
        soundFx.playMiss();
        playAnswerVoiceFeedback(false, activePlayerName);
        // Sequential group play: advance to the next team member & next question even when wrong
        if (player === 'BLUE') {
          setBlueStreak(0);
          setBlueMissedBy(activePlayerName);
          setBlueLockedUntil(now + 950);
          setLastEventText(`${activePlayerName} Missed — Next Player Up!`);
          setBlueTurnIndex((idx) => (idx + 1) % resolvedBluePlayers.length);
          setBlueQuestion(
            generateQuestion(
              tier,
              missedPairs,
              question.prompt ?? `${question.a}+${question.b}`,
              customQuestions,
              selectedCustomGroup
            )
          );
          blueStartRef.current = Date.now() + 950;
        } else {
          setCoralStreak(0);
          setCoralMissedBy(activePlayerName);
          setCoralLockedUntil(now + 950);
          setLastEventText(`${activePlayerName} Missed — Next Player Up!`);
          setCoralTurnIndex((idx) => (idx + 1) % resolvedCoralPlayers.length);
          setCoralQuestion(
            generateQuestion(
              tier,
              missedPairs,
              question.prompt ?? `${question.a}+${question.b}`,
              customQuestions,
              selectedCustomGroup
            )
          );
          coralStartRef.current = Date.now() + 950;
        }
      }
    },
    [
      attempts,
      blueLockedUntil,
      bluePulls,
      blueQuestion,
      blueStreak,
      blueTurnIndex,
      coralLockedUntil,
      coralPulls,
      coralQuestion,
      coralStreak,
      coralTurnIndex,
      customQuestions,
      finishMatch,
      isPaused,
      maxSteps,
      maxStreak,
      missedPairs,
      phase,
      playAnswerVoiceFeedback,
      resolvedBlueLabel,
      resolvedBluePlayers,
      resolvedCoralLabel,
      resolvedCoralPlayers,
      ropePosition,
      selectedCustomGroup,
      tier,
    ]
  );

  // Bot timer loop in Solo mode
  useEffect(() => {
    if (phase !== 'PLAYING' || mode !== 'SOLO_BOT' || isPaused) return;
    if (soloFeedback !== null) return;

    const totalMs = BOT_INTERVAL_MS[botDifficulty];
    const tickMs = 100;

    const timer = window.setInterval(() => {
      setBotProgress((prev) => {
        const next = prev + (tickMs / totalMs) * 100;
        return next >= 100 ? 100 : next;
      });
    }, tickMs);

    return () => window.clearInterval(timer);
  }, [botDifficulty, isPaused, mode, phase, soloFeedback]);

  // Trigger Bot Pull when botProgress hits 100
  useEffect(() => {
    if (phase !== 'PLAYING' || mode !== 'SOLO_BOT' || botProgress < 100) return;

    setBotProgress(0);
    const nextRope = Math.min(maxSteps, ropePosition + 1);
    const nextCoralPulls = coralPulls + 1;
    const botName = resolvedCoralPlayers[coralTurnIndex % resolvedCoralPlayers.length];

    setCoralPulls(nextCoralPulls);
    setRopePosition(nextRope);
    setLastPuller('CORAL');
    setLastEventText(`${botName} (${resolvedCoralLabel}) Pulls!`);
    setCoralTurnIndex((idx) => (idx + 1) % resolvedCoralPlayers.length);
    soundFx.playOpponentPull();

    if (nextRope >= maxSteps) {
      finishMatch('CORAL', attempts, bluePulls, nextCoralPulls, maxStreak);
    }
  }, [
    attempts,
    bluePulls,
    botProgress,
    coralPulls,
    coralTurnIndex,
    finishMatch,
    maxSteps,
    maxStreak,
    mode,
    phase,
    resolvedCoralLabel,
    resolvedCoralPlayers,
    ropePosition,
  ]);

  // Cooldown ticker for 2-player duel lockouts
  useEffect(() => {
    if (phase !== 'PLAYING' || mode !== 'DUEL_2P') return;
    if (nowTick >= blueLockedUntil && nowTick >= coralLockedUntil) return;

    const timer = window.setInterval(() => {
      setNowTick(Date.now());
    }, 100);
    return () => window.clearInterval(timer);
  }, [blueLockedUntil, coralLockedUntil, mode, nowTick, phase]);

  // Keyboard shortcuts (1-4 for Blue, 7-0 for Coral)
  useEffect(() => {
    if (phase !== 'PLAYING') return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      const blueKeys: Record<string, number> = { '1': 0, '2': 1, '3': 2, '4': 3 };
      const coralKeys: Record<string, number> = { '7': 0, '8': 1, '9': 2, '0': 3 };

      if (e.key in blueKeys) {
        const idx = blueKeys[e.key];
        if (blueQuestion.choices[idx]) {
          if (mode === 'SOLO_BOT') handleSoloAnswer(idx);
          else handleDuelAnswer('BLUE', idx);
        }
      } else if (mode === 'DUEL_2P' && e.key in coralKeys) {
        const idx = coralKeys[e.key];
        if (coralQuestion.choices[idx]) {
          handleDuelAnswer('CORAL', idx);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [blueQuestion.choices, coralQuestion.choices, handleDuelAnswer, handleSoloAnswer, mode, phase]);

  const handleToggleHint = () => {
    const next = !showHint;
    setShowHint(next);
    if (next) setUsedHintOnCurrent(true);
  };

  // ==================== RENDER: TITLE MENU ====================
  if (phase === 'TITLE_MENU') {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Live Preview Arena reflecting real team sizes & typed player names */}
        <TugArenaSvg
          ropePosition={0}
          maxSteps={maxSteps}
          lastPuller={null}
          lastEventText={`${resolvedBlueLabel} (${resolvedBluePlayers.length}) vs ${resolvedCoralLabel} (${resolvedCoralPlayers.length})`}
          blueLabel={resolvedBlueLabel}
          coralLabel={resolvedCoralLabel}
          bluePlayers={resolvedBluePlayers}
          coralPlayers={resolvedCoralPlayers}
          backgroundImageUrl={arenaBackgroundUrl}
        />

        {/* Two-Zone Setup Card */}
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-6 rounded-xl border border-slate-200 bg-white p-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                Addition Tug-of-War (1–20)
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Configure your game mode, question bank, and team player rosters before pulling.
              </p>
            </div>

            {/* Mode Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Play Mode
              </label>
              <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
                <button
                  onClick={() => setMode('SOLO_BOT')}
                  className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors whitespace-nowrap ${
                    mode === 'SOLO_BOT'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Solo / Group vs. Bot
                </button>
                <button
                  onClick={() => setMode('DUEL_2P')}
                  className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors whitespace-nowrap ${
                    mode === 'DUEL_2P'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  2-Team Classroom Duel
                </button>
              </div>
            </div>

            {/* Teams & Group Player Rosters */}
            <div className="border-t border-slate-100 pt-5">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                <Users className="h-4 w-4 text-blue-600" />
                <span>Teams &amp; Players Roster (1–6 Players per Team)</span>
              </div>

              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                {/* Team Blue Roster */}
                <div className="rounded-lg border border-blue-200 bg-blue-50/30 p-4 space-y-3">
                  <div className="grid grid-cols-[1fr_92px] gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-blue-900">
                        Left Team Name
                      </label>
                      <input
                        type="text"
                        value={teamsState.blueTeamName}
                        onChange={(e) =>
                          setTeamsState((prev) => ({ ...prev, blueTeamName: e.target.value }))
                        }
                        placeholder="Team Blue"
                        className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900 focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-blue-900">
                        Players
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={6}
                        value={teamsState.blueCount}
                        onChange={(e) => updateBlueCount(parseInt(e.target.value, 10))}
                        className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-center font-mono text-sm font-bold tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <span className="block text-[11px] font-medium text-slate-600">
                      Player Names &amp; Optional Photos ({teamsState.blueCount})
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      {teamsState.bluePlayers.map((pName, idx) => {
                        const photoUrl = teamsState.bluePhotos[idx] ?? '';
                        return (
                          <div
                            key={`blue-p-${idx}`}
                            className="rounded-md border border-slate-200 bg-white p-1.5 space-y-1.5"
                          >
                            <input
                              type="text"
                              value={pName}
                              onChange={(e) => {
                                const val = e.target.value;
                                setTeamsState((prev) => ({
                                  ...prev,
                                  bluePlayers: prev.bluePlayers.map((n, i) => (i === idx ? val : n)),
                                }));
                              }}
                              placeholder={`Player ${idx + 1} (optional)`}
                              className="w-full rounded border border-slate-200 bg-slate-50/50 px-2 py-1 text-xs text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
                            />
                            <div className="flex items-center justify-between gap-1">
                              {photoUrl ? (
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <img
                                    src={photoUrl}
                                    alt={resolvedBluePlayers[idx]}
                                    className="h-7 w-7 shrink-0 rounded-full border border-blue-200 object-cover"
                                  />
                                  <label className="cursor-pointer truncate text-[11px] font-medium text-blue-600 hover:text-blue-700">
                                    Change
                                    <input
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      onChange={(e) => {
                                        handlePlayerPhotoUpload('BLUE', idx, e.target.files?.[0]);
                                        e.target.value = '';
                                      }}
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => handleClearPlayerPhoto('BLUE', idx)}
                                    aria-label={`Remove ${resolvedBluePlayers[idx]} photo`}
                                    className="ml-auto rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              ) : (
                                <label className="inline-flex w-full cursor-pointer items-center justify-center gap-1 rounded border border-dashed border-slate-200 bg-slate-50 px-1.5 py-1 text-[11px] font-medium text-slate-500 transition-colors hover:border-blue-400 hover:bg-blue-50/40 hover:text-blue-700">
                                  <Camera className="h-3 w-3 shrink-0" />
                                  <span>Add Photo</span>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                      handlePlayerPhotoUpload('BLUE', idx, e.target.files?.[0]);
                                      e.target.value = '';
                                    }}
                                  />
                                </label>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Team Coral Roster */}
                <div className="rounded-lg border border-rose-200 bg-rose-50/30 p-4 space-y-3">
                  <div className="grid grid-cols-[1fr_92px] gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-rose-900">
                        Right Team Name
                      </label>
                      <input
                        type="text"
                        value={teamsState.coralTeamName}
                        onChange={(e) =>
                          setTeamsState((prev) => ({ ...prev, coralTeamName: e.target.value }))
                        }
                        placeholder={mode === 'SOLO_BOT' ? 'Coach Bot' : 'Team Coral'}
                        className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900 focus:border-rose-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-rose-900">
                        Players
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={6}
                        value={teamsState.coralCount}
                        onChange={(e) => updateCoralCount(parseInt(e.target.value, 10))}
                        className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-center font-mono text-sm font-bold tabular-nums text-slate-900 focus:border-rose-600 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <span className="block text-[11px] font-medium text-slate-600">
                      {mode === 'SOLO_BOT'
                        ? `Bot / Opponent Names & Optional Photos (${teamsState.coralCount})`
                        : `Player Names & Optional Photos (${teamsState.coralCount})`}
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      {teamsState.coralPlayers.map((pName, idx) => {
                        const photoUrl = teamsState.coralPhotos[idx] ?? '';
                        return (
                          <div
                            key={`coral-p-${idx}`}
                            className="rounded-md border border-slate-200 bg-white p-1.5 space-y-1.5"
                          >
                            <input
                              type="text"
                              value={pName}
                              onChange={(e) => {
                                const val = e.target.value;
                                setTeamsState((prev) => ({
                                  ...prev,
                                  coralPlayers: prev.coralPlayers.map((n, i) => (i === idx ? val : n)),
                                }));
                              }}
                              placeholder={
                                mode === 'SOLO_BOT'
                                  ? `Bot ${idx + 1} (optional)`
                                  : `Player ${idx + 1} (optional)`
                              }
                              className="w-full rounded border border-slate-200 bg-slate-50/50 px-2 py-1 text-xs text-slate-900 focus:border-rose-600 focus:bg-white focus:outline-none"
                            />
                            <div className="flex items-center justify-between gap-1">
                              {photoUrl ? (
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <img
                                    src={photoUrl}
                                    alt={resolvedCoralPlayers[idx]}
                                    className="h-7 w-7 shrink-0 rounded-full border border-rose-200 object-cover"
                                  />
                                  <label className="cursor-pointer truncate text-[11px] font-medium text-rose-600 hover:text-rose-700">
                                    Change
                                    <input
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      onChange={(e) => {
                                        handlePlayerPhotoUpload('CORAL', idx, e.target.files?.[0]);
                                        e.target.value = '';
                                      }}
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => handleClearPlayerPhoto('CORAL', idx)}
                                    aria-label={`Remove ${resolvedCoralPlayers[idx]} photo`}
                                    className="ml-auto rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              ) : (
                                <label className="inline-flex w-full cursor-pointer items-center justify-center gap-1 rounded border border-dashed border-slate-200 bg-slate-50 px-1.5 py-1 text-[11px] font-medium text-slate-500 transition-colors hover:border-rose-400 hover:bg-rose-50/40 hover:text-rose-700">
                                  <Camera className="h-3 w-3 shrink-0" />
                                  <span>Add Photo</span>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                      handlePlayerPhotoUpload('CORAL', idx, e.target.files?.[0]);
                                      e.target.value = '';
                                    }}
                                  />
                                </label>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
              {photoError && (
                <p className="mt-2 text-xs font-medium text-rose-700">{photoError}</p>
              )}
            </div>

            {/* Addition Curriculum Tier */}
            <div className="border-t border-slate-100 pt-5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-700">
                  Question Source &amp; Tier
                </label>
                <button
                  type="button"
                  onClick={onOpenQuestionBank}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                >
                  + Paste &amp; Customize Questions
                </button>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {(['SUMS_TO_10', 'BRIDGING_10', 'ALL_1_TO_20'] as CurriculumTier[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTier(t)}
                    className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                      tier === t
                        ? 'border-blue-600 bg-blue-50/70 text-blue-900'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="text-sm font-semibold">{TIER_LABELS[t]}</div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {t === 'SUMS_TO_10'
                        ? 'Sums 2 to 10'
                        : t === 'BRIDGING_10'
                        ? 'Sums 11 to 20'
                        : 'Balanced 1 to 20'}
                    </div>
                  </button>
                ))}
              </div>

              {cloudMessage && (
                <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
                  {cloudMessage}
                </div>
              )}

              {activeCustomGroups.length > 0 ? (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-800">
                      Active Question Folders ({activeCustomCount}{' '}
                      {activeCustomCount === 1 ? 'question' : 'questions'})
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Click a folder to play it
                    </span>
                  </div>

                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {activeCustomGroups.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          setTier('CUSTOM_ACTIVE');
                          setSelectedCustomGroup(null);
                        }}
                        className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                          tier === 'CUSTOM_ACTIVE' && selectedCustomGroup === null
                            ? 'border-blue-600 bg-blue-50 text-blue-900 shadow-xs'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <Layers className="h-4 w-4 shrink-0 text-blue-600" />
                          <div className="min-w-0">
                            <div className="truncate text-xs font-semibold">
                              All Active Folders
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {activeCustomCount} questions mixed
                            </div>
                          </div>
                        </div>
                        {tier === 'CUSTOM_ACTIVE' && selectedCustomGroup === null && (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-blue-600" />
                        )}
                      </button>
                    )}

                    {activeCustomGroups.map((group) => {
                      const isSelected =
                        tier === 'CUSTOM_ACTIVE' &&
                        (selectedCustomGroup === group.key ||
                          (activeCustomGroups.length === 1 && selectedCustomGroup === null));
                      return (
                        <button
                          key={group.key}
                          type="button"
                          onClick={() => {
                            setTier('CUSTOM_ACTIVE');
                            setSelectedCustomGroup(group.key);
                          }}
                          className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                            isSelected
                              ? 'border-blue-600 bg-blue-50 text-blue-900 shadow-xs'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            {group.groupType === 'FOLDER' ? (
                              <Folder className="h-4 w-4 shrink-0 text-amber-600" />
                            ) : (
                              <Tag className="h-4 w-4 shrink-0 text-indigo-600" />
                            )}
                            <div className="min-w-0">
                              <div className="truncate text-xs font-semibold">
                                {group.groupName}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {group.groupType === 'FOLDER' ? 'Folder' : 'Topic'} · {group.count}{' '}
                                {group.count === 1 ? 'question' : 'questions'}
                              </div>
                            </div>
                          </div>
                          {isSelected && (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-blue-600" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-3 py-2.5 text-xs text-slate-500">
                  <span>
                    {customQuestions.length > 0
                      ? 'No active question folders — activate a folder in Question Bank to play it here.'
                      : 'No custom question folders active on this domain yet.'}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    {onImportQuestions && (
                      <label className="inline-flex cursor-pointer items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50">
                        <Upload className="h-3 w-3 text-blue-600" />
                        <span>Import JSON</span>
                        <input
                          type="file"
                          accept=".json,application/json"
                          className="hidden"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            e.target.value = '';
                            if (!f) return;
                            try {
                              const parsed = parseImportedQuestionsJson(await f.text());
                              if (parsed.length > 0) {
                                await onImportQuestions(parsed);
                                setTier('CUSTOM_ACTIVE');
                              }
                            } catch {
                              // Ignore invalid file
                            }
                          }}
                        />
                      </label>
                    )}
                    {!user && onSignIn && (
                      <button
                        type="button"
                        onClick={onSignIn}
                        className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-800 hover:bg-slate-50"
                      >
                        <LogIn className="h-3 w-3" />
                        Sign in for Cloud
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onOpenQuestionBank}
                      className="shrink-0 font-semibold text-blue-600 hover:text-blue-700"
                    >
                      Open Question Bank
                    </button>
                  </div>
                </div>
              )}

              {missedPairs.length > 0 && (
                <button
                  onClick={() => setTier('MISSED_REVIEW')}
                  className={`mt-2 w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    tier === 'MISSED_REVIEW'
                      ? 'border-blue-600 bg-blue-50/70 font-semibold text-blue-900'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  Targeted Practice: Missed Facts ({missedPairs.length} facts ready for review)
                </button>
              )}
            </div>

            {/* Bot Pace & Rope Length */}
            <div className="grid gap-4 sm:grid-cols-2">
              {mode === 'SOLO_BOT' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Coach Bot Pace
                  </label>
                  <div className="mt-2 grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
                    {(['GENTLE', 'STEADY', 'VARSITY'] as BotDifficulty[]).map((diff) => (
                      <button
                        key={diff}
                        onClick={() => setBotDifficulty(diff)}
                        className={`rounded-md px-2 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                          botDifficulty === diff
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {diff === 'GENTLE' ? 'Gentle' : diff === 'STEADY' ? 'Steady' : 'Varsity'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700">
                    Pulls to Win
                  </label>
                  <span className="font-mono text-xs font-semibold tabular-nums text-blue-700">
                    {maxSteps} Pulls
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-1 rounded-lg bg-slate-100 p-1 sm:grid-cols-8">
                  {[3, 4, 5, 6, 7, 8, 9, 10].map((steps) => (
                    <button
                      key={steps}
                      type="button"
                      onClick={() => setMaxSteps(steps)}
                      className={`rounded-md py-1.5 font-mono text-xs font-semibold tabular-nums transition-colors ${
                        maxSteps === steps
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {steps}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Arena Background Photo (JPEG) */}
            <div className="border-t border-slate-100 pt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-blue-600" />
                  <span className="text-xs font-semibold text-slate-700">
                    Arena Background Photo (JPEG)
                  </span>
                </div>
                {arenaBackgroundUrl && (
                  <button
                    type="button"
                    onClick={handleClearArenaBackground}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                  >
                    <X className="h-3.5 w-3.5" />
                    Reset to Default
                  </button>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Optional: upload any <span className="font-mono font-medium">.jpg</span> or{' '}
                <span className="font-mono font-medium">.jpeg</span> image — it automatically resizes and fits the Tug-of-War arena field.
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                {arenaBackgroundUrl && (
                  <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                    <img
                      src={arenaBackgroundUrl}
                      alt="Arena background preview"
                      className="h-14 w-48 object-cover"
                    />
                  </div>
                )}

                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-blue-500 hover:bg-blue-50/50 hover:text-blue-700">
                  <Upload className="h-3.5 w-3.5 text-blue-600" />
                  <span>{arenaBackgroundUrl ? 'Change JPEG Background' : 'Upload JPEG Background'}</span>
                  <input
                    type="file"
                    accept=".jpg,.jpeg,image/jpeg"
                    className="hidden"
                    onChange={(e) => {
                      void handleArenaBackgroundUpload(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </label>

                {arenaBackgroundUrl && (
                  <span className="text-xs font-medium text-emerald-700">
                    Auto-fitted to arena size
                  </span>
                )}
              </div>

              {arenaBgError && (
                <p className="mt-2 text-xs font-medium text-rose-700">{arenaBgError}</p>
              )}
            </div>

            {/* AI Almost-Win Sound Notification */}
            <div className="border-t border-slate-100 pt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-blue-600" />
                  <span className="text-xs font-semibold text-slate-700">
                    AI Sound Notification (Almost Win)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setAiSoundConfig((prev) => ({ ...prev, enabled: !prev.enabled }))
                  }
                  className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${
                    aiSoundConfig.enabled
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {aiSoundConfig.enabled ? 'AI Sound On' : 'AI Sound Off'}
                </button>
              </div>

              <p className="mt-1 text-xs text-slate-500">
                Plays a custom AI voice alert when a team is 1 pull away from winning. Use{' '}
                <span className="font-mono font-semibold text-slate-700">{'{team}'}</span> to speak
                the leading team&apos;s name.
              </p>

              <div className={`mt-3 space-y-3 ${aiSoundConfig.enabled ? '' : 'opacity-60'}`}>
                {/* AI Voice Picker */}
                <div>
                  <span className="block text-[11px] font-semibold text-slate-700">
                    Choose AI Voice
                  </span>
                  <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-5">
                    {AI_VOICE_OPTIONS.map((voice) => {
                      const active = aiSoundConfig.voiceName === voice.id;
                      return (
                        <button
                          key={voice.id}
                          type="button"
                          onClick={() => {
                            setAiVoiceError(null);
                            setAiSoundConfig((prev) => ({ ...prev, voiceName: voice.id }));
                          }}
                          className={`rounded-lg border px-2.5 py-2 text-left transition-colors ${
                            active
                              ? 'border-blue-600 bg-blue-50 text-blue-900'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <div className="text-xs font-bold">{voice.label}</div>
                          <div className="truncate text-[10px] text-slate-500">
                            {voice.styleLabel}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Custom Typed Notification */}
                <div>
                  <label
                    htmlFor="ai-almost-win-text"
                    className="block text-[11px] font-semibold text-slate-700"
                  >
                    Custom Notification Message
                  </label>
                  <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                    <input
                      id="ai-almost-win-text"
                      type="text"
                      maxLength={200}
                      value={aiSoundConfig.messageTemplate}
                      onChange={(e) => {
                        setAiVoiceError(null);
                        setAiSoundConfig((prev) => ({
                          ...prev,
                          messageTemplate: e.target.value,
                        }));
                      }}
                      placeholder={DEFAULT_ALMOST_WIN_MESSAGE}
                      className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleTestAiVoice}
                      disabled={testingAiVoice}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap shrink-0"
                    >
                      {testingAiVoice ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                      ) : (
                        <Volume2 className="h-3.5 w-3.5 text-blue-600" />
                      )}
                      {testingAiVoice ? 'Generating...' : 'Test AI Voice'}
                    </button>
                  </div>
                </div>

                {aiVoiceError && (
                  <p className="text-xs font-medium text-rose-700">{aiVoiceError}</p>
                )}
              </div>

              {/* Correct / Wrong Answer Voice Feedback */}
              <div className="mt-5 border-t border-slate-100 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold text-slate-800">
                      Answer Voice Feedback (Correct / Wrong)
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Speaks the answering player&apos;s name (use{' '}
                      <span className="font-mono font-semibold text-slate-700">{'{player}'}</span>{' '}
                      or it is added automatically, e.g. &ldquo;Good job, Yura!&rdquo;).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setAiSoundConfig((prev) => ({
                        ...prev,
                        answerFeedbackEnabled: !prev.answerFeedbackEnabled,
                      }))
                    }
                    className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${
                      aiSoundConfig.answerFeedbackEnabled
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {aiSoundConfig.answerFeedbackEnabled ? 'Answer Voice On' : 'Answer Voice Off'}
                  </button>
                </div>

                <div
                  className={`mt-3 grid gap-4 sm:grid-cols-2 ${
                    aiSoundConfig.answerFeedbackEnabled ? '' : 'opacity-60'
                  }`}
                >
                  {/* Correct Answer Sound */}
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-emerald-900">
                        When Player Answers Correctly
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleTestAnswerFeedback('CORRECT')}
                        disabled={testingFeedbackKind === 'CORRECT'}
                        className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-50"
                      >
                        {testingFeedbackKind === 'CORRECT' ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Volume2 className="h-3 w-3" />
                        )}
                        Test
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {CORRECT_PHRASE_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() =>
                            setAiSoundConfig((prev) => ({ ...prev, correctPhrase: preset }))
                          }
                          className={`rounded border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                            aiSoundConfig.correctPhrase === preset
                              ? 'border-emerald-600 bg-emerald-600 text-white'
                              : 'border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50'
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>

                    <input
                      type="text"
                      maxLength={80}
                      value={aiSoundConfig.correctPhrase}
                      onChange={(e) =>
                        setAiSoundConfig((prev) => ({
                          ...prev,
                          correctPhrase: e.target.value,
                        }))
                      }
                      placeholder={DEFAULT_CORRECT_PHRASE}
                      className="w-full rounded border border-emerald-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>

                  {/* Wrong Answer Sound */}
                  <div className="rounded-lg border border-rose-200 bg-rose-50/40 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-rose-900">
                        When Player Answers Wrongly
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleTestAnswerFeedback('WRONG')}
                        disabled={testingFeedbackKind === 'WRONG'}
                        className="inline-flex items-center gap-1 rounded border border-rose-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-rose-800 hover:bg-rose-50"
                      >
                        {testingFeedbackKind === 'WRONG' ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Volume2 className="h-3 w-3" />
                        )}
                        Test
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {WRONG_PHRASE_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() =>
                            setAiSoundConfig((prev) => ({ ...prev, wrongPhrase: preset }))
                          }
                          className={`rounded border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                            aiSoundConfig.wrongPhrase === preset
                              ? 'border-rose-600 bg-rose-600 text-white'
                              : 'border-rose-200 bg-white text-rose-800 hover:bg-rose-50'
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>

                    <input
                      type="text"
                      maxLength={80}
                      value={aiSoundConfig.wrongPhrase}
                      onChange={(e) =>
                        setAiSoundConfig((prev) => ({
                          ...prev,
                          wrongPhrase: e.target.value,
                        }))
                      }
                      placeholder={DEFAULT_WRONG_PHRASE}
                      className="w-full rounded border border-rose-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-rose-600 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Launch Sidebar */}
          <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Match Summary</h2>
              <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                <div>
                  <strong className="text-slate-900">Questions:</strong>{' '}
                  <span className={tier === 'CUSTOM_ACTIVE' ? 'font-semibold text-blue-700' : ''}>
                    {activeSourceLabel}
                  </span>
                </div>
                <div>
                  <strong className="text-slate-900">Pulls to Win:</strong>{' '}
                  <span className="font-mono tabular-nums">{maxSteps} pulls</span>
                </div>
                <div>
                  <strong className="text-slate-900">AI Sound Alert:</strong>{' '}
                  <span>
                    {aiSoundConfig.enabled ? `${aiSoundConfig.voiceName} voice` : 'Off'}
                  </span>
                </div>
                <div>
                  <strong className="text-blue-700">{resolvedBlueLabel}:</strong>{' '}
                  {resolvedBluePlayers.join(', ')}
                </div>
                <div>
                  <strong className="text-rose-700">{resolvedCoralLabel}:</strong>{' '}
                  {resolvedCoralPlayers.join(', ')}
                </div>
              </div>

              <ul className="mt-4 space-y-2.5 text-sm text-slate-600">
                <li>
                  <strong className="text-slate-900">Group Turn Rotation:</strong> Players on each team take turns pulling the rope on each question.
                </li>
                {mode === 'SOLO_BOT' ? (
                  <>
                    <li>
                      <strong className="text-slate-900">3-Streak Bonus:</strong> 3 correct answers in a row trigger a 2-step Power Pull.
                    </li>
                    <li>
                      <strong className="text-slate-900">Visual Ten-Frame:</strong> Toggle the hint anytime on addition 1–20 facts.
                    </li>
                  </>
                ) : (
                  <>
                    <li>
                      <strong className="text-slate-900">Simultaneous Race:</strong> Both teams solve questions at the same time.
                    </li>
                    <li>
                      <strong className="text-slate-900">Controls:</strong> Tap buttons or press keys{' '}
                      <span className="font-mono font-semibold text-slate-800">1–4</span> ({resolvedBlueLabel}) and{' '}
                      <span className="font-mono font-semibold text-slate-800">7–0</span> ({resolvedCoralLabel}).
                    </li>
                  </>
                )}
              </ul>
            </div>

            <div className="mt-6 space-y-3">
              <button
                onClick={() => startNewMatch()}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-base font-semibold text-white transition-colors hover:bg-blue-700"
              >
                <Play className="h-4 w-4" />
                Start Game
              </button>
              <button
                onClick={toggleMute}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
              >
                {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                {muted ? 'Sound Muted' : 'Sound Effects On'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==================== RENDER: ROUND SUMMARY ====================
  if (phase === 'ROUND_SUMMARY' && completedSession) {
    const blueAttempts = completedSession.attempts.filter((a) => a.player === 'BLUE');
    const summary = summarizeAttempts(blueAttempts);
    const missedInMatch = blueAttempts.filter((a) => !a.isCorrect);
    const isDraw = completedSession.winner === 'DRAW';
    const isBlueWin = completedSession.winner === 'BLUE';
    const winningTeamLabel = isDraw
      ? 'Both Teams'
      : isBlueWin
      ? resolvedBlueLabel
      : resolvedCoralLabel;
    const winningPlayers = isDraw
      ? [...resolvedBluePlayers, ...resolvedCoralPlayers]
      : isBlueWin
      ? resolvedBluePlayers
      : resolvedCoralPlayers;
    const winningPhotos = isDraw
      ? [...teamsState.bluePhotos, ...teamsState.coralPhotos]
      : isBlueWin
      ? teamsState.bluePhotos
      : teamsState.coralPhotos;

    return (
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Congratulation Winner Pop-Up Modal */}
        {showWinPopup && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="winner-congrats-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-xs"
            onClick={() => setShowWinPopup(false)}
          >
            <div
              className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Colored Top Celebration Header */}
              <div
                className={`relative px-6 pt-7 pb-6 text-center text-white ${
                  isDraw
                    ? 'bg-gradient-to-br from-slate-700 to-slate-900'
                    : isBlueWin
                    ? 'bg-gradient-to-br from-blue-600 to-indigo-700'
                    : 'bg-gradient-to-br from-rose-600 to-pink-700'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setShowWinPopup(false)}
                  aria-label="Close congratulation popup"
                  className="absolute right-3.5 top-3.5 rounded-lg p-1.5 text-white/80 transition-colors hover:bg-white/15 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>

                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white/20 ring-4 ring-white/25">
                  <Trophy className="h-7 w-7 text-amber-200" />
                </div>
                <div className="mt-3 text-xs font-semibold uppercase tracking-wider text-white/85">
                  {completedSession.customGroupLabel ?? TIER_LABELS[completedSession.tier]}
                </div>
                <h2 id="winner-congrats-title" className="mt-1 text-2xl font-extrabold sm:text-3xl">
                  {isDraw
                    ? "It's a Tie Match!"
                    : `Congratulations, ${winningTeamLabel}!`}
                </h2>
                <p className="mt-1 text-sm text-white/90 tabular-nums">
                  {isDraw
                    ? `Final Pull Score: ${completedSession.bluePulls} – ${completedSession.coralPulls}`
                    : `${winningTeamLabel} wins the Tug-of-War (${completedSession.bluePulls} – ${completedSession.coralPulls})`}
                </p>
              </div>

              {/* Winning Players & Photos Showcase */}
              <div className="px-6 py-6">
                <div className="text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {isDraw
                    ? 'Participating Players'
                    : `Winning ${winningPlayers.length === 1 ? 'Player' : 'Team Roster'}`}
                </div>

                <div className="mt-4 flex flex-wrap items-start justify-center gap-4">
                  {winningPlayers.map((playerName, idx) => {
                    const photo = winningPhotos[idx];
                    return (
                      <div
                        key={`win-p-${idx}`}
                        className="flex w-24 flex-col items-center text-center"
                      >
                        {photo ? (
                          <img
                            src={photo}
                            alt={playerName}
                            className={`h-20 w-20 rounded-full object-cover shadow-md ring-4 ${
                              isDraw
                                ? 'ring-slate-200'
                                : isBlueWin
                                ? 'ring-blue-100'
                                : 'ring-rose-100'
                            }`}
                          />
                        ) : (
                          <div
                            className={`flex h-20 w-20 items-center justify-center rounded-full text-xl font-bold shadow-sm ring-4 ${
                              isDraw
                                ? 'bg-slate-100 text-slate-700 ring-slate-200'
                                : isBlueWin
                                ? 'bg-blue-50 text-blue-700 ring-blue-100'
                                : 'bg-rose-50 text-rose-700 ring-rose-100'
                            }`}
                          >
                            {getPlayerInitials(playerName, idx)}
                          </div>
                        )}
                        <span className="mt-2 w-full truncate text-xs font-semibold text-slate-900">
                          {playerName}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-center gap-3 border-t border-slate-100 pt-5">
                  <button
                    type="button"
                    onClick={() => startNewMatch()}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Play Again
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowWinPopup(false)}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    View Match Summary
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <TugArenaSvg
          ropePosition={ropePosition}
          maxSteps={maxSteps}
          lastPuller={completedSession.winner === 'DRAW' ? null : completedSession.winner}
          lastEventText={
            isDraw
              ? 'Match Ended in a Tie!'
              : isBlueWin
              ? `${resolvedBlueLabel} Wins!`
              : `${resolvedCoralLabel} Wins!`
          }
          blueLabel={resolvedBlueLabel}
          coralLabel={resolvedCoralLabel}
          bluePlayers={resolvedBluePlayers}
          coralPlayers={resolvedCoralPlayers}
          backgroundImageUrl={arenaBackgroundUrl}
        />

        <div className="rounded-xl border border-slate-200 bg-white p-6 md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-6">
            <div>
              <div className="text-xs font-semibold text-slate-500">
                {completedSession.customGroupLabel ?? TIER_LABELS[completedSession.tier]} ·{' '}
                {mode === 'SOLO_BOT' ? 'Group / Solo Assessment' : '2-Team Duel'}
              </div>
              <h2 className="mt-1 text-2xl font-bold text-slate-900">
                {isDraw
                  ? 'Match Ended in a Draw — Review & Rematch!'
                  : isBlueWin
                  ? `${resolvedBlueLabel} Wins the Tug-of-War!`
                  : `${resolvedCoralLabel} Took This Round — Review & Rematch!`}
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => setShowWinPopup(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 transition-colors hover:bg-amber-100 whitespace-nowrap shrink-0"
              >
                <Trophy className="h-4 w-4" />
                Winner Pop-up
              </button>
              <button
                onClick={() => startNewMatch()}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 whitespace-nowrap shrink-0"
              >
                <RotateCcw className="h-4 w-4" />
                Play Again
              </button>
              <button
                onClick={() => setPhase('TITLE_MENU')}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                Change Settings
              </button>
              <button
                onClick={onViewReport}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <BarChart3 className="h-4 w-4" />
                Full Report
              </button>
            </div>
          </div>

          {/* 4-Column Match Telemetry */}
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-lg border border-slate-200 p-4">
              <div className="text-xs font-medium text-slate-500">Match Accuracy</div>
              <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900">
                {summary.accuracy}%
              </div>
              <div className="mt-0.5 text-xs text-slate-500 tabular-nums">
                {summary.correct}/{summary.total} correct
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 p-4">
              <div className="text-xs font-medium text-slate-500">Avg Speed</div>
              <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900">
                {(summary.avgTimeMs / 1000).toFixed(1)}s
              </div>
              <div className="mt-0.5 text-xs text-slate-500">per question</div>
            </div>
            <div className="rounded-lg border border-slate-200 p-4">
              <div className="text-xs font-medium text-slate-500">Longest Streak</div>
              <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900">
                {completedSession.maxStreak}
              </div>
              <div className="mt-0.5 text-xs text-slate-500">consecutive pulls</div>
            </div>
            <div className="rounded-lg border border-slate-200 p-4">
              <div className="text-xs font-medium text-slate-500">Pull Score</div>
              <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900">
                {completedSession.bluePulls} – {completedSession.coralPulls}
              </div>
              <div className="mt-0.5 text-xs text-slate-500">
                {resolvedBlueLabel} vs {resolvedCoralLabel}
              </div>
            </div>
          </div>

          {/* Formative Review of Missed Facts in This Match */}
          <div className="mt-6 border-t border-slate-100 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-base font-bold text-slate-900">
                {missedInMatch.length === 0
                  ? 'Zero Missed Questions This Match'
                  : `Formative Check: ${missedInMatch.length} ${
                      missedInMatch.length === 1 ? 'Question' : 'Questions'
                    } to Review`}
              </h3>
              {missedInMatch.length > 0 && !completedSession.tier.includes('CUSTOM') && (
                <button
                  onClick={() => startNewMatch('MISSED_REVIEW')}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700"
                >
                  <Play className="h-3.5 w-3.5" />
                  Practice Missed Facts Now
                </button>
              )}
            </div>

            {missedInMatch.length > 0 ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {missedInMatch.map((att) => (
                  <div key={att.id} className="rounded-lg border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-base font-bold tabular-nums text-slate-900">
                        {att.prompt ?? `${att.a} + ${att.b}`} → {att.correctAnswerText ?? att.correctAnswer}
                      </span>
                      <span className="text-xs font-medium text-rose-700 tabular-nums">
                        {att.playerName ? `${att.playerName} picked ` : 'Picked '}
                        {att.chosenAnswerText ?? att.chosenAnswer}
                      </span>
                    </div>
                    {!att.isCustom && (
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                        {getStrategyTip(att.a, att.b)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-600">
                Every question in this match was answered accurately!
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ==================== RENDER: ACTIVE GAMEPLAY ====================
  const blueLocked = Date.now() < blueLockedUntil;
  const coralLocked = Date.now() < coralLockedUntil;
  const blueIdx = blueTurnIndex % resolvedBluePlayers.length;
  const nextBlueIdx = (blueTurnIndex + 1) % resolvedBluePlayers.length;
  const activeBluePlayerName = resolvedBluePlayers[blueIdx];
  const nextBluePlayerName =
    resolvedBluePlayers.length > 1 ? resolvedBluePlayers[nextBlueIdx] : null;
  const activeBluePhoto = teamsState.bluePhotos[blueIdx] || '';
  const nextBluePhoto =
    resolvedBluePlayers.length > 1 ? teamsState.bluePhotos[nextBlueIdx] || '' : '';

  const coralIdx = coralTurnIndex % resolvedCoralPlayers.length;
  const nextCoralIdx = (coralTurnIndex + 1) % resolvedCoralPlayers.length;
  const activeCoralPlayerName = resolvedCoralPlayers[coralIdx];
  const nextCoralPlayerName =
    resolvedCoralPlayers.length > 1 ? resolvedCoralPlayers[nextCoralIdx] : null;
  const activeCoralPhoto = teamsState.coralPhotos[coralIdx] || '';
  const nextCoralPhoto =
    resolvedCoralPlayers.length > 1 ? teamsState.coralPhotos[nextCoralIdx] || '' : '';

  const renderTurnBanner = (
    tone: 'BLUE' | 'CORAL',
    activeName: string,
    activePhoto: string,
    activeIndex: number,
    nextName: string | null,
    nextPhoto: string,
    nextIndex: number
  ) => {
    const isBlue = tone === 'BLUE';
    return (
      <div
        className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 ${
          isBlue
            ? 'border-blue-200 bg-blue-50/70'
            : 'border-rose-200 bg-rose-50/70'
        }`}
      >
        <div className="flex min-w-0 items-center gap-2">
          {activePhoto ? (
            <img
              src={activePhoto}
              alt={activeName}
              className={`h-7 w-7 rounded-full border object-cover shrink-0 ${
                isBlue ? 'border-blue-300' : 'border-rose-300'
              }`}
            />
          ) : (
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${
                isBlue ? 'bg-blue-600' : 'bg-rose-600'
              }`}
            >
              {getPlayerInitials(activeName, activeIndex)}
            </div>
          )}
          <div className="min-w-0">
            <div
              className={`text-[10px] font-bold uppercase tracking-wider ${
                isBlue ? 'text-blue-700' : 'text-rose-700'
              }`}
            >
              Playing Now
            </div>
            <div className="truncate text-sm font-bold text-slate-900">
              {activeName}
            </div>
          </div>
        </div>

        {nextName && (
          <div className="flex min-w-0 items-center gap-2 border-l border-slate-200/80 pl-3">
            {nextPhoto ? (
              <img
                src={nextPhoto}
                alt={nextName}
                className="h-6 w-6 rounded-full border border-slate-300 object-cover opacity-85 shrink-0"
              />
            ) : (
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-700">
                {getPlayerInitials(nextName, nextIndex)}
              </div>
            )}
            <div className="min-w-0 text-right sm:text-left">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Up Next
              </div>
              <div className="truncate text-xs font-semibold text-slate-700">
                {nextName}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderPromptDisplay = (q: AdditionQuestion) => (
    <div className="space-y-3 text-center">
      {q.promptImageUrl && (
        <div className="flex justify-center">
          <img
            src={q.promptImageUrl}
            alt="Question visual"
            className="max-h-40 w-auto rounded-lg border border-slate-200 bg-slate-50 object-contain"
          />
        </div>
      )}
      {q.prompt && q.prompt.length > 14 ? (
        <div className="mx-auto max-w-xl text-xl font-bold leading-snug text-slate-900 sm:text-2xl">
          {q.prompt}
        </div>
      ) : (
        <div className="font-mono text-4xl font-bold tracking-tight tabular-nums text-slate-900 sm:text-5xl">
          {q.prompt
            ? q.prompt.includes('=')
              ? q.prompt
              : `${q.prompt} = ?`
            : `${q.a} + ${q.b} = ?`}
        </div>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* Live Match Control Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-slate-600">
          <span className="font-semibold text-slate-900">{activeSourceLabel}</span>
          <span aria-hidden="true">·</span>
          <span>
            {mode === 'SOLO_BOT' ? `vs ${resolvedCoralLabel}` : `${resolvedBlueLabel} vs ${resolvedCoralLabel}`}
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">
            Blue Streak: <strong className="text-blue-700">{blueStreak}</strong>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleMute}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap"
          >
            {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            {muted ? 'Unmute' : 'Mute'}
          </button>

          <button
            type="button"
            onClick={() => setIsPaused((p) => !p)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              isPaused
                ? 'border-blue-600 bg-blue-50 text-blue-800'
                : 'border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            {isPaused ? 'Resume' : 'Pause'}
          </button>

          <button
            type="button"
            onClick={() => startNewMatch()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Restart
          </button>

          <button
            type="button"
            onClick={() => {
              setIsPaused(false);
              soundFx.stopAiVoice();
              setPhase('TITLE_MENU');
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Back to Settings
          </button>

          {onBackToWelcome && (
            <button
              type="button"
              onClick={() => {
                setIsPaused(false);
                soundFx.stopAiVoice();
                onBackToWelcome();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap"
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              Welcome Board
            </button>
          )}

          <button
            type="button"
            onClick={handleEndGameNow}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100 whitespace-nowrap"
          >
            <Square className="h-3 w-3 fill-current" />
            End Game
          </button>
        </div>
      </div>

      {/* Pause Overlay Banner */}
      {isPaused && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <div className="font-semibold">
            Match Paused — Timers and answer buttons are locked until you resume.
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsPaused(false)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 font-semibold text-white hover:bg-blue-700"
            >
              <Play className="h-3.5 w-3.5" />
              Resume Game
            </button>
            <button
              type="button"
              onClick={() => {
                setIsPaused(false);
                soundFx.stopAiVoice();
                setPhase('TITLE_MENU');
              }}
              className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-semibold text-amber-900 hover:bg-amber-100"
            >
              Back to Settings
            </button>
            <button
              type="button"
              onClick={handleEndGameNow}
              className="rounded-lg border border-rose-200 bg-rose-600 px-3 py-1.5 font-semibold text-white hover:bg-rose-700"
            >
              End &amp; Save Game
            </button>
          </div>
        </div>
      )}

      {/* Almost-Win AI Alert Banner */}
      {almostWinAlertBanner && (
        <div
          className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-xs font-semibold ${
            almostWinAlertBanner.team === 'BLUE'
              ? 'border-blue-200 bg-blue-50 text-blue-900'
              : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          <BellRing className="h-4 w-4 shrink-0" />
          <span>Match Point Alert: {almostWinAlertBanner.text}</span>
        </div>
      )}

      {/* Live SVG Tug-of-War Arena */}
      <TugArenaSvg
        ropePosition={ropePosition}
        maxSteps={maxSteps}
        lastPuller={lastPuller}
        lastEventText={lastEventText}
        blueLabel={resolvedBlueLabel}
        coralLabel={resolvedCoralLabel}
        bluePlayers={resolvedBluePlayers}
        coralPlayers={resolvedCoralPlayers}
        activeBlueIndex={blueIdx}
        activeCoralIndex={mode === 'DUEL_2P' ? coralIdx : undefined}
        backgroundImageUrl={arenaBackgroundUrl}
      />

      {/* Active Question Zone */}
      {mode === 'SOLO_BOT' ? (
        <div className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-6">
          {/* Active Player & Next Player Strip Above Question */}
          <div className="mb-4 space-y-2.5">
            {renderTurnBanner(
              'BLUE',
              activeBluePlayerName,
              activeBluePhoto,
              blueIdx,
              nextBluePlayerName,
              nextBluePhoto,
              nextBlueIdx
            )}
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>{blueQuestion.groupLabel ?? STRATEGY_LABELS[blueQuestion.strategy]}</span>
              <span className="font-mono tabular-nums">{resolvedCoralLabel} Pull Timer</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full bg-rose-500 transition-all duration-100"
                style={{ width: `${botProgress}%` }}
              />
            </div>
          </div>

          {/* Question Prompt + Optional Picture */}
          <div className="py-2">{renderPromptDisplay(blueQuestion)}</div>

          {/* Feedback Banner */}
          <div className="mt-3 flex min-h-[28px] items-center justify-center text-sm font-semibold">
            {soloFeedback && soloFeedback.isCorrect && (
              <span className="inline-flex items-center gap-1.5 text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                Correct! {soloFeedback.correctText}
              </span>
            )}
            {soloFeedback && !soloFeedback.isCorrect && (
              <span className="inline-flex items-center gap-1.5 text-rose-700">
                <XCircle className="h-4 w-4" />
                Not quite — answer is {soloFeedback.correctText} (picked {soloFeedback.chosenText})
              </span>
            )}
          </div>

          {/* 4 Large Answer Buttons (Text + Optional Uploaded Picture) */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {blueQuestion.choices.map((choice, idx) => {
              let btnStyle =
                'border-slate-200 bg-slate-50 text-slate-900 hover:border-blue-500 hover:bg-blue-50';
              if (soloFeedback) {
                if (idx === soloFeedback.correctIdx) {
                  btnStyle = 'border-emerald-600 bg-emerald-50 text-emerald-900';
                } else if (idx === soloFeedback.chosenIdx && !soloFeedback.isCorrect) {
                  btnStyle = 'border-rose-600 bg-rose-50 text-rose-900';
                } else {
                  btnStyle = 'border-slate-200 bg-white text-slate-400';
                }
              }

              const hasImage = Boolean(choice.imageUrl);
              return (
                <button
                  key={choice.id}
                  onClick={() => handleSoloAnswer(idx)}
                  disabled={soloFeedback !== null}
                  className={`relative flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-xl border-2 p-2.5 text-center transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${btnStyle}`}
                >
                  {hasImage && (
                    <img
                      src={choice.imageUrl}
                      alt={choice.text || `Option ${idx + 1}`}
                      className="h-14 w-auto rounded object-contain"
                    />
                  )}
                  {choice.text && (
                    <span
                      className={
                        choice.text.length > 6
                          ? 'text-sm font-bold leading-tight'
                          : 'font-mono text-2xl font-bold tabular-nums'
                      }
                    >
                      {choice.text}
                    </span>
                  )}
                  <span className="absolute right-2 top-1.5 font-sans text-[11px] font-medium text-slate-400">
                    {idx + 1}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Strategy Scaffold Toggle */}
          <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
            {!blueQuestion.isCustom ? (
              <button
                onClick={handleToggleHint}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                <Lightbulb className="h-4 w-4 text-amber-500" />
                {showHint ? 'Hide Ten-Frame Hint' : 'Show Ten-Frame Hint'}
              </button>
            ) : (
              <span className="text-xs font-medium text-slate-500">Custom Active Question</span>
            )}
            <span className="text-xs text-slate-500">
              Press keys <span className="font-mono font-semibold">1–4</span> or tap an answer
            </span>
          </div>

          {showHint && !blueQuestion.isCustom && (
            <TenFrameHint a={blueQuestion.a} b={blueQuestion.b} />
          )}
        </div>
      ) : (
        /* 2-PLAYER / 2-TEAM CLASSROOM DUEL DECK */
        <div className="grid gap-5 md:grid-cols-2">
          {/* TEAM BLUE SIDE */}
          <div className="rounded-xl border border-blue-200 bg-white p-6">
            <div className="mb-3 flex items-center justify-between text-xs font-semibold">
              <span className="text-blue-700">{resolvedBlueLabel} (Keys 1–4)</span>
              <span className="font-mono tabular-nums text-slate-500">
                Pulls: {bluePulls} · Streak: {blueStreak}
              </span>
            </div>

            {renderTurnBanner(
              'BLUE',
              activeBluePlayerName,
              activeBluePhoto,
              blueIdx,
              nextBluePlayerName,
              nextBluePhoto,
              nextBlueIdx
            )}

            <div className="my-5 flex min-h-[64px] items-center justify-center">
              {renderPromptDisplay(blueQuestion)}
            </div>

            {blueLocked ? (
              <div className="flex min-h-[144px] flex-col items-center justify-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-4 text-center text-sm font-semibold text-rose-700">
                <span>{blueMissedBy || activeBluePlayerName} missed — brief 1s pause</span>
                {resolvedBluePlayers.length > 1 && (
                  <span className="text-xs font-medium text-rose-600">
                    Next turn ready: {activeBluePlayerName}
                  </span>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {blueQuestion.choices.map((choice, idx) => (
                  <button
                    key={`b-${blueQuestion.id}-${choice.id}`}
                    onClick={() => handleDuelAnswer('BLUE', idx)}
                    className="relative flex min-h-[70px] flex-col items-center justify-center gap-1 rounded-xl border-2 border-slate-200 bg-slate-50 p-2 text-slate-900 transition-colors hover:border-blue-600 hover:bg-blue-50"
                  >
                    {choice.imageUrl && (
                      <img
                        src={choice.imageUrl}
                        alt={choice.text || `Option ${idx + 1}`}
                        className="h-12 w-auto rounded object-contain"
                      />
                    )}
                    {choice.text && (
                      <span
                        className={
                          choice.text.length > 6
                            ? 'text-sm font-bold leading-tight'
                            : 'font-mono text-2xl font-bold tabular-nums'
                        }
                      >
                        {choice.text}
                      </span>
                    )}
                    <span className="absolute right-2.5 top-1.5 font-sans text-[11px] font-medium text-slate-400">
                      {idx + 1}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* TEAM CORAL SIDE */}
          <div className="rounded-xl border border-rose-200 bg-white p-6">
            <div className="mb-3 flex items-center justify-between text-xs font-semibold">
              <span className="text-rose-700">{resolvedCoralLabel} (Keys 7–0)</span>
              <span className="font-mono tabular-nums text-slate-500">
                Pulls: {coralPulls} · Streak: {coralStreak}
              </span>
            </div>

            {renderTurnBanner(
              'CORAL',
              activeCoralPlayerName,
              activeCoralPhoto,
              coralIdx,
              nextCoralPlayerName,
              nextCoralPhoto,
              nextCoralIdx
            )}

            <div className="my-5 flex min-h-[64px] items-center justify-center">
              {renderPromptDisplay(coralQuestion)}
            </div>

            {coralLocked ? (
              <div className="flex min-h-[144px] flex-col items-center justify-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-4 text-center text-sm font-semibold text-rose-700">
                <span>{coralMissedBy || activeCoralPlayerName} missed — brief 1s pause</span>
                {resolvedCoralPlayers.length > 1 && (
                  <span className="text-xs font-medium text-rose-600">
                    Next turn ready: {activeCoralPlayerName}
                  </span>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {coralQuestion.choices.map((choice, idx) => {
                  const keyHint = idx === 3 ? '0' : String(idx + 7);
                  return (
                    <button
                      key={`c-${coralQuestion.id}-${choice.id}`}
                      onClick={() => handleDuelAnswer('CORAL', idx)}
                      className="relative flex min-h-[70px] flex-col items-center justify-center gap-1 rounded-xl border-2 border-slate-200 bg-slate-50 p-2 text-slate-900 transition-colors hover:border-rose-600 hover:bg-rose-50"
                    >
                      {choice.imageUrl && (
                        <img
                          src={choice.imageUrl}
                          alt={choice.text || `Option ${idx + 1}`}
                          className="h-12 w-auto rounded object-contain"
                        />
                      )}
                      {choice.text && (
                        <span
                          className={
                            choice.text.length > 6
                              ? 'text-sm font-bold leading-tight'
                              : 'font-mono text-2xl font-bold tabular-nums'
                          }
                        >
                          {choice.text}
                        </span>
                      )}
                      <span className="absolute right-2.5 top-1.5 font-sans text-[11px] font-medium text-slate-400">
                        {keyHint}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
