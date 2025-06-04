# StableRisk Tech Stack

## 🚀 Backend Stack

### Core Framework
- **Python 3.11+** - Main backend language
- **FastAPI** - Modern, fast web framework for building APIs
- **Pydantic** - Data validation and settings management
- **SQLAlchemy** - ORM for database operations
- **PostgreSQL** - Primary database for storing risk scores and cached data
- **Redis** - Caching layer for API responses and rate limiting

### Data Processing & AI
- **aiohttp** - Async HTTP client for API calls
- **BeautifulSoup4 + lxml** - Web scraping for transparency data
- **Selenium** - For dynamic content scraping when needed
- **OpenAI API** - For AI-powered content analysis and extraction
- **pandas** - Data analysis and manipulation
- **numpy** - Numerical computations for risk scoring

### Background Tasks & Scheduling
- **Celery** - Distributed task queue for data pipeline
- **Redis** - Message broker for Celery
- **APScheduler** - Cron-like scheduler for daily data updates

### API Integration
- **httpx** - Modern HTTP client for API calls
- **python-github** - GitHub API integration
- **requests** - Fallback HTTP client

## 🌐 Frontend Stack

### Core Framework
- **Next.js 14** - React-based full-stack framework
- **TypeScript** - Type-safe JavaScript
- **Tailwind CSS** - Utility-first CSS framework
- **shadcn/ui** - Modern UI components
- **React Query (TanStack Query)** - Data fetching and caching

### Visualization
- **Chart.js / Recharts** - Interactive charts for risk visualization
- **D3.js** - Custom data visualizations if needed
- **Framer Motion** - Smooth animations

### State Management
- **Zustand** - Lightweight state management
- **React Hook Form** - Form handling

## 🗄️ Database Schema

### Tables
- `stablecoins` - Basic coin metadata
- `risk_scores` - Historical risk assessments
- `price_history` - Cached price data for peg analysis
- `audit_data` - Extracted audit information
- `liquidity_data` - Cross-chain liquidity metrics
- `api_usage` - Rate limiting tracking

## 🔧 DevOps & Infrastructure

### Development
- **Docker & Docker Compose** - Containerization
- **Poetry** - Python dependency management
- **pytest** - Testing framework
- **Black + isort** - Code formatting
- **mypy** - Type checking

### Deployment
- **Railway/Vercel** - Hosting platforms
- **GitHub Actions** - CI/CD pipeline
- **Sentry** - Error monitoring
- **Uptime Robot** - Service monitoring

## 🔐 Security & Rate Limiting

### Authentication & Security
- **Environment Variables** - Secure API key storage
- **CORS middleware** - Cross-origin resource sharing
- **Rate limiting middleware** - IP-based request throttling
- **Input validation** - Pydantic models for all inputs

### API Keys Management
- **python-dotenv** - Environment variable loading
- **Vault/Environment-based** - Secure credential storage

## 📊 Data Pipeline Architecture

1. **Scheduler** triggers daily data collection
2. **Celery workers** process individual coins
3. **API clients** fetch data from multiple sources
4. **AI agents** analyze and extract insights
5. **Risk engine** calculates scores
6. **Cache layer** stores results for 24 hours
7. **API endpoints** serve cached data to frontend

## 🧪 Testing Strategy

- **Unit Tests** - Individual component testing
- **Integration Tests** - API endpoint testing
- **E2E Tests** - Full user flow testing
- **Performance Tests** - Load testing for rate limits

---

*This tech stack is designed for scalability, maintainability, and efficient data processing while handling the complex multi-source data requirements of StableRisk.* 