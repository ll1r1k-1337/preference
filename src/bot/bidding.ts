/**
 * Стратегия торговли бота: заявка либо пас, окончательный заказ.
 * Источник истины: docs/rules.md §3.3, §3.7, §4.3.
 *
 * Бот НИКОГДА не изобретает контракты: он выбирает строго из множеств,
 * посчитанных движком (`legalBids`, `legalContracts`).
 */
import type { Card, ContractId } from '../core/index.js';
import { contractLevel, isMizer, parseContract } from '../core/index.js';
import { evaluateHand, miserRisk } from './evaluate.js';

/** Порог риска, при котором рука считается мизерной (§7): не больше одной вынужденной взятки. */
export const MISER_RISK_THRESHOLD = 1;

export interface BidInput {
  readonly hand: readonly Card[];
  /** Допустимые заявки — считает движок по §3.3 и §3.7. */
  readonly legalBids: readonly string[];
}

export interface FinalContractInput {
  readonly hand: readonly Card[];
  /** Допустимые окончательные заказы — считает движок по §4.3. */
  readonly legalContracts: readonly string[];
}

/**
 * Прибавка к оценке за прикуп (§4.1–4.2).
 *
 * Выигравший торговлю берёт две карты и сносит две — это и усиливает руку
 * напрямую, и позволяет сделать ренонс. Эмпирически прикуп стоит около
 * взятки; без этой поправки бот систематически недозаявляет и партия
 * вырождается в бесконечные распасы (замерено: 77% раздач — распасы).
 * На мизере поправка не применяется: там прикуп учитывается через `miserRisk`
 * уже после сноса.
 */
export const WIDOW_BONUS = 1;

/**
 * Сколько взяток рука обещает при данном контракте.
 * Для мизера смысл обратный: чем меньше риск, тем лучше.
 */
function expectedTricks(hand: readonly Card[], id: string, withWidow: boolean): number {
  const contract = parseContract(id);
  if (isMizer(contract)) return 10 - miserRisk(hand);
  const suit = contract.kind === 'tricks' ? contract.suit : 'NT';
  const base = evaluateHand(hand, suit).expected;
  return withWidow ? base + WIDOW_BONUS : base;
}

/** Уровень контракта; мизер по стоимости приравнен к десятерной (§7.7). */
function levelOf(id: string): number {
  const contract = parseContract(id);
  return contractLevel(contract) ?? 10;
}

/**
 * Заявка или пас (§3.3).
 *
 * Заявляем только тот контракт, чей уровень рука реально обещает: ожидаемых
 * взяток должно быть не меньше уровня. Мизер — отдельная ветка: он идёт
 * только при по-настоящему мизерной руке (§3.7 — заявка кабальная).
 * Из подходящих заявок берём самую дорогую: заявка ниже возможностей
 * отдаёт контракт сопернику даром.
 */
export function chooseBid(input: BidInput): ContractId | null {
  let best: ContractId | null = null;
  let bestLevel = -Infinity;

  for (const id of input.legalBids) {
    const contract = parseContract(id);

    if (isMizer(contract)) {
      // §3.7: мизер кабальный — рискуем только с настоящей мизерной рукой.
      if (miserRisk(input.hand) <= MISER_RISK_THRESHOLD) return 'MIZER';
      continue;
    }

    const level = levelOf(id);
    // Заявка делается ДО прикупа: он ещё впереди и входит в оценку (§4.1).
    if (expectedTricks(input.hand, id, true) < level) continue;
    if (level > bestLevel) {
      best = id as ContractId;
      bestLevel = level;
    }
  }

  return best;
}

/**
 * Окончательный заказ (§4.3).
 *
 * Заказ выше выигравшей заявки разрешён, но каждый лишний уровень — это
 * лишние взятки под ремиз (§9.5). Поэтому берём самый дешёвый контракт,
 * который рука ещё обещает; если не обещает ни одного — самый дешёвый
 * допустимый (отказаться от игры нельзя, §3.5).
 */
export function chooseFinalContract(input: FinalContractInput): ContractId {
  const legal = input.legalContracts;
  const cheapest = legal[0];
  if (cheapest === undefined) {
    throw new Error('Нет допустимых окончательных заказов: движок обязан дать хотя бы один (§4.3)');
  }

  let best: ContractId | null = null;
  let bestLevel = Infinity;
  let bestExpected = -Infinity;

  for (const id of legal) {
    const contract = parseContract(id);
    if (isMizer(contract)) {
      // Торговля выиграна мизером — играем мизер (§4.3, TS-11).
      return 'MIZER';
    }
    const level = levelOf(id);
    // Окончательный заказ делается ПОСЛЕ прикупа и сноса: прикуп уже в руке,
    // второй раз его прибавлять нельзя (§4.3).
    const expected = expectedTricks(input.hand, id, false);
    if (expected < level) continue;
    // Минимальный уровень; на равном уровне — козырь с большей ожидаемой силой.
    if (level < bestLevel || (level === bestLevel && expected > bestExpected)) {
      best = id as ContractId;
      bestLevel = level;
      bestExpected = expected;
    }
  }

  return best ?? (cheapest as ContractId);
}
