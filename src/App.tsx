import { Component, useCallback, useEffect, useRef, useState } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { useProgress } from '@react-three/drei';
import { CARDS, HEROES } from './core';
import type { GameAction, HeroId, TargetRef } from './core/types';
import { GameScene } from './scene/GameScene';
import type { Selection } from './presentation/types';
import { useGameSession } from './presentation/useGameSession';
import { useSound } from './audio/useSound';
import { MainMenu } from './ui/MainMenu';
import { BattleHud, selectedActions } from './ui/BattleHud';
import { CardPreview } from './ui/CardPreview';
import { DeckView, Modal, Mulligan, Result, Rules } from './ui/Overlays';
import './styles/game.css';

function supportsWebGL2(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2');
    if (!context) return false;
    context.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch { return false; }
}

class SceneBoundary extends Component<{ children: ReactNode; onMenu: () => void; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Не удалось открыть игровой стол', error, info.componentStack);
    this.props.onFailure();
  }
  render() {
    return this.state.failed ? <SceneFailure onMenu={this.props.onMenu} /> : this.props.children;
  }
}

function SceneFailure({ onMenu, unsupported = false }: { onMenu: () => void; unsupported?: boolean }) {
  return <div className="scene-failure" role="alert"><span className="ornament">✧</span><h2>{unsupported ? 'Стол пока не открылся' : 'Таверна не успела подготовиться'}</h2><p>{unsupported ? 'Для игрового стола нужен браузер с WebGL 2. Включите аппаратное ускорение или откройте игру в современном браузере.' : 'Не удалось загрузить игровой стол. Проверьте соединение и попробуйте снова.'}</p><button className="brass-button" onClick={() => window.location.reload()}>Попробовать снова</button><button className="quiet-button" onClick={onMenu}>К выбору героя</button></div>;
}

function LoadingTable({ onMenu }: { onMenu: () => void }) {
  const { progress, total } = useProgress();
  const percent = Math.min(100, Math.max(0, Math.round(progress)));
  return <div className="loading-table" role="status"><span className="loading-star">✦</span><h2>Протираем стол. Будим дракона.</h2><p>{percent === 100 ? 'Зажигаем свечи и расставляем карты.' : 'Загружаем иллюстрации. Первая партия готовится чуть дольше.'}</p><div className="loading-track" role="progressbar" aria-label="Подготовка игрового стола" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><i style={{ width: `${Math.max(4, percent)}%` }} /></div><small>{total ? `${percent}%` : 'Приглашаем героев…'}</small><button className="quiet-button loading-cancel" onClick={onMenu}>К выбору героя</button></div>;
}

