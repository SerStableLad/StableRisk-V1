# StableRisk Technical Architecture

## 📋 Overview

**StableRisk** is a high-performance Next.js web application that provides comprehensive risk assessment for USD-pegged stablecoins through intelligent analysis of multiple risk factors including peg stability, transparency, liquidity, oracle security, and audit coverage.

**Current Status**: Production-ready with excellent performance (75/100 score)  
**Key Achievement**: 98% performance improvement (USDT: 18s → 253ms)

---

## 🏗️ Architecture Overview

### **Technology Stack**

#### **Frontend**
- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript (strict mode)
- **UI Library**: shadcn/ui + Tailwind CSS
- **Charts**: Recharts with custom theming
- **Icons**: Lucide React
- **State Management**: React Server Components + SWR for client state
- **Analytics**: Vercel Analytics + Speed Insights

#### **Backend**
- **Runtime**: Node.js with Next.js API Routes
- **Architecture**: Server-side rendering with API routes
- **Scraping**: Playwright (100% faster than previous Puppeteer)
- **Caching**: Redis (production) + Next.js cache (development)
- **Background Processing**: Custom queue system with intelligent early termination

#### **Data Sources**
- **Market Data**: CoinGecko API (primary), CoinMarketCap (fallback)
- **Liquidity Data**: GeckoTerminal API (14+ DEXs across 6+ chains)
- **Audit Discovery**: GitHub API + intelligent web scraping
- **Transparency**: Direct dashboard analysis with Playwright

---

## 🎯 System Architecture

### **Multi-Tier Analysis System**

