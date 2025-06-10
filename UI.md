# StableRisk - UI Design Specification

## 1. General Requirements

- Use [shadcn/ui](https://ui.shadcn.co/) component library for UI elements  
- Support both light and dark mode themes  
- Mobile responsive design mandatory  

---

## 2. Landing & Search Page

- Display logo: “StableRisk by SerStableLad” (top center or top-left)  
- Description tagline beneath logo  
- Small disclaimer text: “Not financial advice” below tagline  
- Large centered search bar with placeholder: “Enter stablecoin ticker”  
- Input: manual text entry only (no autocomplete)  
- Show error message: “Stablecoin not found” if ticker is invalid  
- Show skeleton loader while fetching data  

---

## 3. Main Dashboard Layout (One Pager)

- **Main Summary Card:**  
  - Stablecoin basic info: name, logo, market cap, genesis date, pegging type (fiat-backed, crypto-collateralized, algorithmic, commodity-backed with commodity specified)  
  - Overall risk score displayed as a circular meter with color-coded segments (red/yellow/green)  
  - Plain-language summary statement of risk profile  

- **Peg Stability Section:**  
  - 365-day price chart showing stablecoin price vs peg (USD)  
  - Stats below chart: average deviation %, depeg incident count, depeg recovery speed  
  - Alert banner if stablecoin marked as depegged (>1 month no recovery)  

- **Risk Summary Cards (clickable):**  
  - Transparency  
  - Liquidity  
  - Oracle  
  - Audit  
  Each card shows a color-coded risk level and brief summary  

- **Detailed Sections:**  
  - **Transparency:** Link to transparency dashboard, attestation provider, update frequency, flags for unverified sources  
  - **Audit:** List of all audits in last 6 months with details and resolution status  
  - **Oracle:** List of oracle providers and number of services used  
  - **Liquidity:** Heatmap of liquidity by chain and DEX, highlighting concentration risks  

---

## 4. Interaction & UX

- Clicking risk summary cards smoothly scrolls to respective detailed section  
- Skeleton loaders visible during API calls  
- Shareable link functionality included (generates URL which re-queries data on page load)  
- Show “Unrated due to lack of information” label in gray for missing data points  
- Responsive layout adapts gracefully to mobile, tablet, and desktop screens  

---

## 5. Visual & Branding

- Consistent use of brand colors for risk levels:  
  - Red for high risk (score ≤ 5)  
  - Yellow for medium risk (score > 5 to 8)  
  - Green for low risk (score > 8 to 10)  
- Circular meter uses smooth animations for score changes  
- Use clean, modern typography and spacing consistent with shadcn/ui defaults  
- Logo and tagline remain visible on scroll for branding continuity  

---

## 6. Accessibility

- Ensure keyboard navigability throughout  
- Sufficient color contrast for risk level indicators  
- Screen reader-friendly labels and descriptions for key components  

