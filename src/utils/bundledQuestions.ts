import {
  CustomQuestion,
  QuestionChoice,
  QuestionGroupType,
} from '../types/assessment';

type RawModuleValue =
  | Record<string, unknown>
  | unknown[]
  | { default?: unknown; questions?: unknown };

// Automatically discovers and bundles every .json, .ts, or .js question folder
// added under src/questions/** or src/data/questions/** with zero manual registration.
const primaryQuestionModules: Record<string, RawModuleValue> =
  import.meta.glob<RawModuleValue>('../questions/**/*.{json,ts,js}', {
    eager: true,
  });

const legacyDataQuestionModules: Record<string, RawModuleValue> =
  import.meta.glob<RawModuleValue>('../data/questions/**/*.{json,ts,js}', {
    eager: true,
  });

function stableHash(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function inferFolderNameFromPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const markerMatch = normalized.match(/(?:\/data)?\/questions\/(.+)$/i);
  const rel = markerMatch ? markerMatch[1] : normalized.split('/').pop() || 'Question Folder';
  const parts = rel.split('/').filter(Boolean);

  // If nested inside a subfolder (e.g. src/questions/Majar Personifikasi/questions.json),
  // prefer the subfolder name when the filename is generic.
  const rawFileName = parts[parts.length - 1] || 'Question Folder';
  const baseFileName = rawFileName
    .replace(/\.ropesum\.json$/i, '')
    .replace(/\.(json|ts|js)$/i, '')
    .trim();

  if (
    parts.length >= 2 &&
    /^(?:index|questions?|data|items)$/i.test(baseFileName)
  ) {
    return parts[parts.length - 2].replace(/[_-]+/g, ' ').trim() || 'Question Folder';
  }

  return baseFileName.replace(/[_-]+/g, ' ').trim() || 'Question Folder';
}

function normalizeChoices(
  rawItem: Record<string, unknown>,
  questionId: string
): QuestionChoice[] {
  const rawList = Array.isArray(rawItem.choices)
    ? rawItem.choices
    : Array.isArray(rawItem.options)
    ? rawItem.options
    : [];

  return rawList.slice(0, 4).map((entry, idx) => {
    if (entry && typeof entry === 'object') {
      const obj = entry as Record<string, unknown>;
      return {
        id:
          typeof obj.id === 'string' && obj.id.trim()
            ? obj.id
            : `${questionId}-c-${idx}`,
        text: String(obj.text ?? obj.label ?? obj.value ?? ''),
        ...(typeof obj.imageUrl === 'string' && obj.imageUrl
          ? { imageUrl: obj.imageUrl }
          : {}),
      };
    }
    return {
      id: `${questionId}-c-${idx}`,
      text: String(entry ?? ''),
    };
  });
}

