-- Initialize StableRisk PostgreSQL Database
-- This script creates the initial schema for events, analytics, and cache metadata

-- Create schemas
CREATE SCHEMA IF NOT EXISTS events;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS cache_metadata;

-- Event sourcing table for tracking all system events
CREATE TABLE events.event_log (
    id BIGSERIAL PRIMARY KEY,
    aggregate_id VARCHAR(255) NOT NULL,
    aggregate_type VARCHAR(100) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    version INTEGER NOT NULL
);

-- Analytics aggregates for stablecoin metrics
CREATE TABLE analytics.stablecoin_metrics (
    ticker VARCHAR(10) PRIMARY KEY,
    last_updated TIMESTAMP WITH TIME ZONE,
    risk_score DECIMAL(5,2),
    transparency_score DECIMAL(5,2),
    liquidity_score DECIMAL(5,2),
    audit_score DECIMAL(5,2),
    metadata JSONB
);

-- Cache invalidation tracking
CREATE TABLE cache_metadata.invalidation_log (
    id BIGSERIAL PRIMARY KEY,
    cache_key VARCHAR(500) NOT NULL,
    invalidated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reason VARCHAR(255),
    related_ticker VARCHAR(10)
);

-- Performance indexes
CREATE INDEX idx_event_log_aggregate ON events.event_log(aggregate_id, aggregate_type);
CREATE INDEX idx_event_log_created_at ON events.event_log(created_at);
CREATE INDEX idx_event_log_type ON events.event_log(event_type);
CREATE INDEX idx_metrics_last_updated ON analytics.stablecoin_metrics(last_updated);
CREATE INDEX idx_invalidation_ticker ON cache_metadata.invalidation_log(related_ticker);
CREATE INDEX idx_invalidation_cache_key ON cache_metadata.invalidation_log(cache_key);

-- Grant permissions to application user
GRANT USAGE ON SCHEMA events TO PUBLIC;
GRANT USAGE ON SCHEMA analytics TO PUBLIC;
GRANT USAGE ON SCHEMA cache_metadata TO PUBLIC;
GRANT ALL ON ALL TABLES IN SCHEMA events TO PUBLIC;
GRANT ALL ON ALL TABLES IN SCHEMA analytics TO PUBLIC;
GRANT ALL ON ALL TABLES IN SCHEMA cache_metadata TO PUBLIC;
GRANT ALL ON ALL SEQUENCES IN SCHEMA events TO PUBLIC;
GRANT ALL ON ALL SEQUENCES IN SCHEMA analytics TO PUBLIC;
GRANT ALL ON ALL SEQUENCES IN SCHEMA cache_metadata TO PUBLIC;