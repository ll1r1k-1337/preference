import { describe, it, expect } from 'vitest';
import type { Card } from '../cards.js';
import { cardIds, parseCard, parseCards } from '../cards.js';
import { MIZER, parseContract } from '../contract.js';
import { applyMove, createPlay, isTerminal, legalMoves } from '../play.js';
import { deserializePlayState, fromJson, serializePlayState, toJson } from '../serialize.js';

const contractGame = () =>
  createPlay({
    mode: { kind: 'contract', contract: parseContract('7H'), declarer: 1 },
    dealer: 0,
    hands: {
      0: parseCards(['AS', 'KS', '7H']),
      1: parseCards(['9S', '8S', '8H']),
      2: parseCards(['QS', 'JS', '9H']),
    },
    leader: 1,
  });

const raspasyGame = () =>
  createPlay({
    mode: { kind: 'raspasy', widow: parseCards(['9S', 'TH']) as [Card, Card] },
    dealer: 2,
    hands: {
      0: parseCards(['AS', 'KH']),
      1: parseCards(['7S', 'AH']),
      2: parseCards(['8S', '9H']),
    },
  });

describe('serialize: формат снимка', () => {
  it('снимок содержит только простые JSON-значения', () => {
    const snapshot = serializePlayState(contractGame());
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  });

  it('карты сериализуются как CardId в канонической сортировке', () => {
    const snapshot = serializePlayState(contractGame());
    expect(snapshot.hands[0]).toEqual(['KS', 'AS', '7H']);
    expect(snapshot.mode).toEqual({ kind: 'contract', contract: '7H', declarer: 1 });
    expect(snapshot.version).toBe(1);
  });

  it('мизер сериализуется идентификатором MIZER', () => {
    const state = createPlay({
      mode: { kind: 'contract', contract: MIZER, declarer: 2 },
      dealer: 0,
      hands: { 0: parseCards(['AS']), 1: parseCards(['KS']), 2: parseCards(['QS']) },
    });
    expect(serializePlayState(state).mode).toEqual({
      kind: 'contract',
      contract: 'MIZER',
      declarer: 2,
    });
  });

  it('распасы сериализуют прикуп', () => {
    expect(serializePlayState(raspasyGame()).mode).toEqual({
      kind: 'raspasy',
      widow: ['9S', 'TH'],
    });
  });
});

describe('serialize: round-trip', () => {
  it('состояние контракта переживает round-trip без потерь', () => {
    const state = contractGame();
    const restored = deserializePlayState(serializePlayState(state));
    expect(serializePlayState(restored)).toEqual(serializePlayState(state));
    expect(restored.toPlay).toBe(state.toPlay);
    expect(restored.leader).toBe(state.leader);
    expect(cardIds(restored.hands[0])).toEqual(cardIds(state.hands[0]));
  });

  it('незавершённая взятка восстанавливается вместе с очередью хода', () => {
    let state = contractGame();
    state = applyMove(state, parseCard('8H'));
    state = applyMove(state, parseCard('9H'));
    const restored = deserializePlayState(serializePlayState(state));
    expect(restored.currentTrick).toHaveLength(2);
    expect(restored.toPlay).toBe(state.toPlay);
    expect(cardIds(restored.currentTrick.map((p) => p.card))).toEqual(['8H', '9H']);
    expect(restored.currentTrick.map((p) => p.player)).toEqual([1, 2]);
  });

  it('завершённые взятки и счёт восстанавливаются', () => {
    let state = contractGame();
    state = applyMove(state, parseCard('8H'));
    state = applyMove(state, parseCard('9H'));
    state = applyMove(state, parseCard('7H'));
    const restored = deserializePlayState(serializePlayState(state));
    expect(restored.completedTricks).toHaveLength(1);
    expect(restored.completedTricks[0]!.winner).toBe(state.completedTricks[0]!.winner);
    expect(restored.tricksWon).toEqual(state.tricksWon);
    expect(restored.leader).toBe(state.leader);
  });

  it('распасы: вскрытая карта прикупа восстанавливается', () => {
    const state = raspasyGame();
    const restored = deserializePlayState(serializePlayState(state));
    expect(restored.revealedWidowCard && cardIds([restored.revealedWidowCard])).toEqual(['9S']);
    expect(restored.leader).toBe(0);
  });

  it('после round-trip розыгрыш продолжается идентично', () => {
    let a = contractGame();
    let b = deserializePlayState(serializePlayState(a));
    while (!isTerminal(a)) {
      const move = legalMoves(a)[0]!;
      a = applyMove(a, move);
      b = applyMove(b, move);
    }
    expect(isTerminal(b)).toBe(true);
    expect(b.tricksWon).toEqual(a.tricksWon);
    expect(serializePlayState(b)).toEqual(serializePlayState(a));
  });

  it('toJson/fromJson работают со строкой', () => {
    const state = contractGame();
    const json = toJson(state);
    expect(typeof json).toBe('string');
    expect(serializePlayState(fromJson(json))).toEqual(serializePlayState(state));
  });
});

describe('serialize: валидация входа', () => {
  it('неизвестная версия отвергается', () => {
    const snapshot = { ...serializePlayState(contractGame()), version: 99 };
    expect(() => deserializePlayState(snapshot as never)).toThrow(/верси/i);
  });

  it('битый JSON отвергается с внятной ошибкой', () => {
    expect(() => fromJson('{не json')).toThrow(/JSON/i);
  });

  it('некорректный CardId внутри снимка отвергается', () => {
    const snapshot = serializePlayState(contractGame());
    const broken = { ...snapshot, hands: { ...snapshot.hands, 0: ['ZZ'] } };
    expect(() => deserializePlayState(broken as never)).toThrow(/CardId/);
  });

  it('некорректный контракт внутри снимка отвергается', () => {
    const snapshot = serializePlayState(contractGame());
    const broken = { ...snapshot, mode: { kind: 'contract', contract: '5S', declarer: 0 } };
    expect(() => deserializePlayState(broken as never)).toThrow(/контракт/i);
  });
});
