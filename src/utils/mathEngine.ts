import {
  AdditionQuestion,
  AttemptRecord,
  CurriculumTier,
  CustomQuestion,
  MatchSession,
  MathStrategy,
  QuestionChoice,
} from '../types/assessment';

export const STRATEGY_LABELS: Record<MathStrategy, string> = {
  SUMS_TO_10: 'Sums to 10',
  DOUBLES: 'Doubles & Near-Doubles',
  BRIDGING_10: 'Bridging Through 10',
  ADD_TEN_TEENS: 'Adding with 10 & Teens',
};

export const TIER_LABELS: Record<CurriculumTier, string> = {
  SUMS_TO_10: '1–10 Foundations',
  BRIDGING_10: '11–20 Make-a-Ten',
  ALL_1_TO_20: 'Full Mix (1–20)',
  MISSED_REVIEW: 'Missed Facts Practice',
  CUSTOM_ACTIVE: 'Active Question Bank',
};

export function classifyStrategy(a: number, b: number): MathStrategy {
  const sum = a + b;
  if (a >= 10 || b >= 10) {
    return 'ADD_TEN_TEENS';
  }
  if (sum <= 10) {
    if (a === b && a >= 2) {
      return 'DOUBLES';
    }
    return 'SUMS_TO_10';
  }
  if (a === b || Math.abs(a - b) === 1) {
    return 'DOUBLES';
  }
  return 'BRIDGING_10';
}

export function getStrategyTip(a: number, b: number): string {
  const sum = a + b;
  const maxVal = Math.max(a, b);
  const minVal = Math.min(a, b);

  if (a === b) {
    return `Doubles fact: ${a} + ${a} is two equal groups of ${a}, making ${sum}.`;
  }
  if (Math.abs(a - b) === 1 && sum > 8) {
    return `Near-double: start with ${minVal} + ${minVal} = ${minVal * 2}, then add 1 more to get ${sum}.`;
  }
  if (maxVal === 10) {
    return `Add to 10: 10 plus ${minVal} ones makes ${sum}.`;
  }
  if (maxVal > 10) {
    const ones = maxVal - 10;
    return `Split the teen number: add the ones (${ones} + ${minVal} = ${ones + minVal}), then add 10 to get ${sum}.`;
  }
  if (sum > 10) {
    const toTen = 10 - maxVal;
    const leftover = minVal - toTen;
    return `Make 10 first: ${maxVal} + ${toTen} = 10, then add the remaining ${leftover} to reach ${sum}.`;
  }
  return `Count on from the larger number: start at ${maxVal} and count up ${minVal} steps to ${sum}.`;
}

