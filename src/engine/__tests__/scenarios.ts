/**
 * Шесть нормативных сценариев полного цикла раздачи с фиксированным seed.
 * Каждый сценарий — детерминированный скрипт команд поверх движка;
 * ботов и случайности нет, поэтому результат воспроизводим бит в бит.
 */
import type { CardId, PlayerId } from '../../core/index.js';
import { createDeal, dispatch, expectOk } from '../index.js';
import type { Command, DealState, EngineEvent } from '../index.js';

export type ScenarioName =
  | 'обычная игра'
  | 'распасы'
  | 'мизер'
  | 'вист втёмную'
  | 'недобор'
  | 'на своих';

/**
 * Как выбирается ход в фазе PLAY:
 *  - `first`    — первая легальная карта (детерминированная «слабая» игра);
 *  - `last`     — последняя легальная карта (детерминированная «сильная» игра);
 *  - `declarerStrong` — разыгрывающий играет сильно, оборона слабо: так контракт
 *                 заведомо выполняется, что нужно сценарию «обычная игра».
 */
export type MovePolicy = 'first' | 'last' | 'declarerStrong';

export interface Scenario {
  readonly name: ScenarioName;
  readonly seed: string;
  readonly dealer: PlayerId;
  readonly consecutiveRaspasy?: number;
  /** Команды до начала розыгрыша (торговля, прикуп, снос, заказ, вист). */
  readonly script: (state: DealState) => readonly Command[];
  readonly movePolicy: MovePolicy;
}

/** Идентификаторы карт руки игрока. */
function handIds(state: DealState, player: PlayerId): readonly CardId[] {
  return state.hands[player].map((c) => `${c.rank}${c.suit}` as CardId);
}

/**
 * Скрипт «первая рука выигрывает торговлю заявкой, остальные пасуют»,
 * далее прикуп, снос двух первых карт и окончательный заказ.
 */
function declarerScript(
  bid: string,
  finalContract: string,
  defense: (declarer: PlayerId) => readonly Command[],
): (state: DealState) => readonly Command[] {
  return (state) => {
    const declarer = state.firstHand;
    const second = ((declarer + 1) % 3) as PlayerId;
    const third = ((declarer + 2) % 3) as PlayerId;
    return [
      { type: 'START_BIDDING', player: state.dealer },
      { type: 'BID', player: declarer, contract: bid },
      { type: 'PASS', player: second },
      { type: 'PASS', player: third },
      { type: 'TAKE_WIDOW', player: declarer },
      // Конкретные карты сноса подставляет `resolveCommand` в момент выполнения:
      // до взятия прикупа рука ещё не известна.
      { type: 'DISCARD', player: declarer, cards: [] },
      { type: 'DECLARE_CONTRACT', player: declarer, contract: finalContract },
      ...defense(declarer),
    ];
  };
}

/** Оба соперника вистуют (розыгрыш втёмную, §5.2). */
function bothWhist(declarer: PlayerId): readonly Command[] {
  return [
    { type: 'WHIST', player: ((declarer + 1) % 3) as PlayerId },
    { type: 'WHIST', player: ((declarer + 2) % 3) as PlayerId },
  ];
}

/** Оба соперника пасуют — игра «на своих» (§5.2, TS-37). */
function bothPass(declarer: PlayerId): readonly Command[] {
  return [
    { type: 'PASS_WHIST', player: ((declarer + 1) % 3) as PlayerId },
    { type: 'PASS_WHIST', player: ((declarer + 2) % 3) as PlayerId },
  ];
}

