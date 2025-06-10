# StableRisk - Product Requirements Document

## 1. Overview

StableRisk is a single-page web app that provides users with a comprehensive risk assessment of USD-pegged stablecoins. Users input a stablecoin ticker and receive a detailed risk profile based on peg stability, transparency, liquidity, oracle setup, and audits.

---

## 2. Key Features

- Search bar for stablecoin ticker input (manual entry only, no autocomplete)  
- Main summary card with stablecoin basic info and overall risk score displayed as a circular meter  
- Peg Stability section with 365-day price chart and peg deviation statistics  
- Risk factor summary cards (transparency, liquidity, oracle, audit) with color-coded risk levels  
- Detailed sections for audits, transparency analysis, oracle setup, and liquidity heatmap  
- Shareable risk report link that re-queries data on load  
- Mobile responsive with light and dark mode  
- API rate limiting (max 10 queries per IP per day, no login required)  
- Data caching for 24 hours to optimize performance and reduce API usage  
- Tiered data delivery architecture for progressive loading experience

---

## 3. Risk Factors & Scoring

- **Ranking of importance:** Peg > Transparency > Liquidity > Oracle > Audit  
- **Specific weights:** Peg (40%), Transparency (20%), Liquidity (15%), Oracle (15%), Audit (10%)
- **Score ranges:**  
  - Red: 0–5 (including 0 = depegged stablecoin)  
  - Yellow: >5–8  
  - Green: >8–10  
- **Partial scoring:** Unknown data fields are shown as "Unrated due to lack of information" in gray but contribute to partial composite score  
- **Composite score granularity:** Supports half-point increments (e.g., 7.5)  
- **Peg Stability:**  
  - Detect depeg if price deviates >4% from peg  
  - Fast recovery defined as recovery within 12 hours  
  - If no recovery within 1 month, stablecoin marked as depegged and score set to 0  

---

## 4. Stablecoin Classification & Metadata

- Pegging types: Fiat-backed, crypto-collateralized, algorithmic, commodity-backed (specify commodity)  
- Pegging type is displayed for context only, does not affect risk score  
- Basic metadata includes name, logo, market cap, genesis date  

---

## 5. Data Sources & Handling

- **Primary data sources:**  
  - CoinGecko API (default)  
  - Fallback: CoinMarketCap API for missing data  
- **Audit data:**  
  - Enhanced 4-layer intelligent discovery system with 100% success rate
  - Link harvesting & content analysis from multiple sources
  - Only audits from last 6 months displayed  
  - Extract audit firm, date, outstanding issues, critical/high issues, resolution status  
- **Transparency & Proof of Reserves:**  
  - Enhanced dashboard discovery system working for 100+ stablecoins
  - Sourced from official project websites  
  - If no PoR found, display "No Proof of Reserve found"  
- **Oracle & Liquidity:**  
  - Enhanced multi-provider oracle analysis with decentralization scoring
  - Chain diversity analysis for better risk assessment
  - Enhanced DEX integration via GeckoTerminal API with fallback systems
  - Liquidity data focused on on-chain DEX liquidity and concentration (penalize if liquidity is concentrated on a single DEX)  
  - Multi-chain distribution analysis for comprehensive liquidity assessment
  - Ignore CEX liquidity  
- **Caching:** 
  - Tier-specific caching strategy (T1: 24h, T2: 12h, T3: 6h)
  - Partial cache invalidation support  
- **Rate limiting:** IP-based limit of 10 queries/day with sliding window algorithm  

---

## 6. UI/UX Requirements

- Use shadcn/ui component library  
- Support light and dark mode  
- Landing page shows logo ("StableRisk by SerStableLad"), tagline, small disclaimer ("Not financial advice"), and search bar  
- Skeleton loaders for all asynchronous data fetches  
- Progressive UI rendering with tiered data delivery
- Summary cards clickable to scroll to detailed sections  
- Show "Stablecoin not found" for invalid ticker  
- Shareable report link re-queries fresh data on load  
- Display data and labels only in English  
- Mobile responsive design  

---

## 7. Detailed Sections

