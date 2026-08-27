/**
 * Инвариантные (fuzz) тесты: прогоняем много случайных раздач целиком
 * и проверяем, что ядро никогда не нарушает нормативные правила §6 и §8.2.
 */
import { describe, it, expect } from 'vitest';
import type { Card, Suit } from '../cards.js';
import { cardIds, createDeck, sortCards } from '../cards.js';
import { ALL_CONTRACTS, contractTrump, isMizer } from '../contract.js';
import type { PlayerId } from '../deal.js';
import { PLAYERS, dealCards, nextDealer } from '../deal.js';
import {
  applyMove,
  createPlay,
  currentLedSuit,
  currentTrumpSuit,
  isTerminal,
  legalMoves,
  totalTricks,
} from '../play.js';
import { createRng } from '../shuffle.js';
import { serializePlayState, deserializePlayState } from '../serialize.js';
import type { PlayMode, PlayState } from '../play.js';

const DEALS = 300;

function modeForDeal(index: number, widow: readonly Card[]): PlayMode {
  if (index % 5 === 0) {
    return { kind: 'raspasy', widow: [widow[0]!, widow[1]!] };
  }
  const contract = ALL_CONTRACTS[index % ALL_CONTRACTS.length]!;
  return { kind: 'contract', contract, declarer: (index % 3) as PlayerId };
}

/** Проверка одного хода на соответствие §6.2 «до» его применения. */
function assertMoveLegalByRules(state: PlayState, card: Card): void {
  const hand = state.hands[state.toPlay];
  const led = currentLedSuit(state);
  const trump: Suit | null = currentTrumpSuit(state);

  expect(hand.some((c) => c.rank === card.rank && c.suit === card.suit)).toBe(true);

  if (led === null) return; // первый ход не ограничен

  const hasLed = hand.some((c) => c.suit === led);
  if (hasLed) {
    expect(card.suit).toBe(led);
    return;
  }
  if (trump !== null && hand.some((c) => c.suit === trump)) {
    expect(card.suit).toBe(trump);
  }
}

describe('инварианты ядра на 300 случайных раздачах', () => {
  it('розыгрыш всегда доходит до конца, правила хода не нарушаются', () => {
    let dealer: PlayerId = 0;
    let raspasyDeals = 0;
    let mizerDeals = 0;
    let trumpDeals = 0;

    for (let i = 0; i < DEALS; i += 1) {
      const dealt = dealCards({ seed: `fuzz-${i}`, dealer });
      const mode = modeForDeal(i, dealt.widow);

      if (mode.kind === 'raspasy') raspasyDeals += 1;
      else if (isMizer(mode.contract)) mizerDeals += 1;
      else if (contractTrump(mode.contract) !== null) trumpDeals += 1;

      let state = createPlay({ mode, dealer, hands: dealt.hands });
      const rng = createRng(`moves-${i}`);
      let plies = 0;

      while (!isTerminal(state)) {
        const moves = legalMoves(state);
        expect(moves.length).toBeGreaterThan(0);
        const chosen = moves[rng.nextInt(moves.length)]!;
        assertMoveLegalByRules(state, chosen);
        state = applyMove(state, chosen);
        plies += 1;
        expect(plies).toBeLessThanOrEqual(30);
      }

      // Раздача сыграна целиком: 10 взяток, сумма взяток = 10.
      expect(state.completedTricks).toHaveLength(10);
      expect(totalTricks(state)).toBe(10);
      for (const p of PLAYERS) {
        expect(state.hands[p]).toHaveLength(0);
        expect(state.tricksWon[p]).toBeGreaterThanOrEqual(0);
      }

      // Все 30 сыгранных карт уникальны и составляют розданные руки.
      const played = state.completedTricks.flatMap((t) => t.plays.map((p) => p.card));
      expect(played).toHaveLength(30);
      expect(new Set(cardIds(played)).size).toBe(30);
      const dealtCards = [...dealt.hands[0], ...dealt.hands[1], ...dealt.hands[2]];
      expect(cardIds(sortCards(played))).toEqual(cardIds(sortCards(dealtCards)));

      // Каждая взятка содержит ровно 3 карты от трёх разных игроков.
      for (const trick of state.completedTricks) {
        expect(trick.plays).toHaveLength(3);
        expect(new Set(trick.plays.map((p) => p.player)).size).toBe(3);
        expect(trick.plays[0]!.player).toBe(trick.leader);
      }

      // Порядок взяток строго возрастает от 1 до 10.
      expect(state.completedTricks.map((t) => t.number)).toEqual(
        Array.from({ length: 10 }, (_, k) => k + 1),
      );

      // Распасы: карты прикупа вскрываются ровно в первых двух взятках (§8.2).
      const withWidow = state.completedTricks.filter((t) => t.widowCard !== null);
      if (mode.kind === 'raspasy') {
        expect(withWidow.map((t) => t.number)).toEqual([1, 2]);
        expect(state.completedTricks[2]!.leader).toBe(dealt.firstHand);
      } else {
        expect(withWidow).toHaveLength(0);
        // Игра на взятки: победитель взятки ходит в следующей (§2.4).
        for (let k = 1; k < state.completedTricks.length; k += 1) {
          expect(state.completedTricks[k]!.leader).toBe(state.completedTricks[k - 1]!.winner);
        }
      }

      // Финальный снимок переживает round-trip.
      const restored = deserializePlayState(serializePlayState(state));
      expect(serializePlayState(restored)).toEqual(serializePlayState(state));

      dealer = nextDealer(dealer);
    }

    // Все три режима действительно встретились в выборке.
    expect(raspasyDeals).toBeGreaterThan(0);
    expect(mizerDeals).toBeGreaterThan(0);
    expect(trumpDeals).toBeGreaterThan(0);
  });

  it('сдача по seed никогда не теряет и не дублирует карты', () => {
    for (let i = 0; i < 200; i += 1) {
      const dealer = (i % 3) as PlayerId;
      const d = dealCards({ seed: `deal-${i}`, dealer });
      const all = [...d.hands[0], ...d.hands[1], ...d.hands[2], ...d.widow];
      expect(all).toHaveLength(32);
      expect(new Set(cardIds(all)).size).toBe(32);
      expect(cardIds(sortCards(all))).toEqual(cardIds(createDeck()));
    }
  });

  it('победитель взятки всегда среди участников взятки', () => {
    let dealer: PlayerId = 1;
    for (let i = 0; i < 60; i += 1) {
      const dealt = dealCards({ seed: `winner-${i}`, dealer });
      const mode = modeForDeal(i, dealt.widow);
      let state = createPlay({ mode, dealer, hands: dealt.hands });
      const rng = createRng(`winner-moves-${i}`);
      while (!isTerminal(state)) {
        const moves = legalMoves(state);
        state = applyMove(state, moves[rng.nextInt(moves.length)]!);
      }
      for (const trick of state.completedTricks) {
        expect(trick.plays.map((p) => p.player)).toContain(trick.winner);
      }
      dealer = nextDealer(dealer);
    }
  });
});
