/**
 * Слой партии: связывает движок раздачи (`src/engine`) с модулем расчёта
 * (`src/scoring`) и ведёт лист записи («пульку»).
 *
 * Здесь и только здесь живёт то, чего не знает ни движок, ни расчёт:
 * ротация сдающего между раздачами, счётчик распасов подряд (§8.4),
 * накопленное табло и признак закрытия пули (§9.8).
 *
 * UI не считает ничего сам: он рисует `buildSheet(party)`.
 */
import { nextDealer, type PlayerId as Seat } from '../core/index.js';
import { createDeal, type DealOutcome as EngineOutcome, type DealState } from '../engine/index.js';
import { DEFAULT_BOT_LEVEL, parseBotLevel, type BotLevel } from './bot.js';
import {
  applyScore,
  createScoreboard,
  finalize,
  scoreDeal,
  type DealOutcome,
  type PlayerId,
  type Scoreboard,
  type ScoreDelta,
} from '../scoring/index.js';

/** Идентификаторы игроков для модуля расчёта — это номера мест за столом. */
export const SEATS: readonly Seat[] = Object.freeze([0, 1, 2]);
export const PLAYER_IDS: readonly PlayerId[] = Object.freeze(['0', '1', '2']);

/** Место за столом -> идентификатор в модуле расчёта. */
export const seatId = (seat: Seat): PlayerId => String(seat);

/** Запись об одной сыгранной раздаче. */
export interface DealRecord {
  readonly dealer: Seat;
  readonly seed: string;
  readonly outcome: DealOutcome;
  readonly deltas: readonly ScoreDelta[];
}

export interface PartyState {
  /** Имена игроков по местам; место 0 — человек. */
  readonly names: readonly string[];
  readonly seed: string;
  readonly dealer: Seat;
  /** Номер распаса подряд для следующей раздачи (§8.4). */
  readonly consecutiveRaspasy: number;
  readonly board: Scoreboard;
  readonly deals: readonly DealRecord[];
  /** Целевая пуля партии (§9.8). */
  readonly poolTarget: number;
  /** Уровень ботов-соперников; правил не меняет, только силу игры. */
  readonly botLevel: BotLevel;
}

export interface CreatePartyInput {
  readonly names?: readonly string[];
  readonly seed?: string;
  readonly dealer?: Seat;
  readonly poolTarget?: number;
  readonly botLevel?: BotLevel;
}

export const DEFAULT_NAMES: readonly string[] = Object.freeze(['Вы', 'Бот А', 'Бот Б']);

export function createParty(input: CreatePartyInput = {}): PartyState {
  return Object.freeze({
    names: Object.freeze([...(input.names ?? DEFAULT_NAMES)]),
    seed: input.seed ?? `party-${Date.now()}`,
    dealer: input.dealer ?? 0,
    consecutiveRaspasy: 0,
    board: createScoreboard(PLAYER_IDS),
    deals: Object.freeze([]),
    poolTarget: input.poolTarget ?? 10,
    botLevel: input.botLevel ?? DEFAULT_BOT_LEVEL,
  });
}

/**
 * Привести `DealOutcome` движка (`PlayerId = 0|1|2`) к виду модуля расчёта
 * (`PlayerId = string`). Единственная точка склейки слоёв.
 */
export function toScoringOutcome(outcome: EngineOutcome): DealOutcome {
  const keys = <T>(rec: Readonly<Record<number, T>>): Record<PlayerId, T> =>
    Object.fromEntries(Object.entries(rec).map(([k, v]) => [String(k), v]));

  if (outcome.kind === 'miser') {
    return { kind: 'miser', declarer: seatId(outcome.declarer), declarerTricks: outcome.declarerTricks };
  }
  if (outcome.kind === 'raspasy') {
    return { kind: 'raspasy', tricks: keys(outcome.tricks), consecutiveIndex: outcome.consecutiveIndex };
  }
  // Движок типизирует contract как ContractId (включая MIZER), хотя мизер
  // всегда приходит веткой kind:'miser'. Проверяем явно, а не приводим типом.
  if (outcome.contract === 'MIZER') {
    throw new Error('мизер должен приходить веткой kind:"miser" (§7.7)');
  }
  return {
    kind: 'contract',
    contract: outcome.contract,
    declarer: seatId(outcome.declarer),
    tricks: keys(outcome.tricks),
    whisted: keys(outcome.whisted),
    mode: outcome.mode,
  };
}

/** Seed текущей раздачи: детерминирован по партии и номеру раздачи. */
export const dealSeed = (party: PartyState): string => `${party.seed}#${party.deals.length}`;

/** Сдать следующую раздачу. Счётчик распасов подряд ведёт слой партии (§8.4). */
export function startDeal(party: PartyState): DealState {
  return createDeal({
    seed: dealSeed(party),
    dealer: party.dealer,
    consecutiveRaspasy: party.consecutiveRaspasy,
  });
}

/**
 * Записать сыгранную раздачу: расчёт очков, применение к табло, ротация
 * сдающего и обновление счётчика распасов. Возвращает НОВОЕ состояние партии.
 *
 * `currentPool` берётся ДО раздачи — иначе «американская помощь» (§9.8)
 * молча не сработает и лист разойдётся с правилами (TS-44).
 */
export function recordDeal(party: PartyState, engineOutcome: EngineOutcome): PartyState {
  const outcome = toScoringOutcome(engineOutcome);
  const deltas = scoreDeal(outcome, {
    players: PLAYER_IDS,
    seating: PLAYER_IDS,
    poolTarget: party.poolTarget,
    currentPool: { ...party.board.pool },
  });

  return Object.freeze({
    ...party,
    board: applyScore(party.board, deltas),
    dealer: nextDealer(party.dealer),
    // §8.4: счётчик растёт только на распасах и сбрасывается любой сыгранной раздачей.
    consecutiveRaspasy: outcome.kind === 'raspasy' ? party.consecutiveRaspasy + 1 : 0,
    deals: Object.freeze([
      ...party.deals,
      { dealer: party.dealer, seed: dealSeed(party), outcome, deltas: Object.freeze([...deltas]) },
    ]),
  });
}

