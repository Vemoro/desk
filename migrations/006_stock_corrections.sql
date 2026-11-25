ALTER TABLE movements
  DROP CONSTRAINT movements_action_check,
  ADD COLUMN corrects_movement_id uuid REFERENCES movements(id),
  ADD COLUMN correction_reason text,
  ADD CONSTRAINT movements_action_check
    CHECK (action IN ('receive','issue','return','consume','correct_receive','correct_consume')),
  ADD CONSTRAINT movements_correction_check CHECK (
    (action IN ('correct_receive','correct_consume')
      AND corrects_movement_id IS NOT NULL AND corrects_movement_id <> id
      AND correction_reason IS NOT NULL AND length(btrim(correction_reason)) BETWEEN 1 AND 5000)
    OR
    (action IN ('receive','issue','return','consume')
      AND corrects_movement_id IS NULL AND correction_reason IS NULL)
  );

CREATE INDEX movements_correction_idx ON movements (corrects_movement_id) WHERE corrects_movement_id IS NOT NULL;
