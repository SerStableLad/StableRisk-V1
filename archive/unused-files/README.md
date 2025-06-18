# Archived Unused Files

This directory contains files that were identified as unused in the StableRisk codebase and moved here for archival purposes.

## Archive Date
**Moved on:** $(date)

## File Categories

### API Routes (`api-routes/`)
Development and testing API endpoints that are not used in production:
- `test-*` - Various test endpoints for development/debugging
- `debug/` - Debug API endpoint
- `metrics/` - Metrics endpoint (if existed)

### Services (`services/`)
Service files that are no longer actively used:
- `ultra-fast-scraper.ts` - Alternative scraper implementation
- `fast-scraper.ts` - Alternative scraper implementation  
- `enhanced-api-client.ts` - Enhanced API client (only used in examples)
- `parallel-data-service.ts` - Parallel data processing service
- `background-processor.ts` - Background processing service
- `web-discovery.ts` - Web discovery service
- `oracle-analysis.ts` - Oracle analysis service (feature disabled)
- `tier3-integration-example.ts` - Example integration file
- `hybrid-scraper.ts` - Hybrid scraper implementation

### Components (`components/`)
UI components that are no longer used:
- `oracle-section.tsx` - Oracle section component (feature disabled)

### Configuration (`config/`)
Configuration files that are examples or unused:
- `config.example.ts` - Example configuration file

## Restoration
If any of these files are needed in the future, they can be moved back to their original locations in the `src/` directory.

## Current Active Architecture
The main production codebase now uses:
- **API Routes:** `/api/stablecoin/[ticker]`, `/api/search`, `/api/admin/update-mapping`
- **Core Services:** `stablecoin-data.ts`, `coingecko.ts`, `coinmarketcap.ts`, `transparency.ts`, `geckoterminal.ts`, `audit-discovery.ts`, `playwright-scraper.ts`
- **Active Components:** All components except `oracle-section.tsx`

## Performance Impact
Removing these files should improve:
- Build times
- Bundle size
- Code maintainability
- Development clarity 