```
┌─────────────────────────────────────────────────────────────┐
│                    StableRisk Architecture                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │   Tier 1    │    │   Tier 2    │    │   Tier 3    │     │
│  │  < 100ms    │───▶│  < 500ms    │───▶│  < 1000ms   │     │
│  │ Basic Data  │    │ Risk Metrics│    │Comprehensive│     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                    API Layer (Next.js)                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Cache     │  │ Rate Limit  │  │  Metrics    │         │
│  │ (24h TTL)   │  │(10/IP/day)  │  │  Service    │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                    Service Layer                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  CoinGecko  │  │Transparency │  │Audit Discovery       │
│  │   Service   │  │   Service   │  │   Service    │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ GeckoTerminal│  │  Playwright │  │ Background  │         │
│  │   Service   │  │   Scraper   │  │ Processor   │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### **Request Flow**

1. **User Request** → `/api/stablecoin/[ticker]`
2. **Rate Limiting** → Check 10 queries/IP/day limit
3. **Cache Check** → Redis/Next.js cache (24h TTL)
4. **Tier 1 Analysis** → Basic market data (< 100ms)
5. **Tier 2 Analysis** → Risk metrics (< 500ms)
6. **Tier 3 Analysis** → Comprehensive analysis (< 1000ms)
7. **Response** → Streaming or standard JSON response

---

## 📁 Directory Structure

```
stableriskv2/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── [ticker]/                 # Dynamic stablecoin pages
│   │   │   ├── page.tsx              # Main assessment page
│   │   │   └── loading.tsx           # Loading UI
│   │   ├── api/                      # API routes
│   │   │   ├── stablecoin/[ticker]/  # Main API endpoint
│   │   │   ├── search/               # Search endpoint
│   │   │   ├── admin/                # Admin endpoints
│   │   │   └── debug/                # Debug utilities
│   │   ├── globals.css               # Global styles
│   │   ├── layout.tsx                # Root layout
│   │   └── page.tsx                  # Homepage
│   │
│   ├── components/                   # React components
│   │   ├── ui/                       # shadcn/ui base components
│   │   ├── dashboard-layout.tsx      # Main layout component
│   │   ├── main-summary-card.tsx     # Summary display
│   │   ├── risk-summary-cards.tsx    # Risk metrics cards
│   │   ├── peg-stability-section.tsx # Peg analysis
│   │   ├── transparency-section.tsx  # Transparency analysis
│   │   ├── audit-section.tsx         # Audit display
│   │   ├── liquidity-section.tsx     # Liquidity analysis
│   │   ├── chart-components.tsx      # Chart utilities
│   │   └── search-bar.tsx            # Search interface
│   │
│   ├── lib/                          # Core libraries
│   │   ├── services/                 # Business logic services
│   │   │   ├── stablecoin-data.ts    # Main data orchestration
│   │   │   ├── coingecko.ts          # Market data integration
│   │   │   ├── geckoterminal.ts      # Liquidity analysis
│   │   │   ├── transparency.ts       # Transparency analysis
│   │   │   ├── audit-discovery.ts    # Audit discovery
│   │   │   ├── oracle-analysis.ts    # Oracle assessment
│   │   │   ├── playwright-scraper.ts # Web scraping
│   │   │   ├── hybrid-scraper.ts     # Fallback scraping
│   │   │   ├── background-processor.ts # Queue system
│   │   │   ├── cache-service.ts      # Caching utilities
│   │   │   └── enhanced-api-client.ts # HTTP client
│   │   ├── types.ts                  # TypeScript definitions
│   │   ├── cache.ts                  # Cache management
│   │   ├── rate-limit.ts             # Rate limiting
│   │   ├── metrics.ts                # Performance metrics
│   │   └── utils.ts                  # Utility functions
│   │
│   └── test/                         # Test files
│
├── tasks/                            # Task management files
├── components.json                   # shadcn/ui configuration
├── next.config.js                    # Next.js configuration
├── tailwind.config.ts                # Tailwind CSS configuration
├── tsconfig.json                     # TypeScript configuration
└── package.json                      # Dependencies and scripts
```

---

## 🔧 Core Services Architecture

### **1. StablecoinDataService (Main Orchestrator)**

**Purpose**: Central service that coordinates all data collection and analysis

**Key Features**:
- Multi-tier response system (Tier 1/2/3)
- Intelligent caching with 24h TTL
- Error handling with graceful degradation
- Performance monitoring and metrics

**Dependencies**:
- CoinGeckoService (market data)
- TransparencyService (dashboard analysis)
- AuditDiscoveryService (audit research)
- GeckoTerminalService (liquidity data)
- OracleAnalysisService (oracle assessment)

### **2. CoinGeckoService (Market Data)**

**Purpose**: Primary market data provider with fallback strategies

**Features**:
- Real-time price and market cap data
- Historical price analysis for peg stability
- Stablecoin search and identification
- API rate limiting and error handling

**Performance**: ~50ms average response time

### **3. TransparencyService (Dashboard Analysis)**

**Purpose**: Analyze stablecoin transparency through dashboard scraping

**Key Optimizations**:
- **Playwright Integration**: 100% faster than Puppeteer
- **Smart Caching**: Skip expensive analysis for recent data
- **SPA Support**: Full JavaScript rendering capability
- **Early Termination**: Stop analysis once data is found

**Supported Dashboards**:
- Custom transparency dashboards
- Proof of reserves pages
- Attestation reports
- Real-time collateralization data

### **4. AuditDiscoveryService (Audit Research)**

**Purpose**: Intelligent audit discovery with focus optimization

**Key Features**:
- **Sequential Processing**: Try GitHub first, fallback to web crawling
- **Early Termination**: Stop searching once audits are found
- **GitHub API Integration**: Fast repository analysis
- **Web Scraping Fallback**: Playwright-powered document discovery

**Performance**: 86% improvement (3000ms → 419ms average)

### **5. GeckoTerminalService (Liquidity Analysis)**

**Purpose**: Cross-chain liquidity analysis across multiple DEXs

**Coverage**:
- **Networks**: Ethereum, Solana, TON, ZkSync, Aptos, Zircuit
- **DEXs**: 14+ decentralized exchanges
- **Analysis**: Concentration risk, distribution metrics

### **6. PlaywrightScraperService (Web Scraping)**

**Purpose**: High-performance web scraping with JavaScript rendering

**Advantages over Puppeteer**:
- 100% faster execution
- Better resource management
- Enhanced stability
- Modern browser engine

**Use Cases**:
- Dynamic dashboard analysis
- SPA content extraction
- Audit document discovery
- Transparency verification

---

## 🎨 Frontend Architecture

### **Component Architecture**

```
Page Component (Server Component)
├── DashboardLayout
│   ├── SearchBar
│   └── ThemeToggle
├── MainSummaryCard
├── RiskSummaryCards
├── Conditional Sections (based on data availability)
│   ├── PegStabilitySection
│   ├── TransparencySection (if transparency data exists)
│   ├── AuditSection (if audit data exists)
│   └── LiquiditySection
└── ChartComponents (Recharts integration)
```

### **Rendering Strategy**

- **Server Components**: Default for all components
- **Client Components**: Only for interactive elements (search, theme toggle)
- **Streaming**: Progressive enhancement with Suspense boundaries
- **ISR**: 1-hour revalidation for static generation

### **State Management**

- **Server State**: React Server Components
- **Client State**: SWR for data fetching
- **URL State**: Next.js router for navigation
- **Theme State**: next-themes for dark/light mode

---

## 🚀 Performance Optimizations

### **1. Caching Strategy**

#### **Multi-Layer Caching**
```
Browser Cache (1h)
    ↓
