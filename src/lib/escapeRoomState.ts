export type RoomStatus = 'idle' | 'running' | 'paused' | 'completed';

export type Hint = {
  id: string;
  title: string;
  body: string;
};

export type RoomTemplate = {
  id: string;
  name: string;
  durationSeconds: number;
  hints: Hint[];
};

export type EscapeRoomState = {
  roomName: string;
  durationSeconds: number;
  remainingSeconds: number;
  status: RoomStatus;
  timeScale: number;
  hints: Hint[];
  activeHintId: string | null;
  hintsRemaining: number;
  lastUpdatedAt: number;
};

export const STORAGE_KEY = 'escape-room-control-state-v2';
export const TEMPLATE_STORAGE_KEY = 'escape-room-templates-v1';
export const SESSION_STORAGE_KEY = 'escape-room-session-v1';
export const PLAYER_HINT_LIMIT = 3;

export const DEFAULT_STATE: EscapeRoomState = {
  roomName: 'The Locked Archive',
  durationSeconds: 60 * 60,
  remainingSeconds: 60 * 60,
  status: 'idle',
  timeScale: 1,
  hints: [
    { id: 'hint-1', title: 'Hint 1', body: 'Replace this clue with the first hint.' },
    { id: 'hint-2', title: 'Hint 2', body: 'Replace this clue with the second hint.' },
    { id: 'hint-3', title: 'Hint 3', body: 'Replace this clue with the third hint.' },
  ],
  activeHintId: null,
  hintsRemaining: PLAYER_HINT_LIMIT,
  lastUpdatedAt: Date.now(),
};

export const DEFAULT_TEMPLATES: RoomTemplate[] = [
  {
    id: 'template-archive',
    name: 'The Locked Archive',
    durationSeconds: 60 * 60,
    hints: [
      { id: 'hint-1', title: 'Start with the bookshelves', body: 'The sequence is hidden where the dusty spines do not quite line up.' },
      { id: 'hint-2', title: 'The key is not locked away', body: 'Check below the metal desk drawer, then follow the numbers on the tag.' },
      { id: 'hint-3', title: 'Final step', body: 'The code is the year the archive was rebuilt, but read the digits backward.' },
    ],
  },
  {
    id: 'template-lab',
    name: 'The Submerged Lab',
    durationSeconds: 45 * 60,
    hints: [
      { id: 'hint-1', title: 'Power first', body: 'The breaker room controls more than the lights.' },
      { id: 'hint-2', title: 'Watch the reflections', body: 'The answer is easier to read where the glass is fogged.' },
      { id: 'hint-3', title: 'Open the hatch', body: 'Use the pressure number, not the valve label.' },
    ],
  },
];

export function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createTemplateFromDefaults(name: string): RoomTemplate {
  return {
    id: createId('template'),
    name,
    durationSeconds: DEFAULT_STATE.durationSeconds,
    hints: structuredClone(DEFAULT_STATE.hints),
  };
}

export function clampSeconds(value: number, maxSeconds: number): number {
  return Math.min(Math.max(Math.round(value), 0), Math.max(0, Math.round(maxSeconds)));
}

export function sanitizeState(input: unknown): EscapeRoomState {
  if (!input || typeof input !== 'object') {
    return structuredClone(DEFAULT_STATE);
  }

  const raw = input as Partial<EscapeRoomState> & { hints?: unknown };
  const durationSeconds = typeof raw.durationSeconds === 'number' && Number.isFinite(raw.durationSeconds) && raw.durationSeconds > 0
    ? Math.round(raw.durationSeconds)
    : DEFAULT_STATE.durationSeconds;
  const remainingSeconds = clampSeconds(typeof raw.remainingSeconds === 'number' ? raw.remainingSeconds : durationSeconds, durationSeconds);
  const status = raw.status === 'running' || raw.status === 'paused' || raw.status === 'completed' ? raw.status : 'idle';
  const hints = normalizeHints(raw.hints);
  const activeHintId = typeof raw.activeHintId === 'string' && hints.some((hint) => hint.id === raw.activeHintId)
    ? raw.activeHintId
    : null;

  return {
    roomName: typeof raw.roomName === 'string' && raw.roomName.trim() ? raw.roomName.trim() : DEFAULT_STATE.roomName,
    durationSeconds,
    remainingSeconds,
    status,
    timeScale: typeof raw.timeScale === 'number' && Number.isFinite(raw.timeScale) && raw.timeScale > 0
      ? Math.min(Math.max(raw.timeScale, 0.5), 1.5)
      : DEFAULT_STATE.timeScale,
    hints,
    activeHintId,
    hintsRemaining: clampSeconds(typeof raw.hintsRemaining === 'number' ? raw.hintsRemaining : PLAYER_HINT_LIMIT, PLAYER_HINT_LIMIT),
    lastUpdatedAt: typeof raw.lastUpdatedAt === 'number' && Number.isFinite(raw.lastUpdatedAt) ? Math.round(raw.lastUpdatedAt) : Date.now(),
  };
}

