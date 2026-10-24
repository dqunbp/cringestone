import type { PlayerId, PlayerView, TargetRef } from '../core/types';

export const BOARD_Y = .65;
export const HERO_Z = 3.13;
export const HAND_Y = .8;
export const HAND_Z = 4.5;
export type Position = [number, number, number];

export function boardPosition(index: number, count: number, mine: boolean): Position {
  return [(index - (count - 1) / 2) * 1.31, BOARD_Y, mine ? 1 : -1.28];
}

export function heroPosition(mine: boolean): Position {
  return [0, .58, mine ? 2.5 : -HERO_Z];
}

export function targetKey(target: TargetRef): string {
  return target.type === 'hero' ? `hero:${target.playerId}` : target.instanceId;
}

export function targetPosition(view: PlayerView, target: TargetRef): Position {
  const mine = target.playerId === view.selfId;
  if (target.type === 'hero') return heroPosition(mine);
  const player = mine ? view.self : view.opponent;
  const index = player.board.findIndex(unit => unit.id === target.instanceId);
  return boardPosition(Math.max(0, index), player.board.length, mine);
}

export function sourcePosition(view: PlayerView, playerId: PlayerId, id: string): Position {
  return targetPosition(view, { type: 'minion', playerId, instanceId: id });
}