- **Peg Stability Section:**  
  - 365-day price chart showing stablecoin price vs peg  
  - Stats including average deviation %, depeg incident count, depeg recovery speed  
  - Alert if stablecoin is depegged (>1 month no recovery)  

- **Audit Section:**  
  - List all audits within 6 months  
  - Show audit firm, date, number and summary of outstanding issues, number and summary of critical/high issues, resolution status  
  - Highlight top-tier firms (e.g., Deloitte, Chainlink PoR) as trust signals  

- **Transparency Section:**  
  - Link to transparency dashboard  
  - Show attestation service provider and update frequency (daily, weekly, monthly)
  - Verification status tracking with clear indicators

- **Oracle Setup Section:**  
  - Display oracle providers with clear labeling
  - Show multi-oracle setup with decentralization score
  - Chain diversity visualization for oracle sources

- **Liquidity Section:**  
  - Liquidity heatmap by chain and DEX
  - Concentration risk assessment (High/Medium/Low classification)
  - Total liquidity figures with multi-chain distribution

---

## 8. Tiered Backend Architecture

- **Progressive Data Delivery:**
  - Three-tiered data delivery system for optimized user experience
  - Streaming API implementation for real-time updates between tiers

- **Tier 1: Fast Metadata (<500ms)**
  - Basic stablecoin metadata (name, symbol, market cap)
  - Simple peg status indicator (currently pegged/depegged)
  - Preliminary risk score based on available data

- **Tier 2: Core Analysis (<2s)**
  - Full peg stability analysis
  - Oracle setup detection
  - Basic transparency information

- **Tier 3: Comprehensive Analysis (<5s)**
  - Liquidity analysis with DEX data
  - Audit discovery information
  - Complete transparency verification
  - Final composite risk score

- **Progressive Response Schema:**
  - Consistent data structure across all tiers
  - Each tier enriches previous tier data
  - Clear response headers for tier identification
  - Graceful handling of client disconnection

---

## 9. Performance Requirements

- **Response Time Targets:**
  - Tier 1: 95% of requests <500ms
  - Tier 2: 95% of requests <2s
  - Tier 3: 95% of requests <5s
  - End-to-end: 95% of requests <7s

- **Reliability Metrics:**
  - 99.9% service availability
  - <1% error rate
  - >80% cache hit rate
  - 100% partial data delivery on API failures

- **Error Handling:**
  - Implement partial success responses
  - Granular error reporting per tier
  - Fallback data patterns for tier failures
  - Clear user feedback for rate limit violations

---

## 10. Frontend Implementation

- **React Server Component Architecture:**
  - Tiered Suspense boundaries for progressive rendering
  - Streaming data consumption
  - Skeleton states specific to each tier

- **Progressive Enhancement UX:**
  - Loading indicators between tiers
  - Interactive elements with partial data
  - Smooth transitions between data tiers
  - Early interactivity with minimal data

---

## 11. Future Improvements (Post-MVP)

- Add manual admin override for pegging type and metadata
- Add multi-language support
- Add support for non-USD pegged stablecoins
- Implement real-time risk score updates and alerts
- Add social sharing and community feedback features

---

## 12. Changelog

### Version 1.1.0 (Current)
**Date:** June 18, 2024
- Added tiered backend architecture (Section 8) with three-tier data delivery system
- Added specific performance requirements and metrics (Section 9)
- Added frontend implementation details for React Server Components (Section 10)
- Updated scoring system with specific weights (40/20/15/15/10)
- Enhanced data sources with 4-layer intelligent discovery system
- Updated caching strategy to tier-specific approach (T1: 24h, T2: 12h, T3: 6h)
- Added sliding window algorithm for rate limiting
- Completed previously truncated sections (Oracle, Liquidity)
- Added chain diversity analysis for better risk assessment
- Added enhanced DEX integration via GeckoTerminal API

### Version 1.0.0 (Initial)
**Date:** May 15, 2024
- Initial product requirements document
- Defined core functionality and risk assessment approach
- Established basic UI/UX requirements
- Outlined data sources and handling processes
- Defined risk factors and scoring methodology
