/**
 * Точка входа UI: один изменяемый указатель на сессию + перерисовка.
 *
 * Игровых правил здесь нет. Всё, что делает приложение, — отправляет команды
 * движку через `session`, крутит ходы ботов по таймеру и рисует состояние.
 */
import type { CardId } from './core/index.js';
import type { Command } from './engine/index.js';
import {
  applyCommand,
  botStep,
  finishDeal,
  HUMAN,
  newSession,
  persist,
  restoreSession,
  waitingForHuman,
  type Session,
} from './game/session.js';
import { clearParty } from './game/party.js';
import { parseBotLevel, type BotLevel } from './game/bot.js';
import { renderActions } from './ui/actions.js';
import { el, renderHand, renderLog, renderSheet, renderTable } from './ui/render.js';

/** Пауза между ходами ботов, мс — чтобы за игрой можно было следить. */
const BOT_DELAY = 550;

/** Выбранная в шапке величина пули (§9.8). */
function selectedPoolTarget(): number {
  const select = document.getElementById('pool-target') as HTMLSelectElement | null;
  const value = Number.parseInt(select?.value ?? '10', 10);
  return Number.isFinite(value) && value > 0 ? value : 10;
}

/** Выбранный в шапке уровень соперников. Правил не меняет — только силу игры. */
function selectedBotLevel(): BotLevel {
  const select = document.getElementById('bot-level') as HTMLSelectElement | null;
  return parseBotLevel(select?.value);
}

let session: Session =
  restoreSession(localStorage) ??
  newSession({ poolTarget: selectedPoolTarget(), botLevel: selectedBotLevel() });
let selected: CardId[] = [];
let timer: number | undefined;

const root = document.getElementById('app');
if (root === null) throw new Error('нет контейнера #app');

function send(command: Command): void {
  session = applyCommand(session, command);
  selected = [];
  render();
  scheduleBots();
}

/** Клик по карте: в фазе сноса — выбор, в розыгрыше — ход. */
function onCard(id: CardId): void {
  const deal = session.deal;
  if (deal === null) return;
  if (deal.phase === 'DISCARD') {
    selected = selected.includes(id) ? selected.filter((c) => c !== id) : [...selected, id].slice(-2);
    render();
    return;
  }
  if (deal.phase === 'PLAY') send({ type: 'PLAY_CARD', player: HUMAN, card: id });
}

function nextDeal(): void {
  session = finishDeal(session);
  persist(session, localStorage);
  selected = [];
  render();
  scheduleBots();
}

/** Крутить ходы ботов, пока очередь не вернётся к человеку. */
function scheduleBots(): void {
  window.clearTimeout(timer);
  const deal = session.deal;
  if (deal === null || deal.phase === 'RESULT' || waitingForHuman(session)) return;
  timer = window.setTimeout(() => {
    const next = botStep(session);
    if (next === session) return; // ходить некому — не зацикливаемся
    session = next;
    render();
    scheduleBots();
  }, BOT_DELAY);
}

function newParty(): void {
  clearParty(localStorage);
  session = newSession({ poolTarget: selectedPoolTarget(), botLevel: selectedBotLevel() });
  selected = [];
  render();
  scheduleBots();
}

function showRules(): void {
  const dialog = document.getElementById('rules') as HTMLDialogElement | null;
  if (dialog === null) return;
  const body = dialog.querySelector('.rules-body');
  if (body !== null && body.textContent === '') {
    body.textContent = 'Загрузка…';
    void fetch('docs/rules.md')
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((text) => { body.textContent = text; })
      .catch(() => { body.textContent = 'Не удалось загрузить docs/rules.md. Файл лежит в корне проекта.'; });
  }
  dialog.showModal();
}

function render(): void {
  root!.replaceChildren(
    el('main', {},
      el('div', { class: 'stack' },
        renderTable(session),
        renderHand(session, selected, onCard),
        renderActions(session, selected, { send, clearSelection: () => { selected = []; render(); }, nextDeal })),
      el('div', { class: 'stack' }, renderSheet(session.sheet), renderLog(session))),
  );
}

document.getElementById('new-party')?.addEventListener('click', () => {
  if (session.party.deals.length === 0 || window.confirm('Начать новую пулю? Текущая запись будет потеряна.')) {
    newParty();
  }
});
document.getElementById('rules-btn')?.addEventListener('click', showRules);
document.getElementById('rules-close')?.addEventListener('click', () => {
  (document.getElementById('rules') as HTMLDialogElement | null)?.close();
});

render();
scheduleBots();
