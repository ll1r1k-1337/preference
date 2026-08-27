/**
 * Табличные кейсы acceptance: `legalMoves` и `trickWinner`.
 *
 * Каждый кейс имеет стабильный идентификатор: `TS-NN` — сценарий из приложения Б
 * docs/rules.md, `EDGE-NN` — краевой случай сверх спецификации.
 * Тест «кейсов не меньше 30» делает требование acceptance машинно-проверяемым.
 */
import { describe, it, expect } from 'vitest';
import type { Card, Suit } from '../cards.js';
import { parseCard, parseCards } from '../cards.js';
import { MIZER, parseContract } from '../contract.js';
import type { PlayerId } from '../deal.js';
import { createPlay, legalMoveIds, trickWinner } from '../play.js';

interface LegalMovesCase {
  readonly id: string;
  readonly title: string;
  /** `MIZER`, `RASPASY` либо ContractId. */
  readonly contract: string;
  /** Карта, задавшая масть хода (для распасов — вскрытая карта прикупа); `null` — свой заход. */
  readonly led: string | null;
  readonly hand: string[];
  readonly expected: string[];
}

const LEGAL_MOVES_CASES: readonly LegalMovesCase[] = [
  {
    id: 'TS-13',
    title: 'обязан в масть; бить старшей не обязан',
    contract: '7H',
    led: 'KS',
    hand: ['AS', '9S', '7H'],
    expected: ['9S', 'AS'],
  },
  {
    id: 'TS-14',
    title: 'масти нет — обязан козырять',
    contract: '7H',
    led: 'KS',
    hand: ['8H', '9H', 'AD'],
    expected: ['8H', '9H'],
  },
  {
    id: 'TS-15',
    title: 'ни масти, ни козыря — снос',
    contract: '7H',
    led: 'KS',
    hand: ['AD', 'TD', '9C'],
    expected: ['9C', 'AD', 'TD'],
  },
  {
    id: 'TS-16',
    title: 'бескозырный: ветка козыря не срабатывает',
    contract: '8NT',
    led: 'KS',
    hand: ['AD', '7H', '9C'],
    expected: ['7H', '9C', 'AD'],
  },
  {
    id: 'TS-17',
    title: 'мизер: козыря нет, снос свободный',
    contract: 'MIZER',
    led: '9D',
    hand: ['AS', 'KC', 'TH', '7S'],
    expected: ['7S', 'AS', 'KC', 'TH'],
  },
  {
    id: 'EDGE-01',
    title: 'свой заход ничем не ограничен',
    contract: '7H',
    led: null,
    hand: ['AS', '7H', 'TD'],
    expected: ['7H', 'AS', 'TD'],
  },
  {
    id: 'EDGE-02',
    title: 'последняя карта в руке всегда легальна',
    contract: '6D',
    led: 'KS',
    hand: ['7C'],
    expected: ['7C'],
  },
  {
    id: 'EDGE-03',
    title: 'мизер: масть хода обязательна, если она есть',
    contract: 'MIZER',
    led: '9D',
    hand: ['AD', '7D', 'KS'],
    expected: ['7D', 'AD'],
  },
  {
    id: 'EDGE-04',
    title: 'козырять обязан даже заведомо младшим козырем',
    contract: '6S',
    led: 'AH',
    hand: ['7S', 'KD', 'QC'],
    expected: ['7S'],
  },
  {
    id: 'EDGE-05',
    title: 'масть хода приоритетнее козыря',
    contract: '6S',
    led: 'AH',
    hand: ['7S', '9H', 'QC'],
    expected: ['9H'],
  },
  {
    id: 'EDGE-06',
    title: 'вся рука в масть хода — легальна целиком',
    contract: '9C',
    led: '8H',
    hand: ['7H', 'TH', 'AH'],
    expected: ['7H', 'AH', 'TH'],
  },
  {
    id: 'EDGE-07',
    title: 'вся рука козырная при отсутствии масти — легальна целиком',
    contract: '9C',
    led: '8H',
    hand: ['7C', 'TC', 'AC'],
    expected: ['7C', 'AC', 'TC'],
  },
  {
    id: 'EDGE-08',
    title: 'ход козырем: обязан отвечать козырем (козырь = масть хода)',
    contract: '8D',
    led: 'KD',
    hand: ['7D', 'AS', 'AH'],
    expected: ['7D'],
  },
  {
    id: 'EDGE-09',
    title: 'бескозырный: обязанность в масть сохраняется',
    contract: '10NT',
    led: '7C',
    hand: ['AC', 'KS', 'QH'],
    expected: ['AC'],
  },
  {
    id: 'EDGE-10',
    title: 'мизер: свой заход любой картой',
    contract: 'MIZER',
    led: null,
    hand: ['AS', '7D', 'KH'],
    expected: ['7D', 'AS', 'KH'],
  },
  {
    id: 'EDGE-11',
    title: 'распасы: масть задаёт карта прикупа',
    contract: 'RASPASY',
    led: '9S',
    hand: ['AS', '7S', 'KD'],
    expected: ['7S', 'AS'],
  },
  {
    id: 'EDGE-12',
    title: 'распасы: козыря нет — снос любой картой',
    contract: 'RASPASY',
    led: '9S',
    hand: ['AD', 'KC', 'TH'],
    expected: ['AD', 'KC', 'TH'],
  },
  {
    id: 'EDGE-13',
    title: 'десятерная козырная: снос при отсутствии масти и козыря',
    contract: '10H',
    led: 'KS',
    hand: ['7C', '8C', '9D'],
    expected: ['7C', '8C', '9D'],
  },
  {
    id: 'EDGE-14',
    title: 'одна карта масти хода при полной руке — единственный легальный ход',
    contract: '6C',
    led: 'AD',
    hand: ['7D', '8C', '9C', 'TC', 'JH', 'QH', 'KH', 'AS', 'KS', 'QS'],
    expected: ['7D'],
  },
];

