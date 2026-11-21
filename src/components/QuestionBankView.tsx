import React, { useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  ClipboardPaste,
  Folder,
  Tag,
  Play,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Plus,
  X,
  ImagePlus,
  Cloud,
  Link2,
  Download,
  Upload,
  LogIn,
  LogOut,
  Loader2,
} from 'lucide-react';
import {
  CustomQuestion,
  QuestionChoice,
  QuestionGroupType,
} from '../types/assessment';
import {
  ParsedQuestionDraft,
  PasteAdjustOptions,
  compressImageFile,
  makeEmptyChoices,
  parsePastedQuestions,
} from '../utils/mathEngine';
import {
  encodeSharedFolderUrl,
  exportQuestionsJsonFile,
  parseImportedQuestionsJson,
} from '../utils/cloudSync';

interface QuestionBankViewProps {
  questions: CustomQuestion[];
  user: User | null;
  unsyncedCount: number;
  cloudSyncBusy: boolean;
  cloudMessage: string | null;
  cloudError: string | null;
  onSignIn: () => void;
  onSignOut: () => void;
  onSyncLocalToCloud: () => void;
  onImportQuestions: (imported: CustomQuestion[]) => Promise<void> | void;
  onSaveQuestions: (newItems: CustomQuestion[]) => Promise<void> | void;
  onToggleQuestionActive: (id: string) => void;
  onToggleGroupActive: (groupType: QuestionGroupType, groupName: string, active: boolean) => void;
  onDeleteQuestion: (id: string) => void;
  onDeleteGroup: (groupType: QuestionGroupType, groupName: string) => void;
  onPlayActiveQuestions: () => void;
}

const SAMPLE_PASTE_TEXT = `1. 8 times 5 = ? /
A) 35/
B) 40.
C) 45,
D) 50;
Answer: B/

2. 7 * 6 = ? | A) 36 | B) 42/ | C) 48 | D) 54 | Answer: 42.

3. Maya has 9 stickers and gets 7 more. How many total?
A) 14
B) 15
C) 16 ✓
D) 17`;

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

const VERCEL_DOMAIN_KEY = 'ropesum_share_base_url_v1';