/** Пуля закрыта у всех троих — партия окончена (§9.8). */
export function isPartyClosed(party: PartyState): boolean {
  return PLAYER_IDS.every((p) => (party.board.pool[p] ?? 0) >= party.poolTarget);
}

// ---------------------------------------------------------------- лист записи

export interface SheetRow {
  /** Номер раздачи с 1. */
  readonly index: number;
  readonly label: string;
  readonly dealer: Seat;
  /** Приращения по местам за эту раздачу. */
  readonly pool: readonly number[];
  readonly mountain: readonly number[];
  /** `vists[a][b]` — висты, записанные местом `a` на место `b`. */
  readonly vists: readonly (readonly number[])[];
}

export interface Sheet {
  readonly names: readonly string[];
  readonly rows: readonly SheetRow[];
  readonly totals: {
    readonly pool: readonly number[];
    readonly mountain: readonly number[];
    readonly vists: readonly (readonly number[])[];
    /** Сальдо вистов по местам. */
    readonly vistBalance: readonly number[];
  };
  /** Итоговый пересчёт (§9.9); `null`, пока пуля не закрыта. */
  readonly final: readonly number[] | null;
  readonly closed: boolean;
  readonly poolTarget: number;
}

const SUIT_LABEL: Readonly<Record<string, string>> = Object.freeze({
  S: '♠', C: '♣', D: '♦', H: '♥', NT: 'БК',
});

/** Человекочитаемое имя контракта: `6S` -> `6♠`, `10NT` -> `10БК`. */
export function contractLabel(contract: string): string {
  if (contract === 'MIZER') return 'Мизер';
  const level = contract.slice(0, contract.length - (contract.endsWith('NT') ? 2 : 1));
  const suit = contract.slice(level.length);
  return `${level}${SUIT_LABEL[suit] ?? suit}`;
}

function rowLabel(outcome: DealOutcome, names: readonly string[]): string {
  if (outcome.kind === 'raspasy') return `Распасы №${outcome.consecutiveIndex + 1}`;
  const who = names[Number(outcome.declarer)] ?? outcome.declarer;
  if (outcome.kind === 'miser') return `Мизер — ${who}`;
  return `${contractLabel(outcome.contract)} — ${who}`;
}

const zeros = (): number[] => [0, 0, 0];
const matrix = (): number[][] => [zeros(), zeros(), zeros()];

/** Разложить дельты раздачи по местам стола. */
function spread(deltas: readonly ScoreDelta[]): Pick<SheetRow, 'pool' | 'mountain' | 'vists'> {
  const pool = zeros();
  const mountain = zeros();
  const vists = matrix();
  for (const d of deltas) {
    const a = Number(d.player);
    pool[a] = d.pool;
    mountain[a] = d.mountain;
    // vistsOn содержит только ненулевые ключи — отсутствие ключа значит 0.
    for (const [target, value] of Object.entries(d.vistsOn)) {
      (vists[a] as number[])[Number(target)] = value;
    }
  }
  return { pool, mountain, vists };
}

/**
 * Лист записи целиком. Единственный источник для отрисовки таблицы:
 * строки — из `ScoreDelta` раздач, итоги — из накопленного `Scoreboard`,
 * финал — из `finalize`. UI ничего не пересчитывает.
 */
export function buildSheet(party: PartyState): Sheet {
  const rows = party.deals.map((deal, i) => ({
    index: i + 1,
    label: rowLabel(deal.outcome, party.names),
    dealer: deal.dealer,
    ...spread(deal.deltas),
  }));

  const pool = SEATS.map((s) => party.board.pool[seatId(s)] ?? 0);
  const mountain = SEATS.map((s) => party.board.mountain[seatId(s)] ?? 0);
  const vists = SEATS.map((a) => SEATS.map((b) => party.board.vists[seatId(a)]?.[seatId(b)] ?? 0));
  const vistBalance = SEATS.map((a) => {
    let written = 0;
    let received = 0;
    for (const b of SEATS) {
      if (a === b) continue;
      written += vists[a]?.[b] ?? 0;
      received += vists[b]?.[a] ?? 0;
    }
    return written - received;
  });

  const closed = isPartyClosed(party);
  const final = closed ? SEATS.map((s) => finalize(party.board)[seatId(s)] ?? 0) : null;

  return {
    names: party.names,
    rows,
    totals: { pool, mountain, vists, vistBalance },
    final,
    closed,
    poolTarget: party.poolTarget,
  };
}

// -------------------------------------------------------------- сохранение

const STORAGE_KEY = 'preference.party.v1';

/** Партия сериализуется целиком: табло и журнал раздач — обычный JSON. */
export function saveParty(party: PartyState, storage: Storage): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(party));
}

/** Восстановить партию; `null`, если сохранения нет или оно повреждено. */
export function loadParty(storage: Storage): PartyState | null {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as PartyState;
    if (!Array.isArray(parsed.names) || parsed.board === undefined) return null;
    // Сохранения прошлых версий не знают про уровень бота — чиним на чтении,
    // иначе partyState.botLevel окажется undefined и бот молча уедет в дефолт.
    return { ...parsed, botLevel: parseBotLevel(parsed.botLevel) };
  } catch {
    return null;
  }
}

export function clearParty(storage: Storage): void {
  storage.removeItem(STORAGE_KEY);
}