interface TrickWinnerCase {
  readonly id: string;
  readonly title: string;
  readonly trump: Suit | null;
  readonly ledOverride?: Suit;
  readonly plays: [PlayerId, string][];
  readonly expected: PlayerId | null;
}

const TRICK_WINNER_CASES: readonly TrickWinnerCase[] = [
  {
    id: 'TS-18',
    title: 'козырь бьёт любую некозырную',
    trump: 'D',
    plays: [[0, 'KS'], [1, 'AS'], [2, '7D']],
    expected: 2,
  },
  {
    id: 'TS-19',
    title: 'старший козырь бьёт младший',
    trump: 'D',
    plays: [[0, 'KS'], [1, '7D'], [2, '9D']],
    expected: 2,
  },
  {
    id: 'TS-20',
    title: 'снос не в масть и не козырь во взятии не участвует',
    trump: null,
    plays: [[0, '9H'], [1, 'AS'], [2, 'KH']],
    expected: 2,
  },
  {
    id: 'EDGE-20',
    title: 'без козыря выигрывает старшая масти хода',
    trump: null,
    plays: [[0, 'TS'], [1, 'JS'], [2, '9S']],
    expected: 1,
  },
  {
    id: 'EDGE-21',
    title: 'туз масти хода при неотыгранном козыре',
    trump: 'H',
    plays: [[0, '7C'], [1, 'AC'], [2, 'KC']],
    expected: 1,
  },
  {
    id: 'EDGE-22',
    title: 'мизер: козыря нет, решает масть хода',
    trump: null,
    plays: [[0, '8D'], [1, 'AS'], [2, 'AH']],
    expected: 0,
  },
  {
    id: 'EDGE-23',
    title: 'ход козырем: старший козырь среди всех',
    trump: 'S',
    plays: [[0, '9S'], [1, 'KS'], [2, 'AS']],
    expected: 2,
  },
  {
    id: 'EDGE-24',
    title: 'единственный козырь от третьего игрока забирает взятку',
    trump: 'C',
    plays: [[0, 'AH'], [1, 'KH'], [2, '7C']],
    expected: 2,
  },
  {
    id: 'EDGE-25',
    title: 'оба соперника снесли — выигрывает ходивший',
    trump: null,
    plays: [[0, 'QD'], [1, 'AS'], [2, 'KH']],
    expected: 0,
  },
  {
    id: 'EDGE-26',
    title: 'семёрка козыря бьёт туза масти хода',
    trump: 'C',
    plays: [[0, 'AD'], [1, '7C'], [2, 'KD']],
    expected: 1,
  },
  {
    id: 'EDGE-27',
    title: 'два козыря от соперников: выигрывает старший',
    trump: 'H',
    plays: [[0, 'AS'], [1, 'TH'], [2, 'JH']],
    expected: 2,
  },
  {
    id: 'EDGE-28',
    title: 'распасы: явная масть прикупа определяет победителя',
    trump: null,
    ledOverride: 'S',
    plays: [[0, 'AH'], [1, '8S'], [2, 'KH']],
    expected: 1,
  },
  {
    id: 'EDGE-29',
    title: 'распасы: масть прикупа не положил никто — победителя нет',
    trump: null,
    ledOverride: 'C',
    plays: [[0, 'AH'], [1, '8D'], [2, 'KH']],
    expected: null,
  },
  {
    id: 'EDGE-30',
    title: 'семёрка масти хода выигрывает, если больше никто не в масть',
    trump: 'D',
    plays: [[0, '7S'], [1, 'AC'], [2, 'AH']],
    expected: 0,
  },
  {
    id: 'EDGE-31',
    title: 'старшинство внутри масти: K < A',
    trump: null,
    plays: [[0, 'QH'], [1, 'KH'], [2, 'AH']],
    expected: 2,
  },
  {
    id: 'EDGE-32',
    title: 'десятка ниже валета (T < J)',
    trump: null,
    plays: [[0, '9C'], [1, 'TC'], [2, 'JC']],
    expected: 2,
  },
];

