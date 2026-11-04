import {
  formatAnswerGuide,
  formatLevelContent,
  LEVELS,
  type GeneratedQuestion,
  type GeneratedWorksheet,
  type WorksheetLevelName,
} from "@shared/worksheet-schema";

export type StoredWorksheetLevel = {
  id: number;
  worksheetId: number;
  level: WorksheetLevelName;
  title: string;
  learningGoal: string;
  instructions?: string;
  questions?: GeneratedQuestion[];
  teacherNote?: string;
  content: string;
  answerGuide: string;
  updatedAt: string | Date;
};

export type StoredWorksheet = {
  id: number;
  userId: number;
  title: string;
  originalName: string;
  originalMime: string;
  originalFileKey: string | null;
  sourceText: string | null;
  subject: string | null;
  gradeBand: string | null;
  status: "ready" | "failed";
  analysis: GeneratedWorksheet["analysis"] | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  levels: StoredWorksheetLevel[];
};

const DB_NAME = "udl-five-level-worksheet-studio";
const DB_VERSION = 1;
const STORE_NAME = "worksheets";
const FALLBACK_STORAGE_KEY = "udl-worksheets-backup-v1";
const WELCOME_SEEN_KEY = "udl-welcome-dismissed-v1";

function readLocalBackup(): StoredWorksheet[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(FALLBACK_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalBackup(items: StoredWorksheet[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Ignore quota errors on localStorage backup
  }
}

function openIdb(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.resolve(null);
  }
  return new Promise(resolve => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function sortWorksheetsDesc(items: StoredWorksheet[]): StoredWorksheet[] {
  return [...items].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export async function listStoredWorksheets(): Promise<StoredWorksheet[]> {
  const db = await openIdb();
  if (!db) {
    return sortWorksheetsDesc(readLocalBackup());
  }
  return new Promise(resolve => {
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const result = Array.isArray(req.result) ? (req.result as StoredWorksheet[]) : [];
        if (result.length === 0) {
          const backup = readLocalBackup();
          resolve(sortWorksheetsDesc(backup));
          return;
        }
        resolve(sortWorksheetsDesc(result));
      };
      req.onerror = () => resolve(sortWorksheetsDesc(readLocalBackup()));
    } catch {
      resolve(sortWorksheetsDesc(readLocalBackup()));
    }
  });
}

export async function getStoredWorksheet(id: number): Promise<StoredWorksheet | undefined> {
  const all = await listStoredWorksheets();
  return all.find(item => item.id === id);
}

export async function saveStoredWorksheet(worksheet: StoredWorksheet): Promise<StoredWorksheet> {
  const normalized: StoredWorksheet = {
    ...worksheet,
    createdAt: new Date(worksheet.createdAt).toISOString(),
    updatedAt: new Date(worksheet.updatedAt).toISOString(),
    levels: worksheet.levels.map(level => ({
      ...level,
      updatedAt: new Date(level.updatedAt).toISOString(),
    })),
  };

  const current = await listStoredWorksheets();
  const next = sortWorksheetsDesc([
    normalized,
    ...current.filter(item => item.id !== normalized.id),
  ]);
  writeLocalBackup(next);

  const db = await openIdb();
  if (db) {
    await new Promise<void>(resolve => {
      try {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(normalized);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
  return normalized;
}

export async function deleteStoredWorksheet(id: number): Promise<StoredWorksheet[]> {
  const current = await listStoredWorksheets();
  const next = current.filter(item => item.id !== id);
  writeLocalBackup(next);

  const db = await openIdb();
  if (db) {
    await new Promise<void>(resolve => {
      try {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
  return next;
}

export function isWelcomeDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(WELCOME_SEEN_KEY) === "1" || readLocalBackup().length > 0;
  } catch {
    return false;
  }
}

export function setWelcomeDismissed(dismissed: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (dismissed) {
      window.sessionStorage.setItem(WELCOME_SEEN_KEY, "1");
    } else {
      window.sessionStorage.removeItem(WELCOME_SEEN_KEY);
    }
  } catch {
    // ignore
  }
}

export function createSampleWorksheet(): StoredWorksheet {
  const id = Date.now();
  const now = new Date().toISOString();
  const sampleLevels: Array<{
    level: WorksheetLevelName;
    title: string;
    learningGoal: string;
    instructions: string;
    questions: GeneratedQuestion[];
    teacherNote: string;
  }> = [
    {
      level: "매우 쉬움",
      title: "[예시] 일차방정식과 등식의 성질 (핵심 디딤돌)",
      learningGoal: "등식의 양변에 같은 수를 더하거나 빼어도 등식이 성립함을 그림과 빈칸으로 이해한다.",
      instructions: "양팔저울의 균형을 떠올리며 빈칸에 알맞은 수를 써넣으세요.",
      questions: [
        {
          number: 1,
          prompt: "x - 3 = 5에서 좌변의 -3을 없애려면 양변에 어떤 수를 더해야 할까요? [힌트: x - 3 + (   ) = 5 + (   )]",
          type: "빈칸 채우기",
          answerGuide: "양변에 3을 더합니다. 따라서 x = 8입니다.",
        },
        {
          number: 2,
          prompt: "2x = 10에서 x 한 개의 값을 구하려면 양변을 몇으로 나누어야 할까요?",
          type: "단답형",
          answerGuide: "양변을 2로 나누어 x = 5를 구합니다.",
        },
      ],
      teacherNote: "양팔저울 시각 자료를 함께 제시하고 부호 변화에 대한 부담을 줄여 주세요.",
    },
    {
      level: "쉬움",
      title: "[예시] 일차방정식 풀이의 기초 연습",
      learningGoal: "등식의 성질을 이용해 간단한 일차방정식의 해를 구할 수 있다.",
      instructions: "단계별 안내에 따라 일차방정식을 풀어 보세요.",
      questions: [
        {
          number: 1,
          prompt: "일차방정식 x + 7 = 12를 등식의 성질을 이용하여 풀어 보세요.",
          type: "단답형",
          answerGuide: "양변에서 7을 빼면 x = 5입니다.",
        },
        {
          number: 2,
          prompt: "일차방정식 3x - 4 = 11에서 상수항 -4를 우변으로 이항한 식을 쓰고, 해를 구하세요.",
          type: "서술형",
          answerGuide: "3x = 11 + 4, 3x = 15이므로 x = 5입니다.",
        },
      ],
      teacherNote: "이항할 때 부호가 바뀌는 이유를 등식의 성질과 연결해 안내합니다.",
    },
    {
      level: "보통",
      title: "[예시] 일차방정식의 풀이와 활용",
      learningGoal: "괄호가 있는 일차방정식을 풀고 해가 맞는지 확인할 수 있다.",
      instructions: "문제를 읽고 풀이 과정과 답을 차례대로 작성하세요.",
      questions: [
        {
          number: 1,
          prompt: "일차방정식 2(x - 3) = x + 4를 푸세요.",
          type: "풀이형",
          answerGuide: "분배법칙을 적용하면 2x - 6 = x + 4, 이항하면 x = 10입니다.",
        },
        {
          number: 2,
          prompt: "어떤 수의 3배에서 5를 뺀 값은 그 수에 7을 더한 값과 같습니다. 어떤 수를 구하는 방정식을 세우고 답을 구하세요.",
          type: "문장제",
          answerGuide: "3x - 5 = x + 7로 식을 세우고 풀면 2x = 12, x = 6입니다.",
        },
      ],
      teacherNote: "분배법칙 적용 시 괄호 안의 모든 항에 곱했는지 확인해 주세요.",
    },
    {
      level: "어려움",
      title: "[예시] 계수가 소수·분수인 일차방정식과 추론",
      learningGoal: "복잡한 일차방정식을 간단히 고쳐 풀고 풀이 과정의 오류를 찾을 수 있다.",
      instructions: "풀이 과정을 논리적으로 서술하고 검산해 보세요.",
      questions: [
        {
          number: 1,
          prompt: "일차방정식 0.3x - 0.5 = 0.1(x + 7)의 양변에 적절한 수를 곱해 계수를 정수로 고친 뒤 해를 구하세요.",
          type: "풀이형",
          answerGuide: "양변에 10을 곱하면 3x - 5 = x + 7, 2x = 12이므로 x = 6입니다.",
        },
        {
          number: 2,
          prompt: "민수는 (x - 1)/2 - (x + 2)/3 = 1을 풀면서 양변에 6을 곱해 3x - 1 - 2x + 2 = 6이라고 썼습니다. 민수의 풀이에서 틀린 부분 두 곳을 찾아 바르게 고쳐 푸세요.",
          type: "오류 수정형",
          answerGuide: "분자에 괄호를 해 주어야 하므로 3(x - 1) - 2(x + 2) = 6, 즉 3x - 3 - 2x - 4 = 6이며 해는 x = 13입니다.",
        },
      ],
      teacherNote: "분수 형태에서 분자 전체에 괄호를 치는 습관을 강조해 주세요.",
    },
    {
      level: "매우 어려움",
      title: "[예시] 일차방정식의 심화 탐구와 실생활 모델링",
      learningGoal: "해가 주어진 일차방정식의 미지수를 추론하고 실생활 문제를 방정식으로 모델링하여 설명한다.",
      instructions: "조건을 분석하여 풀이 근거를 명확히 서술하세요.",
      questions: [
        {
          number: 1,
          prompt: "x에 대한 두 일차방정식 2(x - a) = 6과 (x + 2)/3 - x/2 = -1의 해가 서로 같을 때, 상수 a의 값을 구하는 과정을 서술하세요.",
          type: "심화 추론",
          answerGuide: "두 번째 방정식의 양변에 6을 곱하면 2(x + 2) - 3x = -6, -x + 4 = -6이므로 x = 10입니다. 첫 번째 식에 x = 10을 대입하면 2(10 - a) = 6, 10 - a = 3이므로 a = 7입니다.",
        },
        {
          number: 2,
          prompt: "실생활에서 일차방정식으로 해결할 수 있는 상황을 하나 직접 만들고, 미지수 설정부터 방정식 수립, 풀이, 해의 타당성 검토까지 전 과정을 작성하세요.",
          type: "창의·전이형",
          answerGuide: "실생활 상황의 조건이 일차방정식 형태로 일관되게 표현되었는지, 구한 해가 실제 맥락(자연수, 양수 등)에 부합하는지 확인합니다.",
        },
      ],
      teacherNote: "학생이 직접 만든 문장제를 모둠별로 교환해 풀어 보는 확장 활동으로 연결할 수 있습니다.",
    },
  ];

  return {
    id,
    userId: 0,
    title: "[예시] 중학교 1학년 수학 - 일차방정식의 풀이",
    originalName: "일차방정식_예시학습지.txt",
    originalMime: "text/plain",
    originalFileKey: null,
    sourceText: "일차방정식 2(x - 3) = x + 4를 풀고 활용 문제를 해결해 봅시다.",
    subject: "수학",
    gradeBand: "중학교 1~3학년",
    status: "ready",
    analysis: {
      learningGoal: "등식의 성질과 이항을 이해하고 다양한 형태의 일차방정식을 풀어 실생활 문제를 해결한다.",
      subject: "수학",
      suggestedGradeBand: "중학교 1학년",
      skills: ["등식의 성질 적용", "이항과 분배법칙", "방정식 모델링", "오류 분석"],
      sourceSummary: "중학교 1학년 수학 일차방정식의 풀이와 활용 예시 학습지입니다.",
    },
    createdAt: now,
    updatedAt: now,
    levels: sampleLevels.map((lvl, idx) => ({
      id: id * 10 + idx + 1,
      worksheetId: id,
      level: lvl.level,
      title: lvl.title,
      learningGoal: lvl.learningGoal,
      instructions: lvl.instructions,
      questions: lvl.questions,
      teacherNote: lvl.teacherNote,
      content: formatLevelContent(lvl),
      answerGuide: formatAnswerGuide(lvl),
      updatedAt: now,
    })),
  };
}

