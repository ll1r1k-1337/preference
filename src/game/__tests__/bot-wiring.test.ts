/**
 * Приёмка склейки UI и настоящего бота (`src/bot`).
 *
 * До интеграции слой партии ходил заглушкой `src/game/bot.ts` с собственной
 * эвристикой `handStrength`. Эти тесты фиксируют, что заглушки больше нет:
 * решения приходят из настоящего бота, уровень сложности реально доезжает до
 * него, а нелегальный ход невозможен на всём пути UI -> сессия -> движок.
 */
import { describe, expect, it } from 'vitest';
import { chooseBid } from '../../bot/bidding.js';
import { createBot } from '../../bot/index.js';
import { createDeal, dispatch, type Command, type DealState } from '../../engine/index.js';
import type { PlayerId } from '../../core/index.js';
import { decide, DEFAULT_BOT_LEVEL, parseBotLevel, resetBots } from '../bot.js';
import { settle, step } from '../flow.js';
import {
  buildSheet,
  createParty,
  loadParty,
  saveParty,
} from '../party.js';
import {
  botStep,
  finishDeal,
  HUMAN,
  newSession,
  waitingForHuman,
  type Session,
} from '../session.js';

/** Довести раздачу до первой фазы, где ход за указанным местом. */
function advanceTo(state: DealState, phase: DealState['phase']): DealState {
  let current = settle(state).state;
  for (let guard = 0; guard < 200; guard += 1) {
    if (current.phase === phase) return current;
    if (current.phase === 'RESULT') throw new Error(`фаза ${phase} не встретилась`);
    const seat = current.toAct;
    if (seat === null) throw new Error(`ход ни за кем в фазе ${current.phase}`);
    const command = decide(current, seat, { level: 'normal', seed: 'advance' });
    if (command === null) throw new Error(`бот не сходил в фазе ${current.phase}`);
    const result = step(current, command);
    if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
    current = result.state;
  }
  throw new Error('слишком много шагов');
}

/** Прогнать раздачу целиком, собирая все команды ботов. */
function runDeal(state: DealState, level: 'easy' | 'normal' | 'hard', seed: string): Command[] {
  let current = settle(state).state;
  const commands: Command[] = [];
  for (let guard = 0; guard < 500; guard += 1) {
    if (current.phase === 'RESULT') return commands;
    const seat = current.toAct;
    if (seat === null) throw new Error(`ход ни за кем в фазе ${current.phase}`);
    const command = decide(current, seat, { level, seed });
    if (command === null) throw new Error(`бот не сходил в фазе ${current.phase}`);
    commands.push(command);
    const result = step(current, command);
    // Отказ движка здесь — это и есть регрессия склейки, ради которой тест написан.
    if (!result.ok) {
      throw new Error(`${result.error.code}: ${result.error.message} — ${JSON.stringify(command)}`);
    }
    current = result.state;
  }
  throw new Error('раздача не завершилась за 500 шагов');
}

