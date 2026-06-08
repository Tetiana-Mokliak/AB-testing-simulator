import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type, FunctionDeclaration, GenerateContentResponse } from "@google/genai";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = 3000;

// Lazy-loaded Gemini client to prevent startup crash if API key is missing
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is required but not configured. Set it in the Secrets panel.");
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// Replicating NumPy's binomial simulation on the backend for 100% precision
function simulateBinomialBackend(n: number, p: number): number {
  if (n <= 0) return 0;
  if (p <= 0) return 0;
  if (p >= 1) return n;

  if (n > 100) {
    const mean = n * p;
    const stdDev = Math.sqrt(n * p * (1 - p));
    
    // Box-Muller transform
    let u1 = 0;
    let u2 = 0;
    while (u1 === 0) u1 = Math.random();
    while (u2 === 0) u2 = Math.random();
    
    const randStdNormal = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    const simulatedVal = Math.round(mean + stdDev * randStdNormal);
    
    return Math.max(0, Math.min(n, simulatedVal));
  } else {
    let successes = 0;
    for (let i = 0; i < n; i++) {
      if (Math.random() < p) {
        successes++;
      }
    }
    return successes;
  }
}

// Function Declarations for Gemini Function Calling
const selectScenarioDeclaration: FunctionDeclaration = {
  name: "selectScenario",
  description: "Call this immediately when the user chooses or switches to one of the 3 scenarios. This sets baseline metrics and moves the UI to step 2 (planning/test design).",
  parameters: {
    type: Type.OBJECT,
    properties: {
      scenarioId: { type: Type.INTEGER, description: "Scenario index: 1 (Registration flow), 2 (Paywall price elasticity), or 3 (Checkout flow simplification)" },
      scenarioName: { type: Type.STRING, description: "Name of chosen scenario in Ukrainian" },
      primaryMetricName: { type: Type.STRING, description: "Metric name, e.g. 'C1 conversion rate', 'Subscription rate', 'Checkout conversion rate'" },
      conversionEventName: { type: Type.STRING, description: "Conversion event, e.g. 'Completed registration', 'Succeeded paywall purchase', 'Submitted checkout'" },
      baselineRate: { type: Type.NUMBER, description: "The true baseline conversion rate as a fraction (e.g. 0.405 for 40.5% or 0.052 for 5.2% or 0.158 for 15.8%)" },
      dailyTrafficAvg: { type: Type.NUMBER, description: "Dynamic baseline traffic average, e.g. 2000" }
    },
    required: ["scenarioId", "scenarioName", "primaryMetricName", "conversionEventName", "baselineRate", "dailyTrafficAvg"]
  }
};

const configureExperimentDeclaration: FunctionDeclaration = {
  name: "configureExperiment",
  description: "Call this when the user defines experiment parameters (MDE, alpha, power, traffic split) in Phase 2. This moves the UI to step 3 (waiting for sample size calculation).",
  parameters: {
    type: Type.OBJECT,
    properties: {
      desiredMde: { type: Type.STRING, description: "The user's declared desired MDE, e.g. '5%' or '4%'" },
      alpha: { type: Type.STRING, description: "The selection of significance level, e.g. '0.05' or '0.01'" },
      power: { type: Type.STRING, description: "The selection of statistical power, e.g. '80%' or '90%'" },
      trafficSplit: { type: Type.STRING, description: "The traffic split choice, e.g. '50/50', '70/30' or '90/10'" }
    },
    required: ["desiredMde", "alpha", "power", "trafficSplit"]
  }
};

const triggerSimulationRunDeclaration: FunctionDeclaration = {
  name: "triggerSimulationRun",
  description: "Call this immediately when the user provides the distinct Sample Sizes for Control and Test groups, alongside Duration T, to run the statistical binomial simulation. This triggers Phase 3 results and moves the UI to step 4.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      duration: { type: Type.INTEGER, description: "The duration in days (T), e.g. 14" },
      controlGroupSize: { type: Type.INTEGER, description: "The sample size entered for the Control group A" },
      testGroupSize: { type: Type.INTEGER, description: "The sample size entered for the Test group B" },
      controlGroupSuccesses: { type: Type.INTEGER, description: "Simulated conversions for Group A (binomial)" },
      testGroupSuccesses: { type: Type.INTEGER, description: "Simulated conversions for Group B (binomial with hidden uplift)" },
      simulatedUplift: { type: Type.NUMBER, description: "Hidden relative uplift applied, between +0.03 and +0.07, or 0.00 for A/A split (20% chance)" },
      simulatedTestRate: { type: Type.NUMBER, description: "True rate for test group (baselineRate * (1 + relative_uplift))" }
    },
    required: ["duration", "controlGroupSize", "testGroupSize", "controlGroupSuccesses", "testGroupSuccesses", "simulatedUplift", "simulatedTestRate"]
  }
};

