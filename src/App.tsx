import { useEffect, useMemo, useReducer, useState, type Dispatch, type SetStateAction } from 'react';
import {
  DEFAULT_STATE,
  DEFAULT_TEMPLATES,
  PLAYER_HINT_LIMIT,
  SESSION_STORAGE_KEY,
  STORAGE_KEY,
  TEMPLATE_STORAGE_KEY,
  createId,
  createSessionStateFromTemplate,
  createTemplateFromDefaults,
  formatClock,
  getActiveHint,
  getDerivedRemainingSeconds,
  sanitizeState,
  sanitizeTemplates,
  type EscapeRoomState,
  type Hint,
  type RoomTemplate,
} from './lib/escapeRoomState';

type Action =
  | { type: 'replace'; state: EscapeRoomState }
  | { type: 'set-duration-minutes'; value: number }
  | { type: 'set-time-scale'; value: number; now: number }
  | { type: 'start-timer'; now: number }
  | { type: 'pause-timer'; now: number }
  | { type: 'reset-timer'; now: number }
  | { type: 'finish-timer'; now: number }
  | { type: 'adjust-time'; deltaSeconds: number; now: number }
  | { type: 'reveal-hint'; hintId: string; consumes: boolean }
  | { type: 'consume-hint' }
  | { type: 'hide-active-hint' };

type CustomHintDraft = {
  title: string;
  body: string;
};

type TemporaryDisplayState =
  | { kind: 'custom-hint'; hint: CustomHintDraft }
  | { kind: 'warning'; text: string }
  | null;

type DesktopApi = {
  openDisplayWindow?: () => void;
  toggleDisplayFullscreen?: () => void;
  setDisplayFullscreen?: (nextFullscreen: boolean) => void;
};

type DisplayMessage =
  | { type: 'custom-hint'; hint: CustomHintDraft; consumes: boolean }
  | { type: 'warning'; text: string }
  | { type: 'clear' };

const DISPLAY_CHANNEL = 'escape-room-display-v1';

function postDisplayMessage(message: DisplayMessage) {
  if (typeof BroadcastChannel === 'undefined') {
    return;
  }

  const channel = new BroadcastChannel(DISPLAY_CHANNEL);
  channel.postMessage(message);
  channel.close();
}

function deriveState(state: EscapeRoomState, now: number): EscapeRoomState {
  const remainingSeconds = getDerivedRemainingSeconds(state, now);

  if (state.status === 'running' && remainingSeconds <= 0) {
    return {
      ...state,
      status: 'completed',
      remainingSeconds: 0,
      lastUpdatedAt: now,
    };
  }

  return {
    ...state,
    remainingSeconds,
  };
}

