# StableRisk Docker Setup

Complete Docker containerization for the StableRisk platform with PostgreSQL and Redis support.

## 🚀 Quick Start

### Prerequisites
- Docker and Docker Compose installed
- Copy `env.example` to `.env` and update with your API keys

### Development Setup (Recommended)

```bash
# Copy environment template
cp env.example .env

# Edit .env with your actual API keys
# nano .env

# Build and start development environment
docker-compose -f docker-compose.dev.yml up --build

# Access the application
# API: http://localhost:8000
# API Docs: http://localhost:8000/docs
# PostgreSQL: localhost:5432
# Redis: localhost:6379
```

### Production Setup

```bash
# Build and start production environment
docker-compose up --build -d

# Access services
# API: http://localhost:8000
# Flower (Celery monitoring): http://localhost:5555
```

## 📦 Services Overview

### Backend API (`stablerisk-backend`)
- **Port**: 8000
- **Framework**: FastAPI with Uvicorn
- **Features**: 
  - Selenium support with Chrome/ChromeDriver
  - Health checks
  - Rate limiting configured
  - Non-root user for security

### PostgreSQL Database (`stablerisk-postgres`)
- **Port**: 5432
- **Version**: PostgreSQL 15 Alpine
- **Database**: `stablerisk_db`
- **User**: `stablerisk`

### Redis Cache (`stablerisk-redis`)
- **Port**: 6379
- **Version**: Redis 7 Alpine
- **Persistence**: AOF enabled

### Celery Worker (`celery-worker`)
- Background task processing
- Depends on PostgreSQL and Redis

### Flower (`flower`)
- **Port**: 5555
- Celery task monitoring interface

## 🧪 Testing

The test suite is organized in the `tests/` directory:

```bash
tests/
├── __init__.py                    # Test package initialization
├── test_apis.py                   # API connection and external service tests
├── test_enhanced_liquidity.py     # Comprehensive liquidity analysis tests
└── test_phase2_functionality.py  # Phase 2 feature validation tests
```

### Running Tests

```bash
# Run API connection tests
python tests/test_apis.py

# Run enhanced liquidity framework tests
python tests/test_enhanced_liquidity.py

# Run Phase 2 functionality tests
python tests/test_phase2_functionality.py

# Run tests in Docker environment
docker-compose exec backend python tests/test_apis.py
```

### Test Coverage

- **API Tests**: Validates connectivity to CoinGecko, GitHub, DeFiLlama, GeckoTerminal
- **Liquidity Tests**: Tests comprehensive multi-chain analysis and scoring
- **Phase 2 Tests**: Validates ticker search, metadata retrieval, and price analysis

## 🔧 Configuration

### Environment Variables

Update your `.env` file with:

```bash
# Database
DATABASE_URL=postgresql://stablerisk:stablerisk123@postgres:5432/stablerisk_db
REDIS_URL=redis://redis:6379

# API Keys (REQUIRED)
COINGECKO_API_KEY=your_actual_key
GITHUB_TOKEN=your_actual_token
OPENAI_API_KEY=your_actual_key

# App Settings
DEBUG=true
LOG_LEVEL=INFO
```

### Rate Limiting
- CoinGecko: 10 requests/minute (configured)
- GitHub: 5000 requests/hour (configured)
- All APIs include rate limiting as per user rules

## 🛠️ Development Commands

```bash
# Start development environment (with hot reload)
docker-compose -f docker-compose.dev.yml up

# View logs
docker-compose logs -f backend

# Execute commands in container
docker-compose exec backend bash

# Stop all services
docker-compose down

# Rebuild after changes
docker-compose up --build
```

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   StableRisk    │    │   PostgreSQL    │    │     Redis       │
│     Backend     │◄──►│    Database     │    │     Cache       │
│   (FastAPI)     │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │
         ▼
┌─────────────────┐    ┌─────────────────┐
│ Celery Worker   │    │     Flower      │
│ (Background)    │    │  (Monitoring)   │
└─────────────────┘    └─────────────────┘
```

## 🔍 Health Checks

- **Backend**: `GET /health` - Comprehensive API status
- **Docker**: Built-in health checks for all services
- **Database**: Connection validation included

## 📊 Monitoring

- **Application**: Flower UI at http://localhost:5555
- **Logs**: `docker-compose logs -f [service_name]`
- **Metrics**: Health check endpoints configured

## 🔒 Security Features

- Non-root user in containers
- Environment variable isolation
- Network isolation with Docker networks
- API rate limiting implemented

## 🐛 Troubleshooting

### Common Issues

1. **Port conflicts**: Ensure ports 8000, 5432, 6379, 5555 are available
2. **API keys**: Verify all required keys are set in `.env`
3. **Chrome/Selenium**: Issues resolved with pre-installed Chrome in container

### Reset Everything

```bash
# Stop and remove all containers, networks, volumes
docker-compose down -v
docker system prune -f

# Rebuild from scratch
docker-compose up --build
```

## 📝 Notes

- Follows user rules for clean, minimal Docker setup
- `.env` properly excluded from version control
- Rate limiting configured for all external APIs
- Ready for both development and production use 