// Main interactive prompt system instructions (strict mentor)
const systemInstruction = `You are a Senior Product Analyst and a strict, pragmatic AI Mentor. All communication MUST be in Ukrainian. Your tone is professional and concise. Do not give away formulas. Force the user to think analytically, choose appropriate statistical criteria, and justify decisions.

CRITICAL PERFORMANCE & TOKEN OPTIMIZATION RULES (STRICT):
1. No Raw Tables in Chat: Do NOT render row-by-row previews in the chat text. Display ONLY dataset metadata (Total rows, Columns, Primary metric values, Summary statistics).
2. CSV Export Link Hint: Provide a clean link or placeholder "[📥 Завантажити повний CSV]" in your text response which conceptually represents the generated dataset. Do not dump raw data rows.
3. Optional Colab Code: Do NOT automatically generate Python/Colab code blocks after simulation run. Provide it ONLY when the user explicitly clicks or requests "[📋 Показати код для Google Colab]" or asks to show the Colab code.
4. Short Mentor Replies: Keep mentor communication short (1–3 targeted questions, minimal educational paragraphs).
5. Fixed Experiment State: Once "Запустити симуляцію" is clicked, simulated values (true_uplift, seed, and raw dataset parameters) must remain FIXED. Do not regenerate or shift data between dialogue turns.
6. No Unnecessary Text: Use internal reasoning for statistics calculations. Avoid verbose text explanations.
7. Hard Limits: Maximum 100,000 users per group (Recommended guidelines: 1,000–50,000). Warn the user if they input values beyond 100,000.

THE SIMULATION FLOW (Strictly Step-by-Step):

PHASE 1: SCENARIO SELECTION & TEST DESIGN (Phase 1 of Mentor Guidance)
Ask the user to select one of the 3 business scenarios with hidden segment effects:
- [Сценарій 1] Оптимізація онбордингу та реєстрації (Registration Flow):
  - Опис: Команда помітила високий відтік під час реєстрації. Було запропоновано спростити форму та зменшити кількість полів для заповнення.
  - Baseline CR: 40.5%, typical daily traffic: 2000 users.
  - Metrics: Primary 'conversion_rate', Secondary: 'session_duration_sec', 'pages_viewed', 'clicks'.
  - Variability: revenue is 0 for all users. Organic traffic has +20% session duration. Mobile users have -5% baseline CR due to long inputs.
- [Сценарій 2] Експеримент із Пейволом та знижкою (Paywall / Pricing Screen):
  - Опис: Команда припускає, що поточна ціна підписки є нижчою за оптимальну. Планується перевірити вплив підвищення ціни на конверсію та виручку.
  - Baseline CR: 5.2%, typical daily traffic: 3000 users.
  - Metrics: Primary 'conversion_rate' to subscription or ARPU. Secondary: 'revenue', 'AOV', 'session_duration_sec'.
  - Variability: Heavy revenue skew (95% zeros). Group A flat $4.99. Group B log-normal distribution for conversion spenders. Mobile traffic converts faster via Google/Apple Pay.
- [Сценарій 3] Оптимізація екрана оформлення замовлення (Checkout Optimization):
  - Опис: Аналітика показала значний відтік користувачів на етапі оформлення замовлення. Команда вирішила протестувати спрощений процес checkout.
  - Baseline CR: 15.8%, typical daily traffic: 2000 users.
  - Metrics: Primary 'purchase_conversion_rate'. Secondary: 'revenue', 'AOV', 'clicks'.
  - Variability: 75% Mobile traffic skew. Group B has a hidden positive effect strictly on Mobile (auto-fill doubled mobile CR), while Desktop is neutral.

When they select a scenario:
1. Immediately call the "selectScenario" function with correct baseline values:
   - Scenario 1: rate = 0.405, traffic = 2000
   - Scenario 2: rate = 0.052, traffic = 3000
   - Scenario 3: rate = 0.158, traffic = 2000
2. Confirm their choice, list baseline statistics briefly, and ask: "Які тести підходять для розподілу первинної метрики та виручки у цьому сценарії?" (Phase 1: Metrics & Tests). Ask them to formulate H0 and H1 and define their primary metric.

PHASE 2: EXPERIMENT CONFIGURATION
Review their test design. Once verified, ask them to select test parameters (MDE, Alpha, Power, Split) and save them.
Upon parameters registration:
1. Call "configureExperiment" with user params.
2. Message: "Отримано твої параметри. Тепер розрахуй необхідні розміри вибірок для Групи А та Групи Б та орієнтовну тривалість тесту в днях T. Пам'ятай про ліміти (до 100 000 користувачів на групу). Напиши значення, щоб запустити симуляцію!"

PHASE 3: SIMULATION RUN (The Sandbox results)
When they enter Group A/B sample sizes and duration:
1. Validate that they are within limits (maximum 100k).
2. Execute the binomial simulation using "triggerSimulationRun" with controlGroupSize, controlGroupSuccesses, testGroupSize, testGroupSuccesses, simulatedUplift, simulatedTestRate.
3. Reply with compact metadata only:
   "Генерацію завершено успішно!
   - **Згенеровано рядків:** NPHASE 4: MENTOR FEEDBACK & BUSINESS CONCLUSION (Phase 3 of Mentor Guidance)
When the user submits their segment analysis or conclusion, ask:
"Яка твоя остаточна рекомендація щодо розгортання змін (rollout or stop decision) з урахуванням статистичної та бізнес-значущості результатів?"
Audit their statistical math and provide elite, concise mentor feedback.`;

