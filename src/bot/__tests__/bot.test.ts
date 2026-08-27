/**
 * Бот как функция `(DealState) -> Command`: полный цикл раздачи на всех фазах.
 * Источник истины: docs/rules.md §3–§8; API движка — src/engine/README.md.
 */
import { describe, expect, it } from 'vitest';
import { cardId, rankOrder } from '../../core/index.js';
import { createDeal, dispatch, expectOk } from '../../engine/index.js';
import type { DealState } from '../../engine/index.js';
import { createBot, goalFor, hiddenCardsFor } from '../bot.js';
import type { BotLevel } from '../bot.js';

/** Проиграть раздачу тремя ботами до фазы RESULT; вернуть финальное состояние. */
function playDeal(level: BotLevel, seed: string, dealer: 0 | 1 | 2 = 0): DealState {
  const bots = [0, 1, 2].map((seat) => createBot({ level, seat: seat as 0 | 1 | 2, seed: `${seed}-${seat}` }));
  let state = createDeal({ seed, dealer });
  let guard = 0;

  while (state.phase !== 'RESULT') {
    if (guard++ > 200) throw new Error('Раздача не сходится: больше 200 команд');
    const actor = state.toAct ?? state.dealer;
    const command = bots[actor]!.decide(state);
    // Отказ движка = баг бота: он обязан выбирать только из легальных множеств.
    state = expectOk(dispatch(state, command)).state;
  }
  return state;
}

describe('createBot — бот доигрывает раздачу до конца на каждом уровне', () => {
  for (const level of ['easy', 'normal', 'hard'] as const) {
    it(`${level}: раздача доходит до RESULT и даёт outcome`, () => {
      const state = playDeal(level, `bot-${level}-1`);
      expect(state.phase).toBe('RESULT');
      expect(state.outcome).not.toBeNull();
    });
  }

  it('сумма взяток в сыгранной раздаче равна 10 (§6.4)', () => {
    const state = playDeal('normal', 'bot-tricks-1');
    if (state.play !== null) {
      const total = state.play.tricksWon[0] + state.play.tricksWon[1] + state.play.tricksWon[2];
      expect(total).toBe(10);
    }
  });

  it('детерминирован: тот же seed даёт ту же раздачу', () => {
    const a = playDeal('hard', 'bot-determinism');
    const b = playDeal('hard', 'bot-determinism');
    expect(JSON.stringify(a.outcome)).toBe(JSON.stringify(b.outcome));
  });

  it('easy играет случайно, но всегда легально: два seed дают разные раздачи', () => {
    const seeds = ['easy-a', 'easy-b', 'easy-c', 'easy-d'];
    const outcomes = seeds.map((s) => JSON.stringify(playDeal('easy', s).outcome));
    expect(new Set(outcomes).size).toBeGreaterThan(1);
  });
});

