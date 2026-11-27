ALTER TABLE movements ADD COLUMN delivery_reference text
  CHECK (delivery_reference IS NULL OR (action = 'receive' AND char_length(delivery_reference) BETWEEN 1 AND 160));
