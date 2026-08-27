/**
 * Бот-соперник: чистая функция `(DealState) -> Command` поверх движка раздачи.
 *
 * Источник истины по правилам: docs/rules.md; API движка — src/engine/README.md.
 *
 * ГЛАВНЫЙ ИНВАРИАНТ: бот никогда не конструирует ход сам — он выбирает
 * из множеств, посчитанных движком (`legalBids`, `legalContracts`, `legalMoves`).
 * Поэтому нелегальный ход невозможен структурно, а не «по договорённости».
 */
import type { Card, CardId, PlayerId, Rng, Suit } from '../core/index.js';
import {
  cardId,
  contractTrump,
  createRng,
  isMizer,
  parseCard,
  parseContract,
  PLAYERS,
  SUITS,
} from '../core/index.js';
import type { Command, DealState } from '../engine/index.js';
import { chooseBid, chooseFinalContract } from './bidding.js';
import { chooseDiscard } from './discard.js';
import { pickCard, type PlayGoal } from './play.js';
import { searchMove, seenCards, type VoidMap } from './search.js';
import { chooseWhist } from './whist.js';

/**
 * Уровень сложности:
 *  - `easy`   — случайный легальный ход (§ приёмки: только легальность);
 *  - `normal` — эвристики оценки руки и розыгрыша;
 *  - `hard`   — те же эвристики плюс Monte-Carlo поиск хода.
 */
export type BotLevel = 'easy' | 'normal' | 'hard';

export interface BotOptions {
  readonly level: BotLevel;
  /** Место за столом, за которое играет бот. */
  readonly seat: PlayerId;
  /** Seed случайности: при одном seed бот воспроизводим бит в бит. */
  readonly seed?: string | number;
  /** Бюджет симуляций на ход для уровня `hard`. */
  readonly simulations?: number;
}

export interface Bot {
  readonly level: BotLevel;
  readonly seat: PlayerId;
  /** Выбрать команду в текущем состоянии раздачи. */
  decide(state: DealState): Command;
}

/** Бюджет симуляций на ход по умолчанию — компромисс силы и времени (<500 мс). */
export const DEFAULT_SIMULATIONS = 60;

/** Создать бота. Состояние бота — только его ГПСЧ; решения зависят лишь от `DealState`. */
export function createBot(options: BotOptions): Bot {
  const rng = createRng(options.seed ?? `bot-${options.seat}-${options.level}`);
  const simulations = options.simulations ?? DEFAULT_SIMULATIONS;

  return {
    level: options.level,
    seat: options.seat,
    decide: (state) => decide(state, options.level, options.seat, rng, simulations),
  };
}

/** Случайный элемент непустого списка. */
function pickRandom<T>(items: readonly T[], rng: Rng): T {
  if (items.length === 0) throw new Error('Пустой список: выбирать не из чего');
  return items[rng.nextInt(items.length)] as T;
}

/** Рука, которой сейчас ходят: при висте всветлую это чужая рука (§5.2). */
function actingHand(state: DealState): readonly Card[] {
  const owner = state.play?.toPlay ?? state.toAct;
  return owner === null || owner === undefined ? [] : state.hands[owner];
}

/**
 * Цель бота в розыгрыше (§6–§8).
 *
 * Разыгрывающий на мизере хочет НЕ брать; оборона против мизера — заставить
 * его брать; на распасах каждый не берёт; в обычной игре все берут.
 * Экспортируется: это нормативное правило, и оно проверяется тестами напрямую.
 */
export function goalFor(state: DealState, player: PlayerId): PlayGoal {
  if (state.contract === null) return 'avoid'; // распасы, §8.1
  const contract = parseContract(state.contract);
  if (isMizer(contract)) {
    return player === state.declarer ? 'avoid' : 'catch';
  }
  return 'win';
}

