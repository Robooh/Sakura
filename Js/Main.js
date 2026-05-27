/* ═══════════════════════════════════════════════════════════════
   SAKURA — Js/Main.js
   ───────────────────────────────────────────────────────────────
   Three core systems, loaded in this order:
     1. Navigation    — single-page routing between the 4 sections
     2. Event Manager — create / edit / delete events (localStorage)
     3. Time Engine   — UTC-3 clock, flow-state bar, alarm system
   ═══════════════════════════════════════════════════════════════ */

'use strict';


/* ─────────────────────────────────────────────────────────────
   ■ CONSTANTS
───────────────────────────────────────────────────────────── */
const TIMEZONE       = 'America/Sao_Paulo';   // UTC-3 / BRT
const ALARM_SRC      = 'Src/Womp.mp3';      // drop your MP3 here
const STORAGE_KEY    = 'sakura-events';
const STREAK_KEY     = 'sakura-streak';
const ALARM_LOG_KEY  = 'sakura-alarm-log';     // tracks fired alarms

/* Category meta — icon + label, used when rendering cards */
const CATEGORIES = {
  work:      { label: 'Work',      icon: 'work',            color: 'text-tertiary'  },
  personal:  { label: 'Personal',  icon: 'person',          color: 'text-primary'   },
  health:    { label: 'Health',    icon: 'favorite',        color: 'text-error'     },
  important: { label: 'Important', icon: 'priority_high',   color: 'text-primary'   },
  break:     { label: 'Break',     icon: 'coffee',          color: 'text-on-surface-variant' },
  other:     { label: 'Other',     icon: 'event',           color: 'text-on-surface-variant' },
};


/* ─────────────────────────────────────────────────────────────
   ■ STATE
───────────────────────────────────────────────────────────── */
let events      = loadEvents();
let activeFilter = 'all';
let editingId    = null;          // null = creating new, string = editing


/* ═══════════════════════════════════════════════════════════════
   SYSTEM 1 — NAVIGATION
   Intercepts all nav-link / mob-nav-link clicks, shows only the
   requested <section class="page">, and updates active styles.
   Replaces the CSS :target routing entirely.
   ═══════════════════════════════════════════════════════════════ */

/**
 * Show one page and hide all others.
 * @param {string} pageId  — e.g. 'page-dashboard'
 */
function navigateTo(pageId) {
  /* ── Show / hide sections ── */
  document.querySelectorAll('.page').forEach(section => {
    section.style.display = section.id === pageId ? 'flex' : 'none';
  });

  /* ── Update desktop sidebar active link ── */
  document.querySelectorAll('.nav-link').forEach(link => {
    const target = link.getAttribute('href').replace('#', '');
    const isActive = target === pageId;

    link.classList.toggle('nav-active', isActive);

    /* Active visual */
    if (isActive) {
      link.style.background    = 'rgba(255, 77, 109, 0.10)';
      link.style.color         = '#FF4D6D';
      link.style.borderColor   = 'rgba(255, 77, 109, 0.30)';
      link.style.fontWeight    = '700';
    } else {
      link.style.background    = '';
      link.style.color         = '';
      link.style.borderColor   = '';
      link.style.fontWeight    = '';
    }
  });

  /* ── Update mobile bottom nav active link ── */
  document.querySelectorAll('.mob-nav-link').forEach(link => {
    const target = link.getAttribute('href').replace('#', '');
    const isActive = target === pageId;
    link.style.color = isActive ? '#FF4D6D' : '';
    /* Active bar above icon */
    link.style.setProperty('--bar-scale', isActive ? '1' : '0');
  });

  /* ── Re-render data on navigation ── */
  if (pageId === 'page-dashboard') {
    renderFlowState();
    renderDashboardActions();
    updateStreak();
  }
  if (pageId === 'page-timeline') {
    renderTimelineEvents(activeFilter);
  }
}

/** Wire up every nav link (desktop + mobile) to navigateTo(). */
function initNavigation() {
  const allNavLinks = document.querySelectorAll('.nav-link, .mob-nav-link');

  allNavLinks.forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const pageId = link.getAttribute('href').replace('#', '');
      navigateTo(pageId);
    });
  });

  /* "New Event" buttons — open modal, stay on current page */
  const newEventButtons = [
    document.getElementById('btn-sidebar-new-event'),
    document.getElementById('btn-mobile-fab-add'),
    document.getElementById('btn-timeline-add-event'),
  ];
  newEventButtons.forEach(btn => {
    if (btn) btn.addEventListener('click', () => openEventModal());
  });

  /* Mobile menu button — placeholder (drawer to be built later) */
  const mobileMenuBtn = document.getElementById('btn-mobile-menu');
  if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', () => {
      /* JS TODO: slide-in mobile drawer */
      console.log('[Sakura] Mobile drawer coming soon.');
    });
  }
}


