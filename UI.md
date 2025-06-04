# 📘 UI Specification — Stablecoin Risk Assessment Tool

## 🌐 General

- **Type**: Single-page application (SPA)
- **Design Theme**: Clean, trust-oriented, professional
- **Color Semantics**:
  - 🟢 Green = Low Risk
  - 🟠 Orange = Medium Risk
  - 🔴 Red = High Risk
  - ⚪ Grey = Unknown / Unavailable
- **Layout Style**: Scrollable one-pager with sticky section headers and in-page anchors
- **Component Library**: Use components from [shadcn/ui](https://ui.shadcn.co/)
- **Theming**: Support both **light** and **dark** mode using Tailwind or shadcn's built-in theming features

---

## 🔍 Hero Section

### 1. Search Bar (Top of Page)
- **Position**: Centered, top of page
- **Placeholder**: `"Enter a stablecoin ticker (e.g., USDC, DAI, FRAX)"`
- **Submit Action**:
  - Triggers backend fetch
  - Shows loading spinner
  - Scrolls to results section on success
- **Optional Features for v2**:
  - Autocomplete from known stablecoins
  - Recent search history

---

## 🧾 Section 1: Stablecoin Overview (Summary Card)

### 📄 Stablecoin Basic Info Card

| Field                     | Description                      |
|--------------------------|----------------------------------|
| Name                     | Full name of stablecoin          |
| Peg Type                 | Fiat-backed, Crypto, Algo, etc.  |
| Website                  | Clickable link                   |
| GitHub Repo              | GitHub icon link                 |
| Genesis Date             | Date of initial mint             |
| Market Cap               | Total market cap                 |
| Peg History              | Sparkline showing 1-year data    |
| Final Risk Score         | Circular color-coded badge (0–10)|

---

## ⚠️ Section 2: Risk Factor Summary Cards

Each of the following appears as a **horizontal scrollable card** with a color-coded risk label and short explanation.

| Card             | Summary Info Shown                                             |
|------------------|---------------------------------------------------------------|
| **Audit Status** | Last audit date, who audited, number of issues resolved       |
| **Transparency** | Last update, frequency, attestor identity                     |
| **Peg Stability**| Max deviation, avg deviation, time to recovery from depeg     |
| **Oracle Design**| Type used (Chainlink, custom, etc.), backup present or not    |
| **Liquidity**    | Chain-level score + concentration info                        |
| **Reserves Proof** | PoR update frequency, confidence signal                     |
| **Known Incidents**| Pause/exploit/depeg warnings (last 12 months)               |

---

## 🧩 Section 3: Risk Factor Details

### 🛡️ Security Audit History

- **Title**: “🔍 Security Audits”
- For each audit:
  - Audit Date
  - Auditor (with logo/icon)
  - PDF/report link
  - **Summary Table**:
    | Field               | Value           |
    |---------------------|-----------------|
    | Critical Issues     | 2               |
    | Resolved            | ✅ Yes          |
    | Outstanding Issues  | ⚠️ 1 (minor)    |
- Banner if no audits: `"⚠️ No audit information available."`

---

### 📊 Transparency Dashboard Analysis

- **Title**: “📊 Transparency Dashboard”
- Fields shown:
  | Field                       | Example                      |
  |----------------------------|------------------------------|
  | Last Update Time           | 5 hours ago                  |
  | Update Frequency           | Daily                        |
  | Attestation Provider       | Armanino LLP                 |
  | Total Reserves             | $3.1B                        |
  | Reserve-to-Liability Ratio | 102%                         |
- **Display**: Snapshot/image of dashboard if embeddable
- External link to full dashboard

---

### 🛰 Oracle Infrastructure

- **Title**: “🛰 Oracle Setup”
- Show:
  - Oracle type: Chainlink / Band / Custom
  - Backup or redundancy: Yes / No
  - Update interval: Per block, hourly, etc.
- Warnings:
  - “🚨 Single centralized oracle”
  - “⚠️ Custom oracle without fallback”

---

### 🌊 Liquidity Heatmap

- **Title**: “🌐 Liquidity Depth & Concentration”
- Heatmap table:
  | Chain     | TVL    | # DEXs | Top DEX       | Score |
  |-----------|--------|--------|---------------|-------|
  | Ethereum  | $150M  | 5      | Curve         | 🟢 10 |
  | BNB Chain | $4M    | 2      | PancakeSwap   | 🟠 4  |
- Chart: Liquidity concentration by pool/wallet
- Flag if top 2 wallets/LPs hold >60% of liquidity

---

## 🔗 Section 4: Report Sharing

| Action              | UI Element                              |
|---------------------|------------------------------------------|
| Share Link          | “📤 Share Risk Report” (copyable URL)    |
| Export Report       | ❌ Not Available                         |
| Embed Widget        | ❌ Not Available                         |

---

## 🚨 Section 5: Red Flag Alerts

Only shown if triggered. Display as red alert cards:

- “⚠️ No audit found for this stablecoin.”
- “🚨 Depeg lasting > 48 hours detected.”
- “⚠️ Centralized Oracle with no backup detected.”
- “⚠️ Liquidity on major chains below threshold.”

---

## 🔮 Future Enhancements (v2+)

- Compare multiple stablecoins side-by-side
- Track/report updates (audit, dashboard, etc.)
- Personalized dashboard with bookmarks
- Alert system for risky status changes

---

## 🧱 Component Hierarchy (Frontend Dev Hint)