describe('слой партии ходит настоящим ботом, а не заглушкой', () => {
  it('заявка в торговле совпадает с chooseBid из src/bot', () => {
    // Заглушка выбирала «первый не-мизер из legalBids при handStrength >= 15».
    // Настоящий бот считает ожидаемые взятки — числа расходятся, и тест это ловит.
    let checked = 0;
    for (let i = 0; i < 40 && checked < 12; i += 1) {
      const state = settle(createDeal({ seed: `wiring-bid-${i}`, dealer: 0 })).state;
      if (state.phase !== 'BIDDING') continue;
      const seat = state.toAct;
      if (seat === null) continue;

      const command = decide(state, seat, { level: 'normal', seed: `wiring-bid-${i}` });
      const expected = chooseBid({
        hand: state.hands[seat],
        legalBids: state.bidding?.legalBids ?? [],
      });

      if (expected === null) {
        expect(command).toEqual({ type: 'PASS', player: seat });
      } else {
        expect(command).toEqual({ type: 'BID', player: seat, contract: expected });
      }
      checked += 1;
    }
    expect(checked).toBeGreaterThanOrEqual(12);
  });

  it('решение делегируется тому же экземпляру, что даёт createBot с тем же seed', () => {
    resetBots();
    const state = settle(createDeal({ seed: 'wiring-delegate', dealer: 0 })).state;
    const seat = state.toAct as PlayerId;

    const viaLayer = decide(state, seat, { level: 'normal', seed: 'party-x' });
    const direct = createBot({ level: 'normal', seat, seed: `party-x#bot${seat}` }).decide(state);

    expect(viaLayer).toEqual(direct);
  });

  it('снос делает две карты, а не «две младшие» заглушки', () => {
    // seed подобран scripts/find-discard-seed.ts: раздача доходит до сноса,
    // а не уходит в распасы (иначе фазы DISCARD в ней просто нет).
    const seed = 'wiring-discard-8';
    const state = advanceTo(createDeal({ seed, dealer: 0 }), 'DISCARD');
    const seat = state.toAct as PlayerId;
    const command = decide(state, seat, { level: 'normal', seed });

    expect(command?.type).toBe('DISCARD');
    const cards = (command as Extract<Command, { type: 'DISCARD' }>).cards;
    expect(cards).toHaveLength(2);
    expect(new Set(cards).size).toBe(2);
    // Снесённые карты обязаны быть из руки: движок иначе ответит ILLEGAL_DISCARD.
    const hand = new Set(state.hands[seat].map((c) => `${c.rank}${c.suit}`));
    for (const id of cards) expect(hand.has(id)).toBe(true);
  });

  it('уровень доезжает до бота: easy и hard играют раздачу по-разному', () => {
    resetBots();
    const deal = createDeal({ seed: 'wiring-levels', dealer: 0 });
    const easy = runDeal(deal, 'easy', 'lvl');
    resetBots();
    const hard = runDeal(deal, 'hard', 'lvl');

    expect(easy.length).toBeGreaterThan(0);
    expect(hard.length).toBeGreaterThan(0);
    expect(easy).not.toEqual(hard);
  });

  it('на 30 раздачах движок не отклонил ни одной команды бота', () => {
    for (let i = 0; i < 30; i += 1) {
      resetBots();
      const commands = runDeal(
        createDeal({ seed: `wiring-fuzz-${i}`, dealer: (i % 3) as PlayerId }),
        'normal',
        `fuzz-${i}`,
      );
      expect(commands.length).toBeGreaterThan(0);
    }
  });

  it('decide молчит, когда ходить не боту', () => {
    const state = settle(createDeal({ seed: 'wiring-null', dealer: 1 })).state;
    const seat = state.toAct as PlayerId;
    const other = ((seat + 1) % 3) as PlayerId;
    expect(decide(state, other, { level: 'normal', seed: 'n' })).toBeNull();
  });

  it('в фазе RESULT бот не ходит, а не бросает исключение', () => {
    let current = settle(createDeal({ seed: 'wiring-result', dealer: 0 })).state;
    for (let guard = 0; guard < 500 && current.phase !== 'RESULT'; guard += 1) {
      const seat = current.toAct as PlayerId;
      const result = dispatch(current, decide(current, seat, { level: 'normal', seed: 'r' })!);
      if (!result.ok) throw new Error(result.error.message);
      current = settle(result.state).state;
    }
    expect(current.phase).toBe('RESULT');
    expect(decide(current, 0, { level: 'normal', seed: 'r' })).toBeNull();
  });
});