/* ═══════════════════════════════════════════════════════════════
   SYSTEM 2 — EVENT MANAGER
   localStorage persistence, modal CRUD, filter chips,
   and rendering into both the Timeline page and the Dashboard.
   ═══════════════════════════════════════════════════════════════ */

/* ── LocalStorage helpers ── */

function loadEvents() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveEvents() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

function generateId() {
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}


/* ── Modal ── */

/**
 * Build and inject the New / Edit Event modal into the DOM.
 * @param {object|null} eventData  Pass an existing event to pre-fill for editing.
 */
function openEventModal(eventData = null) {
  editingId = eventData ? eventData.id : null;

  /* Remove any existing modal first */
  document.getElementById('sakura-modal')?.remove();

  const isEdit  = Boolean(eventData);
  const data    = eventData || { title: '', description: '', time: '', duration: 30, category: 'work' };

  /* Build category <option> list */
  const categoryOptions = Object.entries(CATEGORIES)
    .map(([key, meta]) => `
      <option value="${key}" ${data.category === key ? 'selected' : ''}>
        ${meta.label}
      </option>`)
    .join('');

  /* Modal HTML */
  const modal = document.createElement('div');
  modal.id = 'sakura-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', isEdit ? 'Editar evento' : 'Novo evento');

  modal.innerHTML = `
    <!-- Backdrop -->
    <div id="modal-backdrop"
         class="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
         style="display:flex; align-items:center; justify-content:center; padding:16px;">

      <!-- Dialog -->
      <div class="w-full max-w-lg bg-surface-container-low rounded-xl border border-outline-variant/30
                  glow-subtle overflow-hidden flex flex-col"
           style="max-height:90vh;">

        <!-- Header -->
        <div class="flex items-center justify-between px-lg py-md border-b border-outline-variant/20
                    flex-shrink-0">
          <h2 class="text-headline-md font-headline-md text-on-surface">
            ${isEdit ? 'Editar Evento' : 'Novo Evento'}
          </h2>
          <button id="modal-close-btn"
                  class="p-2 text-on-surface-variant hover:text-on-surface
                         hover:bg-surface-container rounded-full transition-colors"
                  aria-label="Fechar modal">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <!-- Form body -->
        <div class="overflow-y-auto flex-1 px-lg py-md">
          <form id="event-form" class="flex flex-col gap-md" novalidate>

            <!-- Title -->
            <div class="flex flex-col gap-xs">
              <label for="input-title"
                     class="text-label-sm label-font label-font text-on-surface-variant uppercase tracking-wider">
                Título *
              </label>
              <input id="input-title" type="text"
                     value="${escapeHtml(data.title)}"
                     placeholder="Ex: Reunião de alinhamento"
                     maxlength="80" required
                     class="bg-surface-container border border-outline-variant/40 rounded-lg
                            px-md py-3 text-body-md text-on-surface placeholder:text-on-surface-variant/40
                            focus:outline-none focus:border-primary transition-colors" />
              <span id="error-title" class="text-label-sm label-font text-error hidden">
                O título é obrigatório.
              </span>
            </div>

            <!-- Time + Duration row -->
            <div class="flex gap-md">
              <div class="flex flex-col gap-xs flex-1">
                <label for="input-time"
                       class="text-label-sm label-font text-on-surface-variant uppercase tracking-wider">
                  Horário * <span class="normal-case">(BRT, UTC-3)</span>
                </label>
                <input id="input-time" type="time"
                       value="${data.time}"
                       required
                       class="bg-surface-container border border-outline-variant/40 rounded-lg
                              px-md py-3 text-body-md text-on-surface
                              focus:outline-none focus:border-primary transition-colors
                              [color-scheme:dark]" />
                <span id="error-time" class="text-label-sm label-font text-error hidden">
                  O horário é obrigatório.
                </span>
              </div>

              <div class="flex flex-col gap-xs" style="width:130px;">
                <label for="input-duration"
                       class="text-label-sm label-font text-on-surface-variant uppercase tracking-wider">
                  Duração (min)
                </label>
                <input id="input-duration" type="number"
                       value="${data.duration}"
                       min="1" max="480" step="5"
                       class="bg-surface-container border border-outline-variant/40 rounded-lg
                              px-md py-3 text-body-md text-on-surface
                              focus:outline-none focus:border-primary transition-colors" />
              </div>
            </div>

            <!-- Category -->
            <div class="flex flex-col gap-xs">
              <label for="input-category"
                     class="text-label-sm label-font text-on-surface-variant uppercase tracking-wider">
                Categoria
              </label>
              <select id="input-category"
                      class="bg-surface-container border border-outline-variant/40 rounded-lg
                             px-md py-3 text-body-md text-on-surface
                             focus:outline-none focus:border-primary transition-colors
                             [color-scheme:dark]">
                ${categoryOptions}
              </select>
            </div>

            <!-- Description -->
            <div class="flex flex-col gap-xs">
              <label for="input-description"
                     class="text-label-sm label-font text-on-surface-variant uppercase tracking-wider">
                Descrição
              </label>
              <textarea id="input-description" rows="3"
                        placeholder="Detalhes do evento..."
                        maxlength="300"
                        class="bg-surface-container border border-outline-variant/40 rounded-lg
                               px-md py-3 text-body-md text-on-surface placeholder:text-on-surface-variant/40
                               focus:outline-none focus:border-primary transition-colors resize-none"
              >${escapeHtml(data.description)}</textarea>
            </div>

          </form>
        </div>

        <!-- Footer actions -->
        <div class="flex items-center gap-md px-lg py-md border-t border-outline-variant/20
                    flex-shrink-0 ${isEdit ? 'justify-between' : 'justify-end'}">
          ${isEdit ? `
            <button id="modal-delete-btn"
                    class="px-5 py-2.5 rounded-lg text-label-sm label-font font-bold text-error
                           bg-error-container/20 border border-error/30
                           hover:bg-error-container/40 transition-colors flex items-center gap-2">
              <span class="material-symbols-outlined" style="font-size:18px;">delete</span>
              Excluir
            </button>` : ''}
          <div class="flex gap-md">
            <button id="modal-cancel-btn"
                    class="px-5 py-2.5 rounded-lg text-label-sm label-font font-bold
                           text-on-surface-variant bg-surface-container border border-outline-variant/30
                           hover:bg-surface-container-high transition-colors">
              Cancelar
            </button>
            <button id="modal-save-btn"
                    class="px-6 py-2.5 rounded-lg text-label-sm label-font font-bold
                           bg-primary text-on-primary glow-neon hover:opacity-90 transition-all
                           flex items-center gap-2">
              <span class="material-symbols-outlined" style="font-size:18px;">save</span>
              ${isEdit ? 'Salvar' : 'Criar Evento'}
            </button>
          </div>
        </div>

      </div>
    </div>`;

  document.body.appendChild(modal);

  /* ── Bind modal buttons ── */
  document.getElementById('modal-close-btn').addEventListener('click', closeEventModal);
  document.getElementById('modal-cancel-btn').addEventListener('click', closeEventModal);
  document.getElementById('modal-save-btn').addEventListener('click', handleSaveEvent);
  document.getElementById('modal-backdrop').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeEventModal();
  });
  if (isEdit) {
    document.getElementById('modal-delete-btn').addEventListener('click', () => {
      if (confirm(`Excluir "${data.title}"?`)) {
        deleteEvent(data.id);
        closeEventModal();
      }
    });
  }

  /* Focus first input */
  document.getElementById('input-title').focus();
}

