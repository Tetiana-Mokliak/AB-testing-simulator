import { BarChart3, TrendingUp, CheckCircle } from 'lucide-react';

export default function ABHeader() {
  return (
    <header className="h-16 border-b border-zinc-800 bg-[#0A0A0B]/80 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-50">
      <div className="flex items-center gap-4 text-sm">
        <span className="text-zinc-500 font-mono text-xs hidden sm:inline">Симулятор / Продуктовий аналітик / A/B Тест Реєстрації "StepUp"</span>
        <span className="text-zinc-400 font-display font-medium text-xs bg-zinc-900 border border-zinc-800 px-2.5 py-1 rounded-md sm:hidden">
          A/B Test Реєстрації StepUp
        </span>
      </div>

      <div className="flex items-center gap-3 text-xs text-zinc-350">
        <div className="hidden md:flex items-center gap-2 bg-[#121214] border border-zinc-800 px-3 py-1.5 rounded-lg">
          <CheckCircle size={13} className="text-emerald-400" />
          <span>Продукт: <b className="text-white">Реєстрація</b></span>
        </div>
        <div className="hidden md:flex items-center gap-2 bg-[#121214] border border-zinc-800 px-3 py-1.5 rounded-lg">
          <BarChart3 size={13} className="text-emerald-400" />
          <span>Метрика: <b className="text-white">CR (C1)</b></span>
        </div>
        <span className="text-emerald-500 font-mono font-bold bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-md">
          LIVE DIALOG
        </span>
      </div>
    </header>
  );
}