export function generateNumericChoices(answer: number, a: number, b: number): number[] {
  const candidates = new Set<number>([answer]);
  const maxBound = Math.max(20, answer + 12);
  const minBound = answer <= 1 ? 0 : answer <= 20 ? 1 : Math.max(0, answer - 12);

  const prioritizedOffsets = [
    a + b === 10 ? 1 : -1,
    1,
    -1,
    2,
    -2,
    a !== b ? a + b - answer : 3,
    answer >= 12 ? -10 : 10,
    3,
    -3,
    4,
    -4,
    5,
    -5,
  ];

  for (const offset of prioritizedOffsets) {
    if (candidates.size >= 4) break;
    const val = answer + offset;
    if (val >= minBound && val <= maxBound && val !== answer) {
      candidates.add(val);
    }
  }

  let fallback = minBound;
  while (candidates.size < 4 && fallback <= maxBound + 15) {
    if (!candidates.has(fallback)) {
      candidates.add(fallback);
    }
    fallback++;
  }

  const arr = Array.from(candidates).slice(0, 4);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function makeEmptyChoices(prefix = 'opt'): QuestionChoice[] {
  return [0, 1, 2, 3].map((i) => ({
    id: `${prefix}-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
    text: '',
  }));
}

export interface ParsedQuestionDraft {
  tempId: string;
  prompt: string;
  promptImageUrl?: string;
  a?: number;
  b?: number;
  choices: QuestionChoice[];
  correctChoiceIndex: number;
  valid: boolean;
  reason?: string;
}

export interface PasteAdjustOptions {
  multiplySymbol?: 'X' | 'x' | '×' | 'KEEP';
  cleanUnnecessarySymbols?: boolean;
}

export function cleanAnswerOrOptionText(raw: string, cleanSymbols = true): string {
  let s = raw.trim();
  if (!cleanSymbols) return s;

  // Strip common correctness checkmarks, bullets, and leading '=' / ':'
  s = s.replace(/[✓✔☑✅•●▪]/g, ' ').trim();
  s = s.replace(/^(?:=>|->|=|:)+\s*/, '').trim();

  // Strip outer wrapping brackets like (B), [13], {24}
  const wrappedMatch = s.match(/^(?:\(([^()]+)\)|\[([^\[\]]+)\]|\{([^{}]+)\})$/);
  if (wrappedMatch) {
    s = (wrappedMatch[1] ?? wrappedMatch[2] ?? wrappedMatch[3] ?? s).trim();
  }

  // Omit unnecessary '/' or '\' (keep only clean numeric fractions like 1/2 if no spaces/extra slashes)
  const isCleanFraction = /^\d+\/\d+$/.test(s);
  if (!isCleanFraction) {
    s = s.replace(/[\\/]+/g, ' ').trim();
  }

  // Strip unnecessary trailing symbols/punctuation (.,;:!_~|*)
  s = s.replace(/[\s.,;:!_~|*]+$/, '').trim();
  // Strip leading stray punctuation (keep '-' for negative numbers or '$' for currency)
  s = s.replace(/^[\s.,;:!_~|*)+]+/, '').trim();

  // Collapse multiple spaces
  return s.replace(/\s{2,}/g, ' ').trim();
}

export function adjustPromptText(
  raw: string,
  opts: Required<PasteAdjustOptions>
): string {
  let s = raw
    .replace(/^(?:Q?\d+\s*[.):\-]\s*|\(\d+\)\s*|[-*•]\s+)/i, '')
    .trim();

  if (opts.multiplySymbol !== 'KEEP') {
    const sym = opts.multiplySymbol;
    s = s.replace(/(\d)\s*(?:\*|×|✕|✖|[xX])\s*(\d|\?)/g, `$1 ${sym} $2`);
    s = s.replace(/(\?)\s*(?:\*|×|✕|✖|[xX])\s*(\d)/g, `$1 ${sym} $2`);
    s = s.replace(/(\d|\?)\s+times\s+(\d|\?)/gi, `$1 ${sym} $2`);
    s = s.replace(/\s+[×✕✖*]\s+/g, ` ${sym} `);
  }

  if (opts.cleanUnnecessarySymbols) {
    // Strip stray checkmarks/bullets
    s = s.replace(/[✓✔☑✅•●▪]/g, ' ');
    // Remove leading or trailing unnecessary slashes / backslashes
    s = s.replace(/^[\\/\s]+/, '').replace(/[\\/\s]+$/, '');
    // Remove stray slashes right after '?' or '=' or before '?' / '=' (e.g. "6 X 4 = ? /")
    s = s.replace(/([?=])\s*[\\/]+/g, '$1');
    s = s.replace(/[\\/]+\s*([?=])/g, ' $1');
    // Remove standalone slash surrounded by spaces if not a fraction/division between digits
    s = s.replace(/([^\d])\s+[\\/]+\s+([^\d])/g, '$1 $2');
    // Collapse trailing duplicate punctuation like "..", "??", ",."
    s = s.replace(/[.,;:_~]+$/g, (m) => (m.includes('?') ? '?' : ''));
  }

  return s.replace(/\s{2,}/g, ' ').trim();
}

function extractArithmeticExpression(text: string): {
  a: number;
  b: number;
  op: '+' | '-' | '*' | '/';
  answer: number;
} | null {
  const match = text.match(/(\d+)\s*(\+|\-|\*|×|✕|✖|x|X|times|÷|\/)\s*(\d+)/);
  if (!match) return null;

  const a = parseInt(match[1], 10);
  const rawOp = match[2].toLowerCase();
  const b = parseInt(match[3], 10);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;

  if (rawOp === '+') {
    return { a, b, op: '+', answer: a + b };
  }
  if (rawOp === '-') {
    return { a, b, op: '-', answer: a - b };
  }
  if (rawOp === '÷' || rawOp === '/') {
    if (b === 0) return null;
    if (a % b !== 0) return null;
    return { a, b, op: '/', answer: a / b };
  }
  return { a, b, op: '*', answer: a * b };
}

function buildNumericQuestionChoices(answer: number, a: number, b: number, prefix: string): {
  choices: QuestionChoice[];
  correctChoiceIndex: number;
} {
  const nums = generateNumericChoices(answer, a, b);
  const choices = nums.map((n, idx) => ({
    id: `${prefix}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
    text: String(n),
  }));
  const correctChoiceIndex = nums.indexOf(answer);
  return { choices, correctChoiceIndex };
}

function parseSingleQuestionBlock(
  blockLines: string[],
  blockIndex: number,
  opts: Required<PasteAdjustOptions>
): ParsedQuestionDraft | null {
  const cleanedLines = blockLines.map((l) => l.trim()).filter(Boolean);
  if (cleanedLines.length === 0) return null;

  // Handle single-line pipe format: "1. 7 + 6 = ? | A) 12 | B) 13 | C) 14 | D) 15 | Answer: 13"
  if (cleanedLines.length === 1 && cleanedLines[0].includes('|')) {
    const parts = cleanedLines[0].split('|').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 3) {
      const rawPrompt = adjustPromptText(parts[0], opts);
      const optionParts: string[] = [];
      let answerRaw: string | null = null;

      for (let i = 1; i < parts.length; i++) {
        const part = parts[i];
        const ansMatch = part.match(/^(?:answer|ans|correct)\s*[:=]\s*(.+)$/i);
        if (ansMatch) {
          answerRaw = cleanAnswerOrOptionText(ansMatch[1], opts.cleanUnnecessarySymbols);
        } else {
          optionParts.push(part);
        }
      }

      if (optionParts.length >= 2) {
        const parsedOptions = optionParts.slice(0, 4).map((opt) => {
          const isStarred = opt.startsWith('*') || opt.endsWith('*') || opt.includes('✓');
          const withoutPrefix = opt
            .replace(/^\*\s*/, '')
            .replace(/\s*\*$/, '')
            .replace(/^(?:\(?[A-D]\)|[A-D][.):])\s*/i, '')
            .trim();
          const text = cleanAnswerOrOptionText(withoutPrefix, opts.cleanUnnecessarySymbols);
          return { text, isStarred };
        });

        while (parsedOptions.length < 4) {
          parsedOptions.push({ text: '', isStarred: false });
        }

        let correctIdx = parsedOptions.findIndex((o) => o.isStarred);
        if (correctIdx === -1 && answerRaw) {
          const letterMatch = answerRaw.match(/^([A-D])$/i);
          if (letterMatch) {
            correctIdx = letterMatch[1].toUpperCase().charCodeAt(0) - 65;
          } else {
            correctIdx = parsedOptions.findIndex(
              (o) => o.text.toLowerCase() === answerRaw!.toLowerCase()
            );
          }
        }

        const expr = extractArithmeticExpression(rawPrompt);
        const a = expr?.a;
        const b = expr?.b;
        if (correctIdx === -1 && expr) {
          const ansStr = String(expr.answer);
          correctIdx = parsedOptions.findIndex((o) => o.text === ansStr);
        }

        const choices: QuestionChoice[] = parsedOptions.map((o, idx) => ({
          id: `draft-${blockIndex}-opt-${idx}-${Math.random().toString(36).slice(2, 5)}`,
          text: o.text,
        }));

        const valid =
          rawPrompt.length > 0 &&
          choices.filter((c) => c.text.trim().length > 0).length >= 2 &&
          correctIdx >= 0 &&
          correctIdx < 4 &&
          choices[correctIdx].text.trim().length > 0;

        return {
          tempId: `draft-${blockIndex}-${Math.random().toString(36).slice(2, 6)}`,
          prompt: rawPrompt,
          a,
          b,
          choices,
          correctChoiceIndex: valid ? correctIdx : Math.max(0, correctIdx),
          valid,
          reason: valid ? undefined : 'Select the correct answer option',
        };
      }
    }
  }

  // Multi-line MCQ block detection:
  const optionRegex = /^(\*?\s*)?(?:\(?([A-D])\)|([A-D])[.):])\s+(.+)$/i;
  const answerLineRegex = /^(?:answer|ans|correct(?:\s+answer)?)\s*[:=\-]\s*(.+)$/i;

  const promptParts: string[] = [];
  const extractedOpts: Array<{ letter?: string; text: string; isStarred: boolean }> = [];
  let explicitAnswerText: string | null = null;

  for (const line of cleanedLines) {
    const ansMatch = line.match(answerLineRegex);
    if (ansMatch) {
      explicitAnswerText = cleanAnswerOrOptionText(
        ansMatch[1],
        opts.cleanUnnecessarySymbols
      );
      continue;
    }
    const optMatch = line.match(optionRegex);
    if (optMatch) {
      const hasLeadingStar = Boolean(optMatch[1]?.includes('*'));
      let text = optMatch[4].trim();
      const hasTrailingStar = text.endsWith('*') || text.includes('✓');
      if (text.endsWith('*')) text = text.slice(0, -1).trim();
      text = cleanAnswerOrOptionText(text, opts.cleanUnnecessarySymbols);
      extractedOpts.push({
        letter: (optMatch[2] || optMatch[3]).toUpperCase(),
        text,
        isStarred: hasLeadingStar || hasTrailingStar,
      });
      continue;
    }
    if (extractedOpts.length === 0) {
      promptParts.push(line);
    }
  }

  if (extractedOpts.length >= 2) {
    const rawPrompt = adjustPromptText(promptParts.join(' '), opts);

    const paddedOpts = extractedOpts.slice(0, 4);
    while (paddedOpts.length < 4) {
      paddedOpts.push({ text: '', isStarred: false });
    }

    let correctIdx = paddedOpts.findIndex((o) => o.isStarred);
    if (correctIdx === -1 && explicitAnswerText) {
      const letterOnly = explicitAnswerText.match(/^([A-D])(?:\s*[.):]\s*.*)?$/i);
      if (letterOnly) {
        const targetLetter = letterOnly[1].toUpperCase();
        const byLetter = paddedOpts.findIndex((o) => o.letter === targetLetter);
        if (byLetter !== -1) {
          correctIdx = byLetter;
        } else {
          correctIdx = targetLetter.charCodeAt(0) - 65;
        }
      }
      if (correctIdx === -1) {
        correctIdx = paddedOpts.findIndex(
          (o) => o.text.toLowerCase() === explicitAnswerText!.toLowerCase()
        );
      }
    }

    const expr = extractArithmeticExpression(rawPrompt);
    const a = expr?.a;
    const b = expr?.b;
    if (correctIdx === -1 && expr) {
      const ansStr = String(expr.answer);
      correctIdx = paddedOpts.findIndex((o) => o.text === ansStr);
    }

    const choices: QuestionChoice[] = paddedOpts.map((o, idx) => ({
      id: `draft-${blockIndex}-opt-${idx}-${Math.random().toString(36).slice(2, 5)}`,
      text: o.text,
    }));

    const valid =
      rawPrompt.length > 0 &&
      choices.filter((c) => c.text.trim().length > 0).length >= 2 &&
      correctIdx >= 0 &&
      correctIdx < 4 &&
      choices[correctIdx].text.trim().length > 0;

    return {
      tempId: `draft-${blockIndex}-${Math.random().toString(36).slice(2, 6)}`,
      prompt: rawPrompt,
      a,
      b,
      choices,
      correctChoiceIndex: valid ? correctIdx : 0,
      valid,
      reason: valid ? undefined : 'Mark which option is the correct answer',
    };
  }

  // Fallback for simple 1-line equation or "question | answer"
  const singleLine = cleanedLines.join(' ').trim();
  if (!singleLine) return null;

  let promptText = adjustPromptText(singleLine, opts);
  let explicitNumericAnswer: number | null = null;
  let explicitStringAnswer: string | null = null;

  if (singleLine.includes('|')) {
    const [left, right] = singleLine.split('|').map((s) => s.trim());
    promptText = adjustPromptText(left, opts);
    explicitStringAnswer = cleanAnswerOrOptionText(right, opts.cleanUnnecessarySymbols);
    const numMatch = explicitStringAnswer.match(/^-?\d+$/);
    if (numMatch) explicitNumericAnswer = parseInt(numMatch[0], 10);
  } else if (explicitAnswerText !== null) {
    promptText = adjustPromptText(promptParts.join(' '), opts);
    explicitStringAnswer = explicitAnswerText;
    const numMatch = explicitAnswerText.match(/^-?\d+$/);
    if (numMatch) explicitNumericAnswer = parseInt(numMatch[0], 10);
  } else {
    const ansTagMatch = singleLine.match(/^(.*?)\s*(?:answer|ans)\s*[:=]\s*(.+)\s*$/i);
    if (ansTagMatch) {
      promptText = adjustPromptText(ansTagMatch[1], opts);
      explicitStringAnswer = cleanAnswerOrOptionText(
        ansTagMatch[2],
        opts.cleanUnnecessarySymbols
      );
      const numMatch = explicitStringAnswer.match(/^-?\d+$/);
      if (numMatch) explicitNumericAnswer = parseInt(numMatch[0], 10);
    }
  }

  // Pure single arithmetic equation (e.g. "6 * 4 = ?", "7 times 8", "8 + 5", "15 - 6", "24 ÷ 6")
  const pureEqMatch = promptText.match(
    /^(\d+)\s*(\+|\-|\*|×|✕|✖|x|X|times|÷|\/)\s*(\d+)(?:\s*=\s*(\?|\d+))?$/
  );
  if (pureEqMatch) {
    const expr = extractArithmeticExpression(promptText);
    if (expr) {
      const ans = explicitNumericAnswer !== null ? explicitNumericAnswer : expr.answer;
      const { choices, correctChoiceIndex } = buildNumericQuestionChoices(
        ans,
        expr.a,
        expr.b,
        `draft-${blockIndex}`
      );
      const displayOp =
        expr.op === '*'
          ? opts.multiplySymbol === 'KEEP'
            ? pureEqMatch[2]
            : opts.multiplySymbol
          : expr.op === '/'
          ? pureEqMatch[2] === '÷'
            ? '÷'
            : '/'
          : expr.op;

      return {
        tempId: `draft-${blockIndex}-${Math.random().toString(36).slice(2, 6)}`,
        prompt: `${expr.a} ${displayOp} ${expr.b} = ?`,
        a: expr.a,
        b: expr.b,
        choices,
        correctChoiceIndex,
        valid: true,
      };
    }
  }

  // Word problem or embedded arithmetic without explicit string answer
  const embeddedExpr = extractArithmeticExpression(promptText);
  if (embeddedExpr && explicitStringAnswer === null) {
    const { choices, correctChoiceIndex } = buildNumericQuestionChoices(
      embeddedExpr.answer,
      embeddedExpr.a,
      embeddedExpr.b,
      `draft-${blockIndex}`
    );
    return {
      tempId: `draft-${blockIndex}-${Math.random().toString(36).slice(2, 6)}`,
      prompt: promptText,
      a: embeddedExpr.a,
      b: embeddedExpr.b,
      choices,
      correctChoiceIndex,
      valid: true,
    };
  }

  if (explicitNumericAnswer !== null && promptText.length > 0) {
    const a = Math.max(1, Math.floor(explicitNumericAnswer / 2));
    const b = Math.max(1, explicitNumericAnswer - a);
    const { choices, correctChoiceIndex } = buildNumericQuestionChoices(
      explicitNumericAnswer,
      a,
      b,
      `draft-${blockIndex}`
    );
    return {
      tempId: `draft-${blockIndex}-${Math.random().toString(36).slice(2, 6)}`,
      prompt: promptText,
      choices,
      correctChoiceIndex,
      valid: true,
    };
  }

  if (explicitStringAnswer && promptText.length > 0) {
    const choices = makeEmptyChoices(`draft-${blockIndex}`);
    choices[0].text = explicitStringAnswer;
    return {
      tempId: `draft-${blockIndex}-${Math.random().toString(36).slice(2, 6)}`,
      prompt: promptText,
      choices,
      correctChoiceIndex: 0,
      valid: false,
      reason: 'Add at least 2 answer options for this custom question',
    };
  }

  return {
    tempId: `draft-${blockIndex}-${Math.random().toString(36).slice(2, 6)}`,
    prompt: promptText,
    choices: makeEmptyChoices(`draft-${blockIndex}`),
    correctChoiceIndex: 0,
    valid: false,
    reason: 'Add multiple-choice options (A, B, C, D) and mark the answer',
  };
}