function closeEventModal() {
  document.getElementById('sakura-modal')?.remove();
  editingId = null;
}

/** Validate + collect form data, then save. */
function handleSaveEvent() {
  const title       = document.getElementById('input-title').value.trim();
  const time        = document.getElementById('input-time').value;
  const duration    = parseInt(document.getElementById('input-duration').value) || 30;
  const category    = document.getElementById('input-category').value;
  const description = document.getElementById('input-description').value.trim();

  /* Validation */
  let valid = true;
  const toggleError = (id, show) => {
    document.getElementById(id)?.classList.toggle('hidden', !show);
    document.getElementById(id.replace('error-', 'input-'))
            ?.classList.toggle('border-error', show);
  };
  if (!title)   { toggleError('error-title', true);  valid = false; } else toggleError('error-title', false);
  if (!time)    { toggleError('error-time', true);   valid = false; } else toggleError('error-time', false);
  if (!valid) return;

  if (editingId) {
    /* Update existing */
    const idx = events.findIndex(e => e.id === editingId);
    if (idx !== -1) {
      events[idx] = { ...events[idx], title, time, duration, category, description };
    }
  } else {
    /* Create new */
    events.push({ id: generateId(), title, time, duration, category, description, done: false });
  }

  /* Sort by time */
  events.sort((a, b) => a.time.localeCompare(b.time));
  saveEvents();
  closeEventModal();

  /* Refresh both pages */
  renderTimelineEvents(activeFilter);
  renderDashboardActions();
  renderFlowState();
  updateStreak();
}

