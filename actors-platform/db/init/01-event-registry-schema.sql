-- Event Registry Database Schema
-- This schema manages the global event catalog for the actor system

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Core event definitions table
CREATE TABLE IF NOT EXISTS event_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) UNIQUE NOT NULL,
  category VARCHAR(50) NOT NULL CHECK (category IN ('command', 'query', 'notification')),
  description TEXT,
  payload_schema JSONB NOT NULL, -- JSON Schema for validation
  producer_actor VARCHAR(255) NOT NULL,
  version INTEGER DEFAULT 1,
  deprecated BOOLEAN DEFAULT FALSE,
  replaced_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Indexes for common queries
  INDEX idx_event_name (name),
  INDEX idx_producer (producer_actor),
  INDEX idx_category (category),
  INDEX idx_deprecated (deprecated)
);

-- Event consumers mapping table
CREATE TABLE IF NOT EXISTS event_consumers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name VARCHAR(255) NOT NULL,
  consumer_actor VARCHAR(255) NOT NULL,
  required BOOLEAN DEFAULT TRUE,
  filter_expression JSONB, -- Optional filter for conditional consumption
  added_at TIMESTAMP DEFAULT NOW(),
  
  -- Foreign key and constraints
  FOREIGN KEY (event_name) REFERENCES event_definitions(name) ON DELETE CASCADE,
  UNIQUE(event_name, consumer_actor),
  
  -- Indexes
  INDEX idx_event_consumers (event_name),
  INDEX idx_consumer_actor (consumer_actor)
);

-- Event metadata and tags
CREATE TABLE IF NOT EXISTS event_metadata (
  event_name VARCHAR(255) NOT NULL,
  key VARCHAR(255) NOT NULL,
  value TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Constraints
  PRIMARY KEY(event_name, key),
  FOREIGN KEY (event_name) REFERENCES event_definitions(name) ON DELETE CASCADE,
  
  -- Index
  INDEX idx_metadata_event (event_name)
);

-- Event usage metrics table
CREATE TABLE IF NOT EXISTS event_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name VARCHAR(255) NOT NULL,
  actor_id VARCHAR(255) NOT NULL,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('produced', 'consumed')),
  success BOOLEAN NOT NULL,
  timestamp TIMESTAMP DEFAULT NOW(),
  duration_ms INTEGER,
  error_message TEXT,
  correlation_id VARCHAR(255),
  
  -- Foreign key
  FOREIGN KEY (event_name) REFERENCES event_definitions(name) ON DELETE CASCADE,
  
  -- Indexes for querying metrics
  INDEX idx_metrics_event (event_name),
  INDEX idx_metrics_actor (actor_id),
  INDEX idx_metrics_timestamp (timestamp),
  INDEX idx_metrics_correlation (correlation_id)
);

-- Event schema versions for migration support
CREATE TABLE IF NOT EXISTS event_schema_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name VARCHAR(255) NOT NULL,
  version INTEGER NOT NULL,
  payload_schema JSONB NOT NULL,
  migration_script TEXT, -- SQL or code to migrate from previous version
  breaking_change BOOLEAN DEFAULT FALSE,
  change_description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR(255),
  
  -- Constraints
  UNIQUE(event_name, version),
  FOREIGN KEY (event_name) REFERENCES event_definitions(name) ON DELETE CASCADE,
  
  -- Indexes
  INDEX idx_schema_versions_event (event_name),
  INDEX idx_schema_versions_version (version)
);

-- Actor manifest table - tracks what each actor produces/consumes
CREATE TABLE IF NOT EXISTS actor_manifests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_name VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  version VARCHAR(50),
  health_endpoint VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Index
  INDEX idx_actor_name (actor_name)
);

-- Event dependencies - tracks which events trigger other events
CREATE TABLE IF NOT EXISTS event_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_event VARCHAR(255) NOT NULL,
  target_event VARCHAR(255) NOT NULL,
  dependency_type VARCHAR(50) CHECK (dependency_type IN ('triggers', 'requires', 'optional')),
  description TEXT,
  
  -- Foreign keys
  FOREIGN KEY (source_event) REFERENCES event_definitions(name) ON DELETE CASCADE,
  FOREIGN KEY (target_event) REFERENCES event_definitions(name) ON DELETE CASCADE,
  
  -- Constraints
  UNIQUE(source_event, target_event),
  CHECK (source_event != target_event),
  
  -- Indexes
  INDEX idx_dep_source (source_event),
  INDEX idx_dep_target (target_event)
);

