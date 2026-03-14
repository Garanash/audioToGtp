import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useModelPreload } from './hooks/useModelPreload';
import { motion } from 'framer-motion';
import { Header } from './components/Header';
import { CookieConsent } from './components/CookieConsent';
import { MADE_FOR_CARDS } from './components/nav/navConfig';
import { TelegramQR } from './components/TelegramQR';
import { AlphaModal } from './components/AlphaModal';
import { SeparationTab } from './components/SeparationTab';
import { ConversionTab } from './components/ConversionTab';
import { NotationTab } from './components/NotationTab';
import { LibraryTab } from './components/LibraryTab';
import { CabinetTab } from './components/CabinetTab';
import { ToolsTab } from './components/ToolsTab';
import { SupportTab } from './components/SupportTab';
import { EffectsTab } from './components/EffectsTab';

type TabId =
  | 'separation'
  | 'conversion'
  | 'notation'
  | 'library'
  | 'cabinet'
  | 'vocal-remover'
  | 'pitcher'
  | 'time-signature'
  | 'cutter'
  | 'joiner'
  | 'recorder'
  | 'karaoke'
  | 'effects'
  | 'support';

interface LandingFeatureCard {
  title: string;
  text: string;
  image: string;
  video?: string;
}

interface TourStep {
  selector: string;
  title: string;
  text: string;
  tab?: TabId;
}

const TOUR_SEEN_KEY = 'musca-tour-seen-v1';

