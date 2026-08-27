/**
 * Слой партии: ведёт лист записи («пульку»), записывает результаты раздач
 * и считает очки через модуль `src/scoring`.
 *
 * Игровой логики (engine, core, bot) здесь нет — приложение только журнал:
 * люди играют вживую, а сюда вносят итоги.
 */
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

/** Место за столом: 0, 1 или 2. */
export type Seat = 0 | 1 | 2;

/** Идентификаторы игроков для модуля расчёта — это номера мест за столом. */
export const SEATS: readonly Seat[] = Object.freeze([0, 1, 2]);
export const PLAYER_IDS: readonly PlayerId[] = Object.freeze(['0', '1', '2']);

/** Место за столом -> идентификатор в модуле расчёта. */
export const seatId = (seat: Seat): PlayerId => String(seat);

/** Ротация сдающего: 0 → 1 → 2 → 0. */
export const nextDealer = (dealer: Seat): Seat => ((dealer + 1) % 3) as Seat;

/** Запись об одной сыгранной раздаче. */
export interface DealRecord {
  readonly dealer: Seat;
  readonly outcome: DealOutcome;
  readonly deltas: readonly ScoreDelta[];
}

export interface PartyState {
  /** Имена игроков по местам. */
  readonly names: readonly string[];
  readonly dealer: Seat;
  /** Номер распаса подряд для следующей раздачи (§8.4). */
  readonly consecutiveRaspasy: number;
  readonly board: Scoreboard;
  readonly deals: readonly DealRecord[];
  /** Целевая пуля партии (§9.8). */
  readonly poolTarget: number;
}

export interface CreatePartyInput {
  readonly names?: readonly string[];
  readonly dealer?: Seat;
  readonly poolTarget?: number;
}

export const DEFAULT_NAMES: readonly string[] = Object.freeze(['Игрок 1', 'Игрок 2', 'Игрок 3']);

export function createParty(input: CreatePartyInput = {}): PartyState {
  return Object.freeze({
    names: Object.freeze([...(input.names ?? DEFAULT_NAMES)]),
    dealer: input.dealer ?? 0,
    consecutiveRaspasy: 0,
    board: createScoreboard(PLAYER_IDS),
    deals: Object.freeze([]),
    poolTarget: input.poolTarget ?? 10,
  });
}

/**
 * Записать сыгранную раздачу: расчёт очков, применение к табло, ротация
 * сдающего и обновление счётчика распасов. Возвращает НОВОЕ состояние партии.
 *
 * `currentPool` берётся ДО раздачи — иначе «американская помощь» (§9.8)
 * молча не сработает и лист разойдётся с правилами (TS-44).
 */
export function recordDeal(party: PartyState, outcome: DealOutcome): PartyState {
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
      { dealer: party.dealer, outcome, deltas: Object.freeze([...deltas]) },
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
    return parsed;
  } catch {
    return null;
  }
}

export function clearParty(storage: Storage): void {
  storage.removeItem(STORAGE_KEY);
}
