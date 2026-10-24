import { HEROES } from '../core';
import type { HeroId } from '../core/types';

export function MainMenu({ heroId, select, start, deck, rules, soundEnabled, toggleSound }: { heroId: HeroId; select: (hero: HeroId) => void; start: () => void; deck: () => void; rules: () => void; soundEnabled: boolean; toggleSound: () => void }) {
  return <main className="main-menu">
    <div className="menu-scene" /><div className="menu-shade" />
    <nav className="menu-top"><span className="edition-mark">Истории за карточным столом</span><div><button className="quiet-button" onClick={rules}>Как играть</button><button className="icon-button" aria-label={soundEnabled ? 'Выключить звук' : 'Включить звук'} onClick={toggleSound}>{soundEnabled ? '♪' : '♩'}</button></div></nav>
    <div className="menu-content">
      <header className="game-title"><span className="title-star">✦</span><h1>КРИНЖСТОУН</h1><p>Большие амбиции. Маленькая таверна.</p></header>
      <div className="hero-choices" role="group" aria-label="Выберите героя">
        {(Object.keys(HEROES) as HeroId[]).map((id) => { const hero = HEROES[id]; return <button key={id} className={`hero-choice ${heroId === id ? 'chosen' : ''} hero-${id}`} aria-pressed={heroId === id} onClick={() => select(id)}>
          <img src={hero.art} alt="" className="hero-portrait" draggable={false} /><span className="hero-vignette" />
          <span className="hero-choice-copy"><span className="hero-title">{hero.title}</span><strong>{hero.name}</strong><span className="hero-description">{hero.description}</span></span>
          <span className="chosen-mark" aria-hidden="true">{heroId === id ? '✦' : '◇'}</span>
        </button>; })}
      </div>
      <div className="menu-action"><button className="brass-button play-button" onClick={start}><span>Занять место за столом</span><span className="button-spark">✦</span></button><button className="deck-link" onClick={deck}>Посмотреть колоду <span>30 карт</span></button></div>
      <p className="menu-footnote">Одна партия. Два героя. Ни одного серьёзного лица.</p>
    </div>
    <footer className="menu-footer"><span>Одиночная игра против бота</span><span>Для тех, кто пришёл за приключениями</span></footer>
  </main>;
}
