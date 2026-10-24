import type { CardId, GameAction, GameEvent, PlayerView, TargetRef } from '../core/types';

export type Selection =
  | { type: 'card'; instanceId: string }
  | { type: 'attacker'; instanceId: string }
  | { type: 'power' }
  | null;

export interface SceneProps {
  view: PlayerView | null;
  selection: Selection;
  legalActions: GameAction[];
  busy: boolean;
  events: GameEvent[];
  eventSequence: number;
  onCardSelect: (instanceId: string) => void;
  onAttackerSelect: (instanceId: string) => void;
  onTarget: (target: TargetRef) => void;
  onBoardDrop: (position?: number) => void;
  onCancel: () => void;
  onAction?: (action: GameAction) => void;
  onInspect: (cardId: CardId | null) => void;
  onReady?: () => void;
  onAnimationComplete?: (sequence: number) => void;
}
