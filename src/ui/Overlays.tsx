import { assetUrl } from '../presentation/assetUrl';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CARDS, DECKS, HEROES } from '../core';
import type { HeroId, PlayerView } from '../core/types';
import { IllustratedCard } from './CardPreview';

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return <dialog ref={dialogRef} className={`game-dialog ${wide ? 'wide-dialog' : ''}`} onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header className="dialog-heading"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Закрыть">×</button></header>
    {children}
  </dialog>;
}

export function Rules({ onClose }: { onClose: () => void }) {
  return <Modal title="За столом всё просто" onClose={onClose}>
    <div className="rules-copy">
      <p className="lead">Сведите здоровье соперника с 30 до нуля. Желательно раньше, чем он сделает то же самое.</p>
      <ol>
        <li><strong>Мана платит за карты.</strong> Каждый ваш ход её запас восстанавливается и растёт на один, до 10.</li>
        <li><strong>Существа занимают стол.</strong> Разыгранное существо обычно атакует со следующего вашего хода. На вашей стороне помещается семь существ.</li>
        <li><strong>Выберите атакующего, затем цель.</strong> Существа наносят урон друг другу одновременно. Сначала придётся разобраться с вражеской «Провокацией».</li>
        <li><strong>Заклинания работают сразу.</strong> Если карта требует цель, выберите подсвеченного героя или существо. Сила героя стоит 2 маны и доступна раз за ход.</li>
        <li><strong>Карты заканчиваются.</strong> В руке помещается 10 карт. Пустая колода наносит всё возрастающий урон при попытке добора.</li>
      </ol>
      <div className="control-note"><kbd>Esc</kbd><span>Отменить выбор карты или цели. Карты можно перетаскивать на стол; те же действия доступны в панели «Карты и цели».</span></div>
    </div>
    <button className="brass-button full-width" onClick={onClose}>Всё ясно</button>
  </Modal>;
}

export function DeckView({ heroId, onClose }: { heroId: HeroId; onClose: () => void }) {
  const counts = new Map<string, number>();
  for (const id of DECKS[heroId]) counts.set(id, (counts.get(id) ?? 0) + 1);
  return <Modal title={`Колода: ${HEROES[heroId].name}`} onClose={onClose} wide>
    <p className="dialog-subtitle">30 карт · по две копии каждой · готова к бою</p>
    <div className="deck-grid">{[...counts].map(([id, count]) => <div className="deck-entry" key={id}><IllustratedCard card={CARDS[id]} compact /><span className="copy-count">× {count}</span></div>)}</div>
  </Modal>;
}

