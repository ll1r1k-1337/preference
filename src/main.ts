/**
 * Точка входа: журнал партии в преферанс (пулька).
 *
 * Два экрана:
 *   1. Список партий — создать / открыть / удалить.
 *   2. Журнал партии — лист записи и ввод раздач.
 */
import type { DealOutcome } from './scoring/index.js';
import { type PartyState, clearParty } from './game/party.js';
import {
  addDeal,
  fromParty,
  newSession,
  type Session,
} from './game/session.js';
import { renderDealEntry } from './ui/actions.js';
import { el, renderSheet, renderStatus } from './ui/render.js';

// ─── мульти-партийное хранилище ───────────────────────────────
// Массив партий хранится в localStorage как JSON-массив raw PartyState.
// Каждая партия имеет свой индекс. «preference.party.v1» — legacy-формат
// одиночной партии, который мигрируется при первом запуске.

const STORAGE_KEY = 'preference.parties.v2';

interface StoredParties {
  parties: PartyState[];
}

function loadAll(): StoredParties {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw !== null) {
    try {
      const parsed = JSON.parse(raw) as StoredParties;
      if (Array.isArray(parsed.parties)) return parsed;
    } catch { /* corrupt, fall through */ }
  }
  // миграция из v1 (одиночная партия)
  const v1 = localStorage.getItem('preference.party.v1');
  if (v1 !== null) {
    try {
      const party = JSON.parse(v1) as PartyState;
      if (Array.isArray(party.names) && party.board !== undefined) {
        const store: StoredParties = { parties: [party] };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
        localStorage.removeItem('preference.party.v1');
        return store;
      }
    } catch { /* corrupt */ }
  }
  return { parties: [] };
}

function saveAll(store: StoredParties): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

// ─── состояние приложения ────────────────────────────────────

let store = loadAll();
let activeIndex: number | null = null; // null = экран списка
let session: Session | null = null;

const root = document.getElementById('app');
if (root === null) throw new Error('нет контейнера #app');

const backBtn = document.getElementById('back-btn') as HTMLButtonElement;

// ─── экран списка партий ─────────────────────────────────────

function renderList(): void {
  backBtn.hidden = true;
  root!.replaceChildren();

  const section = el('section', { class: 'panel' },
    el('h2', {}, 'Журнал партий'));

  if (store.parties.length === 0) {
    section.append(el('div', { class: 'empty-state' },
      el('div', { class: 'empty-icon' }, '♠'),
      el('p', {}, 'Партий пока нет. Создайте первую!')));
  } else {
    const list = el('ul', { class: 'party-list' });
    for (let i = store.parties.length - 1; i >= 0; i--) {
      const p = store.parties[i]!;
      const names = p.names.join(', ');
      const deals = p.deals.length;
      const poolTarget = p.poolTarget;
      const li = el('li', { class: 'party-item' });

      const openBtn = el('button', { type: 'button', class: 'party-open' },
        el('span', { class: 'party-names' }, names),
        el('span', { class: 'party-meta' }, `${deals} раздач · пуля до ${poolTarget}`));
      const idx = i;
      openBtn.addEventListener('click', () => openParty(idx));

      const delBtn = el('button', { type: 'button', class: 'danger-icon', title: 'Удалить' }, '✕');
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.confirm(`Удалить партию «${names}»?`)) {
          store.parties.splice(idx, 1);
          saveAll(store);
          renderList();
        }
      });

      li.append(openBtn, delBtn);
      list.append(li);
    }
    section.append(list);
  }

  const addBtn = el('button', { type: 'button', class: 'primary' }, '♠ Новая пуля');
  addBtn.addEventListener('click', showNewPartyDialog);
  section.append(el('div', { class: 'actions' }, addBtn));

  root!.append(el('main', { class: 'list-layout' }, section));
}

// ─── диалог новой партии ─────────────────────────────────────

function showNewPartyDialog(): void {
  const dlg = document.getElementById('new-party-dlg') as HTMLDialogElement;
  // сбросить поля
  for (const id of ['name-0', 'name-1', 'name-2']) {
    (document.getElementById(id) as HTMLInputElement).value = '';
  }
  (document.getElementById('new-pool-target') as HTMLSelectElement).value = '10';
  dlg.showModal();
}

function createFromDialog(): void {
  const names = ['name-0', 'name-1', 'name-2'].map((id) => {
    const inp = document.getElementById(id) as HTMLInputElement;
    return inp.value.trim() || inp.placeholder;
  });
  const poolTarget = Number((document.getElementById('new-pool-target') as HTMLSelectElement).value) || 10;

  session = newSession({ names, poolTarget });
  store.parties.push(session.party);
  activeIndex = store.parties.length - 1;
  saveAll(store);

  (document.getElementById('new-party-dlg') as HTMLDialogElement).close();
  renderJournal();
}

// ─── экран журнала партии ────────────────────────────────────

function openParty(index: number): void {
  activeIndex = index;
  session = fromParty(store.parties[index]!);
  renderJournal();
}

function onDeal(outcome: DealOutcome): void {
  if (session === null || activeIndex === null) return;
  session = addDeal(session, outcome);
  store.parties[activeIndex] = session.party;
  saveAll(store);
  renderJournal();
}

function renderJournal(): void {
  if (session === null) return;
  backBtn.hidden = false;

  root!.replaceChildren(
    el('main', {},
      el('div', { class: 'stack' },
        renderStatus(session),
        renderDealEntry(session, { onSubmit: onDeal })),
      el('div', { class: 'stack' }, renderSheet(session.sheet))),
  );
}

// ─── навигация ───────────────────────────────────────────────

function goBack(): void {
  activeIndex = null;
  session = null;
  clearParty(localStorage); // убрать legacy-ключ если есть
  store = loadAll(); // перечитать (на случай параллельных вкладок)
  renderList();
}

backBtn.addEventListener('click', goBack);

document.getElementById('dlg-start')?.addEventListener('click', createFromDialog);
document.getElementById('dlg-cancel')?.addEventListener('click', () => {
  (document.getElementById('new-party-dlg') as HTMLDialogElement).close();
});

// правила
function showRules(): void {
  const dialog = document.getElementById('rules') as HTMLDialogElement | null;
  if (dialog === null) return;
  const body = dialog.querySelector('.rules-body');
  if (body !== null && body.textContent === '') {
    body.textContent = 'Загрузка…';
    void fetch('docs/rules.md')
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((text) => { body.textContent = text; })
      .catch(() => { body.textContent = 'Не удалось загрузить docs/rules.md.'; });
  }
  dialog.showModal();
}
document.getElementById('rules-btn')?.addEventListener('click', showRules);
document.getElementById('rules-close')?.addEventListener('click', () => {
  (document.getElementById('rules') as HTMLDialogElement | null)?.close();
});

// ─── запуск ──────────────────────────────────────────────────

renderList();
