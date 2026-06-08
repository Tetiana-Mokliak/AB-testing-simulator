import React, { useState, useEffect } from 'react';
import { DailyData } from '../types';
import { formatNum } from '../utils';
import { 
  Users, 
  UserCheck, 
  Percent, 
  BookOpen, 
  ChevronDown, 
  ChevronUp, 
  FileText, 
  Check, 
  Save,
  HelpCircle,
  Copy,
  Terminal,
  Table,
  List
} from 'lucide-react';

interface Props {
  historicalData: DailyData[] | null;
  totalVisitors: number | null;
  totalRegistrations: number | null;
  scenarioName?: string | null;
  primaryMetricName?: string | null;
  conversionEventName?: string | null;
  step?: number;
  scenarioId?: number | null;
  controlGroupSize?: number | null;
  controlGroupSuccesses?: number | null;
  testGroupSize?: number | null;
  testGroupSuccesses?: number | null;
  simulatedUplift?: number | null;
  simulatedTestRate?: number | null;
  dailyTrafficAvg?: number | null;
}

export default function AnalyticsWorkspace({ 
  historicalData, 
  totalVisitors, 
  totalRegistrations,
  scenarioName,
  primaryMetricName,
  conversionEventName,
  step,
  scenarioId,
  controlGroupSize,
  controlGroupSuccesses,
  testGroupSize,
  testGroupSuccesses,
  simulatedUplift,
  simulatedTestRate,
  dailyTrafficAvg
}: Props) {
  // Clipboard copied status
  const [isCopied, setIsCopied] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);

  useEffect(() => {
    setCsvError(null);
  }, [controlGroupSize, testGroupSize]);

  // Clipboard copy action
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // Deterministic seed helper to generate exactly 20 event-level user rows
  const generateDeterministicRawData = () => {
    const rawRows = [];
    const size = 20;
    const activeScenario = scenarioId || 1;
    
    // Seed helper
    let seed = 42;
    const random = () => {
      const x = Math.sin(seed++) * 10000;
      return x - Math.floor(x);
    };

    const defaultBaseline = activeScenario === 2 ? 0.052 : (activeScenario === 3 ? 0.158 : 0.405);
    const defaultTest = activeScenario === 2 ? 0.052 : (activeScenario === 3 ? 0.158 : 0.445);

    const crA = (controlGroupSuccesses && controlGroupSize) ? (controlGroupSuccesses / controlGroupSize) : defaultBaseline;
    const crB = (testGroupSuccesses && testGroupSize) ? (testGroupSuccesses / testGroupSize) : defaultTest;

    for (let i = 0; i < size; i++) {
      const group = i % 2 === 0 ? 'A' : 'B';
      const user_id = `usr_${group.toLowerCase()}_${10000 + i}`;
      const device_type = activeScenario === 3 
        ? (random() < 0.75 ? 'Mobile' : 'Desktop')
        : (random() < 0.55 ? 'Mobile' : 'Desktop');
        
      const traffic_source = random() < 0.45 
        ? 'Organic' 
        : (random() < 0.65 ? 'Paid' : 'Email');

      // Conversion
      let cr = group === 'A' ? crA : crB;
      if (activeScenario === 1 && device_type === 'Mobile') {
        cr = Math.max(0.01, cr - 0.05);
      } else if (activeScenario === 2 && device_type === 'Mobile') {
        cr += 0.03;
      } else if (activeScenario === 3) {
        if (group === 'B' && device_type === 'Mobile') {
          cr = 0.158 * 2.0; // auto-filled mobile conversion rate doubled
        } else if (group === 'A' && device_type === 'Mobile') {
          cr = 0.158;
        }
      }

      const converted = random() < cr ? 1 : 0;

      // Revenue 
      let revenue = 0;
      if (converted === 1) {
        if (activeScenario === 2) {
          if (group === 'A') {
            revenue = 4.99;
          } else {
            revenue = 5.85;
          }
        } else if (activeScenario === 3) {
          revenue = Number((30.0 + random() * 30.0).toFixed(2));
        }
      }

      // Session Duration
      let session_duration_sec = 100;
      if (activeScenario === 1) {
        let base_dur = 150 + Math.floor(random() * 40 - 20);
        if (traffic_source === 'Organic') base_dur = Math.round(base_dur * 1.2);
        session_duration_sec = base_dur;
      } else if (activeScenario === 2) {
        let base_dur = 80 + Math.floor(random() * 20 - 10);
        if (traffic_source === 'Paid') base_dur = Math.max(10, base_dur - 30);
        session_duration_sec = base_dur;
      } else if (activeScenario === 3) {
        session_duration_sec = 105 + Math.floor(random() * 30 - 15);
      }

      // Pages viewed
      const pages_viewed = activeScenario === 1 
        ? Math.floor(random() * 5) + 2
        : activeScenario === 2 
          ? Math.floor(random() * 3) + 1
          : Math.floor(random() * 6) + 3;

      // Clicks
      const clicks = activeScenario === 1
        ? Math.floor(random() * 15) + 10
        : activeScenario === 2
          ? Math.floor(random() * 10) + 3
          : Math.floor(random() * 25) + 12;

      const date = `2026-05-${String(Math.floor(random() * 28) + 1).padStart(2, '0')}`;

      rawRows.push({
        user_id,
        group,
        converted,
        revenue,
        session_duration_sec,
        pages_viewed,
        clicks,
        device_type,
        traffic_source,
        date
      });
    }

    return rawRows;
  };

  // Google Colab option state
  const [showColab, setShowColab] = useState(false);

  // Dynamic CSV Downloader for V3.2
  const downloadCSV = () => {
    const activeScenario = scenarioId || 1;
    const nA = controlGroupSize || 5000;
    const nB = testGroupSize || 5000;
    
    const maxTotalSamples = activeScenario === 2 ? 130000 : 100000;
    if (nA + nB > maxTotalSamples) {
      setCsvError(`Загальний розмір вибірки (${formatNum(nA + nB)} рядків) перевищує ліміт у ${formatNum(maxTotalSamples)} користувачів (Sample A + Sample B). Будь ласка, зменшіть sample size.`);
      return;
    }
    setCsvError(null);
    
    // Build CSV dynamically
    let csv = "user_id,group,converted,revenue,session_duration_sec,pages_viewed,clicks,device_type,traffic_source,date\n";
    
    const defaultBaseline = activeScenario === 2 ? 0.052 : (activeScenario === 3 ? 0.158 : 0.405);
    const defaultTest = activeScenario === 2 ? 0.052 : (activeScenario === 3 ? 0.158 : 0.445);

    const crA = (controlGroupSuccesses && controlGroupSize) ? (controlGroupSuccesses / controlGroupSize) : defaultBaseline;
    const crB = (testGroupSuccesses && testGroupSize) ? (testGroupSuccesses / testGroupSize) : defaultTest;

    // Generate the complete dataset under max limit
    const records = nA + nB;

    const defaultTraffic = activeScenario === 2 ? 3000 : 2000;
    const traffic = dailyTrafficAvg || defaultTraffic;
    const test_duration_days = Math.max(1, Math.ceil(records / traffic));

    interface SimulatedRow {
      group: 'A' | 'B';
      device_type: string;
      traffic_source: string;
      converted: number;
      revenue: number;
      session_duration_sec: number;
      pages_viewed: number;
      clicks: number;
    }

    let finalRows: SimulatedRow[] = [];
    let offsetA = 0;
    let offsetB = 0;
    let success = false;
    let attempts = 0;

    // Group A validation tolerance: must be within ±0.5 percentage points (0.005) of the displayed baseline.
    // We use Math.max(0.005, 1 / nA) to robustly support tiny samples without infinite loops.
    // For Scenario 2 we enforce a tighter tolerance of 0.001 to keep Group A strictly near 5.2%.
    const tolA = activeScenario === 2 ? Math.max(0.001, 1 / nA) : Math.max(0.005, 1 / nA);
    const tolB = activeScenario === 2 ? Math.max(0.001, 1 / nB) : Math.max(0.005, 1 / nB);

    while (!success && attempts < 50) {
      finalRows = [];
      let seed = 42 + attempts * 100;
      const rand = () => {
        const x = Math.sin(seed++) * 10000;
        return x - Math.floor(x);
      };

      let convCountA = 0;
      let convCountB = 0;

      for (let i = 0; i < records; i++) {
        const group = i < nA ? 'A' : 'B';
        const device_type = activeScenario === 3 
          ? (rand() < 0.75 ? 'Mobile' : 'Desktop')
          : (rand() < 0.55 ? 'Mobile' : 'Desktop');
          
        const traffic_source = rand() < 0.45 
          ? 'Organic' 
          : (rand() < 0.65 ? 'Paid' : 'Email');

        let cr = group === 'A' ? crA + offsetA : crB + offsetB;
        if (activeScenario === 1 && device_type === 'Mobile') {
          cr = Math.max(0.01, cr - 0.05);
        } else if (activeScenario === 2 && device_type === 'Mobile') {
          cr += 0.03;
        } else if (activeScenario === 3) {
          if (group === 'B' && device_type === 'Mobile') {
            cr = (crB + offsetB) * 2.0;
          } else if (group === 'A' && device_type === 'Mobile') {
            cr = crA + offsetA;
          }
        }

        const converted = rand() < cr ? 1 : 0;

        let revenue = 0;
        if (converted === 1) {
          if (activeScenario === 2) {
            if (group === 'A') {
              revenue = 4.99;
            } else {
              revenue = 5.85;
            }
          } else if (activeScenario === 3) {
            revenue = Number((30.0 + rand() * 30.0).toFixed(2));
          }
        }

        let session_duration_sec = 100;
        if (activeScenario === 1) {
          let base_dur = 150 + Math.floor(rand() * 40 - 20);
          if (traffic_source === 'Organic') base_dur = Math.round(base_dur * 1.2);
          session_duration_sec = base_dur;
        } else if (activeScenario === 2) {
          let base_dur = 80 + Math.floor(rand() * 20 - 10);
          if (traffic_source === 'Paid') base_dur = Math.max(10, base_dur - 30);
          session_duration_sec = base_dur;
        } else if (activeScenario === 3) {
          session_duration_sec = 105 + Math.floor(rand() * 30 - 15);
        }

        const pages_viewed = activeScenario === 1 
          ? Math.floor(rand() * 5) + 2
          : activeScenario === 2 
            ? Math.floor(rand() * 3) + 1
            : Math.floor(rand() * 6) + 3;

        const clicks = activeScenario === 1
          ? Math.floor(rand() * 15) + 10
          : activeScenario === 2
            ? Math.floor(rand() * 10) + 3
            : Math.floor(rand() * 25) + 12;

        if (group === 'A') {
          if (converted === 1) convCountA++;
        } else {
          if (converted === 1) convCountB++;
        }

        finalRows.push({
          group,
          device_type,
          traffic_source,
          converted,
          revenue,
          session_duration_sec,
          pages_viewed,
          clicks
        });
      }

      const actualCrA = convCountA / nA;
      const actualCrB = convCountB / nB;

      const diffA = crA - actualCrA;
      const diffB = crB - actualCrB;

      if (Math.abs(diffA) <= tolA && Math.abs(diffB) <= tolB) {
        success = true;
      } else {
        offsetA += diffA * 0.9;
        offsetB += diffB * 0.9;
        attempts++;
      }
    }

    // Post-generation validation for Scenario 2 (pricing experiment) as requested
    if (activeScenario === 2) {
      const finalCrA = finalRows.filter(r => r.group === 'A' && r.converted === 1).length / nA;
      const finalCrB = finalRows.filter(r => r.group === 'B' && r.converted === 1).length / nB;

      // Group A conversion rate should stay near 5.2% (approx within 5.0% - 5.3%)
      // Group B conversion rate should remain in a realistic range around baseline (approx within 4.0% - 6.5%)
      // Conversion rates above 10% should be treated as invalid for this scenario.
      if (finalCrA > 0.10 || finalCrB > 0.10) {
        throw new Error("Validation Error: Conversion rate exceeds realistic pricing experiment bounds (>10%)");
      }

      // ARPU should approximately match: ARPU ≈ conversion_rate * subscription_price
      const arpuA = finalRows.filter(r => r.group === 'A').reduce((sum, r) => sum + r.revenue, 0) / nA;
      const arpuB = finalRows.filter(r => r.group === 'B').reduce((sum, r) => sum + r.revenue, 0) / nB;

      const expectedArpuA = finalCrA * 4.99;
      const expectedArpuB = finalCrB * 5.85;

      if (Math.abs(arpuA - expectedArpuA) > 0.005 || Math.abs(arpuB - expectedArpuB) > 0.005) {
        console.warn(`ARPU validation mismatch: A_actual=${arpuA}, expected=${expectedArpuA}; B_actual=${arpuB}, expected=${expectedArpuB}`);
      }
    }

    for (let i = 0; i < records; i++) {
      const row = finalRows[i];
      const user_id = `usr_${row.group.toLowerCase()}_${10000 + i}`;

      const idxWithinGroup = i < nA ? i : i - nA;
      const groupSize = row.group === 'A' ? nA : nB;
      const dayIdx = Math.min(test_duration_days - 1, Math.floor((idxWithinGroup / groupSize) * test_duration_days));

      const d = new Date(Date.UTC(2026, 4, 1 + dayIdx));
      const year = d.getUTCFullYear();
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const daySec = String(d.getUTCDate()).padStart(2, '0');
      const date = `${year}-${month}-${daySec}`;

      csv += `${user_id},${row.group},${row.converted},${row.revenue.toFixed(2)},${row.session_duration_sec},${row.pages_viewed},${row.clicks},${row.device_type},${row.traffic_source},${date}\n`;
    }

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `stepup_ab_dataset_scenario_${activeScenario}.csv`);
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Google Colab Script Export
  const getPythonScriptForColab = () => {
    const activeScenario = scenarioId || 1;
    const nA = controlGroupSize || 10000;
    const nB = testGroupSize || 10000;
    const uplift = simulatedUplift !== null ? simulatedUplift : 0.05;

    if (activeScenario === 1) {
      return `import numpy as np
import pandas as pd

# Встановлюємо seed для бездоганної відтворюваності
np.random.seed(42)

N_A = ${nA}
N_B = ${nB}

# Базові параметри Сценарію 1
p_A_base = 0.405
relative_uplift = ${uplift}
p_B_base = p_A_base * (1 + relative_uplift)

def generate_group_data(n, group_name, conversion_rate):
    # Генерація сегментів
    device_type = np.random.choice(["Mobile", "Desktop"], size=n, p=[0.60, 0.40])
    traffic_source = np.random.choice(["Organic", "Paid", "Social"], size=n, p=[0.45, 0.35, 0.20])
    
    # Клієнти на Mobile мають на 5% нижчу конверсію (базовий ефект Mobile)
    converted = []
    for i in range(n):
        cr = conversion_rate
        if device_type[i] == "Mobile":
            cr = max(0.01, cr - 0.05)
        converted.append(np.random.binomial(1, cr))
    converted = np.array(converted)
    
    # Органічний трафік має на 20% більшу тривалість сесій
    base_duration = np.random.normal(150, 30, size=n)
    session_duration = []
    for i in range(n):
        dur = base_duration[i]
        if traffic_source[i] == "Organic":
            dur *= 1.2
        session_duration.append(max(10, int(dur)))
    session_duration = np.array(session_duration)
    
    pages_viewed = np.random.poisson(3.5, size=n) + 1
    clicks = np.random.poisson(12, size=n) + np.random.binomial(10, 0.5, size=n)
    revenue = np.zeros(n)
    dates = [f"2026-05-{np.random.randint(1, 29):02d}" for _ in range(n)]
    
    return pd.DataFrame({
        "user_id": [f"usr_{group_name.lower()}_{i+10000}" for i in range(n)],
        "group": group_name,
        "converted": converted,
        "revenue": revenue,
        "session_duration_sec": session_duration,
        "pages_viewed": pages_viewed,
        "clicks": clicks,
        "device_type": device_type,
        "traffic_source": traffic_source,
        "date": dates
    })

df_A = generate_group_data(N_A, "A", p_A_base)
df_B = generate_group_data(N_B, "B", p_B_base)
df = pd.concat([df_A, df_B], ignore_index=True)

print("Розподіл за групами (Registration Conversion):")
print(df.groupby('group')['converted'].agg(['count', 'sum', 'mean']))
print("\\nСередня тривалість сесії за джерелом:")
print(df.groupby('traffic_source')['session_duration_sec'].mean())
`;
    } else if (activeScenario === 2) {
      return `import numpy as np
import pandas as pd

np.random.seed(42)

N_A = ${nA}
N_B = ${nB}

# Базові параметри Сценарію 2
p_A_base = 0.052
relative_uplift = ${uplift}
p_B_base = p_A_base * (1 + relative_uplift)

def generate_group_data(n, group_name, conversion_rate):
    device_type = np.random.choice(["Mobile", "Desktop"], size=n, p=[0.70, 0.30])
    traffic_source = np.random.choice(["Organic", "Paid", "Email"], size=n, p=[0.40, 0.45, 0.15])
    
    # Мобільний трафік конвертується легше (+3%)
    converted = []
    for i in range(n):
        cr = conversion_rate
        if device_type[i] == "Mobile":
            cr += 0.03
        converted.append(np.random.binomial(1, cr))
    converted = np.array(converted)
    
    # Специфіка виручки: 95% zero. Converted: A генерує $4.99, B - логнормальний розподіл
    revenue = []
    for i in range(n):
        if converted[i] == 0:
            revenue.append(0.0)
        else:
            if group_name == "A":
                revenue.append(4.99)
            else:
                rev = np.random.lognormal(mean=1.75, sigma=0.4)
                revenue.append(round(max(2.99, min(14.99, rev)), 2))
    revenue = np.array(revenue)
    
    # Paid трафік має коротші сесії через відтік (-30с)
    base_duration = np.random.normal(80, 20, size=n)
    session_duration = []
    for i in range(n):
        dur = base_duration[i]
        if traffic_source[i] == "Paid":
            dur -= 30
        session_duration.append(max(5, int(dur)))
    session_duration = np.array(session_duration)
    
    pages_viewed = np.random.poisson(2.1, size=n) + 1
    clicks = np.random.poisson(6, size=n) + 1
    dates = [f"2026-05-{np.random.randint(1, 29):02d}" for _ in range(n)]
    
    return pd.DataFrame({
        "user_id": [f"usr_{group_name.lower()}_{i+20000}" for i in range(n)],
        "group": group_name,
        "converted": converted,
        "revenue": revenue,
        "session_duration_sec": session_duration,
        "pages_viewed": pages_viewed,
        "clicks": clicks,
        "device_type": device_type,
        "traffic_source": traffic_source,
        "date": dates
    })

df_A = generate_group_data(N_A, "A", p_A_base)
df_B = generate_group_data(N_B, "B", p_B_base)
df = pd.concat([df_A, df_B], ignore_index=True)

print("Загальні результати ARPU за групами:")
print(df.groupby('group')['revenue'].mean())
print("\\nКонверсія в покупку за типом девайса:")
print(df.groupby(['group', 'device_type'])['converted'].mean())
`;
    } else {
      return `import numpy as np
import pandas as pd

np.random.seed(42)

N_A = ${nA}
N_B = ${nB}

# Базові параметри Сценарію 3
p_A_base = 0.158
relative_uplift = ${uplift}
p_B_base = p_A_base * (1 + relative_uplift)

def generate_group_data(n, group_name, conversion_rate):
    # 75% Mobile
    device_type = np.random.choice(["Mobile", "Desktop"], size=n, p=[0.75, 0.25])
    traffic_source = np.random.choice(["Organic", "Paid", "Referral"], size=n, p=[0.50, 0.35, 0.15])
    
    # В Групі В на Mobile приховано закладено позитивний ефект (автозаповнення подвоїло конверсію)
    # Desktop нейтральний.
    converted = []
    for i in range(n):
        cr = conversion_rate
        if group_name == "B" and device_type[i] == "Mobile":
            # Auto-filled mobile conversion rate doubled
            cr = p_A_base * 2.0
        elif group_name == "A" and device_type[i] == "Mobile":
            cr = p_A_base
        converted.append(np.random.binomial(1, cr))
    converted = np.array(converted)
    
    # Виручка на конверсію (~$45)
    revenue = []
    for i in range(n):
        if converted[i] == 0:
            revenue.append(0.0)
        else:
            val = np.random.normal(45, 10)
            revenue.append(round(max(10.0, val), 2))
    revenue = np.array(revenue)
    
    session_duration = np.random.normal(105, 25, size=n)
    session_duration = np.array([max(10, int(d)) for d in session_duration])
    
    pages_viewed = np.random.poisson(4, size=n) + 1
    clicks = np.random.poisson(18, size=n) + np.random.binomial(5, 0.5, size=n)
    dates = [f"2026-05-{np.random.randint(1, 29):02d}" for _ in range(n)]
    
    return pd.DataFrame({
        "user_id": [f"usr_{group_name.lower()}_{i+30000}" for i in range(n)],
        "group": group_name,
        "converted": converted,
        "revenue": revenue,
        "session_duration_sec": session_duration,
        "pages_viewed": pages_viewed,
        "clicks": clicks,
        "device_type": device_type,
        "traffic_source": traffic_source,
        "date": dates
    })

df_A = generate_group_data(N_A, "A", p_A_base)
df_B = generate_group_data(N_B, "B", p_B_base)
df = pd.concat([df_A, df_B], ignore_index=True)

print("Частка мобільного трафіку: ", len(df[df['device_type']=='Mobile'])/len(df))
print("\\nКонверсія за групами та типом девайса (Mobile vs Desktop):")
print(df.groupby(['group', 'device_type'])['converted'].agg(['count', 'sum', 'mean']))
`;
    }
  };
  // Notepad support
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>(() => {
    return localStorage.getItem('stepup_analyst_notes') || 
`📝 Мій аналітичний блокнот StepUp:

1. Розрахунок історичної конверсії (С1):
   - Охоплення (30 днів): ...
   - Реєстрації (30 днів): ...
   - Базова конверсія (C1_base) = (Реєстрації / Охоплення) * 100% = ... %

2. Спланований експеримент:
   - Бажана потужність (Power): 80% (β = 0.20)
   - Рівень значущості (Alpha): 5% (α = 0.05)
   - Очікуваний мінімальний ефект (MDE): ...
   - Розрахований розмір вибірки на групу: ...
   - Термін проведення тесту (днів): ...

3. Результати: ...`;
  });

  // Auto-save notes
  useEffect(() => {
    localStorage.setItem('stepup_analyst_notes', notes);
    setIsSaved(true);
    const timer = setTimeout(() => setIsSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [notes]);

  // Formula toggles
  const [showFormula1, setShowFormula1] = useState(false);
  const [showFormula2, setShowFormula2] = useState(false);
  const [showFormula3, setShowFormula3] = useState(false);

  const isSimulationActive = controlGroupSize !== null && controlGroupSize !== undefined;

  return (
    <div className="flex flex-col gap-6">

      {/* A/B SANDBOX RESULTS PANEL (Phase 4 / Step 4) */}
      {isSimulationActive && (
        <div id="ab-test-results-panel" className="bg-[#121214] rounded-xl border border-blue-500/20 p-5 flex flex-col gap-5 shadow-2xl relative overflow-hidden">
          {/* Subtle decorative glow */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl pointer-events-none"></div>
          
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <h2 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 pulse-slow"></span>
              Результати симуляції A/B тесту (Етап 4)
            </h2>
            <span className="text-[10px] font-mono font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-md">
              A/B Sandbox Active
            </span>
          </div>

          {/* 1. Aggregated Summary Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-400">Зведена статистика експерименту</span>
              <span className="text-[10px] text-zinc-500 font-mono">Довіра: 95%</span>
            </div>

            <div className="border border-zinc-800 rounded-xl overflow-hidden bg-black/40">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-950 text-zinc-400 font-medium select-none text-[10px] uppercase tracking-wider font-mono">
                      <th className="py-2.5 px-3">Метрика</th>
                      <th className="py-2.5 px-3">Група А (Control)</th>
                      <th className="py-2.5 px-3">Група Б (Test)</th>
                      <th className="py-2.5 px-3">Абс. Різниця</th>
                      <th className="py-2.5 px-3">Відн. Різниця (%)</th>
                      <th className="py-2.5 px-3">Рекомендований тест</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 font-mono text-zinc-300">
                    {/* Row 1: Primary Metric */}
                    <tr>
                      <td className="py-2.5 px-3 font-sans font-semibold text-zinc-200">
                        {primaryMetricName || "Primary Conversion (CR)"}
                      </td>
                      <td className="py-2.5 px-3">
                        {controlGroupSuccesses !== null && controlGroupSize ? (
                          <>
                            {formatNum(controlGroupSuccesses)} / {formatNum(controlGroupSize)} 
                            <span className="text-zinc-500 ml-1">({((controlGroupSuccesses / controlGroupSize) * 100).toFixed(2)}%)</span>
                          </>
                        ) : "-"}
                      </td>
                      <td className="py-2.5 px-3">
                        {testGroupSuccesses !== null && testGroupSize ? (
                          <>
                            {formatNum(testGroupSuccesses)} / {formatNum(testGroupSize)} 
                            <span className="text-zinc-500 ml-1">({((testGroupSuccesses / testGroupSize) * 100).toFixed(2)}%)</span>
                          </>
                        ) : "-"}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-blue-400">
                        {controlGroupSuccesses !== null && controlGroupSize && testGroupSuccesses !== null && testGroupSize ? (
                          <>
                            {(((testGroupSuccesses / testGroupSize) - (controlGroupSuccesses / controlGroupSize)) * 100).toFixed(2)}%
                          </>
                        ) : "-"}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-emerald-400">
                        {controlGroupSuccesses !== null && controlGroupSize && testGroupSuccesses !== null && testGroupSize ? (
                          <>
                            {((((testGroupSuccesses / testGroupSize) - (controlGroupSuccesses / controlGroupSize)) / (controlGroupSuccesses / controlGroupSize)) * 100).toFixed(2)}%
                          </>
                        ) : "-"}
                      </td>
                      <td className="py-2.5 px-3 text-zinc-400 font-sans">
                        Z-test / Chi-Square
                      </td>
                    </tr>

                    {/* Row 2: Revenue / ARPU */}
                    <tr>
                      <td className="py-2.5 px-3 font-sans font-semibold text-zinc-200">
                        Revenue / ARPU
                      </td>
                      <td className="py-2.5 px-3">
                        {scenarioId === 1 && "$0.00"}
                        {scenarioId === 2 && controlGroupSuccesses !== null && controlGroupSize && (
                          <>${((controlGroupSuccesses * 4.99) / controlGroupSize).toFixed(3)}</>
                        )}
                        {scenarioId === 3 && controlGroupSuccesses !== null && controlGroupSize && (
                          <>${((controlGroupSuccesses * 45.00) / controlGroupSize).toFixed(2)}</>
                        )}
                        {(!scenarioId || scenarioId > 3) && "-"}
                      </td>
                      <td className="py-2.5 px-3">
                        {scenarioId === 1 && "$0.00"}
                        {scenarioId === 2 && testGroupSuccesses !== null && testGroupSize && (
                          <>${((testGroupSuccesses * 5.85) / testGroupSize).toFixed(3)}</>
                        )}
                        {scenarioId === 3 && testGroupSuccesses !== null && testGroupSize && (
                          <>${((testGroupSuccesses * 45.00) / testGroupSize).toFixed(2)}</>
                        )}
                        {(!scenarioId || scenarioId > 3) && "-"}
                      </td>
                      <td className="py-2.5 px-3">
                        {scenarioId === 1 && "$0.00"}
                        {scenarioId === 2 && controlGroupSuccesses !== null && controlGroupSize && testGroupSuccesses !== null && testGroupSize && (
                          <>${(((testGroupSuccesses * 5.85) / testGroupSize) - ((controlGroupSuccesses * 4.99) / controlGroupSize)).toFixed(3)}</>
                        )}
                        {scenarioId === 3 && controlGroupSuccesses !== null && controlGroupSize && testGroupSuccesses !== null && testGroupSize && (
                          <>${(((testGroupSuccesses * 45.00) / testGroupSize) - ((controlGroupSuccesses * 45.00) / controlGroupSize)).toFixed(2)}</>
                        )}
                        {(!scenarioId || scenarioId > 3) && "-"}
                      </td>
                      <td className="py-2.5 px-3 text-emerald-400">
                        {scenarioId === 1 && "0.0%"}
                        {scenarioId === 2 && controlGroupSuccesses !== null && controlGroupSize && testGroupSuccesses !== null && testGroupSize && (
                          <>
                            {(((((testGroupSuccesses * 5.85) / testGroupSize) - ((controlGroupSuccesses * 4.99) / controlGroupSize)) / ((controlGroupSuccesses * 4.99) / controlGroupSize)) * 100).toFixed(1)}%
                          </>
                        )}
                        {scenarioId === 3 && controlGroupSuccesses !== null && controlGroupSize && testGroupSuccesses !== null && testGroupSize && (
                          <>
                            {(((((testGroupSuccesses * 45.00) / testGroupSize) - ((controlGroupSuccesses * 45.00) / controlGroupSize)) / ((controlGroupSuccesses * 45.00) / controlGroupSize)) * 100).toFixed(1)}%
                          </>
                        )}
                        {(!scenarioId || scenarioId > 3) && "-"}
                      </td>
                      <td className="py-2.5 px-3 text-zinc-400 font-sans">
                        Mann-Whitney U / Bootstrap
                      </td>
                    </tr>

                    {/* Row 3: Session Duration */}
                    <tr>
                      <td className="py-2.5 px-3 font-sans font-semibold text-zinc-200">
                        Session Duration
                      </td>
                      <td className="py-2.5 px-3">
                        {scenarioId === 1 && "152.4s"}
                        {scenarioId === 2 && "82.6s"}
                        {scenarioId === 3 && "112.5s"}
                        {(!scenarioId || scenarioId > 3) && "-"}
                      </td>
                      <td className="py-2.5 px-3">
                        {scenarioId === 1 && "153.1s"}
                        {scenarioId === 2 && "84.2s"}
                        {scenarioId === 3 && "118.9s"}
                        {(!scenarioId || scenarioId > 3) && "-"}
                      </td>
                      <td className="py-2.5 px-3">
                        {scenarioId === 1 && "+0.7s"}
                        {scenarioId === 2 && "+1.6s"}
                        {scenarioId === 3 && "+6.4s"}
                        {(!scenarioId || scenarioId > 3) && "-"}
                      </td>
                      <td className="py-2.5 px-3 text-emerald-400">
                        {scenarioId === 1 && "+0.5%"}
                        {scenarioId === 2 && "+1.9%"}
                        {scenarioId === 3 && "+5.7%"}
                        {(!scenarioId || scenarioId > 3) && "-"}
                      </td>
                      <td className="py-2.5 px-3 text-zinc-400 font-sans">
                        Welch t-test / Log-normal
                      </td>
                    </tr>

                    {/* Row 4: Clicks / Pages */}
                    <tr>
                      <td className="py-2.5 px-3 font-sans font-semibold text-zinc-200">
                        Clicks / Pages
                      </td>
                      <td className="py-2.5 px-3">
                        {scenarioId === 1 && "12.5 cl. / 3.8 pg."}
                        {scenarioId === 2 && "5.2 cl. / 1.9 pg."}
                        {scenarioId === 3 && "18.4 cl. / 4.2 pg."}
                        {(!scenarioId || scenarioId > 3) && "-"}
                      </td>
                      <td className="py-2.5 px-3">
                        {scenarioId === 1 && "13.1 cl. / 3.9 pg."}
                        {scenarioId === 2 && "5.5 cl. / 2.0 pg."}
                        {scenarioId === 3 && "21.2 cl. / 4.8 pg."}
                        {(!scenarioId || scenarioId > 3) && "-"}
                      </td>
                      <td className="py-2.5 px-3">
                        {scenarioId === 1 && "+0.6 cl. / +0.1 pg."}
                        {scenarioId === 2 && "+0.3 cl. / +0.1 pg."}
                        {scenarioId === 3 && "+2.8 cl. / +0.6 pg."}
                        {(!scenarioId || scenarioId > 3) && "-"}
                      </td>
                      <td className="py-2.5 px-3 text-emerald-400">
                        {scenarioId === 1 && "+4.8% / +2.6%"}
                        {scenarioId === 2 && "+5.7% / +5.2%"}
                        {scenarioId === 3 && "+15.2% / +14.3%"}
                        {(!scenarioId || scenarioId > 3) && "-"}
                      </td>
                      <td className="py-2.5 px-3 text-zinc-400 font-sans">
                        Poisson / Non-parametric
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* 2. Preview of Raw Event-Level Data (First 20 Rows Only) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-400 flex items-center gap-1.5">
                <List size={12} className="text-zinc-500" />
                Попередній перегляд сирих подій (Перші 20 рядків)
              </span>
              <span className="text-[9px] text-zinc-500 font-mono">user_event_stream_v3.csv</span>
            </div>

            <div className="border border-zinc-800 rounded-xl overflow-hidden bg-black/60 max-h-56 overflow-y-auto">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-[10px]">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-950 font-mono text-zinc-500 uppercase select-none tracking-widest text-[9px] sticky top-0">
                      <th className="py-1.5 px-2">user_id</th>
                      <th className="py-1.5 px-2">group</th>
                      <th className="py-1.5 px-2">converted</th>
                      <th className="py-1.5 px-2">revenue</th>
                      <th className="py-1.5 px-2">session_duration_sec</th>
                      <th className="py-1.5 px-2">pages_viewed</th>
                      <th className="py-1.5 px-2">clicks</th>
                      <th className="py-1.5 px-2">device_type</th>
                      <th className="py-1.5 px-2">traffic_source</th>
                      <th className="py-1.5 px-2">date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900/45 font-mono text-zinc-400">
                    {generateDeterministicRawData().map((row, idx) => (
                      <tr key={idx} className="hover:bg-zinc-900/40 transition-colors">
                        <td className="py-1.5 px-2 text-zinc-250 font-semibold">{row.user_id}</td>
                        <td className="py-1.5 px-2">
                          <span className={`px-1 py-0.25 rounded text-[9px] ${
                            row.group === 'A' ? 'bg-zinc-800 text-zinc-300' : 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/30'
                          }`}>
                            {row.group}
                          </span>
                        </td>
                        <td className="py-1.5 px-2">
                          <span className={`${row.converted === 1 ? 'text-emerald-400 font-bold' : 'text-zinc-600'}`}>
                            {row.converted}
                          </span>
                        </td>
                        <td className="py-1.5 px-2">${row.revenue.toFixed(2)}</td>
                        <td className="py-1.5 px-2">{row.session_duration_sec}s</td>
                        <td className="py-1.5 px-2">{row.pages_viewed}</td>
                        <td className="py-1.5 px-2">{row.clicks}</td>
                        <td className="py-1.5 px-2 text-zinc-500">{row.device_type}</td>
                        <td className="py-1.5 px-2 text-zinc-500">{row.traffic_source}</td>
                        <td className="py-1.5 px-2 text-[9px] text-zinc-650">{row.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-[9px] text-zinc-500 text-center font-mono leading-relaxed bg-[#0c0d10] py-1.5 rounded-lg border border-zinc-850/60 select-none">
              ... [Відображено 20 рядків. Повний датасет доступний для генерації та завантаження] ...
            </p>
          </div>

          {/* Post-Simulation Output & CSV / Colab Controls */}
          <div className="bg-slate-950 p-4 rounded-xl border border-dashed border-zinc-805 space-y-3.5">
            <div className="flex items-center gap-2 text-emerald-400 font-bold font-sans text-xs select-none">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
              Генерацію завершено успішно!
            </div>
            <ul className="text-xs space-y-1.5 font-sans text-zinc-350 list-disc list-inside select-none">
              <li><strong>Згенеровано рядків:</strong> {formatNum((controlGroupSize || 5000) + (testGroupSize || 5000))} (у межах ліміту {scenarioId === 2 ? "130k" : "100k"})</li>
              <li><strong>Кількість колонок:</strong> 10</li>
              <li><strong>Доступні сегменти:</strong> <code className="bg-zinc-900 border border-zinc-800 px-1 py-0.25 rounded text-[10px] text-zinc-350">device_type</code> (Mobile/Desktop), <code className="bg-zinc-900 border border-zinc-800 px-1 py-0.25 rounded text-[10px] text-zinc-350">traffic_source</code> (Paid/Organic)</li>
            </ul>

            {csvError && (
              <div className="p-3 bg-red-950/40 border border-red-900/50 rounded-lg text-red-400 text-xs font-sans animate-bounce select-none">
                {csvError}
              </div>
            )}

            <div className="flex flex-wrap gap-2.5 pt-1.5">
              <button 
                onClick={downloadCSV}
                className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-3 py-2 rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-md select-none active:scale-95"
              >
                📥 Завантажити повний CSV
              </button>
              <button 
                onClick={() => setShowColab(!showColab)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer shadow-md select-none active:scale-95 ${
                  showColab 
                    ? 'bg-zinc-800 border border-zinc-700 text-white' 
                    : 'bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-350'
                }`}
              >
                📋 {showColab ? "Сховати" : "Показати"} код для Google Colab
              </button>
            </div>
          </div>

          {/* Conditional Google Colab Code Rendering */}
          {showColab && (
            <div className="space-y-2 border-t border-zinc-800/80 pt-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-300 flex items-center gap-1.5 select-none">
                  <Terminal size={12} className="text-emerald-400" />
                  Python-код для завантаження в Google Colab
                </span>
                <button
                  onClick={() => copyToClipboard(getPythonScriptForColab())}
                  className="text-[10px] font-sans font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 px-2.5 py-1 rounded-md transition-all flex items-center gap-1 cursor-pointer select-none"
                >
                  <Copy size={11} />
                  <span>{isCopied ? "Скопійовано!" : "Копіювати код"}</span>
                </button>
              </div>

              <div className="bg-[#0A0A0B] p-3 rounded-lg border border-zinc-850 text-[10px] leading-relaxed font-mono overflow-x-auto text-amber-300 select-all max-h-52">
                <pre className="whitespace-pre text-left leading-normal">{getPythonScriptForColab()}</pre>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 1. Historical Metrics */}
      <div className="bg-[#121214] rounded-xl border border-zinc-800 overflow-hidden">
        <div className="bg-zinc-900/40 border-b border-zinc-800/80 px-5 py-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white tracking-tight flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 pulse-slow"></span>
            {scenarioName ? `Історичні метрики: ${scenarioName}` : "Історичні метрики (Попередні 30 днів)"}
          </h2>
          {historicalData && (
            <span className="text-xs font-semibold bg-emerald-500/10 text-emerald-400 px-2.5 py-0.5 rounded-md font-mono border border-emerald-500/20 max-w-[180px] truncate">
              {scenarioName || "Дані зафіксовано"}
            </span>
          )}
        </div>

        {/* Business Scenario Description Block */}
        <div className="bg-zinc-950/40 px-5 py-3.5 border-b border-zinc-800/60 flex flex-col gap-1">
          <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Контекст бізнес-кейсу</span>
          <p className="text-xs text-zinc-300 font-sans leading-relaxed">
            {(!scenarioId || scenarioId === 1) && "Команда помітила високий відтік під час реєстрації. Було запропоновано спростити форму та зменшити кількість полів для заповнення."}
            {scenarioId === 2 && "Команда припускає, що поточна ціна підписки є нижчою за оптимальну. Планується перевірити вплив підвищення ціни на конверсію та виручку."}
            {scenarioId === 3 && "Аналітика показала значний відтік користувачів на етапі оформлення замовлення. Команда вирішила протестувати спрощений процес checkout."}
          </p>
        </div>

        {historicalData ? (
          <div className="p-5 flex flex-col gap-5">
            {/* Summary Statistics */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-zinc-950 p-3.5 rounded-xl border border-zinc-800/80 flex flex-col">
                <div className="flex items-center gap-1.5 text-zinc-500 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider block truncate">Охоплення</span>
                </div>
                <span className="text-base md:text-lg font-mono font-bold text-white">
                  {formatNum(totalVisitors || 0)}
                </span>
                <span className="text-[9px] text-zinc-500 mt-0.5 truncate block">унікальних користувачів</span>
              </div>

              <div className="bg-zinc-950 p-3.5 rounded-xl border border-zinc-800/80 flex flex-col">
                <div className="flex items-center gap-1.5 text-zinc-500 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider block truncate text-emerald-400">
                    {conversionEventName || "Реєстрації"}
                  </span>
                </div>
                <span className="text-base md:text-lg font-mono font-bold text-emerald-400">
                  {formatNum(totalRegistrations || 0)}
                </span>
                <span className="text-[9px] text-zinc-500 mt-0.5 truncate block">успішних дій</span>
              </div>

              <div className="bg-zinc-950 p-3.5 rounded-xl border border-zinc-800/80 flex flex-col">
                <div className="flex items-center gap-1.5 text-zinc-500 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider block truncate text-blue-400">
                    {primaryMetricName || "CR"}
                  </span>
                </div>
                <span className="text-base md:text-lg font-mono font-bold text-blue-400">
                  {totalVisitors ? ((totalRegistrations! / totalVisitors) * 100).toFixed(2) : '0'}%
                </span>
                <span className="text-[9px] text-zinc-500 mt-0.5 truncate block">емпіричний baseline</span>
              </div>
            </div>

            {/* Custom SVG Trend Visualization */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-zinc-500 uppercase font-mono tracking-wider">Огляд щоденного трафіку & успішних подій</span>
                <span className="text-[10px] text-zinc-500 font-mono">Вісь X: 30 днів</span>
              </div>
              
              <div className="bg-black p-4 rounded-xl border border-zinc-800/80 h-44 flex items-end justify-between gap-1 relative overflow-hidden">
                {/* Visual grid lines */}
                <div className="absolute inset-0 flex flex-col justify-between py-6 px-4 pointer-events-none opacity-5">
                  <div className="w-full border-t border-dashed border-white"></div>
                  <div className="w-full border-t border-dashed border-white"></div>
                  <div className="w-full border-t border-dashed border-white"></div>
                </div>

                {historicalData.map((d, idx) => {
                  const maxTraffic = 650; // Max bound
                  const trafficPercent = (d.traffic / maxTraffic) * 100;

                  return (
                    <div key={d.day} className="flex-1 flex flex-col justify-end items-center h-full group relative">
                      {/* Tooltip */}
                      <div className="absolute bottom-[105%] bg-zinc-900 border border-zinc-800 text-[10px] font-mono p-2 rounded-md shadow-xl opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100 transition-all z-10 pointer-events-none text-white whitespace-nowrap">
                        <p className="font-semibold text-emerald-400">День {d.day}</p>
                        <p>Трафік: {d.traffic}</p>
                        <p>Успішні події: {d.registrations}</p>
                        <p>Конверсія: {((d.registrations / d.traffic) * 100).toFixed(1)}%</p>
                      </div>

                      {/* Stacked bar representation */}
                      <div className="w-full flex flex-col justify-end items-center gap-0.5 rounded-t-xs overflow-hidden" style={{ height: `${trafficPercent}%` }}>
                        {/* Registrations bar (colored, bottom) */}
                        <div className="w-full bg-emerald-500 h-3/5 group-hover:bg-emerald-400 transition-colors" />
                        {/* Leftover traffic bar (slate, top) */}
                        <div className="w-full bg-zinc-800 h-2/5 group-hover:bg-[#1f1f23] transition-colors" />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-4 mt-2 justify-center text-[10px] text-zinc-500 border-t border-zinc-800/60 pt-2 font-mono uppercase tracking-wider">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-emerald-500 rounded-sm"></span>Успішні дії</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-zinc-800 rounded-sm"></span>Трафік</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-zinc-500 flex flex-col items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-full bg-zinc-900/60 border border-zinc-800 flex items-center justify-center text-zinc-400">
              <HelpCircle size={20} />
            </div>
            <p className="text-xs max-w-[280px] leading-relaxed">
              Будь ласка, натисніть <b className="text-zinc-350">"Згенерувати базові дані"</b> у терміналі, щоб отримати історичні метрики StepUp.
            </p>
          </div>
        )}
      </div>

      {/* 2. Formulation Library / Handbook */}
      <div className="bg-[#121214] rounded-xl border border-zinc-800 p-5 flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-white tracking-tight flex items-center gap-2">
          <BookOpen size={15} className="text-emerald-400" />
          Довідник формул продуктового аналітика
        </h2>

        <div className="space-y-2 text-xs">
          {/* Item 1 */}
          <div className="border border-zinc-800 rounded-xl overflow-hidden">
            <button 
              onClick={() => setShowFormula1(!showFormula1)}
              className="w-full py-2.5 px-4 bg-zinc-900/40 hover:bg-zinc-900/70 text-left font-medium text-zinc-300 flex items-center justify-between transition-colors focus:outline-none cursor-pointer"
            >
              <span>1. Розрахунок базової конверсії (Baseline CR)</span>
              {showFormula1 ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {showFormula1 && (
              <div className="p-4 border-t border-zinc-800 bg-zinc-950 leading-relaxed text-zinc-400 space-y-2 font-mono text-[11px]">
                <p>Базова конверсія розраховується як відношення успішних реєстрацій до загальної кількості відвідувачів реєстраційного екрана за відповідний історичний період:</p>
                <div className="bg-[#0A0A0B] p-3 rounded-lg font-mono text-emerald-400 text-center my-2 border border-zinc-800 select-all leading-normal">
                  p_base = (Успішні реєстрації) / (Охоплено користувачів)
                </div>
                <p className="text-[10px] text-zinc-500">Приклад: 12 500 реєстрацій на 30 000 користувачів дає 12 500 / 30 000 = 0.4167 або 41.67%.</p>
              </div>
            )}
          </div>

          {/* Item 2 */}
          <div className="border border-zinc-800 rounded-xl overflow-hidden">
            <button 
              onClick={() => setShowFormula2(!showFormula2)}
              className="w-full py-2.5 px-4 bg-zinc-900/40 hover:bg-zinc-900/70 text-left font-medium text-zinc-300 flex items-center justify-between transition-colors focus:outline-none cursor-pointer"
            >
              <span>2. Розрахунок розміру вибірки (Sample Size, N)</span>
              {showFormula2 ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {showFormula2 && (
              <div className="p-4 border-t border-zinc-800 bg-zinc-950 leading-relaxed text-zinc-400 space-y-2 font-mono text-[11px]">
                <p>Необхідний розмір вибірки на ОДНУ групу залежить від базової конверсії (p_1), мінімального виявленого ефекту MDE (delta, відносна різниця у конверсії) та критичних значень розподілу:</p>
                <div className="bg-[#0A0A0B] p-3 rounded-lg font-mono text-emerald-400 text-center my-2 border border-zinc-800 select-all leading-relaxed whitespace-pre overflow-x-auto">
                  N = 2 * p_avg * (1 - p_avg) * (Z_alpha + Z_beta)^2 / d^2
                </div>
                <p>Де:</p>
                <ul className="list-disc list-inside space-y-1 text-[10px] pl-2 text-zinc-500">
                  <li><b className="text-zinc-400">p_avg</b>: середня конверсія між контролем та тестом</li>
                  <li><b className="text-zinc-400">d</b>: абсолютний очікуваний ефект = p_base * MDE</li>
                  <li>У стандартних тестах (Power = 80%, Significance = 95%):
                    <br />
                    <b>Z_alpha (alpha=0.05, двосторонній) = 1.96</b>
                    <br />
                    <b>Z_beta (beta=0.20, односторонній) = 0.84</b>
                    <br />
                    Сума <b>(Z_alpha + Z_beta) = 2.80</b>, а в квадраті це <b>7.84</b>.
                  </li>
                </ul>
                <div className="bg-emerald-500/5 text-emerald-400 p-2.5 rounded-lg text-[10px] mt-2 border border-emerald-500/10 font-sans">
                  ⚡ <b>Порада:</b> Скористайтеся зовнішнім онлайн-калькулятором (наприклад Evan Miller або подібним), ввівши туди свою розраховану історичну конверсію та бажаний відносний ефект (наприклад, 4% - 6% MDE), щоб знайти оптимальне значення N на групу.
                </div>
              </div>
            )}
          </div>

          {/* Item 3 */}
          <div className="border border-zinc-800 rounded-xl overflow-hidden">
            <button 
              onClick={() => setShowFormula3(!showFormula3)}
              className="w-full py-2.5 px-4 bg-zinc-900/40 hover:bg-zinc-900/70 text-left font-medium text-zinc-300 flex items-center justify-between transition-colors focus:outline-none cursor-pointer"
            >
              <span>3. Z-Test та Статистична значущість (P-Value)</span>
              {showFormula3 ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {showFormula3 && (
              <div className="p-4 border-t border-zinc-800 bg-zinc-950 leading-relaxed text-zinc-400 space-y-2 font-mono text-[11px]">
                <p>Щоб порівняти пропорції конверсій між двома незалежними вибірками:</p>
                <div className="bg-[#0A0A0B] p-3 rounded-lg font-mono text-emerald-400 text-center my-2 border border-zinc-800 select-all leading-normal">
                  Z = (p_B - p_A) / SE
                  <br />
                  SE = sqrt( p_combined * (1 - p_combined) * (1/N_A + 1/N_B) )
                </div>
                <p>Критичні значення Z для двостороннього тесту:</p>
                <div className="grid grid-cols-3 gap-2 text-[10px] font-mono text-center my-2">
                  <div className="bg-zinc-900/40 p-2 rounded border border-zinc-800">
                    <p className="text-zinc-500">alpha=10%</p>
                    <p className="font-bold text-zinc-400">|Z| &gt; 1.645</p>
                  </div>
                  <div className="bg-emerald-500/10 p-2 rounded border border-emerald-500/20 text-emerald-400">
                    <p className="text-zinc-400">alpha=5%</p>
                    <p className="font-bold text-emerald-400">|Z| &gt; 1.96</p>
                  </div>
                  <div className="bg-zinc-900/40 p-2 rounded border border-zinc-800">
                    <p className="text-zinc-500">alpha=1%</p>
                    <p className="font-bold text-zinc-400">|Z| &gt; 2.576</p>
                  </div>
                </div>
                <p className="text-[10px] leading-relaxed font-sans text-zinc-500">Якщо розрахований Z-score більший за 1.96 (для 95% довіри), результат є статистично значущим! Значить, ми відхиляємо H0 та впроваджуємо оновлені екрани StepUp.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. Analyst Notepad Workspace */}
      <div className="bg-[#121214] rounded-xl border border-zinc-800 p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white tracking-tight flex items-center gap-2">
            <FileText size={15} className="text-zinc-400" />
            Блокнот аналітика
          </h2>
          <span className="text-[10px] font-mono flex items-center gap-1 text-zinc-500">
            {isSaved ? (
              <span className="flex items-center gap-1 text-emerald-400 font-medium">
                <Check size={10} className="stroke-[3]" /> Автозбереження
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <Save size={10} /> Зміни записано
              </span>
            )}
          </span>
        </div>
        
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={11}
          className="w-full text-zinc-300 bg-zinc-950 focus:bg-black text-[11px] font-mono p-4 rounded-xl border border-zinc-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors focus:outline-none resize-y leading-relaxed"
          placeholder="Введіть ваші розрахунки, замітки чи фінальний аналіз тесту тут..."
        />
        <div className="text-[10px] text-zinc-500 leading-relaxed bg-zinc-900/20 p-2.5 rounded-lg border border-dashed border-zinc-800">
          💡 <b>Корисна порада:</b> Тобі записувати розрахунки у чаті з ментором заборонено. Використовуй цей блокнот, щоб розрахувати базову конверсію, визначити p-value за результатами симуляції Кроку 2 та переконатись у правильності рішення самостійно!
        </div>
      </div>

    </div>
  );
}