describe('уровень бота — параметр партии', () => {
  it('парсер уровня чинит мусор и пустоту дефолтом', () => {
    expect(parseBotLevel('hard')).toBe('hard');
    expect(parseBotLevel('easy')).toBe('easy');
    expect(parseBotLevel('нет такого')).toBe(DEFAULT_BOT_LEVEL);
    expect(parseBotLevel(null)).toBe(DEFAULT_BOT_LEVEL);
    expect(parseBotLevel(undefined)).toBe(DEFAULT_BOT_LEVEL);
  });

  it('уровень переживает сохранение партии', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    } as unknown as Storage;

    saveParty(createParty({ seed: 'lvl-save', botLevel: 'hard' }), storage);
    expect(loadParty(storage)?.botLevel).toBe('hard');
  });

  it('старое сохранение без botLevel читается и лечится дефолтом', () => {
    const legacy = { ...createParty({ seed: 'legacy' }) } as Record<string, unknown>;
    delete legacy['botLevel'];
    const storage = {
      getItem: () => JSON.stringify(legacy),
      setItem: () => {},
      removeItem: () => {},
    } as unknown as Storage;

    const loaded = loadParty(storage);
    expect(loaded).not.toBeNull();
    expect(loaded?.botLevel).toBe(DEFAULT_BOT_LEVEL);
  });
});

describe('сессия: человек пасует, боты доигрывают пулю настоящим ботом', () => {
  it('пуля закрывается, лист сходится, итог нулевой (§9.9)', () => {
    resetBots();
    // poolTarget=4 — короткая пуля, чтобы тест был быстрым, но полным.
    let session: Session = newSession({ seed: 'session-real-bot', poolTarget: 4, botLevel: 'normal' });

    let botMoves = 0;
    let humanMoves = 0;

    for (let guard = 0; guard < 4000 && !session.closed; guard += 1) {
      const deal = session.deal;
      if (deal === null) break;

      if (deal.phase === 'RESULT') {
        session = finishDeal(session);
        continue;
      }

      if (waitingForHuman(session)) {
        // Человек играет пассивно, но строго легально: команду берём из движка.
        session = playHumanMinimally(session);
        humanMoves += 1;
        continue;
      }

      const next = botStep(session);
      // Отказ движка приходит в notice — значит бот прислал нелегальную команду.
      expect(next.notice).toBeNull();
      if (next === session) break;
      session = next;
      botMoves += 1;
    }

    expect(session.closed).toBe(true);
    // Тест обязан быть непустым: пуля должна набраться настоящими ходами,
    // а не «закрыться» на пустой партии из-за ошибки в условии цикла.
    expect(botMoves).toBeGreaterThan(100);
    expect(humanMoves).toBeGreaterThan(10);
    expect(session.party.deals.length).toBeGreaterThanOrEqual(3);
    const sheet = buildSheet(session.party);
    expect(sheet.rows.length).toBeGreaterThanOrEqual(3);
    expect(sheet.final).not.toBeNull();
    expect(sheet.final!.reduce((a, b) => a + b, 0)).toBe(0);
    // Пуля и гора неотрицательны в каждой строке (§А.3 п.2).
    for (const row of sheet.rows) {
      expect(row.pool.every((v) => v >= 0)).toBe(true);
      expect(row.mountain.every((v) => v >= 0)).toBe(true);
    }
  });
});

/** Минимальный легальный ход человека: пас/первая легальная карта. */
function playHumanMinimally(session: Session): Session {
  const deal = session.deal!;
  const applyHuman = (command: Command): Session => {
    const result = step(deal, command);
    if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
    return { ...session, deal: result.state };
  };

  switch (deal.phase) {
    case 'BIDDING':
      return applyHuman({ type: 'PASS', player: HUMAN });
    case 'WHIST_DECLARATION':
      return applyHuman({ type: 'PASS_WHIST', player: HUMAN });
    case 'WIDOW_PICKUP':
      return applyHuman({ type: 'TAKE_WIDOW', player: HUMAN });
    case 'DISCARD': {
      const ids = deal.hands[HUMAN].map((c) => `${c.rank}${c.suit}`);
      return applyHuman({ type: 'DISCARD', player: HUMAN, cards: [ids[0]!, ids[1]!] });
    }
    case 'FINAL_CONTRACT':
      return applyHuman({
        type: 'DECLARE_CONTRACT',
        player: HUMAN,
        contract: deal.legalContracts[0]!,
      });
    case 'PLAY':
      return applyHuman({ type: 'PLAY_CARD', player: HUMAN, card: deal.legalMoves[0]! });
    default:
      throw new Error(`человеку нечего делать в фазе ${deal.phase}`);
  }
}
