/**
 * Панель ввода результата раздачи: контракт, взятки, вист/пас, распасы, мизер.
 *
 * Никакой игровой логики — только UI-форма для ручного ввода итога.
 */
import type { DealOutcome, TrickContractId, DefenseMode } from '../scoring/index.js';
import { contractLabel, PLAYER_IDS } from '../game/party.js';
import type { Session } from '../game/session.js';
import { el } from './render.js';

/** Все контракты на взятки в порядке шкалы. */
const TRICK_CONTRACTS: readonly TrickContractId[] = [
  '6S', '6C', '6D', '6H', '6NT',
  '7S', '7C', '7D', '7H', '7NT',
  '8S', '8C', '8D', '8H', '8NT',
  '9S', '9C', '9D', '9H', '9NT',
  '10S', '10C', '10D', '10H', '10NT',
];

export interface DealEntryHandlers {
  readonly onSubmit: (outcome: DealOutcome) => void;
}

const button = (label: string, onClick: () => void, primary = false): HTMLElement => {
  const b = el('button', { type: 'button', class: primary ? 'primary' : '' }, label);
  b.addEventListener('click', onClick);
  return b;
};

const selectEl = (id: string, options: [string, string][], selected?: string): HTMLSelectElement => {
  const s = document.createElement('select');
  s.id = id;
  for (const [val, text] of options) {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = text;
    if (val === selected) opt.selected = true;
    s.append(opt);
  }
  return s;
};

const numberInput = (id: string, min: number, max: number, value: number): HTMLInputElement => {
  const inp = document.createElement('input');
  inp.type = 'number';
  inp.id = id;
  inp.min = String(min);
  inp.max = String(max);
  inp.value = String(value);
  inp.style.width = '60px';
  return inp;
};

/** Панель ввода результата раздачи. */
export function renderDealEntry(
  session: Session,
  handlers: DealEntryHandlers,
): HTMLElement {
  const names = session.party.names;
  const panel = el('section', { class: 'panel' }, el('h2', {}, 'Записать раздачу'));

  if (session.closed) {
    panel.append(el('p', { class: 'hint' }, 'Пуля закрыта. Начните новую партию.'));
    return panel;
  }

  const seatOptions: [string, string][] = names.map((n: string, i: number) => [String(i), n]);

  // --- Выбор типа раздачи ---
  const typeSelect = selectEl('deal-type', [
    ['contract', 'Игра на взятки'],
    ['raspasy', 'Распасы'],
    ['miser', 'Мизер'],
  ]);

  const formArea = el('div', { class: 'deal-form' });

  const buildContractForm = (): void => {
    formArea.replaceChildren();
    formArea.append(
      el('div', { class: 'form-row' },
        el('label', {}, 'Играющий: '), selectEl('declarer', seatOptions)),
      el('div', { class: 'form-row' },
        el('label', {}, 'Контракт: '),
        selectEl('contract', TRICK_CONTRACTS.map((c) => [c, contractLabel(c)]))),
      el('div', { class: 'form-row' },
        el('label', {}, `Взятки ${names[0]}: `), numberInput('tricks-0', 0, 10, 0)),
      el('div', { class: 'form-row' },
        el('label', {}, `Взятки ${names[1]}: `), numberInput('tricks-1', 0, 10, 0)),
      el('div', { class: 'form-row' },
        el('label', {}, `Взятки ${names[2]}: `), numberInput('tricks-2', 0, 10, 0)),
      el('div', { class: 'form-row' },
        el('label', {}, 'Вист 1-го соперника: '),
        selectEl('whist-mode', [['dark', 'Втёмную'], ['light', 'Всветлую']])),
    );
    // Вистование: checkbox для каждого не-играющего
    for (const s of [0, 1, 2] as const) {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = `whist-${s}`;
      cb.checked = true;
      formArea.append(
        el('div', { class: 'form-row' },
          cb, el('label', {}, ` ${names[s]} вистует`)),
      );
    }
    formArea.append(
      el('div', { class: 'actions' },
        button('Записать', () => submitContract(), true)),
    );
  };

  const buildRaspasyForm = (): void => {
    formArea.replaceChildren();
    formArea.append(
      el('div', { class: 'form-row' },
        el('label', {}, `Взятки ${names[0]}: `), numberInput('rasp-0', 0, 10, 0)),
      el('div', { class: 'form-row' },
        el('label', {}, `Взятки ${names[1]}: `), numberInput('rasp-1', 0, 10, 0)),
      el('div', { class: 'form-row' },
        el('label', {}, `Взятки ${names[2]}: `), numberInput('rasp-2', 0, 10, 0)),
      el('div', { class: 'actions' },
        button('Записать', () => submitRaspasy(), true)),
    );
  };

  const buildMiserForm = (): void => {
    formArea.replaceChildren();
    formArea.append(
      el('div', { class: 'form-row' },
        el('label', {}, 'Мизерист: '), selectEl('miser-declarer', seatOptions)),
      el('div', { class: 'form-row' },
        el('label', {}, 'Взятки мизериста: '), numberInput('miser-tricks', 0, 10, 0)),
      el('div', { class: 'actions' },
        button('Записать', () => submitMiser(), true)),
    );
  };

  const rebuildForm = (): void => {
    const t = typeSelect.value;
    if (t === 'contract') buildContractForm();
    else if (t === 'raspasy') buildRaspasyForm();
    else buildMiserForm();
  };

  typeSelect.addEventListener('change', rebuildForm);

  panel.append(
    el('div', { class: 'form-row' },
      el('label', {}, 'Тип раздачи: '), typeSelect),
    formArea,
  );

  rebuildForm();
  return panel;

  // --- Submit helpers ---

  function val(id: string): number {
    return Number((document.getElementById(id) as HTMLInputElement | null)?.value ?? 0);
  }
  function sel(id: string): string {
    return (document.getElementById(id) as HTMLSelectElement | null)?.value ?? '';
  }
  function checked(id: string): boolean {
    return (document.getElementById(id) as HTMLInputElement | null)?.checked ?? false;
  }

  function submitContract(): void {
    const declarer = sel('declarer');
    const contract = sel('contract') as TrickContractId;
    const tricks: Record<string, number> = {};
    const whisted: Record<string, boolean> = {};
    for (const p of PLAYER_IDS) {
      tricks[p] = val(`tricks-${p}`);
      whisted[p] = p === declarer ? false : checked(`whist-${p}`);
    }
    const total = PLAYER_IDS.reduce((s: number, p: string) => s + tricks[p]!, 0);
    if (total !== 10) {
      alert(`Сумма взяток должна быть 10 (сейчас ${total})`);
      return;
    }
    const mode: DefenseMode = sel('whist-mode') as DefenseMode;
    handlers.onSubmit({
      kind: 'contract',
      contract,
      declarer,
      tricks,
      whisted,
      mode,
    });
  }

  function submitRaspasy(): void {
    const tricks: Record<string, number> = {};
    for (const p of PLAYER_IDS) tricks[p] = val(`rasp-${p}`);
    const total = PLAYER_IDS.reduce((s: number, p: string) => s + tricks[p]!, 0);
    if (total !== 10) {
      alert(`Сумма взяток должна быть 10 (сейчас ${total})`);
      return;
    }
    handlers.onSubmit({
      kind: 'raspasy',
      tricks,
      consecutiveIndex: session.party.consecutiveRaspasy,
    });
  }

  function submitMiser(): void {
    const declarer = sel('miser-declarer');
    const declarerTricks = val('miser-tricks');
    handlers.onSubmit({ kind: 'miser', declarer, declarerTricks });
  }
}
