/**
 * Monte Carlo simulation Web Worker using Geometric Brownian Motion (GBM).
 *
 * Runs entirely off the main thread so the UI stays responsive.
 *
 * GBM per step:
 *   S(t+1) = S(t) * exp((mu - sigma^2/2)*dt + sigma*sqrt(dt)*Z)
 * where Z ~ N(0,1), dt = 1/252
 *
 * Message protocol:
 *   Input:  { type: 'run', params: { price, mu, sigma, days, paths } }
 *   Output: { type: 'result', data: { percentiles, mc_var_95, mc_var_99, mc_cvar_95, elapsed_ms } }
 *           { type: 'progress', percent: number }
 */

// ---------------------------------------------------------------------------
// Box-Muller transform — generates standard normal random numbers (Z ~ N(0,1))
// without any external library.
// ---------------------------------------------------------------------------
function boxMullerRandom(): number {
  let u1: number
  let u2: number
  // Reject u1 = 0 to avoid log(0)
  do {
    u1 = Math.random()
  } while (u1 === 0)
  u2 = Math.random()
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2)
}

// ---------------------------------------------------------------------------
// Percentile helper — returns the value at the given percentile (0-100)
// using linear interpolation on a *sorted* array.
// ---------------------------------------------------------------------------
function percentile(sorted: Float64Array, p: number): number {
  const n = sorted.length
  if (n === 0) return 0
  const rank = (p / 100) * (n - 1)
  const lo = Math.floor(rank)
  const hi = Math.ceil(rank)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (rank - lo) * (sorted[hi] - sorted[lo])
}

// ---------------------------------------------------------------------------
// In-place sort helper for Float64Array (typed-array compatible quicksort
// is available via .sort() in modern engines).
// ---------------------------------------------------------------------------
function sortFloat64(arr: Float64Array): void {
  arr.sort()
}

// ---------------------------------------------------------------------------
// Main simulation
// ---------------------------------------------------------------------------
interface MCParams {
  price: number
  mu: number
  sigma: number
  days: number
  paths: number
}

function runSimulation(params: MCParams): void {
  const { price, mu, sigma, days, paths } = params
  const start = performance.now()

  const dt = 1 / 252
  const drift = (mu - 0.5 * sigma * sigma) * dt
  const diffusion = sigma * Math.sqrt(dt)

  // Allocate a 2D grid: paths x (days+1) stored row-major in a flat buffer.
  // Column 0 = starting price. Columns 1..days = simulated prices.
  const grid = new Float64Array(paths * (days + 1))

  // Fill column 0 with the starting price
  for (let p = 0; p < paths; p++) {
    grid[p * (days + 1)] = price
  }

  // Report progress every ~10 % of paths
  const progressStep = Math.max(1, Math.floor(paths / 10))

  // Simulate
  for (let p = 0; p < paths; p++) {
    const rowOffset = p * (days + 1)
    let s = price
    for (let d = 1; d <= days; d++) {
      const z = boxMullerRandom()
      s = s * Math.exp(drift + diffusion * z)
      grid[rowOffset + d] = s
    }
    // Progress message
    if ((p + 1) % progressStep === 0) {
      const pct = Math.round(((p + 1) / paths) * 100)
      self.postMessage({ type: 'progress', percent: pct })
    }
  }

  // -----------------------------------------------------------------------
  // Compute per-day percentiles (p5, p25, p50, p75, p95)
  // -----------------------------------------------------------------------
  const p5: number[] = new Array(days + 1)
  const p25: number[] = new Array(days + 1)
  const p50: number[] = new Array(days + 1)
  const p75: number[] = new Array(days + 1)
  const p95: number[] = new Array(days + 1)

  // Reusable column buffer
  const col = new Float64Array(paths)

  for (let d = 0; d <= days; d++) {
    // Extract column d from the grid
    for (let p = 0; p < paths; p++) {
      col[p] = grid[p * (days + 1) + d]
    }
    sortFloat64(col)

    p5[d] = percentile(col, 5)
    p25[d] = percentile(col, 25)
    p50[d] = percentile(col, 50)
    p75[d] = percentile(col, 75)
    p95[d] = percentile(col, 95)
  }

  // -----------------------------------------------------------------------
  // MC VaR from final-day returns distribution
  // -----------------------------------------------------------------------
  const finalReturns = new Float64Array(paths)
  for (let p = 0; p < paths; p++) {
    const finalPrice = grid[p * (days + 1) + days]
    finalReturns[p] = (finalPrice - price) / price // simple return
  }
  sortFloat64(finalReturns)

  const mc_var_95 = percentile(finalReturns, 5) // 5th percentile of returns = 95% VaR
  const mc_var_99 = percentile(finalReturns, 1) // 1st percentile = 99% VaR

  // CVaR 95: average of returns below VaR 95
  let cvarSum = 0
  let cvarCount = 0
  for (let i = 0; i < paths; i++) {
    if (finalReturns[i] <= mc_var_95) {
      cvarSum += finalReturns[i]
      cvarCount++
    }
  }
  const mc_cvar_95 = cvarCount > 0 ? cvarSum / cvarCount : mc_var_95

  const elapsed_ms = Math.round(performance.now() - start)

  self.postMessage({
    type: 'result',
    data: {
      percentiles: { p5, p25, p50, p75, p95 },
      mc_var_95: Math.round(mc_var_95 * 1e6) / 1e6,
      mc_var_99: Math.round(mc_var_99 * 1e6) / 1e6,
      mc_cvar_95: Math.round(mc_cvar_95 * 1e6) / 1e6,
      elapsed_ms,
    },
  })
}

// ---------------------------------------------------------------------------
// Worker message handler
// ---------------------------------------------------------------------------
self.onmessage = (e: MessageEvent) => {
  const msg = e.data
  if (msg.type === 'run') {
    runSimulation(msg.params as MCParams)
  }
}