/** Permanently delete an event. */
function deleteEvent(id) {
  events = events.filter(e => e.id !== id);
  saveEvents();
  renderTimelineEvents(activeFilter);
  renderDashboardActions();
  renderFlowState();
}

/** Toggle the done state of an event (from dashboard action items). */
function toggleEventDone(id) {
  const evt = events.find(e => e.id === id);
  if (evt) {
    evt.done = !evt.done;
    saveEvents();
    renderDashboardActions();
    updateStreak();
  }
}


/* ── Rendering — Timeline page ── */

function renderTimelineEvents(filter = 'all') {
  activeFilter = filter;

  const container   = document.getElementById('timeline-events-container');
  const emptyState  = document.getElementById('timeline-empty-state');
  if (!container) return;

  /* Update filter chip active state */
  ['filter-all', 'filter-work', 'filter-personal'].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    const chipFilter = id.replace('filter-', '');
    btn.classList.toggle('active', chipFilter === filter);
  });

  /* Filter events */
  const filtered = filter === 'all'
    ? events
    : events.filter(e => e.category === filter);

  /* Clear previous cards (keep empty state element) */
  [...container.children].forEach(child => {
    if (child.id !== 'timeline-empty-state') child.remove();
  });

  if (filtered.length === 0) {
    emptyState.style.display = 'flex';
    return;
  }
  emptyState.style.display = 'none';

  const nowBRT   = getNowBRT();
  const nowMins  = nowBRT.getHours() * 60 + nowBRT.getMinutes();

  filtered.forEach(evt => {
    const [h, m]   = evt.time.split(':').map(Number);
    const evtMins  = h * 60 + m;
    const isActive = Math.abs(evtMins - nowMins) < (evt.duration || 30);
    const isPast   = evtMins + (evt.duration || 30) < nowMins;

    const card = buildEventCard(evt, isActive, isPast);
    container.insertBefore(card, emptyState);
  });
}