Next.js Cache (24h)
    ↓
Redis Cache (24h)
    ↓
External APIs
```

#### **Cache Configuration**
- **TTL**: 24 hours for all stablecoin data
- **Keys**: Structured cache keys by service and ticker
- **Invalidation**: Manual admin endpoints for updates
- **Metrics**: 85% hit rate for repeated queries

### **2. Background Processing**

#### **Queue System**
- **Purpose**: Non-blocking expensive operations
- **Capacity**: Configurable worker limits (0/3 currently)
- **Priorities**: High/medium/low priority queues
- **Monitoring**: Real-time queue status and metrics

#### **Early Termination**
- **Audit Discovery**: Stop searching once results found
- **Transparency**: Skip analysis for recent mapping data
- **API Calls**: Timeout and fallback strategies

### **3. Bundle Optimization**

#### **Next.js Configuration**
- **Tree Shaking**: Optimize package imports (Recharts, Lucide)
- **Compression**: Built-in gzip compression
- **Image Optimization**: WebP/AVIF formats with 24h cache
- **Bundle Analysis**: @next/bundle-analyzer integration

#### **Code Splitting**
- **Dynamic Imports**: Lazy load heavy components
- **Route-based Splitting**: Automatic with App Router
- **Component Splitting**: Separate chart components

---

## 📊 Data Flow Architecture

### **API Request Lifecycle**

```
1. User Request
   ├── Rate Limiting Check (10/IP/day)
   ├── Cache Lookup (Redis/Next.js)
   └── If Cache Miss:
       ├── Tier 1: Basic Data (CoinGecko)
       ├── Tier 2: Risk Metrics (Multiple Services)
       └── Tier 3: Comprehensive Analysis
           ├── Transparency Service
           ├── Audit Discovery Service
           ├── Liquidity Service
           └── Oracle Analysis Service

2. Data Processing
   ├── Risk Score Calculation
   ├── Data Validation & Sanitization
   ├── Response Formatting
   └── Cache Storage (24h TTL)

3. Response Delivery
   ├── Streaming Response (if enabled)
   ├── Standard JSON Response
   └── Error Handling with Fallbacks
```

### **Error Handling Strategy**

#### **Graceful Degradation**
- **Service Failures**: Continue with available data
- **API Timeouts**: Use cached data when possible
- **Network Issues**: Show partial results with warnings

#### **Fallback Mechanisms**
- **Market Data**: CoinGecko → CoinMarketCap
- **Scraping**: Playwright → Hybrid → Basic HTTP
- **Cache**: Redis → Next.js → In-memory

---

## 🔒 Security & Reliability

### **Security Measures**

#### **API Security**
- **Rate Limiting**: 10 queries per IP per day
- **Input Validation**: Sanitize all user inputs
- **CORS**: Configured for production domains
- **Headers**: Security headers (X-Frame-Options, etc.)

#### **Data Security**
- **API Keys**: Environment variable management
- **Sanitization**: Clean all external data
- **Validation**: TypeScript interfaces for type safety

### **Reliability Features**

#### **Error Handling**
- **Timeout Management**: Configurable timeouts per service
- **Circuit Breakers**: Prevent cascade failures
- **Retry Logic**: Exponential backoff for transient errors
- **Monitoring**: Comprehensive error logging

#### **Performance Monitoring**
- **Metrics Collection**: Response times, cache hit rates
- **Health Checks**: Service availability monitoring
- **Alerting**: Performance threshold alerts

---

## 🛠️ Development & Deployment

### **Development Workflow**

#### **Local Development**
```bash
# Install dependencies
npm install
npx playwright install chromium

