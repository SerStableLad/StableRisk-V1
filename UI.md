# StableRisk - UI Design Specification

## 1. General Requirements

- Use [shadcn/ui](https://ui.shadcn.co/) component library for UI elements  
- Support both light and dark mode themes  
- **Mobile-first responsive design** with perfect alignment across all devices
- **Progressive loading** with immediate feedback and background processing
- **Clean UI design** with minimal visual clutter and no badge overflow
- **Touch-friendly interface** optimized for mobile interactions

---

## 2. Landing & Search Page

- Display logo: "StableRisk by SerStableLad" (top center or top-left)  
- Description tagline beneath logo  
- Small disclaimer text: "Not financial advice" below tagline  
- Large centered search bar with placeholder: "Enter stablecoin ticker"  
- Input: manual text entry only (no autocomplete)  
- Show error message: "Stablecoin not found" if ticker is invalid  
- **Progressive loading indicators** while fetching data
- **Mobile-optimized search** with touch-friendly input and buttons

---

## 3. Progressive Loading System

### **3.1 Initial Response (Sub-3 seconds)**
- **Fast Data Display**: Basic market info appears within 500-1500ms
- **Loading States**: Clear indicators for background processing
- **Progress Tracking**: Real-time status for audit, transparency, and detailed analysis
- **Completion Estimates**: Time estimates for remaining background jobs

### **3.2 Background Processing**
- **Non-blocking Analysis**: Detailed analysis continues asynchronously
- **Real-time Updates**: Data appears progressively without page refresh
- **Status Polling**: Automatic polling for job completion updates
- **Error Handling**: Graceful degradation when background jobs fail

### **3.3 Progressive Enhancement**
- **Immediate Feedback**: Users see basic data instantly
- **Background Completion**: Detailed data loads progressively
- **Loading Indicators**: Clear status for each analysis component
- **Seamless Updates**: Smooth transitions as data becomes available

---

## 4. Mobile-First Responsive Design

### **4.1 Viewport Optimization**
- **Proper viewport meta tags** for Next.js 13+ App Router
- **Device-width scaling** with initial-scale=1
- **Consistent rendering** across iOS Safari, Android Chrome, and other mobile browsers

### **4.2 Responsive Container System**
- **Unified padding strategy** across header and main content
- **Consistent alignment** on mobile, tablet, and desktop
- **No horizontal overflow** or weird spacing issues
- **Touch-friendly spacing** with adequate tap targets

### **4.3 Mobile Breakpoints**
- **xs (475px)**: Extra small mobile devices
- **sm (640px)**: Small mobile devices  
- **md (768px)**: Tablets
- **lg (1024px)**: Small laptops
- **xl (1280px)**: Desktop and larger

---

## 5. Clean UI Design (No Badge Clutter)

### **5.1 Badge Elimination**
- **Audit Section**: No badges for audit types, verification status, or severity levels
- **Liquidity Section**: No badges for exchange types, status indicators, or risk levels
- **Transparency Section**: No badges for provider types or verification status
- **Main Summary**: Clean risk score display without excessive visual elements

### **5.2 Text-Based Status Indicators**
- **Audit Status**: Use clean text instead of colored badges (e.g., "(critical)" in parentheses)
- **Exchange Status**: Simple text indicators like "Active" or "Inactive"
- **Risk Levels**: Text-based risk descriptions instead of colored badges
- **Coverage Areas**: Comma-separated text instead of badge grids

### **5.3 Simplified Layouts**
- **Streamlined components** with focus on essential information
- **Reduced visual noise** for better mobile readability
- **Clear typography hierarchy** without badge distractions
- **Consistent spacing** without badge-induced layout shifts

---

## 6. Main Dashboard Layout (Progressive One Pager)

### **6.1 Main Summary Card (Mobile-Optimized)**
- **Stablecoin basic info**: Name, logo, market cap, genesis date, pegging type (fiat-backed, crypto-collateralized, algorithmic, commodity-backed with commodity specified)  
- **Overall risk score**: Circular meter with color-coded segments (red/yellow/green)
- **Progressive loading**: Basic info appears immediately, detailed analysis loads progressively
- **Mobile-friendly layout**: Responsive design with proper touch targets

### **6.2 Progressive Loading Indicators**
- **Initial data status**: Clear indicators for what data is immediately available
- **Background job status**: Real-time progress for audit discovery, transparency analysis, detailed liquidity
- **Completion estimates**: Time estimates for remaining analysis
- **Error states**: User-friendly messages for failed background jobs

### **6.3 Peg Stability Section (Mobile-Responsive)**
- **365-day price chart**: Responsive chart showing stablecoin price vs peg (USD)
- **Mobile-optimized charts**: Touch-friendly interactions and proper scaling
- **Stats below chart**: Average deviation %, depeg incident count, recovery speed
- **Alert banner**: If stablecoin marked as depegged (>1 month no recovery)

### **6.4 Risk Summary Cards (Touch-Friendly)**
- **Clean card design**: No badges, text-based status indicators
- **Touch-optimized**: Adequate tap targets for mobile devices
- **Progressive updates**: Cards update as background analysis completes
- **Color-coded risk levels**: Red/yellow/green with accessibility compliance
- **Smooth scrolling**: Clicking cards scrolls to respective detailed sections

### **6.5 Detailed Sections (Clean Layout)**

#### **Transparency Section**
- **Dashboard link**: Clean link to transparency dashboard
- **Attestation provider**: Text-based provider information
- **Update frequency**: Simple text indicator
- **No badges**: Clean text-based status instead of verification badges

#### **Audit Section**  
- **Clean audit list**: All audits in last 6 months with simplified layout
- **Text-based status**: Audit types and verification status as clean text
- **Coverage areas**: Comma-separated text instead of badge grids
- **Progressive loading**: Audit data loads via background jobs

#### **Oracle Section**
- **Provider list**: Clean list of oracle providers
- **Service count**: Number of services used without badge clutter
- **Text-based indicators**: Simple status text instead of badges

#### **Liquidity Section**
- **Clean heatmap**: Liquidity by chain and DEX with simplified visual design
- **No status badges**: Text-based active/inactive indicators
- **Concentration risks**: Clear highlighting without badge overflow
- **Progressive enhancement**: Basic liquidity first, detailed analysis via background jobs

---

## 7. Interaction & UX (Mobile-Optimized)

### **7.1 Progressive Loading UX**
- **Immediate feedback**: Basic data appears within 500-1500ms
- **Background processing**: Detailed analysis continues without blocking
- **Real-time updates**: Progressive data enhancement via polling
- **Loading states**: Clear indicators for each background job

### **7.2 Mobile Interactions**
- **Touch-friendly targets**: Minimum 44px tap targets for buttons and links
- **Smooth scrolling**: Risk summary cards smoothly scroll to respective sections
- **Touch debouncing**: Prevent accidental double-taps
- **Gesture support**: Swipe gestures where appropriate

### **7.3 Progressive Enhancement**
- **Graceful degradation**: Partial results when background jobs fail
- **Error recovery**: User-friendly error messages with retry options
- **Offline support**: Basic caching for offline viewing
- **Network resilience**: Optimized for slower mobile connections

### **7.4 Responsive Features**
- **Adaptive layouts**: Components adapt gracefully to screen size
- **Responsive typography**: Text scales appropriately for mobile viewing
- **Touch-optimized forms**: Search inputs optimized for mobile keyboards
- **Cross-device consistency**: Perfect alignment on all devices

---

## 8. Visual & Branding (Mobile-First)

### **8.1 Mobile-Optimized Colors**
- **Risk level colors** with sufficient contrast for mobile viewing:
  - Red for high risk (score ≤ 5)  
  - Yellow for medium risk (score > 5 to 8)  
  - Green for low risk (score > 8 to 10)
- **Clean color palette** without badge-induced color conflicts
- **Dark mode support** with proper mobile contrast ratios

### **8.2 Progressive Loading Visual Feedback**
- **Loading animations**: Smooth skeleton loaders and progress indicators
- **Status transitions**: Seamless visual transitions as data loads
- **Completion feedback**: Clear visual confirmation when analysis completes
- **Error states**: User-friendly error visuals with recovery options

### **8.3 Mobile Typography**
- **Responsive text sizing**: Scales appropriately across devices
- **Touch-friendly line heights**: Adequate spacing for mobile reading
- **Clean hierarchy**: Clear typography without badge distractions
- **Readable fonts**: Optimized for mobile screen viewing

### **8.4 Clean Visual Design**
- **Minimal clutter**: Removed badges for cleaner mobile experience
- **Consistent spacing**: Unified padding and margins across components
- **Focus on content**: Essential information highlighted without visual noise
- **Brand consistency**: Logo and tagline visible on scroll for continuity

---

## 9. Accessibility (Mobile-Enhanced)

### **9.1 Progressive Loading Accessibility**
- **Screen reader announcements**: Status updates announced to screen readers
- **Loading state labels**: Clear ARIA labels for background job status
- **Completion notifications**: Accessible notifications when analysis completes
- **Error announcements**: Screen reader-friendly error messages

### **9.2 Mobile Accessibility**
- **Touch accessibility**: Adequate tap targets and touch feedback
- **Keyboard navigation**: Full keyboard support for mobile keyboards
- **Voice control**: Support for mobile voice navigation
- **Screen reader support**: Optimized for mobile screen readers

### **9.3 Visual Accessibility**
- **Color contrast**: Sufficient contrast for mobile viewing conditions
- **Text scaling**: Support for mobile text scaling preferences
- **Focus indicators**: Clear focus states for keyboard navigation
- **Reduced motion**: Respect user preferences for reduced animations

---

## 10. Performance Optimization (Mobile-First)

### **10.1 Progressive Loading Performance**
- **Sub-3 second initial response**: Basic data appears within 500-1500ms
- **Background processing**: Detailed analysis without blocking user experience
- **Efficient polling**: Optimized status polling to minimize battery impact
- **Smart caching**: Background job results cached for future requests

### **10.2 Mobile Performance**
- **Touch response**: <100ms response time for touch interactions
- **Layout stability**: <0.1 Cumulative Layout Shift (CLS)
- **First contentful paint**: <2s on mobile devices
- **Bundle optimization**: Mobile-specific code splitting and optimization

### **10.3 Network Optimization**
- **Reduced payloads**: Optimized for slower mobile connections
- **Progressive enhancement**: Essential content first, enhancements later
- **Offline support**: Basic functionality available offline
- **Compression**: Optimized images and assets for mobile bandwidth

---

This enhanced UI design specification reflects the latest progressive loading implementation, mobile-first optimizations, and clean UI improvements that provide an excellent user experience across all devices while maintaining fast performance and accessibility compliance.