/** Build a single timeline event card element. */
function buildEventCard(evt, isActive = false, isPast = false) {
  const cat  = CATEGORIES[evt.category] || CATEGORIES.other;
  const card = document.createElement('article');

  card.className = [
    'group flex flex-col sm:flex-row items-stretch sm:items-center',
    'bg-surface-container-lowest rounded-xl p-4 sm:p-lg',
    'border transition-all relative',
    isActive
      ? 'border-primary/50 glow-neon event-card-active'
      : 'border-outline-variant/25 glow-subtle hover:border-primary-fixed-dim/30',
  ].join(' ');

  card.innerHTML = `
    <!-- Accent bar -->
    <div class="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-xl
                ${isActive ? 'bg-primary shadow-[0_0_10px_rgba(255,77,109,0.8)]' : 'bg-outline-variant/30'}">
    </div>

    ${isActive ? '<div class="absolute inset-0 bg-primary/5 rounded-xl pointer-events-none"></div>' : ''}

    <!-- Time column -->
    <div class="flex items-center gap-4 sm:w-1/4 mb-4 sm:mb-0 relative pl-2">
      <div class="hidden sm:block absolute -right-6 w-3 h-3 rounded-full z-20
                  ${isActive
                    ? 'bg-primary border-2 border-primary shadow-[0_0_8px_rgba(255,77,109,1)]'
                    : 'bg-background border-2 border-outline-variant/50'}">
      </div>
      <div class="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 border
                  ${isActive
                    ? 'bg-primary/20 text-primary border-primary/50 shadow-[0_0_15px_rgba(255,77,109,0.4)]'
                    : 'bg-surface-container text-on-surface-variant border-outline-variant/30'}">
        <span class="material-symbols-outlined" style="font-variation-settings:'FILL' 1;">
          ${cat.icon}
        </span>
      </div>
      <div>
        <p class="text-headline-md font-headline-md font-bold ${isActive ? 'text-primary glow-neon-text' : isPast ? 'text-on-surface-variant/50' : 'text-on-surface'}">
          ${escapeHtml(evt.time)}
        </p>
        <p class="text-label-sm label-font ${isActive ? 'text-primary/90' : 'text-on-surface-variant'}">
          ${cat.label}
        </p>
      </div>
    </div>

    <!-- Details column -->
    <div class="sm:flex-1 px-sm sm:border-l ${isActive ? 'border-primary/30' : 'border-outline-variant/25'} sm:ml-4 sm:pl-8 relative">
      <h4 class="text-body-lg font-body-lg font-bold ${isPast ? 'text-on-surface-variant/60 line-through' : 'text-on-surface'}">
        ${escapeHtml(evt.title)}
      </h4>
      ${evt.description ? `<p class="text-body-md text-on-surface-variant mt-1">${escapeHtml(evt.description)}</p>` : ''}
      <div class="flex gap-2 mt-3 flex-wrap">
        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-label-sm label-font border
                     ${isActive ? 'bg-primary/20 text-primary border-primary/40' : 'bg-surface-variant text-on-surface border-outline-variant/50'}">
          ${cat.label}
        </span>
        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-label-sm label-font
                     bg-surface-variant text-on-surface border border-outline-variant/50">
          ${evt.duration} min
        </span>
      </div>
    </div>

    <!-- Action buttons -->
    <div class="event-card-actions flex items-center justify-end gap-2 mt-4 sm:mt-0
                opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity relative z-20">
      <button data-edit="${evt.id}"
              class="p-2 rounded-full transition-colors
                     ${isActive ? 'text-primary hover:bg-primary/20' : 'text-on-surface-variant hover:text-primary-fixed-dim hover:bg-surface-container-high'}"
              title="Editar">
        <span class="material-symbols-outlined" style="font-size:20px;">edit</span>
      </button>
      <button data-delete="${evt.id}"
              class="p-2 text-on-surface-variant hover:text-error hover:bg-error-container/20
                     rounded-full transition-colors"
              title="Excluir">
        <span class="material-symbols-outlined" style="font-size:20px;">delete</span>
      </button>
    </div>`;

  /* Wire card buttons */
  card.querySelector('[data-edit]').addEventListener('click', () => {
    openEventModal(evt);
  });
  card.querySelector('[data-delete]').addEventListener('click', () => {
    if (confirm(`Excluir "${evt.title}"?`)) deleteEvent(evt.id);
  });

  return card;
}

/** Bind filter chip buttons. */
function initFilterChips() {
  document.getElementById('filter-all')?.addEventListener('click', () => renderTimelineEvents('all'));
  document.getElementById('filter-work')?.addEventListener('click', () => renderTimelineEvents('work'));
  document.getElementById('filter-personal')?.addEventListener('click', () => renderTimelineEvents('personal'));
}


/* ── Rendering — Dashboard ── */

/** Render the Action Items list on the Dashboard. */
function renderDashboardActions() {
  const container  = document.getElementById('action-items-container');
  const emptyText  = document.getElementById('action-items-empty-text');
  if (!container) return;

  /* Show only today's non-past events as tasks */
  const nowBRT  = getNowBRT();
  const nowMins = nowBRT.getHours() * 60 + nowBRT.getMinutes();

  /* Show all events (done or not) so user can tick them */
  if (events.length === 0) {
    container.innerHTML = `
      <span class="material-symbols-outlined" style="font-size:40px;">checklist</span>
      <p class="text-label-sm label-font text-center">
        No tasks yet — add your first event to get started.
      </p>`;
    container.className = 'flex flex-col items-center justify-center py-xl gap-sm text-on-surface-variant/40';
    return;
  }

  container.className = 'flex flex-col gap-sm';
  container.innerHTML = events.map(evt => {
    const cat = CATEGORIES[evt.category] || CATEGORIES.other;
    return `
      <div class="flex items-center justify-between gap-md p-sm rounded-lg
                  hover:bg-surface-container transition-colors group">
        <div class="flex items-center gap-3 flex-1 min-w-0">
          <button data-toggle="${evt.id}"
                  class="w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-all
                         ${evt.done
                           ? 'bg-primary border-primary'
                           : 'border-outline-variant hover:border-primary'}"
                  aria-label="${evt.done ? 'Marcar como não feito' : 'Marcar como feito'}">
            ${evt.done
              ? '<span class="material-symbols-outlined text-on-primary" style="font-size:14px;">check</span>'
              : ''}
          </button>
          <span class="text-body-md truncate ${evt.done ? 'line-through text-on-surface-variant/50' : 'text-on-surface'}">
            ${escapeHtml(evt.title)}
          </span>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <span class="text-label-sm label-font px-2 py-0.5 rounded-full
                       bg-surface-container text-on-surface-variant border border-outline-variant/30">
            ${escapeHtml(evt.time)}
          </span>
          <span class="text-label-sm label-font px-2 py-0.5 rounded-full border
                       ${evt.category === 'work'      ? 'bg-tertiary/10 text-tertiary border-tertiary/30'
                         : evt.category === 'important' ? 'bg-primary/10 text-primary border-primary/30 font-bold'
                         : evt.category === 'health'    ? 'bg-error/10 text-error border-error/30'
                         : 'bg-surface-container text-on-surface-variant border-outline-variant/30'}">
            ${cat.label}
          </span>
        </div>
      </div>`;
  }).join('');

  /* Wire checkbox toggles */
  container.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.addEventListener('click', () => toggleEventDone(btn.dataset.toggle));
  });
}


