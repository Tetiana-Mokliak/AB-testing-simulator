import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, SimulationState } from '../types';
import { formatNum } from '../utils';
import { 
  Terminal, 
  Send, 
  Play, 
  RefreshCw, 
  Layers, 
  CheckCircle, 
  Database, 
  HelpCircle, 
  AlertCircle, 
  Loader2, 
  Sparkles,
  Award
} from 'lucide-react';

interface Props {
  state: SimulationState;
  onUpdateState: (newState: Partial<SimulationState>) => void;
  onGenerateHistory: () => void;
}

export default function ConsoleTerminal({ state, onUpdateState, onGenerateHistory }: Props) {
  // Conversational and UI values
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Phase inputs
  const [controlSizeInput, setControlSizeInput] = useState('');
  const [testSizeInput, setTestSizeInput] = useState('');
  const [durationInput, setDurationInput] = useState('');

  // Hypotheses formulation input (Phase 2 initial step)
  const [testDesignFormulation, setTestDesignFormulation] = useState('');

  // Parameter Configuration panel selections
  const [mdeSelect, setMdeSelect] = useState('5%');
  const [alphaSelect, setAlphaSelect] = useState('0.05');
  const [powerSelect, setPowerSelect] = useState('80%');
  const [splitSelect, setSplitSelect] = useState('50/50');

  // Phase 4 final analytical conclusion text
  const [analysisInput, setAnalysisInput] = useState('');

  // Command Line Input state at bottom of the terminal
  const [commandLine, setCommandLine] = useState('');

  // Initial welcome message from mentor
  useEffect(() => {
    resetChat();
  }, []);

  const resetChat = () => {
    setMessages([
      {
        id: 'welcome_custom',
        sender: 'mentor',
        text: 'Привіт! Вітаю в інтерактивному тренажері-симуляторі для продуктового аналітика додатка "StepUp" (трекер звичок).\n\nЯ твій Senior Analyst та ментор. Разом ми пройдемо процес планування та проведення A/B тесту від самого початку й до фінальних бізнес-висновків.\n\nБудь ласка, обери один із 3 сценаріїв досліджень у панелі нижче або напиши його назву, щоб розпочати:\n- **Сценарій 1:** Оптимізація кроку реєстрації (StepUp app)\n- **Сценарій 2:** Еластичність ціни на paywall\n- **Сценарій 3:** Спрощення кошика оформлення замовлення (checkout conversions)',
        timestamp: new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    setControlSizeInput('');
    setTestSizeInput('');
    setDurationInput('');
    setTestDesignFormulation('');
    setAnalysisInput('');
    setCommandLine('');
  };

  // Auto Scroll Chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Keep local input fields synchronized with parent state
  useEffect(() => {
    if (state.desiredMde) setMdeSelect(state.desiredMde);
    if (state.alpha) setAlphaSelect(state.alpha);
    if (state.power) setPowerSelect(state.power);
    if (state.trafficSplit) setSplitSelect(state.trafficSplit);
    if (state.controlGroupSize) setControlSizeInput(state.controlGroupSize.toString());
    if (state.testGroupSize) setTestSizeInput(state.testGroupSize.toString());
    if (state.duration) setDurationInput(state.duration.toString());
  }, [
    state.desiredMde,
    state.alpha,
    state.power,
    state.trafficSplit,
    state.controlGroupSize,
    state.testGroupSize,
    state.duration
  ]);

  const addMessage = (sender: 'mentor' | 'user' | 'system', text: string, codeBlock?: string) => {
    setMessages(prev => [
      ...prev,
      {
        id: Math.random().toString(36).substring(7),
        sender,
        text,
        codeBlock,
        timestamp: new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
      }
    ]);
  };

  // Main Communication Handler with server-side Gemini
  const sendMessageToGemini = async (text: string, stateUpdateBeforeTrigger?: Partial<SimulationState>) => {
    if (!text.trim()) return;
    
    setIsLoading(true);

    // Save state changes first on client if desired
    if (stateUpdateBeforeTrigger) {
      onUpdateState(stateUpdateBeforeTrigger);
    }

    // 1. Append user's speech bubble
    const userMsg: ChatMessage = {
      id: Math.random().toString(36).substring(7),
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
    };
    
    const previousMessagesClean = [...messages, userMsg];
    setMessages(previousMessagesClean);
    setInputText('');

    try {
      // 2. Fetch API route
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: previousMessagesClean,
          lastUserInput: text,
          activeState: { ...state, ...stateUpdateBeforeTrigger }
        })
      });

      const data = await response.json();

      if (data.error) {
        addMessage('system', `Помилка API: ${data.error}`);
      } else {
        // Apply any state updates produced via Gemini function calling
        if (data.stateUpdate) {
          let safeStateUpdate = { ...data.stateUpdate };

          const willHypothesisAccepted = !!(state.hypothesisAccepted || safeStateUpdate.hypothesisAccepted || stateUpdateBeforeTrigger?.hypothesisAccepted);
          const willPlanningParamsSaved = !!(state.planningParamsSaved || safeStateUpdate.planningParamsSaved || stateUpdateBeforeTrigger?.planningParamsSaved);
          
          const simulationSucceeded = (
            (safeStateUpdate.controlGroupSuccesses !== undefined && safeStateUpdate.controlGroupSuccesses !== null) ||
            (state.controlGroupSuccesses !== undefined && state.controlGroupSuccesses !== null)
          );
          
          const willDatasetGenerated = !!(state.datasetGenerated || safeStateUpdate.datasetGenerated || stateUpdateBeforeTrigger?.datasetGenerated || simulationSucceeded);
          
          safeStateUpdate.hypothesisAccepted = willHypothesisAccepted;
          safeStateUpdate.planningParamsSaved = willPlanningParamsSaved;
          safeStateUpdate.datasetGenerated = willDatasetGenerated;

          // Step 2 completion transition:
          // Step 2 is completed when hypothesisAccepted, planningParamsSaved, and datasetGenerated are all true.
          // In that case, we unlock Step 3 and navigate to Step 3.
          if (willHypothesisAccepted && willPlanningParamsSaved && willDatasetGenerated) {
            safeStateUpdate.step = 3;
          } else {
            // Keep them on step 2 until all 3 criteria are satisfied.
            if (state.step === 2 || state.step === 3) {
              safeStateUpdate.step = 2;
            }
          }

          onUpdateState(safeStateUpdate);
                    
          // Print backend python invocation block for standard simulation steps
          if (safeStateUpdate.step === 2 && state.step === 1) {
            const pythonOutputCode = `>>> # Loading chosen scenario baseline parameters
>>> baseline_cr = ${data.stateUpdate.baselineRate}
>>> daily_traffic = ${data.stateUpdate.dailyTrafficAvg}
>>> visitors_30d = daily_traffic * 30
>>> conversions_30d = round(visitors_30d * baseline_cr)
>>> print(f"Loaded scenario: {baseline_cr*100:.2f}% CR, {daily_traffic} traffic.")
Output: Generated 30-day baseline successfully.`;
            addMessage('system', 'Виконується завантаження параметрів сценарію в Python...', pythonOutputCode);
          }
          else if (willPlanningParamsSaved && !state.planningParamsSaved) {
            const pythonConfigCode = `>>> # Configuring experimentation variables
>>> desired_mde = "${safeStateUpdate.desiredMde || state.desiredMde || "5%"}"
>>> alpha = ${safeStateUpdate.alpha || state.alpha || "0.05"}
>>> power = ${safeStateUpdate.power || state.power || "80%"}
>>> split = "${safeStateUpdate.trafficSplit || state.trafficSplit || "50/50"}"
>>> print("Experiment parameters registered in local workspace.")`;
            addMessage('system', 'Конфігурація тесту збережена в робоче середовище...', pythonConfigCode);
          }
          if (willDatasetGenerated && !state.datasetGenerated) {
            const pythonSimulationCode = `>>> # Binomial A/B simulation engine runs
>>> import numpy as np
>>> N_A = ${safeStateUpdate.controlGroupSize || state.controlGroupSize || 10000}
>>> N_B = ${safeStateUpdate.testGroupSize || state.testGroupSize || 10000}
>>> duration = ${safeStateUpdate.duration || state.duration || 14}
>>> relative_uplift = ${safeStateUpdate.simulatedUplift || state.simulatedUplift || 0.05}
>>> p_base = ${state.baselineRate || 0.40}
>>> p_test = p_base * (1 + relative_uplift)
>>> 
>>> # Simulating control & test groups conversion sizes
>>> successes_A = np.random.binomial(N_A, p_base)
>>> successes_B = np.random.binomial(N_B, p_test)
>>> print(f"A: {successes_A}/{N_A}, B: {successes_B}/{N_B}")`;
            addMessage('system', 'Проводь моделювання біноміального розподілу в Python...', pythonSimulationCode);
          }
        }

        // 3. Append mentor reply
        if (data.message) {
          setMessages(prev => [
            ...prev,
            {
              id: Math.random().toString(36).substring(7),
              sender: 'mentor',
              text: data.message.text,
              timestamp: new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
            }
          ]);
        }
      }
    } catch (err: any) {
      console.error(err);
      addMessage('system', `Помилка зв'язку з кастомним сервером: ${err.message}. Переконайтесь, що сервер працює на порту 3000.`);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Bottom CLI Commands
  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = commandLine.trim();
    if (!cmd) return;

    setCommandLine('');
    if (cmd.toLowerCase() === 'скинути' || cmd.toLowerCase() === 'reset') {
      handleReset();
    } else if (cmd.toLowerCase() === 'очистити' || cmd.toLowerCase() === 'clear') {
      setMessages([]);
    } else {
      const isHypothesisText = cmd.toLowerCase().includes('h0') || 
                               cmd.toLowerCase().includes('h1') || 
                               cmd.toLowerCase().includes('гіпотез') || 
                               cmd.toLowerCase().includes('метрика') || 
                               cmd.toLowerCase().includes('тест');
                               
      const stateUpdate = isHypothesisText ? { hypothesisAccepted: true } : undefined;
      sendMessageToGemini(cmd, stateUpdate);
    }
  };

  const handleReset = () => {
    onUpdateState({
      scenarioId: null,
      scenarioName: null,
      primaryMetricName: null,
      conversionEventName: null,
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
      desiredMde: null,
      alpha: null,
      power: null,
      trafficSplit: null,
      hypothesisAccepted: false,
      planningParamsSaved: false,
      datasetGenerated: false,
      step: 1
    });
    resetChat();
  };

  // Phase triggers
  const handleSelectScenario = (id: number) => {
    let scenarioText = "";
    if (id === 1) scenarioText = "Я хочу дослідити Сценарій 1: Оптимізація кроку реєстрації (StepUp app).";
    else if (id === 2) scenarioText = "Я хочу обрати Сценарій 2: Еластичність ціни на paywall.";
    else if (id === 3) scenarioText = "Я хочу почати Сценарій 3: Спрощення кошика оформлення замовлення.";
    
    sendMessageToGemini(scenarioText);
  };

  const handleSendTestDesign = () => {
    if (!testDesignFormulation.trim()) return;
    sendMessageToGemini(`Ось мій дизайн тесту:\n${testDesignFormulation}`, { hypothesisAccepted: true });
    setTestDesignFormulation('');
  };

  const handleSaveParameters = () => {
    const sizeA = parseInt(controlSizeInput.trim(), 10);
    const sizeB = parseInt(testSizeInput.trim(), 10);
    const dur = parseInt(durationInput.trim(), 10);

    const updates: Partial<SimulationState> = {
      desiredMde: mdeSelect,
      alpha: alphaSelect,
      power: powerSelect,
      trafficSplit: splitSelect,
      controlGroupSize: isNaN(sizeA) ? null : sizeA,
      testGroupSize: isNaN(sizeB) ? null : sizeB,
      duration: isNaN(dur) ? null : dur,
      planningParamsSaved: true
    };

    const configStr = `Я конфігурую експеримент: MDE = ${mdeSelect}, alpha = ${alphaSelect}, power = ${powerSelect}, split = ${splitSelect}.`;
    sendMessageToGemini(configStr, updates);
  };

  const handleRunSimulation = () => {
    const sizeA = parseInt(controlSizeInput.trim(), 10);
    const sizeB = parseInt(testSizeInput.trim(), 10);
    const dur = parseInt(durationInput.trim(), 10);

    if (isNaN(sizeA) || isNaN(sizeB) || isNaN(dur) || sizeA <= 0 || sizeB <= 0 || dur <= 0) {
      addMessage('system', 'Помилка введення: Будь ласка, вкажіть додатні цілі числа для розмірів вибірок Групи А і Б та тривалості T.');
      return;
    }

    if (sizeA > 100000 || sizeB > 100000) {
      addMessage('system', 'Увага! Максимальний розмір вибірки — 100,000 користувачів на групу для забезпечення високої швидкості генерації (Рекомендовано: 1,000–50,000).');
      return;
    }

    const triggerStr = `Я провів розрахунок вибірок. Розмір вибірки для Групи А (Control) = ${sizeA}, Розмір вибірки для Групи Б (Test) = ${sizeB}, тривалість тесту T = ${dur} днів. Запусти симуляцію.`;
    sendMessageToGemini(triggerStr, { 
      controlGroupSize: sizeA, 
      testGroupSize: sizeB, 
      duration: dur,
      planningParamsSaved: true,
      datasetGenerated: true 
    });
  };

  const handleSendAnalysis = () => {
    if (!analysisInput.trim()) return;
    sendMessageToGemini(`Мій фінальний аналіз результатів:\n${analysisInput}`);
    setAnalysisInput('');
  };

  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 shadow-xl overflow-hidden flex flex-col h-[740px] text-slate-100 relative">
      
      {/* Console Header */}
      <div className="bg-slate-950 px-5 py-3.5 border-b border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-500/80 inline-block"></span>
            <span className="w-3 h-3 rounded-full bg-yellow-500/80 inline-block"></span>
            <span className="w-3 h-3 rounded-full bg-emerald-500/85 inline-block"></span>
          </div>
          <span className="text-xs font-mono font-semibold text-slate-400 flex items-center gap-1.5 ml-2">
            <Terminal size={12} className="text-emerald-500" /> interactive_mentor.py
          </span>
        </div>
        <button 
          onClick={handleReset}
          className="text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800/80 px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 active:scale-95 border border-slate-800 cursor-pointer"
          title="Скинути симуляцію та почати з вибору сценарію"
        >
          <RefreshCw size={12} />
          <span>Почати заново</span>
        </button>
      </div>

      {/* Terminal Output Stream */}
      <div className="flex-1 p-5 overflow-y-auto space-y-4 font-mono text-xs leading-relaxed select-text bg-[#0D0E12]">
        {messages.map((msg) => (
          <div 
            key={msg.id} 
            className={`flex flex-col gap-1.5 max-w-[92%] ${
              msg.sender === 'user' ? 'ml-auto items-end' : 'mr-auto items-start'
            }`}
          >
            {/* Sender / Timeline badge */}
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-sans select-none">
              <span className={`font-semibold ${
                msg.sender === 'mentor' ? 'text-emerald-400' : msg.sender === 'user' ? 'text-blue-400' : 'text-amber-500'
              }`}>
                {msg.sender === 'mentor' ? 'Senior Analyst (StepUp)' : msg.sender === 'user' ? 'Ти (Аналітик)' : 'Система'}
              </span>
              <span>•</span>
              <span>{msg.timestamp}</span>
            </div>

            {/* Bubble contents */}
            <div className={`p-3.5 rounded-xl border leading-relaxed ${
              msg.sender === 'mentor' 
                ? 'bg-slate-900/90 border-slate-800/90 text-slate-200 rounded-tl-none font-sans whitespace-pre-line' 
                : msg.sender === 'user' 
                  ? 'bg-emerald-950/25 border-emerald-800/40 text-emerald-300 rounded-tr-none font-sans whitespace-pre-line' 
                  : 'bg-black/45 border-slate-800/80 text-zinc-400 font-mono text-[11px]'
            }`}>
              {msg.text}
              
              {/* Python execution code blocks */}
              {msg.codeBlock && (
                <div className="mt-2.5 bg-[#07080a] p-3 rounded-lg border border-slate-900 text-[11px] leading-relaxed text-amber-250 font-mono overflow-x-auto select-all max-w-full">
                  {msg.codeBlock}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Loading / Thinking Indicator */}
        {isLoading && (
          <div className="flex items-center gap-2.5 mr-auto text-[11px] text-zinc-500 pl-1 py-1 font-sans">
            <Loader2 size={13} className="animate-spin text-emerald-400" />
            <span>Senior Mentor обробляє запит у Python Kernel...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 4. Interactive Contextual Control Panels */}
      <div className="p-4 bg-slate-950 border-t border-slate-800/80">
        
        {/* PHASE 1: Scenario Selector Grid */}
        {state.step === 1 && (
          <div className="flex flex-col gap-3 py-1 font-sans">
            <div className="text-center text-slate-400 text-xs flex items-center justify-center gap-1.5 select-none">
              <Sparkles size={13} className="text-emerald-400" />
              <span>Ми на <b>Етапі 1</b>: Оберіть сценарій розрахунку для завантаження історичних метрик:</span>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                onClick={() => handleSelectScenario(1)}
                disabled={isLoading}
                className="bg-[#121214] hover:bg-emerald-650 text-emerald-400 hover:text-black border border-emerald-500/20 hover:border-emerald-500 font-medium py-3 px-3.5 rounded-xl transition-all text-left text-[11px] leading-normal cursor-pointer flex flex-col justify-between"
              >
                <div className="font-bold opacity-60 uppercase text-[9px] mb-1">Сценарій 1</div>
                <div>Реєстрація у StepUp (CR = 40.5%)</div>
              </button>

              <button
                onClick={() => handleSelectScenario(2)}
                disabled={isLoading}
                className="bg-[#121214] hover:bg-emerald-650 text-emerald-400 hover:text-black border border-emerald-500/20 hover:border-emerald-500 font-medium py-3 px-3.5 rounded-xl transition-all text-left text-[11px] leading-normal cursor-pointer flex flex-col justify-between"
              >
                <div className="font-bold opacity-60 uppercase text-[9px] mb-1">Сценарій 2</div>
                <div>Еластичність paywall (CR = 5.2%)</div>
              </button>

              <button
                onClick={() => handleSelectScenario(3)}
                disabled={isLoading}
                className="bg-[#121214] hover:bg-emerald-650 text-emerald-400 hover:text-black border border-emerald-500/20 hover:border-emerald-500 font-medium py-3 px-3.5 rounded-xl transition-all text-left text-[11px] leading-normal cursor-pointer flex flex-col justify-between"
              >
                <div className="font-bold opacity-60 uppercase text-[9px] mb-1">Сценарій 3</div>
                <div>Оформлення кошика (CR = 15.8%)</div>
              </button>
            </div>
          </div>
        )}

        {/* PHASE 2 & 3: Test Design, Configure Parameters, Sample Sizes & Duration */}
        {(state.step === 2 || state.step === 3) && (
          <div className="flex flex-col gap-3 font-sans">
            {/* Split task representation: 1. Send Hypothesis text, 2. Params select form */}
            <div className="bg-slate-900/60 border border-slate-800 p-2.5 rounded-xl flex items-start gap-2.5 select-none text-[11px]">
              <AlertCircle size={15} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="text-slate-400 leading-normal text-xs">
                <b>Етап 2: Дизайн Тесту & Розрахунки.</b> Сформулюйте метрику, гіпотези H0/H1 в чаті та обов'язково вкажіть параметри планування й розраховані розміри вибірок нижче.
              </div>
            </div>

            {/* Design Hypothesis Formulation Input Box */}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Введіть в чат: 1) Метрика, 2) H0, 3) H1 й надішліть..."
                value={testDesignFormulation}
                onChange={(e) => setTestDesignFormulation(e.target.value)}
                disabled={isLoading}
                className="flex-1 bg-slate-900 border border-slate-800 focus:border-emerald-500 text-xs p-2.5 rounded-xl focus:outline-none transition-all placeholder-slate-500 text-white"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSendTestDesign();
                  }
                }}
              />
              <button
                onClick={handleSendTestDesign}
                disabled={isLoading || !testDesignFormulation.trim()}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-black font-semibold py-2.5 px-3.5 rounded-lg flex items-center justify-center transition-all cursor-pointer"
                title="Надіслати формулювання гіпотези ментору в чат"
              >
                <Send size={15} />
              </button>
            </div>

            {/* Parameters configuration and sample size inputs container */}
            <div className="bg-[#121214] p-3 rounded-xl border border-zinc-800 text-[10px] space-y-3.5 animate-fade-in">
              <div>
                <div className="text-zinc-400 font-bold uppercase tracking-wide text-[9px] mb-2 select-none">1. Параметри планування A/B тесту:</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div>
                    <label className="block text-zinc-500 mb-1">MDE % (ефект)</label>
                    <select
                      value={mdeSelect}
                      onChange={(e) => {
                        setMdeSelect(e.target.value);
                        onUpdateState({ desiredMde: e.target.value });
                      }}
                      disabled={isLoading}
                      className="w-full bg-slate-900 border border-slate-800 text-zinc-300 py-1.5 px-2 rounded-lg text-xs"
                    >
                      <option value="3%">3% відносно</option>
                      <option value="4%">4% відносно</option>
                      <option value="5%">5% відносно</option>
                      <option value="6%">6% відносно</option>
                      <option value="7%">7% відносно</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-zinc-500 mb-1">Alpha (значущість)</label>
                    <select
                      value={alphaSelect}
                      onChange={(e) => {
                        setAlphaSelect(e.target.value);
                        onUpdateState({ alpha: e.target.value });
                      }}
                      disabled={isLoading}
                      className="w-full bg-slate-900 border border-slate-800 text-zinc-300 py-1.5 px-2 rounded-lg text-xs"
                    >
                      <option value="0.05">5% (alpha = 0.05)</option>
                      <option value="0.01">1% (alpha = 0.01)</option>
                      <option value="0.10">10% (alpha = 0.10)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-zinc-500 mb-1">Power (Потужність)</label>
                    <select
                      value={powerSelect}
                      onChange={(e) => {
                        setPowerSelect(e.target.value);
                        onUpdateState({ power: e.target.value });
                      }}
                      disabled={isLoading}
                      className="w-full bg-slate-900 border border-slate-800 text-zinc-300 py-1.5 px-2 rounded-lg text-xs"
                    >
                      <option value="80%">80% (Power = 0.80)</option>
                      <option value="90%">90% (Power = 0.90)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-zinc-500 mb-1">Split (Трафік)</label>
                    <select
                      value={splitSelect}
                      onChange={(e) => {
                        setSplitSelect(e.target.value);
                        onUpdateState({ trafficSplit: e.target.value });
                      }}
                      disabled={isLoading}
                      className="w-full bg-slate-900 border border-slate-800 text-zinc-300 py-1.5 px-2 rounded-lg text-xs"
                    >
                      <option value="50/50">50/50 (Рівний split)</option>
                      <option value="70/30">70/30 (Тест 30%)</option>
                      <option value="90/10">90/10 (Тест 10%)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="border-t border-zinc-800/80 pt-3">
                <div className="text-zinc-400 font-bold uppercase tracking-wide text-[9px] mb-2 select-none">2. Ручний розрахунок вибірок та тривалості:</div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-[10px] text-zinc-500 font-medium mb-1 select-none text-left">
                      Sample Size групи А (Control)
                    </label>
                    <input
                      type="number"
                      placeholder="наприклад, 14500"
                      value={controlSizeInput}
                      onChange={(e) => {
                        const val = e.target.value;
                        setControlSizeInput(val);
                        const parsed = parseInt(val.trim(), 10);
                        onUpdateState({ controlGroupSize: isNaN(parsed) ? null : parsed });
                      }}
                      disabled={isLoading}
                      className="w-full bg-slate-900 border border-slate-800 focus:border-emerald-500 font-mono text-xs p-2 rounded-lg focus:outline-none transition-colors text-white text-center"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-zinc-500 font-medium mb-1 select-none text-left">
                      Sample Size групи Б (Test)
                    </label>
                    <input
                      type="number"
                      placeholder="наприклад, 14500"
                      value={testSizeInput}
                      onChange={(e) => {
                        const val = e.target.value;
                        setTestSizeInput(val);
                        const parsed = parseInt(val.trim(), 10);
                        onUpdateState({ testGroupSize: isNaN(parsed) ? null : parsed });
                      }}
                      disabled={isLoading}
                      className="w-full bg-slate-900 border border-slate-800 focus:border-emerald-500 font-mono text-xs p-2 rounded-lg focus:outline-none transition-colors text-white text-center"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-zinc-500 font-medium mb-1 select-none text-left">
                    Оціночна тривалість тесту в днях (T)
                  </label>
                  <input
                    type="number"
                    placeholder="наприклад, 14"
                    value={durationInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDurationInput(val);
                      const parsed = parseInt(val.trim(), 10);
                      onUpdateState({ duration: isNaN(parsed) ? null : parsed });
                    }}
                    disabled={isLoading}
                    className="w-full bg-slate-900 border border-slate-800 focus:border-emerald-500 font-mono text-xs p-2 rounded-lg focus:outline-none transition-colors text-white text-center"
                  />
                </div>
              </div>

              {/* Form Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 font-sans">
                <button
                  onClick={handleSaveParameters}
                  disabled={isLoading}
                  className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-2.5 px-3 rounded-xl transition-all font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  title="Зареєструвати обрані MDE, alpha, power, split"
                >
                  <CheckCircle size={13} />
                  <span>Зберегти параметри</span>
                </button>

                <button
                  onClick={handleRunSimulation}
                  disabled={isLoading || !controlSizeInput.trim() || !testSizeInput.trim() || !durationInput.trim()}
                  className="bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800/40 disabled:text-zinc-500 text-white font-semibold py-2.5 px-3.5 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md"
                  title="Запустити біноміальну симуляцію"
                >
                  <Play size={13} />
                  <span>Запустити симуляцію</span>
                </button>
              </div>

              {state.step === 3 && (
                <div className="pt-2 animate-pulse font-sans">
                  <button
                    onClick={() => onUpdateState({ step: 4 })}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold py-2.5 px-4 rounded-xl transition-all text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg"
                    title="Перейти до аналізу, розрахунку p-value та висновків"
                  >
                    <Award size={14} />
                    <span>Перейти до аналізу та висновків (Етап 4) ➔</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* PHASE 4: Step 4 - Analysis interpretation and feedback loop */}
        {state.step === 4 && (
          <div className="flex flex-col gap-3 font-sans">
            <div className="bg-slate-900/60 border border-slate-800 p-2.5 rounded-xl flex items-start gap-2.5 text-[11px] select-none">
              <Award size={15} className="text-yellow-400 mt-0.5 flex-shrink-0 animate-bounce" />
              <div className="text-slate-400 leading-normal">
                <b>Етап 4: Розрахунок метрик & Висновки:</b> Обчисліть absolute difference, відносний uplift, z-статистику та p-value (можете скористатися своїм блокнотом ліворуч). Напишіть свій остаточний аналіз та бізнес-рекомендацію ментору:
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <textarea
                placeholder="Запишіть сюди ваші результати: p-value = ..., результат (значущий чи ні) і фінальну бізнес-рекомендацію..."
                value={analysisInput}
                onChange={(e) => setAnalysisInput(e.target.value)}
                disabled={isLoading}
                rows={2}
                className="w-full bg-slate-900 border border-slate-800 focus:border-emerald-500 text-xs p-2.5 rounded-xl focus:outline-none transition-all text-white placeholder-slate-500 leading-relaxed resize-none"
              />
              <button
                onClick={handleSendAnalysis}
                disabled={isLoading || !analysisInput.trim()}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 text-slate-950 text-xs font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer"
              >
                <CheckCircle size={14} />
                <span>Надіслати аналіз та отримати фідбек ментора</span>
              </button>
            </div>
          </div>
        )}

        {/* Generic Conversation Text Entry Bar at bottom as backup fallback */}
        <form onSubmit={handleCommandSubmit} className="mt-3.5 pt-3 border-t border-slate-800/60 flex items-center gap-2 font-mono">
          <span className="text-emerald-500 font-semibold text-[11.5px] select-none">$</span>
          <input
            type="text"
            value={commandLine}
            onChange={(e) => setCommandLine(e.target.value)}
            disabled={isLoading}
            placeholder={
              state.step === 1 
                ? 'Оберіть сценарій вище або напишіть повідомлення ментору...' 
                : 'Запитай ментора, введіть команду ("скинути") або текст...'
            }
            className="flex-1 bg-transparent border-none text-[11px] font-mono text-slate-300 focus:outline-none placeholder-slate-600"
          />
        </form>

      </div>
    </div>
  );
}
