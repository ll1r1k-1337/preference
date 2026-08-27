/**
 * Monte-Carlo поиск хода: сэмплирование неизвестных рук и симуляция до конца.
 * Источник истины по правилам розыгрыша: docs/rules.md §6, §7, §8.
 */
import { describe, expect, it } from 'vitest';
import { cardId, createRng, parseCard, parseCards } from '../../core/index.js';
import type { PlayerId, Suit } from '../../core/index.js';
import { determinize, searchMove } from '../search.js';

const noVoids = { 0: new Set<Suit>(), 1: new Set<Suit>(), 2: new Set<Suit>() };

describe('determinize — раздача неизвестных карт по скрытым рукам', () => {
  it('раздаёт ровно столько карт, сколько заявлено размерами рук', () => {
    const unseen = parseCards(['AS', 'KS', 'QS', 'JS', 'TS', '9S']);
    const hands = determinize({
      unseen,
      sizes: { 0: 0, 1: 4, 2: 2 },
      voids: noVoids,
      rng: createRng('det-1'),
    });
    expect(hands[0]).toHaveLength(0);
    expect(hands[1]).toHaveLength(4);
    expect(hands[2]).toHaveLength(2);
  });

  it('раздаёт каждую карту ровно один раз', () => {
    const unseen = parseCards(['AS', 'KS', 'AC', 'KC', 'AD', 'KD']);
    const hands = determinize({
      unseen,
      sizes: { 0: 2, 1: 2, 2: 2 },
      voids: noVoids,
      rng: createRng('det-2'),
    });
    const all = [...hands[0], ...hands[1], ...hands[2]].map(cardId).sort();
    expect(all).toEqual(unseen.map(cardId).sort());
  });

  it('уважает ренонсы: игроку, снёсшему масть, её карты не достаются (§6.2)', () => {
    const unseen = parseCards(['AS', 'KS', 'QS', 'AC', 'KC', 'QC']);
    const hands = determinize({
      unseen,
      sizes: { 0: 0, 1: 3, 2: 3 },
      // Игрок 1 показал ренонс в пиках — значит, пик у него быть не может.
      voids: { 0: new Set<Suit>(), 1: new Set<Suit>(['S']), 2: new Set<Suit>() },
      rng: createRng('det-3'),
    });
    expect(hands[1].some((c) => c.suit === 'S')).toBe(false);
    expect(hands[2].filter((c) => c.suit === 'S')).toHaveLength(3);
  });

  it('детерминирован при одном и том же seed', () => {
    const unseen = parseCards(['AS', 'KS', 'AC', 'KC', 'AD', 'KD']);
    const make = (): readonly string[] =>
      Object.values(
        determinize({
          unseen,
          sizes: { 0: 2, 1: 2, 2: 2 },
          voids: noVoids,
          rng: createRng('same-seed'),
        }),
      ).flatMap((cards) => cards.map(cardId));
    expect(make()).toEqual(make());
  });

  it('лишние неизвестные карты уходят в «мёртвую» стопку: снос и невскрытый прикуп', () => {
    // 6 неизвестных карт, но на руках только 4 — две вне игры (снос, §4.2).
    const unseen = parseCards(['AS', 'KS', 'AC', 'KC', 'AD', 'KD']);
    const hands = determinize({
      unseen,
      sizes: { 0: 0, 1: 2, 2: 2 },
      voids: noVoids,
      dead: 2,
      rng: createRng('dead-1'),
    });
    expect(hands[1]).toHaveLength(2);
    expect(hands[2]).toHaveLength(2);
    const dealt = [...hands[0], ...hands[1], ...hands[2]].map(cardId);
    expect(new Set(dealt).size).toBe(4);
    for (const id of dealt) expect(unseen.map(cardId)).toContain(id);
  });

  it('бросает, если неизвестных карт меньше, чем мест в руках — молча недодать нельзя', () => {
    // Классический баг: часть карт ошибочно сочли известными, руки недобирают
    // карт, и симуляция падает уже глубоко внутри розыгрыша.
    expect(() =>
      determinize({
        unseen: parseCards(['AS', 'KS']),
        sizes: { 0: 3, 1: 3, 2: 0 },
        voids: noVoids,
        rng: createRng('short-pool'),
      }),
    ).toThrow(/меньше|не сходятся/);
  });
});

