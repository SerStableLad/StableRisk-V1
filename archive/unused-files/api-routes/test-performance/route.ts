import { NextResponse } from 'next/server'
import { cacheService } from '@/lib/services/cache-service'
import { TransparencyService } from '@/lib/services/transparency'
import { AuditDiscoveryService } from '@/lib/services/audit-discovery'

const transparencyService = new TransparencyService()
const auditDiscoveryService = new AuditDiscoveryService()

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const ticker = searchParams.get('ticker') || 'USDT'
  
  const results = {
    ticker,
    timestamp: new Date().toISOString(),
    tests: {} as Record<string, any>
  }

  // Test 1: Cache service
  const cacheStart = Date.now()
  try {
    await cacheService.set('test-key', { test: 'data' }, 1000)
    const cached = await cacheService.get('test-key')
    results.tests.cache = {
      duration: Date.now() - cacheStart,
      success: !!cached,
      status: 'working'
    }
  } catch (error) {
    results.tests.cache = {
      duration: Date.now() - cacheStart,
      success: false,
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }

  // Test 2: Basic transparency service
  const transparencyStart = Date.now()
  try {
    const transparencyData = await Promise.race([
      transparencyService.getBasicTransparencyData(ticker),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
    ])
    results.tests.transparency = {
      duration: Date.now() - transparencyStart,
      success: true,
      status: 'working',
      data: transparencyData
    }
  } catch (error) {
    results.tests.transparency = {
      duration: Date.now() - transparencyStart,
      success: false,
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }

  // Test 3: Audit discovery (with timeout)
  const auditStart = Date.now()
  try {
    const audits = await Promise.race([
      auditDiscoveryService.discoverAudits(ticker),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
    ])
    results.tests.audits = {
      duration: Date.now() - auditStart,
      success: true,
      status: 'working',
      count: Array.isArray(audits) ? audits.length : 0
    }
  } catch (error) {
    results.tests.audits = {
      duration: Date.now() - auditStart,
      success: false,
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }

  // Test 4: Simple API call to CoinGecko
  const apiStart = Date.now()
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/ping', {
      signal: AbortSignal.timeout(3000)
    })
    const data = await response.json()
    results.tests.coingecko = {
      duration: Date.now() - apiStart,
      success: response.ok,
      status: 'working',
      data
    }
  } catch (error) {
    results.tests.coingecko = {
      duration: Date.now() - apiStart,
      success: false,
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }

  return NextResponse.json(results)
} 