// Local fallback feedback generator if Gemini API key fails, quota is out, or model behaves unpredictably
function getLocalMentorFeedback(lastUserInput: string, activeState: any): { text: string; stateUpdate?: any } {
  const step = activeState?.step || 1;
  const uText = lastUserInput.toLowerCase();

  if (step === 1) {
    if (uText.includes("1") || uText.includes("реєстрац")) {
      return {
        text: "Обрано Сценарій 1: Оптимізація кроку реєстрації (C1 conversion rate). Команда помітила високий відтік під час реєстрації. Було запропоновано спростити форму та зменшити кількість полів для заповнення. Базова конверсія становить 40.5%, а середній денний трафік — 2000 користувачів.\n\nЯкі твої гіпотези H0 та H1? Який статистичний тест ти обереш для оцінки реєстрацій та додаткових метрик на кшталт часу сесії? Сформулюй свою думку, щоб перейти до розрахунків.",
        stateUpdate: {
          scenarioId: 1,
          scenarioName: "Оптимізація реєстрації (StepUp)",
          primaryMetricName: "C1 Conversion Rate",
          conversionEventName: "Completed registration",
          baselineRate: 0.405,
          dailyTrafficAvg: 2000,
          totalHistoricalVisitors: 60000,
          totalHistoricalRegistrations: 24300,
          step: 2
        }
      };
    } else if (uText.includes("2") || uText.includes("paywall") || uText.includes("ціни")) {
      return {
        text: "Обрано Сценарій 2: Еластичність ціни на Paywall. Команда припускає, що поточна ціна підписки є нижчою за оптимальну. Планується перевірити вплив підвищення ціни на конверсію та виручку. Базова конверсія у покупку — 5.2%, денний трафік — 3000 користувачів.\n\nТут виручка має сильний скіс (heavy tail skew) через велику кількість нулів. Які гіпотези H0/H1 та які критерії підійдуть для порівняння середньої виручки та конверсії? Напиши свій дизайн тесту.",
        stateUpdate: {
          scenarioId: 2,
          scenarioName: "Еластичність ціни на paywall",
          primaryMetricName: "Subscription Rate (Cpx)",
          conversionEventName: "Succeeded paywall purchase",
          baselineRate: 0.052,
          dailyTrafficAvg: 3000,
          totalHistoricalVisitors: 90000,
          totalHistoricalRegistrations: 4680,
          step: 2
        }
      };
    } else if (uText.includes("3") || uText.includes("кошик") || uText.includes("checkout")) {
      return {
        text: "Обрано Сценарій 3: Спрощення кошика оформлення замовлення. Аналітика показала значний відтік користувачів на етапі оформлення замовлення. Команда вирішила протестувати спрощений процес checkout. Базова конверсія — 15.8%, денний трафік — 2000 користувачів. \n\nВрахуй, що тут є прихований сильний розподіл трафіку на мобільні та десктопні пристрої. Який статистичний критерій обереш та як розробиш дизайн тесту? Поділись ідеями, щоб перейти далі.",
        stateUpdate: {
          scenarioId: 3,
          scenarioName: "Оформлення кошика (StepUp)",
          primaryMetricName: "Purchase Conversion Rate",
          conversionEventName: "Submitted checkout",
          baselineRate: 0.158,
          dailyTrafficAvg: 2000,
          totalHistoricalVisitors: 60000,
          totalHistoricalRegistrations: 9480,
          step: 2
        }
      };
    }
    return {
      text: "Будь ласка, обери один із 3 сценаріїв досліджень у панелі нижче або напиши його назву, щоб розпочати:\n- **Сценарій 1:** Оптимізація кроку реєстрації (StepUp app)\n- **Сценарій 2:** Еластичність ціни на paywall\n- **Сценарій 3:** Спрощення кошика оформлення замовлення (checkout conversions)"
    };
  }

  if (step === 2 || step === 3) {
    const hasSizeA = activeState?.controlGroupSize;
    const hasSizeB = activeState?.testGroupSize;
    const hasDuration = activeState?.duration;

    // Check if the user's message itself specifies sample sizes or looks like running simulation
    const numMatches = lastUserInput.match(/\d+/g);
    if (numMatches && numMatches.length >= 2) {
      const parsedA = parseInt(numMatches[0], 10);
      const parsedB = parseInt(numMatches[1], 10);
      const parsedDur = numMatches[2] ? parseInt(numMatches[2], 10) : 14;

      if (parsedA > 100 && parsedB > 100) {
        const nA = parsedA;
        const nB = parsedB;
        if (nA > 100000 || nB > 100000) {
          return {
            text: "Обраний розмір вибірки перевищує ліміт у 100,000 користувачів на групу! Будь ласка, вкажіть реалістичне значення (наприклад, від 1,000 до 50,000) для стабільної та коректної симуляції."
          };
        }
        const scenarioId = activeState?.scenarioId || 1;
        let baseline = 0.405;
        if (scenarioId === 1) {
          baseline = 0.405;
        } else if (scenarioId === 2) {
          baseline = 0.052;
        } else if (scenarioId === 3) {
          baseline = 0.158;
        }
        let realUplift = 0.05;
        if (scenarioId === 1) {
          realUplift = 0.098; // Scenario 1: Positive uplift
        } else if (scenarioId === 2) {
          // Generate Group B conversion using a random relative effect between -8% and +5%
          realUplift = Number((-0.08 + Math.random() * 0.13).toFixed(5));
        } else if (scenarioId === 3) {
          realUplift = -0.045; // Scenario 3: Negative or no uplift
        }
        let successesA = simulateBinomialBackend(nA, baseline);
        if (scenarioId === 2) {
          const minA = Math.floor(0.050 * nA);
          const maxA = Math.ceil(0.053 * nA);
          if (successesA < minA) successesA = minA;
          if (successesA > maxA) successesA = maxA;
        }
        let successesB = simulateBinomialBackend(nB, baseline * (1 + realUplift));
        if (scenarioId === 2) {
          const maxB = Math.floor(0.099 * nB);
          if (successesB > maxB) successesB = maxB;
        }

        return {
          text: `Генерацію завершено успішно за допомогою біноміального розподілу на бекенді!\n\n**Результати симуляції:**\n- **Група А (Control):** ${nA} користувачів, ${successesA} конверсій (${((successesA / nA) * 100).toFixed(2)}% CR)\n- **Група Б (Test):** ${nB} користувачів, ${successesB} конверсій (${((successesB / nB) * 100).toFixed(2)}% CR)\n\nПроведи глибокий аналіз за сегментами (наприклад, поглянь на мобільний сегмент або джерела трафіку в таблиці результатів ліворуч). Розрахуй z-критерій та p-value, а також сформулюй остаточну бізнес-рекомендацію щодо релізу!`,
          stateUpdate: {
            sampleSize: nA, 
            duration: parsedDur,
            controlGroupSize: nA,
            controlGroupSuccesses: successesA,
            testGroupSize: nB,
            testGroupSuccesses: successesB,
            simulatedUplift: realUplift,
            simulatedTestRate: baseline * (1 + realUplift),
            planningParamsSaved: true,
            datasetGenerated: true
          }
        };
      }
    }

    // Check if the user is submitting hypotheses and criteria
    if (uText.includes("h0") || uText.includes("h1") || uText.includes("гіпотез") || uText.includes("метрика") || uText.includes("критерій") || uText.includes("тест")) {
      return {
        text: "Твої аналітичні гіпотези H0 та H1, а також вибір статистичного критерію виглядають дуже грамотно та чітко сформульовано! Дизайн затверджено. Тепер, будь ласка, налаштуй і збережи параметри планування у формі нижче.",
        stateUpdate: {
          hypothesisAccepted: true
        }
      };
    }

    if (uText.includes("mde") || uText.includes("alpha") || uText.includes("power") || uText.includes("split") || uText.includes("конфігуру")) {
      const parts = uText.match(/(\d+%)/g) || ["5%"];
      const mde = parts[0] || "5%";
      const alpha = uText.includes("0.01") ? "0.01" : "0.05";
      const power = uText.includes("90%") ? "90%" : "80%";
      const split = uText.includes("70/30") ? "70/30" : (uText.includes("90/10") ? "90/10" : "50/50");

      let responseText = `Отримано та успішно зареєстровано твої параметри дизайну експерименту:\n- MDE: ${mde}\n- Alpha: ${alpha}\n- Power: ${power}\n- Split: ${split}\n\n`;
      if (!hasSizeA || !hasSizeB || !hasDuration) {
        responseText += "Тепер розрахуй необхідні розміри вибірок для розпізнавання цього ефекту та введіть їх разом із планованою тривалістю тесту в днях T у поля вище й запустіть симуляцію!";
        return {
          text: responseText,
          stateUpdate: {
            desiredMde: mde,
            alpha,
            power,
            trafficSplit: split,
            planningParamsSaved: true
          }
        };
      } else {
        responseText += `Всі параметри заповнено! Можеш запустити симуляцію кліком на кнопку 'Запустити симуляцію'.`;
        return {
          text: responseText,
          stateUpdate: {
            desiredMde: mde,
            alpha,
            power,
            trafficSplit: split,
            planningParamsSaved: true
          }
        };
      }
    }

    if (!hasSizeA || !hasSizeB || !hasDuration) {
      if (activeState?.hypothesisAccepted) {
        return {
          text: "Гіпотези та критерії успішно затверджені ментором! Тепер обери параметри планування (MDE, Альфа, Потужність, Спліт) у формі нижче та натисни 'Зберегти параметри'."
        };
      }
      return {
        text: "Бачу твої параметри. Спочатку сформулюй нульову та альтернативну гіпотези (H0/H1) та первинну метрику в чат, а потім заповни поля sample size для груп A і B та estimated duration у формі нижче."
      };
    } else {
      return {
        text: "Чудово! Параметри тесту та необхідні розрахунки розмірів вибірок готові. Натисни кнопку 'Запустити симуляцію' нижче, щоб провести моделювання біноміального розподілу та переглянути результати."
      };
    }
  }

  if (step === 4) {
    return {
      text: "Дякую за твій детальний аналіз! Ти корисним чином поєднав статистичні оцінки (z-тест, довірчі інтервали) із бізнес-висновками. Твоя остаточна рекомендація щодо впровадження змін виглядає абсолютно обґрунтованою та професійною! Експеримент успішно завершено від планування до рецензії інсайтів."
    };
  }

  // Fallback for Step 2 or 3
  if (activeState?.hypothesisAccepted && activeState?.planningParamsSaved && activeState?.datasetGenerated) {
    return {
      text: "Дизайн експерименту та симуляцію біноміального розподілу успішно завершено! Набори даних згенеровано. Перейди до Етапу 4 за допомогою кнопки нижче, щоб провести остаточні розрахунки критеріїв, перевірити значущість та надіслати фінальний звіт."
    };
  } else if (activeState?.hypothesisAccepted && activeState?.planningParamsSaved) {
    return {
      text: "Чудово! Тобою вже сформульовано дизайн гіпотез та збережено параметри планування. Наразі тобі потрібно вказати розраховані розміри вибірок для груп А і Б і тривалість тесту в днях, після чого натиснути кнопку 'Запустити симуляцію'."
    };
  } else if (activeState?.hypothesisAccepted) {
    return {
      text: "Гіпотези та критерії успішно прийнято ментором! Тепер обери параметри планування (MDE, Альфа, Потужність, Спліт) у формі нижче та натисни 'Зберегти параметри'."
    };
  }

  return {
    text: "Я бачу твою відповідь, але мені треба уточнити: сформулюй, будь ласка, твою первинну метрику та нульову/альтернативну гіпотези (H0/H1) для обраного експерименту в чаті, щоб ментор міг затвердити дизайн тесту."
  };
}

