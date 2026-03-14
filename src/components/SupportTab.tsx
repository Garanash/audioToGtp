import { motion } from 'framer-motion';

const FAQ = [
  {
    q: 'Почему качество распознавания отличается на разных треках?',
    a: 'Сложные миксы с плотной реверберацией и компрессией требуют режима Extreme и ручной правки в редакторе.',
  },
  {
    q: 'Как ускорить обработку?',
    a: 'Используйте backend + Celery + Redis. Тогда разделение и конвертация идут в фоне без подвисаний интерфейса.',
  },
  {
    q: 'Как получить лучший результат для табулатуры?',
    a: 'Сначала разделите дорожки, затем вручную проверьте инструмент и сетку квантования 1/8, 1/16, 1/32.',
  },
];

export function SupportTab() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="rounded-2xl border border-[#2A2A2A] bg-[#111111] p-8">
        <h3 className="mb-2 text-2xl font-bold tracking-tight text-[#E0E0E0]">Поддержка Musicvibe</h3>
        <p className="mb-6 text-[#A0A0A0]">Ответим по качеству распознавания, ошибкам и настройке pipeline.</p>
        <div className="mb-6 grid gap-3 md:grid-cols-3">
          <a href="mailto:support@musicvibe.ru" className="rounded-xl border border-[#2A2A2A] bg-[#1A1A1A] p-4 transition-colors hover:border-[#8A2BE2]">
            <p className="text-sm font-semibold text-[#E0E0E0]">Email</p>
            <p className="mt-1 text-sm text-[#A0A0A0]">support@musicvibe.ru</p>
          </a>
          <a href="#" className="rounded-xl border border-[#2A2A2A] bg-[#1A1A1A] p-4 transition-colors hover:border-[#8A2BE2]">
            <p className="text-sm font-semibold text-[#E0E0E0]">Telegram</p>
            <p className="mt-1 text-sm text-[#A0A0A0]">@musicvibe</p>
          </a>
          <a href="#" className="rounded-xl border border-[#2A2A2A] bg-[#1A1A1A] p-4 transition-colors hover:border-[#8A2BE2]">
            <p className="text-sm font-semibold text-[#E0E0E0]">Статус системы</p>
            <p className="mt-1 text-sm text-emerald-300">Все сервисы работают</p>
          </a>
        </div>
        <div className="grid gap-3">
          {FAQ.map((item) => (
            <div key={item.q} className="rounded-xl border border-[#2A2A2A] bg-[#1A1A1A] p-4">
              <p className="mb-1 text-sm font-semibold text-[#E0E0E0]">{item.q}</p>
              <p className="text-sm text-[#A0A0A0]">{item.a}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 rounded-xl border border-[#2A2A2A] bg-[#1A1A1A] p-4">
          <p className="mb-3 text-sm font-semibold text-[#E0E0E0]">Создать тикет</p>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              placeholder="Ваш email"
              className="rounded-lg border border-[#2A2A2A] bg-[#0F0F0F] px-3 py-2 text-sm text-[#E0E0E0] placeholder-[#6F6F6F]"
            />
            <input
              placeholder="Тема"
              className="rounded-lg border border-[#2A2A2A] bg-[#0F0F0F] px-3 py-2 text-sm text-[#E0E0E0] placeholder-[#6F6F6F]"
            />
          </div>
          <textarea
            rows={4}
            placeholder="Опишите проблему и приложите шаги воспроизведения"
            className="mt-3 w-full rounded-lg border border-[#2A2A2A] bg-[#0F0F0F] px-3 py-2 text-sm text-[#E0E0E0] placeholder-[#6F6F6F]"
          />
          <button className="mt-3 rounded-full bg-gradient-to-r from-[#8A2BE2] to-[#4B0082] px-5 py-2 text-sm font-semibold text-white">
            Отправить запрос
          </button>
        </div>
      </div>
    </motion.div>
  );
}

