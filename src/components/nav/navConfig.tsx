/**
 * Конфигурация пунктов меню в стиле Moises: карточки с иконками и описаниями.
 */

import {
  IconBass,
  IconDrums,
  IconGuitar,
  IconProducer,
  IconVocals,
  IconStems,
  IconMidi,
  IconNotation,
  IconLibrary,
  IconWeb,
  IconDesktop,
  SocialIcons,
} from './NavIcons';
import type { MegaDropdownCard } from './MegaDropdown';

export const MADE_FOR_CARDS: MegaDropdownCard[] = [
  {
    id: 'drums',
    title: 'Барабанщики',
    description: 'Выделяйте ударные из любого трека для репетиций и каверов.',
    href: '#separation',
    ctaText: 'Разделить трек',
    icon: <IconDrums />,
    gradient: 'bg-gradient-to-br from-amber-500/20 to-orange-600/20',
  },
  {
    id: 'vocals',
    title: 'Вокалисты',
    description: 'Минусовки и изоляция вокала для тренировок и выступлений.',
    href: '#separation',
    ctaText: 'Получить минус',
    icon: <IconVocals />,
    gradient: 'bg-gradient-to-br from-rose-500/20 to-pink-600/20',
  },
  {
    id: 'guitar',
    title: 'Гитаристы',
    description: 'Дорожки гитары и баса, конвертация в ноты и табы.',
    href: '#separation',
    ctaText: 'К нотам',
    icon: <IconGuitar />,
    gradient: 'bg-gradient-to-br from-emerald-500/20 to-teal-600/20',
  },
  {
    id: 'bass',
    title: 'Басисты',
    description: 'Отдельный бас из микса и конвертация в MIDI.',
    href: '#conversion',
    ctaText: 'В MIDI',
    icon: <IconBass />,
    gradient: 'bg-gradient-to-br from-blue-500/20 to-indigo-600/20',
  },
  {
    id: 'producers',
    title: 'Продюсеры',
    description: 'Стемсы, MIDI и ноты в одном месте для сведения и аранжировки.',
    href: '#separation',
    ctaText: 'Разделить',
    icon: <IconProducer />,
    gradient: 'bg-gradient-to-br from-[#8A2BE2]/20 to-[#4B0082]/20',
  },
];

export const FEATURES_CARDS: MegaDropdownCard[] = [
  {
    id: 'separation',
    title: 'Разделение дорожек',
    description: 'Разделяй любой трек на стемы: вокал, ударные, бас, гитара и др. с высокой точностью.',
    href: '#separation',
    ctaText: 'Изолировать треки',
    icon: <IconStems />,
    gradient: 'bg-gradient-to-br from-[#8A2BE2]/25 to-[#4B0082]/25',
  },
  {
    id: 'conversion',
    title: 'Конвертация в MIDI',
    description: 'Превращайте стемы в MIDI-дорожки для редакторов и секвенсоров.',
    href: '#conversion',
    ctaText: 'Конвертировать',
    icon: <IconMidi />,
    gradient: 'bg-gradient-to-br from-cyan-500/20 to-blue-600/20',
  },
  {
    id: 'notation',
    title: 'Открыть ноты',
    description: 'Просмотр и воспроизведение нот и табов в браузере.',
    href: '#notation',
    ctaText: 'Открыть ноты',
    icon: <IconNotation />,
    gradient: 'bg-gradient-to-br from-violet-500/20 to-purple-600/20',
  },
  {
    id: 'library',
    title: 'Библиотека табов',
    description: 'Алфавитный каталог табов и быстрый поиск по названию.',
    href: '#library',
    ctaText: 'В библиотеку',
    icon: <IconLibrary />,
    gradient: 'bg-gradient-to-br from-amber-600/20 to-yellow-700/20',
  },
];

export const PLATFORMS_CARDS: MegaDropdownCard[] = [
  {
    id: 'web',
    title: 'Веб',
    description: 'Работайте в браузере — без установки, с любого устройства.',
    href: '#',
    ctaText: 'Открыть',
    icon: <IconWeb />,
    gradient: 'bg-gradient-to-br from-sky-500/20 to-blue-600/20',
  },
  {
    id: 'desktop',
    title: 'Приложение для ПК',
    description: 'Скачайте приложение для Windows или Mac для офлайн-работы.',
    href: '#',
    ctaText: 'Скачать',
    icon: <IconDesktop />,
    gradient: 'bg-gradient-to-br from-[#8A2BE2]/20 to-[#4B0082]/20',
  },
];

export const MEDIA_CARDS: MegaDropdownCard[] = [
  {
    id: 'blog',
    title: 'Блог',
    description: 'Статьи и советы по работе с аудио и нотами.',
    href: '#blog',
    ctaText: 'Читать',
    icon: (
      <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        <path d="M8 7h8M8 11h8" />
      </svg>
    ),
    gradient: 'bg-gradient-to-br from-indigo-500/20 to-purple-600/20',
  },
  {
    id: 'community',
    title: 'Сообщество',
    description: 'Обменивайтесь опытом с другими музыкантами.',
    href: '#community',
    ctaText: 'Присоединиться',
    icon: (
      <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    gradient: 'bg-gradient-to-br from-rose-500/20 to-pink-600/20',
  },
];

export function MediaDropdownFooter() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <p className="text-sm text-[#A0A0A0]">Подпишись на нас</p>
      <SocialIcons />
    </div>
  );
}
