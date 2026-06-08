export interface DailyData {
  day: number;
  traffic: number;
  registrations: number;
}

export interface ChatMessage {
  id: string;
  sender: 'system' | 'mentor' | 'user';
  text: string;
  codeBlock?: string;
  timestamp: string;
}

export interface SimulationState {
  scenarioId: number | null;
  scenarioName: string | null;
  primaryMetricName: string | null;
  conversionEventName: string | null;
  
  baselineRate: number | null;
  dailyTrafficAvg: number | null;
  totalHistoricalVisitors: number | null;
  totalHistoricalRegistrations: number | null;
  historicalDailyData: DailyData[] | null;
  
  sampleSize: number | null;
  duration: number | null;
  
  controlGroupSize: number | null;
  controlGroupSuccesses: number | null;
  
  testGroupSize: number | null;
  testGroupSuccesses: number | null;
  simulatedUplift: number | null;
  simulatedTestRate: number | null;
  
  // Custom configured test parameters from Phase 2
  desiredMde: string | null;
  alpha: string | null;
  power: string | null;
  trafficSplit: string | null;
  
  hypothesisAccepted?: boolean;
  planningParamsSaved?: boolean;
  datasetGenerated?: boolean;
  
  step: 1 | 2 | 3 | 4; // 1: Welcome/Scenario select, 2: Test Design & Parameter config, 3: Awaiting sizing/Simulation Run, 4: Results & feedback
}
