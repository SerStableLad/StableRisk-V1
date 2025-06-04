import axios from 'axios'
import type { StablecoinAnalysis } from './types'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

export class StablecoinAPI {
  static async searchCoinId(ticker: string): Promise<string> {
    const response = await api.get(`/v1/coins/search/${ticker}`)
    return response.data.suggested_coin_id || response.data.coin_id
  }

  static async getCoinMetadata(coinId: string) {
    const response = await api.get(`/v1/coins/metadata/${coinId}`)
    return response.data
  }

  static async getRiskAssessment(coinId: string) {
    const response = await api.get(`/v1/risk/assessment/${coinId}`)
    return response.data
  }

  static async getComprehensiveAnalysis(ticker: string): Promise<StablecoinAnalysis> {
    const coinId = await this.searchCoinId(ticker)
    
    const [metadata, riskAssessment] = await Promise.allSettled([
      this.getCoinMetadata(coinId),
      this.getRiskAssessment(coinId)
    ])

    const getResult = (result: PromiseSettledResult<any>) => 
      result.status === 'fulfilled' ? result.value : null

    const metadataResult = getResult(metadata)
    const riskResult = getResult(riskAssessment)

    // Transform the backend risk assessment format to frontend expected format
    let transformedRiskAssessment
    if (riskResult) {
      transformedRiskAssessment = {
        overall_score: riskResult.overall_score || 0,
        risk_level: riskResult.risk_level || 'Unknown',
        confidence: riskResult.confidence_score || 0,
        factors: {
          price_stability: riskResult.price_stability?.score || 0,
          liquidity: riskResult.liquidity_risk?.score || 0,
          oracle: riskResult.oracle_risk?.score || 0,
          audit: riskResult.audit_risk?.score || 0,
          centralization: riskResult.reserve_transparency?.score || 0
        },
        // Include detailed factor information
        factor_details: {
          price_stability: {
            score: riskResult.price_stability?.score || 0,
            description: riskResult.price_stability?.description || 'No data available',
            data_available: riskResult.price_stability?.data_available || false,
            confidence: riskResult.price_stability?.confidence || 0,
            source: riskResult.price_stability?.source || 'Unknown',
            provider: riskResult.price_stability?.provider || 'Unknown'
          },
          liquidity: {
            score: riskResult.liquidity_risk?.score || 0,
            description: riskResult.liquidity_risk?.description || 'No data available',
            data_available: riskResult.liquidity_risk?.data_available || false,
            confidence: riskResult.liquidity_risk?.confidence || 0,
            source: riskResult.liquidity_risk?.source || 'Unknown',
            provider: riskResult.liquidity_risk?.provider || 'Unknown'
          },
          oracle: {
            score: riskResult.oracle_risk?.score || 0,
            description: riskResult.oracle_risk?.description || 'No data available',
            data_available: riskResult.oracle_risk?.data_available || false,
            confidence: riskResult.oracle_risk?.confidence || 0,
            source: riskResult.oracle_risk?.source || 'Unknown',
            provider: riskResult.oracle_risk?.provider || 'Unknown'
          },
          audit: {
            score: riskResult.audit_risk?.score || 0,
            description: riskResult.audit_risk?.description || 'No data available',
            data_available: riskResult.audit_risk?.data_available || false,
            confidence: riskResult.audit_risk?.confidence || 0,
            source: riskResult.audit_risk?.source || 'Unknown',
            provider: riskResult.audit_risk?.provider || 'Unknown'
          },
          centralization: {
            score: riskResult.reserve_transparency?.score || 0,
            description: riskResult.reserve_transparency?.description || 'No data available',
            data_available: riskResult.reserve_transparency?.data_available || false,
            confidence: riskResult.reserve_transparency?.confidence || 0,
            source: riskResult.reserve_transparency?.source || 'Unknown',
            provider: riskResult.reserve_transparency?.provider || 'Unknown'
          }
        },
        warnings: riskResult.warnings || [],
        recommendations: riskResult.recommendations || [],
        summary: riskResult.recommendations?.[0] || 'Analysis completed'
      }
    } else {
      transformedRiskAssessment = { 
        overall_score: 0, 
        risk_level: 'Unknown', 
        confidence: 0,
        factors: {
          price_stability: 0,
          liquidity: 0, 
          oracle: 0,
          audit: 0,
          centralization: 0
        },
        factor_details: {
          price_stability: {
            score: 0,
            description: 'No data available',
            data_available: false,
            confidence: 0,
            source: 'Unknown',
            provider: 'Unknown'
          },
          liquidity: {
            score: 0,
            description: 'No data available',
            data_available: false,
            confidence: 0,
            source: 'Unknown',
            provider: 'Unknown'
          },
          oracle: {
            score: 0,
            description: 'No data available',
            data_available: false,
            confidence: 0,
            source: 'Unknown',
            provider: 'Unknown'
          },
          audit: {
            score: 0,
            description: 'No data available',
            data_available: false,
            confidence: 0,
            source: 'Unknown',
            provider: 'Unknown'
          },
          centralization: {
            score: 0,
            description: 'No data available',
            data_available: false,
            confidence: 0,
            source: 'Unknown',
            provider: 'Unknown'
          }
        },
        warnings: [],
        recommendations: [],
        summary: 'Analysis unavailable'
      }
    }

    return {
      basic_info: metadataResult || { coin_id: coinId, name: ticker, symbol: ticker },
      risk_assessment: transformedRiskAssessment,
      price_stability: {
        max_deviation: 0,
        avg_deviation: 0,
        depeg_events: 0,
        recovery_time_avg: 0,
        stability_score: 0
      },
      liquidity: {
        total_liquidity: 0,
        chain_breakdown: {},
        concentration_risk: 0
      },
      audits: [],
      oracle: {
        oracle_type: 'Unknown',
        has_backup: false,
        centralization_risk: 0,
        reliability_score: 0
      },
      transparency: {
        last_update: '',
        update_frequency: '',
        dashboard_url: ''
      },
      last_updated: new Date().toISOString()
    }
  }
} 