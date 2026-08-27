/**
 * Детерминированное перемешивание.
 *
 * Требование ТЗ: колода тасуется по seed так, что одна и та же строка/число
 * всегда даёт одну и ту же раскладку — это делает раздачи воспроизводимыми
 * в тестах, в реплеях и в ботах.
 *
 * Реализация: xoshiro-подобный генератор (mulberry32) поверх хеша seed (FNV-1a),
 * перестановка — Фишер–Йетс справа налево. Никаких зависимостей от Math.random.
 */
import type { Card } from './cards.js';
import { createDeck } from './cards.js';

/** Тип seed: строка (человекочитаемая) или целое число. */
export type Seed = string | number;

export interface Rng {
  /** Следующее псевдослучайное 32-битное беззнаковое целое. */
  nextUint32(): number;
  /** Следующее число в диапазоне [0, 1). */
  nextFloat(): number;
  /** Следующее целое в диапазоне [0, bound). */
  nextInt(bound: number): number;
}

/** FNV-1a — стабильный хеш seed в 32-битное состояние. */
function hashSeed(seed: Seed): number {
  const text = typeof seed === 'number' ? `n:${seed}` : `s:${seed}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // Гарантируем ненулевое состояние.
  return h === 0 ? 0x9e3779b9 : h >>> 0;
}

/** Создать детерминированный ГПСЧ по seed. */
export function createRng(seed: Seed): Rng {
  let state = hashSeed(seed);

  const nextUint32 = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t = (t ^ (t + Math.imul(t ^ (t >>> 7), t | 61))) >>> 0;
    return (t ^ (t >>> 14)) >>> 0;
  };

  const nextFloat = (): number => nextUint32() / 0x1_0000_0000;

  const nextInt = (bound: number): number => {
    if (!Number.isInteger(bound) || bound <= 0) {
      throw new Error(`nextInt: bound должен быть положительным целым, получено ${bound}`);
    }
    return Math.floor(nextFloat() * bound);
  };

  return { nextUint32, nextFloat, nextInt };
}

/** Перемешать произвольный список карт по seed. Вход не мутируется. */
export function shuffled(cards: readonly Card[], seed: Seed): Card[] {
  const rng = createRng(seed);
  const out = [...cards];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = rng.nextInt(i + 1);
    const a = out[i] as Card;
    const b = out[j] as Card;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

/** Новая перемешанная колода из 32 карт по seed. */
export function shuffleDeck(seed: Seed): Card[] {
  return shuffled(createDeck(), seed);
}