function reducer(state: EscapeRoomState, action: Action): EscapeRoomState {
  switch (action.type) {
    case 'replace':
      return action.state;
    case 'set-duration-minutes': {
      const durationSeconds = Math.max(60, Math.min(24 * 60 * 60, Math.round(action.value * 60)));
      return {
        ...state,
        durationSeconds,
        remainingSeconds: Math.min(state.remainingSeconds, durationSeconds),
      };
    }
    case 'set-time-scale': {
      const currentRemaining = getDerivedRemainingSeconds(state, action.now);
      return {
        ...state,
        timeScale: Math.min(Math.max(action.value, 0.5), 1.5),
        remainingSeconds: state.status === 'running' ? currentRemaining : state.remainingSeconds,
        lastUpdatedAt: action.now,
      };
    }
    case 'start-timer': {
      const remainingSeconds = getDerivedRemainingSeconds(state, action.now);
      return {
        ...state,
        status: remainingSeconds <= 0 ? 'completed' : 'running',
        remainingSeconds: remainingSeconds <= 0 ? 0 : remainingSeconds,
        lastUpdatedAt: action.now,
      };
    }
    case 'pause-timer': {
      if (state.status !== 'running') {
        return state;
      }

      return {
        ...state,
        status: 'paused',
        remainingSeconds: getDerivedRemainingSeconds(state, action.now),
        lastUpdatedAt: action.now,
      };
    }
    case 'reset-timer':
      return {
        ...state,
        status: 'idle',
        remainingSeconds: state.durationSeconds,
        activeHintId: null,
        hintsRemaining: PLAYER_HINT_LIMIT,
        lastUpdatedAt: action.now,
      };
    case 'finish-timer':
      return {
        ...state,
        status: 'completed',
        remainingSeconds: 0,
        lastUpdatedAt: action.now,
      };
    case 'adjust-time': {
      const currentRemaining = getDerivedRemainingSeconds(state, action.now);
      const remainingSeconds = Math.max(0, Math.min(state.durationSeconds, Math.round(currentRemaining + action.deltaSeconds)));
      const status = remainingSeconds === 0 ? 'completed' : state.status === 'idle' && action.deltaSeconds > 0 ? 'idle' : state.status;

      return {
        ...state,
        status,
        remainingSeconds,
        lastUpdatedAt: action.now,
      };
    }
    case 'reveal-hint': {
      if (action.consumes && state.hintsRemaining <= 0) {
        return state;
      }

      return {
        ...state,
        activeHintId: action.hintId,
        hintsRemaining: action.consumes ? state.hintsRemaining - 1 : state.hintsRemaining,
      };
    }
    case 'consume-hint':
      return {
        ...state,
        hintsRemaining: Math.max(0, state.hintsRemaining - 1),
      };
    case 'hide-active-hint':
      return {
        ...state,
        activeHintId: null,
      };
    default:
      return state;
  }
}

function useRoomTemplates() {
  const [templates, setTemplates] = useState<RoomTemplate[]>(() => {
    const stored = window.localStorage.getItem(TEMPLATE_STORAGE_KEY);
    return sanitizeTemplates(stored ? JSON.parse(stored) : DEFAULT_TEMPLATES);
  });

  useEffect(() => {
    window.localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(templates));
  }, [templates]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== TEMPLATE_STORAGE_KEY || !event.newValue) {
        return;
      }

      setTemplates(sanitizeTemplates(JSON.parse(event.newValue)));
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  return [templates, setTemplates] as const;
}

function useRoomSession() {
  const [session, setSession] = useState<EscapeRoomState>(() => {
    const stored = window.localStorage.getItem(SESSION_STORAGE_KEY);
    return sanitizeState(stored ? JSON.parse(stored) : DEFAULT_STATE);
  });

  useEffect(() => {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  }, [session]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== SESSION_STORAGE_KEY || !event.newValue) {
        return;
      }

      setSession(sanitizeState(JSON.parse(event.newValue)));
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  return [session, setSession] as const;
}

function useNow() {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return now;
}

function useTemporaryDisplay() {
  const [temporaryDisplay, setTemporaryDisplay] = useState<TemporaryDisplayState>(null);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') {
      return;
    }

    const channel = new BroadcastChannel(DISPLAY_CHANNEL);
    channel.onmessage = (event: MessageEvent<DisplayMessage>) => {
      const message = event.data;
      if (!message) {
        return;
      }

      if (message.type === 'custom-hint') {
        setTemporaryDisplay({ kind: 'custom-hint', hint: message.hint });
        return;
      }

      if (message.type === 'warning') {
        setTemporaryDisplay({ kind: 'warning', text: message.text });
        return;
      }

      if (message.type === 'clear') {
        setTemporaryDisplay(null);
      }
    };

    return () => channel.close();
  }, []);

  return [temporaryDisplay, setTemporaryDisplay] as const;
}

