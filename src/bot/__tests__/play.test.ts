/**
 * Эвристики розыгрыша: выбор карты по цели раздачи.
 * Источник истины: docs/rules.md §6.2 (легальность), §7 (мизер), §8 (распасы).
 */
import { describe, expect, it } from 'vitest';
import { cardId, parseCard, parseCards } from '../../core/index.js';
import type { PlayedCard, PlayerId } from '../../core/index.js';
import { pickCard } from '../play.js';

/** Короткая запись выложенной карты. */
function played(player: PlayerId, id: string): PlayedCard {
  return { player, card: parseCard(id) };
}

describe('pickCard, цель «взять» — игра на контракт (§6)', () => {
  it('заходит старшей картой, когда держит верх масти', () => {
    const card = pickCard({
      hand: parseCards(['AS', '7S', '9C']),
      legal: parseCards(['AS', '7S', '9C']),
      trick: [],
      trump: null,
      goal: 'win',
      seen: new Set(),
    });
    expect(cardId(card)).toBe('AS');
  });

  it('берёт взятку минимальной достаточной картой, а не тузом', () => {
    const card = pickCard({
      hand: parseCards(['AS', 'QS', '7S']),
      legal: parseCards(['AS', 'QS', '7S']),
      trick: [played(0, 'JS'), played(1, '9S')],
      trump: null,
      goal: 'win',
      seen: new Set(['JS', '9S']),
    });
    expect(cardId(card)).toBe('QS');
  });

  it('когда взятку не взять — сбрасывает самую слабую карту', () => {
    const card = pickCard({
      hand: parseCards(['QS', '9S', '7S']),
      legal: parseCards(['QS', '9S', '7S']),
      trick: [played(0, 'AS')],
      trump: null,
      goal: 'win',
      seen: new Set(['AS']),
    });
    expect(cardId(card)).toBe('7S');
  });

  it('подрезает козырем, когда своей масти нет', () => {
    const card = pickCard({
      hand: parseCards(['7H', '8H']),
      legal: parseCards(['7H', '8H']),
      trick: [played(0, 'AS'), played(1, 'KS')],
      trump: 'H',
      ledSuit: 'S',
      goal: 'win',
      seen: new Set(['AS', 'KS']),
    });
    // Козырь берёт взятку — кладём минимальный достаточный.
    expect(cardId(card)).toBe('7H');
  });
});

describe('pickCard, цель «не брать» — распасы (§8.1)', () => {
  it('заходит самой мелкой картой', () => {
    const card = pickCard({
      hand: parseCards(['AS', '9S', '7S']),
      legal: parseCards(['AS', '9S', '7S']),
      trick: [],
      trump: null,
      goal: 'avoid',
      seen: new Set(),
    });
    expect(cardId(card)).toBe('7S');
  });

  it('сбрасывает самую старшую карту, которая ещё не берёт взятку', () => {
    const card = pickCard({
      hand: parseCards(['QS', '9S', '7S']),
      legal: parseCards(['QS', '9S', '7S']),
      trick: [played(0, 'AS'), played(1, 'KS')],
      trump: null,
      goal: 'avoid',
      seen: new Set(['AS', 'KS']),
    });
    // Туз и король уже вышли — дама безопасна и от неё надо избавляться.
    expect(cardId(card)).toBe('QS');
  });

  it('если брать придётся в любом случае — берёт минимальной картой', () => {
    const card = pickCard({
      hand: parseCards(['KS', 'QS', 'JS']),
      legal: parseCards(['KS', 'QS', 'JS']),
      trick: [played(0, '9S'), played(1, '7S')],
      trump: null,
      goal: 'avoid',
      seen: new Set(['9S', '7S']),
    });
    expect(cardId(card)).toBe('JS');
  });
});

