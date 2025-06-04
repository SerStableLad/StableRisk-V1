# StableRisk — Product Requirement Document (PRD)

---

## 1. Overview

**StableRisk** is an automated web-based tool that provides a comprehensive risk assessment for stablecoins.  
Users input a stablecoin ticker symbol and receive a detailed risk dashboard with visual insights and an aggregated risk score based on multiple risk dimensions.

---

## 2. Goals & Objectives

- Automate stablecoin risk evaluation  
- Present risk insights clearly and intuitively for a broad user base  
- Enable comparison of risk profiles across different stablecoins  
- Promote transparency and accountability in stablecoin projects and DeFi ecosystems

---

## 3. Target Users

- Crypto investors and traders  
- Risk analysts and auditors  
- DeFi protocol integrators and product teams

---

## 4. Features & Requirements

### 4.1 User Input

- Input: Stablecoin ticker symbol (e.g., USDT, DAI)  
- No user login required

### 4.2 Data Retrieval Pipeline

1. **Metadata Retrieval (CoinGecko API)**  
   - Map ticker to `coin_id`  
   - Fetch metadata: `name`, `homepage`, `repos_url`, `image`, `genesis_date`  
   - Fetch market data: `market_cap`, `price_change_percentage_1y_in_currency`

2. **Repository Discovery & Audit Extraction**  
   - Crawl GitHub repositories if URL available  
   - Extract audit reports (PDF, Markdown, audit folders)  
   - Detect oracle implementation patterns (AI-assisted)  
   - If no `repos_url`, AI agent scrapes homepage for GitHub links

3. **Transparency & Reserve Data Discovery**  
   - AI agent scrapes official website for:  
     - Transparency dashboards  
     - Proof-of-Reserve (PoR), attestations, backing reports  
   - Keyword matching: `proof of reserve`, `PoR`, `attestation`, `transparency`, `backing`, `dashboard`

4. **Price History & Peg Analysis**  
   - Analyze 1-year price data from CoinGecko  
   - Detect depeg events (>5% deviation) and measure recovery speed  
   - Determine pegging type: fiat-backed, crypto-collateralized, algorithmic, commodity-backed (with commodity specified)  
   - Manual override for pegging metadata for top 100 coins

5. **Oracle Infrastructure Detection**  
   - Inspect code and docs for oracle usage: Chainlink, Band, RedStone, proprietary  
   - Determine decentralized (multi-oracle) vs single oracle setup

6. **Liquidity Data Collection**  
   - Fetch on-chain liquidity by chain (GeckoTerminal, DeFiLlama APIs)  
   - Collect DEX and CEX support footprint

### 4.3 Risk Scoring

- Individual scores for:  
  - Peg Stability  
  - Depeg Recovery (separate score, faster recovery = higher score)  
  - Audit Quality  
  - Reserve Transparency  
  - Oracle Decentralization  
  - Liquidity Depth per chain  

- Scores left blank (neutral) if data unknown; label info as "Unknown"  
- Pegging type shown for context only; does NOT influence scoring  
- Third-party sources flagged "Unverified" unless from:  
  - CoinGecko  
  - DeFiLlama  
  - GeckoTerminal  
  - Project's GitHub repository  

#### 🔍 Liquidity Depth Risk Scoring (Per Chain)

##### 🎯 Goal
Quantitatively assess the liquidity health of a stablecoin **per supported chain** to identify depeg risk, slippage vulnerability, and over-concentration of liquidity sources.

##### 📥 Inputs

1. **On-Chain TVL** (via DeFiLlama per chain)
2. **DEX Liquidity Pools** (via GeckoTerminal API)
3. **Number of Active DEXs** (with >$100k in liquidity)
4. **Pool Composition** (stable/stable vs. volatile/stable)
5. **Liquidity Provider Centralization**
6. **Historical Drain Events**
7. **Flash Loan Attack Vectors** (if detectable via patterns)

##### 📊 Scoring Tiers (Base Score)

| TVL per Chain | Score (0–10) | Interpretation |
|---------------|--------------|----------------|
| ≥ $100M       | 9–10         | Excellent liquidity |
| $30M–$99.9M   | 7–8          | Strong support |
| $10M–$29.9M   | 5–6          | Moderate risk |
| $1M–$9.9M     | 3–4          | High risk |
| <$1M or 1 DEX only | 1–2     | Very high risk |
| No DEX Presence | 0          | Critical – Unusable |

##### ➕ Bonus / ➖ Penalty Adjustments

