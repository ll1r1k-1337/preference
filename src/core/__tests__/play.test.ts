import { describe, it, expect } from 'vitest';
import type { Card } from '../cards.js';
import { cardIds, parseCard, parseCards } from '../cards.js';
import { MIZER, parseContract } from '../contract.js';
import type { PlayerId } from '../deal.js';
import {
  applyMove,
  createPlay,
  currentLedSuit,
  currentTrickNumber,
  currentTrumpSuit,
  isTerminal,
  legalMoves,
  legalMoveIds,
  trickWinner,
} from '../play.js';

/** Позиция «контракт X, ход сделан лидером, ходит игрок P с рукой H». */
function contractPosition(params: {
  contract: string | typeof MIZER;
  hand: string[];
  lead?: string;
  otherHands?: Partial<Record<PlayerId, string[]>>;
}) {
  const contract = typeof params.contract === 'string' ? parseContract(params.contract) : MIZER;
  const leaderCards = params.lead ? [params.lead] : [];
  return createPlay({
    mode: { kind: 'contract', contract, declarer: 0 },
    dealer: 2,
    hands: {
      0: parseCards(params.otherHands?.[0] ?? []),
      1: parseCards(params.hand),
      2: parseCards(params.otherHands?.[2] ?? []),
    },
    leader: 0,
    currentTrick: leaderCards.map((id) => ({ player: 0 as PlayerId, card: parseCard(id) })),
  });
}

const ids = (cards: readonly Card[]): string[] => cardIds(cards);

describe('legalMoves: обязанность ходить в масть (§6.2)', () => {
  it('TS-13: обязан в масть, но бить старшей не обязан (mustOvertake = off)', () => {
    const state = contractPosition({ contract: '7H', lead: 'KS', hand: ['AS', '9S', '7H'] });
    expect(legalMoveIds(state).sort()).toEqual(['9S', 'AS']);
  });

  it('TS-14: масти хода нет — обязан козырять', () => {
    const state = contractPosition({ contract: '7H', lead: 'KS', hand: ['8H', '9H', 'AD'] });
    expect(legalMoveIds(state).sort()).toEqual(['8H', '9H']);
  });

  it('TS-15: ни масти хода, ни козыря — снос любой картой', () => {
    const state = contractPosition({ contract: '7H', lead: 'KS', hand: ['AD', 'TD', '9C'] });
    expect(legalMoveIds(state).sort()).toEqual(['9C', 'AD', 'TD']);
  });

  it('TS-16: на бескозырном контракте ветка «обязан козырять» не срабатывает', () => {
    const state = contractPosition({ contract: '8NT', lead: 'KS', hand: ['AD', '7H', '9C'] });
    expect(legalMoveIds(state).sort()).toEqual(['7H', '9C', 'AD']);
  });

  it('TS-17: на мизере козыря нет — снос свободный', () => {
    const state = contractPosition({
      contract: MIZER,
      lead: '9D',
      hand: ['AS', 'KC', 'TH', '7S'],
    });
    expect(legalMoveIds(state).sort()).toEqual(['7S', 'AS', 'KC', 'TH']);
  });

  it('первый ход во взятке ничем не ограничен, в том числе козырем', () => {
    const first = createPlay({
      mode: { kind: 'contract', contract: parseContract('7H'), declarer: 1 },
      dealer: 2,
      hands: { 0: [], 1: parseCards(['AS', '7H', 'TD']), 2: [] },
      leader: 1,
    });
    expect(first.toPlay).toBe(1);
    expect(currentLedSuit(first)).toBeNull();
    expect(legalMoveIds(first).sort()).toEqual(['7H', 'AS', 'TD']);
  });

  it('единственная карта в руке всегда легальна (последняя карта)', () => {
    const state = contractPosition({ contract: '6D', lead: 'KS', hand: ['7C'] });
    expect(legalMoveIds(state)).toEqual(['7C']);
  });

  it('на мизере при наличии масти хода обязанность в масть сохраняется', () => {
    const state = contractPosition({ contract: MIZER, lead: '9D', hand: ['AD', '7D', 'KS'] });
    expect(legalMoveIds(state).sort()).toEqual(['7D', 'AD']);
  });

  it('козыряние обязательно даже если козырь заведомо младше', () => {
    const state = contractPosition({ contract: '6S', lead: 'AH', hand: ['7S', 'KD', 'QC'] });
    expect(legalMoveIds(state)).toEqual(['7S']);
  });

  it('масть хода приоритетнее козыря: козырь не обязателен при наличии масти', () => {
    const state = contractPosition({ contract: '6S', lead: 'AH', hand: ['7S', '9H', 'QC'] });
    expect(legalMoveIds(state)).toEqual(['9H']);
  });

  it('вся рука одной масти хода — все карты легальны', () => {
    const state = contractPosition({ contract: '9C', lead: '8H', hand: ['7H', 'TH', 'AH'] });
    expect(legalMoveIds(state).sort()).toEqual(['7H', 'AH', 'TH']);
  });

  it('вся рука козырная при отсутствии масти хода — все карты легальны', () => {
    const state = contractPosition({ contract: '9C', lead: '8H', hand: ['7C', 'TC', 'AC'] });
    expect(legalMoveIds(state).sort()).toEqual(['7C', 'AC', 'TC']);
  });

  it('третий игрок во взятке подчиняется той же масти хода', () => {
    const state = createPlay({
      mode: { kind: 'contract', contract: parseContract('7D'), declarer: 0 },
      dealer: 2,
      hands: { 0: [], 1: [], 2: parseCards(['9S', 'AD', 'KC']) },
      leader: 0,
      currentTrick: [
        { player: 0, card: parseCard('KS') },
        { player: 1, card: parseCard('7S') },
      ],
    });
    expect(state.toPlay).toBe(2);
    expect(legalMoveIds(state)).toEqual(['9S']);
  });

  it('масть хода задаёт первая карта взятки, а не старшая', () => {
    const state = createPlay({
      mode: { kind: 'contract', contract: parseContract('6H'), declarer: 0 },
      dealer: 2,
      hands: { 0: [], 1: [], 2: parseCards(['7C', 'AH']) },
      leader: 0,
      currentTrick: [
        { player: 0, card: parseCard('7C') },
        { player: 1, card: parseCard('AH') },
      ],
    });
    expect(currentLedSuit(state)).toBe('C');
    expect(legalMoveIds(state)).toEqual(['7C']);
  });
});

