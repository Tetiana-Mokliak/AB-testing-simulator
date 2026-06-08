import { DailyData } from './types';

/**
 * Generates a binomial random variable using standard algorithms.
 * For N > 100, we use Normal approximation for lightning-fast, high-precision performance.
 * Mean = N * p, Variance = N * p * (1 - p)
 */
export function simulateBinomial(n: number, p: number): number {
  if (n <= 0) return 0;
  if (p <= 0) return 0;
  if (p >= 1) return n;

  if (n > 100) {
    const mean = n * p;
    const stdDev = Math.sqrt(n * p * (1 - p));
    
    // Box-Muller transform for normal distribution
    let u1 = 0;
    let u2 = 0;
    while (u1 === 0) u1 = Math.random();
    while (u2 === 0) u2 = Math.random();
    
    const randStdNormal = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    const simulatedVal = Math.round(mean + stdDev * randStdNormal);
    
    // Constrain within absolute bounds
    return Math.max(0, Math.min(n, simulatedVal));
  } else {
    // Exact Bernoulli trials for small N
    let successes = 0;
    for (let i = 0; i < n; i++) {
      if (Math.random() < p) {
        successes++;
      }
    }
    return successes;
  }
}

/**
 * Generates historical daily traffic and successful registrations over preceding 30 days
 */
export function generate30DaysHistory(baselineRate: number, dailyAvgTraffic: number): DailyData[] {
  const data: DailyData[] = [];
  
  for (let day = 1; day <= 30; day++) {
    // Generate daily traffic with a 10% standard deviation around the average
    const trafficDev = (Math.random() - 0.5) * 0.2; // -10% to +10%
    const traffic = Math.max(250, Math.round(dailyAvgTraffic * (1 + trafficDev)));
    
    // Simulate registrations
    const registrations = simulateBinomial(traffic, baselineRate);
    
    data.push({
      day,
      traffic,
      registrations
    });
  }
  
  return data;
}

/**
 * Standard formatting of numbers with space separators (e.g., 15 000 instead of 15000)
 */
export function formatNum(num: number): string {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/**
 * Approximate Z-score calculation for internal testing/verifying if we want (not shown to user)
 */
export function calculateZScore(n_A: number, conversions_A: number, n_B: number, conversions_B: number): number {
  const p_A = conversions_A / n_A;
  const p_B = conversions_B / n_B;
  
  const p_combined = (conversions_A + conversions_B) / (n_A + n_B);
  const standardError = Math.sqrt(p_combined * (1 - p_combined) * (1 / n_A + 1 / n_B));
  
  if (standardError === 0) return 0;
  return (p_B - p_A) / standardError;
}

/**
 * Approximate p-value from Z-score
 */
export function calculatePValue(zScore: number): number {
  const absZ = Math.abs(zScore);
  // Rational approximation of the error function
  const t = 1.0 / (1.0 + 0.3275911 * absZ);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  
  const erf = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absZ * absZ);
  return 1 - erf; // One-tailed p-value. Two-tailed is 2 * (1 - Φ(|z|))
}
