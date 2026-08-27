import { describe, it, expect } from 'vitest';
import {
  RANKS,
  SUITS,
  rankOrder,
  suitOrder,
  makeCard,
  parseCard,
  cardId,
  cardIds,
  createDeck,
  compareCards,
  sortCards,
  sameCard,
} from '../cards.js';

describe('cards: ранги и масти (§1.2, §1.3)', () => {
  it('ранги перечислены от младшего к старшему', () => {
    expect(RANKS).toEqual(['7', '8', '9', 'T', 'J', 'Q', 'K', 'A']);
    expect(RANKS.map(rankOrder)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('масти перечислены по возрастанию силы в торговле', () => {
    expect(SUITS).toEqual(['S', 'C', 'D', 'H']);
    expect(SUITS.map(suitOrder)).toEqual([0, 1, 2, 3]);
  });
});

describe('cards: CardId (§1.4)', () => {
  it('cardId склеивает ранг и масть', () => {
    expect(cardId(makeCard('A', 'S'))).toBe('AS');
    expect(cardId(makeCard('T', 'H'))).toBe('TH');
    expect(cardId(makeCard('7', 'C'))).toBe('7C');
  });

  it('parseCard разбирает идентификатор', () => {
    expect(parseCard('AS')).toEqual({ rank: 'A', suit: 'S' });
    expect(parseCard('9D')).toEqual({ rank: '9', suit: 'D' });
  });

  it('parseCard отвергает мусор', () => {
    expect(() => parseCard('10S')).toThrow(/CardId/);
    expect(() => parseCard('AX')).toThrow(/CardId/);
    expect(() => parseCard('6S')).toThrow(/CardId/);
    expect(() => parseCard('')).toThrow(/CardId/);
  });

  it('parseCard(cardId(c)) — тождество для всей колоды', () => {
    for (const c of createDeck()) {
      expect(parseCard(cardId(c))).toEqual(c);
    }
  });
});

describe('cards: каноническая колода (§1.1, §1.4)', () => {
  it('колода состоит из 32 уникальных карт', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(32);
    expect(new Set(cardIds(deck)).size).toBe(32);
  });

  it('порядок канонической колоды — по suitOrder, затем по rankOrder', () => {
    const ids = cardIds(createDeck());
    expect(ids.slice(0, 8)).toEqual(['7S', '8S', '9S', 'TS', 'JS', 'QS', 'KS', 'AS']);
    expect(ids.slice(8, 16)).toEqual(['7C', '8C', '9C', 'TC', 'JC', 'QC', 'KC', 'AC']);
    expect(ids.slice(16, 24)).toEqual(['7D', '8D', '9D', 'TD', 'JD', 'QD', 'KD', 'AD']);
    expect(ids.slice(24)).toEqual(['7H', '8H', '9H', 'TH', 'JH', 'QH', 'KH', 'AH']);
  });

  it('createDeck возвращает новый массив при каждом вызове', () => {
    const a = createDeck();
    const b = createDeck();
    expect(a).not.toBe(b);
    expect(cardIds(a)).toEqual(cardIds(b));
  });
});

describe('cards: сортировка и сравнение', () => {
  it('compareCards задаёт канонический порядок', () => {
    expect(compareCards(parseCard('7S'), parseCard('AS'))).toBeLessThan(0);
    expect(compareCards(parseCard('AS'), parseCard('7C'))).toBeLessThan(0);
    expect(compareCards(parseCard('AH'), parseCard('7S'))).toBeGreaterThan(0);
    expect(compareCards(parseCard('9D'), parseCard('9D'))).toBe(0);
  });

  it('sortCards не мутирует вход и сортирует канонически', () => {
    const hand = ['AH', '7S', 'TD', '9S'].map(parseCard);
    const sorted = sortCards(hand);
    expect(cardIds(sorted)).toEqual(['7S', '9S', 'TD', 'AH']);
    expect(cardIds(hand)).toEqual(['AH', '7S', 'TD', '9S']);
  });

  it('sameCard сравнивает по значению, а не по ссылке', () => {
    expect(sameCard(parseCard('QC'), makeCard('Q', 'C'))).toBe(true);
    expect(sameCard(parseCard('QC'), makeCard('Q', 'D'))).toBe(false);
  });
});