/* ═══════════════════════════════════════════════════════════════
   SYSTEM 3 — TIME ENGINE (UTC-3 / BRT)
   - getNowBRT()    returns a Date object in BRT
   - renderFlowState() paints the progress bar + nodes
   - checkAlarms()  fires once per minute, plays MP3 on match
   - Streak logic   persists daily engagement
   ═══════════════════════════════════════════════════════════════ */

/**
 * Return the current moment as a Date adjusted to UTC-3 (BRT).
 * Uses Intl to be DST-safe — no hardcoded offset arithmetic.
 */
function getNowBRT() {
  const nowUTC  = new Date();
  /* Format in BRT, then re-parse so .getHours()/.getMinutes() work locally */
  const brtStr  = nowUTC.toLocaleString('en-US', { timeZone: TIMEZONE });
  return new Date(brtStr);
}

/** Format a Date to HH:MM string. */
function formatTime(date) {
  return date.toLocaleTimeString('pt-BR', {
    hour:   '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TIMEZONE,
  });
}

/** Convert "HH:MM" string → total minutes from midnight. */
function timeToMins(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}


/* ── Flow State bar ── */

/**
 * Repaint the Flow State bar on the Dashboard.
 * - Progress width reflects how far through the day's events we are.
 * - Nodes are re-rendered for all events (past, current, future).
 */