describe('legalMoves: распасы (§8.2)', () => {
  const raspasyState = (hand: string[], widow: [string, string], trick: [PlayerId, string][] = []) =>
    createPlay({
      mode: { kind: 'raspasy', widow: parseCards(widow) as [Card, Card] },
      dealer: 2,
      hands: { 0: parseCards(hand), 1: [], 2: [] },
      currentTrick: trick.map(([p, id]) => ({ player: p, card: parseCard(id) })),
    });

  it('вскрытая карта прикупа задаёт масть хода для первой взятки', () => {
    const state = raspasyState(['AS', '7S', 'KD'], ['9S', 'TH']);
    expect(currentLedSuit(state)).toBe('S');
    expect(legalMoveIds(state).sort()).toEqual(['7S', 'AS']);
  });

  it('козыря на распасах нет: без масти хода — снос любой картой', () => {
    const state = raspasyState(['AD', 'KC', 'TH'], ['9S', 'TH']);
    expect(currentTrumpSuit(state)).toBeNull();
    expect(legalMoveIds(state).sort()).toEqual(['AD', 'KC', 'TH']);
  });

  it('первая рука ходит первой, даже она обязана следовать масти прикупа', () => {
    const state = raspasyState(['AS', 'KD'], ['9S', 'TH']);
    expect(state.toPlay).toBe(0);
    expect(legalMoveIds(state)).toEqual(['AS']);
  });
});