export const SCENARIOS: readonly Scenario[] = Object.freeze([
  {
    name: 'обычная игра',
    // seed подобран так, что шестерная фактически СЫГРАНА (7 взяток из 6 заказанных).
    seed: 'acceptance-normal-6',
    dealer: 0,
    script: declarerScript('6S', '6S', bothWhist),
    movePolicy: 'declarerStrong',
  },
  {
    name: 'распасы',
    seed: 'acceptance-raspasy',
    dealer: 1,
    script: (state) => [
      { type: 'START_BIDDING', player: state.dealer },
      { type: 'PASS', player: state.firstHand },
      { type: 'PASS', player: ((state.firstHand + 1) % 3) as PlayerId },
      { type: 'PASS', player: ((state.firstHand + 2) % 3) as PlayerId },
      { type: 'START_PLAY', player: state.dealer },
    ],
    movePolicy: 'first',
  },
  {
    name: 'мизер',
    // seed подобран так, что мизерист берёт взятки — проверяется недобор §7.7.
    seed: 'acceptance-mizer-0',
    dealer: 0,
    // §7.4: на мизере вистовых заявок нет, оборона раскрывается автоматически.
    script: declarerScript('MIZER', 'MIZER', () => []),
    movePolicy: 'first',
  },
  {
    name: 'вист втёмную',
    seed: 'acceptance-dark',
    dealer: 0,
    script: declarerScript('7H', '7H', bothWhist),
    movePolicy: 'first',
  },
  {
    name: 'недобор',
    seed: 'acceptance-remise',
    dealer: 1,
    // Заказ 10БК заведомо не выполняется при слабой игре разыгрывающего — ремиз (§9.5).
    script: declarerScript('6S', '10NT', bothWhist),
    movePolicy: 'first',
  },
  {
    name: 'на своих',
    seed: 'acceptance-own',
    dealer: 2,
    script: declarerScript('7S', '7S', bothPass),
    movePolicy: 'first',
  },
]);

export interface ScenarioRun {
  readonly state: DealState;
  readonly events: readonly EngineEvent[];
  readonly tricks: Readonly<Record<PlayerId, number>>;
  /** Компактный след раздачи — для проверки воспроизводимости. */
  readonly trace: readonly string[];
}

/** Подставить реальные карты в команду сноса (первые две карты руки игрока). */
function resolveCommand(state: DealState, command: Command): Command {
  if (command.type !== 'DISCARD') return command;
  const [a, b] = handIds(state, command.player);
  return { type: 'DISCARD', player: command.player, cards: [a as string, b as string] };
}

/** Выбор карты по политике сценария: детерминированно, без случайности. */
function pickCard(state: DealState, policy: MovePolicy): CardId {
  const moves = state.legalMoves;
  const weakest = moves[0];
  const strongest = moves[moves.length - 1];
  if (weakest === undefined || strongest === undefined) {
    throw new Error('нет легальных ходов в фазе PLAY');
  }
  if (policy === 'first') return weakest;
  if (policy === 'last') return strongest;
  // declarerStrong: сильную карту кладёт только разыгрывающий.
  const owner = state.play?.toPlay;
  return owner !== undefined && owner === state.declarer ? strongest : weakest;
}

/** Проиграть сценарий целиком: скрипт фаз + детерминированный розыгрыш. */
export function runScenario(name: ScenarioName): ScenarioRun {
  const scenario = SCENARIOS.find((s) => s.name === name);
  if (scenario === undefined) throw new Error(`Неизвестный сценарий: ${name}`);

  let state = createDeal({
    seed: scenario.seed,
    dealer: scenario.dealer,
    consecutiveRaspasy: scenario.consecutiveRaspasy ?? 0,
  });
  const events: EngineEvent[] = [];
  const trace: string[] = [];

  for (const command of scenario.script(state)) {
    const step = expectOk(dispatch(state, resolveCommand(state, command)));
    state = step.state;
    events.push(...step.events);
    trace.push(`${command.type}:${'player' in command ? command.player : '-'}`);
  }

  let guard = 0;
  while (state.phase === 'PLAY') {
    if (guard++ > 40) throw new Error(`Сценарий «${name}» не сходится: больше 30 ходов`);
    const card = pickCard(state, scenario.movePolicy);
    const step = expectOk(dispatch(state, { type: 'PLAY_CARD', player: state.toAct as PlayerId, card }));
    state = step.state;
    events.push(...step.events);
    trace.push(`PLAY:${card}`);
  }

  const tricks = state.play === null ? { 0: 0, 1: 0, 2: 0 } : state.play.tricksWon;
  return Object.freeze({
    state,
    events: Object.freeze(events),
    tricks: state.play === null && state.declarer !== null
      ? Object.freeze({ ...tricks, [state.declarer]: 10 } as Record<PlayerId, number>)
      : tricks,
    trace: Object.freeze(trace),
  });
}
