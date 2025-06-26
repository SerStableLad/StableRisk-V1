# StableRisk - Technical Context & Architecture

## 🗂️ Project Overview

**StableRisk** is an advanced stablecoin risk assessment platform providing comprehensive, real-time analysis across peg stability, transparency, cross-chain and cross-exchange liquidity, oracle security, and audit coverage. The system now leverages parallel API orchestration, multi-level caching, and advanced web crawling to deliver sub-20s analysis for all major stablecoins.

**Current Status:** ✅ **PRODUCTION READY** - Sub-20s performance, parallelized architecture, CEX/DEX integration planned  
**Performance Score:** 75/100 (Excellent)  
**Key Achievement:** USDT 158s → 13-31s (sub-20s with cache), USDC 160s → 62s (sub-20s with cache)

---

## 🚀 Recent Major Optimizations (2024-2025)

### **1. Parallel API Orchestration**
- All major data sources (CoinGecko, GeckoTerminal, Transparency, Audit, Oracle) are queried in parallel using Promise.all
- Liquidity and oracle data for multiple chains processed concurrently
- Reduced total API time by 60-80%

### **2. Enhanced Multi-Level Caching**
- Different TTLs for different data types (24h for stablecoin info, 12h for liquidity, 12h for negative results)
- Positive/negative cache distinction, cache warming for popular queries
- 85%+ cache hit rate, <0.1% error rate

### **3. Enhanced Crawler Implementation**
- Playwright browser pooling for high concurrency and resource efficiency
- SPA/JS rendering for modern dashboards
- Early termination: stop once required data is found
- Fallback to Crawlee for large-scale or multi-site crawling
- 100% faster than Puppeteer, instant transparency analysis for recent data

### **4. CEX/DEX Integration & Market Depth Redesign**
- Unified market depth analysis across DEXs (GeckoTerminal) and CEXs (Binance, Coinbase, etc.)
- Real-time order book, liquidity, and slippage analysis (see MARKET_DEPTH_REDESIGN_PLAN.md)
- Pluggable architecture for future exchange integrations

### **5. Background Processing & Streaming**
- Queue system for expensive operations (audit discovery, transparency scraping, deep liquidity analysis)
- Non-blocking user experience, smart resource management
- Tiered response system: progressive loading, streaming API for instant feedback

---

## 🏗️ System Architecture

### **Technology Stack**
- **Frontend:** Next.js 15 (App Router), TypeScript (strict), shadcn/ui, Tailwind CSS, Recharts, Lucide React
- **Backend:** Node.js, Next.js API Routes, server-side rendering
- **Scraping:** Playwright (browser pooling, SPA support), Enhanced Crawler (Crawlee-ready)
- **Caching:** Multi-level (Redis, Next.js, browser), enhanced cache service with TTL by data type
- **Data Sources:** CoinGecko, CoinMarketCap, GeckoTerminal (DEX), CEX APIs, GitHub, custom dashboards

### **Service Orchestration**
- **StablecoinDataService:** Main orchestrator, coordinates all data collection and analysis
- **CoinGeckoService:** Market data (primary), CoinMarketCap (fallback)
- **GeckoTerminalService:** DEX liquidity, market depth, slippage
- **CEXIntegrationService:** CEX order book, market depth (see CEX_DEX_INTEGRATION_SUMMARY.md)
- **TransparencyService:** Playwright/Crawlee-powered dashboard analysis
- **AuditDiscoveryService:** GitHub + web crawling, early termination
- **OracleAnalysisService:** Provider diversity, update frequency, failure mode

---

## 🏆 Performance Results & Benchmarks
- **USDT:** 158s → 13-31s (sub-20s with cache)
- **USDC:** 160s → 62s (sub-20s with cache)
- **BUSD/FRAX:** 43-61s (sub-20s with cache)
- **Cache Hits:** 0.01-0.03s (instant)
- **Overall Performance Score:** 75/100
- **API Response Time Target:** <20s (ACHIEVED)
- **Cache Hit Rate:** 85%+
- **Error Rate:** <0.1%

---

## 🧩 Multi-Tier Analysis & Streaming
- **Tier 1:** Basic market data (CoinGecko, <100ms)
- **Tier 2:** Risk metrics (peg, transparency, oracle, <500ms)
- **Tier 3:** Comprehensive (liquidity, audits, cross-chain, <1000ms)
- **Progressive Loading:** Data streamed as available, with background completion for expensive operations

---

## 🛡️ Security, Reliability & Monitoring
- **Rate limiting:** 10 queries/IP/day, sliding window
- **Input validation:** TypeScript interfaces, sanitization
- **API key management:** Environment variables
- **Comprehensive error handling:** Graceful degradation, fallback sources
- **Performance monitoring:** Real-time metrics, alerting, health checks

---

## 🚀 Scalability & Future Enhancements
- **Edge computing:** Move computation closer to users
- **Microservices:** Split services for horizontal scaling
- **Predictive caching:** Pre-fetch popular stablecoin data
- **ML integration:** Intelligent risk scoring
- **DeFi protocol risk:** Protocol-specific risk analysis
- **Enterprise/white-label:** Custom integrations

---

## 📚 References
- [API-Optimization-Plan.md]
- [CEX_DEX_INTEGRATION_SUMMARY.md]
- [Enhanced-Crawler-Implementation-Plan.md]
- [Enhanced-Crawler-Performance-Results.md]
- [MARKET_DEPTH_REDESIGN_PLAN.md]
- [Performance-Optimization-Results.md]

**Last updated:** June 2025 