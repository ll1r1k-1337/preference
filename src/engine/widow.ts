/**
 * Прикуп, снос и окончательный заказ контракта.
 * Источник истины: docs/rules.md §4, сценарии TS-09…TS-12.
 */
import type { Card, CardId, Contract, ContractId } from '../core/index.js';
import {
  ALL_CONTRACTS,
  cardId,
  contractId,
  isAllowedFinalContract,
  isMizer,
  parseCard,
  sortCards,
} from '../core/index.js';

/** Разбор CardId; `null` при некорректном формате. */
export function tryParseCard(id: string): Card | null {
  try {
    return parseCard(id);
  } catch {
    return null;
  }
}

/**
 * Проверка сноса (§4.2): ровно две различные карты, обе из руки игрока.
 * Возвращает текст отказа либо `null`.
 */
export function discardRejection(ids: readonly string[], hand: readonly Card[]): string | null {
  if (ids.length !== 2) {
    return `Снести нужно ровно две карты, получено ${ids.length} (§4.2)`;
  }
  if (ids[0] === ids[1]) {
    return `Карта ${ids[0]} указана дважды: снос — две разные карты (§4.2)`;
  }
  const handIds = new Set<string>(hand.map(cardId));
  for (const id of ids) {
    if (tryParseCard(id) === null) {
      return `Некорректный идентификатор карты: ${JSON.stringify(id)}`;
    }
    if (!handIds.has(id)) {
      return `Карты ${id} нет в руке игрока — снести её нельзя (§4.2)`;
    }
  }
  return null;
}

/** Убрать снесённые карты из руки (§4.2): 12 карт → 10. */
export function applyDiscard(hand: readonly Card[], ids: readonly string[]): readonly Card[] {
  const dropped = new Set<string>(ids);
  return Object.freeze(hand.filter((c) => !dropped.has(cardId(c))));
}

/** Добрать прикуп в руку (§4.2): 10 карт → 12, в канонической сортировке. */
export function pickUpWidow(hand: readonly Card[], widow: readonly Card[]): readonly Card[] {
  return Object.freeze(sortCards([...hand, ...widow]));
}

/** Идентификаторы прикупа для события. */
export function widowIds(widow: readonly Card[]): readonly CardId[] {
  return Object.freeze(widow.map(cardId));
}

/**
 * Допустимые окончательные заказы поверх выигравшей заявки (§4.3):
 * не ниже неё по шкале; мизер кабальный в обе стороны.
 */
export function legalFinalContracts(won: Contract): readonly ContractId[] {
  return Object.freeze(
    ALL_CONTRACTS.filter((c) => isAllowedFinalContract(c, won)).map(contractId),
  );
}

/**
 * Проверка окончательного заказа (§4.3, TS-09…TS-11).
 * Возвращает текст отказа либо `null`.
 */
export function finalContractRejection(candidate: Contract, won: Contract): string | null {
  if (isMizer(won) && !isMizer(candidate)) {
    return 'Торговля выиграна мизером — играть обязан мизер (§4.3, TS-11)';
  }
  if (!isMizer(won) && isMizer(candidate)) {
    return 'Мизер кабальный: заказать его при выигранной игре на взятки нельзя (§4.3)';
  }
  if (!isAllowedFinalContract(candidate, won)) {
    return `Окончательный заказ ${contractId(candidate)} должен быть не ниже выигравшей заявки ${contractId(won)} (§4.3)`;
  }
  return null;
}