describe('trickWinner (§6.3)', () => {
  const trick = (plays: [PlayerId, string][]) =>
    plays.map(([player, id]) => ({ player, card: parseCard(id) }));

  it('TS-18: козырь бьёт любую некозырную', () => {
    const t = trick([[0, 'KS'], [1, 'AS'], [2, '7D']]);
    expect(trickWinner(t, 'D')).toBe(2);
  });

  it('TS-19: среди козырей выигрывает старший козырь', () => {
    const t = trick([[0, 'KS'], [1, '7D'], [2, '9D']]);
    expect(trickWinner(t, 'D')).toBe(2);
  });

  it('TS-20: карта не в масть и не козырь во взятии не участвует', () => {
    const t = trick([[0, '9H'], [1, 'AS'], [2, 'KH']]);
    expect(trickWinner(t, null)).toBe(2);
  });

  it('без козыря выигрывает старшая карта масти хода', () => {
    const t = trick([[0, 'TS'], [1, 'JS'], [2, '9S']]);
    expect(trickWinner(t, null)).toBe(1);
  });

  it('туз масти хода выигрывает, если козырей нет', () => {
    const t = trick([[0, '7C'], [1, 'AC'], [2, 'KC']]);
    expect(trickWinner(t, 'H')).toBe(1);
  });

  it('на мизере козыря нет — работает только масть хода', () => {
    const t = trick([[0, '8D'], [1, 'AS'], [2, 'AH']]);
    expect(trickWinner(t, null)).toBe(0);
  });

  it('ход козырем: старший козырь среди всех', () => {
    const t = trick([[0, '9S'], [1, 'KS'], [2, 'AS']]);
    expect(trickWinner(t, 'S')).toBe(2);
  });

  it('единственный козырь от третьего игрока забирает взятку', () => {
    const t = trick([[0, 'AH'], [1, 'KH'], [2, '7C']]);
    expect(trickWinner(t, 'C')).toBe(2);
  });

  it('оба сноса не в масть — выигрывает ходивший', () => {
    const t = trick([[0, 'QD'], [1, 'AS'], [2, 'KH']]);
    expect(trickWinner(t, null)).toBe(0);
  });

  it('явно заданная масть хода перекрывает первую карту (распасы с прикупом)', () => {
    const t = trick([[0, 'AH'], [1, '8S'], [2, 'KH']]);
    expect(trickWinner(t, null, 'S')).toBe(1);
  });

  it('никто не в масть хода при явной масти — победителя нет', () => {
    const t = trick([[0, 'AH'], [1, '8D'], [2, 'KH']]);
    expect(trickWinner(t, null, 'C')).toBeNull();
  });

  it('пустая взятка — победителя нет', () => {
    expect(trickWinner([], 'S')).toBeNull();
  });
});

describe('applyMove и завершение раздачи', () => {
  const threeCardGame = () =>
    createPlay({
      mode: { kind: 'contract', contract: parseContract('6D'), declarer: 0 },
      dealer: 2,
      hands: {
        0: parseCards(['AS', 'KS', '7D']),
        1: parseCards(['9S', '8S', 'TD']),
        2: parseCards(['QS', 'JS', '9D']),
      },
      leader: 0,
    });

  it('applyMove не мутирует исходное состояние', () => {
    const state = threeCardGame();
    const before = ids(state.hands[0]);
    const next = applyMove(state, parseCard('AS'));
    expect(ids(state.hands[0])).toEqual(before);
    expect(ids(next.hands[0])).toEqual(['KS', '7D']);
    expect(next).not.toBe(state);
  });

  it('applyMove отвергает нелегальный ход с внятной ошибкой', () => {
    const state = applyMove(threeCardGame(), parseCard('AS'));
    expect(() => applyMove(state, parseCard('TD'))).toThrow(/нелегальный ход|недопустим/i);
  });

  it('applyMove отвергает карту, которой нет в руке', () => {
    expect(() => applyMove(threeCardGame(), parseCard('7H'))).toThrow(/нет в руке|недопустим/i);
  });

  it('после трёх ходов взятка закрывается и лидером становится победитель', () => {
    let state = threeCardGame();
    state = applyMove(state, parseCard('KS'));
    state = applyMove(state, parseCard('9S'));
    state = applyMove(state, parseCard('QS'));
    expect(state.completedTricks).toHaveLength(1);
    expect(state.completedTricks[0]!.winner).toBe(0);
    expect(state.tricksWon[0]).toBe(1);
    expect(state.leader).toBe(0);
    expect(state.toPlay).toBe(0);
    expect(state.currentTrick).toHaveLength(0);
    expect(currentTrickNumber(state)).toBe(2);
  });

  it('козырная взятка достаётся козырю, ход переходит к нему', () => {
    // Игрок 2 без пик, но с козырными бубнами — обязан козырять и забирает взятку.
    let state = createPlay({
      mode: { kind: 'contract', contract: parseContract('6D'), declarer: 0 },
      dealer: 2,
      hands: {
        0: parseCards(['AS', 'KS', '7C']),
        1: parseCards(['9S', '8S', 'TC']),
        2: parseCards(['9D', 'JD', 'QD']),
      },
      leader: 0,
    });
    state = applyMove(state, parseCard('AS'));
    state = applyMove(state, parseCard('9S'));
    expect(legalMoveIds(state).sort()).toEqual(['9D', 'JD', 'QD']);
    state = applyMove(state, parseCard('9D'));
    expect(state.completedTricks[0]!.winner).toBe(2);
    expect(state.tricksWon[2]).toBe(1);
    expect(state.toPlay).toBe(2);
  });

  it('TS-21: после последней взятки isTerminal = true, сумма взяток равна их числу', () => {
    let state = threeCardGame();
    const order = ['AS', '9S', 'QS', 'KS', '8S', 'JS', '7D', 'TD', '9D'];
    for (const id of order) {
      state = applyMove(state, parseCard(id));
    }
    expect(isTerminal(state)).toBe(true);
    expect(state.hands[0]).toHaveLength(0);
    const total = state.tricksWon[0] + state.tricksWon[1] + state.tricksWon[2];
    expect(total).toBe(3);
    expect(legalMoves(state)).toEqual([]);
    expect(() => applyMove(state, parseCard('AS'))).toThrow(/окончен|завершен/i);
  });

  it('isTerminal = false, пока есть карты', () => {
    expect(isTerminal(threeCardGame())).toBe(false);
  });

  it('полная раздача из 10 взяток даёт сумму взяток 10', () => {
    let state = createPlay({
      mode: { kind: 'contract', contract: parseContract('7NT'), declarer: 0 },
      dealer: 2,
      hands: {
        0: parseCards(['7S', '8S', '9S', 'TS', 'JS', 'QS', 'KS', 'AS', '7C', '8C']),
        1: parseCards(['9C', 'TC', 'JC', 'QC', 'KC', 'AC', '7D', '8D', '9D', 'TD']),
        2: parseCards(['JD', 'QD', 'KD', 'AD', '7H', '8H', '9H', 'TH', 'JH', 'QH']),
      },
      leader: 0,
    });
    let guard = 0;
    while (!isTerminal(state) && guard < 40) {
      state = applyMove(state, legalMoves(state)[0]!);
      guard += 1;
    }
    expect(isTerminal(state)).toBe(true);
    expect(state.completedTricks).toHaveLength(10);
    expect(state.tricksWon[0] + state.tricksWon[1] + state.tricksWon[2]).toBe(10);
  });
});