-- Audit log for event definition changes
CREATE TABLE IF NOT EXISTS event_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name VARCHAR(255),
  action VARCHAR(50) NOT NULL CHECK (action IN ('created', 'updated', 'deprecated', 'deleted')),
  old_value JSONB,
  new_value JSONB,
  changed_by VARCHAR(255),
  change_reason TEXT,
  timestamp TIMESTAMP DEFAULT NOW(),
  
  -- Index
  INDEX idx_audit_event (event_name),
  INDEX idx_audit_timestamp (timestamp)
);

-- Create update trigger for event_definitions
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_event_definitions_updated_at 
  BEFORE UPDATE ON event_definitions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_actor_manifests_updated_at 
  BEFORE UPDATE ON actor_manifests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to get all consumers for an event (including dependency chains)
CREATE OR REPLACE FUNCTION get_event_consumers(event_name_param VARCHAR)
RETURNS TABLE(consumer_actor VARCHAR, consumer_type VARCHAR) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE event_chain AS (
    -- Direct consumers
    SELECT 
      ec.consumer_actor,
      'direct'::VARCHAR as consumer_type
    FROM event_consumers ec
    WHERE ec.event_name = event_name_param
    
    UNION
    
    -- Consumers through dependencies
    SELECT 
      ec2.consumer_actor,
      'indirect'::VARCHAR as consumer_type
    FROM event_dependencies ed
    JOIN event_consumers ec2 ON ec2.event_name = ed.target_event
    JOIN event_chain ON event_chain.consumer_actor = ed.source_event
    WHERE ed.dependency_type = 'triggers'
  )
  SELECT DISTINCT * FROM event_chain;
END;
$$ LANGUAGE plpgsql;

-- Function to validate event payload against schema
CREATE OR REPLACE FUNCTION validate_event_payload(
  event_name_param VARCHAR,
  payload_param JSONB
) RETURNS BOOLEAN AS $$
DECLARE
  schema JSONB;
BEGIN
  SELECT payload_schema INTO schema
  FROM event_definitions
  WHERE name = event_name_param;
  
  -- This is a placeholder - actual JSON Schema validation would require
  -- a proper extension like pg_jsonschema
  -- For now, just check that payload is not null
  RETURN payload_param IS NOT NULL;
END;
$$ LANGUAGE plpgsql;

-- View for event catalog overview
CREATE OR REPLACE VIEW event_catalog_view AS
SELECT 
  ed.name,
  ed.category,
  ed.description,
  ed.producer_actor,
  ed.version,
  ed.deprecated,
  ed.replaced_by,
  COUNT(DISTINCT ec.consumer_actor) as consumer_count,
  COUNT(DISTINCT em.id) FILTER (WHERE em.direction = 'produced' AND em.timestamp > NOW() - INTERVAL '24 hours') as produced_last_24h,
  COUNT(DISTINCT em.id) FILTER (WHERE em.direction = 'consumed' AND em.timestamp > NOW() - INTERVAL '24 hours') as consumed_last_24h
FROM event_definitions ed
LEFT JOIN event_consumers ec ON ec.event_name = ed.name
LEFT JOIN event_metrics em ON em.event_name = ed.name
GROUP BY ed.id, ed.name, ed.category, ed.description, ed.producer_actor, ed.version, ed.deprecated, ed.replaced_by;

-- View for actor dependencies
CREATE OR REPLACE VIEW actor_dependencies_view AS
WITH producer_consumer AS (
  SELECT 
    ed.producer_actor as source_actor,
    ec.consumer_actor as target_actor,
    ed.name as event_name,
    ed.category
  FROM event_definitions ed
  JOIN event_consumers ec ON ec.event_name = ed.name
)
SELECT 
  source_actor,
  target_actor,
  COUNT(DISTINCT event_name) as event_count,
  STRING_AGG(DISTINCT event_name, ', ') as events
FROM producer_consumer
GROUP BY source_actor, target_actor;

-- Initial data: Core system events
INSERT INTO event_definitions (name, category, description, payload_schema, producer_actor) VALUES
  ('SYSTEM_STARTED', 'notification', 'System startup event', '{"type": "object", "properties": {"timestamp": {"type": "number"}}}', 'system'),
  ('SYSTEM_SHUTDOWN', 'notification', 'System shutdown event', '{"type": "object", "properties": {"timestamp": {"type": "number"}}}', 'system'),
  ('ACTOR_REGISTERED', 'notification', 'Actor registered with the system', '{"type": "object", "properties": {"actorName": {"type": "string"}, "version": {"type": "string"}}}', 'system'),
  ('ACTOR_UNREGISTERED', 'notification', 'Actor unregistered from the system', '{"type": "object", "properties": {"actorName": {"type": "string"}}}', 'system')
ON CONFLICT (name) DO NOTHING;

-- Grant permissions (adjust based on your user setup)
-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly_user;
-- GRANT ALL ON ALL TABLES IN SCHEMA public TO app_user;
-- GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_user;