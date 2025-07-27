-- Event Catalog Schema for Relay Methodology
-- This is the source of truth for all system events

-- Core event definitions table
CREATE TABLE IF NOT EXISTS event_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_name VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    producer_actor VARCHAR(100) NOT NULL,
    schema_version VARCHAR(20) NOT NULL DEFAULT '1.0.0',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_event_name CHECK (event_name ~ '^[A-Z_]+$')
);

-- Event consumers mapping
CREATE TABLE IF NOT EXISTS event_consumers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES event_definitions(id) ON DELETE CASCADE,
    consumer_actor VARCHAR(100) NOT NULL,
    pattern VARCHAR(20) NOT NULL CHECK (pattern IN ('ask', 'tell', 'publish')),
    timeout_ms INTEGER DEFAULT 5000,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(event_id, consumer_actor)
);

-- Event payload schema definition
CREATE TABLE IF NOT EXISTS event_payload_schema (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES event_definitions(id) ON DELETE CASCADE,
    field_name VARCHAR(255) NOT NULL,
    field_type VARCHAR(100) NOT NULL,
    required BOOLEAN DEFAULT true,
    description TEXT,
    validation_rules JSONB,
    field_order INTEGER DEFAULT 0,
    UNIQUE(event_id, field_name)
);

-- System flows for tracking event chains
CREATE TABLE IF NOT EXISTS system_flows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_name VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Flow steps linking events in sequence
CREATE TABLE IF NOT EXISTS flow_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_id UUID REFERENCES system_flows(id) ON DELETE CASCADE,
    step_number INTEGER NOT NULL,
    event_id UUID REFERENCES event_definitions(id),
    description TEXT,
    UNIQUE(flow_id, step_number)
);

-- Create indexes for performance
CREATE INDEX idx_event_definitions_name ON event_definitions(event_name);
CREATE INDEX idx_event_consumers_event_id ON event_consumers(event_id);
CREATE INDEX idx_event_consumers_actor ON event_consumers(consumer_actor);
CREATE INDEX idx_event_payload_event_id ON event_payload_schema(event_id);
CREATE INDEX idx_flow_steps_flow_id ON flow_steps(flow_id);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_event_definitions_updated_at BEFORE UPDATE
    ON event_definitions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create comprehensive view for event catalog
CREATE OR REPLACE VIEW event_catalog AS
SELECT 
    ed.event_name,
    ed.description,
    ed.producer_actor,
    ed.schema_version,
    COALESCE(
        ARRAY_AGG(
            DISTINCT jsonb_build_object(
                'actor', ec.consumer_actor,
                'pattern', ec.pattern,
                'timeout_ms', ec.timeout_ms
            )
        ) FILTER (WHERE ec.consumer_actor IS NOT NULL),
        ARRAY[]::jsonb[]
    ) AS consumers,
    COALESCE(
        JSON_OBJECT_AGG(
            eps.field_name, 
            JSON_BUILD_OBJECT(
                'type', eps.field_type,
                'required', eps.required,
                'description', eps.description,
                'validation', eps.validation_rules
            )
            ORDER BY eps.field_order
        ) FILTER (WHERE eps.field_name IS NOT NULL),
        '{}'::json
    ) AS payload_schema
FROM event_definitions ed
LEFT JOIN event_consumers ec ON ed.id = ec.event_id
LEFT JOIN event_payload_schema eps ON ed.id = eps.event_id
GROUP BY ed.id, ed.event_name, ed.description, ed.producer_actor, ed.schema_version;