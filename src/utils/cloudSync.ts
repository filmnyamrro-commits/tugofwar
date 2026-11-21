import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { OperationType, db, handleFirestoreError } from '../firebase';
import {
  CustomQuestion,
  QuestionChoice,
  QuestionGroupType,
} from '../types/assessment';

const FOLDERS_COLLECTION = 'question_folders';
const QUESTIONS_COLLECTION = 'custom_questions';

export function sanitizeFirestoreId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  return cleaned || `id_${Date.now()}`;
}

export function deriveFolderId(
  ownerId: string,
  groupType: QuestionGroupType,
  groupName: string
): string {
  const key = `${ownerId}::${groupType}::${groupName.trim().toLowerCase()}`;
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const slug = groupName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const hashHex = (hash >>> 0).toString(36);
  return sanitizeFirestoreId(`fld_${slug || 'set'}_${hashHex}`);
}

function toEpochMs(val: unknown): number {
  if (val instanceof Timestamp) return val.toMillis();
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  return Date.now();
}

function docToCustomQuestion(id: string, data: Record<string, unknown>): CustomQuestion | null {
  const prompt = typeof data.prompt === 'string' ? data.prompt : '';
  const groupName = typeof data.groupName === 'string' ? data.groupName : '';
  const rawChoices = Array.isArray(data.choices) ? data.choices : [];
  const choices: QuestionChoice[] = rawChoices
    .slice(0, 4)
    .map((c, idx) => {
      const obj = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>;
      return {
        id: typeof obj.id === 'string' && obj.id ? obj.id : `${id}-c-${idx}`,
        text: typeof obj.text === 'string' ? obj.text : '',
        ...(typeof obj.imageUrl === 'string' && obj.imageUrl
          ? { imageUrl: obj.imageUrl }
          : {}),
      };
    });

  if (!prompt || !groupName || choices.length < 2) return null;

  const groupType: QuestionGroupType = data.groupType === 'TOPIC' ? 'TOPIC' : 'FOLDER';
  const correctChoiceIndex =
    typeof data.correctChoiceIndex === 'number' &&
    data.correctChoiceIndex >= 0 &&
    data.correctChoiceIndex < choices.length
      ? data.correctChoiceIndex
      : 0;

  return {
    id,
    folderId: typeof data.folderId === 'string' ? data.folderId : undefined,
    ownerId: typeof data.ownerId === 'string' ? data.ownerId : undefined,
    prompt,
    promptImageUrl:
      typeof data.promptImageUrl === 'string' && data.promptImageUrl
        ? data.promptImageUrl
        : undefined,
    a: typeof data.a === 'number' ? data.a : undefined,
    b: typeof data.b === 'number' ? data.b : undefined,
    answer:
      typeof data.answer === 'string' && data.answer
        ? data.answer
        : choices[correctChoiceIndex]?.text || 'Option',
    choices,
    correctChoiceIndex,
    groupType,
    groupName,
    isActive: Boolean(data.isActive),
    isPublished: typeof data.isPublished === 'boolean' ? data.isPublished : Boolean(data.isActive),
    createdAt: toEpochMs(data.createdAt),
  };
}

export function subscribePublicActiveQuestions(
  onData: (items: CustomQuestion[]) => void,
  onError?: (err: Error) => void
): () => void {
  const path = QUESTIONS_COLLECTION;
  const q = query(collection(db, path), where('isPublicActive', '==', true));
  return onSnapshot(
    q,
    (snapshot) => {
      const parsed: CustomQuestion[] = [];
      snapshot.forEach((docSnap) => {
        const item = docToCustomQuestion(
          docSnap.id,
          docSnap.data() as Record<string, unknown>
        );
        if (item) parsed.push(item);
      });
      parsed.sort((a, b) => b.createdAt - a.createdAt);
      onData(parsed);
    },
    (error) => {
      if (onError) {
        onError(error);
      } else {
        handleFirestoreError(error, OperationType.LIST, path);
      }
    }
  );
}