/**
 * Ренонсы соперников: масти, которые игрок не положил, будучи обязан (§6.2).
 * Это единственная «память» бота о ходе розыгрыша, и она выводится из состояния,
 * а не накапливается — бот остаётся чистой функцией.
 */
function inferVoids(state: DealState): VoidMap {
  const voids: Record<PlayerId, Set<Suit>> = { 0: new Set(), 1: new Set(), 2: new Set() };
  const play = state.play;
  if (play === null) return freezeVoids(voids);

  const scan = (plays: readonly { player: PlayerId; card: Card }[], ledOverride: Suit | null): void => {
    const led = ledOverride ?? plays[0]?.card.suit;
    if (led === undefined) return;
    const trump = state.trumpSuit;
    for (const entry of plays) {
      if (entry.card.suit === led) continue;
      // Не положил масть хода — её у него нет.
      voids[entry.player].add(led);
      // Не положил и козырь, будучи обязан (§6.2) — козыря тоже нет.
      if (trump !== null && entry.card.suit !== trump) voids[entry.player].add(trump);
    }
  };

  for (const trick of play.completedTricks) {
    scan(trick.plays, trick.widowCard?.suit ?? null);
  }
  scan(play.currentTrick, play.revealedWidowCard?.suit ?? null);

  return freezeVoids(voids);
}

function freezeVoids(voids: Record<PlayerId, Set<Suit>>): VoidMap {
  return Object.freeze({
    0: voids[0] as ReadonlySet<Suit>,
    1: voids[1] as ReadonlySet<Suit>,
    2: voids[2] as ReadonlySet<Suit>,
  });
}

/**
 * Карты, местонахождение которых боту ИЗВЕСТНО: своя рука, раскрытые руки,
 * вышедшие карты, а также — по ситуации — прикуп и собственный снос.
 *
 * Тонкость §4.1/§4.2: прикуп вскрывается и виден всем, но после взятия его
 * карты лежат либо в руке игрока, либо в его СЕКРЕТНОМ сносе. Значит, для
 * обороны прикуп — известные по номиналу, но НЕ локализованные карты: они
 * обязаны остаться в пуле сэмплирования. Исключение — распасы: там прикуп
 * не берут в руку, он вскрывается по ходу и в розыгрыше не участвует (§8.2).
 */
function knownCards(state: DealState, seat: PlayerId): Set<string> {
  const known = new Set<string>(state.hands[seat].map(cardId));

  for (const player of state.revealedHands) {
    for (const card of state.hands[player]) known.add(cardId(card));
  }

  // Распасы: прикуп никому в руку не попал — он вне игры (§8.2).
  if (state.contract === null) {
    for (const card of state.widow) known.add(cardId(card));
  }

  // Свой снос игрок знает; чужой — нет (§4.2), подглядывать нельзя.
  if (seat === state.declarer) {
    for (const id of state.discard) known.add(id);
  }

  const play = state.play;
  if (play !== null) {
    for (const id of seenCards(play)) known.add(id);
  }
  return known;
}

/**
 * Карты, которые бот обязан считать НЕИЗВЕСТНЫМИ и сэмплировать (§4.2).
 *
 * Экспортируется ради прямой проверки инварианта «бот не подглядывает»:
 * для обороны снос разыгрывающего обязан оставаться в этом пуле, а для
 * самого разыгрывающего — нет.
 */
export function hiddenCardsFor(state: DealState, seat: PlayerId): readonly CardId[] {
  const known = knownCards(state, seat);
  return Object.freeze(allCardIds().filter((id) => !known.has(id)));
}