| Adjustment | Condition | Value |
|------------|-----------|--------|
| **+1**     | ≥ 3 DEXs with >$100k liquidity | Promotes decentralization |
| **-2**     | ≥ 90% of liquidity in 1–2 DEXs | Liquidity centralization |
| **-1**     | >50% of liquidity paired with volatile tokens (e.g., ETH) | Slippage risk |
| **-2**     | Liquidity managed mostly by 1–2 wallets | Provider centralization risk |
| **-3**     | Recent history of drain events (within 12 months) | Indicates active exploit risk |
| **-2**     | Historical flash loan exploit or pattern detected (e.g., pool manipulation) | Protocol design flaw |
| **-1**     | No active liquidity monitoring or pause controls | Operational risk |

##### 🧠 Special Conditions

- **Volatile LP Dominance**: If >50% of liquidity is in volatile/stable pools (e.g., USDT/ETH), slippage and peg volatility increase.
- **DEX Diversity**: More DEXs = better decentralization, lower MEV risk.
- **Liquidity Provider Centralization**: Analyzed via top LP wallet addresses. Heavy concentration = risk of rug or manipulation.
- **Drain History**: Leverages DeFiLlama's "exploit database" + GitHub search via AI agent.
- **Flash Loan Sensitivity**: Simple heuristics (low liquidity, high variance, no delay between mint & redeem) may trigger warnings.

##### 🧮 Final Computation

**Per Chain Score = Base Score ± Adjustments**

**Global Liquidity Risk Score = Weighted Average of Per-Chain Scores**, where weights = TVL per chain.

If a single chain has extremely low liquidity (<$100k), flag with 🚨 icon, even if average score is acceptable.

##### 🎨 Frontend Display

- **Color-coded heatmap** (per chain)
  - Red: Score < 4
  - Orange: Score 4–6
  - Green: Score > 6
- **Tooltips per chain** with:
  - TVL
  - DEX count
  - Top pool & depth
  - % stable/stable vs volatile LPs
  - LP centralization flag
  - Exploit history (if any)
- **Expandable table** for transparency & dev usage

##### 🔐 Notes on Data Accuracy

- All on-chain data cached daily (24h).
- Chains not found or with failed fetch → score = "Unknown" with gray color.
- Only on-chain data used for scoring (CEX data excluded for MVP).

### 4.4 Frontend UI

- Aggregate risk score displayed with color-coded risk indicator (Green, Yellow, Red)  
- Risk breakdown table showing individual factor scores  
- Visualizations:  
  - Peg deviation graph  
  - Audit timeline  
  - Liquidity heatmap by chain  
- Shareable link for risk reports (no downloads or embedding)

### 4.5 Admin Features

- Manual override for pegging type and metadata corrections  
- Review and approve crowdsourced Proof-of-Reserve links and audit PDF submissions  
- Admin dashboard to manage overrides and submissions

---

## 5. Constraints & Limitations

- No login required  
- API throttled by IP: max 10 queries per IP per day  
- Data cached for 24 hours (no live queries)  
- Bridged tokens are excluded from display and scoring  
- Score calculation is fully automated — no human review in MVP  
- Unknown data does not penalize the score, but shows as "Unknown"

---

## 6. Error Handling

- Missing GitHub or website → display "Unavailable" label  
- Missing audit data → warning icon + "Unknown" tag  
- Inconsistent or incomplete data → partial scoring, fallback where possible  
- API failures → retry logic and graceful degradation  

---

## 7. Future Considerations

- User watchlists and alerting on depeg or audit changes  
- Exportable reports (PDF, CSV)  
- Additional pegging types or hybrid models  
- Regulatory risk and freeze capability assessments  
- Public searchable stablecoin database with filters

---

## 8. Definitions

| Term                 | Description                                             |
|----------------------|---------------------------------------------------------|
| Pegging Type         | Stablecoin backing classification: fiat, crypto, algorithmic, commodity-backed |
| Depeg Event          | Price deviation >5% from peg                              |
| PoR                  | Proof-of-Reserve, attestation of reserves backing the coin |
| Oracle               | External data provider used for price feeds             |
| Liquidity Depth      | On-chain available liquidity to redeem stablecoin        |
| TVL                  | Total Value Locked - total liquidity in a specific pool or chain |
| DEX                  | Decentralized Exchange - on-chain automated market maker |
| LP                   | Liquidity Provider - entity supplying tokens to liquidity pools |
| Volatile/Stable Pool | Pool pairing stablecoin with volatile asset (ETH) vs another stable (USDC) |
| Pool Composition     | Mix of stable/stable vs volatile/stable liquidity pairs |
| Liquidity Concentration | Percentage of total liquidity held by largest pools or providers |
| Drain Event          | Rapid withdrawal of liquidity causing significant TVL reduction |
| Flash Loan Attack    | Exploit using borrowed funds to manipulate pool prices temporarily |
| MEV                  | Maximal Extractable Value - profit from transaction ordering manipulation |

---

## 9. Appendix

- Approved domains for verified sources:  
  - `coingecko.com`  
  - `defillama.com`  
  - `geckoterminal.com`  
  - Project's official GitHub repo URL  

---

*Document last updated: 2025-06-03*

