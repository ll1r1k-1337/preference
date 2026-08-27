import { describe, it, expect } from 'vitest';
import { cardIds, createDeck, sortCards } from '../cards.js';
import { shuffleDeck } from '../shuffle.js';
import {
  PLAYERS,
  dealCards,
  dealFromDeck,
  firstHand,
  handRole,
  nextDealer,
  playerAfter,
  secondHand,
  thirdHand,
} from '../deal.js';

describe('deal: роли рук (§2.2)', () => {
  it('первая рука — слева от сдающего, третья — сам сдающий', () => {
    expect(firstHand(0)).toBe(1);
    expect(secondHand(0)).toBe(2);
    expect(thirdHand(0)).toBe(0);

    expect(firstHand(2)).toBe(0);
    expect(secondHand(2)).toBe(1);
    expect(thirdHand(2)).toBe(2);
  });

  it('handRole возвращает старшинство руки', () => {
    expect(handRole(1, 0)).toBe('first');
    expect(handRole(2, 0)).toBe('second');
    expect(handRole(0, 0)).toBe('third');
  });

  it('playerAfter идёт по часовой стрелке', () => {
    expect(playerAfter(0)).toBe(1);
    expect(playerAfter(1)).toBe(2);
    expect(playerAfter(2)).toBe(0);
  });

  it('сдающий смещается на одного по часовой стрелке (dealerRotation = sliding)', () => {
    expect(nextDealer(0)).toBe(1);
    expect(nextDealer(1)).toBe(2);
    expect(nextDealer(2)).toBe(0);
  });

  it('игроков ровно трое', () => {
    expect(PLAYERS).toEqual([0, 1, 2]);
  });
});

describe('deal: порядок сдачи (§2.3)', () => {
  const deck = createDeck();

  it('каждому по 10 карт, в прикупе 2', () => {
    const d = dealFromDeck(deck, 0);
    expect(d.hands[0]).toHaveLength(10);
    expect(d.hands[1]).toHaveLength(10);
    expect(d.hands[2]).toHaveLength(10);
    expect(d.widow).toHaveLength(2);
  });

  it('розданные карты в сумме дают исходную колоду без потерь и дублей', () => {
    const d = dealFromDeck(deck, 1);
    const all = [...d.hands[0], ...d.hands[1], ...d.hands[2], ...d.widow];
    expect(all).toHaveLength(32);
    expect(cardIds(sortCards(all))).toEqual(cardIds(createDeck()));
  });

  it('прикуп — карты №13 и №14 в порядке разбора, а не первая/последняя пара', () => {
    const d = dealFromDeck(deck, 0);
    expect(cardIds(d.widow)).toEqual([cardIds(deck)[12], cardIds(deck)[13]]);
  });

  it('раздача идёт по 2 карты: 2 круга, прикуп, ещё 3 круга (dealer = 0)', () => {
    const ids = cardIds(deck);
    const d = dealFromDeck(deck, 0);
    // Круг 1: первая рука (1) получает карты 0-1, вторая (2) — 2-3, третья (0) — 4-5.
    // Круг 2: 1 → 6-7, 2 → 8-9, 0 → 10-11. Прикуп: 12-13.
    // Круг 3: 1 → 14-15, 2 → 16-17, 0 → 18-19; и так далее.
    expect(cardIds(d.hands[1]).slice(0, 4)).toEqual([ids[0], ids[1], ids[6], ids[7]]);
    expect(cardIds(d.hands[2]).slice(0, 4)).toEqual([ids[2], ids[3], ids[8], ids[9]]);
    expect(cardIds(d.hands[0]).slice(0, 4)).toEqual([ids[4], ids[5], ids[10], ids[11]]);
    expect(cardIds(d.hands[1]).slice(4, 6)).toEqual([ids[14], ids[15]]);
    expect(cardIds(d.hands[0]).slice(8, 10)).toEqual([ids[30], ids[31]]);
  });

  it('при другом сдающем карты сдвигаются по ролям рук', () => {
    const ids = cardIds(deck);
    const d = dealFromDeck(deck, 1); // первая рука = 2
    expect(cardIds(d.hands[2]).slice(0, 2)).toEqual([ids[0], ids[1]]);
    expect(cardIds(d.hands[0]).slice(0, 2)).toEqual([ids[2], ids[3]]);
    expect(cardIds(d.hands[1]).slice(0, 2)).toEqual([ids[4], ids[5]]);
  });

  it('руки возвращаются в канонической сортировке', () => {
    const d = dealFromDeck(shuffleDeck('sorted-check'), 0);
    for (const p of PLAYERS) {
      expect(cardIds(d.hands[p])).toEqual(cardIds(sortCards(d.hands[p])));
    }
  });

  it('колода неверного размера отвергается', () => {
    expect(() => dealFromDeck(deck.slice(0, 31), 0)).toThrow(/32/);
  });

  it('колода с дублями отвергается', () => {
    const bad = [...deck.slice(0, 31), deck[0]!];
    expect(() => dealFromDeck(bad, 0)).toThrow(/дубл/i);
  });
});

describe('deal: сдача по seed', () => {
  it('одинаковый seed и сдающий дают одинаковую раздачу', () => {
    const a = dealCards({ seed: 'game-7', dealer: 2 });
    const b = dealCards({ seed: 'game-7', dealer: 2 });
    expect(cardIds(a.hands[0])).toEqual(cardIds(b.hands[0]));
    expect(cardIds(a.widow)).toEqual(cardIds(b.widow));
  });

  it('разный seed даёт разную раздачу', () => {
    const a = dealCards({ seed: 'game-7', dealer: 0 });
    const b = dealCards({ seed: 'game-8', dealer: 0 });
    expect(cardIds(a.hands[0])).not.toEqual(cardIds(b.hands[0]));
  });

  it('раздача возвращает сдающего и первую руку', () => {
    const d = dealCards({ seed: 's', dealer: 2 });
    expect(d.dealer).toBe(2);
    expect(d.firstHand).toBe(0);
  });
});