export function parsePastedQuestions(
  rawText: string,
  options: PasteAdjustOptions = {}
): ParsedQuestionDraft[] {
  const resolvedOpts: Required<PasteAdjustOptions> = {
    multiplySymbol: options.multiplySymbol ?? 'X',
    cleanUnnecessarySymbols: options.cleanUnnecessarySymbols ?? true,
  };

  const lines = rawText.split(/\r?\n/);

  // Split into question blocks by blank lines OR by numbered question starts when no blank lines exist
  const blocks: string[][] = [];
  let currentBlock: string[] = [];

  const isQuestionStart = (line: string) =>
    /^(?:Q?\d+\s*[.):\-]\s+|\(\d+\)\s+|\d+\s*(?:\+|\-|\*|×|x|X|times|÷|\/)\s*\d+)/i.test(
      line.trim()
    );

  const hasOptionLines = lines.some((l) => /^\s*(?:\*?\s*)?(?:\(?[A-D]\)|[A-D][.):])\s+/i.test(l));

  if (hasOptionLines) {
    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed) {
        if (currentBlock.length > 0) {
          blocks.push(currentBlock);
          currentBlock = [];
        }
        continue;
      }

      const currentHasOptions = currentBlock.some((l) =>
        /^(?:\*?\s*)?(?:\(?[A-D]\)|[A-D][.):])\s+/i.test(l)
      );
      if (currentHasOptions && isQuestionStart(trimmed) && !/^(?:\(?[A-D]\)|[A-D][.):])/i.test(trimmed)) {
        blocks.push(currentBlock);
        currentBlock = [trimmed];
      } else {
        currentBlock.push(trimmed);
      }
    }
    if (currentBlock.length > 0) {
      blocks.push(currentBlock);
    }
  } else {
    // Simple line-by-line or comma-separated mode
    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed) continue;
      if (!trimmed.includes('|') && /[,;]/.test(trimmed)) {
        const parts = trimmed.split(/[,;]+/).map((p) => p.trim()).filter(Boolean);
        if (
          parts.length > 1 &&
          parts.every((p) => /\d+\s*(?:\+|\-|\*|×|x|X|times|÷|\/)\s*\d+/.test(p))
        ) {
          parts.forEach((p) => blocks.push([p]));
          continue;
        }
      }
      blocks.push([trimmed]);
    }
  }

  const parsed: ParsedQuestionDraft[] = [];
  blocks.forEach((blk, idx) => {
    const item = parseSingleQuestionBlock(blk, idx, resolvedOpts);
    if (item) parsed.push(item);
  });

  return parsed;
}