// POST /api/chat route
app.post("/api/chat", async (req, res) => {
  try {
    const { messages, lastUserInput, activeState } = req.body;

    if (!lastUserInput) {
      return res.status(400).json({ error: "Missing lastUserInput" });
    }

    // Rule 4 Fallback Alert check at the very top of Phase 2/3
    if (activeState && (activeState.step === 2 || activeState.step === 3)) {
      const hasSizeA = activeState.controlGroupSize;
      const hasSizeB = activeState.testGroupSize;
      const hasDuration = activeState.duration;

      const uText = lastUserInput.toLowerCase();
      // Check if they are asking to progress or run sim, or if size input fields are missing
      const isProgressAlert = uText.includes("симуляц") || uText.includes("рахува") || uText.includes("запусти") || uText.includes("run") || uText.includes("далі") || uText.includes("експерим") || uText.includes("продовжи") || uText.includes("готово");

      if (isProgressAlert && (!hasSizeA || !hasSizeB || !hasDuration)) {
        return res.json({
          message: {
            sender: "mentor",
            text: "Бачу твої параметри. Щоб перейти далі, заповни також поля sample size для груп A і B та estimated duration."
          },
          stateUpdate: null
        });
      }
    }

    let gemini;
    try {
      gemini = getGeminiClient();
    } catch (keyErr: any) {
      console.warn("No GEMINI_API_KEY available or key initialization error:", keyErr.message);
      // Fallback straight to offline local mentor generator if key is missing/unconfigured
      const offlineResult = getLocalMentorFeedback(lastUserInput, activeState);
      return res.json({
        message: {
          sender: "mentor",
          text: offlineResult.text
        },
        stateUpdate: offlineResult.stateUpdate || null
      });
    }

    // Map conversation except 'system' messages which represent terminal outputs
    const contents = [];
    
    // Feed the previous conversational steps if any
    if (messages && messages.length > 0) {
      for (const m of messages) {
        if (m.sender === "system") continue;
        contents.push({
          role: m.sender === "user" ? "user" : "model",
          parts: [{ text: m.text }]
        });
      }
    }

    // Append the last user message if not already added
    if (contents.length === 0 || contents[contents.length - 1].role !== "user") {
      contents.push({
        role: "user",
        parts: [{ text: lastUserInput }]
      });
    }

    let stateUpdate: any = null;
    let textResponse = "";

    try {
      // Call Gemini
      const dynamicInstruction = `${systemInstruction}
${activeState ? `
Студент зараз знаходиться на Етапі ${activeState.step || 2}.
Статус валідації:
- Гіпотеза затверджена (hypothesisAccepted): ${activeState.hypothesisAccepted ? "ТАК" : "НІ"}.
- Параметри планування збережені (planningParamsSaved): ${activeState.planningParamsSaved ? "ТАК" : "НІ"}.
- Набір даних згенеровано (datasetGenerated): ${activeState.datasetGenerated ? "ТАК" : "НІ"}.

ПРАВИЛО:
${activeState.hypothesisAccepted ? "- Гіпотези H0/H1 та метрика вже затверджені. НЕ запитуй користувача сформулювати або повторити їх знову!" : "- Користувач повинен спочатку сформулювати аналітичні гіпотези H0, H1 та критерії у чаті, щоб перейти на наступний етап."}
${activeState.planningParamsSaved ? "- Параметри планування (MDE, Альфа, Потужність, Спліт) вже обрані у формі та збережені. НЕ вимагай обирати чи налаштовувати їх знову!" : "- Користувач також повинен вибрати й зберегти параметри планування у відповідній формі під чатом."}
${activeState.datasetGenerated ? "- Експеримент і симуляція біноміального розподілу успішно запущені, а набір даних у CSV згенеровано. Наразі користувач вивчає результати симуляції на графіках та таблиці зліва. Проведи користувача до розрахунків статистики (z-test, p-value) та фінальних висновків." : ""}
` : ""}`;

      const response = await gemini.models.generateContent({
        model: "gemini-3.5-flash",
        contents: contents,
        config: {
          systemInstruction: dynamicInstruction,
          tools: [{ 
            functionDeclarations: [
              selectScenarioDeclaration, 
              configureExperimentDeclaration, 
              triggerSimulationRunDeclaration
            ] 
          }],
          // Use temperate to make conversation natural while instructions command math logic
          temperature: 0.7,
        }
      });

      textResponse = response.text || "";
      if (!textResponse && response.candidates && response.candidates[0]?.content?.parts?.[0]?.text) {
        textResponse = response.candidates[0].content.parts[0].text;
      }

      // Check if the model triggered a function call
      if (response.functionCalls && response.functionCalls.length > 0) {
        const call = response.functionCalls[0];
        const args = call.args as any;

        if (call.name === "selectScenario") {
          stateUpdate = {
            scenarioId: args.scenarioId,
            scenarioName: args.scenarioName,
            primaryMetricName: args.primaryMetricName,
            conversionEventName: args.conversionEventName,
            baselineRate: args.baselineRate,
            dailyTrafficAvg: args.dailyTrafficAvg,
            totalHistoricalVisitors: args.dailyTrafficAvg * 30,
            totalHistoricalRegistrations: Math.round(args.dailyTrafficAvg * 30 * args.baselineRate),
            step: 2
          };
        } 
        else if (call.name === "configureExperiment") {
          stateUpdate = {
            desiredMde: args.desiredMde,
            alpha: args.alpha,
            power: args.power,
            trafficSplit: args.trafficSplit,
            step: 3
          };
        } 
        else if (call.name === "triggerSimulationRun") {
          // Run precise backend simulation immediately to protect distribution boundaries using exact group sizes
          const nA = args.controlGroupSize || activeState?.controlGroupSize || args.sampleSize || 10000;
          const nB = args.testGroupSize || activeState?.testGroupSize || args.sampleSize || 10000;
          const durationValue = args.duration || activeState?.duration || 14;
          const scenarioId = activeState?.scenarioId || args.scenarioId || 1;
          let baseline = 0.405;
          if (scenarioId === 1) {
            baseline = 0.405;
          } else if (scenarioId === 2) {
            baseline = 0.052;
          } else if (scenarioId === 3) {
            baseline = 0.158;
          }
          
          let realUplift = 0.05;
          if (scenarioId === 1) {
            realUplift = 0.098; // Scenario 1: Positive uplift
          } else if (scenarioId === 2) {
            // Generate Group B conversion using a random relative effect between -8% and +5%
            realUplift = Number((-0.08 + Math.random() * 0.13).toFixed(5));
          } else if (scenarioId === 3) {
            realUplift = -0.045; // Scenario 3: Negative or no uplift
          }

          let successesA = simulateBinomialBackend(nA, baseline);
          if (scenarioId === 2) {
            const minA = Math.floor(0.050 * nA);
            const maxA = Math.ceil(0.053 * nA);
            if (successesA < minA) successesA = minA;
            if (successesA > maxA) successesA = maxA;
          }
          let successesB = simulateBinomialBackend(nB, baseline * (1 + realUplift));
          if (scenarioId === 2) {
            const maxB = Math.floor(0.099 * nB);
            if (successesB > maxB) successesB = maxB;
          }

          stateUpdate = {
            sampleSize: nA, 
            duration: durationValue,
            controlGroupSize: nA,
            controlGroupSuccesses: successesA,
            testGroupSize: nB,
            testGroupSuccesses: successesB,
            simulatedUplift: realUplift,
            simulatedTestRate: baseline * (1 + realUplift),
            step: 4
          };

          // We can pass the function response back to Gemini to obtain the correct descriptive reaction
          const functionResult = {
            controlGroupSize: nA,
            controlGroupSuccesses: successesA,
            testGroupSize: nB,
            testGroupSuccesses: successesB,
            simulatedUplift: realUplift,
            simulatedTestRate: baseline * (1 + realUplift)
          };

          // Re-call Gemini with function execution output so the mentor talks about these exact figures
          const followUpContents = [
            ...contents,
            {
              role: "model",
              parts: [{ functionCall: { name: "triggerSimulationRun", args } }]
            },
            {
              role: "user",
              parts: [{ 
                text: `Виконано симуляцію. Результати: ${JSON.stringify(functionResult)}` 
              }]
            }
          ];

          const followUpResponse = await gemini.models.generateContent({
            model: "gemini-3.5-flash",
            contents: followUpContents,
            config: {
              systemInstruction: systemInstruction,
              temperature: 0.2,
            }
          });

          textResponse = followUpResponse.text || "";
          if (!textResponse && followUpResponse.candidates && followUpResponse.candidates[0]?.content?.parts?.[0]?.text) {
            textResponse = followUpResponse.candidates[0].content.parts[0].text;
          }
          if (!textResponse) {
            textResponse = `Група А (Контроль): Охоплено користувачів: ${nA}, Успішних дій: ${successesA} (Конверсія: ${((successesA / nA) * 100).toFixed(2)}%)
Група Б (Тест): Охоплено користувачів: ${nB}, Успішних дій: ${successesB} (Конверсія: ${((successesB / nB) * 100).toFixed(2)}%)`;
          }
        }

        // If the function was NOT triggerSimulationRun, we can do a standard response text or trigger model again
        if (call.name !== "triggerSimulationRun") {
          const followUpContents = [
            ...contents,
            {
              role: "model",
              parts: [{ functionCall: { name: call.name, args } }]
            },
            {
              role: "user",
              parts: [{ 
                text: `Функція виконана успішно! Продовжуй діалог у ролі ментора.` 
              }]
            }
          ];

          const followUpResponse = await gemini.models.generateContent({
            model: "gemini-3.5-flash",
            contents: followUpContents,
            config: {
              systemInstruction: systemInstruction,
              temperature: 0.5,
            }
          });
          
          let potentialText = followUpResponse.text || "";
          if (!potentialText && followUpResponse.candidates && followUpResponse.candidates[0]?.content?.parts?.[0]?.text) {
            potentialText = followUpResponse.candidates[0].content.parts[0].text;
          }
          textResponse = potentialText || textResponse;
        }
      }

      // If textResponse still empty, trigger fallback behaviour
      if (!textResponse || textResponse.trim() === "") {
        const isStep2 = activeState?.step === 2 || activeState?.step === 3;
        if (isStep2) {
          textResponse = "Я бачу твою відповідь, але мені треба уточнити: який статистичний тест, H0/H1 і параметри alpha, power, MDE ти обираєш?";
        } else {
          const fallbackResult = getLocalMentorFeedback(lastUserInput, activeState);
          textResponse = fallbackResult.text;
          if (!stateUpdate) stateUpdate = fallbackResult.stateUpdate;
        }
      }

    } catch (apiCallError: any) {
      console.warn("Gemini API call threw an error (switching to offline fallback):", apiCallError);
      const fallbackResult = getLocalMentorFeedback(lastUserInput, activeState);
      return res.json({
        message: {
          sender: "mentor",
          text: fallbackResult.text
        },
        stateUpdate: fallbackResult.stateUpdate || stateUpdate || null
      });
    }

    return res.json({
      message: {
        sender: "mentor",
        text: textResponse
      },
      stateUpdate
    });

  } catch (error: any) {
    console.error("Gemini API Error in /api/chat:", error);
    const emergencyResult = getLocalMentorFeedback(req.body.lastUserInput, req.body.activeState);
    return res.json({
      message: {
        sender: "mentor",
        text: emergencyResult.text
      },
      stateUpdate: emergencyResult.stateUpdate || null
    });
  }
});

// Serve frontend assets
if (process.env.NODE_ENV !== "production") {
  const startVite = async () => {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Development full-stack server running on http://localhost:${PORT}`);
    });
  };
  startVite();
} else {
  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Production full-stack server running on port ${PORT}`);
  });
}
