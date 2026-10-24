import type { CardDefinition, HeroDefinition, HeroId } from './types';

const minion = (
  id: string, name: string, cost: number, attack: number, health: number,
  flavor: string, extra: Partial<CardDefinition> = {},
): CardDefinition => ({
  id, name, type: 'minion', faction: 'neutral', cost, attack, health,
  description: '', flavor, art: `/assets/cards/${id}.png`, ...extra,
});

const spell = (
  id: string, name: string, faction: HeroId | 'token', cost: number,
  effect: NonNullable<CardDefinition['effect']>, description: string, flavor: string,
): CardDefinition => ({ id, name, type: 'spell', faction, cost, effect, description, flavor, art: `/assets/cards/${id}.png` });

export const CARDS: Record<string, CardDefinition> = {
  squire: minion('squire', 'Оруженосец на полставки', 1, 1, 2, 'Щит казённый. Храбрость своя.'),
  mushroom: minion('mushroom', 'Гриб с претензией', 2, 2, 3, 'Не собирается. Сам собирает.'),
  duelist: minion('duelist', 'Дуэлянт с поварёшкой', 2, 3, 2, 'Выбирай оружие. Только ложку не бери.'),
  turtle: minion('turtle', 'Черепаха в командировке', 3, 3, 4, 'Прибыла вчера. Вышла в прошлом году.'),
  troll: minion('troll', 'Тролль техподдержки', 4, 4, 5, 'А вы пробовали выключить магию?'),
  ogre: minion('ogre', 'Огр деликатный', 5, 5, 6, 'Сначала стучит. Потом вместе с дверью.'),
  dragon: minion('dragon', 'Дракон бухгалтерии', 6, 6, 7, 'Сводит баланс. Иногда огнём.'),
  guard: minion('guard', 'Страж калитки', 3, 2, 3, 'Калитки давно нет. Работа осталась.', { taunt: true, description: 'Провокация.' }),
  sentinel: minion('sentinel', 'Рыцарь кастрюли', 4, 3, 5, 'Суп не пройдёт!', { taunt: true, description: 'Провокация.' }),
  librarian: minion('librarian', 'Библиотекарь запретного отдела', 3, 2, 2, 'Вернуть до конца света.', { effect: { type: 'draw', amount: 1 }, description: 'Боевой клич: возьмите карту.' }),
  spark: spell('spark', 'Неловкая искра', 'mage', 1, { type: 'damage', amount: 2 }, 'Наносит 2 урона выбранному врагу.', 'Это ещё не пожар. Это заявка.'),
  fireball: spell('fireball', 'Огненный аргумент', 'mage', 4, { type: 'damage', amount: 6 }, 'Наносит 6 урона выбранному врагу.', 'Убедительно. Даже слишком.'),
  insight: spell('insight', 'Шпаргалка архимага', 'mage', 3, { type: 'draw', amount: 2 }, 'Возьмите 2 карты.', 'Мелким почерком: не читать вслух.'),
  storm: spell('storm', 'Контрольная по бурям', 'mage', 7, { type: 'areaDamage', amount: 4 }, 'Наносит 4 урона всем вражеским существам.', 'Пересдача не предусмотрена.'),
  apprentice: minion('apprentice', 'Практикант с огоньком', 3, 3, 3, 'Технику безопасности прочитает после.', { faction: 'mage', effect: { type: 'damageEnemyHero', amount: 1 }, description: 'Боевой клич: нанесите 1 урон вражескому герою.' }),
  recruits: spell('recruits', 'Срочный набор', 'goblin', 2, { type: 'summon', amount: 2 }, 'Призывает двух стажёров 1/1.', 'Опыт не нужен. Страховки нет.'),
  promotion: spell('promotion', 'Повышение без зарплаты', 'goblin', 2, { type: 'buff', attack: 2, health: 2 }, 'Даёт вашему существу +2/+2.', 'Зато теперь ты ведущий.'),
  soup: spell('soup', 'Профсоюзный суп', 'goblin', 3, { type: 'healHero', amount: 6 }, 'Восстанавливает вашему герою 6 здоровья.', 'Состав одобрен большинством выживших.'),
  foreman: minion('foreman', 'Бригадир на подхвате', 4, 3, 3, 'Сам не делает. Зато знает кого позвать.', { faction: 'goblin', effect: { type: 'summon', amount: 1 }, description: 'Боевой клич: призовите стажёра 1/1.' }),
  chief: minion('chief', 'Начальник двух стажёров', 5, 4, 4, 'Большой отдел начинается с громкой должности.', { faction: 'goblin', effect: { type: 'summon', amount: 2 }, description: 'Боевой клич: призовите двух стажёров 1/1.' }),
  intern: minion('intern', 'Стажёр', 1, 1, 1, 'Первый день. Последняя надежда.', { faction: 'token' }),
  coin: spell('coin', 'Счастливый жетон', 'token', 0, { type: 'coin' }, 'Даёт 1 ману только на этот ход.', 'На обед не хватит. На заклинание — вполне.'),
};

export const HEROES: Record<HeroId, HeroDefinition> = {
  goblin: {
    id: 'goblin', name: 'Бригадир Шпунт', title: 'Гоблинский профсоюз',
    description: 'Соберите шумную бригаду, укрепите её и задавите противника числом.',
    powerName: 'Новый стажёр', powerDescription: 'За 2 маны призовите стажёра 1/1. Один раз за ход.',
    art: '/assets/heroes/goblin.png', color: '#cba24d',
  },
  mage: {
    id: 'mage', name: 'Профессор Пых', title: 'Академия случайного волшебства',
    description: 'Сдерживайте противника заклинаниями и готовьте решающий огненный аргумент.',
    powerName: 'Маленький пых', powerDescription: 'За 2 маны нанесите 1 урон выбранному врагу. Один раз за ход.',
    art: '/assets/heroes/mage.png', color: '#ab88d0',
  },
};

const neutral = ['squire', 'mushroom', 'duelist', 'turtle', 'troll', 'ogre', 'dragon', 'guard', 'sentinel', 'librarian'];
const twice = (cards: string[]) => cards.flatMap((id) => [id, id]);
export const DECKS: Record<HeroId, string[]> = {
  goblin: twice([...neutral, 'recruits', 'promotion', 'soup', 'foreman', 'chief']),
  mage: twice([...neutral, 'spark', 'fireball', 'insight', 'storm', 'apprentice']),
};