function renderFlowState() {
  const bar       = document.getElementById('flow-progress-bar');
  const container = document.getElementById('flow-nodes-container');
  const timeLbl   = document.getElementById('current-event-time');
  const titleLbl  = document.getElementById('current-event-title');
  if (!bar || !container) return;

  const nowBRT  = getNowBRT();
  const nowMins = nowBRT.getHours() * 60 + nowBRT.getMinutes();

  if (events.length === 0) {
    bar.style.width = '0%';
    timeLbl && (timeLbl.textContent = formatTime(nowBRT));
    titleLbl && (titleLbl.textContent = 'No events');
    container.innerHTML = `
      <div class="relative flex flex-col items-center z-10">
        <div class="w-5 h-5 rounded-full bg-background border-2 border-primary flex items-center justify-center glow-neon">
          <div class="w-2 h-2 rounded-full bg-primary"></div>
        </div>
        <div class="absolute top-7 flex flex-col items-center w-28 text-center">
          <span class="text-label-sm label-font text-primary glow-neon-text">${formatTime(nowBRT)}</span>
          <span class="text-on-surface-variant" style="font-size:13px; margin-top:2px;">No events</span>
        </div>
      </div>`;
    return;
  }

  /* Boundaries: first event start → last event end */
  const firstMins = timeToMins(events[0].time);
  const lastEvent = events[events.length - 1];
  const lastMins  = timeToMins(lastEvent.time) + (lastEvent.duration || 30);
  const span      = Math.max(lastMins - firstMins, 1);

  /* Clamp progress between 0–100% */
  const progress  = Math.min(100, Math.max(0,
    ((nowMins - firstMins) / span) * 100
  ));
  bar.style.width = `${progress}%`;

  /* Find current / next event */
  let currentEvent = null;
  for (const evt of events) {
    const start = timeToMins(evt.time);
    const end   = start + (evt.duration || 30);
    if (nowMins >= start && nowMins < end) { currentEvent = evt; break; }
  }
  const nextEvent = currentEvent
    ? events[events.indexOf(currentEvent) + 1]
    : events.find(e => timeToMins(e.time) > nowMins);

  /* Update current event label */
  if (timeLbl) timeLbl.textContent = formatTime(nowBRT);
  if (titleLbl) titleLbl.textContent = currentEvent ? currentEvent.title : (nextEvent ? `Next: ${nextEvent.title}` : 'Done for today!');

  /* Re-render nodes — max 4 shown for layout */
  const displayed = events.slice(0, 4);
  container.innerHTML = '';

  displayed.forEach((evt, i) => {
    const evtMins  = timeToMins(evt.time);
    const isPast   = evtMins + (evt.duration || 30) <= nowMins;
    const isCurrent = evt === currentEvent;
    const leftPct  = events.length > 1
      ? ((evtMins - firstMins) / span) * 100
      : 0;

    const node = document.createElement('div');
    node.className = 'relative flex flex-col items-center';
    node.style.position = 'absolute';
    node.style.left     = `${Math.min(95, Math.max(2, leftPct))}%`;
    node.style.top      = '50%';
    node.style.transform = 'translate(-50%, -50%)';
    node.style.zIndex   = isCurrent ? '10' : '5';

    const cat = CATEGORIES[evt.category] || CATEGORIES.other;

    node.innerHTML = isCurrent ? `
      <div class="w-5 h-5 rounded-full bg-background border-2 border-primary flex items-center justify-center glow-neon">
        <div class="w-2 h-2 rounded-full bg-primary"></div>
      </div>
      <div class="absolute top-7 flex flex-col items-center w-28 text-center" style="pointer-events:none;">
        <span class="text-label-sm label-font text-primary glow-neon-text">${escapeHtml(evt.time)}</span>
        <span class="text-on-surface font-bold" style="font-size:13px; margin-top:2px; white-space:nowrap; overflow:hidden; max-width:112px; text-overflow:ellipsis;">${escapeHtml(evt.title)}</span>
      </div>` : `
      <div class="w-3 h-3 rounded-full ${isPast ? 'bg-primary shadow-[0_0_5px_#FF4D6D]' : 'bg-outline-variant/30 border border-outline-variant/50'}"></div>
      <div class="absolute top-5 flex flex-col items-center w-20 text-center" style="pointer-events:none;">
        <span class="text-label-sm label-font ${isPast ? 'text-on-surface-variant' : 'text-on-surface-variant/50'}">${escapeHtml(evt.time)}</span>
        <span style="font-size:11px; margin-top:2px; color:${isPast ? 'rgba(168,177,195,0.7)' : 'rgba(168,177,195,0.4)'}; white-space:nowrap; overflow:hidden; max-width:76px; text-overflow:ellipsis;">${escapeHtml(evt.title)}</span>
      </div>`;

    container.appendChild(node);
  });
}


/* ── Alarm system ── */

let alarmAudio = null;

/** Play the alarm MP3. Falls back silently if file is missing. */
function playAlarm(eventTitle) {
  try {
    if (!alarmAudio) {
      alarmAudio = new Audio(ALARM_SRC);
      alarmAudio.volume = 0.75;
    }
    alarmAudio.currentTime = 0;
    alarmAudio.play().catch(() => {
      /* Autoplay blocked — browser requires a user gesture first.
         We show a visible notification as fallback. */
    });
  } catch (err) {
    console.warn('[Sakura] Could not play alarm:', err);
  }
  showAlarmNotification(eventTitle);
}

/** Show an on-screen toast notification when an alarm fires. */
function showAlarmNotification(eventTitle) {
  /* Remove any existing notification */
  document.getElementById('sakura-alarm-toast')?.remove();

  const toast = document.createElement('div');
  toast.id = 'sakura-alarm-toast';
  toast.className = [
    'fixed top-6 right-6 z-[200]',
    'flex items-center gap-3',
    'bg-surface-container-low border border-primary/50',
    'rounded-xl px-lg py-md glow-neon',
    'shadow-[0_8px_32px_rgba(0,0,0,0.6)]',
  ].join(' ');
  toast.setAttribute('role', 'alert');
  toast.innerHTML = `
    <span class="material-symbols-outlined text-primary glow-neon-text"
          style="font-variation-settings:'FILL' 1; font-size:28px;">alarm</span>
    <div class="flex flex-col">
      <span class="text-label-sm label-font text-primary font-bold uppercase tracking-wider glow-neon-text">
        É hora de:
      </span>
      <span class="text-body-md text-on-surface font-bold">${escapeHtml(eventTitle)}</span>
    </div>
    <button id="alarm-dismiss"
            class="ml-4 p-1.5 text-on-surface-variant hover:text-on-surface
                   hover:bg-surface-container rounded-full transition-colors flex-shrink-0"
            aria-label="Fechar notificação">
      <span class="material-symbols-outlined" style="font-size:20px;">close</span>
    </button>`;

  document.body.appendChild(toast);
  document.getElementById('alarm-dismiss').addEventListener('click', () => toast.remove());

  /* Auto-dismiss after 15 seconds */
  setTimeout(() => toast.remove(), 15_000);
}

