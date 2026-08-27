/**
 * Адаптер бота-соперника для слоя партии: (DealState, seat) -> Command | null.
 *
 * Игровой логики здесь НЕТ. Настоящий бот живёт в `src/bot` (оценка руки,
 * торговля, снос, вист, эвристики розыгрыша и Monte-Carlo поиск); этот модуль
 * лишь держит по экземпляру бота на место за столом и сводит его строгий
 * контракт `decide(state) -> Command` к тому, что удобно UI:
 *
 *  - `null` вместо исключения, когда ходить некому (фаза RESULT, чужой ход);
 *  - служебные фазы DEAL/PASSOUT отдаются `flow.settle`, а не боту.
 *
 * Единственное состояние бота — его ГПСЧ, поэтому экземпляры кэшируются по
 * ключу «seed партии + место + уровень»: при одном seed партия воспроизводима.
 */
import type { PlayerId } from '../core/index.js';
import { createBot, type Bot, type BotLevel } from '../bot/index.js';
import type { Command, DealState } from '../engine/index.js';

export type { BotLevel } from '../bot/index.js';

/**
 * Уровень по умолчанию для UI. `hard` (Monte-Carlo) сильнее, но тратит до
 * полусекунды на ход — за живой игрой это заметно, поэтому включается явно.
 */
export const DEFAULT_BOT_LEVEL: BotLevel = 'normal';

/** Подписи уровней для интерфейса. */
export const BOT_LEVEL_LABELS: Readonly<Record<BotLevel, string>> = Object.freeze({
  easy: 'Лёгкий',
  normal: 'Обычный',
  hard: 'Сильный',
});

export const BOT_LEVELS: readonly BotLevel[] = Object.freeze(['easy', 'normal', 'hard']);

/** Уровень из произвольной строки (localStorage, `<select>`); мусор -> дефолт. */
export function parseBotLevel(value: string | null | undefined): BotLevel {
  return BOT_LEVELS.includes(value as BotLevel) ? (value as BotLevel) : DEFAULT_BOT_LEVEL;
}

export interface BotContext {
  readonly level?: BotLevel;
  /** Seed партии: при одном seed решения ботов воспроизводимы. */
  readonly seed?: string;
}

/**
 * Кэш экземпляров: бот хранит ГПСЧ, и пересоздавать его на каждый ход —
 * значит каждый раз стартовать случайность заново.
 */
const bots = new Map<string, Bot>();

function botFor(seat: PlayerId, context: BotContext): Bot {
  const level = context.level ?? DEFAULT_BOT_LEVEL;
  const seed = context.seed ?? 'default';
  const key = `${seed}|${seat}|${level}`;
  let bot = bots.get(key);
  if (bot === undefined) {
    bot = createBot({ level, seat, seed: `${seed}#bot${seat}` });
    bots.set(key, bot);
  }
  return bot;
}

/** Сбросить кэш ботов (новая партия — новая случайность). */
export function resetBots(): void {
  bots.clear();
}

/**
 * Решение бота для текущего состояния. `null`, если ходить не боту —
 * вызывающая сторона по этому признаку останавливает цикл.
 */
export function decide(state: DealState, seat: PlayerId, context: BotContext = {}): Command | null {
  if (state.phase === 'RESULT') return null;
  // Служебные фазы без активного игрока продвигает flow.settle, а не бот.
  if (state.toAct === null || state.toAct !== seat) return null;
  return botFor(seat, context).decide(state);
}
