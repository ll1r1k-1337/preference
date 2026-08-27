/**
 * Разведка: какие seed доводят раздачу до фазы DISCARD, и как быстро
 * закрывается пуля poolTarget=4 при пассивном человеке.
 */
import { createDeal, type DealState } from '../src/engine/index.js';
import { decide, resetBots } from '../src/game/bot.js';
import { settle, step } from '../src/game/flow.js';

function reaches(seed: string, phase: DealState['phase']): boolean {
  let current = settle(createDeal({ seed, dealer: 0 })).state;
  for (let guard = 0; guard < 300; guard += 1) {
    if (current.phase === phase) return true;
    if (current.phase === 'RESULT') return false;
    const seat = current.toAct;
    if (seat === null) return false;
    const command = decide(current, seat, { level: 'normal', seed });
    if (command === null) return false;
    const result = step(current, command);
    if (!result.ok) return false;
    current = result.state;
  }
  return false;
}

const hits: string[] = [];
for (let i = 0; i < 60 && hits.length < 6; i += 1) {
  resetBots();
  const seed = `wiring-discard-${i}`;
  if (reaches(seed, 'DISCARD')) hits.push(seed);
}
console.log('DISCARD seeds:', hits);