export const QuestionBankView: React.FC<QuestionBankViewProps> = ({
  questions,
  user,
  unsyncedCount,
  cloudSyncBusy,
  cloudMessage,
  cloudError,
  onSignIn,
  onSignOut,
  onSyncLocalToCloud,
  onImportQuestions,
  onSaveQuestions,
  onToggleQuestionActive,
  onToggleGroupActive,
  onDeleteQuestion,
  onDeleteGroup,
  onPlayActiveQuestions,
}) => {
  const [creatorTab, setCreatorTab] = useState<'PASTE' | 'CUSTOM'>('PASTE');

  // Copy-paste importer state
  const [rawText, setRawText] = useState<string>('');
  const [drafts, setDrafts] = useState<ParsedQuestionDraft[]>([]);
  const [clipboardMessage, setClipboardMessage] = useState<string | null>(null);
  const [multiplySymbol, setMultiplySymbol] = useState<NonNullable<PasteAdjustOptions['multiplySymbol']>>('X');
  const [cleanSymbols, setCleanSymbols] = useState<boolean>(true);

  // Custom picture/text question builder state
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [customPromptImage, setCustomPromptImage] = useState<string | undefined>(undefined);
  const [customChoices, setCustomChoices] = useState<QuestionChoice[]>(() =>
    makeEmptyChoices('custom')
  );
  const [customCorrectIdx, setCustomCorrectIdx] = useState<number>(0);

  // Shared Folder / Topic save controls
  const [groupType, setGroupType] = useState<QuestionGroupType>('FOLDER');
  const [groupName, setGroupName] = useState<string>('');
  const [saveAsActive, setSaveAsActive] = useState<boolean>(true);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  // Cross-domain / Vercel share controls
  const [shareBaseUrl, setShareBaseUrl] = useState<string>(() => {
    try {
      return localStorage.getItem(VERCEL_DOMAIN_KEY) || '';
    } catch {
      return '';
    }
  });
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  // Library filter state
  const [filterMode, setFilterMode] = useState<'ALL' | 'ACTIVE' | string>('ALL');

  const reparseText = (
    value: string,
    sym: NonNullable<PasteAdjustOptions['multiplySymbol']> = multiplySymbol,
    clean: boolean = cleanSymbols
  ) => {
    if (!value.trim()) {
      setDrafts([]);
      return;
    }
    setDrafts(
      parsePastedQuestions(value, {
        multiplySymbol: sym,
        cleanUnnecessarySymbols: clean,
      })
    );
  };

  const handleTextChange = (value: string) => {
    setRawText(value);
    setSaveSuccessMessage(null);
    reparseText(value, multiplySymbol, cleanSymbols);
  };

  const handleMultiplySymbolChange = (
    nextSym: NonNullable<PasteAdjustOptions['multiplySymbol']>
  ) => {
    setMultiplySymbol(nextSym);
    reparseText(rawText, nextSym, cleanSymbols);
  };

  const handleCleanSymbolsToggle = (nextClean: boolean) => {
    setCleanSymbols(nextClean);
    reparseText(rawText, multiplySymbol, nextClean);
  };

  const handlePasteFromClipboard = async () => {
    setClipboardMessage(null);
    try {
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        setClipboardMessage(
          'Clipboard button unavailable here — paste directly inside the box with Ctrl+V / Cmd+V.'
        );
        return;
      }
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setClipboardMessage('Clipboard is empty. Copy some questions first, then paste.');
        return;
      }
      handleTextChange(text);
    } catch {
      setClipboardMessage(
        'Browser blocked clipboard read — click the text box and press Ctrl+V / Cmd+V.'
      );
    }
  };

  const validateDraft = (d: ParsedQuestionDraft): ParsedQuestionDraft => {
    const filledCount = d.choices.filter(
      (c) => c.text.trim().length > 0 || Boolean(c.imageUrl)
    ).length;
    const correctChoice = d.choices[d.correctChoiceIndex];
    const hasValidCorrect =
      Boolean(correctChoice) &&
      (correctChoice.text.trim().length > 0 || Boolean(correctChoice.imageUrl));
    const valid = d.prompt.trim().length > 0 && filledCount >= 2 && hasValidCorrect;
    return {
      ...d,
      valid,
      reason: valid ? undefined : 'Needs prompt, at least 2 options, and a selected answer',
    };
  };

  const handleDraftPromptChange = (tempId: string, prompt: string) => {
    setDrafts((prev) =>
      prev.map((d) => (d.tempId === tempId ? validateDraft({ ...d, prompt }) : d))
    );
  };

  const handleDraftChoiceTextChange = (tempId: string, choiceIdx: number, text: string) => {
    setDrafts((prev) =>
      prev.map((d) => {
        if (d.tempId !== tempId) return d;
        const nextChoices = d.choices.map((c, idx) => (idx === choiceIdx ? { ...c, text } : c));
        return validateDraft({ ...d, choices: nextChoices });
      })
    );
  };

  const handleDraftCorrectChange = (tempId: string, correctChoiceIndex: number) => {
    setDrafts((prev) =>
      prev.map((d) =>
        d.tempId === tempId ? validateDraft({ ...d, correctChoiceIndex }) : d
      )
    );
  };

  const handleDraftPromptImageUpload = async (tempId: string, file?: File) => {
    if (!file) return;
    setImageError(null);
    try {
      const dataUrl = await compressImageFile(file, 480, 320);
      setDrafts((prev) =>
        prev.map((d) => (d.tempId === tempId ? { ...d, promptImageUrl: dataUrl } : d))
      );
    } catch {
      setImageError('Could not process that image file. Please try PNG, JPG, or WebP.');
    }
  };

  const handleDraftChoiceImageUpload = async (
    tempId: string,
    choiceIdx: number,
    file?: File
  ) => {
    if (!file) return;
    setImageError(null);
    try {
      const dataUrl = await compressImageFile(file, 260, 200);
      setDrafts((prev) =>
        prev.map((d) => {
          if (d.tempId !== tempId) return d;
          const nextChoices = d.choices.map((c, idx) =>
            idx === choiceIdx ? { ...c, imageUrl: dataUrl } : c
          );
          return validateDraft({ ...d, choices: nextChoices });
        })
      );
    } catch {
      setImageError('Could not process that option image. Please try PNG, JPG, or WebP.');
    }
  };

  const handleRemoveDraft = (tempId: string) => {
    setDrafts((prev) => prev.filter((d) => d.tempId !== tempId));
  };

  // Custom Builder Image Handlers
  const handleCustomPromptImage = async (file?: File) => {
    if (!file) return;
    setImageError(null);
    try {
      const dataUrl = await compressImageFile(file, 480, 320);
      setCustomPromptImage(dataUrl);
    } catch {
      setImageError('Could not process that question image.');
    }
  };

  const handleCustomChoiceImage = async (choiceIdx: number, file?: File) => {
    if (!file) return;
    setImageError(null);
    try {
      const dataUrl = await compressImageFile(file, 260, 200);
      setCustomChoices((prev) =>
        prev.map((c, idx) => (idx === choiceIdx ? { ...c, imageUrl: dataUrl } : c))
      );
    } catch {
      setImageError('Could not process that option image.');
    }
  };

  const existingGroups = useMemo(() => {
    const map = new Map<
      string,
      { groupType: QuestionGroupType; groupName: string; total: number; active: number }
    >();
    for (const q of questions) {
      const key = `${q.groupType}::${q.groupName}`;
      const cur = map.get(key) ?? {
        groupType: q.groupType,
        groupName: q.groupName,
        total: 0,
        active: 0,
      };
      cur.total += 1;
      if (q.isActive) cur.active += 1;
      map.set(key, cur);
    }
    return Array.from(map.values());
  }, [questions]);

  const matchingGroupsForSelector = useMemo(
    () => existingGroups.filter((g) => g.groupType === groupType),
    [existingGroups, groupType]
  );

  const validDrafts = drafts.filter((d) => d.valid);
  const customFilledChoices = customChoices.filter(
    (c) => c.text.trim().length > 0 || Boolean(c.imageUrl)
  );
  const customCorrectChoice = customChoices[customCorrectIdx];
  const isCustomQuestionValid =
    (customPrompt.trim().length > 0 || Boolean(customPromptImage)) &&
    customFilledChoices.length >= 2 &&
    Boolean(customCorrectChoice) &&
    (customCorrectChoice.text.trim().length > 0 || Boolean(customCorrectChoice.imageUrl));

  const trimmedGroupName = groupName.trim();
  const readyCount = creatorTab === 'PASTE' ? validDrafts.length : isCustomQuestionValid ? 1 : 0;
  const canSave = readyCount > 0 && trimmedGroupName.length > 0;

  const handleSaveBatch = () => {
    if (!canSave) return;
    const now = Date.now();

    if (creatorTab === 'PASTE') {
      const newItems: CustomQuestion[] = validDrafts.map((d, idx) => {
        const chosenOpt = d.choices[d.correctChoiceIndex];
        return {
          id: `cq-${now}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
          prompt: d.prompt.trim(),
          promptImageUrl: d.promptImageUrl,
          a: d.a,
          b: d.b,
          answer: chosenOpt?.text.trim() || `Option ${OPTION_LETTERS[d.correctChoiceIndex]}`,
          choices: d.choices,
          correctChoiceIndex: d.correctChoiceIndex,
          groupType,
          groupName: trimmedGroupName,
          isActive: saveAsActive,
          createdAt: now + idx,
        };
      });

      onSaveQuestions(newItems);
      setRawText('');
      setDrafts([]);
      setSaveSuccessMessage(
        `Saved ${newItems.length} ${newItems.length === 1 ? 'question' : 'questions'} to ${
          groupType === 'FOLDER' ? 'Folder' : 'Topic'
        } "${trimmedGroupName}"${saveAsActive ? ' and added to Active Questions' : ''}.`
      );
    } else {
      const chosenOpt = customChoices[customCorrectIdx];
      const newItem: CustomQuestion = {
        id: `cq-${now}-${Math.random().toString(36).slice(2, 6)}`,
        prompt: customPrompt.trim() || 'Look at the picture and pick the answer:',
        promptImageUrl: customPromptImage,
        answer:
          chosenOpt?.text.trim() || `Option ${OPTION_LETTERS[customCorrectIdx]}`,
        choices: customChoices,
        correctChoiceIndex: customCorrectIdx,
        groupType,
        groupName: trimmedGroupName,
        isActive: saveAsActive,
        createdAt: now,
      };

      onSaveQuestions([newItem]);
      setCustomPrompt('');
      setCustomPromptImage(undefined);
      setCustomChoices(makeEmptyChoices('custom'));
      setCustomCorrectIdx(0);
      setSaveSuccessMessage(
        `Saved custom question to ${
          groupType === 'FOLDER' ? 'Folder' : 'Topic'
        } "${trimmedGroupName}"${saveAsActive ? ' and added to Active Questions' : ''}.`
      );
    }
  };

  const activeCount = questions.filter((q) => q.isActive).length;

  const filteredQuestions = useMemo(() => {
    if (filterMode === 'ALL') return questions;
    if (filterMode === 'ACTIVE') return questions.filter((q) => q.isActive);
    return questions.filter((q) => `${q.groupType}::${q.groupName}` === filterMode);
  }, [filterMode, questions]);

  const activeFilterGroup = useMemo(() => {
    if (filterMode === 'ALL' || filterMode === 'ACTIVE') return null;
    return existingGroups.find((g) => `${g.groupType}::${g.groupName}` === filterMode) ?? null;
  }, [existingGroups, filterMode]);

  const handleImportJsonFile = async (file?: File) => {
    if (!file) return;
    setShareFeedback(null);
    try {
      const text = await file.text();
      const imported = parseImportedQuestionsJson(text);
      if (imported.length === 0) {
        setShareFeedback('No valid questions found in that JSON file.');
        return;
      }
      await onImportQuestions(imported);
      setShareFeedback(
        `Imported ${imported.length} ${imported.length === 1 ? 'question' : 'questions'} to Active Pool.`
      );
    } catch {
      setShareFeedback('Could not read that file. Please select a valid .ropesum.json export.');
    }
  };

  const handleCopyGroupShareLink = async (
    grpType: QuestionGroupType,
    grpName: string
  ) => {
    const grpQuestions = questions.filter(
      (q) => q.groupType === grpType && q.groupName === grpName
    );
    if (grpQuestions.length === 0) return;

    const targetOrigin = shareBaseUrl.trim() || window.location.origin;
    const { url, truncated } = encodeSharedFolderUrl(
      targetOrigin,
      grpType,
      grpName,
      grpQuestions
    );
    try {
      await navigator.clipboard.writeText(url);
      setShareFeedback(
        truncated
          ? `Copied share link for "${grpName}" (long URL — for large sets or images, use Export JSON).`
          : `Copied share link for "${grpName}". Open it on Vercel or any browser to load this folder immediately.`
      );
    } catch {
      setShareFeedback(`Share link ready: ${url.slice(0, 80)}...`);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Question Bank &amp; Customizer</h1>
          <p className="mt-1 text-sm text-slate-600">
            Copy-paste multiple-choice questions or customize questions with pictures, save to a folder or topic, and sync across AI Studio &amp; Vercel.
          </p>
        </div>

        <button
          onClick={onPlayActiveQuestions}
          disabled={activeCount === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 whitespace-nowrap shrink-0"
        >
          <Play className="h-4 w-4" />
          Play Active Questions ({activeCount})
        </button>
      </div>

      {/* Cloud Sync & Cross-Domain Vercel Sharing Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <Cloud className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
            <div>
              <div className="text-xs font-semibold text-slate-900">
                {user
                  ? `Cloud Sync Active (${user.email || 'Signed In'})`
                  : 'Sync Folders Across AI Studio & Vercel'}
              </div>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {user
                  ? 'Active folders are published to Cloud Firestore so opening your Vercel link loads them automatically.'
                  : 'Sign in with Google to save active folders to Cloud (available on Vercel automatically), or import/export a folder JSON.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {user && unsyncedCount > 0 && (
              <button
                type="button"
                onClick={onSyncLocalToCloud}
                disabled={cloudSyncBusy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {cloudSyncBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Cloud className="h-3.5 w-3.5" />
                )}
                Sync {unsyncedCount} Local {unsyncedCount === 1 ? 'Question' : 'Questions'} to Cloud
              </button>
            )}

            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <Upload className="h-3.5 w-3.5 text-blue-600" />
              <span>Import Folder JSON</span>
              <input
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => {
                  void handleImportJsonFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>

            {user ? (
              <button
                type="button"
                onClick={onSignOut}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign Out
              </button>
            ) : (
              <button
                type="button"
                onClick={onSignIn}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
              >
                <LogIn className="h-3.5 w-3.5" />
                Sign in with Google
              </button>
            )}
          </div>
        </div>

        {(cloudMessage || cloudError || shareFeedback) && (
          <div className="mt-2.5 space-y-1">
            {cloudMessage && (
              <p className="text-xs font-medium text-emerald-700">{cloudMessage}</p>
            )}
            {shareFeedback && (
              <p className="text-xs font-medium text-blue-700">{shareFeedback}</p>
            )}
            {cloudError && (
              <p className="text-xs font-medium text-rose-700">{cloudError}</p>
            )}
          </div>
        )}
      </div>

      {/* Importer / Custom Builder + Folder/Topic Save Panel */}
      <div className="grid gap-6 lg:grid-cols-[1fr_350px]">
        {/* Left: Copy-Paste Multiple Choice OR Custom Picture Builder */}
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          {/* Creator Mode Switch */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="inline-flex rounded-lg bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => {
                  setCreatorTab('PASTE');
                  setSaveSuccessMessage(null);
                }}
                className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  creatorTab === 'PASTE'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Copy &amp; Paste Multiple Choice
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreatorTab('CUSTOM');
                  setSaveSuccessMessage(null);
                }}
                className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  creatorTab === 'CUSTOM'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Custom Question + Pictures
              </button>
            </div>

            {creatorTab === 'PASTE' && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePasteFromClipboard}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap"
                >
                  <ClipboardPaste className="h-3.5 w-3.5" />
                  Paste Clipboard
                </button>
                <button
                  type="button"
                  onClick={() => handleTextChange(SAMPLE_PASTE_TEXT)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 whitespace-nowrap"
                >
                  Load Multiple-Choice Sample
                </button>
              </div>
            )}
          </div>

          {imageError && (
            <p className="mt-3 text-xs font-medium text-rose-700">{imageError}</p>
          )}

          {saveSuccessMessage && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{saveSuccessMessage}</span>
            </div>
          )}

          {creatorTab === 'PASTE' ? (
            <div className="mt-4">
              <p className="text-xs text-slate-500">
                Paste questions with options (<span className="font-mono text-slate-700">A) ... B) ...</span>), pipe lines, or math facts (<span className="font-mono text-slate-700">7 times 6</span>, <span className="font-mono text-slate-700">8 * 5</span>). Auto-adjust cleans stray symbols before saving.
              </p>

              <textarea
                value={rawText}
                onChange={(e) => handleTextChange(e.target.value)}
                rows={7}
                placeholder={`1. 8 times 5 = ? /\nA) 35/\nB) 40.\nC) 45\nD) 50\nAnswer: B/`}
                className="mt-3 w-full rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none"
              />

              {/* Auto-Adjust Pasted Text Controls */}
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-700">
                    Convert <span className="font-mono">times / * / ×</span> to:
                  </span>
                  <div className="inline-flex rounded-md bg-white p-0.5 border border-slate-200">
                    {(
                      [
                        { id: 'X', label: 'X' },
                        { id: 'x', label: 'x' },
                        { id: '×', label: '×' },
                        { id: 'KEEP', label: 'Keep' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleMultiplySymbolChange(opt.id)}
                        className={`rounded px-2 py-0.5 font-mono text-[11px] font-semibold transition-colors ${
                          multiplySymbol === opt.id
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="inline-flex cursor-pointer items-center gap-2 font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={cleanSymbols}
                    onChange={(e) => handleCleanSymbolsToggle(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                  />
                  <span>Omit unnecessary <span className="font-mono">/</span> &amp; extra symbols from answers</span>
                </label>
              </div>

              {clipboardMessage && (
                <p className="mt-2 text-xs font-medium text-amber-700">{clipboardMessage}</p>
              )}

              {/* Live Multiple-Choice Preview with Inline Editing & Image Uploads */}
              {drafts.length > 0 && (
                <div className="mt-5 border-t border-slate-100 pt-4">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                    <span>
                      Parsed Preview ({validDrafts.length} of {drafts.length} ready)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setRawText('');
                        setDrafts([]);
                      }}
                      className="font-medium text-slate-500 hover:text-slate-800"
                    >
                      Clear All
                    </button>
                  </div>

                  <div className="mt-3 max-h-[420px] space-y-3 overflow-y-auto pr-1">
                    {drafts.map((draft, qIdx) => (
                      <div
                        key={draft.tempId}
                        className="rounded-lg border border-slate-200 bg-slate-50/50 p-3.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-1 items-center gap-2">
                            {draft.valid ? (
                              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                            ) : (
                              <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                            )}
                            <span className="font-mono text-xs font-semibold text-slate-500">
                              Q{qIdx + 1}
                            </span>
                            <input
                              type="text"
                              value={draft.prompt}
                              onChange={(e) =>
                                handleDraftPromptChange(draft.tempId, e.target.value)
                              }
                              className="w-full rounded border border-slate-200 bg-white px-2.5 py-1 text-sm font-semibold text-slate-900 focus:border-blue-600 focus:outline-none"
                            />
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <label className="inline-flex cursor-pointer items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50">
                              <ImagePlus className="h-3.5 w-3.5 text-blue-600" />
                              <span>Pic</span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  handleDraftPromptImageUpload(draft.tempId, e.target.files?.[0]);
                                  e.target.value = '';
                                }}
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => handleRemoveDraft(draft.tempId)}
                              aria-label="Remove parsed question"
                              className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        {draft.promptImageUrl && (
                          <div className="mt-2 flex items-center gap-2 pl-6">
                            <img
                              src={draft.promptImageUrl}
                              alt="Question prompt preview"
                              className="h-16 w-auto rounded border border-slate-200 bg-white object-contain"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setDrafts((prev) =>
                                  prev.map((d) =>
                                    d.tempId === draft.tempId
                                      ? { ...d, promptImageUrl: undefined }
                                      : d
                                  )
                                )
                              }
                              className="text-xs font-medium text-rose-600 hover:text-rose-700"
                            >
                              Remove Picture
                            </button>
                          </div>
                        )}

                        {/* 4 Options Preview Grid */}
                        <div className="mt-2.5 grid gap-2 sm:grid-cols-2 pl-6">
                          {draft.choices.map((choice, cIdx) => {
                            const isCorrect = draft.correctChoiceIndex === cIdx;
                            return (
                              <div
                                key={choice.id}
                                className={`flex items-center gap-1.5 rounded-md border p-1.5 ${
                                  isCorrect
                                    ? 'border-emerald-500 bg-emerald-50/70'
                                    : 'border-slate-200 bg-white'
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => handleDraftCorrectChange(draft.tempId, cIdx)}
                                  title="Mark as correct answer"
                                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded font-mono text-xs font-bold transition-colors ${
                                    isCorrect
                                      ? 'bg-emerald-600 text-white'
                                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                  }`}
                                >
                                  {OPTION_LETTERS[cIdx]}
                                </button>
                                <input
                                  type="text"
                                  value={choice.text}
                                  onChange={(e) =>
                                    handleDraftChoiceTextChange(
                                      draft.tempId,
                                      cIdx,
                                      e.target.value
                                    )
                                  }
                                  placeholder={`Option ${OPTION_LETTERS[cIdx]}`}
                                  className="min-w-0 flex-1 bg-transparent px-1 text-xs font-medium text-slate-900 focus:outline-none"
                                />
                                {choice.imageUrl && (
                                  <img
                                    src={choice.imageUrl}
                                    alt={`Option ${OPTION_LETTERS[cIdx]}`}
                                    className="h-7 w-7 rounded border border-slate-200 object-cover shrink-0"
                                  />
                                )}
                                <label
                                  title="Upload option picture"
                                  className="cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-blue-600 shrink-0"
                                >
                                  <ImagePlus className="h-3.5 w-3.5" />
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                      handleDraftChoiceImageUpload(
                                        draft.tempId,
                                        cIdx,
                                        e.target.files?.[0]
                                      );
                                      e.target.value = '';
                                    }}
                                  />
                                </label>
                              </div>
                            );
                          })}
                        </div>

                        {draft.reason && (
                          <p className="mt-2 pl-6 text-xs font-medium text-amber-700">
                            {draft.reason}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* CUSTOM QUESTION BUILDER WITH PICTURE UPLOADS */
            <div className="mt-4 space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700">
                    Question Text &amp; Optional Picture
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    <ImagePlus className="h-3.5 w-3.5 text-blue-600" />
                    <span>{customPromptImage ? 'Change Question Picture' : 'Upload Question Picture'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        handleCustomPromptImage(e.target.files?.[0]);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>

                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  rows={2}
                  placeholder="Type your question (e.g. How many apples are shown in total?)"
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none"
                />

                {customPromptImage && (
                  <div className="mt-2 flex items-center gap-3">
                    <img
                      src={customPromptImage}
                      alt="Uploaded question visual"
                      className="h-24 w-auto rounded-lg border border-slate-200 bg-white object-contain"
                    />
                    <button
                      type="button"
                      onClick={() => setCustomPromptImage(undefined)}
                      className="text-xs font-semibold text-rose-600 hover:text-rose-700"
                    >
                      Remove Picture
                    </button>
                  </div>
                )}
              </div>

              {/* 4 Customizable Options (with Picture Upload per Option) */}
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">
                    Answer Options (click A–D to mark the correct answer)
                  </span>
                </div>

                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  {customChoices.map((choice, idx) => {
                    const isCorrect = customCorrectIdx === idx;
                    return (
                      <div
                        key={choice.id}
                        className={`rounded-lg border p-3 transition-colors ${
                          isCorrect
                            ? 'border-emerald-500 bg-emerald-50/50'
                            : 'border-slate-200 bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setCustomCorrectIdx(idx)}
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md font-mono text-xs font-bold transition-colors ${
                              isCorrect
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            {OPTION_LETTERS[idx]}
                          </button>
                          <input
                            type="text"
                            value={choice.text}
                            onChange={(e) =>
                              setCustomChoices((prev) =>
                                prev.map((c, i) =>
                                  i === idx ? { ...c, text: e.target.value } : c
                                )
                              )
                            }
                            placeholder={`Option ${OPTION_LETTERS[idx]} text`}
                            className="min-w-0 flex-1 rounded border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                          />
                        </div>

                        <div className="mt-2 flex items-center justify-between gap-2 pl-9">
                          <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700">
                            <ImagePlus className="h-3.5 w-3.5" />
                            <span>{choice.imageUrl ? 'Change Pic' : 'Add Option Pic'}</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                handleCustomChoiceImage(idx, e.target.files?.[0]);
                                e.target.value = '';
                              }}
                            />
                          </label>
                          {isCorrect && (
                            <span className="text-[11px] font-semibold text-emerald-700">
                              Correct Answer
                            </span>
                          )}
                        </div>

                        {choice.imageUrl && (
                          <div className="mt-2 flex items-center gap-2 pl-9">
                            <img
                              src={choice.imageUrl}
                              alt={`Option ${OPTION_LETTERS[idx]} preview`}
                              className="h-14 w-auto rounded border border-slate-200 bg-white object-contain"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setCustomChoices((prev) =>
                                  prev.map((c, i) =>
                                    i === idx ? { ...c, imageUrl: undefined } : c
                                  )
                                )
                              }
                              className="text-[11px] font-medium text-rose-600 hover:text-rose-700"
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: Folder Name / Topic Name Before Saving */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6">
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Choose Folder or Topic</h2>
              <p className="mt-1 text-xs text-slate-500">
                Before saving, assign your questions to a Folder Name or Topic Name.
              </p>
            </div>

            {/* Segmented Selector: Folder Name vs Topic Name */}
            <div>
              <span className="block text-xs font-semibold text-slate-700">Save Under</span>
              <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setGroupType('FOLDER')}
                  className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                    groupType === 'FOLDER'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Folder className="h-3.5 w-3.5" />
                  Folder Name
                </button>
                <button
                  type="button"
                  onClick={() => setGroupType('TOPIC')}
                  className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                    groupType === 'TOPIC'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Tag className="h-3.5 w-3.5" />
                  Topic Name
                </button>
              </div>
            </div>

            {/* Folder or Topic Name Input */}
            <div>
              <label
                htmlFor="group-name-input"
                className="block text-xs font-semibold text-slate-700"
              >
                {groupType === 'FOLDER' ? 'Folder Name' : "Topic's Name"}
              </label>
              <input
                id="group-name-input"
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder={
                  groupType === 'FOLDER'
                    ? 'e.g. Week 4 Warmup'
                    : 'e.g. Bridging Through 10'
                }
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
              />

              {matchingGroupsForSelector.length > 0 && (
                <div className="mt-2.5">
                  <div className="text-[11px] font-medium text-slate-500">
                    Existing {groupType === 'FOLDER' ? 'Folders' : 'Topics'}:
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {matchingGroupsForSelector.map((g) => (
                      <button
                        key={g.groupName}
                        type="button"
                        onClick={() => setGroupName(g.groupName)}
                        className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                          trimmedGroupName === g.groupName
                            ? 'border-blue-600 bg-blue-50 text-blue-800'
                            : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {g.groupName}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <input
                type="checkbox"
                checked={saveAsActive}
                onChange={(e) => setSaveAsActive(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
              />
              <div>
                <div className="text-xs font-semibold text-slate-900">
                  Save to Active Questions
                </div>
                <div className="text-[11px] text-slate-500">
                  Immediately activate for Tug-of-War matches.
                </div>
              </div>
            </label>
          </div>

          <div className="mt-5 space-y-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={handleSaveBatch}
              disabled={!canSave}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <Plus className="h-4 w-4" />
              {saveAsActive
                ? `Save to Active Questions (${readyCount})`
                : `Save to Library (${readyCount})`}
            </button>
            {!canSave && (
              <p className="text-center text-[11px] text-slate-500">
                {readyCount === 0
                  ? creatorTab === 'PASTE'
                    ? 'Paste at least one valid multiple-choice question.'
                    : 'Add a question, at least 2 options, and mark the correct answer.'
                  : `Enter a ${groupType === 'FOLDER' ? 'folder' : 'topic'} name to save.`}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Saved Question Library */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Saved Questions &amp; Active Pool</h2>
            <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
              {activeCount} active of {questions.length} total saved questions
            </p>
          </div>

          {/* Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setFilterMode('ALL')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                filterMode === 'ALL'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({questions.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('ACTIVE')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                filterMode === 'ACTIVE'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Active Only ({activeCount})
            </button>
            {existingGroups.map((g) => {
              const key = `${g.groupType}::${g.groupName}`;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilterMode(key)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                    filterMode === key
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {g.groupType === 'FOLDER' ? 'Folder' : 'Topic'}: {g.groupName} ({g.total})
                </button>
              );
            })}
          </div>
        </div>

        {/* Group Bulk Controls + Vercel Share Link & Export */}
        {activeFilterGroup && (
          <div className="mt-4 space-y-2.5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="font-semibold text-slate-800">
                {activeFilterGroup.groupType === 'FOLDER' ? 'Folder' : 'Topic'}: {activeFilterGroup.groupName}
                <span className="ml-2 font-normal text-slate-500 tabular-nums">
                  · {activeFilterGroup.active} of {activeFilterGroup.total} active
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    void handleCopyGroupShareLink(
                      activeFilterGroup.groupType,
                      activeFilterGroup.groupName
                    )
                  }
                  className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-2.5 py-1 font-semibold text-blue-700 hover:bg-blue-100"
                >
                  <Link2 className="h-3.5 w-3.5" />
                  Copy Share Link
                </button>
                <button
                  type="button"
                  onClick={() =>
                    exportQuestionsJsonFile(
                      activeFilterGroup.groupName,
                      filteredQuestions
                    )
                  }
                  className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-100"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export JSON
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onToggleGroupActive(activeFilterGroup.groupType, activeFilterGroup.groupName, true)
                  }
                  className="rounded border border-slate-200 bg-white px-2.5 py-1 font-semibold text-emerald-700 hover:bg-emerald-50"
                >
                  Activate All
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onToggleGroupActive(activeFilterGroup.groupType, activeFilterGroup.groupName, false)
                  }
                  className="rounded border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Deactivate All
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDeleteGroup(activeFilterGroup.groupType, activeFilterGroup.groupName);
                    setFilterMode('ALL');
                  }}
                  className="rounded border border-slate-200 bg-white px-2.5 py-1 font-semibold text-rose-700 hover:bg-rose-50"
                >
                  Delete Group
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-slate-200/70 pt-2">
              <span className="text-[11px] font-medium text-slate-600">
                Target Vercel URL (optional):
              </span>
              <input
                type="url"
                value={shareBaseUrl}
                onChange={(e) => {
                  const val = e.target.value;
                  setShareBaseUrl(val);
                  try {
                    localStorage.setItem(VERCEL_DOMAIN_KEY, val);
                  } catch {
                    // Ignore
                  }
                }}
                placeholder="https://your-app.vercel.app (blank = current domain)"
                className="min-w-[240px] flex-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-800 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
              />
            </div>
          </div>
        )}

        {filteredQuestions.length === 0 ? (
          <p className="mt-6 text-sm text-slate-500">
            {questions.length === 0
              ? 'No custom questions saved yet. Paste multiple-choice questions or customize one with pictures above.'
              : 'No questions match the selected filter.'}
          </p>
        ) : (
          <div className="mt-4 divide-y divide-slate-100">
            {filteredQuestions.map((q) => (
              <div
                key={q.id}
                className="flex flex-wrap items-start justify-between gap-4 py-4 first:pt-2 last:pb-0"
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => onToggleQuestionActive(q.id)}
                    className={`mt-0.5 inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      q.isActive
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {q.isActive ? 'Active' : 'Inactive'}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      {q.promptImageUrl && (
                        <img
                          src={q.promptImageUrl}
                          alt="Question visual"
                          className="h-12 w-auto rounded border border-slate-200 object-contain"
                        />
                      )}
                      <div>
                        <div className="font-semibold text-slate-900">{q.prompt}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span>
                            {q.groupType === 'FOLDER' ? 'Folder' : 'Topic'} · {q.groupName}
                          </span>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                              q.ownerId
                                ? 'bg-blue-50 text-blue-700'
                                : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            {q.ownerId ? 'Cloud Synced' : 'Local Only'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Options summary */}
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {q.choices.map((c, idx) => {
                        if (!c.text.trim() && !c.imageUrl) return null;
                        const isAns = idx === q.correctChoiceIndex;
                        return (
                          <div
                            key={c.id}
                            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
                              isAns
                                ? 'border-emerald-300 bg-emerald-50 font-semibold text-emerald-900'
                                : 'border-slate-200 bg-slate-50 text-slate-700'
                            }`}
                          >
                            <span className="font-mono font-bold">{OPTION_LETTERS[idx]}.</span>
                            {c.imageUrl && (
                              <img
                                src={c.imageUrl}
                                alt={c.text || `Option ${OPTION_LETTERS[idx]}`}
                                className="h-6 w-6 rounded object-cover"
                              />
                            )}
                            {c.text && <span>{c.text}</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onDeleteQuestion(q.id)}
                  aria-label={`Delete ${q.prompt}`}
                  className="inline-flex items-center justify-center rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-700 shrink-0"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