function buildState(testCase: LegalMovesCase) {
  const hand = parseCards(testCase.hand);
  if (testCase.contract === 'RASPASY') {
    const widowTop = parseCard(testCase.led as string);
    return createPlay({
      mode: { kind: 'raspasy', widow: [widowTop, parseCard('TH')] as [Card, Card] },
      dealer: 2,
      hands: { 0: hand, 1: [], 2: [] },
    });
  }
  const contract = testCase.contract === 'MIZER' ? MIZER : parseContract(testCase.contract);
  if (testCase.led === null) {
    return createPlay({
      mode: { kind: 'contract', contract, declarer: 1 },
      dealer: 2,
      hands: { 0: [], 1: hand, 2: [] },
      leader: 1,
    });
  }
  return createPlay({
    mode: { kind: 'contract', contract, declarer: 0 },
    dealer: 2,
    hands: { 0: [], 1: hand, 2: [] },
    leader: 0,
    currentTrick: [{ player: 0 as PlayerId, card: parseCard(testCase.led) }],
  });
}

describe('acceptance: табличные кейсы legalMoves', () => {
  it.each(LEGAL_MOVES_CASES.map((c) => [`${c.id}: ${c.title}`, c] as const))(
    '%s',
    (_label, testCase) => {
      const state = buildState(testCase);
      expect(legalMoveIds(state).sort()).toEqual([...testCase.expected].sort());
    },
  );
});

describe('acceptance: табличные кейсы trickWinner', () => {
  it.each(TRICK_WINNER_CASES.map((c) => [`${c.id}: ${c.title}`, c] as const))(
    '%s',
    (_label, testCase) => {
      const plays = testCase.plays.map(([player, id]) => ({ player, card: parseCard(id) }));
      expect(trickWinner(plays, testCase.trump, testCase.ledOverride)).toBe(testCase.expected);
    },
  );
});

describe('acceptance: объём покрытия', () => {
  it('кейсов legalMoves/trickWinner не меньше 30 (требование acceptance)', () => {
    const total = LEGAL_MOVES_CASES.length + TRICK_WINNER_CASES.length;
    expect(total).toBeGreaterThanOrEqual(30);
  });

  it('идентификаторы кейсов уникальны', () => {
    const ids = [...LEGAL_MOVES_CASES, ...TRICK_WINNER_CASES].map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('нормативные сценарии TS-13..TS-20 покрыты', () => {
    const ids = new Set([...LEGAL_MOVES_CASES, ...TRICK_WINNER_CASES].map((c) => c.id));
    for (const ts of ['TS-13', 'TS-14', 'TS-15', 'TS-16', 'TS-17', 'TS-18', 'TS-19', 'TS-20']) {
      expect(ids).toContain(ts);
    }
  });
});
