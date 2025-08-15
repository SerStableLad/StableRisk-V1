-- Metrics Service Database Schema
-- Create metrics schema for organizing metrics data

CREATE SCHEMA IF NOT EXISTS metrics;

-- Drop tables if they exist (for clean reinstall)
DROP TABLE IF EXISTS metrics.metric_data CASCADE;

-- Metrics data table
CREATE TABLE metrics.metric_data (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    value DOUBLE PRECISION NOT NULL,
    labels JSONB DEFAULT '{}',
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Performance indexes
CREATE INDEX idx_metric_data_name ON metrics.metric_data(name);
CREATE INDEX idx_metric_data_recorded_at ON metrics.metric_data(recorded_at);
CREATE INDEX idx_metric_data_name_recorded_at ON metrics.metric_data(name, recorded_at);
CREATE INDEX idx_metric_data_labels ON metrics.metric_data USING GIN(labels);

-- Composite index for time-based queries with labels
CREATE INDEX idx_metric_data_name_recorded_labels ON metrics.metric_data(name, recorded_at) INCLUDE (labels);

-- Add constraints
ALTER TABLE metrics.metric_data 
ADD CONSTRAINT chk_metric_name_not_empty CHECK (LENGTH(TRIM(name)) > 0);

-- Create a function for efficient cleanup
CREATE OR REPLACE FUNCTION metrics.cleanup_old_metrics(retention_days INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM metrics.metric_data 
    WHERE recorded_at < NOW() - INTERVAL '1 day' * retention_days;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create a view for recent metrics summary
CREATE OR REPLACE VIEW metrics.recent_summary AS
SELECT 
    name,
    COUNT(*) as total_records,
    AVG(value) as avg_value,
    MIN(value) as min_value,
    MAX(value) as max_value,
    STDDEV(value) as stddev_value,
    MAX(recorded_at) as last_recorded,
    MIN(recorded_at) as first_recorded
FROM metrics.metric_data
WHERE recorded_at >= NOW() - INTERVAL '24 hours'
GROUP BY name
ORDER BY total_records DESC;

-- Grant permissions (adjust as needed for your setup)
-- GRANT USAGE ON SCHEMA metrics TO metrics_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA metrics TO metrics_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA metrics TO metrics_user;

-- Optional: Create partitioned table for high volume (uncomment if needed)
/*
-- Drop existing table first
-- DROP TABLE metrics.metric_data CASCADE;

-- Create partitioned table
CREATE TABLE metrics.metric_data (
    id BIGSERIAL,
    name VARCHAR(255) NOT NULL,
    value DOUBLE PRECISION NOT NULL,
    labels JSONB DEFAULT '{}',
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
) PARTITION BY RANGE (recorded_at);

-- Create monthly partitions (example for 2024)
CREATE TABLE metrics.metric_data_2024_01 PARTITION OF metrics.metric_data
FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

CREATE TABLE metrics.metric_data_2024_02 PARTITION OF metrics.metric_data
FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');

-- Add more partitions as needed...

-- Create indexes on partitioned table
CREATE INDEX ON metrics.metric_data (name);
CREATE INDEX ON metrics.metric_data (recorded_at);
CREATE INDEX ON metrics.metric_data USING GIN(labels);
*/