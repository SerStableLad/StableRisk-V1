-- Background Jobs Service Database Schema
-- Initialize database tables for job persistence and monitoring

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Job results table for storing completed job outputs
CREATE TABLE IF NOT EXISTS job_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id VARCHAR(255) UNIQUE NOT NULL,
    job_type VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL,
    result JSONB,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    processing_time_ms INTEGER,
    cost DECIMAL(10, 4) DEFAULT 0.0,
    INDEX idx_job_results_job_id (job_id),
    INDEX idx_job_results_type_status (job_type, status),
    INDEX idx_job_results_created_at (created_at),
    INDEX idx_job_results_completed_at (completed_at)
);

-- Job metrics table for analytics and monitoring
CREATE TABLE IF NOT EXISTS job_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_type VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL,
    count INTEGER NOT NULL DEFAULT 1,
    total_processing_time_ms BIGINT DEFAULT 0,
    total_cost DECIMAL(12, 4) DEFAULT 0.0,
    avg_processing_time_ms INTEGER GENERATED ALWAYS AS (
        CASE WHEN count > 0 THEN (total_processing_time_ms / count)::INTEGER ELSE 0 END
    ) STORED,
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(job_type, status, period_start, period_end),
    INDEX idx_job_metrics_type (job_type),
    INDEX idx_job_metrics_status (status),
    INDEX idx_job_metrics_period (period_start, period_end)
);

-- System health logs table
CREATE TABLE IF NOT EXISTS health_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    component VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL,
    details JSONB,
    response_time_ms INTEGER,
    checked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_health_logs_component (component),
    INDEX idx_health_logs_status (status),
    INDEX idx_health_logs_checked_at (checked_at)
);

-- Worker activity logs table
CREATE TABLE IF NOT EXISTS worker_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    worker_id INTEGER NOT NULL,
    action VARCHAR(50) NOT NULL,
    job_id VARCHAR(255),
    job_type VARCHAR(100),
    details JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_worker_logs_worker_id (worker_id),
    INDEX idx_worker_logs_action (action),
    INDEX idx_worker_logs_timestamp (timestamp)
);

-- API request logs table for rate limiting and monitoring
CREATE TABLE IF NOT EXISTS api_request_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    correlation_id VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    path VARCHAR(500) NOT NULL,
    status_code INTEGER NOT NULL,
    response_time_ms INTEGER NOT NULL,
    client_ip INET,
    user_agent TEXT,
    api_key_hash VARCHAR(255), -- Hashed API key for identification
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_api_logs_correlation_id (correlation_id),
    INDEX idx_api_logs_path_method (path, method),
    INDEX idx_api_logs_status_code (status_code),
    INDEX idx_api_logs_created_at (created_at),
    INDEX idx_api_logs_client_ip (client_ip)
);

-- Queue statistics snapshots table
CREATE TABLE IF NOT EXISTS queue_stats_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pending_jobs INTEGER NOT NULL DEFAULT 0,
    processing_jobs INTEGER NOT NULL DEFAULT 0,
    delayed_jobs INTEGER NOT NULL DEFAULT 0,
    completed_jobs INTEGER NOT NULL DEFAULT 0,
    failed_jobs INTEGER NOT NULL DEFAULT 0,
    cancelled_jobs INTEGER NOT NULL DEFAULT 0,
    total_jobs INTEGER NOT NULL DEFAULT 0,
    processing_rate DECIMAL(8, 2) DEFAULT 0.0, -- jobs per minute
    error_rate DECIMAL(5, 2) DEFAULT 0.0, -- percentage
    active_workers INTEGER DEFAULT 0,
    snapshot_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_queue_stats_snapshot_at (snapshot_at)
);

-- Configuration settings table
CREATE TABLE IF NOT EXISTS service_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    config_key VARCHAR(255) UNIQUE NOT NULL,
    config_value JSONB NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_service_config_key (config_key)
);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at trigger to relevant tables
CREATE TRIGGER update_job_metrics_updated_at 
    BEFORE UPDATE ON job_metrics 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_service_config_updated_at 
    BEFORE UPDATE ON service_config 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default configuration
INSERT INTO service_config (config_key, config_value, description) 
VALUES 
    ('rate_limits', '{"job_submission": 100, "bulk_submission": 10, "admin_operations": 20, "general_api": 1000}', 'Rate limiting configuration per minute'),
    ('job_retention', '{"completed": "7d", "failed": "30d", "cancelled": "3d"}', 'Job retention policies'),
    ('worker_scaling', '{"min_workers": 1, "max_workers": 10, "scale_threshold": 50}', 'Worker auto-scaling configuration'),
    ('monitoring', '{"health_check_interval": 30, "metrics_collection_interval": 60}', 'Monitoring configuration'),
    ('alerts', '{"error_rate_threshold": 25.0, "response_time_threshold": 5000, "queue_size_threshold": 1000}', 'Alert thresholds')
