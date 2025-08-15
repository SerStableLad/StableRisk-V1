# StableRisk - Product Requirements Document (PRD)

## 📂 Executive Summary
**Product:** StableRisk - AI-Powered Stablecoin Risk Assessment Platform
**Version:** Beta 1.5 (AI-First, MCP Integration, Gemini Flash LLM)
**Last Updated:** July 2025

### 🌟 Mission Statement

Provide comprehensive, real-time risk assessment for USD-pegged stablecoins through AI-powered, progressive analysis of peg stability, transparency, and cross-chain and cross-exchange liquidity. The platform will leverage cutting-edge AI models and integrated data sources to deliver clear, actionable letter-grade risk scores.


---

## 🚀 Performance metrics

- **CoinGecko MCP:** Unified GraphQL interface, multiplexed token data access
- **AI Collateral Discovery:** Gemini Flash 2.5-powered LLM discovery of reserve assets
- **Gemini Flash LLM:** All AI features upgraded to Flash 2.5
- **Progressive Loading:** Sub-3s initial load (500-1500ms)
- **Mobile Optimization:** Fully responsive layout with touch optimization

---

## 🌟 Product Vision & Goals

### **Primary Goals**
1. Progressive Loading (sub-3s response)
2. Mobile-First Design
3. Clean UI with minimal clutter
4. Production Reliability (99.9% uptime)
5. Structured, multiplexed API via CoinGecko MCP
6. AI-based collateral breakdown using Gemini Flash
7. Determine if Stablecoin as Genius-Compliance 

---

## 🏗️ Technical Architecture

### **Core Technology Stack**

- **Frontend:** Next.js 15, TypeScript, Tailwind, shadcn/ui
- **Backend:** Node.js, Next.js API routes
- **API Gateway:** NGINX for routing, load balancing, and SSL termination.
- **AI Functions:** Gemini Flash 2.5 LLM with timeout management, confidence scoring, and cost control.
- **Data Sources:** CoinGecko MCP (GraphQL), Firecrawl MCP, CEX APIs, GitHub, Etherscan.
- **Scraping:** Playwright (SPA-ready)
- **Caching:** Redis, browser, Next.js
- **Queue System:** Background job orchestration for async features


### **AI-First Integration**
- All data sources are ingested and processed with an AI-first approach. The Gemini Flash LLM is integrated to actively discover, parse, and analyze unstructured data to generate risk insights.
- The system is architected around the Gemini Flash LLM's capabilities, with a dedicated AI microservice handling requests and generating structured outputs.



---

## 📊 Risk Assessment Framework

### **Scoring Methodology (Weighted)**
The letter-grade score is determined by the composite risk score:
- **A** (90-100): Exceptional Stability.
- **B** (75-89): Good Stability.
- **C** (50-74): Moderate Risk.
- **D** (25-49): High Risk.
- **E** (0-24): Critical Risk.

### **Data Quality Indicators**

- Confidence Score
- Update Timestamps
- Source Attribution
- Background Job Completion Status
---

## 🧹 Core Features & Enhancements

### **1. Progressive Loading System**

- Tiered response system (basic -> detailed)
- Background jobs with polling and job status
- Cached progressive data delivery

### **2. Mobile-First Responsive Design**

- Viewport optimization
- Touch-friendly buttons
- Typography and spacing for small screens

### **3. Advanced Transparency Analysis**

- Real-time scraping from dashboards
- Multi-source verification
- Background completion with polling

### **4. Cross-Chain & Cross-Exchange Liquidity**

- Market depth from MCP terminal + CEX APIs
- Risk scoring based on slippage, order depth, liquidity spread

### **5. Intelligent Audit Discovery**

- GitHub + GitBook pattern matching
- Audit provider detection
- Non-blocking crawler w/ async status

### **6. Oracle Security Assessment**

- Chainlink, Band, API3 support
- Frequency, decentralization, fallback detection

### **7. 🤖 AI-Powered Collateral Discovery (NEW)**

- Gemini Flash 2.5 powered extraction of collateral assets
- Sources: explorer storage, GitHub, docs, dashboards
- Confidence score + LLM-generated explanation
- MCP used for real-time asset valuation

---
## 🖥️ API Design & Data Models

### **Key API Endpoints**

- `GET /api/stablecoin/[ticker]/progressive`
- `GET /api/stablecoin/[ticker]/status`
- `GET /api/stablecoin/[ticker]/collateral-ai`

### **Collateral AI Response Example**

```ts
{
  collateral: [
    {
      asset: "ETH",
      type: "crypto",
      ratio: 0.4,
      valuation_usd: 720_000_000,
      confidence_score: 0.91,
      sources: ["etherscan", "github", "docs"]
    }
  ],
  source_summary: "Reserves mostly composed of ETH and stETH according to GitHub config and Chainlink oracle feed.",
  status: "completed"
}

### **Caching Strategy**

- Redis (prod), Next.js, browser
- TTL: 24h (stablecoin info), 12h (liquidity), 6h (collateral)
- Cache hit target: 85%+


## 🔒 Security & Compliance

- No sensitive data in logs/errors
- GDPR-compliant data handling
- Sandboxed LLM environment
- Query limits: 10/IP/day
- Secure background job queue

---

## 🚀 Deployment & Infrastructure

- Hosting: Vercel + Node backend
- Caching: Redis
- CI/CD: Test + deploy pipeline
- Monitoring: APM, error tracking, queue monitoring
- LLM Proxy: Gemini Flash 2.5 via Vertex AI or hosted proxy


---

**References:**

- [MCP Docs](https://docs.coingecko.com/reference/mcp-server)
- [Gemini Flash LLM](https://deepmind.google/technologies/gemini)