function NarrowWindowHint({ inMatch }: { inMatch: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return <dialog ref={dialog} className="narrow-window-hint" aria-labelledby="narrow-window-title" aria-describedby="narrow-window-description" onCancel={(event) => event.preventDefault()}>
    <span className="narrow-window-symbol" aria-hidden="true">↔</span>
    <h2 id="narrow-window-title">Столу нужно больше места</h2>
    <p id="narrow-window-description">Расширьте окно браузера хотя бы до 1024 px.</p>
    <small>{inMatch ? 'Партия приостановлена и продолжится после расширения окна.' : 'Кринжстоун рассчитан на большой карточный стол.'}</small>
  </dialog>;
}

function equalTarget(a: TargetRef, b: TargetRef): boolean {
  return a.type === b.type && a.playerId === b.playerId && (a.type !== 'minion' || b.type === 'minion' && a.instanceId === b.instanceId);
}

export default function App() {
  const [heroId, setHeroId] = useState<HeroId>('goblin');
  const [overlay, setOverlay] = useState<'rules' | 'deck' | 'menu' | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [inspect, setInspect] = useState<string | null>(null);
  const [mulligan, setMulligan] = useState<string[]>([]);
  const [sceneReady, setSceneReady] = useState(false);
  const [sceneKey, setSceneKey] = useState(0);
  const [contextLost, setContextLost] = useState(false);
  const [webglAvailable] = useState(supportsWebGL2);
  const [isNarrow, setIsNarrow] = useState(() => window.matchMedia('(max-width: 1023px)').matches);
  const session = useGameSession(sceneReady, overlay !== null || contextLost || isNarrow);
  const sound = useSound(session.events, session.eventSequence, session.visible);
  const ready = useCallback(() => setSceneReady(true), []);
  const sceneFailed = useCallback(() => { setContextLost(true); setSceneReady(false); }, []);
  const cancel = useCallback(() => setSelection(null), []);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 1023px)');
    const update = () => setIsNarrow(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !overlay) { setSelection(null); setInspect(null); }
    };
    const lose = (event: Event) => { event.preventDefault(); setContextLost(true); setSceneReady(false); };
    window.addEventListener('keydown', key);
    document.addEventListener('webglcontextlost', lose, true);
    return () => { window.removeEventListener('keydown', key); document.removeEventListener('webglcontextlost', lose, true); };
  }, [overlay]);

  const start = useCallback(() => {
    sound.unlock();
    setOverlay(null);
    setSelection(null);
    setInspect(null);
    setMulligan([]);
    setSceneReady(false);
    setContextLost(false);
    setSceneKey((value) => value + 1);
    session.start(heroId);
  }, [heroId, session.start, sound.unlock]);

  const returnToMenu = useCallback(() => {
    session.reset();
    setOverlay(null);
    setSelection(null);
    setInspect(null);
    setSceneReady(false);
    setContextLost(false);
  }, [session.reset]);

  const perform = useCallback((action: GameAction) => {
    // Scene drag-release and HTML controls share the same atomic dispatcher.
    if (action.playerId !== 'player') return;
    if (session.dispatch(action)) { setSelection(null); setInspect(null); }
  }, [session.dispatch]);

  const cardSelect = useCallback((instanceId: string) => {
    if (session.busy || !sceneReady || overlay || session.view?.activePlayer !== 'player') return;
    const instance = session.view.self.hand.find((item) => item.id === instanceId);
    if (!instance) return;
    const actions = session.legalActions.filter((action) => action.type === 'playCard' && action.cardInstanceId === instanceId);
    if (!actions.length) return;
    if (selection?.type === 'card' && selection.instanceId === instanceId) { cancel(); return; }
    const untargeted = actions.find((action) => action.type === 'playCard' && !action.target);
    if (CARDS[instance.cardId].type === 'spell' && untargeted) { perform(untargeted); return; }
    sound.click();
    setSelection({ type: 'card', instanceId });
  }, [session.busy, session.legalActions, session.view, sceneReady, overlay, selection, cancel, perform, sound.click]);

  const attackerSelect = useCallback((instanceId: string) => {
    if (session.busy || !sceneReady || overlay) return;
    if (!session.legalActions.some((action) => action.type === 'attack' && action.attackerId === instanceId)) return;
    sound.click();
    setSelection(selection?.type === 'attacker' && selection.instanceId === instanceId ? null : { type: 'attacker', instanceId });
  }, [session.busy, session.legalActions, sceneReady, overlay, sound.click, selection]);

  const onTarget = useCallback((target: TargetRef) => {
    const action = selectedActions(selection, session.legalActions).find((candidate) => 'target' in candidate && candidate.target && equalTarget(candidate.target, target));
    if (action) perform(action);
  }, [selection, session.legalActions, perform]);

  const onBoardDrop = useCallback((position?: number) => {
    const actions = selectedActions(selection, session.legalActions);
    const action = actions.find((candidate) => candidate.type === 'playCard' && !candidate.target && (position === undefined || candidate.position === position)) ?? actions.find((candidate) => candidate.type === 'playCard' && !candidate.target);
    if (action?.type === 'playCard') perform(position === undefined ? action : { ...action, position });
  }, [selection, session.legalActions, perform]);

  const heroPower = useCallback(() => {
    if (session.busy || !sceneReady || overlay) return;
    const powers = session.legalActions.filter((action) => action.type === 'heroPower');
    const untargeted = powers.find((action) => action.type === 'heroPower' && !action.target);
    if (untargeted) perform(untargeted);
    else if (powers.length) { sound.click(); setSelection(selection?.type === 'power' ? null : { type: 'power' }); }
  }, [session.busy, session.legalActions, sceneReady, overlay, perform, sound.click, selection]);

  const view = session.view;
  return <>
    {!view ? <MainMenu heroId={heroId} select={(id) => { setHeroId(id); sound.click(); }} start={start} deck={() => setOverlay('deck')} rules={() => setOverlay('rules')} soundEnabled={sound.enabled} toggleSound={sound.toggle} /> : <main className="game-shell">
      {webglAvailable && !contextLost ? <SceneBoundary key={sceneKey} onMenu={returnToMenu} onFailure={sceneFailed}><div className="scene-host"><GameScene view={view} selection={selection} legalActions={session.legalActions} busy={session.busy || !sceneReady || overlay !== null || isNarrow} events={session.events} eventSequence={session.eventSequence} onCardSelect={cardSelect} onAttackerSelect={attackerSelect} onTarget={onTarget} onBoardDrop={onBoardDrop} onCancel={cancel} onAction={perform} onInspect={setInspect} onReady={ready} onAnimationComplete={session.completeAnimation} /></div>{!sceneReady && <LoadingTable onMenu={returnToMenu} />}</SceneBoundary> : <SceneFailure onMenu={returnToMenu} unsupported={!webglAvailable} />}
      {sceneReady && <>
        <BattleHud view={view} busy={session.busy || overlay !== null || isNarrow} selection={selection} legal={session.legalActions} log={session.log} error={session.error} menu={() => { setInspect(null); setOverlay('menu'); }} rules={() => { setInspect(null); setOverlay('rules'); }} endTurn={() => perform({ type: 'endTurn', playerId: 'player' })} power={heroPower} card={cardSelect} attacker={attackerSelect} target={onTarget} drop={() => onBoardDrop()} cancel={cancel} inspect={setInspect} soundEnabled={sound.enabled} toggleSound={sound.toggle} />
        {!overlay && view.phase === 'playing' && <CardPreview cardId={inspect} />}
        {!overlay && (view.phase === 'mulligan' || session.uiPresentationPending) && <Mulligan view={view} selected={mulligan} setSelected={setMulligan} busy={session.busy} eventSequence={session.eventSequence} presentationPending={session.uiPresentationPending} onAnimationComplete={session.completeUiAnimation} confirm={() => perform({ type: 'mulligan', playerId: 'player', cardIds: mulligan })} />}
        {!overlay && view.phase === 'finished' && !session.busy && <Result view={view} replay={start} menu={returnToMenu} />}
      </>}
      {!session.visible && <div className="paused-notice">Партия приостановлена</div>}
    </main>}
    {overlay === 'rules' && <Rules onClose={() => setOverlay(null)} />}
    {overlay === 'deck' && <DeckView heroId={heroId} onClose={() => setOverlay(null)} />}
    {overlay === 'menu' && <Modal title="У стола есть пауза" onClose={() => setOverlay(null)}>
      <p className="dialog-subtitle">{HEROES[heroId].name} дождётся вашего возвращения.</p>
      <div className="pause-actions"><button className="brass-button full-width" onClick={() => setOverlay(null)}>Вернуться в партию</button><button className="quiet-button full-width" onClick={() => setOverlay('rules')}>Как играть</button></div>
      <div className="sound-settings"><button className="quiet-button" onClick={sound.toggle}>Звук: {sound.enabled ? 'включён' : 'выключен'}</button><label>Громкость<input type="range" min="0" max="1" step="0.05" value={sound.volume} onChange={(event) => sound.setVolume(Number(event.target.value))} /></label></div>
      <div className="pause-bottom"><button className="quiet-button" onClick={start}>Начать заново</button><button className="quiet-button" onClick={returnToMenu}>Выбрать героя</button></div>
    </Modal>}
    {isNarrow && <NarrowWindowHint inMatch={view !== null} />}
  </>;
}
