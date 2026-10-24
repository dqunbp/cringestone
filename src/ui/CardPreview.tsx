import { assetUrl } from '../presentation/assetUrl';
import { CARDS } from '../core';
import type { CardDefinition } from '../core/types';

export function IllustratedCard({ card, compact = false }: { card: CardDefinition; compact?: boolean }) {
  return <article className={`illustrated-card ${card.type} ${compact ? 'compact-card' : ''}`}>
    <div className="card-cost" aria-label={`Стоимость: ${card.cost}`}>{card.cost}</div>
    <div className="card-art"><img src={assetUrl(card.art)} alt="" draggable={false} /></div>
    <div className="card-paper">
      <h3>{card.name}</h3>
      <span className="card-kind">{card.type === 'minion' ? 'Существо' : 'Заклинание'}</span>
      {card.description && <p>{card.description}</p>}
      {(!compact || !card.description) && <blockquote>{card.flavor}</blockquote>}
    </div>
    {card.type === 'minion' && <div className="card-stats"><span aria-label={`Атака: ${card.attack}`}>{card.attack}</span><span aria-label={`Здоровье: ${card.health}`}>{card.health}</span></div>}
  </article>;
}

export function CardPreview({ cardId }: { cardId: string | null }) {
  if (!cardId || !CARDS[cardId]) return null;
  return <aside className="card-preview" aria-label="Просмотр карты"><IllustratedCard card={CARDS[cardId]} /></aside>;
}