function resolveCorrectChoiceIndex(
  rawItem: Record<string, unknown>,
  choices: QuestionChoice[]
): number {
  if (
    typeof rawItem.correctChoiceIndex === 'number' &&
    rawItem.correctChoiceIndex >= 0 &&
    rawItem.correctChoiceIndex < choices.length
  ) {
    return rawItem.correctChoiceIndex;
  }

  if (
    typeof rawItem.correctIndex === 'number' &&
    rawItem.correctIndex >= 0 &&
    rawItem.correctIndex < choices.length
  ) {
    return rawItem.correctIndex;
  }

  const rawAnswer = rawItem.correctAnswer ?? rawItem.answer;
  if (typeof rawAnswer === 'number' && rawAnswer >= 0 && rawAnswer < choices.length) {
    // Only treat small 0-3 index as index if no choice literally equals that number
    const exactTextIdx = choices.findIndex((c) => c.text.trim() === String(rawAnswer));
    return exactTextIdx !== -1 ? exactTextIdx : rawAnswer;
  }

  if (typeof rawAnswer === 'string' && rawAnswer.trim()) {
    const trimmed = rawAnswer.trim();
    const byExact = choices.findIndex(
      (c) => c.text.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (byExact !== -1) return byExact;

    const letterMatch = trimmed.match(/^([A-D])$/i);
    if (letterMatch) {
      const letterIdx = letterMatch[1].toUpperCase().charCodeAt(0) - 65;
      if (letterIdx >= 0 && letterIdx < choices.length) return letterIdx;
    }
  }

  return 0;
}

export function normalizeBundledQuestionModule(
  filePath: string,
  mod: unknown
): CustomQuestion[] {
  if (!mod || typeof mod !== 'object') return [];

  // Skip test/index utility files if accidentally matched
  if (/\.d\.ts$/i.test(filePath) || /\/index\.(ts|js)$/i.test(filePath)) {
    return [];
  }

  const rawExport =
    'default' in (mod as Record<string, unknown>) &&
    (mod as Record<string, unknown>).default !== undefined
      ? (mod as Record<string, unknown>).default
      : mod;

  const container =
    rawExport && typeof rawExport === 'object' && !Array.isArray(rawExport)
      ? (rawExport as Record<string, unknown>)
      : null;

  const rawQuestions: unknown[] = Array.isArray(rawExport)
    ? rawExport
    : container && Array.isArray(container.questions)
    ? container.questions
    : container && Array.isArray(container.items)
    ? container.items
    : [];

  if (rawQuestions.length === 0) return [];

  const fileFolderName =
    (container &&
      typeof (container.groupName ?? container.folderName ?? container.title ?? container.name) ===
        'string' &&
      String(
        container.groupName ?? container.folderName ?? container.title ?? container.name
      ).trim()) ||
    inferFolderNameFromPath(filePath);

  const fileCategoryRaw =
    container &&
    typeof (container.groupType ?? container.categoryType) === 'string'
      ? String(container.groupType ?? container.categoryType).toUpperCase()
      : 'FOLDER';
  const defaultGroupType: QuestionGroupType =
    fileCategoryRaw === 'TOPIC' ? 'TOPIC' : 'FOLDER';

  const fileDefaultActive =
    container && typeof container.isActive === 'boolean' ? container.isActive : true;

  const fileHash = stableHash(filePath);
  const results: CustomQuestion[] = [];

  rawQuestions.forEach((entry, idx) => {
    if (!entry || typeof entry !== 'object') return;
    const item = entry as Record<string, unknown>;

    const prompt = String(item.prompt ?? item.question ?? item.text ?? '').trim();
    const promptImageUrl =
      typeof item.promptImageUrl === 'string' && item.promptImageUrl
        ? item.promptImageUrl
        : undefined;

    if (!prompt && !promptImageUrl) return;

    const stableId =
      typeof item.id === 'string' && item.id.trim()
        ? `repo_${fileHash}_${item.id.trim()}`
        : `repo_${fileHash}_${idx}`;

    const choices = normalizeChoices(item, stableId);
    if (choices.length < 2) return;

    const correctChoiceIndex = resolveCorrectChoiceIndex(item, choices);
    const answerText =
      typeof item.answer === 'string' && item.answer.trim()
        ? item.answer.trim()
        : choices[correctChoiceIndex]?.text || `Option ${correctChoiceIndex + 1}`;

    const itemGroupTypeRaw =
      typeof item.groupType === 'string' ? item.groupType.toUpperCase() : '';
    const groupType: QuestionGroupType =
      itemGroupTypeRaw === 'TOPIC'
        ? 'TOPIC'
        : itemGroupTypeRaw === 'FOLDER'
        ? 'FOLDER'
        : defaultGroupType;

    const groupName =
      typeof (item.groupName ?? item.folderName ?? item.folder) === 'string' &&
      String(item.groupName ?? item.folderName ?? item.folder).trim()
        ? String(item.groupName ?? item.folderName ?? item.folder).trim()
        : fileFolderName;

    const explanation =
      typeof item.explanation === 'string' && item.explanation.trim()
        ? item.explanation.trim()
        : undefined;

    results.push({
      id: stableId,
      prompt: prompt || 'Look at the picture and pick the answer:',
      ...(promptImageUrl ? { promptImageUrl } : {}),
      ...(typeof item.a === 'number' ? { a: item.a } : {}),
      ...(typeof item.b === 'number' ? { b: item.b } : {}),
      answer: answerText,
      ...(explanation ? { explanation } : {}),
      choices,
      correctChoiceIndex,
      groupType,
      groupName,
      isActive: typeof item.isActive === 'boolean' ? item.isActive : fileDefaultActive,
      isPublished: true,
      source: 'BUNDLED',
      createdAt:
        typeof item.createdAt === 'number' && Number.isFinite(item.createdAt)
          ? item.createdAt
          : 1700000000000 + idx,
    });
  });

  return results;
}

export function loadBundledQuestions(): CustomQuestion[] {
  const allModules: Array<[string, unknown]> = [
    ...Object.entries(primaryQuestionModules),
    ...Object.entries(legacyDataQuestionModules),
  ];

  allModules.sort(([pathA], [pathB]) => pathA.localeCompare(pathB));

  const seenIds = new Set<string>();
  const collected: CustomQuestion[] = [];

  for (const [filePath, mod] of allModules) {
    const normalized = normalizeBundledQuestionModule(filePath, mod);
    for (const q of normalized) {
      if (seenIds.has(q.id)) continue;
      seenIds.add(q.id);
      collected.push(q);
    }
  }

  return collected;
}

export const BUNDLED_REPO_QUESTIONS: CustomQuestion[] = loadBundledQuestions();
