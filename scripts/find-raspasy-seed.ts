/** Поиск seed партии, в которой встречаются распасы подряд (для теста §8.4). */
import { decide } from '../src/game/bot.js';
import { settle, step } from '../src/game/flow.js';
import { createParty, recordDeal, startDeal } from '../src/game/party.js';
import type { DealState } from '../src/engine/index.js';

function playDeal(state: DealState): DealState {
  let current = settle(state).state;
  for (let g = 0; g < 500; g += 1) {
    if (current.phase === 'RESULT') return current;
    const seat = current.toAct!;
    const result = step(current, decide(current, seat)!);
    if (!result.ok) throw new Error(result.error.message);
    current = result.state;
  }
  throw new Error('no end');
}

for (const seed of Array.from({ length: 60 }, (_, i) => `scan-${i}`)) {
  let party = createParty({ seed });
  const kinds: string[] = [];
  let maxIndex = 0;
  for (let i = 0; i < 12; i += 1) {
    const finished = playDeal(startDeal(party));
    const outcome = finished.outcome!;
    kinds.push(outcome.kind);
    if (outcome.kind === 'raspasy') maxIndex = Math.max(maxIndex, outcome.consecutiveIndex);
    party = recordDeal(party, outcome);
  }
  const kindSet = new Set(kinds);
  if (maxIndex >= 1 && kindSet.size >= 2) {
    console.log(seed, 'maxConsecutiveIndex=', maxIndex, kinds.join(','));
  }
}