/**
 * Check every event against the current BRT time.
 * Fires the alarm once per event per day using a log in localStorage.
 */
function checkAlarms() {
  const nowBRT   = getNowBRT();
  const nowMins  = nowBRT.getHours() * 60 + nowBRT.getMinutes();
  const todayKey = nowBRT.toLocaleDateString('pt-BR'); // e.g. "27/05/2026"

  let alarmLog = {};
  try { alarmLog = JSON.parse(localStorage.getItem(ALARM_LOG_KEY)) || {}; } catch { /* ok */ }

  /* Reset log if it's a new day */
  if (!alarmLog[todayKey]) alarmLog = { [todayKey]: {} };

  events.forEach(evt => {
    if (alarmLog[todayKey][evt.id]) return; // already fired today

    const evtMins = timeToMins(evt.time);
    /* Fire when within the current minute */
    if (nowMins === evtMins) {
      alarmLog[todayKey][evt.id] = true;
      localStorage.setItem(ALARM_LOG_KEY, JSON.stringify(alarmLog));
      playAlarm(evt.title);
    }
  });
}


/* ── Streak ── */

/**
 * Increment or maintain the streak counter.
 * Rule: at least one event must be created today to keep the streak alive.
 * Resets to 0 if the user skipped yesterday.
 */
function updateStreak() {
  const valueEl   = document.getElementById('streak-counter-value');
  const barEl     = document.getElementById('streak-progress-bar');
  const messageEl = document.getElementById('streak-message');
  if (!valueEl) return;

  let streak = { count: 0, lastDate: null };
  try { streak = JSON.parse(localStorage.getItem(STREAK_KEY)) || streak; } catch { /* ok */ }

  const nowBRT   = getNowBRT();
  const today    = nowBRT.toLocaleDateString('pt-BR');
  const yesterday = new Date(nowBRT);
  yesterday.setDate(yesterday.getDate() - 1);
  const yDay = yesterday.toLocaleDateString('pt-BR');

  const hasEventsToday = events.length > 0;

  if (!hasEventsToday) {
    /* No events at all — streak stays at whatever it is */
  } else if (streak.lastDate === today) {
    /* Already counted today — no change */
  } else if (streak.lastDate === yDay || streak.lastDate === null) {
    /* Consecutive day or first time */
    streak.count++;
    streak.lastDate = today;
    localStorage.setItem(STREAK_KEY, JSON.stringify(streak));
  } else {
    /* Gap detected — reset */
    streak = { count: 1, lastDate: today };
    localStorage.setItem(STREAK_KEY, JSON.stringify(streak));
  }

  const WEEKLY_GOAL = 7;
  const pct = Math.min(100, (streak.count / WEEKLY_GOAL) * 100);

  valueEl.textContent    = streak.count;
  barEl.style.width      = `${pct}%`;
  messageEl.textContent  = streak.count === 0
    ? 'Start your first day!'
    : streak.count >= WEEKLY_GOAL
      ? '🌸 Weekly goal reached!'
      : `${WEEKLY_GOAL - streak.count} day${WEEKLY_GOAL - streak.count !== 1 ? 's' : ''} to weekly goal!`;
}


/* ─────────────────────────────────────────────────────────────
   ■ UTILITIES
───────────────────────────────────────────────────────────── */

/** Escape HTML to prevent XSS in injected user data. */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


/* ─────────────────────────────────────────────────────────────
   ■ INIT
   All systems start here after the DOM is ready.
───────────────────────────────────────────────────────────── */
function init() {
  /* 1. Navigation */
  initNavigation();
  navigateTo('page-dashboard');   // default page

  /* 2. Event manager — filter chips */
  initFilterChips();

  /* 3. Time engine — initial paint */
  renderFlowState();
  renderDashboardActions();
  updateStreak();

  /* Clock: update flow bar + check alarms every 30 seconds */
  setInterval(() => {
    renderFlowState();
    checkAlarms();
  }, 30_000);

  /* Alarm check: also run once immediately so it catches
     events set right at page load */
  checkAlarms();
}

document.addEventListener('DOMContentLoaded', init);