function App() {
  useModelPreload();
  const [activeTab, setActiveTab] = useState<TabId>('separation');
  const [showWorkspace, setShowWorkspace] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [tourStepIdx, setTourStepIdx] = useState(0);
  const [tourRect, setTourRect] = useState<DOMRect | null>(null);
  const [, setHideHeroInConversion] = useState(false);
  const [, setHideHeroInSeparation] = useState(false);

  const tabs: { id: TabId; label: string; icon: ReactNode }[] = [
    {
      id: 'separation',
      label: 'Разделение на дорожки',
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
          <rect x="3" y="5" width="8" height="4" rx="2" />
          <rect x="13" y="5" width="8" height="4" rx="2" opacity="0.65" />
          <rect x="3" y="10" width="12" height="4" rx="2" opacity="0.8" />
          <rect x="16" y="10" width="5" height="4" rx="2" />
          <rect x="3" y="15" width="6" height="4" rx="2" />
          <rect x="10" y="15" width="11" height="4" rx="2" opacity="0.7" />
        </svg>
      ),
    },
    {
      id: 'conversion',
      label: 'Конвертация в GTP',
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H14a2 2 0 0 1 2 2v2.2h2.8l-3.4 3.4L12 8.2H14V6H6.5v12H14v-2.2h-2l3.4-3.4 3.4 3.4H16V18a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 17.5v-11Z" />
        </svg>
      ),
    },
    {
      id: 'notation',
      label: 'Открыть ноты',
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
          <rect x="2.5" y="5" width="8.5" height="1.8" rx="0.9" />
          <rect x="2.5" y="8.8" width="8.5" height="1.8" rx="0.9" opacity="0.8" />
          <rect x="2.5" y="12.6" width="8.5" height="1.8" rx="0.9" opacity="0.65" />
          <rect x="2.5" y="16.4" width="8.5" height="1.8" rx="0.9" opacity="0.5" />
          <path d="M16.8 4.2v10.4a3.1 3.1 0 1 1-1.9-2.87V6.1l6-1.4v9.2a3.1 3.1 0 1 1-1.9-2.87V7.1l-2.2.5Z" />
        </svg>
      ),
    },
    {
      id: 'library',
      label: 'Библиотека',
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
          <rect x="4" y="4" width="5" height="16" rx="1.5" />
          <rect x="10" y="5.5" width="5" height="14.5" rx="1.5" opacity="0.82" />
          <rect x="16" y="7" width="4" height="13" rx="1.2" opacity="0.62" />
        </svg>
      ),
    },
    {
      id: 'cabinet',
      label: 'Личный кабинет',
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="8" r="3.2" />
          <path d="M4 20a8 8 0 0 1 16 0v1.2H4V20Z" opacity="0.8" />
        </svg>
      ),
    },
    {
      id: 'vocal-remover',
      label: 'Удаление вокала',
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
          <rect x="8.6" y="3.2" width="6.8" height="11.5" rx="3.4" />
          <path d="M5 11.2a7 7 0 0 0 14 0h-2.1a4.9 4.9 0 1 1-9.8 0H5ZM11 18h2v3h-2zM8.5 20.2h7v1.8h-7z" />
          <path d="M3.8 2.5 21.5 20.2l-1.3 1.3L2.5 3.8z" />
        </svg>
      ),
    },
    {
      id: 'pitcher',
      label: 'Pitcher',
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M4 14a8 8 0 1 1 16 0h-2.2a5.8 5.8 0 1 0-11.6 0H4Z" />
          <path d="m12 13.8 5.8-5.8 1.5 1.5-5.8 5.8z" />
          <circle cx="12" cy="14" r="2.1" />
        </svg>
      ),
    },
    {
      id: 'time-signature',
      label: 'Тактовый размер',
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
          <rect x="5" y="3.8" width="14" height="16.4" rx="2.4" />
          <rect x="7.5" y="8.2" width="9" height="1.7" rx="0.85" fill="#0A0A0A" opacity="0.9" />
          <rect x="7.5" y="14.1" width="9" height="1.7" rx="0.85" fill="#0A0A0A" opacity="0.9" />
          <rect x="11.15" y="6.1" width="1.7" height="11.8" rx="0.85" fill="#0A0A0A" opacity="0.9" />
        </svg>
      ),
    },
    {
      id: 'cutter',
      label: 'Резак',
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="7" cy="7" r="3.3" />
          <circle cx="17" cy="17" r="3.3" />
          <path d="m8.9 9 9.5 9.5-1.4 1.4-9.5-9.5zM13.2 10.6l6-6 1.3 1.3-6 6z" />
        </svg>
      ),
    },
    {
      id: 'joiner',
      label: 'Джоинер',
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8.8 14.6 6.7 16.7a3.2 3.2 0 0 1-4.5-4.5l3.2-3.2a3.2 3.2 0 0 1 4.5 0l.8.8-1.7 1.7-.8-.8a.8.8 0 0 0-1.1 0l-3.2 3.2a.8.8 0 0 0 1.1 1.1l2.1-2.1 1.7 1.7Z" />
          <path d="m15.2 9.4 2.1-2.1a3.2 3.2 0 1 1 4.5 4.5l-3.2 3.2a3.2 3.2 0 0 1-4.5 0l-.8-.8 1.7-1.7.8.8a.8.8 0 0 0 1.1 0l3.2-3.2a.8.8 0 0 0-1.1-1.1l-2.1 2.1-1.7-1.7Z" />
          <rect x="9.1" y="10.9" width="5.8" height="2.2" rx="1.1" />
        </svg>
      ),
    },
    {
      id: 'recorder',
      label: 'Диктофон',
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="12" r="8.3" />
          <circle cx="12" cy="12" r="3.8" fill="#0A0A0A" />
          <circle cx="12" cy="12" r="2.6" />
        </svg>
      ),
    },
    {
      id: 'karaoke',
      label: 'Караоке',
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
          <rect x="3" y="4.8" width="10.2" height="14.4" rx="2.1" />
          <rect x="5.2" y="8.1" width="5.8" height="1.7" rx="0.85" fill="#0A0A0A" opacity="0.95" />
          <rect x="5.2" y="11.3" width="5.8" height="1.7" rx="0.85" fill="#0A0A0A" opacity="0.8" />
          <rect x="5.2" y="14.5" width="4.1" height="1.7" rx="0.85" fill="#0A0A0A" opacity="0.65" />
          <path d="M16.5 7.2v8.1a2.6 2.6 0 1 0 1.9-2.51V8.3l2.9-.7V6l-4.8 1.2Z" />
        </svg>
      ),
    },
    {
      id: 'support',
      label: 'Поддержка',
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M4.2 12.4a7.8 7.8 0 1 1 15.6 0h-2.4a5.4 5.4 0 1 0-10.8 0H4.2Z" />
          <rect x="2.8" y="10.8" width="3.8" height="6.8" rx="1.6" />
          <rect x="17.4" y="10.8" width="3.8" height="6.8" rx="1.6" />
          <rect x="11.4" y="17.9" width="4.3" height="1.8" rx="0.9" />
        </svg>
      ),
    },
    {
      id: 'effects',
      label: 'Эффекты',
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h1A2.5 2.5 0 0 1 10 7.5v9A2.5 2.5 0 0 1 7.5 19h-1A2.5 2.5 0 0 1 4 16.5v-9Zm5.5 4A2.5 2.5 0 0 1 12 9h1a2.5 2.5 0 0 1 2.5 2.5v5A2.5 2.5 0 0 1 13 19h-1a2.5 2.5 0 0 1-2.5-2.5v-5ZM15 7.5A2.5 2.5 0 0 1 17.5 5h1A2.5 2.5 0 0 1 21 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-1A2.5 2.5 0 0 1 15 16.5v-9Z" />
        </svg>
      ),
    },
  ];

  const base = import.meta.env.BASE_URL;
  const landingCards: LandingFeatureCard[] = [
    {
      title: 'Разделяй трек',
      text: 'Demucs + async pipeline + live progress',
      image: `${base}favicon.png`,
    },
  ];

  const tourSteps = useMemo<TourStep[]>(
    () => [
      {
        selector: '[data-tour="top-menu"]',
        title: 'Основное меню',
        text: 'Здесь переключаются все режимы платформы: от разделения до FX-кабинета.',
      },
      {
        selector: '[data-tour-tab="separation"]',
        title: 'Разделение на дорожки',
        text: 'Начинай отсюда: загрузи трек и получи stems для дальнейшей работы.',
        tab: 'separation',
      },
      {
        selector: '[data-tour="workspace-content"]',
        title: 'Рабочая зона',
        text: 'В этой области появляются инструменты выбранной вкладки и результаты обработки.',
      },
    ],
    []
  );

  const renderActiveTab = () => {
    if (activeTab === 'separation') {
      return (
        <SeparationTab
          onWorkflowStateChange={({ started, loading, ready }) => {
            setHideHeroInSeparation(started || loading || ready);
          }}
        />
      );
    }
    if (activeTab === 'conversion') {
      return (
        <ConversionTab
          onWorkflowStateChange={({ started, loading, ready }) => {
            setHideHeroInConversion(started || loading || ready);
          }}
        />
      );
    }
    if (activeTab === 'notation') return <NotationTab convertedTracks={null} />;
    if (activeTab === 'library') return <LibraryTab />;
    if (activeTab === 'cabinet') return <CabinetTab onSwitchToTab={(tab) => { setActiveTab(tab); }} />;
    if (activeTab === 'vocal-remover') return <ToolsTab mode="vocal-remover" />;
    if (activeTab === 'pitcher') return <ToolsTab mode="pitcher" />;
    if (activeTab === 'time-signature') return <ToolsTab mode="time-signature" />;
    if (activeTab === 'cutter') return <ToolsTab mode="cutter" />;
    if (activeTab === 'joiner') return <ToolsTab mode="joiner" />;
    if (activeTab === 'recorder') return <ToolsTab mode="recorder" />;
    if (activeTab === 'karaoke') return <ToolsTab mode="karaoke" />;
    if (activeTab === 'effects') return <EffectsTab />;
    return <SupportTab />;
  };

  useEffect(() => {
    if (!showWorkspace) return;
    const seen = window.localStorage.getItem(TOUR_SEEN_KEY) === '1';
    if (!seen) {
      setActiveTab('separation');
      setTourStepIdx(0);
      setTourOpen(true);
    }
  }, [showWorkspace]);

  useEffect(() => {
    const handler = () => {
      setActiveTab('cabinet');
      setShowWorkspace(true);
    };
    window.addEventListener('musca:openCabinet', handler);
    return () => window.removeEventListener('musca:openCabinet', handler);
  }, []);

  useEffect(() => {
    if (!tourOpen) return;
    const step = tourSteps[tourStepIdx];
    if (step?.tab) setActiveTab(step.tab);
  }, [tourOpen, tourStepIdx, tourSteps]);

  useEffect(() => {
    if (!tourOpen) {
      setTourRect(null);
      return;
    }
    const update = () => {
      const step = tourSteps[tourStepIdx];
      if (!step) return;
      const el = document.querySelector(step.selector) as HTMLElement | null;
      if (!el) {
        setTourRect(null);
        return;
      }
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
      if (step.selector === '[data-tour="top-menu"]') {
        const tabs = document.querySelectorAll('[data-tour-tab]');
        if (tabs.length > 0) {
          let minLeft = Infinity;
          let minTop = Infinity;
          let maxRight = -Infinity;
          let maxBottom = -Infinity;
          tabs.forEach((tab) => {
            const r = (tab as HTMLElement).getBoundingClientRect();
            minLeft = Math.min(minLeft, r.left);
            minTop = Math.min(minTop, r.top);
            maxRight = Math.max(maxRight, r.right);
            maxBottom = Math.max(maxBottom, r.bottom);
          });
          setTourRect(
            new DOMRect(minLeft, minTop, maxRight - minLeft, maxBottom - minTop)
          );
          return;
        }
      }
      setTourRect(el.getBoundingClientRect());
    };
    const timer = window.setTimeout(update, 100);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      window.clearTimeout(timer);
    };
  }, [tourOpen, tourStepIdx, tourSteps, activeTab]);

  const closeTour = () => {
    setTourOpen(false);
    window.localStorage.setItem(TOUR_SEEN_KEY, '1');
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] font-sans">
      <Header />
      <CookieConsent />
      <TelegramQR />
      <AlphaModal />

      <main className="pt-20">
        {!showWorkspace && (
          <>
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="relative w-full min-h-[360px] overflow-hidden md:min-h-[420px]"
            >
              <video
                src={`${import.meta.env.BASE_URL}header-bg.mp4`}
                autoPlay
                muted
                loop
                playsInline
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-[#0A0A0A]/72 backdrop-blur-[2px]" aria-hidden />
              <div className="relative z-10 mx-auto flex min-h-[360px] max-w-7xl flex-col items-start justify-center px-4 py-16 md:min-h-[420px] md:px-6">
                <h1 className="max-w-3xl text-5xl font-extrabold tracking-tight md:text-7xl">
                  <span className="bg-gradient-to-r from-white to-gray-500 bg-clip-text text-transparent">Musicvibe</span>
                </h1>
                <p className="mt-6 max-w-2xl text-lg text-[#E0E0E0]/90 md:text-xl">
                  Разделение, конвертация в GTP, редактура и FX-обработка в одном рабочем пространстве.
                </p>
              </div>
            </motion.section>

            <section className="mx-auto max-w-7xl px-4 py-16 md:px-6">
              <h2 className="mb-8 text-center text-3xl font-extrabold tracking-tight text-[#E0E0E0] md:text-4xl">
                Сделано для
              </h2>
              <div className="grid min-w-0 grid-cols-5 gap-4 overflow-x-auto">
                {MADE_FOR_CARDS.map((card) => (
                  <a
                    key={card.id}
                    href={card.href}
                    onClick={(e) => {
                      e.preventDefault();
                      const tabId = card.href.replace('#', '') as TabId;
                      if (['separation', 'conversion', 'notation', 'library'].includes(tabId)) {
                        setActiveTab(tabId);
                      }
                      setShowWorkspace(true);
                    }}
                    className="group relative isolate overflow-hidden rounded-2xl border border-[#2A2A2A] bg-[#111111] transition-all duration-300 hover:scale-105 hover:border-[#8A2BE2]/60 hover:shadow-lg hover:shadow-[#8A2BE2]/10"
                  >
                    <div className="relative aspect-[3/4] w-full">
                      {card.imageUrl ? (
                        <img
                          src={card.imageUrl}
                          alt=""
                          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                        />
                      ) : (
                        <div className={`absolute inset-0 ${card.gradient || 'bg-[#1A1A1A]'}`} />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A]/60 to-transparent" />
                      <div className="absolute inset-0 flex flex-col justify-end p-5">
                        <h3 className="text-lg font-bold text-white drop-shadow-lg md:text-xl">{card.title}</h3>
                        <p className="mt-1.5 line-clamp-2 text-sm text-[#E0E0E0]/90">{card.description}</p>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </section>

            <section className="mx-auto max-w-7xl space-y-8 px-4 py-14 md:px-6">
              <div className="space-y-5">
                {landingCards.map((card, idx) => (
                  <article
                    key={card.title}
                    className="group relative overflow-hidden rounded-2xl border border-[#2A2A2A] bg-[#111111]"
                  >
                    <div className="relative aspect-[16/7] w-full">
                      <img
                        src={card.image}
                        alt=""
                        className={`absolute inset-0 h-full w-full object-cover transition-all duration-500 ease-in-out group-hover:scale-[1.04] group-hover:opacity-80 ${
                          idx === 0 ? 'object-center' : 'object-top'
                        }`}
                      />
                      <div className="relative z-10 flex h-full max-w-2xl flex-col justify-end p-6 md:p-10">
                        <h3 className="text-3xl font-extrabold tracking-tight text-[#E0E0E0] md:text-5xl">{card.title}</h3>
                        <p className="mt-3 text-base text-[#C9CBD2] md:text-lg">{card.text}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowWorkspace(true)}
                className="group relative w-full overflow-hidden rounded-2xl border-2 border-[#8A2BE2]/40 bg-[#111111] p-8 text-left transition-all duration-300 hover:scale-[1.02] hover:border-[#8A2BE2]/80 hover:shadow-[0_0_40px_rgba(138,43,226,0.2)] md:p-12"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-[#8A2BE2]/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <div className="relative z-10 flex flex-col items-center justify-center text-center md:flex-row md:justify-between md:text-left">
                  <div>
                    <h2 className="text-3xl font-extrabold tracking-tight text-[#E0E0E0] md:text-4xl">
                      Готов начать?
                    </h2>
                    <p className="mx-auto mt-3 max-w-2xl text-[#A0A0A0] md:mx-0">
                      Нажми кнопку и откроется основное рабочее меню со всеми инструментами. Разделение, конвертация, ноты и многое другое — в одном месте.
                    </p>
                  </div>
                  <span className="mt-6 flex shrink-0 items-center gap-2 rounded-full bg-gradient-to-r from-[#8A2BE2] to-[#4B0082] px-8 py-4 text-base font-semibold text-white shadow-lg shadow-[#8A2BE2]/30 transition-all duration-300 group-hover:scale-105 group-hover:shadow-[#8A2BE2]/50 md:mt-0">
                    Начнём
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </span>
                </div>
              </button>
            </section>
          </>
        )}

        {showWorkspace && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mx-auto max-w-7xl space-y-12 px-4 py-16 md:px-6"
          >
            <div data-tour="top-menu" className="flex flex-wrap items-center justify-center gap-3 border-b border-[#2A2A2A] pb-3">
              {tabs.map(({ id, label, icon }) => (
                <button
                  key={id}
                  data-tour-tab={id}
                  onClick={() => setActiveTab(id)}
                  aria-label={label}
                  title={label}
                  className={`group relative flex h-12 w-12 items-center justify-center rounded-full border transition-all duration-300 [&>svg]:h-[22px] [&>svg]:w-[22px] ${
                    activeTab === id
                      ? 'border-[#8A2BE2]/80 bg-gradient-to-br from-[#8A2BE2]/30 to-[#4B0082]/25 text-white shadow-[0_0_24px_rgba(138,43,226,0.35)]'
                      : 'border-[#2A2A2A] bg-[#111111] text-[#A0A0A0] hover:-translate-y-0.5 hover:border-[#8A2BE2]/60 hover:bg-[#1A1A1A] hover:text-[#E0E0E0] hover:shadow-[0_8px_24px_rgba(0,0,0,0.35)]'
                  }`}
                >
                  <span className={`pointer-events-none absolute inset-0 rounded-full transition-opacity duration-300 ${activeTab === id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.16),transparent_55%)]`} />
                  <span className="relative z-10">{icon}</span>
                  <span className="pointer-events-none absolute -top-9 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-md border border-[#2A2A2A] bg-[#0B0B0B] px-2 py-1 text-[11px] text-[#E0E0E0] opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                    {label}
                  </span>
                </button>
              ))}
            </div>
            <div data-tour="workspace-content">
              {renderActiveTab()}
            </div>
          </motion.section>
        )}

        {tourOpen && (
          <div className="fixed inset-0 z-[120]">
            {tourRect ? (
              <div
                className="pointer-events-none fixed rounded-2xl border border-[#8A2BE2] bg-transparent shadow-[0_0_0_9999px_rgba(5,5,8,0.78)]"
                style={{
                  left: Math.max(8, tourRect.left - 20),
                  top: Math.max(8, tourRect.top - 20),
                  width: Math.min(window.innerWidth - 16, tourRect.width + 40),
                  height: Math.min(window.innerHeight - 16, tourRect.height + 40),
                }}
              />
            ) : (
              <div className="absolute inset-0 bg-[#050508]/78" />
            )}
            <div
              className="fixed z-[121] w-[min(92vw,360px)] rounded-2xl border border-[#2A2A2A] bg-[#111111] p-4 shadow-2xl"
              style={{
                left: tourRect ? Math.min(window.innerWidth - 380, Math.max(16, tourRect.right + 14)) : 16,
                top: tourRect ? Math.min(window.innerHeight - 220, Math.max(16, tourRect.top)) : 16,
              }}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-[#8A2BE2]">
                Шаг {tourStepIdx + 1} из {tourSteps.length}
              </p>
              <h4 className="mt-1 text-lg font-bold text-[#E0E0E0]">{tourSteps[tourStepIdx]?.title}</h4>
              <p className="mt-2 text-sm text-[#A0A0A0]">{tourSteps[tourStepIdx]?.text}</p>
              <div className="mt-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={closeTour}
                  className="text-xs text-[#A0A0A0] hover:text-[#E0E0E0]"
                >
                  Пропустить
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTourStepIdx((prev) => Math.max(0, prev - 1))}
                    disabled={tourStepIdx === 0}
                    className="rounded-lg border border-[#2A2A2A] px-3 py-1.5 text-xs text-[#A0A0A0] disabled:opacity-40"
                  >
                    Назад
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (tourStepIdx >= tourSteps.length - 1) {
                        closeTour();
                        return;
                      }
                      setTourStepIdx((prev) => prev + 1);
                    }}
                    className="rounded-lg bg-gradient-to-r from-[#8A2BE2] to-[#4B0082] px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    {tourStepIdx >= tourSteps.length - 1 ? 'Готово' : 'Дальше'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