export async function compressImageFile(
  file: File,
  maxWidth = 480,
  maxHeight = 320
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file'));
      img.onload = () => {
        const ratio = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
        const width = Math.max(1, Math.round(img.width * ratio));
        const height = Math.max(1, Math.round(img.height * ratio));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function generateQuestion(
  tier: CurriculumTier,
  missedPairs: Array<{ a: number; b: number }> = [],
  lastKey?: string,
  customQuestions: CustomQuestion[] = [],
  selectedGroupKey?: string | null
): AdditionQuestion {
  const activeCustom = customQuestions.filter((q) => q.isActive);
  const scopedCustom = selectedGroupKey
    ? activeCustom.filter((q) => `${q.groupType}::${q.groupName}` === selectedGroupKey)
    : activeCustom;
  const customPool = scopedCustom.length > 0 ? scopedCustom : activeCustom;

  if (tier === 'CUSTOM_ACTIVE' && customPool.length > 0) {
    let pool = customPool;
    if (customPool.length > 1 && lastKey) {
      const filtered = customPool.filter(
        (q) => q.prompt !== lastKey && `${q.a}+${q.b}` !== lastKey
      );
      if (filtered.length > 0) pool = filtered;
    }
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    const validChoices = chosen.choices.filter(
      (c) => c.text.trim().length > 0 || Boolean(c.imageUrl)
    );
    const correctChoice = chosen.choices[chosen.correctChoiceIndex] ?? validChoices[0];
    const shuffled = [...validChoices].sort(() => Math.random() - 0.5);
    const newCorrectIdx = Math.max(
      0,
      shuffled.findIndex((c) => c.id === correctChoice?.id)
    );

    const numericAns = parseInt(chosen.answer, 10);
    const isNumeric = !Number.isNaN(numericAns);
    const a = chosen.a ?? (isNumeric ? Math.min(10, Math.max(1, Math.floor(numericAns / 2))) : 1);
    const b = chosen.b ?? (isNumeric ? Math.max(1, numericAns - a) : 1);

    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      prompt: chosen.prompt,
      promptImageUrl: chosen.promptImageUrl,
      a,
      b,
      answer: isNumeric ? numericAns : 0,
      answerText: chosen.answer || correctChoice?.text || '',
      ...(chosen.explanation ? { explanation: chosen.explanation } : {}),
      choices: shuffled,
      correctChoiceIndex: newCorrectIdx,
      strategy: classifyStrategy(a, b),
      groupLabel: `${chosen.groupType === 'FOLDER' ? 'Folder' : 'Topic'}: ${chosen.groupName}`,
      isCustom: true,
    };
  }

  let a = 1;
  let b = 1;

  for (let attempt = 0; attempt < 15; attempt++) {
    if (tier === 'MISSED_REVIEW' && missedPairs.length > 0 && Math.random() < 0.75) {
      const pick = missedPairs[Math.floor(Math.random() * missedPairs.length)];
      if (Math.random() < 0.5) {
        a = pick.a;
        b = pick.b;
      } else {
        a = pick.b;
        b = pick.a;
      }
    } else if (tier === 'SUMS_TO_10') {
      const targetSum = 2 + Math.floor(Math.random() * 9);
      a = 1 + Math.floor(Math.random() * (targetSum - 1));
      b = targetSum - a;
    } else if (tier === 'BRIDGING_10') {
      if (Math.random() < 0.8) {
        a = 2 + Math.floor(Math.random() * 8);
        const minB = Math.max(11 - a, 2);
        b = minB + Math.floor(Math.random() * (9 - minB + 1));
      } else {
        a = 10 + Math.floor(Math.random() * 7);
        b = 1 + Math.floor(Math.random() * (20 - a));
      }
    } else {
      const roll = Math.random();
      if (roll < 0.35) {
        const targetSum = 2 + Math.floor(Math.random() * 9);
        a = 1 + Math.floor(Math.random() * (targetSum - 1));
        b = targetSum - a;
      } else if (roll < 0.75) {
        a = 2 + Math.floor(Math.random() * 8);
        const minB = Math.max(11 - a, 2);
        b = minB + Math.floor(Math.random() * (9 - minB + 1));
      } else {
        a = 10 + Math.floor(Math.random() * 9);
        b = 1 + Math.floor(Math.random() * (20 - a));
      }
    }

    const key = `${a}+${b}`;
    if (key !== lastKey) {
      break;
    }
  }

  if (Math.random() < 0.5) {
    [a, b] = [b, a];
  }

  const answer = a + b;
  const { choices, correctChoiceIndex } = buildNumericQuestionChoices(answer, a, b, 'std');

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    a,
    b,
    answer,
    answerText: String(answer),
    choices,
    correctChoiceIndex,
    strategy: classifyStrategy(a, b),
    isCustom: false,
  };
}