export function subscribeOwnerQuestions(
  ownerId: string,
  onData: (items: CustomQuestion[]) => void,
  onError?: (err: Error) => void
): () => void {
  const path = QUESTIONS_COLLECTION;
  const q = query(collection(db, path), where('ownerId', '==', ownerId));
  return onSnapshot(
    q,
    (snapshot) => {
      const parsed: CustomQuestion[] = [];
      snapshot.forEach((docSnap) => {
        const item = docToCustomQuestion(
          docSnap.id,
          docSnap.data() as Record<string, unknown>
        );
        if (item) parsed.push(item);
      });
      parsed.sort((a, b) => b.createdAt - a.createdAt);
      onData(parsed);
    },
    (error) => {
      if (onError) {
        onError(error);
      } else {
        handleFirestoreError(error, OperationType.LIST, path);
      }
    }
  );
}

function buildSanitizedQuestionPayload(
  q: CustomQuestion,
  folderId: string,
  ownerId: string
): { docId: string; payload: Record<string, unknown> } {
  const docId = sanitizeFirestoreId(q.id);
  const cleanedChoices: QuestionChoice[] = q.choices.slice(0, 4).map((c, idx) => ({
    id: sanitizeFirestoreId(c.id || `${docId}_c${idx}`),
    text: (c.text || '').trim().slice(0, 300),
    ...(c.imageUrl && c.imageUrl.length <= 150000 ? { imageUrl: c.imageUrl } : {}),
  }));
  while (cleanedChoices.length < 2) {
    cleanedChoices.push({
      id: `${docId}_pad_${cleanedChoices.length}`,
      text: `Option ${cleanedChoices.length + 1}`,
    });
  }
  const safeIdx = Math.min(
    Math.max(0, q.correctChoiceIndex),
    cleanedChoices.length - 1
  );
  const isActive = Boolean(q.isActive);
  const isPublished =
    typeof q.isPublished === 'boolean' ? q.isPublished : isActive;
  const isPublicActive = isActive && isPublished;

  const payload: Record<string, unknown> = {
    id: docId,
    folderId,
    ownerId,
    prompt: q.prompt.trim().slice(0, 1000) || 'Question',
    answer:
      (q.answer || cleanedChoices[safeIdx]?.text || 'Option')
        .trim()
        .slice(0, 300) || 'Option',
    choices: cleanedChoices,
    correctChoiceIndex: safeIdx,
    groupType: q.groupType === 'TOPIC' ? 'TOPIC' : 'FOLDER',
    groupName: q.groupName.trim().slice(0, 120) || 'Untitled',
    isActive,
    isPublished,
    isPublicActive,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (q.promptImageUrl && q.promptImageUrl.length <= 200000) {
    payload.promptImageUrl = q.promptImageUrl;
  }
  if (typeof q.a === 'number' && Number.isFinite(q.a)) {
    payload.a = q.a;
  }
  if (typeof q.b === 'number' && Number.isFinite(q.b)) {
    payload.b = q.b;
  }

  return { docId, payload };
}

export async function saveQuestionsToCloud(
  items: CustomQuestion[],
  ownerId: string
): Promise<CustomQuestion[]> {
  if (items.length === 0) return [];

  // Group items by folder
  const byGroup = new Map<
    string,
    { groupType: QuestionGroupType; groupName: string; items: CustomQuestion[] }
  >();
  for (const item of items) {
    const key = `${item.groupType}::${item.groupName.trim()}`;
    const entry = byGroup.get(key) ?? {
      groupType: item.groupType,
      groupName: item.groupName.trim() || 'Untitled',
      items: [],
    };
    entry.items.push(item);
    byGroup.set(key, entry);
  }

  const folderEntries = Array.from(byGroup.values());
  const folderMeta = new Map<
    string,
    {
      folderId: string;
      exists: boolean;
      groupType: QuestionGroupType;
      groupName: string;
      isActive: boolean;
      isPublished: boolean;
    }
  >();

  for (const grp of folderEntries) {
    const folderId = deriveFolderId(ownerId, grp.groupType, grp.groupName);
    const folderRef = doc(db, FOLDERS_COLLECTION, folderId);
    let exists = false;
    try {
      const snap = await getDoc(folderRef);
      exists = snap.exists();
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `${FOLDERS_COLLECTION}/${folderId}`);
    }
    const anyActive = grp.items.some((i) => i.isActive);
    const anyPublished = grp.items.some((i) =>
      typeof i.isPublished === 'boolean' ? i.isPublished : i.isActive
    );
    folderMeta.set(`${grp.groupType}::${grp.groupName}`, {
      folderId,
      exists,
      groupType: grp.groupType,
      groupName: grp.groupName,
      isActive: anyActive,
      isPublished: anyPublished,
    });
  }

  // Write folders + questions in chunks <= 200 operations per batch
  const CHUNK_SIZE = 180;
  const savedItems: CustomQuestion[] = [];

  // First commit folder docs cleanly so all subsequent question chunks pass existsAfter/getAfter
  {
    const folderBatch = writeBatch(db);
    for (const meta of folderMeta.values()) {
      const ref = doc(db, FOLDERS_COLLECTION, meta.folderId);
      const isPublicActive = meta.isActive && meta.isPublished;
      if (meta.exists) {
        folderBatch.update(ref, {
          isActive: meta.isActive,
          isPublished: meta.isPublished,
          isPublicActive,
          updatedAt: serverTimestamp(),
        });
      } else {
        folderBatch.set(ref, {
          id: meta.folderId,
          ownerId,
          groupType: meta.groupType,
          groupName: meta.groupName.slice(0, 120),
          isActive: meta.isActive,
          isPublished: meta.isPublished,
          isPublicActive,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }
    try {
      await folderBatch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, FOLDERS_COLLECTION);
    }
  }

  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const q of chunk) {
      const key = `${q.groupType}::${q.groupName.trim() || 'Untitled'}`;
      const meta = folderMeta.get(key)!;
      const { docId, payload } = buildSanitizedQuestionPayload(q, meta.folderId, ownerId);
      const qRef = doc(db, QUESTIONS_COLLECTION, docId);
      batch.set(qRef, payload);
      savedItems.push({
        ...q,
        id: docId,
        folderId: meta.folderId,
        ownerId,
        isPublished: Boolean(payload.isPublished),
      });
    }
    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, QUESTIONS_COLLECTION);
    }
  }

  return savedItems;
}