# Environment setup
cp .env.example .env
# Edit .env with API keys

# Start development server
npm run dev
```

#### **Build Process**
```bash
# Type checking
npm run type-check

# Production build
npm run build

# Bundle analysis
npm run analyze
```

### **Environment Configuration**

#### **Required Environment Variables**
```bash
# External APIs
GITHUB_API_KEY=              # For audit discovery
COINGECKO_API_KEY=          # For enhanced rate limits
COINMARKETCAP_API_KEY=      # For fallback data

# Caching (Production)
REDIS_URL=                   # Redis connection string

# Optional
NODE_ENV=production          # Environment mode
```

### **Deployment Architecture**

#### **Vercel Deployment**
- **Platform**: Vercel with Next.js optimization
- **Edge Functions**: API routes with global distribution
- **Analytics**: Built-in performance monitoring
- **Caching**: Vercel Edge Cache + Redis

#### **Performance Targets**
- **API Response**: < 1000ms (achieved: 253ms for USDT)
- **First Contentful Paint**: < 3s
- **Lighthouse Score**: > 70 (achieved: 75)
- **Uptime**: 99.9%

---

## 📈 Monitoring & Analytics

### **Performance Metrics**

#### **API Metrics**
- **Response Times**: Per endpoint and tier
- **Cache Hit Rates**: Redis and Next.js cache
- **Error Rates**: By service and endpoint
- **Rate Limit Usage**: Per IP tracking

#### **User Metrics**
- **Page Load Times**: Core Web Vitals
- **User Interactions**: Search queries, navigation
- **Error Tracking**: Client-side error monitoring
- **Conversion Rates**: Search to analysis completion

### **Health Monitoring**

#### **Service Health**
- **External API Status**: CoinGecko, GitHub, etc.
- **Cache Performance**: Redis connectivity and performance
- **Background Jobs**: Queue status and processing times
- **Resource Usage**: Memory, CPU, network

---

## 🔮 Future Architecture Considerations

### **Scalability Improvements**

#### **Horizontal Scaling**
- **Microservices**: Split services into separate deployments
- **Load Balancing**: Distribute API requests across instances
- **Database**: Move from cache-only to persistent storage
- **CDN**: Global content delivery for static assets

#### **Performance Enhancements**
- **Edge Computing**: Move computation closer to users
- **Real-time Updates**: WebSocket connections for live data
- **Predictive Caching**: Pre-fetch popular stablecoin data
- **ML Integration**: Intelligent risk scoring algorithms

### **Feature Expansions**

#### **Advanced Analytics**
- **Historical Trending**: Long-term risk evolution
- **Comparative Analysis**: Multi-stablecoin comparisons
- **Alert System**: Risk threshold notifications
- **API Access**: Public API for third-party integrations

#### **Enhanced Data Sources**
- **On-chain Analysis**: Direct blockchain data integration
- **News Sentiment**: Social media and news analysis
- **Regulatory Tracking**: Compliance status monitoring
- **DeFi Integration**: Protocol-specific risk metrics

---

## 📚 Technical Documentation

### **API Documentation**

#### **Main Endpoints**
- `GET /api/stablecoin/[ticker]` - Complete stablecoin analysis
- `GET /api/search?q=[query]` - Stablecoin search
- `GET /api/debug` - System health and debugging
- `POST /api/admin/update-mapping` - Manual cache invalidation

#### **Response Formats**
- **Tiered Responses**: Progressive data enhancement
- **Error Responses**: Consistent error formatting
- **Streaming**: Real-time data delivery option

### **Component Documentation**

#### **Key Components**
- **DashboardLayout**: Main page structure and navigation
- **MainSummaryCard**: Risk score display and overview
- **RiskSummaryCards**: Individual risk factor cards
- **Chart Components**: Recharts integration utilities
- **Conditional Rendering**: Data-driven section display

---

This technical architecture document provides a comprehensive overview of the StableRisk application's design, implementation, and operational characteristics. The architecture emphasizes performance, reliability, and maintainability while supporting the application's core mission of providing fast, accurate stablecoin risk assessment.