describe('распасы: порядок хода взяток (§8.2)', () => {
  const raspasy = () =>
    createPlay({
      mode: { kind: 'raspasy', widow: parseCards(['9S', 'TH']) as [Card, Card] },
      dealer: 2, // первая рука = 0
      hands: {
        0: parseCards(['AS', 'KH', '7D']),
        1: parseCards(['7S', 'AH', '8D']),
        2: parseCards(['8S', '9H', '9D']),
      },
    });

  it('первая взятка: масть задана верхней картой прикупа, ходит первая рука', () => {
    const state = raspasy();
    expect(state.leader).toBe(0);
    expect(state.toPlay).toBe(0);
    expect(currentLedSuit(state)).toBe('S');
    expect(state.revealedWidowCard && cardIds([state.revealedWidowCard])).toEqual(['9S']);
  });

  it('карта прикупа взятки не берёт: старшую пику кладёт игрок 0', () => {
    let state = raspasy();
    state = applyMove(state, parseCard('AS'));
    state = applyMove(state, parseCard('7S'));
    state = applyMove(state, parseCard('8S'));
    expect(state.completedTricks[0]!.winner).toBe(0);
    expect(state.completedTricks[0]!.widowCard).not.toBeNull();
  });

  it('вторая взятка тоже начинается с первой руки и вскрывает вторую карту прикупа', () => {
    let state = raspasy();
    state = applyMove(state, parseCard('AS'));
    state = applyMove(state, parseCard('7S'));
    state = applyMove(state, parseCard('8S')); // взятку взял игрок 0
    expect(state.leader).toBe(0);
    expect(currentLedSuit(state)).toBe('H');
    expect(state.revealedWidowCard && cardIds([state.revealedWidowCard])).toEqual(['TH']);
  });

  it('третьей взяткой ходит первая рука независимо от победителя второй', () => {
    let state = raspasy();
    for (const id of ['AS', '7S', '8S']) state = applyMove(state, parseCard(id));
    for (const id of ['KH', 'AH', '9H']) state = applyMove(state, parseCard(id));
    expect(state.completedTricks[1]!.winner).toBe(1); // вторую взял игрок 1
    expect(state.leader).toBe(0); // но третьей ходит первая рука
    expect(state.revealedWidowCard).toBeNull();
    expect(currentLedSuit(state)).toBeNull();
  });

  it('если масть прикупа не положил никто, взятку берёт ходивший первым', () => {
    let state = createPlay({
      mode: { kind: 'raspasy', widow: parseCards(['9C', 'TH']) as [Card, Card] },
      dealer: 2,
      hands: {
        0: parseCards(['AS', 'KH']),
        1: parseCards(['7S', 'AH']),
        2: parseCards(['8S', '9H']),
      },
    });
    state = applyMove(state, parseCard('AS'));
    state = applyMove(state, parseCard('7S'));
    state = applyMove(state, parseCard('8S'));
    expect(state.completedTricks[0]!.winner).toBe(0);
    expect(state.tricksWon[0]).toBe(1);
  });

  it('с четвёртой взятки ходит взявший предыдущую', () => {
    let state = createPlay({
      mode: { kind: 'raspasy', widow: parseCards(['9S', 'TH']) as [Card, Card] },
      dealer: 2,
      hands: {
        0: parseCards(['AS', 'KH', '7D', '8C']),
        1: parseCards(['7S', 'AH', '8D', '9C']),
        2: parseCards(['8S', '9H', '9D', 'TC']),
      },
    });
    for (const id of ['AS', '7S', '8S']) state = applyMove(state, parseCard(id));
    for (const id of ['KH', 'AH', '9H']) state = applyMove(state, parseCard(id));
    for (const id of ['7D', '8D', '9D']) state = applyMove(state, parseCard(id));
    expect(state.completedTricks[2]!.winner).toBe(2);
    expect(state.leader).toBe(2);
    expect(state.toPlay).toBe(2);
  });
});

