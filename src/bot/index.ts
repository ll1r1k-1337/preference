/**
 * Публичный API бота-соперника.
 * Источник истины по правилам: docs/rules.md (`rules-v1`).
 */
export type { BotLevel, BotOptions, Bot } from './bot.js';
export { createBot, DEFAULT_SIMULATIONS } from './bot.js';

// Оценка руки (§1.2, §5.3, §7)
export type { HandEvaluation, SuitEvaluation, SuitStrength } from './evaluate.js';
export { bestTrumpFor, evaluateHand, evaluateSuit, miserRisk } from './evaluate.js';

// Торговля и окончательный заказ (§3, §4.3)
export type { BidInput, FinalContractInput } from './bidding.js';
export { chooseBid, chooseFinalContract, MISER_RISK_THRESHOLD } from './bidding.js';

// Снос (§4.2, §7)
export type { DiscardInput } from './discard.js';
export { chooseDiscard } from './discard.js';

// Вист (§4.4, §5.2, §5.3)
export type { DefenseMode, WhistInput, WhistDecisionResult } from './whist.js';
export { chooseWhist } from './whist.js';

// Эвристики розыгрыша (§6, §7, §8)
export type { PickCardInput, PlayGoal } from './play.js';
export { pickCard } from './play.js';

// Monte-Carlo поиск (уровень hard)
export type { DeterminizeInput, SearchInput, SearchObjective, VoidMap } from './search.js';
export { determinize, searchMove, seenCards } from './search.js';

// Игровой цикл и матчи ботов
export type { DealRunResult, MatchResult } from './match.js';
export { adaptOutcome, playDeal, playMatch } from './match.js';
