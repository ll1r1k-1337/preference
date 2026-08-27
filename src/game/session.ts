/**
 * Сессия журнала: состояние партии + лист записи.
 *
 * Игровой логики нет — только запись результатов раздач, введённых вручную.
 */
import type { DealOutcome } from '../scoring/index.js';
import {
  buildSheet,
  createParty,
  isPartyClosed,
  loadParty,
  recordDeal,
  saveParty,
  type CreatePartyInput,
  type PartyState,
  type Sheet,
} from './party.js';

export interface Session {
  readonly party: PartyState;
  readonly sheet: Sheet;
  readonly closed: boolean;
}

function toSession(party: PartyState): Session {
  return { party, sheet: buildSheet(party), closed: isPartyClosed(party) };
}

/** Новая партия. */
export function newSession(input: CreatePartyInput = {}): Session {
  return toSession(createParty(input));
}

/** Восстановить партию из localStorage; `null`, если сохранения нет. */
export function restoreSession(storage: Storage): Session | null {
  const party = loadParty(storage);
  return party === null ? null : toSession(party);
}

export function persist(session: Session, storage: Storage): void {
  saveParty(session.party, storage);
}

/** Записать раздачу и вернуть обновлённую сессию. */
export function addDeal(session: Session, outcome: DealOutcome): Session {
  const party = recordDeal(session.party, outcome);
  return toSession(party);
}

/** Восстановить сессию из сырого PartyState (для мульти-партийного хранилища). */
export function fromParty(party: PartyState): Session {
  return toSession(party);
}
