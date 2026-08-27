/**
 * Подбор seed для сценариев: перебирает seed и печатает те, где раздача
 * даёт нужный исход (сыгранный контракт / ремиз / мизер со взятками).
 * Вспомогательный инструмент, в тестовый прогон не входит.
 */
import type { PlayerId } from '../src/core/index.js';
import { createDeal, dispatch, expectOk } from '../src/engine/index.js';
import type { Command, DealState } from '../src/engine/index.js';

type Policy = 'first' | 'last' | 'declarerStrong';

function pick(state: DealState, policy: Policy): string {
  const moves = state.legalMoves;
  const weak = moves[0] as string;
  const strong = moves[moves.length - 1] as string;
  if (policy === 'first') return weak;
  if (policy === 'last') return strong;
  return state.play?.toPlay === state.declarer ? strong : weak;
}

function run(seed: string, dealer: PlayerId, bid: string, final: string, policy: Policy) {
  let state = createDeal({ seed, dealer });
  const declarer = state.firstHand;
  const second = ((declarer + 1) % 3) as PlayerId;
  const third = ((declarer + 2) % 3) as PlayerId;
  const script: Command[] = [
    { type: 'START_BIDDING', player: dealer },
    { type: 'BID', player: declarer, contract: bid },
    { type: 'PASS', player: second },
    { type: 'PASS', player: third },
    { type: 'TAKE_WIDOW', player: declarer },
  ];
  for (const c of script) state = expectOk(dispatch(state, c)).state;
  const hand = state.hands[declarer].map((c) => `${c.rank}${c.suit}`);
  state = expectOk(dispatch(state, { type: 'DISCARD', player: declarer, cards: [hand[0]!, hand[1]!] })).state;
  state = expectOk(dispatch(state, { type: 'DECLARE_CONTRACT', player: declarer, contract: final })).state;
  if (state.phase !== 'PLAY') {
    state = expectOk(dispatch(state, { type: 'WHIST', player: second })).state;
    state = expectOk(dispatch(state, { type: 'WHIST', player: third })).state;
  }
  let guard = 0;
  while (state.phase === 'PLAY') {
    if (guard++ > 40) throw new Error('не сходится');
    state = expectOk(dispatch(state, { type: 'PLAY_CARD', player: state.toAct as PlayerId, card: pick(state, policy) })).state;
  }
  return { declarer, tricks: state.play!.tricksWon, outcome: state.outcome };
}

const mode = process.argv[2] ?? 'made';

if (mode === 'made') {
  // Ищем seed, где шестерная фактически СЫГРАНА (взяток >= 6).
  for (let i = 0; i < 400; i += 1) {
    const seed = `acceptance-normal-${i}`;
    for (const dealer of [0, 1, 2] as PlayerId[]) {
      const r = run(seed, dealer, '6S', '6S', 'declarerStrong');
      if (r.tricks[r.declarer] >= 6) {
        console.log(`СЫГРАНА  seed=${seed} dealer=${dealer} declarer=${r.declarer} tricks=${JSON.stringify(r.tricks)}`);
        process.exit(0);
      }
    }
  }
  console.log('не найдено');
}

if (mode === 'mizer') {
  // Ищем seed, где мизерист берёт хотя бы одну взятку (проверяемый недобор §7.7).
  for (let i = 0; i < 200; i += 1) {
    const seed = `acceptance-mizer-${i}`;
    for (const dealer of [0, 1, 2] as PlayerId[]) {
      const r = run(seed, dealer, 'MIZER', 'MIZER', 'first');
      if (r.outcome?.kind === 'miser' && r.outcome.declarerTricks >= 1 && r.declarer === 1) {
        console.log(`МИЗЕР    seed=${seed} dealer=${dealer} declarer=${r.declarer} tricks=${JSON.stringify(r.tricks)}`);
        process.exit(0);
      }
    }
  }
  console.log('не найдено');
}
