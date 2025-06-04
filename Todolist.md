# StableRisk — Step-by-Step To-Do List

---

## Phase 1: Planning & Setup ✅ COMPLETED

- [x] Finalize PRD and get stakeholder alignment  
- [x] Define tech stack for backend, frontend, and AI agent integration  
- [x] Set up project repositories and version control (Git)  
- [x] Establish API keys and access for:  
  - [x] CoinGecko (verified: 17,260 coins available)
  - [x] GitHub (verified: 12,128 audit files searchable)
  - [x] DeFiLlama (verified: 5,977 protocols available)
  - [x] GeckoTerminal (verified: 100 networks available)

**Phase 1 Summary:** All APIs tested and working. Tech stack defined with Python/FastAPI backend and Next.js frontend. Ready for development.

---

## Phase 2: Backend Development 🔄 IN PROGRESS

### 2.1 Data Retrieval & Processing

- [x] **PRIORITY 1**: Implement ticker-to-`coin_id` mapping using CoinGecko API ✅ COMPLETED
  - [x] Built comprehensive CoinGecko service with caching
  - [x] Implemented smart ticker search with bridged token filtering
  - [x] Added market cap-based best match selection
  - [x] Created comprehensive stablecoin search endpoint
  - [x] Tested with USDT, USDC, DAI, BUSD - all working perfectly
- [x] Build metadata fetch module (name, homepage, repos_url, market cap, etc.) ✅ COMPLETED
- [x] Implement price history analyzer to detect depeg events and recovery times ✅ COMPLETED
- [x] Fetch and aggregate liquidity data per chain from GeckoTerminal and DeFiLlama ✅ COMPLETED
  - [x] Built comprehensive liquidity aggregation service
  - [x] Multi-chain liquidity analysis (Ethereum, BSC, Polygon, Arbitrum)
  - [x] Risk scoring algorithm based on total liquidity, chain diversification, and concentration
  - [x] Real-time pool data from GeckoTerminal API
  - [x] Comprehensive API endpoints for liquidity analysis
  - [x] Tested with major stablecoins - all operational
- [ ] Develop GitHub repo crawler to identify audit files and oracle code patterns  
- [ ] Integrate AI agent for scraping GitHub links from project websites if repos_url missing  
- [ ] Implement AI agent for website scraping to find transparency dashboards and PoR data  
- [ ] Develop pegging type classifier with manual override fallback  
- [ ] Implement oracle infrastructure detection logic  

### 2.2 Risk Scoring Engine

- [ ] Define scoring formulas for each risk factor  
- [ ] Implement scoring engine that outputs individual scores and aggregate score  
- [ ] Implement "unknown" data handling and neutral scoring rules  
- [ ] Flag unverified third-party sources per safety rules  

### 2.3 Caching & Rate Limiting

- [ ] Implement daily caching layer for all retrieved data and computed scores  
- [ ] Build API gateway with IP-based throttling (10 queries per IP per day)  

---

## Phase 3: Frontend Development ⏳

- [ ] Design and build input UI for stablecoin ticker symbol  
- [ ] Build risk dashboard UI:  
  - Aggregate score with color-coded indicator  
  - Risk breakdown table  
  - Peg deviation graph visualization  
  - Audit timeline visualization  
  - Liquidity heatmap visualization by chain  
- [ ] Implement shareable report link generation  
- [ ] Display proper error/warning messages for missing or unknown data  

---

## Phase 4: Admin Panel Development ⏳

- [ ] Build admin interface for manual metadata overrides  
- [ ] Implement crowdsourced PoR and audit submissions workflow  
- [ ] Admin approval system for user submissions  

---

## Phase 5: Testing & QA ⏳

- [ ] Unit test backend API modules and AI scraping agents  
- [ ] Integration test end-to-end data flow and risk scoring  
- [ ] Frontend UI/UX testing on multiple browsers/devices  
- [ ] Security audit on API rate limiting and admin controls  
- [ ] Load test caching and API gateway under simulated traffic  

---

## Phase 6: Deployment & Monitoring ⏳

- [ ] Deploy backend services and frontend app to cloud environment  
- [ ] Set up monitoring for API usage, caching health, error rates  
- [ ] Implement alerting for API abuse or system failures  
- [ ] Prepare documentation for users and admins  

---

## Phase 7: Future Enhancements (Post-MVP) ⏳

- [ ] Add user watchlists and alert notifications  
- [ ] Enable export of risk reports (PDF/CSV)  
- [ ] Add more granular pegging and risk classifications  
- [ ] Support multi-language UI  
- [ ] Explore regulatory risk and freeze risk detection  

---

## 🚀 Next Steps (Phase 2.1 Continued)

**✅ COMPLETED:**
1. **Ticker-to-coin_id mapping** - Working perfectly with smart filtering
2. **Metadata retrieval** - Full coin information including market cap, price, GitHub repos
3. **Price analysis** - Peg stability analysis with depeg event detection
4. **Liquidity data aggregation** - Multi-chain liquidity analysis with risk scoring

**🔄 NEXT PRIORITIES:**
1. **GitHub repo crawler** - Scan repositories for audit files and oracle patterns
2. **AI agent integration** - Website scraping for missing GitHub links
3. **Oracle infrastructure detection** - Analyze price feed decentralization

*Last updated: 2025-06-03 - Phase 2.1 Liquidity Analysis completed successfully*

