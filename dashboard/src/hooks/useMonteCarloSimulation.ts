/**
 * React hook for running Monte Carlo simulation in a Web Worker.
 *
 * Creates the worker on mount, terminates on unmount.
 * Exposes: { result, isRunning, progress, run }
 *
 * Usage:
 *   const { result, isRunning, progress, run } = useMonteCarloSimulation()
 *   run({ price: 30, mu: 0.0003, sigma: 0.015, days: 252, paths: 10000 })
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export interface MCParams {
  price: number
  mu: number
  sigma: number
  days: number
  paths?: number // default 10000
}

export interface MCResult {
  percentiles: {
    p5: number[]
    p25: number[]
    p50: number[]
    p75: number[]
    p95: number[]
  }
  mc_var_95: number
  mc_var_99: number
  mc_cvar_95: number
  elapsed_ms: number
}

export function useMonteCarloSimulation() {
  const workerRef = useRef<Worker | null>(null)
  const [result, setResult] = useState<MCResult | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState(0)

  // Create worker on mount
  useEffect(() => {
    const worker = new Worker(
      new URL('../workers/montecarlo.worker.ts', import.meta.url),
      { type: 'module' },
    )

    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data
      if (msg.type === 'progress') {
        setProgress(msg.percent)
      } else if (msg.type === 'result') {
        setResult(msg.data as MCResult)
        setIsRunning(false)
        setProgress(100)
      }
    }

    worker.onerror = (err) => {
      console.error('[MC Worker] Error:', err)
      setIsRunning(false)
    }

    workerRef.current = worker

    // Terminate on unmount
    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  const run = useCallback((params: MCParams) => {
    if (!workerRef.current) return
    setIsRunning(true)
    setProgress(0)
    setResult(null)
    workerRef.current.postMessage({
      type: 'run',
      params: {
        price: params.price,
        mu: params.mu,
        sigma: params.sigma,
        days: params.days,
        paths: params.paths ?? 10_000,
      },
    })
  }, [])

  return { result, isRunning, progress, run }
}
