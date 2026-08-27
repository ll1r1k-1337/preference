/**
 * Общий каркас матча ботов: полный цикл раздачи и сведение результата
 * к очкам через настоящий модуль `scoring`.
 *
 * Используется приёмочными тестами (fuzz, матч уровней, бенчмарк) —
 * поэтому живёт в исходниках, а не в тестах.
 */
import type { PlayerId } from '../core/index.js';
import { PLAYERS } from '../core/index.js';
import { createDeal, dispatch } from '../engine/index.js';
import type { Command, DealState, DealOutcome } from '../engine/index.js';
import { scoreDeal, applyScore, createScoreboard, finalize } from '../scoring/index.js';
import type { Scoreboard } from '../scoring/index.js';
import type { Bot } from './bot.js';

export interface DealRunResult {
  readonly state: DealState;
  readonly outcome: DealOutcome;
  /** Все команды раздачи — след для отладки фуззера. */
  readonly commands: readonly Command[];
  /** Сколько решений приняли боты (для бенчмарка «время на ход»). */
  readonly decisions: number;
}

/** Максимум команд на раздачу: страховка от зацикливания. */
const COMMAND_LIMIT = 200;

/**
 * Проиграть одну раздачу тремя ботами до фазы RESULT.
 * Любой отказ движка — баг бота, поэтому он превращается в исключение.
 */
export function playDeal(input: {
  readonly bots: Readonly<Record<PlayerId, Bot>>;
  readonly seed: string | number;
  readonly dealer: PlayerId;
  readonly consecutiveRaspasy?: number;
}): DealRunResult {
  let state = createDeal({
    seed: input.seed,
    dealer: input.dealer,
    consecutiveRaspasy: input.consecutiveRaspasy ?? 0,
  });
  const commands: Command[] = [];
  let decisions = 0;

  while (state.phase !== 'RESULT') {
    if (commands.length > COMMAND_LIMIT) {
      throw new Error(`Раздача ${input.seed} не сходится: больше ${COMMAND_LIMIT} команд`);
    }
    // Команду шлёт тот, чей ход; при висте всветлую это может быть не владелец карт (§5.2).
    const actor = state.toAct ?? state.dealer;
    const command = input.bots[actor].decide(state);
    decisions += 1;
    commands.push(command);

    const result = dispatch(state, command);
    if (!result.ok) {
      throw new Error(
        `Бот игрока ${actor} прислал недопустимую команду в фазе ${state.phase}: ` +
          `[${result.error.code}] ${result.error.message} — ${JSON.stringify(command)}`,
      );
    }
    state = result.state;
  }

  if (state.outcome === null) {
    throw new Error(`Раздача ${input.seed} закончилась без DealOutcome`);
  }

  return { state, outcome: state.outcome, commands, decisions };
}

/** Ключи движка (0|1|2) → строковые ключи модуля расчёта. */
function toStringKeys<T>(record: Readonly<Record<PlayerId, T>>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).map(([k, v]) => [String(k), v]));
}

/** Привести `DealOutcome` движка к форме, которую принимает `scoreDeal`. */
export function adaptOutcome(outcome: DealOutcome): Parameters<typeof scoreDeal>[0] {
  if (outcome.kind === 'miser') {
    return { ...outcome, declarer: String(outcome.declarer) };
  }
  if (outcome.kind === 'raspasy') {
    return { ...outcome, tricks: toStringKeys(outcome.tricks) };
  }
  return {
    ...outcome,
    contract: outcome.contract as Exclude<typeof outcome.contract, 'MIZER'>,
    declarer: String(outcome.declarer),
    tricks: toStringKeys(outcome.tricks),
    whisted: toStringKeys(outcome.whisted),
  };
}

export interface MatchResult {
  /** Итоговая роспись пули (§9.9): сумма всегда ноль. */
  readonly totals: Record<string, number>;
  readonly board: Scoreboard;
  readonly deals: number;
  readonly decisions: number;
  /** Сколько раздач закончилось распасами. */
  readonly raspasy: number;
}

/**
 * Сыграть матч из нескольких раздач одними и теми же ботами.
 * Сдающий вращается (§2.2), счётчик распасов ведётся по §8.4.
 */
export function playMatch(input: {
  readonly bots: Readonly<Record<PlayerId, Bot>>;
  readonly deals: number;
  readonly seedPrefix: string;
}): MatchResult {
  const players = PLAYERS.map(String);
  let board = createScoreboard(players);
  let dealer: PlayerId = 0;
  let consecutiveRaspasy = 0;
  let decisions = 0;
  let raspasy = 0;

  for (let i = 0; i < input.deals; i += 1) {
    const run = playDeal({
      bots: input.bots,
      seed: `${input.seedPrefix}-${i}`,
      dealer,
      consecutiveRaspasy,
    });
    decisions += run.decisions;

    board = applyScore(board, scoreDeal(adaptOutcome(run.outcome), { players }));

    if (run.outcome.kind === 'raspasy') {
      raspasy += 1;
      consecutiveRaspasy += 1;
    } else {
      // §8.4: счётчик сбрасывается после любой сыгранной раздачи.
      consecutiveRaspasy = 0;
    }
    dealer = ((dealer + 1) % 3) as PlayerId;
  }

  return { totals: finalize(board), board, deals: input.deals, decisions, raspasy };
}
