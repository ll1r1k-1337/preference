/**
 * Публичные типы модуля расчёта (docs/rules.md, приложение А.3).
 *
 * Модуль не зависит ни от UI, ни от модуля хода: единственная точка связи —
 * структура `DealOutcome`.
 */

/** Идентификатор игрока. Модуль не навязывает формат, но требует стабильной сортировки. */
export type PlayerId = string;

/** Уровень игры на взятки (§9.2). */
export type ContractLevel = 6 | 7 | 8 | 9 | 10;

/** Козырь окончательного контракта; `NT` — без козыря (§А.1). */
export type ContractSuit = 'S' | 'C' | 'D' | 'H' | 'NT';

/** Идентификаторы контрактов из таблицы А.1. */
export type TrickContractId =
  | '6S' | '6C' | '6D' | '6H' | '6NT'
  | '7S' | '7C' | '7D' | '7H' | '7NT'
  | '8S' | '8C' | '8D' | '8H' | '8NT'
  | '9S' | '9C' | '9D' | '9H' | '9NT'
  | '10S' | '10C' | '10D' | '10H' | '10NT';

export type ContractId = TrickContractId | 'MIZER';

/** Режим розыгрыша обороны (§5.2). На расчёт не влияет, но входит в контракт данных. */
export type DefenseMode = 'dark' | 'light';

/** Результат раздачи — единственный вход модуля (приложение А.3). */
export type DealOutcome =
  | {
      kind: 'contract';
      contract: TrickContractId;
      declarer: PlayerId;
      /** Взятки всех трёх игроков; сумма = 10. */
      tricks: Record<PlayerId, number>;
      /** Кто из двух соперников вистовал. */
      whisted: Record<PlayerId, boolean>;
      mode: DefenseMode;
    }
  | { kind: 'miser'; declarer: PlayerId; declarerTricks: number }
  | {
      kind: 'raspasy';
      /** Взятки всех трёх игроков; сумма = 10. */
      tricks: Record<PlayerId, number>;
      /** Номер распаса подряд, начиная с 0 (0 — первый распас после сыгранной раздачи). */
      consecutiveIndex: number;
    };

/** Приращение записи одного игрока за одну раздачу (§А.3). */
export interface ScoreDelta {
  player: PlayerId;
  /** Всегда ≥ 0 (§А.3 п.2). */
  pool: number;
  /** Всегда ≥ 0 (§А.3 п.2). */
  mountain: number;
  /** Только ненулевые записи; ключ самого игрока запрещён (§А.3 пп.3–4). */
  vistsOn: Record<PlayerId, number>;
}

/** Табло партии: накопленные пуля, гора и висты. */
export interface Scoreboard {
  players: readonly PlayerId[];
  pool: Record<PlayerId, number>;
  mountain: Record<PlayerId, number>;
  /** `vists[a][b]` — сколько вистов игрок `a` записал на игрока `b`. */
  vists: Record<PlayerId, Record<PlayerId, number>>;
}
