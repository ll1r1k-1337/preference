/**
 * Продвижение раздачи: единственный путь, которым и UI, и тесты меняют состояние.
 *
 * Движок оставляет две фазы без активного игрока — `DEAL` (сдающий открывает
 * торговлю) и `PASSOUT` (кто-то должен начать розыгрыш распасов). Кнопок для
 * них в интерфейсе нет, поэтому они продвигаются автоматически, а их события
 * накапливаются в общий журнал шага.
 */
import {
  dispatch,
  type Command,
  type DealState,
  type EngineError,
  type EngineEvent,
} from '../engine/index.js';

/** Команда, продвигающая фазу без активного игрока; `null` — ход за игроком. */
export function autoCommand(state: DealState): Command | null {
  if (state.phase === 'DEAL') return { type: 'START_BIDDING', player: state.dealer };
  if (state.phase === 'PASSOUT') return { type: 'START_PLAY', player: state.dealer };
  return null;
}

export type StepResult =
  | { readonly ok: true; readonly state: DealState; readonly events: readonly EngineEvent[] }
  | { readonly ok: false; readonly error: EngineError };

/**
 * Применить команду и сразу проскочить все служебные фазы, чтобы состояние
 * всегда останавливалось там, где ждут игрока (или на `RESULT`).
 * Возвращает события движка — журнал ходов строится только из них.
 */
export function step(state: DealState, command: Command): StepResult {
  const result = dispatch(state, command);
  if (!result.ok) return { ok: false, error: result.error };
  const settled = settle(result.state);
  return { ok: true, state: settled.state, events: [...result.events, ...settled.events] };
}

/** Прогнать автоматические фазы до первой, требующей решения. */
export function settle(state: DealState): { state: DealState; events: readonly EngineEvent[] } {
  let current = state;
  const events: EngineEvent[] = [];
  for (let guard = 0; guard < 10; guard += 1) {
    const auto = autoCommand(current);
    if (auto === null) break;
    const result = dispatch(current, auto);
    if (!result.ok) break;
    current = result.state;
    events.push(...result.events);
  }
  return { state: current, events };
}