function App() {
  const [templates, setTemplates] = useRoomTemplates();
  const [session, setSession] = useRoomSession();
  const [temporaryDisplay] = useTemporaryDisplay();
  const now = useNow();
  const desktopApi = (window as Window & { escapeRoom?: DesktopApi }).escapeRoom;
  const hash = window.location.hash.toLowerCase();
  const screen = hash.includes('display') ? 'display' : hash.includes('control') ? 'control' : 'home';
  const effectiveSession = useMemo(() => deriveState(session, now), [session, now]);
  const activeHint = useMemo(() => getActiveHint(effectiveSession), [effectiveSession]);
  const progress = effectiveSession.durationSeconds === 0 ? 0 : 1 - effectiveSession.remainingSeconds / effectiveSession.durationSeconds;

  useEffect(() => {
    if (effectiveSession.status === 'running' && effectiveSession.remainingSeconds <= 0) {
      setSession((current) => ({ ...current, status: 'completed', remainingSeconds: 0, lastUpdatedAt: now }));
    }
  }, [effectiveSession.remainingSeconds, effectiveSession.status, now, setSession]);

  const openRoomFromTemplate = (template: RoomTemplate) => {
    setSession(createSessionStateFromTemplate(template));
    window.location.hash = '#/control';
  };

  const openDisplay = () => {
    if (desktopApi?.openDisplayWindow) {
      desktopApi.openDisplayWindow();
      return;
    }

    window.open(`${window.location.pathname}#/display`, '_blank', 'noopener,noreferrer');
  };

  const fullscreenDisplay = () => {
    if (desktopApi?.toggleDisplayFullscreen) {
      desktopApi.toggleDisplayFullscreen();
      return;
    }

    openDisplay();
  };

  const activeTemplate = templates[0] ?? null;

  return (
    <div className={screen === 'display' ? 'shell shell--display' : 'shell'}>
      {screen === 'display' ? (
        <DisplayScreen state={effectiveSession} activeHint={activeHint} temporaryDisplay={temporaryDisplay} />
      ) : screen === 'control' ? (
        <ControlRoom
          state={effectiveSession}
          activeHint={activeHint}
          progress={progress}
          now={now}
          dispatch={(action) => setSession((current) => reducer(current, action))}
          openDisplay={openDisplay}
          fullscreenDisplay={fullscreenDisplay}
          backToTemplates={() => {
            window.location.hash = '#/home';
          }}
        />
      ) : (
        <LandingScreen
          templates={templates}
          setTemplates={setTemplates}
          activeTemplate={activeTemplate}
          onStartRoom={openRoomFromTemplate}
          onResumeRoom={() => {
            window.location.hash = '#/control';
          }}
        />
      )}
    </div>
  );
}

