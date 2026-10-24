export type HeroId = 'goblin' | 'mage';
export type PlayerId = 'player' | 'bot';
export type CardId = string;

export type Effect =
  | { type: 'damage'; amount: number }
  | { type: 'damageEnemyHero'; amount: number }
  | { type: 'areaDamage'; amount: number }
  | { type: 'draw'; amount: number }
  | { type: 'healHero'; amount: number }
  | { type: 'summon'; amount: number }
  | { type: 'buff'; attack: number; health: number }
  | { type: 'coin' };

export interface CardDefinition {
  id: CardId;
  name: string;
  type: 'minion' | 'spell';
  faction: 'neutral' | HeroId | 'token';
  cost: number;
  attack?: number;
  health?: number;
  taunt?: boolean;
  effect?: Effect;
  description: string;
  flavor: string;
  art: string;
}

export interface CardInstance { id: string; cardId: CardId }
export interface Minion extends CardInstance {
  attack: number;
  health: number;
  maxHealth: number;
  canAttack: boolean;
}
export interface PlayerState {
  id: PlayerId;
  heroId: HeroId;
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  hand: CardInstance[];
  deck: CardInstance[];
  board: Minion[];
  fatigue: number;
  heroPowerUsed: boolean;
  mulliganDone: boolean;
}
export type TargetRef =
  | { type: 'hero'; playerId: PlayerId }
  | { type: 'minion'; playerId: PlayerId; instanceId: string };

export type GameAction =
  | { type: 'mulligan'; playerId: PlayerId; cardIds: string[] }
  | { type: 'playCard'; playerId: PlayerId; cardInstanceId: string; target?: TargetRef; position?: number }
  | { type: 'attack'; playerId: PlayerId; attackerId: string; target: TargetRef }
  | { type: 'heroPower'; playerId: PlayerId; target?: TargetRef }
  | { type: 'endTurn'; playerId: PlayerId }
  | { type: 'concede'; playerId: PlayerId };

export interface GameState {
  phase: 'mulligan' | 'playing' | 'finished';
  activePlayer: PlayerId;
  firstPlayer: PlayerId;
  turn: number;
  rngState: number;
  nextId: number;
  players: Record<PlayerId, PlayerState>;
  winner: PlayerId | 'draw' | null;
}

export type GameEvent =
  | { type: 'matchStart' }
  | { type: 'mulligan'; playerId: PlayerId; count: number }
  | { type: 'cardDrawn' | 'cardBurned'; playerId: PlayerId; card: CardInstance }
  | { type: 'cardPlayed'; playerId: PlayerId; card: CardInstance; target?: TargetRef }
  | { type: 'summon'; playerId: PlayerId; minion: Minion }
  | { type: 'attack'; playerId: PlayerId; attackerId: string; target: TargetRef }
  | { type: 'damage' | 'heal'; target: TargetRef; amount: number; source?: string }
  | { type: 'buff'; target: TargetRef; attack: number; health: number }
  | { type: 'death'; playerId: PlayerId; minion: Minion }
  | { type: 'heroPower'; playerId: PlayerId; target?: TargetRef }
  | { type: 'turnStart'; playerId: PlayerId; turn: number }
  | { type: 'coin'; playerId: PlayerId }
  | { type: 'matchEnd'; winner: PlayerId | 'draw' };

export type Transition =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; state: GameState; events: []; error: string };

export interface VisiblePlayer extends Omit<PlayerState, 'deck' | 'hand'> {
  deckCount: number;
  handCount: number;
  hand: CardInstance[];
}
export interface PlayerView {
  phase: GameState['phase'];
  activePlayer: PlayerId;
  firstPlayer: PlayerId;
  turn: number;
  winner: GameState['winner'];
  selfId: PlayerId;
  self: VisiblePlayer;
  opponent: VisiblePlayer;
}

export interface HeroDefinition {
  id: HeroId;
  name: string;
  title: string;
  description: string;
  powerName: string;
  powerDescription: string;
  art: string;
  color: string;
}