describe('createPlay: валидация и стартовые значения', () => {
  it('дубли карт между руками отвергаются', () => {
    expect(() =>
      createPlay({
        mode: { kind: 'contract', contract: parseContract('6S'), declarer: 0 },
        dealer: 2,
        hands: { 0: parseCards(['AS']), 1: parseCards(['AS']), 2: [] },
        leader: 0,
      }),
    ).toThrow(/дубл/i);
  });

  it('по умолчанию первый ход у разыгрывающего (§2.4)', () => {
    const state = createPlay({
      mode: { kind: 'contract', contract: parseContract('8H'), declarer: 2 },
      dealer: 0,
      hands: { 0: parseCards(['AS']), 1: parseCards(['KS']), 2: parseCards(['QS']) },
    });
    expect(state.leader).toBe(2);
    expect(state.toPlay).toBe(2);
  });

  it('на мизере первый ход у мизериста', () => {
    const state = createPlay({
      mode: { kind: 'contract', contract: MIZER, declarer: 1 },
      dealer: 0,
      hands: { 0: parseCards(['AS']), 1: parseCards(['KS']), 2: parseCards(['QS']) },
    });
    expect(state.toPlay).toBe(1);
    expect(currentTrumpSuit(state)).toBeNull();
  });

  it('на распасах первый ход у первой руки', () => {
    const state = createPlay({
      mode: { kind: 'raspasy', widow: parseCards(['9S', 'TH']) as [Card, Card] },
      dealer: 1,
      hands: { 0: parseCards(['AS']), 1: parseCards(['KS']), 2: parseCards(['QS']) },
    });
    expect(state.leader).toBe(2);
    expect(state.toPlay).toBe(2);
  });

  it('козырь контракта доступен через currentTrumpSuit', () => {
    const state = createPlay({
      mode: { kind: 'contract', contract: parseContract('9D'), declarer: 0 },
      dealer: 2,
      hands: { 0: parseCards(['AS']), 1: parseCards(['KS']), 2: parseCards(['QS']) },
    });
    expect(currentTrumpSuit(state)).toBe('D');
  });

  it('бескозырный контракт даёт trump = null', () => {
    const state = createPlay({
      mode: { kind: 'contract', contract: parseContract('9NT'), declarer: 0 },
      dealer: 2,
      hands: { 0: parseCards(['AS']), 1: parseCards(['KS']), 2: parseCards(['QS']) },
    });
    expect(currentTrumpSuit(state)).toBeNull();
  });
});