export function Mulligan({ view, selected, setSelected, confirm, busy, eventSequence, presentationPending, onAnimationComplete }: {
  view: PlayerView; selected: string[]; setSelected: (ids: string[]) => void; confirm: () => void; busy: boolean;
  eventSequence: number; presentationPending: boolean; onAnimationComplete: (sequence: number) => void;
}) {
  const originalHand = useRef(view.self.hand);
  const cardsRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<'dealing' | 'choosing' | 'replacing' | 'ready'>('dealing');
  const current = useRef({ view, presentationPending, onAnimationComplete });
  current.current = { view, presentationPending, onAnimationComplete };

  useLayoutEffect(() => {
    const { view: next, presentationPending: pending, onAnimationComplete: complete } = current.current;
    if (!pending) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const replacing = next.self.mulliganDone;
    setStage(replacing ? 'replacing' : 'dealing');
    const nodes = [...(cardsRef.current?.querySelectorAll<HTMLElement>('.mulligan-flip') ?? [])];
    const changed = originalHand.current.map((card, index) => card.id !== next.self.hand[index]?.id);
    let cancelled = false;
    const animations = nodes.map((node, index) => {
      if (reduced) return node.animate([{ opacity: 0.65 }, { opacity: 1 }], { duration: 100, fill: 'forwards' });
      if (!replacing) return node.animate([
        { opacity: 0, transform: 'translate3d(0, 95px, 0) rotate(-7deg) scale(.82)' },
        { opacity: 1, transform: 'translate3d(0, -8px, 0) rotate(1deg) scale(1.015)', offset: .78 },
        { opacity: 1, transform: 'translate3d(0, 0, 0) rotate(0deg) scale(1)' },
      ], { duration: 620, delay: index * 125, easing: 'cubic-bezier(.2,.7,.25,1)', fill: 'both' });
      if (changed[index]) return node.animate([
        { transform: 'translateY(0) rotateY(0deg)' },
        { transform: 'translateY(-38px) rotateY(90deg)', offset: .3 },
        { transform: 'translateY(0) rotateY(180deg)', offset: .65 },
        { transform: 'translateY(0) rotateY(180deg)' },
      ], { duration: 1450, delay: index * 90, easing: 'cubic-bezier(.3,.1,.3,1)', fill: 'forwards' });
      return node.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-6px)', offset: .4 }, { transform: 'translateY(0)' }], { duration: 700, fill: 'forwards' });
    });
    void Promise.all(animations.map((animation) => animation.finished)).then(() => {
      if (cancelled) return;
      setStage(replacing ? 'ready' : 'choosing');
      complete(eventSequence);
    }).catch(() => { /* A menu, reset, or new sequence cancels the abandoned reveal. */ });
    return () => { cancelled = true; animations.forEach((animation) => animation.cancel()); };
  }, [eventSequence]);

  const replacing = view.self.mulliganDone;
  const ready = stage === 'ready';
  return <div className="mulligan-overlay">
    <div className="mulligan-heading"><span className="ornament">✦</span><h2>Хорошее начало — полдела</h2><p>{replacing ? ready ? 'Ваша рука готова. Противник проверяет карманы…' : selected.length ? 'Возвращаем выбранные карты и берём новые.' : 'Оставляем вашу руку. Уже неплохое начало.' : 'Выберите карты для замены или оставьте всё как есть.'}</p><small>{view.firstPlayer === 'player' ? 'Вы ходите первым.' : 'Вы ходите вторым и получите Счастливый жетон.'}</small></div>
    <div className="mulligan-cards" ref={cardsRef}>{originalHand.current.map((instance, index) => {
      const replacement = view.self.hand[index] ?? instance;
      const changed = replacing && replacement.id !== instance.id;
      const shown = ready && changed ? replacement : instance;
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      return <button key={instance.id} disabled={busy || replacing} className={`mulligan-choice ${!replacing && selected.includes(instance.id) ? 'replace' : ''} ${replacing ? 'committed' : ''}`} aria-pressed={!replacing && selected.includes(instance.id)} aria-label={`${CARDS[shown.cardId].name}: ${replacing ? 'в начальной руке' : selected.includes(instance.id) ? 'заменить' : 'оставить'}`} onClick={() => setSelected(selected.includes(instance.id) ? selected.filter((id) => id !== instance.id) : [...selected, instance.id])}>
      <div className="mulligan-flip"><div className="mulligan-face"><IllustratedCard card={CARDS[replacing && reduced ? replacement.cardId : instance.cardId]} compact /></div><div className="mulligan-face mulligan-back" aria-hidden="true"><IllustratedCard card={CARDS[replacement.cardId]} compact /></div></div>
      <span className="mulligan-stamp">{replacing ? changed ? 'Новая карта' : 'В вашей руке' : selected.includes(instance.id) ? 'Заменить' : 'Оставить'}</span>
    </button>; })}</div>
    {replacing ? <p className="mulligan-bottom-status" role="status">{ready ? 'Скоро начнётся первый ход' : 'Раскладываем новую руку…'}</p> : <button className="brass-button" disabled={busy} onClick={confirm}>{busy ? 'Раздаём карты…' : selected.length ? `Заменить ${selected.length} и начать` : 'Оставить карты и начать'}</button>}
  </div>;
}

export function Result({ view, replay, menu }: { view: PlayerView; replay: () => void; menu: () => void }) {
  const win = view.winner === 'player';
  return <div className={`result-overlay ${win ? 'victory' : ''}`} role="dialog" aria-modal="true" aria-label="Результат партии">
    <div className="result-medallion"><img src={assetUrl(HEROES[win ? view.self.heroId : view.opponent.heroId].art)} alt="" /></div>
    <span className="ornament">✦</span><h2>{view.winner === 'draw' ? 'Боевая ничья' : win ? 'Славная победа!' : 'Бывает и такое'}</h2>
    <p>{view.winner === 'draw' ? 'Оба героя выложились до последнего.' : win ? 'За этот стол вас ещё долго будут вспоминать.' : 'Сопернику повезло. Есть время проверить ещё раз.'}</p>
    <div className="result-actions"><button className="brass-button" onClick={replay}>Ещё партию</button><button className="quiet-button" onClick={menu}>Выбрать героя</button></div>
  </div>;
}
