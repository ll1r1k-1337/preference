/**
 * Публичный API движка раздачи преферанса.
 * Источник истины по правилам: docs/rules.md (`rules-v1`).
 */
export type {
  Command,
  DealState,
  DispatchResult,
  EngineError,
  EngineEvent,
  ErrorCode,
  Phase,
} from './types.js';

export type { BidRecord, BiddingState } from './bidding.js';
export type { DefenseMode, WhistDecision, WhistState } from './whist.js';
export type { DealOutcome, TrickCounts } from './outcome.js';

export type { CreateDealInput } from './engine.js';
export { createDeal, dispatch, expectOk } from './engine.js';