export async function toggleQuestionActiveInCloud(
  question: CustomQuestion,
  ownerId: string
): Promise<void> {
  if (question.ownerId && question.ownerId !== ownerId) return;
  const docId = sanitizeFirestoreId(question.id);
  const nextActive = !question.isActive;
  const nextPublished = nextActive;
  const ref = doc(db, QUESTIONS_COLLECTION, docId);
  try {
    await writeBatch(db)
      .update(ref, {
        isActive: nextActive,
        isPublished: nextPublished,
        isPublicActive: nextActive && nextPublished,
        updatedAt: serverTimestamp(),
      })
      .commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `${QUESTIONS_COLLECTION}/${docId}`);
  }
}

export async function toggleGroupActiveInCloud(
  groupQuestions: CustomQuestion[],
  active: boolean,
  ownerId: string
): Promise<void> {
  const owned = groupQuestions.filter((q) => !q.ownerId || q.ownerId === ownerId);
  if (owned.length === 0) return;

  const folderIds = new Set<string>();
  owned.forEach((q) => {
    folderIds.add(q.folderId || deriveFolderId(ownerId, q.groupType, q.groupName));
  });

  const CHUNK_SIZE = 180;
  for (let i = 0; i < owned.length; i += CHUNK_SIZE) {
    const chunk = owned.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    if (i === 0) {
      for (const fid of folderIds) {
        batch.update(doc(db, FOLDERS_COLLECTION, fid), {
          isActive: active,
          isPublished: active,
          isPublicActive: active,
          updatedAt: serverTimestamp(),
        });
      }
    }
    for (const q of chunk) {
      const docId = sanitizeFirestoreId(q.id);
      batch.update(doc(db, QUESTIONS_COLLECTION, docId), {
        isActive: active,
        isPublished: active,
        isPublicActive: active,
        updatedAt: serverTimestamp(),
      });
    }
    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, QUESTIONS_COLLECTION);
    }
  }
}

