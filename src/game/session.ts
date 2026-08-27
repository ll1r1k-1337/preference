/**
 * Сессия игры: состояние партии + текущая раздача + журнал ходов.
 *
 * Игровой логики здесь нет — только вызовы API движка (`step`) и слоя
 * партии (`recordDeal`). Легальность действий целиком на движке: UI рисует
 * `legalBids` / `legalContracts` / `legalMoves`, а любой отказ приходит
 * готовым сообщением в `dispatch`.
 */
import type { Command, DealState, EngineEvent } from '../engine/index.js';
import { decide, resetBots } from './bot.js';
import { settle, step } from './flow.js';
import {
  buildSheet,
  createParty,
  isPartyClosed,
  loadParty,
  recordDeal,
  saveParty,
  startDeal,
  type CreatePartyInput,
  type PartyState,
  type Sheet,
} from './party.js';
import type { PlayerId } from '../core/index.js';

/** Место человека за столом. */
export const HUMAN: PlayerId = 0;

export interface LogEntry {
  readonly deal: number;
  readonly text: string;
}

export interface Session {
  readonly party: PartyState;
  readonly deal: DealState | null;
  readonly log: readonly LogEntry[];
  /** Текст последнего отказа движка; показывается подсказкой. */
  readonly notice: string | null;
  readonly sheet: Sheet;
  readonly closed: boolean;
}

// ------------------------------------------------------------------ журнал

const CONTRACT_TEXT: Readonly<Record<string, string>> = Object.freeze({
  S: '♠', C: '♣', D: '♦', H: '♥', NT: 'БК',
});

const cardText = (id: string): string => {
  const rank = id.slice(0, id.length - 1);
  return `${rank}${CONTRACT_TEXT[id.slice(-1)] ?? id.slice(-1)}`;
};

const contractText = (id: string): string => {
  if (id === 'MIZER') return 'мизер';
  const suit = id.endsWith('NT') ? 'NT' : id.slice(-1);
  return `${id.slice(0, id.length - suit.length)}${CONTRACT_TEXT[suit] ?? suit}`;
};

/** Событие движка -> строка истории ходов на русском. */
export function eventText(event: EngineEvent, names: readonly string[]): string | null {
  const who = (p: PlayerId): string => names[p] ?? `Игрок ${p}`;
  switch (event.type) {
    case 'BID_MADE':
      return `${who(event.player)}: заявка ${contractText(event.contract)}`;
    case 'HERE_DECLARED':
      return `${who(event.player)}: здесь (${contractText(event.contract)})`;
    case 'PASSED':
      return `${who(event.player)}: пас`;
    case 'BIDDING_WON':
      return `${who(event.player)} выиграл торговлю: ${contractText(event.contract)}`;
    case 'PASSOUT_DECLARED':
      return 'Три паса — распасы';
    case 'WIDOW_TAKEN':
      return `${who(event.player)} взял прикуп`;
    case 'DISCARDED':
      return `${who(event.player)} снёс 2 карты`;
    case 'CONTRACT_DECLARED':
      return `${who(event.player)} заказал ${contractText(event.contract)}`;
    case 'WHIST_DECLARED':
      return `${who(event.player)}: вист${event.mode === 'light' ? ' всветлую' : ''}`;
    case 'WHIST_PASSED':
      return `${who(event.player)}: пас на висте`;
    case 'PLAYED_ON_OWN':
      return 'Оба спасовали — игра «на своих»';
    case 'HANDS_REVEALED':
      return `Карты раскрыты: ${event.players.map(who).join(', ')}`;
    case 'CARD_PLAYED':
      return `${who(event.player)} ходит ${cardText(event.card)}`;
    case 'TRICK_TAKEN':
      return `Взятка ${event.number}: забрал ${who(event.winner)}`;
    case 'DEAL_FINISHED':
      return 'Раздача окончена';
    default:
      return null;
  }
}

// ------------------------------------------------------------------ сессия

function withSheet(party: PartyState, deal: DealState | null, log: readonly LogEntry[], notice: string | null): Session {
  return { party, deal, log, notice, sheet: buildSheet(party), closed: isPartyClosed(party) };
}

/** Новая партия с первой сданной раздачей. */
export function newSession(input: CreatePartyInput = {}): Session {
  // Новая партия — новая случайность ботов, иначе ГПСЧ тянется из прошлой.
  resetBots();
  const party = createParty(input);
  return withSheet(party, settle(startDeal(party)).state, [], null);
}

/** Восстановить партию из localStorage; `null`, если сохранения нет. */
export function restoreSession(storage: Storage): Session | null {
  const party = loadParty(storage);
  if (party === null) return null;
  // Текущая раздача не сохраняется: партия продолжается со следующей сдачи.
  return withSheet(party, isPartyClosed(party) ? null : settle(startDeal(party)).state, [], null);
}

export function persist(session: Session, storage: Storage): void {
  saveParty(session.party, storage);
}

/** Применить команду человека. Отказ движка попадает в `notice` как есть. */
export function applyCommand(session: Session, command: Command): Session {
  if (session.deal === null) return session;
  const result = step(session.deal, command);
  if (!result.ok) {
    return { ...session, notice: result.error.message };
  }
  return appendLog(session, result.state, result.events);
}

/**
 * Один ход бота, если очередь за ботом. Возвращает ту же сессию, когда
 * ходить некому — вызывающая сторона по этому признаку останавливает цикл.
 */
export function botStep(session: Session): Session {
  const deal = session.deal;
  if (deal === null || deal.phase === 'RESULT') return session;
  const seat = deal.toAct;
  if (seat === null || seat === HUMAN) return session;
  const command = decide(deal, seat, {
    level: session.party.botLevel,
    seed: session.party.seed,
  });
  if (command === null) return session;
  const result = step(deal, command);
  if (!result.ok) return { ...session, notice: result.error.message };
  return appendLog(session, result.state, result.events);
}

/** Ждём ли мы сейчас решения человека? */
export const waitingForHuman = (session: Session): boolean =>
  session.deal !== null && session.deal.phase !== 'RESULT' && session.deal.toAct === HUMAN;

/** Журнал строится только из событий движка — заново ничего не вычисляется. */
function appendLog(session: Session, after: DealState, events: readonly EngineEvent[]): Session {
  const index = session.party.deals.length + 1;
  const lines = events
    .map((e) => eventText(e, session.party.names))
    .filter((t): t is string => t !== null)
    .map((text) => ({ deal: index, text }));
  return withSheet(session.party, after, [...session.log, ...lines], null);
}

/** Записать законченную раздачу в лист и сдать следующую. */
export function finishDeal(session: Session): Session {
  const deal = session.deal;
  if (deal === null || deal.outcome === null) return session;
  const party = recordDeal(session.party, deal.outcome);
  const next = isPartyClosed(party) ? null : settle(startDeal(party)).state;
  return withSheet(party, next, session.log, null);
}
