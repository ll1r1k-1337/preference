/**
 * Вист: заявки обороны, режим розыгрыша, раскрытие карт, обязательства.
 * Источник истины: docs/rules.md §4.4, §5.1–§5.3, §7.4.
 */
import type { Contract, PlayerId } from '../core/index.js';
import { isMizer, playerAfter, whistObligation } from '../core/index.js';

/** Режим розыгрыша обороны (§5.2). */
export type DefenseMode = 'dark' | 'light';

/** Решение соперника (§4.4). */
export type WhistDecision = { readonly whisted: boolean; readonly mode: DefenseMode | null };

/** Состояние опроса вистующих. */
export interface WhistState {
  /** Соперники в порядке опроса — по часовой стрелке от игрока (§4.4). */
  readonly order: readonly PlayerId[];
  /** Уже полученные решения. */
  readonly decisions: Readonly<Partial<Record<PlayerId, WhistDecision>>>;
}

/** Соперники в порядке опроса: по часовой стрелке от разыгрывающего (§4.4). */
export function defenderOrder(declarer: PlayerId): readonly PlayerId[] {
  return Object.freeze([playerAfter(declarer), playerAfter(playerAfter(declarer))]);
}

/** Открыть опрос вистующих. */
export function createWhist(declarer: PlayerId): WhistState {
  return Object.freeze({ order: defenderOrder(declarer), decisions: Object.freeze({}) });
}

/** Кто отвечает следующим; `null`, если ответили оба. */
export function nextDefender(state: WhistState): PlayerId | null {
  return state.order.find((p) => state.decisions[p] === undefined) ?? null;
}

/** Опрос завершён? */
export function isWhistComplete(state: WhistState): boolean {
  return nextDefender(state) === null;
}

/** Вистующие среди соперников. */
export function whistedDefenders(state: WhistState): readonly PlayerId[] {
  return Object.freeze(state.order.filter((p) => state.decisions[p]?.whisted === true));
}

/**
 * Проверка выбора режима при висте (§5.2).
 * Режим «всветлую» выбирает только единственный вистующий; при двух
 * вистующих оборона обязательно играет втёмную.
 */
export function whistModeRejection(
  mode: DefenseMode | undefined,
  state: WhistState,
  player: PlayerId,
): string | null {
  if (mode === undefined) return null;
  const others = state.order.filter((p) => p !== player);
  const someoneElseWhisted = others.some((p) => state.decisions[p]?.whisted === true);
  if (mode === 'light' && someoneElseWhisted) {
    return 'Вистуют оба — оборона обязана играть втёмную (§5.2)';
  }
  return null;
}

/**
 * Итоговый режим обороны (§5.2, §7.4):
 *  - мизер — всегда всветлую;
 *  - вистуют оба — втёмную;
 *  - вистует один — как он выбрал (по умолчанию втёмную).
 */
export function resolveDefenseMode(state: WhistState, contract: Contract): DefenseMode {
  if (isMizer(contract)) return 'light';
  const whisters = whistedDefenders(state);
  if (whisters.length !== 1) return 'dark';
  const sole = whisters[0] as PlayerId;
  return state.decisions[sole]?.mode ?? 'dark';
}

/**
 * Кто фактически ходит картами игрока (§5.2).
 * При висте всветлую вистующий ходит за себя и за пасовавшего.
 */
export function resolveControl(
  declarer: PlayerId,
  state: WhistState,
  mode: DefenseMode,
): Readonly<Record<PlayerId, PlayerId>> {
  const control: Record<PlayerId, PlayerId> = { 0: 0, 1: 1, 2: 2 };
  const whisters = whistedDefenders(state);
  if (mode === 'light' && whisters.length === 1) {
    const sole = whisters[0] as PlayerId;
    for (const defender of state.order) control[defender] = sole;
  }
  control[declarer] = declarer;
  return Object.freeze(control);
}

/**
 * Обязательства соперников в взятках (§5.3):
 *  - вистуют оба — норма на каждого;
 *  - вистует один — вся норма обороны на нём;
 *  - пасовавший обязательств не несёт.
 */
export function resolveObligations(
  state: WhistState,
  contract: Contract,
): Readonly<Record<PlayerId, number>> {
  const obligation = whistObligation(contract);
  const whisters = whistedDefenders(state);
  const result: Record<number, number> = {};
  for (const defender of state.order) result[defender] = 0;

  if (whisters.length === 1) {
    result[whisters[0] as PlayerId] = obligation.total;
  } else if (whisters.length === 2) {
    for (const defender of whisters) result[defender] = obligation.perDefenderWhenTwo;
  }
  return Object.freeze(result as Record<PlayerId, number>);
}

/** Карты, раскрываемые перед розыгрышем: оборона при мизере и висте всветлую (§5.2, §7.4). */
export function revealedHandsFor(
  state: WhistState,
  mode: DefenseMode,
): readonly PlayerId[] {
  return mode === 'light' ? Object.freeze([...state.order].sort((a, b) => a - b)) : Object.freeze([]);
}

/** Кто вистовал — для `DealOutcome` (приложение А.3). */
export function whistedFlags(state: WhistState): Readonly<Record<PlayerId, boolean>> {
  const flags: Record<number, boolean> = {};
  for (const defender of state.order) flags[defender] = state.decisions[defender]?.whisted === true;
  return Object.freeze(flags as Record<PlayerId, boolean>);
}
