/**
 * Приёмочные тесты бота (критерии задачи t_7ea02876):
 *  1. бот никогда не делает нелегальный ход — fuzz на 1000 раздачах;
 *  2. hard выигрывает у easy минимум в 70% из 200 раздач;
 *  3. средний ход выбирается быстрее 500 мс.
 *
 * Бюджет симуляций в фуззе снижен намеренно: легальность хода от него не
 * зависит вовсе (`searchMove` выбирает из `legalMoves` ядра при любом числе
 * сэмплов), а полный бюджет проверяется отдельным прогоном на 60 раздачах
 * и приёмками 2–3. Без этого 1000 раздач заняли бы ~9 минут на прогон.
 */
import { describe, expect, it } from 'vitest';
import type { PlayerId } from '../../core/index.js';
import { createBot, DEFAULT_SIMULATIONS } from '../bot.js';
import type { Bot, BotLevel } from '../bot.js';
import { playDeal, playMatch } from '../match.js';

/** Стол из трёх ботов заданных уровней. */
function table(
  levels: readonly [BotLevel, BotLevel, BotLevel],
  seed: string,
  simulations = DEFAULT_SIMULATIONS,
): Record<PlayerId, Bot> {
  return {
    0: createBot({ level: levels[0], seat: 0, seed: `${seed}-0`, simulations }),
    1: createBot({ level: levels[1], seat: 1, seed: `${seed}-1`, simulations }),
    2: createBot({ level: levels[2], seat: 2, seed: `${seed}-2`, simulations }),
  };
}

/** Отдать управление event loop: иначе воркер vitest не успевает слать отчёты. */
async function yieldToLoop(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

/** Прогнать `count` раздач смешанными столами; вернуть распределение исходов. */
async function fuzz(count: number, simulations: number, tag: string): Promise<Record<string, number>> {
  const levels: readonly BotLevel[] = ['easy', 'normal', 'hard'];
  const kinds: Record<string, number> = { contract: 0, miser: 0, raspasy: 0 };

  for (let i = 0; i < count; i += 1) {
    // Уровни перемешиваются по кругу: за столом встречаются разные боты.
    const mix: [BotLevel, BotLevel, BotLevel] = [
      levels[i % 3] as BotLevel,
      levels[(i + 1) % 3] as BotLevel,
      levels[(i + 2) % 3] as BotLevel,
    ];
    const run = playDeal({
      bots: table(mix, `${tag}-${i}`, simulations),
      seed: `${tag}-deal-${i}`,
      dealer: (i % 3) as PlayerId,
      consecutiveRaspasy: i % 4,
    });

    expect(run.state.phase).toBe('RESULT');
    kinds[run.outcome.kind] = (kinds[run.outcome.kind] ?? 0) + 1;

    // §6.4: сыгранная раздача — ровно 10 взяток; «на своих» розыгрыша нет.
    if (run.state.play !== null) {
      const total =
        run.state.play.tricksWon[0] + run.state.play.tricksWon[1] + run.state.play.tricksWon[2];
      expect(total).toBe(10);
    }

    if (i % 20 === 19) await yieldToLoop();
  }
  return kinds;
}

describe('Приёмка 1: бот никогда не делает нелегальный ход', () => {
  it('1000 раздач на всех уровнях доходят до RESULT без единого отказа движка', async () => {
    const kinds = await fuzz(1000, 6, 'fuzz');
    const played = kinds.contract! + kinds.miser! + kinds.raspasy!;
    // eslint-disable-next-line no-console
    console.log(`fuzz 1000: ${JSON.stringify(kinds)}`);

    expect(played).toBe(1000);
    // Фуззер обязан задевать все три ветки исхода, иначе покрытие фиктивно.
    expect(kinds.contract).toBeGreaterThan(0);
    expect(kinds.raspasy).toBeGreaterThan(0);
    expect(kinds.miser).toBeGreaterThan(0);
  }, 600_000);

  it('60 раздач с полным боевым бюджетом симуляций — тоже без отказов', async () => {
    const kinds = await fuzz(60, DEFAULT_SIMULATIONS, 'fuzz-full');
    expect(kinds.contract! + kinds.miser! + kinds.raspasy!).toBe(60);
  }, 600_000);
});

describe('Приёмка 2: hard сильнее easy', () => {
  it('hard выигрывает минимум в 70% из 200 раздач', async () => {
    // Один hard против двух easy: у hard одно место из трёх, поэтому
    // «выигрыш» — положительный итог по росписи пули (§9.9) в матче раздач.
    const DEALS = 200;
    const BATCH = 4; // матч из 4 раздач: полная ротация сдающего + распасы
    let hardWins = 0;
    let matches = 0;

    for (let i = 0; i < DEALS / BATCH; i += 1) {
      const bots = table(['hard', 'easy', 'easy'], `match-${i}`);
      const result = playMatch({ bots, deals: BATCH, seedPrefix: `strength-${i}` });
      // Сумма росписи всегда ноль (§9.9) — проверяем инвариант заодно.
      const sum = Object.values(result.totals).reduce((s, v) => s + v, 0);
      expect(sum).toBe(0);

      if ((result.totals['0'] ?? 0) > 0) hardWins += 1;
      matches += 1;
      await yieldToLoop();
    }

    const winRate = hardWins / matches;
    // eslint-disable-next-line no-console
    console.log(`hard против easy: ${hardWins}/${matches} матчей (${(winRate * 100).toFixed(1)}%)`);
    expect(winRate).toBeGreaterThanOrEqual(0.7);
  }, 600_000);

  it('normal тоже сильнее easy — уровни упорядочены по силе', async () => {
    let normalWins = 0;
    const MATCHES = 15;
    for (let i = 0; i < MATCHES; i += 1) {
      const bots = table(['normal', 'easy', 'easy'], `nm-${i}`);
      const result = playMatch({ bots, deals: 4, seedPrefix: `nm-strength-${i}` });
      if ((result.totals['0'] ?? 0) > 0) normalWins += 1;
      await yieldToLoop();
    }
    // eslint-disable-next-line no-console
    console.log(`normal против easy: ${normalWins}/${MATCHES} матчей`);
    expect(normalWins / MATCHES).toBeGreaterThanOrEqual(0.7);
  }, 600_000);
});

describe('Приёмка 3: средний ход выбирается быстрее 500 мс', () => {
  it('hard принимает решение в среднем много быстрее лимита', async () => {
    const bots = table(['hard', 'hard', 'hard'], 'bench');
    const started = Date.now();
    let decisions = 0;

    for (let i = 0; i < 10; i += 1) {
      const run = playDeal({ bots, seed: `bench-${i}`, dealer: (i % 3) as PlayerId });
      decisions += run.decisions;
      await yieldToLoop();
    }

    const perDecision = (Date.now() - started) / decisions;
    // eslint-disable-next-line no-console
    console.log(`hard: ${decisions} решений, ${perDecision.toFixed(1)} мс на ход`);
    expect(perDecision).toBeLessThan(500);
  }, 600_000);
});
