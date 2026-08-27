/**
 * Панели действий человека: торговля, прикуп/снос, окончательный заказ, вист.
 *
 * Ни одна панель не решает, что легально: кнопки строятся по спискам движка
 * (`bidding.legalBids`, `legalContracts`), поэтому недопустимое действие
 * невозможно даже отправить.
 */
import type { CardId } from '../core/index.js';
import type { Command, DealState } from '../engine/index.js';
import { contractLabel } from '../game/party.js';
import { HUMAN, type Session } from '../game/session.js';
import { cardEl, el } from './render.js';

export interface ActionHandlers {
  readonly send: (command: Command) => void;
  readonly clearSelection: () => void;
  readonly nextDeal: () => void;
}

const button = (label: string, onClick: () => void, primary = false): HTMLElement => {
  const b = el('button', { type: 'button', class: primary ? 'primary' : '' }, label);
  b.addEventListener('click', onClick);
  return b;
};

/** Панель действий для текущей фазы; `null`, когда ход не за человеком. */
export function renderActions(
  session: Session,
  selected: readonly CardId[],
  handlers: ActionHandlers,
): HTMLElement {
  const panel = el('section', { class: 'panel' }, el('h2', {}, 'Ваш ход'));
  const deal = session.deal;

  if (deal === null) {
    panel.append(el('p', { class: 'hint' }, 'Партия завершена. Начните новую пулю.'));
    return panel;
  }

  if (deal.phase === 'RESULT') {
    panel.append(
      el('p', { class: 'hint' }, describeOutcome(deal, session.party.names)),
      el('div', { class: 'actions' }, button('Записать и сдать дальше', handlers.nextDeal, true)),
    );
    return withNotice(panel, session);
  }

  if (deal.toAct !== HUMAN) {
    panel.append(el('p', { class: 'hint' }, 'Ходят соперники…'));
    return withNotice(panel, session);
  }

  switch (deal.phase) {
    case 'BIDDING': {
      const legal = deal.bidding?.legalBids ?? [];
      panel.append(el('p', { class: 'hint' }, 'Заявка по шкале либо пас. Подсвечены только допустимые заявки.'));
      const bids = el('div', { class: 'bids' });
      for (const contract of legal) {
        bids.append(button(contractLabel(contract), () => handlers.send({ type: 'BID', player: HUMAN, contract })));
      }
      panel.append(bids, el('div', { class: 'actions' },
        button('Пас', () => handlers.send({ type: 'PASS', player: HUMAN }), true)));
      break;
    }

    case 'WIDOW_PICKUP':
      panel.append(
        el('p', { class: 'hint' }, 'Вы выиграли торговлю — возьмите прикуп.'),
        el('div', { class: 'actions' },
          button('Взять прикуп', () => handlers.send({ type: 'TAKE_WIDOW', player: HUMAN }), true)),
      );
      break;

    case 'DISCARD': {
      const widow = el('div', { class: 'hand' }, ...deal.widow.map((c) => cardEl(c)));
      const discard = button(
        'Снести',
        () => handlers.send({ type: 'DISCARD', player: HUMAN, cards: [...selected] }),
        true,
      ) as HTMLButtonElement;
      // §4.2: снос — ровно две карты, иначе кнопка недоступна.
      discard.disabled = selected.length !== 2;
      panel.append(
        el('p', { class: 'hint' }, 'Прикуп в руке. Выберите ровно две карты на снос.'),
        widow,
        el('p', { class: 'hint' }, `Выбрано: ${selected.length} из 2`),
        el('div', { class: 'actions' }, discard, button('Сбросить выбор', handlers.clearSelection)),
      );
      break;
    }

    case 'FINAL_CONTRACT': {
      panel.append(el('p', { class: 'hint' }, 'Объявите окончательный заказ — не ниже вашей заявки.'));
      const bids = el('div', { class: 'bids' });
      for (const contract of deal.legalContracts) {
        bids.append(button(contractLabel(contract),
          () => handlers.send({ type: 'DECLARE_CONTRACT', player: HUMAN, contract })));
      }
      panel.append(bids);
      break;
    }

    case 'WHIST_DECLARATION': {
      const contract = deal.contract === null ? '' : contractLabel(deal.contract);
      // Режим «всветлую» доступен, только если второй соперник уже спасовал (§5.2).
      const other = ([0, 1, 2] as const).find((p) => p !== HUMAN && p !== deal.declarer);
      const alone = other !== undefined && deal.whisted[other] === false;
      panel.append(
        el('p', { class: 'hint' }, `Соперник играет ${contract}. Вистовать или пас?`),
        el('div', { class: 'actions' },
          button('Вист (втёмную)', () => handlers.send({ type: 'WHIST', player: HUMAN }), true),
          alone && button('Вист всветлую', () => handlers.send({ type: 'WHIST', player: HUMAN, mode: 'light' })),
          button('Пас', () => handlers.send({ type: 'PASS_WHIST', player: HUMAN }))),
      );
      break;
    }

    case 'PLAY':
      panel.append(el('p', { class: 'hint' }, 'Выберите карту из руки — допустимые подсвечены.'));
      break;

    default:
      panel.append(el('p', { class: 'hint' }, 'Ожидание…'));
  }

  return withNotice(panel, session);
}

function withNotice(panel: HTMLElement, session: Session): HTMLElement {
  if (session.notice !== null) panel.append(el('div', { class: 'notice' }, session.notice));
  return panel;
}

/** Человекочитаемый итог раздачи для экрана результата. */
export function describeOutcome(deal: DealState, names: readonly string[]): string {
  const outcome = deal.outcome;
  if (outcome === null) return 'Раздача завершена.';
  const who = (p: number): string => names[p] ?? `Игрок ${p}`;

  if (outcome.kind === 'raspasy') {
    const counts = ([0, 1, 2] as const).map((p) => `${who(p)}: ${outcome.tricks[p] ?? 0}`).join(', ');
    return `Распасы №${outcome.consecutiveIndex + 1}. Взятки — ${counts}.`;
  }
  if (outcome.kind === 'miser') {
    return outcome.declarerTricks === 0
      ? `${who(outcome.declarer)} сыграл мизер чисто.`
      : `${who(outcome.declarer)} поймал ${outcome.declarerTricks} взяток на мизере.`;
  }
  const taken = outcome.tricks[outcome.declarer] ?? 0;
  const need = Number.parseInt(outcome.contract, 10);
  const verdict = taken >= need ? 'контракт сыгран' : `недобор ${need - taken}`;
  const counts = ([0, 1, 2] as const).map((p) => `${who(p)}: ${outcome.tricks[p] ?? 0}`).join(', ');
  return `${contractLabel(outcome.contract)} — ${who(outcome.declarer)}, ${verdict}. Взятки — ${counts}.`;
}