describe('pickCard, цель «поймать мизериста» (§7)', () => {
  it('не перебивает мизериста, когда он уже берёт взятку', () => {
    const card = pickCard({
      hand: parseCards(['AS', '9S', '7S']),
      legal: parseCards(['AS', '9S', '7S']),
      trick: [played(0, 'KS')],
      trump: null,
      goal: 'catch',
      target: 0,
      seen: new Set(['KS']),
    });
    // Мизерист берёт взятку — сбрасываем старшую карту, которая его не перебьёт.
    expect(cardId(card)).toBe('9S');
  });

  it('заходит мелкой картой, чтобы мизеристу пришлось положить старшую', () => {
    const card = pickCard({
      hand: parseCards(['AS', '9S', '7S']),
      legal: parseCards(['AS', '9S', '7S']),
      trick: [],
      trump: null,
      goal: 'catch',
      target: 0,
      seen: new Set(),
    });
    expect(cardId(card)).toBe('7S');
  });

  it('пока мизерист не сходил — кладёт САМУЮ мелкую карту, а не старшую безопасную', () => {
    // Ключевое отличие от «не брать»: там сбрасывают старшую безопасную карту,
    // здесь планка взятки держится максимально низкой, чтобы взятку
    // вынужденно забрал мизерист, который ходит после нас (§7 п.6).
    const input = {
      hand: parseCards(['QS', '8S', '7S']),
      legal: parseCards(['QS', '8S', '7S']),
      trick: [played(1, '9S')],
      trump: null,
      target: 0 as PlayerId,
      seen: new Set(['9S']),
    };
    expect(cardId(pickCard({ ...input, goal: 'catch' }))).toBe('7S');
    // Та же позиция при цели «не брать» решается иначе — эвристики не совпадают.
    expect(cardId(pickCard({ ...input, goal: 'avoid' }))).toBe('8S');
  });

  it('перебивает соперника-обороняющегося, если иначе взятку возьмёт не мизерист', () => {
    const card = pickCard({
      hand: parseCards(['AS', '9S']),
      legal: parseCards(['AS', '9S']),
      // Мизерист (0) ещё не ходил; во взятке карта второго обороняющегося.
      trick: [played(1, 'KS')],
      trump: null,
      goal: 'catch',
      target: 0,
      seen: new Set(['KS']),
    });
    // Мизерист ходит последним и сбросит мелочь — поднимать взятку бессмысленно,
    // но и оставлять её партнёру не страшно: главное не мешать. Кладём мелочь.
    expect(cardId(card)).toBe('9S');
  });

  it('мизерист уже сходил и взятку не берёт — сбрасываем старшую безопасную карту', () => {
    const card = pickCard({
      hand: parseCards(['QS', '8S', '7S']),
      legal: parseCards(['QS', '8S', '7S']),
      // Мизерист (0) положил мелочь, взятку держит обороняющийся (1).
      trick: [played(0, '7C'), played(1, 'KS')],
      trump: null,
      ledSuit: 'S',
      goal: 'catch',
      target: 0,
      seen: new Set(['7C', 'KS']),
    });
    // Взятка мизеристу уже не достанется — избавляемся от старшей безопасной.
    expect(cardId(card)).toBe('QS');
  });
});

describe('pickCard — общие инварианты', () => {
  it('всегда возвращает карту из числа легальных', () => {
    const legal = parseCards(['QS', '9S']);
    for (const goal of ['win', 'avoid', 'catch'] as const) {
      const card = pickCard({
        hand: parseCards(['QS', '9S', 'AH']),
        legal,
        trick: [played(0, 'AS')],
        trump: 'H',
        ledSuit: 'S',
        goal,
        seen: new Set(['AS']),
      });
      expect(legal.map(cardId)).toContain(cardId(card));
    }
  });

  it('бросает, если легальных ходов нет — это баг движка', () => {
    expect(() =>
      pickCard({
        hand: [],
        legal: [],
        trick: [],
        trump: null,
        goal: 'win',
        seen: new Set(),
      }),
    ).toThrow();
  });
});