export async function deleteQuestionInCloud(questionId: string): Promise<void> {
  const docId = sanitizeFirestoreId(questionId);
  try {
    await deleteDoc(doc(db, QUESTIONS_COLLECTION, docId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `${QUESTIONS_COLLECTION}/${docId}`);
  }
}

export async function deleteGroupInCloud(
  groupQuestions: CustomQuestion[],
  ownerId: string
): Promise<void> {
  const owned = groupQuestions.filter((q) => !q.ownerId || q.ownerId === ownerId);
  if (owned.length === 0) return;

  const folderIds = new Set<string>();
  owned.forEach((q) => {
    folderIds.add(q.folderId || deriveFolderId(ownerId, q.groupType, q.groupName));
  });

  const CHUNK_SIZE = 180;
  for (let i = 0; i < owned.length; i += CHUNK_SIZE) {
    const chunk = owned.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const q of chunk) {
      batch.delete(doc(db, QUESTIONS_COLLECTION, sanitizeFirestoreId(q.id)));
    }
    if (i + CHUNK_SIZE >= owned.length) {
      for (const fid of folderIds) {
        batch.delete(doc(db, FOLDERS_COLLECTION, fid));
      }
    }
    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, QUESTIONS_COLLECTION);
    }
  }
}

// --- Direct URL Share Links & JSON Export/Import for Cross-Domain Sharing ---

interface CompactSharedPayload {
  v: 1;
  t: 'F' | 'T';
  n: string;
  q: Array<{
    p: string;
    a?: number;
    b?: number;
    ans: string;
    c: string[];
    ci: number;
  }>;
}

function toBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(encoded: string): string {
  const padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const binary = atob(padded + '='.repeat(padLen));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

export function encodeSharedFolderUrl(
  baseUrl: string,
  groupType: QuestionGroupType,
  groupName: string,
  questions: CustomQuestion[]
): { url: string; truncated: boolean } {
  const cleanBase = baseUrl.trim().replace(/\/+$/, '') || window.location.origin;
  const payload: CompactSharedPayload = {
    v: 1,
    t: groupType === 'TOPIC' ? 'T' : 'F',
    n: groupName,
    q: questions.map((item) => ({
      p: item.prompt,
      ...(typeof item.a === 'number' ? { a: item.a } : {}),
      ...(typeof item.b === 'number' ? { b: item.b } : {}),
      ans: item.answer,
      c: item.choices.map((ch) => ch.text),
      ci: item.correctChoiceIndex,
    })),
  };

  const encoded = toBase64Url(JSON.stringify(payload));
  // Use hash (#share=) so Vercel/CDNs never hit HTTP 414 URI Too Long limits!
  const url = `${cleanBase}/#share=${encoded}`;
  return { url, truncated: url.length > 16000 };
}

export function decodeSharedFolderFromLocation(): CustomQuestion[] {
  if (typeof window === 'undefined') return [];
  try {
    let token: string | null = null;
    const hash = window.location.hash || '';
    if (hash.includes('share=')) {
      const m = hash.match(/share=([^&]+)/);
      if (m) token = decodeURIComponent(m[1]);
    }
    if (!token && window.location.search) {
      const params = new URLSearchParams(window.location.search);
      token = params.get('share');
    }
    if (!token) return [];

    const parsed = JSON.parse(fromBase64Url(token)) as Partial<CompactSharedPayload>;
    if (parsed.v !== 1 || !parsed.n || !Array.isArray(parsed.q)) return [];

    const groupType: QuestionGroupType = parsed.t === 'T' ? 'TOPIC' : 'FOLDER';
    const groupName = String(parsed.n).trim() || 'Shared Folder';
    const now = Date.now();

    return parsed.q
      .filter((item) => item && typeof item.p === 'string' && Array.isArray(item.c))
      .map((item, idx) => {
        const choices: QuestionChoice[] = item.c.slice(0, 4).map((text, cIdx) => ({
          id: `shr-${now}-${idx}-${cIdx}`,
          text: String(text ?? ''),
        }));
        const correctIdx =
          typeof item.ci === 'number' && item.ci >= 0 && item.ci < choices.length
            ? item.ci
            : 0;
        return {
          id: `shr-${now}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
          prompt: item.p,
          a: typeof item.a === 'number' ? item.a : undefined,
          b: typeof item.b === 'number' ? item.b : undefined,
          answer: String(item.ans || choices[correctIdx]?.text || ''),
          choices,
          correctChoiceIndex: correctIdx,
          groupType,
          groupName,
          isActive: true,
          createdAt: now + idx,
        };
      });
  } catch {
    return [];
  }
}

export function exportQuestionsJsonFile(
  groupName: string,
  questions: CustomQuestion[]
): void {
  const safeName = groupName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'ropesum-questions';
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    questions: questions.map((q) => ({
      prompt: q.prompt,
      promptImageUrl: q.promptImageUrl,
      a: q.a,
      b: q.b,
      answer: q.answer,
      choices: q.choices,
      correctChoiceIndex: q.correctChoiceIndex,
      groupType: q.groupType,
      groupName: q.groupName,
      isActive: q.isActive,
    })),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${safeName}.ropesum.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function parseImportedQuestionsJson(rawJson: string): CustomQuestion[] {
  const parsed = JSON.parse(rawJson) as
    | CustomQuestion[]
    | { questions?: Array<Partial<CustomQuestion>> };
  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.questions)
    ? parsed.questions
    : [];
  const now = Date.now();
  return list
    .filter(
      (q) =>
        q &&
        typeof q.prompt === 'string' &&
        q.prompt.trim().length > 0 &&
        Array.isArray(q.choices) &&
        q.choices.length >= 2
    )
    .map((q, idx) => {
      const choices: QuestionChoice[] = (q.choices ?? []).slice(0, 4).map((c, cIdx) => ({
        id: `imp-${now}-${idx}-${cIdx}`,
        text: String(c?.text ?? ''),
        ...(c?.imageUrl ? { imageUrl: String(c.imageUrl) } : {}),
      }));
      const ci =
        typeof q.correctChoiceIndex === 'number' &&
        q.correctChoiceIndex >= 0 &&
        q.correctChoiceIndex < choices.length
          ? q.correctChoiceIndex
          : 0;
      return {
        id: `imp-${now}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        prompt: String(q.prompt),
        promptImageUrl:
          typeof q.promptImageUrl === 'string' ? q.promptImageUrl : undefined,
        a: typeof q.a === 'number' ? q.a : undefined,
        b: typeof q.b === 'number' ? q.b : undefined,
        answer: String(q.answer ?? choices[ci]?.text ?? ''),
        choices,
        correctChoiceIndex: ci,
        groupType: q.groupType === 'TOPIC' ? 'TOPIC' : 'FOLDER',
        groupName: String(q.groupName ?? 'Imported Folder').trim() || 'Imported Folder',
        isActive: typeof q.isActive === 'boolean' ? q.isActive : true,
        createdAt: now + idx,
      };
    });
}
