/**
 * Публичный API ядра преферанса (конвенция «Сочи», 3 игрока).
 * Источник истины по правилам: docs/rules.md (`rules-v1`).
 */

// Карты и колода (§1)
export type { Card, CardId, Rank, Suit, BidSuit, NoTrump } from './cards.js';
export {
  RANKS,
  SUITS,
  NO_TRUMP,
  rankOrder,
  suitOrder,
  isRank,
  isSuit,
  makeCard,
  cardId,
  cardIds,
  parseCard,
  parseCards,
  compareCards,
  sortCards,
  sameCard,
  createDeck,
} from './cards.js';

// Детерминированное перемешивание
export type { Rng, Seed } from './shuffle.js';
export { createRng, shuffled, shuffleDeck } from './shuffle.js';

// Контракты (§3.2, §4.3, §5.3, §9.2)
export type { Contract, ContractId, Level, WhistObligation } from './contract.js';
export {
  ALL_CONTRACTS,
  LEVELS,
  MIZER,
  bidOrder,
  compareContracts,
  contractId,
  contractLevel,
  contractTrump,
  gamePrice,
  isAllowedFinalContract,
  isHigherContract,
  isMizer,
  makeContract,
  parseContract,
  whistObligation,
} from './contract.js';

// Раздача (§2)
export type { DealOptions, DealtCards, HandRole, PlayerId } from './deal.js';
export {
  HAND_SIZE,
  PLAYERS,
  TRICKS_PER_DEAL,
  WIDOW_SIZE,
  dealCards,
  dealFromDeck,
  firstHand,
  handOrder,
  handRole,
  nextDealer,
  playerAfter,
  secondHand,
  thirdHand,
} from './deal.js';

// Розыгрыш (§6, §7, §8.2)
export type {
  CompletedTrick,
  CreatePlayInput,
  PlayMode,
  PlayState,
  PlayedCard,
} from './play.js';
export {
  MAX_TRICKS,
  applyMove,
  createPlay,
  currentLedSuit,
  currentTrickNumber,
  currentTrumpSuit,
  isLegalMove,
  isMizerPlay,
  isRaspasyPlay,
  isTerminal,
  legalMoveIds,
  legalMoves,
  totalTricks,
  trickCounts,
  trickWinner,
} from './play.js';

// Сериализация
export type {
  CompletedTrickSnapshot,
  PlayModeSnapshot,
  PlayStateSnapshot,
  PlayedCardSnapshot,
} from './serialize.js';
export {
  SNAPSHOT_VERSION,
  deserializePlayState,
  fromJson,
  serializePlayState,
  toJson,
} from './serialize.js';
