import { useEffect, useState } from 'react';
import { CARDS, HEROES } from '../core';
import type { GameAction, PlayerView, TargetRef } from '../core/types';
import type { Selection } from '../presentation/types';
import type { LogEntry } from '../presentation/useGameSession';

function sameTarget(first: TargetRef, second: TargetRef): boolean {
  return first.type === second.type && first.playerId === second.playerId && (first.type !== 'minion' || second.type === 'minion' && first.instanceId === second.instanceId);
}

export function selectedActions(selection: Selection, legal: GameAction[]): GameAction[] {
  if (!selection) return [];
  return legal.filter((action) => selection.type === 'card' ? action.type === 'playCard' && action.cardInstanceId === selection.instanceId : selection.type === 'attacker' ? action.type === 'attack' && action.attackerId === selection.instanceId : action.type === 'heroPower');
}

export function BattleHud({ view, busy, selection, legal, log, error, menu, rules, endTurn, power, card, attacker, target, drop, cancel, inspect, soundEnabled, toggleSound }: {
  view: PlayerView; busy: boolean; selection: Selection; legal: GameAction[]; log: LogEntry[]; error: string;
  menu: () => void; rules: () => void; endTurn: () => void; power: () => void;
  card: (id: string) => void; attacker: (id: string) => void; target: (target: TargetRef) => void; drop: () => void; cancel: () => void; inspect: (id: string | null) => void;
  soundEnabled: boolean; toggleSound: () => void;
}) {
  const self = HEROES[view.self.heroId];
  const opponent = HEROES[view.opponent.heroId];
  const [shownHealth, setShownHealth] = useState({ self: view.self.health, opponent: view.opponent.health });
  useEffect(() => {
    // Match the scene's impact beat instead of exposing final HP before the hit.
    const timer = window.setTimeout(() => setShownHealth({ self: view.self.health, opponent: view.opponent.health }), 330);
    return () => window.clearTimeout(timer);
  }, [view.self.health, view.opponent.health]);
  const myTurn = view.activePlayer === 'player' && view.phase === 'playing';
  const enabled = !busy && myTurn;
  const options = selectedActions(selection, legal);
  const targets = options.flatMap((action) => 'target' in action && action.target ? [action.target] : []).filter((item, index, all) => all.findIndex((candidate) => sameTarget(item, candidate)) === index);
  const selectedCard = selection?.type === 'card' ? view.self.hand.find((item) => item.id === selection.instanceId) : undefined;
  const status = selection ? selectedCard && CARDS[selectedCard.cardId].type === 'minion' ? 'Выберите место на вашей стороне стола' : 'Выберите подсвеченную цель' : busy ? 'Карты на столе…' : myTurn ? 'Ваш ход' : view.phase === 'mulligan' ? 'Начальная рука' : 'Противник обдумывает ход';
  const targetName = (ref: TargetRef) => ref.type === 'hero' ? HEROES[ref.playerId === 'player' ? view.self.heroId : view.opponent.heroId].name : CARDS[(ref.playerId === 'player' ? view.self : view.opponent).board.find((item) => item.id === ref.instanceId)!.cardId].name;
  return <div className="battle-hud">
    <header className="battle-top"><button className="small-wordmark" onClick={menu}>Кринжстоун <span>✦</span></button><div className="opponent-heading"><span>{opponent.name}</span><small>Бот · {view.opponent.deckCount} в колоде</small><b className="hero-health">{shownHealth.opponent}<span>♥</span></b></div><div className="battle-nav"><button className="quiet-button" onClick={rules}>Правила</button><button className="icon-button" aria-label={soundEnabled ? 'Выключить звук' : 'Включить звук'} onClick={toggleSound}>{soundEnabled ? '♪' : '♩'}</button><button className="quiet-button" onClick={menu}>Меню</button></div></header>
    <div className={`turn-ribbon ${myTurn ? 'your-turn' : ''}`} role="status" aria-live="polite">{error || status}{selection && <button onClick={cancel}>Отмена <kbd>Esc</kbd></button>}</div>
    <aside className="turn-controls">
      <div className="mana-display"><span className="mana-symbol">◆</span><strong>{view.self.mana}<span> / {view.self.maxMana}</span></strong><small>Мана</small><div className="mana-crystals" aria-hidden="true">{Array.from({ length: Math.max(view.self.maxMana, 1) }, (_, i) => <i className={i < view.self.mana ? 'filled' : ''} key={i} />)}</div></div>
      <button className={`power-button ${selection?.type === 'power' ? 'selected' : ''}`} disabled={!enabled || !legal.some((action) => action.type === 'heroPower')} onClick={power} title={self.powerDescription}><span className="power-icon">{view.self.heroId === 'mage' ? '✧' : '⚒'}</span><strong>{self.powerName}</strong><span className="power-cost">2 маны</span></button>
      <button className="end-turn" disabled={!enabled || !legal.some((action) => action.type === 'endTurn')} onClick={endTurn}>{myTurn ? 'Завершить ход' : 'Ход противника'}<span>Ход {view.turn}</span></button>
      <details className="battle-log"><summary>Хроника партии</summary><ol>{log.length ? log.slice(0, 8).map((entry) => <li key={entry.id}>{entry.text}</li>) : <li>Сейчас начнётся история.</li>}</ol></details>
    </aside>
    <div className="player-heading"><span className="hero-health">{shownHealth.self}<span>♥</span></span><div><strong>{self.name}</strong><small>{view.self.deckCount} в колоде · {view.self.handCount} в руке</small></div></div>
    {view.phase === 'playing' && <details className="accessible-actions"><summary>Карты и цели <span>⌘</span></summary><div className="action-panel">
      <h3>Ваша рука</h3><div className="hand-buttons">{view.self.hand.length ? view.self.hand.map((instance) => <button key={instance.id} disabled={!enabled || !legal.some((action) => action.type === 'playCard' && action.cardInstanceId === instance.id)} className={selection?.type === 'card' && selection.instanceId === instance.id ? 'selected' : ''} onClick={() => card(instance.id)} onMouseEnter={() => inspect(instance.cardId)} onMouseLeave={() => inspect(null)} onFocus={() => inspect(instance.cardId)} onBlur={() => inspect(null)}><b>{CARDS[instance.cardId].cost}</b>{CARDS[instance.cardId].name}</button>) : <p>В руке пока нет карт.</p>}</div>
      {!selection && view.self.board.length > 0 && <><h3>Кто атакует</h3><div className="target-buttons">{view.self.board.map((minion) => <button key={minion.id} disabled={!enabled || !legal.some((action) => action.type === 'attack' && action.attackerId === minion.id)} onClick={() => attacker(minion.id)}>{CARDS[minion.cardId].name}<span>{minion.attack}/{minion.health}</span></button>)}</div></>}
      {selectedCard && CARDS[selectedCard.cardId].type === 'minion' && <button className="brass-button full-width small-button" disabled={!enabled} onClick={drop}>Поставить на стол</button>}
      {targets.length > 0 && <><h3>Выберите цель</h3><div className="target-buttons">{targets.map((ref) => <button key={`${ref.type}-${ref.playerId}-${ref.type === 'minion' ? ref.instanceId : ''}`} disabled={!enabled} onClick={() => target(ref)}>{targetName(ref)}<span>{ref.playerId === 'player' ? 'Ваш' : 'Враг'}</span></button>)}</div></>}
    </div></details>}
    <div className="table-caption">Таверна «Последний аргумент»</div>
  </div>;
}