describe('createBot — команды соответствуют фазе', () => {
  it('в фазе DEAL сдающий открывает торговлю', () => {
    const state = createDeal({ seed: 'phase-deal', dealer: 1 });
    const bot = createBot({ level: 'normal', seat: 1, seed: 'x' });
    expect(bot.decide(state)).toEqual({ type: 'START_BIDDING', player: 1 });
  });

  it('в фазе BIDDING заявка всегда из legalBids (§3.3)', () => {
    let state = createDeal({ seed: 'phase-bid', dealer: 0 });
    state = expectOk(dispatch(state, { type: 'START_BIDDING', player: 0 })).state;
    const actor = state.toAct!;
    const command = createBot({ level: 'normal', seat: actor, seed: 'x' }).decide(state);
    if (command.type === 'BID') {
      expect(state.bidding!.legalBids).toContain(command.contract);
    } else {
      expect(['PASS', 'HERE']).toContain(command.type);
    }
  });

  it('в фазе PLAY карта всегда из legalMoves (§6.2)', () => {
    let state = createDeal({ seed: 'phase-play', dealer: 0 });
    const bots = [0, 1, 2].map((s) => createBot({ level: 'normal', seat: s as 0 | 1 | 2, seed: 'p' }));
    let guard = 0;
    while (state.phase !== 'PLAY' && state.phase !== 'RESULT') {
      if (guard++ > 100) throw new Error('не дошли до PLAY');
      state = expectOk(dispatch(state, bots[state.toAct ?? state.dealer]!.decide(state))).state;
    }
    if (state.phase === 'PLAY') {
      const command = bots[state.toAct!]!.decide(state);
      expect(command.type).toBe('PLAY_CARD');
      if (command.type === 'PLAY_CARD') expect(state.legalMoves).toContain(command.card);
    }
  });

  it('бот-вистующий на светлой игре ходит и за пасовавшего (ловушка §5.2)', () => {
    // Прогон многих seed: хотя бы в одном возникает вист всветлую.
    let sawLight = false;
    for (let i = 0; i < 30 && !sawLight; i += 1) {
      const state = playDeal('normal', `light-${i}`);
      if (state.defenseMode === 'light' && state.play !== null) sawLight = true;
    }
    expect(sawLight).toBe(true);
  });

  it('регрессия: hard доигрывает мизер, где прикуп ушёл в руку игрока (§4.2)', () => {
    // Seed bench-5: оборона видит прикуп «в лицо», но не знает, какие две карты
    // мизерист снёс, — местонахождение этих карт неизвестно, и поиск обязан
    // раздавать их как скрытые, а не считать «вышедшими».
    const state = playDeal('hard', 'bench-5', 2);
    expect(state.phase).toBe('RESULT');
    expect(state.outcome?.kind).toBe('miser');
  });

  it('второй вистующий не просит «всветлую»: партнёр уже вистовал (ловушка §5.2)', () => {
    // Ответ первого соперника лежит в state.whist.decisions, а state.whisted
    // движок заполняет ТОЛЬКО после закрытия опроса. Бот, читающий whisted,
    // считает партнёра пасовавшим и получает ILLEGAL_WHIST.
    let state = createDeal({ seed: 'whist-light-trap', dealer: 0 });
    const bots = [0, 1, 2].map((s) => createBot({ level: 'normal', seat: s as 0 | 1 | 2, seed: 'w' }));
    let guard = 0;
    let checked = false;

    for (let seed = 0; seed < 40 && !checked; seed += 1) {
      state = createDeal({ seed: `whist-light-trap-${seed}`, dealer: (seed % 3) as 0 | 1 | 2 });
      guard = 0;
      while (state.phase !== 'RESULT') {
        if (guard++ > 200) throw new Error('раздача не сходится');
        const actor = state.toAct ?? state.dealer;
        const command = bots[actor]!.decide(state);

        // Ключевая проверка: второй отвечающий при вистующем партнёре
        // обязан просить вист БЕЗ режима (§5.2).
        if (state.phase === 'WHIST_DECLARATION' && command.type === 'WHIST') {
          const partnerWhisted = ([0, 1, 2] as const).some(
            (p) => p !== actor && state.whist?.decisions[p]?.whisted === true,
          );
          if (partnerWhisted) {
            expect(command.mode).toBeUndefined();
            checked = true;
          }
        }

        const result = dispatch(state, command);
        expect(result.ok).toBe(true);
        state = expectOk(result).state;
      }
    }

    expect(checked).toBe(true);
  });

  it('на распасах бот играет НА СБРОС: заход мелочью, а не старшей картой (§8.1)', () => {
    // Цель раздачи меняет выбор карты. Если бот на распасах играет «на взятие»,
    // он заходит стоппером — это видно по первой карте первой взятки.
    let leadsLow = 0;
    let leadsChecked = 0;

    for (let seed = 0; seed < 60 && leadsChecked < 5; seed += 1) {
      let state = createDeal({ seed: `raspasy-goal-${seed}`, dealer: (seed % 3) as 0 | 1 | 2 });
      const bots = [0, 1, 2].map((s) => createBot({ level: 'normal', seat: s as 0 | 1 | 2, seed: 'r' }));
      let guard = 0;
      let inspected = false;

      while (state.phase !== 'RESULT') {
        if (guard++ > 200) throw new Error('раздача не сходится');
        const actor = state.toAct ?? state.dealer;
        const command = bots[actor]!.decide(state);

        // Распасы: первый ход первой взятки при пустом столе.
        if (
          !inspected &&
          state.contract === null &&
          state.phase === 'PLAY' &&
          state.play?.currentTrick.length === 0 &&
          state.play.completedTricks.length === 0 &&
          command.type === 'PLAY_CARD'
        ) {
          const hand = state.play.hands[state.play.toPlay];
          const chosen = hand.find((c) => cardId(c) === command.card)!;
          const ledSuit = state.play.revealedWidowCard?.suit ?? chosen.suit;
          const sameSuit = hand.filter((c) => c.suit === ledSuit);
          const isLowest = sameSuit.every((c) => rankOrder(c.rank) >= rankOrder(chosen.rank));
          if (isLowest) leadsLow += 1;
          leadsChecked += 1;
          inspected = true;
        }

        state = expectOk(dispatch(state, command)).state;
      }
    }

    expect(leadsChecked).toBeGreaterThan(0);
    // Игра «на сброс» обязана давать мелкий заход в каждой проверенной раздаче.
    expect(leadsLow).toBe(leadsChecked);
  });

  it('против мизера оборона не перебивает мизериста, когда взятка уже его (§7)', () => {
    let checked = 0;
    let respected = 0;

    for (let seed = 0; seed < 200 && checked < 3; seed += 1) {
      let state = createDeal({ seed: `mizer-goal-${seed}`, dealer: (seed % 3) as 0 | 1 | 2 });
      const bots = [0, 1, 2].map((s) => createBot({ level: 'normal', seat: s as 0 | 1 | 2, seed: 'm' }));
      let guard = 0;

      while (state.phase !== 'RESULT') {
        if (guard++ > 200) throw new Error('раздача не сходится');
        const actor = state.toAct ?? state.dealer;
        const command = bots[actor]!.decide(state);

        // Мизер, ходит оборона, мизерист уже положил карту и лидирует во взятке.
        const play = state.play;
        if (
          state.contract === 'MIZER' &&
          state.phase === 'PLAY' &&
          command.type === 'PLAY_CARD' &&
          play !== null &&
          play.toPlay !== state.declarer &&
          play.currentTrick.length > 0
        ) {
          const trick = play.currentTrick;
          const led = trick[0]!.card.suit;
          const inSuit = trick.filter((p) => p.card.suit === led);
          const best = inSuit.reduce((a, b) => (rankOrder(a.card.rank) >= rankOrder(b.card.rank) ? a : b));
          if (best.player === state.declarer) {
            // Карты берутся из руки ВЛАДЕЛЬЦА (play.toPlay), а не ходящего (§5.2).
            const hand = play.hands[play.toPlay];
            const chosen = hand.find((c) => cardId(c) === command.card)!;
            const beatsMizerist =
              chosen.suit === led && rankOrder(chosen.rank) > rankOrder(best.card.rank);
            // Перебить можно только вынужденно: когда все легальные ходы бьют.
            const forced = state.legalMoves.every((id) => {
              const card = hand.find((c) => cardId(c) === id)!;
              return card.suit === led && rankOrder(card.rank) > rankOrder(best.card.rank);
            });
            if (!beatsMizerist || forced) respected += 1;
            checked += 1;
          }
        }

        state = expectOk(dispatch(state, command)).state;
      }
    }

    expect(checked).toBeGreaterThan(0);
    // Взятка мизериста снимается только вынужденно — по легальности хода.
    expect(respected).toBe(checked);
  });

  it('бот не подглядывает в чужой снос: карты сноса остаются в пуле неизвестных (§4.2)', () => {
    // Снос игрока секретен. Для ОБОРОНЫ его карты обязаны считаться
    // неизвестными и сэмплироваться, а для самого игрока — нет.
    let checked = 0;

    for (let seed = 0; seed < 40 && checked < 3; seed += 1) {
      let state = createDeal({ seed: `peek-${seed}`, dealer: (seed % 3) as 0 | 1 | 2 });
      const bots = [0, 1, 2].map((s) => createBot({ level: 'normal', seat: s as 0 | 1 | 2, seed: 'peek' }));
      let guard = 0;
      let doneHere = false;

      while (state.phase !== 'RESULT') {
        if (guard++ > 200) throw new Error('раздача не сходится');
        const actor = state.toAct ?? state.dealer;

        if (!doneHere && state.phase === 'PLAY' && state.declarer !== null && state.discard.length === 2) {
          const declarer = state.declarer;
          const defender = ([0, 1, 2] as const).find((p) => p !== declarer)!;

          const hiddenForDefender = hiddenCardsFor(state, defender);
          for (const id of state.discard) {
            expect(hiddenForDefender).toContain(id);
          }
          // Сам разыгрывающий свой снос знает — он вне пула.
          const hiddenForDeclarer = hiddenCardsFor(state, declarer);
          for (const id of state.discard) {
            expect(hiddenForDeclarer).not.toContain(id);
          }
          checked += 1;
          doneHere = true;
        }

        state = expectOk(dispatch(state, bots[actor]!.decide(state))).state;
      }
    }

    expect(checked).toBeGreaterThan(0);
  });

  it('цели раздачи заданы правилами: мизер, распасы и игра на взятки (§7, §8.1)', () => {
    // goalFor — нормативная развилка: она решает, чем занят каждый игрок.
    const base = createDeal({ seed: 'goal-map', dealer: 0 });

    const raspasy = { ...base, contract: null, declarer: null } as DealState;
    for (const p of [0, 1, 2] as const) expect(goalFor(raspasy, p)).toBe('avoid');

    const mizer = { ...base, contract: 'MIZER', declarer: 1 } as DealState;
    expect(goalFor(mizer, 1)).toBe('avoid'); // мизерист не берёт взяток (§7 п.1)
    expect(goalFor(mizer, 0)).toBe('catch'); // оборона ловит мизериста (§7 п.6)
    expect(goalFor(mizer, 2)).toBe('catch');

    const tricks = { ...base, contract: '6S', declarer: 2 } as DealState;
    for (const p of [0, 1, 2] as const) expect(goalFor(tricks, p)).toBe('win');
  });
});
