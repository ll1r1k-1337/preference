import { describe, it, expect } from 'vitest';
import { cardIds, createDeck, parseCards, sortCards } from '../cards.js';
import { createRng, shuffleDeck, shuffled } from '../shuffle.js';

describe('shuffle: детерминированный ГПСЧ', () => {
  it('одинаковый seed даёт одинаковую последовательность', () => {
    const a = createRng('deal-1');
    const b = createRng('deal-1');
    const seqA = Array.from({ length: 10 }, () => a.nextUint32());
    const seqB = Array.from({ length: 10 }, () => b.nextUint32());
    expect(seqA).toEqual(seqB);
  });

  it('разные seed дают разные последовательности', () => {
    const a = createRng('deal-1');
    const b = createRng('deal-2');
    const seqA = Array.from({ length: 10 }, () => a.nextUint32());
    const seqB = Array.from({ length: 10 }, () => b.nextUint32());
    expect(seqA).not.toEqual(seqB);
  });

  it('nextInt(n) держится в диапазоне [0, n)', () => {
    const rng = createRng('range');
    for (let i = 0; i < 500; i += 1) {
      const v = rng.nextInt(7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
    }
  });

  it('числовой seed допустим наравне со строковым', () => {
    const a = createRng(42);
    const b = createRng(42);
    expect(a.nextUint32()).toBe(b.nextUint32());
  });
});

describe('shuffle: перемешивание колоды', () => {
  it('shuffleDeck(seed) воспроизводим для одного seed', () => {
    expect(cardIds(shuffleDeck('seed-A'))).toEqual(cardIds(shuffleDeck('seed-A')));
  });

  it('перемешивание — перестановка канонической колоды', () => {
    const s = shuffleDeck('seed-A');
    expect(s).toHaveLength(32);
    expect(cardIds(sortCards(s))).toEqual(cardIds(createDeck()));
  });

  it('перемешивание действительно меняет порядок', () => {
    expect(cardIds(shuffleDeck('seed-A'))).not.toEqual(cardIds(createDeck()));
  });

  it('разные seed дают разные раскладки', () => {
    expect(cardIds(shuffleDeck('seed-A'))).not.toEqual(cardIds(shuffleDeck('seed-B')));
  });

  it('shuffled(cards, seed) не мутирует вход', () => {
    const deck = createDeck();
    const before = cardIds(deck);
    shuffled(deck, 'x');
    expect(cardIds(deck)).toEqual(before);
  });

  it('shuffled сохраняет мультимножество карт', () => {
    const hand = ['AS', '7C', 'TD', '9H'];
    const out = cardIds(shuffled(parseCards(hand), 'k'));
    expect([...out].sort()).toEqual([...hand].sort());
  });
});
