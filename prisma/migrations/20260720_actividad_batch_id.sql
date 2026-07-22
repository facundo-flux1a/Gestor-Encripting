-- Add batch_id to actividad for auditable upload batches
-- Keep in sync with prisma/schema.prisma model actividad

ALTER TABLE actividad
  ADD COLUMN batch_id VARCHAR(255) NULL AFTER parent_upload_id;

CREATE INDEX idx_batch_id ON actividad (batch_id);