describe('searchMove — выбор хода симуляциями', () => {
  /**
   * Концовка на две взятки, БК, ходит игрок 0 с ♠A7.
   * Неизвестны ♠KQ и ♥J9 — заход тузом гарантирует взятку, заход мелочью
   * может оставить туза без взятки (если соперник выйдет в червы).
   */
  function endgame(simulations: number): ReturnType<typeof searchMove> {
    return searchMove({
      mode: { kind: 'contract', contract: { kind: 'tricks', level: 6, suit: 'NT' }, declarer: 0 },
      dealer: 2,
      leader: 0,
      currentTrick: [],
      completedTricks: [],
      hands: { 0: parseCards(['AS', '7S']), 1: null, 2: null },
      unseen: parseCards(['KS', 'QS', 'JH', '9H']),
      sizes: { 0: 0, 1: 2, 2: 2 },
      voids: noVoids,
      goalFor: () => 'win',
      beneficiaries: [0],
      objective: 'maximize',
      simulations,
      rng: createRng('search-1'),
    });
  }

  it('возвращает карту из руки того, кто ходит', () => {
    const card = endgame(40);
    expect(['AS', '7S']).toContain(cardId(card));
  });

  it('находит очевидно лучший ход: туз берёт взятку гарантированно', () => {
    expect(cardId(endgame(100))).toBe('AS');
  });

  it('детерминирован при одном seed', () => {
    expect(cardId(endgame(60))).toBe(cardId(endgame(60)));
  });

  it('на распасах ищет минимум взяток: сбрасывает туза, а не мелочь', () => {
    // Ходит игрок 0; цель — не взять. С руки ♠A7 заход мелочью гарантирует взятку
    // сопернику, но и туз останется на руке. Симуляции обязаны это учесть.
    const card = searchMove({
      mode: { kind: 'raspasy', widow: [parseCard('7H'), parseCard('8H')] },
      dealer: 2,
      leader: 0,
      currentTrick: [],
      completedTricks: [],
      hands: { 0: parseCards(['AS', '7S']), 1: null, 2: null },
      unseen: parseCards(['KS', 'QS', 'JS', '9S']),
      sizes: { 0: 0, 1: 2, 2: 2 },
      voids: noVoids,
      goalFor: () => 'avoid',
      beneficiaries: [0],
      objective: 'minimize',
      simulations: 100,
      rng: createRng('search-raspasy'),
    });
    expect(['AS', '7S']).toContain(cardId(card));
  });

  it('уважает легальность: при заданной масти хода выбирает только из неё (§6.2)', () => {
    const card = searchMove({
      mode: { kind: 'contract', contract: { kind: 'tricks', level: 6, suit: 'NT' }, declarer: 1 },
      dealer: 2,
      // Ходил игрок 2, теперь очередь игрока 0 — это наш бот.
      leader: 2,
      currentTrick: [{ player: 2, card: parseCard('KS') }],
      completedTricks: [],
      hands: { 0: parseCards(['AS', '7S', 'AH']), 1: null, 2: null },
      unseen: parseCards(['QS', 'JS', 'KH', 'QH', 'JH']),
      sizes: { 0: 0, 1: 3, 2: 2 },
      voids: noVoids,
      goalFor: () => 'win',
      beneficiaries: [0],
      objective: 'maximize',
      simulations: 50,
      rng: createRng('search-legal'),
    });
    // Масть хода — пики, значит ♥A недопустим.
    expect(['AS', '7S']).toContain(cardId(card));
  });

  it('бросает, если у ходящего нет карт — это баг вызывающей стороны', () => {
    expect(() =>
      searchMove({
        mode: { kind: 'contract', contract: { kind: 'tricks', level: 6, suit: 'NT' }, declarer: 0 },
        dealer: 2,
        leader: 0,
        currentTrick: [],
        completedTricks: [],
        hands: { 0: [], 1: null, 2: null },
        unseen: [],
        sizes: { 0: 0, 1: 0, 2: 0 },
        voids: noVoids,
        goalFor: () => 'win',
        beneficiaries: [0 as PlayerId],
        objective: 'maximize',
        simulations: 10,
        rng: createRng('search-empty'),
      }),
    ).toThrow();
  });
});