function LandingScreen({
  templates,
  setTemplates,
  activeTemplate,
  onStartRoom,
  onResumeRoom,
}: {
  templates: RoomTemplate[];
  setTemplates: Dispatch<SetStateAction<RoomTemplate[]>>;
  activeTemplate: RoomTemplate | null;
  onStartRoom: (template: RoomTemplate) => void;
  onResumeRoom: () => void;
}) {
  const [selectedTemplateId, setSelectedTemplateId] = useState(activeTemplate?.id ?? templates[0]?.id ?? '');

  useEffect(() => {
    if (templates.length === 0) {
      return;
    }

    if (!templates.some((template) => template.id === selectedTemplateId)) {
      setSelectedTemplateId(templates[0].id);
    }
  }, [selectedTemplateId, templates]);

  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? templates[0] ?? null;

  const updateSelectedTemplate = (updater: (template: RoomTemplate) => RoomTemplate) => {
    if (!selectedTemplate) {
      return;
    }

    setTemplates((current) => current.map((template) => (template.id === selectedTemplate.id ? updater(template) : template)));
  };

  const addTemplate = () => {
    const template = createTemplateFromDefaults('New room template');
    setTemplates((current) => [...current, template]);
    setSelectedTemplateId(template.id);
  };

  const deleteTemplate = (templateId: string) => {
    setTemplates((current) => {
      const nextTemplates = current.filter((template) => template.id !== templateId);
      return nextTemplates.length > 0 ? nextTemplates : [createTemplateFromDefaults('New room template')];
    });

    if (selectedTemplateId === templateId) {
      setSelectedTemplateId('');
    }
  };

  return (
    <main className="landing-screen">
      <section className="landing-hero card">
        <div>
          <span className="eyebrow">Template Library</span>
          <h1>Choose a room template</h1>
          <p>Edit the room name and hints here, then open the live control room.</p>
        </div>
        <div className="landing-actions">
          <button className="primary-button" type="button" onClick={addTemplate}>
            New template
          </button>
          <button className="secondary-button" type="button" onClick={onResumeRoom}>
            Resume current room
          </button>
        </div>
      </section>

      <section className="landing-grid">
        <div className="card panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Templates</span>
              <h2>Saved rooms</h2>
            </div>
          </div>

          <div className="template-list">
            {templates.map((template) => {
              const isSelected = template.id === selectedTemplateId;
              return (
                <button
                  key={template.id}
                  className={isSelected ? 'template-card template-card--selected' : 'template-card'}
                  type="button"
                  onClick={() => setSelectedTemplateId(template.id)}
                >
                  <strong>{template.name}</strong>
                  <span>{Math.round(template.durationSeconds / 60)} minutes</span>
                  <span>{template.hints.length} hints</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="card panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Editor</span>
              <h2>{selectedTemplate ? selectedTemplate.name : 'No template selected'}</h2>
            </div>
            {selectedTemplate ? (
              <div className="landing-actions">
                <button className="primary-button" type="button" onClick={() => onStartRoom(selectedTemplate)}>
                  Open room
                </button>
                <button className="secondary-button" type="button" onClick={() => deleteTemplate(selectedTemplate.id)}>
                  Delete template
                </button>
              </div>
            ) : null}
          </div>

          {selectedTemplate ? (
            <div className="template-editor">
              <div>
                <label className="field-label" htmlFor="template-name">
                  Room name
                </label>
                <input
                  id="template-name"
                  className="text-input"
                  value={selectedTemplate.name}
                  onChange={(event) =>
                    updateSelectedTemplate((template) => ({
                      ...template,
                      name: event.target.value,
                    }))
                  }
                />
              </div>

              <div className="duration-row">
                <label className="field-label" htmlFor="template-duration">
                  Duration in minutes
                </label>
                <input
                  id="template-duration"
                  className="number-input"
                  type="number"
                  min={1}
                  max={240}
                  value={Math.round(selectedTemplate.durationSeconds / 60)}
                  onChange={(event) =>
                    updateSelectedTemplate((template) => ({
                      ...template,
                      durationSeconds: Math.max(60, Math.min(24 * 60 * 60, Number(event.target.value || 0) * 60)),
                    }))
                  }
                />
              </div>

              <div className="template-hint-header">
                <span className="eyebrow">Hints</span>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() =>
                    updateSelectedTemplate((template) => ({
                      ...template,
                      hints: [
                        ...template.hints,
                        {
                          id: createId('hint'),
                          body: 'Add a clue here.',
                        },
                      ],
                    }))
                  }
                >
                  Add hint
                </button>
              </div>

              <div className="template-hint-list">
                {selectedTemplate.hints.map((hint, index) => (
                  <article key={hint.id} className="template-hint-card">
                    <div className="hint-card__header">
                      <div>
                        <div className="hint-index">Hint {index + 1}</div>
                        {/* title removed; use body only */}
                      </div>
                      <button
                        className="icon-button"
                        type="button"
                        onClick={() =>
                          updateSelectedTemplate((template) => ({
                            ...template,
                            hints: template.hints.filter((entry) => entry.id !== hint.id),
                          }))
                        }
                      >
                        Remove
                      </button>
                    </div>
                    <textarea
                      className="hint-body"
                      rows={3}
                      value={hint.body}
                      onChange={(event) =>
                        updateSelectedTemplate((template) => ({
                          ...template,
                          hints: template.hints.map((entry) =>
                            entry.id === hint.id ? { ...entry, body: event.target.value } : entry,
                          ),
                        }))
                      }
                    />
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function ControlRoom({
  state,
  activeHint,
  progress,
  now,
  dispatch,
  openDisplay,
  fullscreenDisplay,
  backToTemplates,
}: {
  state: EscapeRoomState;
  activeHint: Hint | null;
  progress: number;
  now: number;
  dispatch: Dispatch<Action>;
  openDisplay: () => void;
  fullscreenDisplay: () => void;
  backToTemplates: () => void;
}) {
  const remainingLabel = formatClock(state.remainingSeconds);
  const [consumeOnShowByHintId, setConsumeOnShowByHintId] = useState<Record<string, boolean>>({});
  const [customTitle, setCustomTitle] = useState('');
  const [customBody, setCustomBody] = useState('');
  const [customConsumes, setCustomConsumes] = useState(true);
  const [warningText, setWarningText] = useState('');

  const toggleConsumeHint = (hintId: string) => {
    setConsumeOnShowByHintId((current) => ({
      ...current,
      [hintId]: !(current[hintId] ?? true),
    }));
  };

  const showHint = (hintId: string) => {
    const consumes = consumeOnShowByHintId[hintId] ?? true;
    dispatch({ type: 'reveal-hint', hintId, consumes });
  };

  const clearDisplay = () => {
    postDisplayMessage({ type: 'clear' });
    setCustomTitle('');
    setCustomBody('');
    setWarningText('');
  };

  const clearWarning = () => {
    postDisplayMessage({ type: 'clear' });
    setWarningText('');
  };

  const showCustomHint = () => {
    const title = (customTitle ?? '').trim();
    const body = (customBody ?? '').trim();

    if (!body) {
      return;
    }

    postDisplayMessage({
      type: 'custom-hint',
      hint: { title, body },
      consumes: customConsumes,
    });

    if (customConsumes) {
      dispatch({ type: 'consume-hint' });
    }
  };

  const showWarning = () => {
    postDisplayMessage({
      type: 'warning',
      text: (warningText ?? '').trim(),
    });
  };

  const tempoOptions = [0.9, 1, 1.1];

  return (
    <main className="dashboard">
      <section className="hero-panel card">
        <div className="hero-panel__topline">
          <div>
            <span className="eyebrow">Live Room</span>
            <h1>{state.roomName}</h1>
          </div>
          <div className="hero-panel__buttons">
            <button className="ghost-button" type="button" onClick={backToTemplates}>
              Back to templates
            </button>
            <button className="ghost-button" type="button" onClick={openDisplay}>
              Open display
            </button>
            <button className="ghost-button" type="button" onClick={fullscreenDisplay}>
              Fullscreen display
            </button>
            <button
              className="ghost-button"
              type="button"
              onClick={() => {
                clearDisplay();
                dispatch({ type: 'reset-timer', now });
              }}
            >
              Reset
            </button>
          </div>
        </div>

        <div className="timer-stack">
          <div>
            <div className="field-label">Time remaining</div>
            <div className={state.remainingSeconds <= 300 ? 'timer timer--urgent' : 'timer'}>{remainingLabel}</div>
          </div>
          <div className="progress-bar" aria-hidden="true">
            <span style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }} />
          </div>
          <div className="status-row">
            <span className={`status-badge status-badge--${state.status}`}>{state.status}</span>
            <span>{Math.round(progress * 100)}% complete</span>
            <span>{state.hintsRemaining} hints remaining</span>
          </div>
        </div>

        <div className="control-cluster">
          <button className="primary-button" type="button" onClick={() => dispatch({ type: 'start-timer', now })}>
            Start / Resume
          </button>
          <button className="secondary-button" type="button" onClick={() => dispatch({ type: 'pause-timer', now })}>
            Pause
          </button>
          <button className="secondary-button" type="button" onClick={() => dispatch({ type: 'finish-timer', now })}>
            End session
          </button>
        </div>

          <div className="adjust-grid">
            <button className="chip-button" type="button" onClick={() => dispatch({ type: 'adjust-time', deltaSeconds: -300, now })}>
              -5 min
            </button>
            <button className="chip-button" type="button" onClick={() => dispatch({ type: 'adjust-time', deltaSeconds: -60, now })}>
              -1 min
            </button>
            <button className="chip-button" type="button" onClick={() => dispatch({ type: 'adjust-time', deltaSeconds: 60, now })}>
              +1 min
            </button>
            <button className="chip-button" type="button" onClick={() => dispatch({ type: 'adjust-time', deltaSeconds: 300, now })}>
              +5 min
            </button>
          </div>

        <div className="tempo-row">
          <div className="field-label">Tempo</div>
          <div className="tempo-buttons">
            {tempoOptions.map((value) => (
              <button
                key={value}
                className={state.timeScale === value ? 'chip-button chip-button--active' : 'chip-button'}
                type="button"
                onClick={() => dispatch({ type: 'set-time-scale', value, now })}
              >
                {value < 1 ? 'Slow' : value > 1 ? 'Fast' : 'Normal'}
              </button>
            ))}
          </div>
        </div>

        <div className="duration-row">
          <label className="field-label" htmlFor="duration-minutes">
            Duration in minutes
          </label>
          <input
            id="duration-minutes"
            className="number-input"
            type="number"
            min={1}
            max={240}
            value={Math.round(state.durationSeconds / 60)}
            onChange={(event) => dispatch({ type: 'set-duration-minutes', value: Number(event.target.value || 0) })}
          />
        </div>
      </section>

      <section className="two-column-layout">
        <div className="card panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Hints</span>
              <h2>Fixed room clues</h2>
            </div>
          </div>

          <div className="hint-list">
            {state.hints.map((hint, index) => {
              const isActive = activeHint?.id === hint.id;
              const consumes = consumeOnShowByHintId[hint.id] ?? true;

              return (
                <article key={hint.id} className={isActive ? 'hint-card hint-card--visible' : 'hint-card'}>
                  <div className="hint-card__header">
                    <div>
                      <div className="hint-index">Hint {index + 1}</div>
                      {/* title removed; no heading */}
                    </div>
                    <div className="hint-actions">
                      <button className="icon-button" type="button" onClick={() => toggleConsumeHint(hint.id)}>
                        Consume: {consumes ? 'Yes' : 'No'}
                      </button>
                      <button className="icon-button" type="button" onClick={() => showHint(hint.id)}>
                        Show hint
                      </button>
                    </div>
                  </div>
                  <p className="hint-copy">{hint.body}</p>
                  <div className="hint-footer">
                    <span>{isActive ? 'Active on display' : 'Not shown yet'}</span>
                    {isActive ? (
                      <button className="icon-button" type="button" onClick={() => dispatch({ type: 'hide-active-hint' })}>
                        Hide display
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>

          <div className="helper-text">Edit these hints from the landing page, then return here to run the room.</div>
        </div>

        <div className="card panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Custom display</span>
              <h2>Temporary clue or warning</h2>
            </div>
          </div>

          <div className="custom-hint-form">
            <div>
              <label className="field-label" htmlFor="custom-hint-title">
                Title
              </label>
              <input
                id="custom-hint-title"
                className="text-input"
                value={customTitle}
                onChange={(event) => setCustomTitle(event.target.value)}
                placeholder="Custom hint"
              />
            </div>
            <div>
              <label className="field-label" htmlFor="custom-hint-body">
                Hint text
              </label>
              <textarea
                id="custom-hint-body"
                className="hint-body"
                rows={4}
                value={customBody}
                onChange={(event) => setCustomBody(event.target.value)}
                placeholder="This hint will only show on the display and will not be saved."
              />
            </div>
            <button className="chip-button" type="button" onClick={() => setCustomConsumes((current) => !current)}>
              Consume hint: {customConsumes ? 'Yes' : 'No'}
            </button>
            <div className="control-cluster">
              <button className="primary-button" type="button" onClick={showCustomHint}>
                Show custom hint
              </button>
              <button className="secondary-button" type="button" onClick={clearDisplay}>
                Clear display
              </button>
            </div>
          </div>

          <div className="warning-panel">
            <div className="panel-header panel-header--compact">
              <div>
                <span className="eyebrow">Warning</span>
                <h2>Red alert overlay</h2>
              </div>
            </div>
            <textarea
              className="hint-body"
              rows={3}
              value={warningText}
              onChange={(event) => setWarningText(event.target.value)}
              placeholder="Optional warning text. Leave blank for just the red overlay."
            />
            <div className="control-cluster">
              <button className="primary-button" type="button" onClick={showWarning}>
                Show warning
              </button>
              <button className="secondary-button" type="button" onClick={clearWarning}>
                Clear warning
              </button>
            </div>
          </div>

          <div className="summary-grid">
            <div className="summary-card">
              <span className="eyebrow">Clock</span>
              <strong>{remainingLabel}</strong>
              <span>{state.status}</span>
            </div>
            <div className="summary-card">
              <span className="eyebrow">Hints remaining</span>
              <strong>{state.hintsRemaining}</strong>
              <span>Out of {PLAYER_HINT_LIMIT}</span>
            </div>
            <div className="summary-card">
              <span className="eyebrow">Room</span>
              <strong>{state.roomName}</strong>
              <span>{activeHint ? 'Hint visible' : 'Hidden'}</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function DisplayScreen({
  state,
  activeHint,
  temporaryDisplay,
}: {
  state: EscapeRoomState;
  activeHint: Hint | null;
  temporaryDisplay: TemporaryDisplayState;
}) {
  const remainingLabel = formatClock(state.remainingSeconds);
  const warningActive = temporaryDisplay?.kind === 'warning';
  const visibleHintBody = warningActive
    ? null
    : temporaryDisplay?.kind === 'custom-hint'
    ? temporaryDisplay.hint.body
    : activeHint?.body ?? null;

  return (
    <main className={warningActive ? 'display-screen display-screen--warning' : 'display-screen'}>
      <section className="display-stage card">
        <div className="display-stage__top">
          <div>
            <div className="eyebrow">Live room display</div>
            <h1>{state.roomName}</h1>
            <p>{state.hintsRemaining} hints remaining</p>
          </div>
          <div className={`status-badge status-badge--${state.status}`}>{state.status}</div>
        </div>

        <div className={state.remainingSeconds <= 300 ? 'display-clock display-clock--urgent' : 'display-clock'}>
          {remainingLabel}
        </div>

        <div className="display-caption">
          {state.status === 'completed' ? 'Session complete' : state.status === 'running' ? 'Timer active' : 'Waiting for operator'}
        </div>

        <div className="display-hint-wrapper">
          <div className="hints-remaining-wrapper">
            <span className="hints-remaining">{state.hintsRemaining} remaining</span>
          </div>

          <div className="display-hint-panel">
            <div className="panel-header panel-header--compact">
              <div>
                <span className="eyebrow">Current clue</span>
                <h2>Clue revealed</h2>
              </div>
            </div>

            {visibleHintBody ? <p className="display-clue-body">{visibleHintBody}</p> : <p className="no-clue">No clue revealed</p>}
          </div>
        </div>

        {warningActive ? (
          <div className="display-warning-panel">
            <div className="panel-header panel-header--compact">
              <div>
                <span className="eyebrow">Warning</span>
                <h2>Alert</h2>
              </div>
            </div>
            {temporaryDisplay?.kind === 'warning' && temporaryDisplay.text ? <p>{temporaryDisplay.text}</p> : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}

export default App;