/** Полная колода — база для вычисления неизвестных карт. */
function allCardIds(): readonly CardId[] {
  const ids: CardId[] = [];
  for (const suit of SUITS) {
    for (const rank of ['7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const) {
      ids.push(`${rank}${suit}` as CardId);
    }
  }
  return ids;
}

/** Ход в фазе PLAY уровня `hard`: Monte-Carlo поиск по сэмплам скрытых рук. */
function playCardHard(
  state: DealState,
  seat: PlayerId,
  rng: Rng,
  simulations: number,
): CardId {
  const play = state.play;
  if (play === null) throw new Error('Фаза PLAY без состояния розыгрыша');

  const owner = play.toPlay;
  const known = knownCards(state, seat);
  const unseen = allCardIds()
    .filter((id) => !known.has(id))
    .map(parseCard);

  // Известные боту руки: своя и все раскрытые (мизер, вист всветлую, §5.2/§7.4).
  const visible = new Set<PlayerId>([seat, ...state.revealedHands]);
  const hands: Record<PlayerId, readonly Card[] | null> = { 0: null, 1: null, 2: null };
  const sizes: Record<PlayerId, number> = { 0: 0, 1: 0, 2: 0 };
  for (const player of PLAYERS) {
    if (visible.has(player)) {
      hands[player] = play.hands[player];
      sizes[player] = 0;
    } else {
      hands[player] = null;
      sizes[player] = play.hands[player].length;
    }
  }

  // Остаток неизвестных карт вне игры: снос игрока и невскрытый прикуп (§4.2).
  const hiddenTotal = PLAYERS.reduce<number>((sum, p) => sum + sizes[p], 0);
  const dead = Math.max(0, unseen.length - hiddenTotal);

  // Кого мы усиливаем: себя и (для обороны) партнёра — оборона играет «столом» (§5.1).
  const beneficiaries = beneficiariesOf(state, seat);
  const goal = goalFor(state, owner);

  const card = searchMove({
    mode: play.mode,
    dealer: play.dealer,
    leader: play.leader,
    currentTrick: play.currentTrick,
    completedTricks: play.completedTricks,
    hands,
    unseen,
    sizes,
    voids: inferVoids(state),
    dead,
    goalFor: (player) => goalFor(state, player),
    beneficiaries,
    // «Брать» — максимизируем свои взятки; «не брать»/«ловить» — минимизируем.
    objective: goal === 'win' ? 'maximize' : 'minimize',
    simulations,
    rng,
    ...(state.declarer !== null && isMizerContract(state) ? { target: state.declarer } : {}),
  });

  return cardId(card);
}

function isMizerContract(state: DealState): boolean {
  return state.contract !== null && isMizer(parseContract(state.contract));
}

/**
 * Чьи взятки считаются результатом симуляции.
 * На распасах и мизере каждый сам за себя; в игре на взятки оборона — «стол» (§5.1),
 * поэтому вистующий считает взятки обеих рук обороны.
 */
function beneficiariesOf(state: DealState, seat: PlayerId): readonly PlayerId[] {
  if (state.contract === null) return [seat]; // распасы: только свои взятки
  if (isMizerContract(state)) {
    return state.declarer === seat ? [seat] : [state.declarer as PlayerId];
  }
  if (seat === state.declarer) return [seat];
  return PLAYERS.filter((p) => p !== state.declarer);
}

/** Ход в фазе PLAY уровня `normal`: эвристики без симуляций. */
function playCardHeuristic(state: DealState): CardId {
  const play = state.play;
  if (play === null) throw new Error('Фаза PLAY без состояния розыгрыша');

  const owner = play.toPlay;
  const legal = state.legalMoves.map(parseCard);

  const card = pickCard({
    hand: play.hands[owner],
    legal,
    trick: play.currentTrick,
    trump: state.trumpSuit,
    ...(play.revealedWidowCard !== null ? { ledSuit: play.revealedWidowCard.suit } : {}),
    goal: goalFor(state, owner),
    ...(isMizerContract(state) && state.declarer !== null ? { target: state.declarer } : {}),
    seen: seenCards(play),
  });

  return cardId(card);
}

/** Решение бота в текущем состоянии. Чистая функция от `state` (плюс ГПСЧ для `easy`). */
function decide(
  state: DealState,
  level: BotLevel,
  seat: PlayerId,
  rng: Rng,
  simulations: number,
): Command {
  const actor = state.toAct ?? seat;

  switch (state.phase) {
    case 'DEAL':
      // §3.1: торговлю открывает сдающий.
      return { type: 'START_BIDDING', player: state.dealer };

    case 'BIDDING': {
      const legalBids = state.bidding?.legalBids ?? [];
      if (level === 'easy') {
        // Случайно, но легально: половина решений — пас, чтобы торговля сходилась.
        if (legalBids.length === 0 || rng.nextFloat() < 0.5) return { type: 'PASS', player: actor };
        return { type: 'BID', player: actor, contract: pickRandom(legalBids, rng) };
      }
      const bid = chooseBid({ hand: state.hands[actor], legalBids });
      return bid === null
        ? { type: 'PASS', player: actor }
        : { type: 'BID', player: actor, contract: bid };
    }

    case 'PASSOUT':
      // §8.1: распасы требуют явного старта розыгрыша.
      return { type: 'START_PLAY', player: state.dealer };

    case 'WIDOW_PICKUP':
      return { type: 'TAKE_WIDOW', player: actor };

    case 'DISCARD': {
      const hand = state.hands[actor];
      if (level === 'easy') {
        const ids = hand.map(cardId);
        const first = pickRandom(ids, rng);
        const second = pickRandom(ids.filter((id) => id !== first), rng);
        return { type: 'DISCARD', player: actor, cards: [first, second] };
      }
      // Снос делается под контракт, который бот собирается заказать.
      const intended = state.bidding?.wonBid ?? '6S';
      const discard = chooseDiscard({ hand, contract: intended });
      return { type: 'DISCARD', player: actor, cards: [...discard] };
    }

    case 'FINAL_CONTRACT': {
      const legalContracts = state.legalContracts;
      if (level === 'easy') {
        return { type: 'DECLARE_CONTRACT', player: actor, contract: pickRandom(legalContracts, rng) };
      }
      const contract = chooseFinalContract({ hand: state.hands[actor], legalContracts });
      return { type: 'DECLARE_CONTRACT', player: actor, contract };
    }

    case 'WHIST_DECLARATION': {
      if (level === 'easy') {
        return rng.nextFloat() < 0.5
          ? { type: 'WHIST', player: actor }
          : { type: 'PASS_WHIST', player: actor };
      }
      // Ловушка §5.2: ответ первого соперника лежит в `whist.decisions`, а
      // `state.whisted` движок заполняет ТОЛЬКО после закрытия опроса. Читать
      // здесь `whisted` — значит считать вистующего партнёра пасовавшим и
      // получить ILLEGAL_WHIST на просьбе играть всветлую.
      const partnerWhisted = PLAYERS.some(
        (p) => p !== actor && state.whist?.decisions[p]?.whisted === true,
      );
      const decision = chooseWhist({
        hand: state.hands[actor],
        contract: state.contract ?? '6S',
        partnerWhisted,
      });
      if (!decision.whist) return { type: 'PASS_WHIST', player: actor };
      return decision.mode === undefined
        ? { type: 'WHIST', player: actor }
        : { type: 'WHIST', player: actor, mode: decision.mode };
    }

    case 'PLAY': {
      if (level === 'easy') {
        return { type: 'PLAY_CARD', player: actor, card: pickRandom(state.legalMoves, rng) };
      }
      const card =
        level === 'hard'
          ? playCardHard(state, seat, rng, simulations)
          : playCardHeuristic(state);
      return { type: 'PLAY_CARD', player: actor, card };
    }

    case 'RESULT':
      throw new Error('Раздача окончена: ходов больше нет (фаза RESULT)');

    default:
      throw new Error(`Неизвестная фаза раздачи: ${String(state.phase)}`);
  }
}

/** Реэкспорт для читаемости вызовов: козырь контракта нужен и вызывающей стороне. */
export { contractTrump, actingHand };