ON CONFLICT (config_key) DO NOTHING;

-- Create views for common queries

-- Job summary view
CREATE OR REPLACE VIEW job_summary AS
SELECT 
    job_type,
    status,
    COUNT(*) as count,
    AVG(processing_time_ms) as avg_processing_time_ms,
    MIN(processing_time_ms) as min_processing_time_ms,
    MAX(processing_time_ms) as max_processing_time_ms,
    SUM(cost) as total_cost,
    MIN(created_at) as first_job_at,
    MAX(completed_at) as last_completed_at
FROM job_results 
WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'
GROUP BY job_type, status;

-- Hourly metrics view
CREATE OR REPLACE VIEW hourly_job_metrics AS
SELECT 
    date_trunc('hour', created_at) as hour,
    job_type,
    status,
    COUNT(*) as job_count,
    AVG(processing_time_ms) as avg_processing_time,
    SUM(cost) as total_cost
FROM job_results
WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
GROUP BY date_trunc('hour', created_at), job_type, status
ORDER BY hour DESC, job_type, status;

-- System health summary view
CREATE OR REPLACE VIEW system_health_summary AS
SELECT 
    component,
    status,
    COUNT(*) as check_count,
    AVG(response_time_ms) as avg_response_time_ms,
    MAX(checked_at) as last_check_at,
    MIN(checked_at) as first_check_at
FROM health_logs
WHERE checked_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'
GROUP BY component, status;

-- API performance view
CREATE OR REPLACE VIEW api_performance_summary AS
SELECT 
    path,
    method,
    COUNT(*) as request_count,
    AVG(response_time_ms) as avg_response_time_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms) as p95_response_time_ms,
    COUNT(*) FILTER (WHERE status_code >= 400) as error_count,
    COUNT(*) FILTER (WHERE status_code >= 400) * 100.0 / COUNT(*) as error_rate_percent
FROM api_request_logs
WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'
GROUP BY path, method
ORDER BY request_count DESC;

-- Grant permissions (adjust as needed for your security requirements)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bg_jobs_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO bg_jobs_user;

-- Create cleanup function for old records
CREATE OR REPLACE FUNCTION cleanup_old_records()
RETURNS void AS $$
BEGIN
    -- Clean up old completed job results (keep for 7 days)
    DELETE FROM job_results 
    WHERE status = 'completed' 
    AND completed_at < CURRENT_TIMESTAMP - INTERVAL '7 days';
    
    -- Clean up old failed job results (keep for 30 days)
    DELETE FROM job_results 
    WHERE status = 'failed' 
    AND created_at < CURRENT_TIMESTAMP - INTERVAL '30 days';
    
    -- Clean up old health logs (keep for 24 hours)
    DELETE FROM health_logs 
    WHERE checked_at < CURRENT_TIMESTAMP - INTERVAL '24 hours';
    
    -- Clean up old API request logs (keep for 7 days)
    DELETE FROM api_request_logs 
    WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '7 days';
    
    -- Clean up old worker logs (keep for 3 days)
    DELETE FROM worker_logs 
    WHERE timestamp < CURRENT_TIMESTAMP - INTERVAL '3 days';
    
    -- Clean up old queue stats snapshots (keep for 30 days)
    DELETE FROM queue_stats_snapshots 
    WHERE snapshot_at < CURRENT_TIMESTAMP - INTERVAL '30 days';
    
    -- Vacuum tables to reclaim space
    VACUUM ANALYZE job_results, health_logs, api_request_logs, worker_logs, queue_stats_snapshots;
END;
$$ LANGUAGE plpgsql;

-- Create indexes for better performance on large datasets
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_results_status_created_at 
    ON job_results(status, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_api_request_logs_path_created_at 
    ON api_request_logs(path, created_at DESC);

-- Insert sample data for testing (optional)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM job_results LIMIT 1) THEN
        -- Insert some sample job results for testing
        INSERT INTO job_results (job_id, job_type, status, result, processing_time_ms, cost, completed_at)
        VALUES 
            ('test_job_1', 'collect-stablecoin-data', 'completed', '{"ticker": "USDC", "data": {"price": 1.00}}', 1500, 0.01, CURRENT_TIMESTAMP - INTERVAL '1 hour'),
            ('test_job_2', 'analyze-transparency', 'completed', '{"score": 85}', 3200, 0.05, CURRENT_TIMESTAMP - INTERVAL '30 minutes'),
            ('test_job_3', 'collect-stablecoin-data', 'failed', null, 2100, 0.02, CURRENT_TIMESTAMP - INTERVAL '15 minutes');
        
        -- Insert sample health check
        INSERT INTO health_logs (component, status, response_time_ms)
        VALUES 
            ('redis', 'healthy', 5),
            ('database', 'healthy', 12),
            ('queue', 'healthy', 8);
    END IF;
END $$;