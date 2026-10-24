import { CARDS, HEROES } from '../core';
import type { GameEvent, GameState, TargetRef } from '../core/types';

export function targetLabel(target: TargetRef, state: GameState): string {
  if (target.type === 'hero') return HEROES[state.players[target.playerId].heroId].name;
  const minion = state.players[target.playerId].board.find((card) => card.id === target.instanceId);
  return minion ? CARDS[minion.cardId].name : 'Существо';
}

export function describeEvent(event: GameEvent, state: GameState): string | null {
  const who = 'playerId' in event && event.playerId === 'player' ? 'Вы' : 'Противник';
  switch (event.type) {
    case 'cardPlayed': return `${who}: ${CARDS[event.card.cardId].name}`;
    case 'heroPower': return `${who}: ${HEROES[state.players[event.playerId].heroId].powerName}`;
    case 'turnStart': return event.playerId === 'player' ? 'Ваш ход' : 'Ход противника';
    case 'death': return `${CARDS[event.minion.cardId].name} покидает стол`;
    case 'cardBurned': return `${who}: ${CARDS[event.card.cardId].name} — рука переполнена, карта сгорела`;
    // The result is revealed by the result overlay after the final visual action.
    case 'matchEnd': return null;
    case 'damage': return `${targetLabel(event.target, state)}: −${event.amount}`;
    case 'heal': return `${targetLabel(event.target, state)}: +${event.amount}`;
    default: return null;
  }
}
