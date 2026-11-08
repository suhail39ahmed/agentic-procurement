CREATE TABLE audit_records (
  order_id text NOT NULL REFERENCES orders(id),
  sequence integer NOT NULL CHECK (sequence > 0),
  event text NOT NULL,
  actor text NOT NULL,
  at text NOT NULL,
  from_status text,
  to_status text,
  note text,
  previous_hash text NOT NULL CHECK (previous_hash ~ '^[0-9a-f]{64}$'),
  hash text NOT NULL CHECK (hash ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY (order_id, sequence)
);