export type GameMode = 'SOLO_BOT' | 'DUEL_2P';

export type CurriculumTier =
  | 'SUMS_TO_10'
  | 'BRIDGING_10'
  | 'ALL_1_TO_20'
  | 'MISSED_REVIEW'
  | 'CUSTOM_ACTIVE';

export type BotDifficulty = 'GENTLE' | 'STEADY' | 'VARSITY';

export type MathStrategy =
  | 'SUMS_TO_10'
  | 'DOUBLES'
  | 'BRIDGING_10'
  | 'ADD_TEN_TEENS';

export type GamePhase = 'TITLE_MENU' | 'PLAYING' | 'ROUND_SUMMARY';

export type AppView = 'WELCOME' | 'ARENA' | 'BANK' | 'REPORT' | 'FLUENCY' | 'GUIDE';

export type QuestionGroupType = 'FOLDER' | 'TOPIC';

export interface QuestionChoice {
  id: string;
  text: string;
  imageUrl?: string;
}

export interface CustomQuestion {
  id: string;
  folderId?: string;
  ownerId?: string;
  prompt: string;
  promptImageUrl?: string;
  a?: number;
  b?: number;
  answer: string;
  choices: QuestionChoice[];
  correctChoiceIndex: number;
  groupType: QuestionGroupType;
  groupName: string;
  isActive: boolean;
  isPublished?: boolean;
  createdAt: number;
}

export interface AdditionQuestion {
  id: string;
  prompt?: string;
  promptImageUrl?: string;
  a: number;
  b: number;
  answer: number;
  answerText: string;
  choices: QuestionChoice[];
  correctChoiceIndex: number;
  strategy: MathStrategy;
  groupLabel?: string;
  isCustom?: boolean;
}

export interface TeamConfig {
  teamName: string;
  players: string[];
}

export interface AttemptRecord {
  id: string;
  timestamp: number;
  prompt?: string;
  a: number;
  b: number;
  correctAnswer: number;
  chosenAnswer: number;
  correctAnswerText?: string;
  chosenAnswerText?: string;
  isCustom?: boolean;
  isCorrect: boolean;
  responseTimeMs: number;
  strategy: MathStrategy;
  groupLabel?: string;
  usedHint: boolean;
  player: 'BLUE' | 'CORAL';
  playerName?: string;
}

export interface MatchSession {
  id: string;
  startedAt: number;
  endedAt: number;
  mode: GameMode;
  tier: CurriculumTier;
  customGroupLabel?: string;
  questionFolderName?: string;
  botDifficulty?: BotDifficulty;
  blueTeamName?: string;
  coralTeamName?: string;
  winner: 'BLUE' | 'CORAL' | 'DRAW';
  bluePulls: number;
  coralPulls: number;
  maxStreak: number;
  attempts: AttemptRecord[];
}
