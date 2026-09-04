-- Add response_phase sub-status column to incidents table
ALTER TABLE incidents ADD COLUMN response_phase VARCHAR(32);
CREATE INDEX idx_incidents_response_phase ON incidents (response_phase);