export function extractMissedPairs(sessions: MatchSession[]): Array<{ a: number; b: number; misses: number; lastAnswered: number }> {
  const map = new Map<string, { a: number; b: number; misses: number; lastAnswered: number }>();

  for (const session of sessions) {
    for (const att of session.attempts) {
      if (att.player !== 'BLUE' || att.isCustom) continue;
      const minV = Math.min(att.a, att.b);
      const maxV = Math.max(att.a, att.b);
      const key = `${minV}+${maxV}`;
      const existing = map.get(key) ?? { a: minV, b: maxV, misses: 0, lastAnswered: 0 };
      if (!att.isCorrect) {
        existing.misses += 1;
      } else if (existing.misses > 0) {
        existing.misses = Math.max(0, existing.misses - 0.5);
      }
      existing.lastAnswered = Math.max(existing.lastAnswered, att.timestamp);
      map.set(key, existing);
    }
  }

  return Array.from(map.values())
    .filter((item) => item.misses > 0)
    .sort((x, y) => y.misses - x.misses);
}

function escapeCsv(val: string | number): string {
  const s = String(val);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function exportAttemptsCsv(sessions: MatchSession[]): void {
  const rows: string[] = [
    'SessionID,Date,Mode,Tier,PlayerTeam,PlayerName,Question,CorrectAnswer,StudentChoice,IsCorrect,ResponseTimeMs,Strategy,UsedHint',
  ];

  for (const s of sessions) {
    const dateStr = new Date(s.startedAt).toISOString();
    for (const a of s.attempts) {
      rows.push(
        [
          escapeCsv(s.id),
          escapeCsv(dateStr),
          escapeCsv(s.mode),
          escapeCsv(s.tier),
          escapeCsv(a.player),
          escapeCsv(a.playerName ?? (a.player === 'BLUE' ? 'Student' : 'Opponent')),
          escapeCsv(a.prompt ?? `${a.a} + ${a.b}`),
          escapeCsv(a.correctAnswerText ?? a.correctAnswer),
          escapeCsv(a.chosenAnswerText ?? a.chosenAnswer),
          a.isCorrect ? 'YES' : 'NO',
          a.responseTimeMs,
          escapeCsv(STRATEGY_LABELS[a.strategy]),
          a.usedHint ? 'YES' : 'NO',
        ].join(',')
      );
    }
  }

  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `tugofwar-assessment-${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function getMasteryStatus(accuracy: number, count: number): {
  label: 'Mastered' | 'Developing' | 'Needs Practice' | 'Not Tested';
  tone: 'emerald' | 'amber' | 'rose' | 'slate';
} {
  if (count === 0) return { label: 'Not Tested', tone: 'slate' };
  if (accuracy >= 85 && count >= 3) return { label: 'Mastered', tone: 'emerald' };
  if (accuracy >= 65) return { label: 'Developing', tone: 'amber' };
  return { label: 'Needs Practice', tone: 'rose' };
}

export function summarizeAttempts(attempts: AttemptRecord[]) {
  const total = attempts.length;
  const correct = attempts.filter((a) => a.isCorrect).length;
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
  const avgTimeMs =
    total > 0
      ? Math.round(attempts.reduce((sum, a) => sum + a.responseTimeMs, 0) / total)
      : 0;
  return { total, correct, accuracy, avgTimeMs };
}
