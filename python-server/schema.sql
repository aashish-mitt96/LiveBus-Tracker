CREATE TABLE IF NOT EXISTS route_speed_training_sample (
    id                SERIAL PRIMARY KEY,
    route_id          TEXT NOT NULL,
    progress_fraction DOUBLE PRECISION NOT NULL,
    minute_of_day     INTEGER NOT NULL,
    day_of_week       INTEGER NOT NULL,
    speed_mps         DOUBLE PRECISION NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_route_speed_training_sample_route_id
    ON route_speed_training_sample (route_id);



CREATE TABLE IF NOT EXISTS route_speed_model (
    route_id       TEXT PRIMARY KEY,
    estimator_blob BYTEA,
    residual_std   DOUBLE PRECISION NOT NULL,
    sample_count   INTEGER NOT NULL,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);



CREATE TABLE IF NOT EXISTS service_config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);