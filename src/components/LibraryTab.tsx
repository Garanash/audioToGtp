import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';

const LATIN_LETTERS = '0-9 A B C D E F G H I J K L M N O P Q R S T U V W X Y Z'.split(' ');
const CYRILLIC_LETTERS = 'А Б В Г Д Е Ж З И К Л М Н О П Р С Т У Ф Х Ц Ч Ш Щ Э Ю Я'.split(' ');

interface ArtistEntry {
  artistSlug: string;
  artist: string;
  tabsCount: number;
}

interface TabEntry {
  id: string;
  path: string;
  artistSlug: string;
  artist: string;
  title: string;
  format: string;
  sizeKb: number;
  downloads: number;
  rating: number;
}

export function LibraryTab() {
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [artists, setArtists] = useState<ArtistEntry[]>([]);
  const [loadingArtists, setLoadingArtists] = useState(false);
  const [selectedArtist, setSelectedArtist] = useState<ArtistEntry | null>(null);
  const [tabs, setTabs] = useState<TabEntry[]>([]);
  const [loadingTabs, setLoadingTabs] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadArtists = async () => {
      setLoadingArtists(true);
      try {
        const res = await fetch('/api/library/artists');
        const data = (await res.json()) as { items?: ArtistEntry[] };
        if (!cancelled) {
          const next = Array.isArray(data.items) ? data.items : [];
          setArtists(next);
          if (next.length > 0) setSelectedArtist(next[0]);
        }
      } finally {
        if (!cancelled) setLoadingArtists(false);
      }
    };
    void loadArtists();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedArtist) {
      setTabs([]);
      return;
    }
    let cancelled = false;
    const loadTabs = async () => {
      setLoadingTabs(true);
      try {
        const res = await fetch(`/api/library/tabs?artist_slug=${encodeURIComponent(selectedArtist.artistSlug)}`);
        const data = (await res.json()) as { items?: TabEntry[] };
        if (!cancelled) {
          setTabs(Array.isArray(data.items) ? data.items : []);
        }
      } finally {
        if (!cancelled) setLoadingTabs(false);
      }
    };
    void loadTabs();
    return () => {
      cancelled = true;
    };
  }, [selectedArtist?.artistSlug]);

  const filteredArtists = useMemo(() => {
    return artists.filter((artist) => {
      const firstChar = artist.artist.trim().charAt(0).toUpperCase();
      const isDigit = /^[0-9]/.test(artist.artist);
      const matchesLetter =
        !selectedLetter ||
        (selectedLetter === '0-9' && isDigit) ||
        (selectedLetter !== '0-9' && selectedLetter.length === 1 && firstChar === selectedLetter);
      const matchesSearch =
        !searchQuery || artist.artist.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesLetter && matchesSearch;
    });
  }, [artists, selectedLetter, searchQuery]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div className="rounded-2xl border border-[#2A2A2A] bg-[#111111] p-8">
        <h3 className="mb-6 text-xl font-bold text-[#E0E0E0]">
          Библиотека табулатур
        </h3>
        <p className="mb-6 text-[#A0A0A0]">
          Выберите букву или найдите табулатуру по названию
        </p>

        <div className="mb-6">
          <p className="mb-3 text-sm font-medium text-[#A0A0A0]">Латиница</p>
          <div className="flex flex-wrap gap-2">
            {LATIN_LETTERS.map((letter) => (
              <button
                key={letter}
                onClick={() => setSelectedLetter(selectedLetter === letter ? null : letter)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  selectedLetter === letter
                    ? 'bg-gradient-to-r from-[#8A2BE2] to-[#4B0082] text-white'
                    : 'border border-[#2A2A2A] text-[#A0A0A0] hover:border-[#8A2BE2] hover:text-[#E0E0E0]'
                }`}
              >
                {letter}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <p className="mb-3 text-sm font-medium text-[#A0A0A0]">Кириллица</p>
          <div className="flex flex-wrap gap-2">
            {CYRILLIC_LETTERS.map((letter) => (
              <button
                key={letter}
                onClick={() => setSelectedLetter(selectedLetter === letter ? null : letter)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  selectedLetter === letter
                    ? 'bg-gradient-to-r from-[#8A2BE2] to-[#4B0082] text-white'
                    : 'border border-[#2A2A2A] text-[#A0A0A0] hover:border-[#8A2BE2] hover:text-[#E0E0E0]'
                }`}
              >
                {letter}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <input
            type="text"
            placeholder="Поиск по исполнителю или названию..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-[#2A2A2A] bg-[#0A0A0A] px-4 py-3 text-[#E0E0E0] placeholder-[#A0A0A0] focus:border-[#8A2BE2] focus:outline-none"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-[320px_1fr]">
          <div className="max-h-[72vh] overflow-auto rounded-xl border border-[#2A2A2A] bg-[#0F0F0F] p-2">
            {loadingArtists ? (
              <p className="p-3 text-sm text-[#A0A0A0]">Загрузка исполнителей...</p>
            ) : filteredArtists.length === 0 ? (
              <p className="p-3 text-sm text-[#A0A0A0]">Исполнители не найдены.</p>
            ) : (
              filteredArtists.map((artist) => (
                <button
                  key={artist.artistSlug}
                  type="button"
                  onClick={() => setSelectedArtist(artist)}
                  className={`mb-1 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    selectedArtist?.artistSlug === artist.artistSlug
                      ? 'border-[#8A2BE2]/70 bg-[#8A2BE2]/15 text-[#E0E0E0]'
                      : 'border-transparent text-[#A0A0A0] hover:border-[#2A2A2A] hover:bg-[#151515] hover:text-[#E0E0E0]'
                  }`}
                >
                  <span className="truncate">{artist.artist}</span>
                  <span className="text-xs text-[#7F7F7F]">{artist.tabsCount}</span>
                </button>
              ))
            )}
          </div>

          <div className="space-y-2">
            {!selectedArtist ? (
              <p className="py-12 text-center text-[#A0A0A0]">Выберите исполнителя слева.</p>
            ) : loadingTabs ? (
              <p className="py-12 text-center text-[#A0A0A0]">Загрузка табов...</p>
            ) : tabs.length === 0 ? (
              <p className="py-12 text-center text-[#A0A0A0]">Для этого исполнителя табы не найдены.</p>
            ) : (
              tabs.map((tab, idx) => (
                <motion.div
                  key={tab.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.015 }}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#2A2A2A] bg-[#1A1A1A] p-4 transition-colors hover:border-[#3A3A3A]"
                >
                  <div className="min-w-0 flex-1">
                    <h4 className="font-semibold text-[#E0E0E0]">
                      {tab.artist} — {tab.title}
                    </h4>
                    <div className="mt-1 flex flex-wrap gap-4 text-sm text-[#A0A0A0]">
                      <span>{tab.format.toUpperCase()}</span>
                      <span>{tab.sizeKb.toFixed(2)} Kb</span>
                      <span>Скачиваний: {tab.downloads}</span>
                      <span className="text-[#8A2BE2]">
                        {'★'.repeat(Math.round(tab.rating))}{'☆'.repeat(Math.max(0, 5 - Math.round(tab.rating)))}
                      </span>
                    </div>
                  </div>
                  <a
                    className="shrink-0 rounded-full bg-gradient-to-r from-[#8A2BE2] to-[#4B0082] px-6 py-2 font-semibold text-white transition-all duration-300 hover:scale-105"
                    href={`/api/library/download?path=${encodeURIComponent(tab.path)}`}
                  >
                    Скачать
                  </a>
                </motion.div>
              ))
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
