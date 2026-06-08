/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import ABHeader from './components/ABHeader';
import AnalyticsWorkspace from './components/AnalyticsWorkspace';
import ConsoleTerminal from './components/ConsoleTerminal';
import { SimulationState, DailyData } from './types';
import { generate30DaysHistory } from './utils';
import { BarChart3, Info, BookOpen, AlertCircle, Sparkles } from 'lucide-react';

export default function App() {
  const [state, setState] = useState<SimulationState>({
    baselineRate: null,
    dailyTrafficAvg: null,
    totalHistoricalVisitors: null,
    totalHistoricalRegistrations: null,
    historicalDailyData: null,
    
    sampleSize: null,
    duration: null,
    
    controlGroupSize: null,
    controlGroupSuccesses: null,
    
    testGroupSize: null,
    testGroupSuccesses: null,
    simulatedUplift: null,
    simulatedTestRate: null,
    
    hypothesisAccepted: false,
    planningParamsSaved: false,
    datasetGenerated: false,
    
    step: 1
  });

  const handleUpdateState = (newState: Partial<SimulationState>) => {
    setState(prev => ({ ...prev, ...newState }));
  };

  React.useEffect(() => {
    if (state.baselineRate && state.dailyTrafficAvg && !state.historicalDailyData) {
      const dailyData = generate30DaysHistory(state.baselineRate, state.dailyTrafficAvg);
      const totalVisitors = dailyData.reduce((acc, curr) => acc + curr.traffic, 0);
      const totalRegistrations = dailyData.reduce((acc, curr) => acc + curr.registrations, 0);
      
      setState(prev => ({
        ...prev,
        historicalDailyData: dailyData,
        totalHistoricalVisitors: totalVisitors,
        totalHistoricalRegistrations: totalRegistrations
      }));
    }
  }, [state.baselineRate, state.dailyTrafficAvg, state.historicalDailyData]);

  const handleGenerateHistory = () => {
    // Left for backwards compatibility or fallback actions
    const rate = 0.405; 
    const traffic = 2000;
    const dailyData = generate30DaysHistory(rate, traffic);
    const totalVisitors = dailyData.reduce((acc, curr) => acc + curr.traffic, 0);
    const totalRegistrations = dailyData.reduce((acc, curr) => acc + curr.registrations, 0);

    setState(prev => ({
      ...prev,
      scenarioId: 1,
      scenarioName: "Оптимізація реєстрації (StepUp)",
      primaryMetricName: "C1 Conversion Rate",
      conversionEventName: "Completed registration",
      baselineRate: rate,
      dailyTrafficAvg: traffic,
      historicalDailyData: dailyData,
      totalHistoricalVisitors: totalVisitors,
      totalHistoricalRegistrations: totalRegistrations,
      step: 2
    }));
  };

  return (
    <div id="app-root" className="min-h-screen bg-[#0A0A0B] text-zinc-200 font-sans flex flex-col lg:flex-row antialiased">
      
      {/* Sidebar Navigation */}
      <aside className="w-full lg:w-64 flex-shrink-0 bg-[#121214] border-b lg:border-b-0 lg:border-r border-zinc-800 flex flex-col justify-between">
        <div>
          <div className="p-6 flex items-center gap-3 border-b border-zinc-800/60 lg:border-b-0">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-black font-extrabold font-display">S↑</div>
            <div>
              <h1 className="text-base font-bold tracking-tight uppercase text-white font-display">
                StepUp <span className="text-emerald-500">Lab</span>
              </h1>
              <p className="text-[10px] text-zinc-500 font-mono tracking-wider">A/B SIMULATOR</p>
            </div>
          </div>
          
          <nav className="p-4 lg:py-6 space-y-2 flex flex-row lg:flex-col overflow-x-auto lg:overflow-visible gap-3 lg:gap-1 border-b border-zinc-800 lg:border-none">
            {/* Step 1 Indicator */}
            <div className={`py-2 px-3.5 rounded-lg flex-1 lg:flex-none border-l-2 transition-all ${
              state.step === 1 
                ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 font-semibold' 
                : 'border-transparent text-zinc-500 hover:bg-zinc-800/30'
            }`}>
              <p className="text-[9px] font-bold uppercase tracking-widest font-mono">Етап 1</p>
              <p className="text-xs font-medium">Вибір Сценарію</p>
            </div>

            {/* Step 2 Indicator */}
            <div className={`py-2 px-3.5 rounded-lg flex-1 lg:flex-none border-l-2 transition-all ${
              state.step === 2 
                ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 font-semibold' 
                : 'border-transparent text-zinc-500 hover:bg-zinc-800/30'
            }`}>
              <p className="text-[9px] font-bold uppercase tracking-widest font-mono">Етап 2</p>
              <p className="text-xs font-medium">Дизайн Тесту</p>
            </div>

            {/* Step 3 Indicator */}
            <div className={`py-2 px-3.5 rounded-lg flex-1 lg:flex-none border-l-2 transition-all ${
              state.step === 3 
                ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 font-semibold' 
                : 'border-transparent text-zinc-500 hover:bg-zinc-800/30'
            }`}>
              <p className="text-[9px] font-bold uppercase tracking-widest font-mono">Етап 3</p>
              <p className="text-xs font-medium">Симуляція & Sandbox</p>
            </div>

            {/* Step 4 Indicator */}
            <div className={`py-2 px-3.5 rounded-lg flex-1 lg:flex-none border-l-2 transition-all ${
              state.step === 4 
                ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 font-semibold' 
                : 'border-transparent text-zinc-500 hover:bg-zinc-800/30'
            }`}>
              <p className="text-[9px] font-bold uppercase tracking-widest font-mono">Етап 4</p>
              <p className="text-xs font-medium">Аналіз & Ментор</p>
            </div>
          </nav>
        </div>

        <div className="p-4 border-t border-zinc-900 hidden lg:block bg-zinc-950/40">
          <div className="bg-zinc-900/60 rounded-xl p-3 text-[11px] text-zinc-400 space-y-2 border border-zinc-800/40 font-mono">
            <div className="flex justify-between items-center">
              <span>Python Kernel:</span>
              <span className="text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-slow inline-block"></span> Active
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span>Model:</span>
              <span className="text-zinc-300">Binomial Distribution</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Confidence:</span>
              <span className="text-zinc-300">95% (α = 0.05)</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Workspace Frame */}
      <div className="flex-1 flex flex-col lg:h-screen lg:overflow-hidden">
        {/* Top Header Bar */}
        <ABHeader />

        {/* Content Body */}
        <div className="flex-1 lg:overflow-y-auto p-4 md:p-6 xl:p-8">
          <div className="max-w-[1400px] mx-auto flex flex-col gap-6">
            
            {/* Context Info Banner */}
            <div className="bg-emerald-500/5 text-emerald-400 border border-emerald-500/10 p-4 rounded-xl flex items-start gap-3">
              <Sparkles size={16} className="text-emerald-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <h3 className="font-bold text-emerald-300 font-display">Портал проведення експерименту</h3>
                <p className="text-zinc-400 leading-relaxed">
                  Тут зібрані історичні метрики StepUp, замітки та математичні підказки. Використовуйте ці дані для оцінки базової конверсії, розрахунку розміру вибірок та прийняття рішень за результатами тесту!
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
              {/* Left Column: Analytics Dashboard & Tooling (5/12 span) */}
              <div id="analytics-column" className="xl:col-span-5 flex flex-col gap-6">
                <AnalyticsWorkspace 
                  historicalData={state.historicalDailyData}
                  totalVisitors={state.totalHistoricalVisitors}
                  totalRegistrations={state.totalHistoricalRegistrations}
                  scenarioName={state.scenarioName}
                  primaryMetricName={state.primaryMetricName}
                  conversionEventName={state.conversionEventName}
                  step={state.step}
                  scenarioId={state.scenarioId}
                  controlGroupSize={state.controlGroupSize}
                  controlGroupSuccesses={state.controlGroupSuccesses}
                  testGroupSize={state.testGroupSize}
                  testGroupSuccesses={state.testGroupSuccesses}
                  simulatedUplift={state.simulatedUplift}
                  simulatedTestRate={state.simulatedTestRate}
                  dailyTrafficAvg={state.dailyTrafficAvg}
                />
              </div>

              {/* Right Column: Console/Terminal & Guides (7/12 span) */}
              <div id="console-column" className="xl:col-span-7 flex flex-col gap-6">
                <ConsoleTerminal 
                  state={state}
                  onUpdateState={handleUpdateState}
                  onGenerateHistory={handleGenerateHistory}
                />
                
                {/* Rules guideline cards */}
                <div className="bg-[#121214] border border-zinc-800 rounded-xl p-5 flex items-start gap-4">
                  <div className="p-2.5 bg-yellow-500/10 rounded-lg text-yellow-400 border border-yellow-500/20 flex-shrink-0">
                    <Info size={16} />
                  </div>
                  <div className="text-xs space-y-1.5 leading-relaxed text-zinc-400">
                    <h4 className="font-bold text-zinc-200">⚠️ Важливі правила для аналітика:</h4>
                    <ul className="list-disc list-inside space-y-1 pl-1 text-zinc-500">
                      <li>
                        <b className="text-zinc-300">Істинні параметри приховані:</b> Випадково обрана базова конверсія та справжній uplift тесту зберігаються лише у пам'яті симулятора для захисту від упередженості!
                      </li>
                      <li>
                        <b className="text-zinc-300">Самостійні розрахунки:</b> Симулятор ніколи не підкаже правильність вибірки чи значення p-value — це ваше основне аналітичне завдання за формулами.
                      </li>
                      <li>
                        <b className="text-zinc-300">Метод моделювання:</b> Трафік і конверсії моделюються через точний <b className="text-zinc-300">біноміальний розподіл</b> на основі вказаної вами вибірки $N$.
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Footer */}
        <footer className="bg-[#121214]/50 border-t border-zinc-800 text-zinc-600 py-4 text-center text-[10px] font-mono mt-auto">
          <div className="px-6 flex flex-col md:flex-row justify-between items-center gap-2 max-w-[1400px] mx-auto">
            <p>© 2026 StepUp Analytics Team. Навчальний симулятор провідного аналітика.</p>
            <p className="text-zinc-500 font-semibold">Внутрішній двигун: Python (Code Execution Emulation & Binomial Random Number Generator)</p>
          </div>
        </footer>

      </div>
    </div>
  );
}