export function sanitizeTemplates(input: unknown): RoomTemplate[] {
  if (!Array.isArray(input) || input.length === 0) {
    return structuredClone(DEFAULT_TEMPLATES);
  }

  return input.map((template, index) => sanitizeTemplate(template, index)).filter((template): template is RoomTemplate => template !== null);
}

export function createSessionStateFromTemplate(template: RoomTemplate): EscapeRoomState {
  return {
    roomName: template.name,
    durationSeconds: template.durationSeconds,
    remainingSeconds: template.durationSeconds,
    status: 'idle',
    timeScale: 1,
    hints: structuredClone(template.hints),
    activeHintId: null,
    hintsRemaining: PLAYER_HINT_LIMIT,
    lastUpdatedAt: Date.now(),
  };
}

function sanitizeTemplate(template: unknown, index: number): RoomTemplate | null {
  if (!template || typeof template !== 'object') {
    return null;
  }

  const raw = template as Partial<RoomTemplate>;
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : `Template ${index + 1}`;
  const durationSeconds = typeof raw.durationSeconds === 'number' && Number.isFinite(raw.durationSeconds) && raw.durationSeconds > 0
    ? clampSeconds(raw.durationSeconds, 24 * 60 * 60)
    : DEFAULT_STATE.durationSeconds;

  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id : createId('template'),
    name,
    durationSeconds,
    hints: normalizeTemplateHints(raw.hints),
  };
}

function normalizeTemplateHints(input: unknown): Hint[] {
  if (!Array.isArray(input) || input.length === 0) {
    return structuredClone(DEFAULT_STATE.hints);
  }

  return input.map((hint, index) => {
    if (!hint || typeof hint !== 'object') {
      return {
        id: createId('hint'),
        title: `Hint ${index + 1}`,
        body: 'Add a clue here.',
      };
    }

    const raw = hint as Partial<Hint>;
    return {
      id: typeof raw.id === 'string' && raw.id.trim() ? raw.id : createId('hint'),
      title: typeof raw.title === 'string' && raw.title.trim() ? raw.title : `Hint ${index + 1}`,
      body: typeof raw.body === 'string' && raw.body.trim() ? raw.body : 'Add a clue here.',
    };
  });
}

function normalizeHints(input: unknown): Hint[] {
  const fallback = structuredClone(DEFAULT_STATE.hints);

  if (!Array.isArray(input)) {
    return fallback;
  }

  const normalized = input.map((hint, index) => {
    if (!hint || typeof hint !== 'object') {
      return fallback[index] ?? {
        id: createId('hint'),
        title: `Hint ${index + 1}`,
        body: 'Add a clue here.',
      };
    }

    const raw = hint as Partial<Hint>;
    return {
      id: typeof raw.id === 'string' && raw.id.trim() ? raw.id : (fallback[index]?.id ?? createId('hint')),
      title: typeof raw.title === 'string' && raw.title.trim() ? raw.title : (fallback[index]?.title ?? `Hint ${index + 1}`),
      body: typeof raw.body === 'string' && raw.body.trim() ? raw.body : (fallback[index]?.body ?? 'Add a clue here.'),
    };
  });

  while (normalized.length < fallback.length) {
    normalized.push(fallback[normalized.length]);
  }

  return normalized;
}

export function formatClock(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function getDerivedRemainingSeconds(state: EscapeRoomState, now = Date.now()): number {
  if (state.status !== 'running') {
    return clampSeconds(state.remainingSeconds, state.durationSeconds);
  }

  const elapsed = Math.floor(((now - state.lastUpdatedAt) / 1000) * state.timeScale);
  return clampSeconds(state.remainingSeconds - elapsed, state.durationSeconds);
}

export function getActiveHint(state: EscapeRoomState): Hint | null {
  return state.hints.find((hint) => hint.id === state.activeHintId) ?? null;
}
