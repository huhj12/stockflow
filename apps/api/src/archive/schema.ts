// Explicit, additive migration. Advisory lock serializes migration commands.
export const schemaV1 = `
CREATE TABLE IF NOT EXISTS archive_schema_versions(version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS archive_stocks(
 code varchar(6) PRIMARY KEY CHECK(code ~ '^[0-9]{6}$'), name text NOT NULL,
 market text NOT NULL CHECK(market IN ('KOSPI','KOSDAQ')), sector text NOT NULL,
 metadata_source text NOT NULL DEFAULT 'curated-day3-catalog', updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS archive_daily_candles(
 code varchar(6) NOT NULL REFERENCES archive_stocks(code), exchange text NOT NULL CHECK(exchange='KRX'),
 trade_date date NOT NULL, adjusted boolean NOT NULL DEFAULT false,
 open bigint NOT NULL CHECK(open>0 AND open<=9007199254740991),
 high bigint NOT NULL CHECK(high>0 AND high<=9007199254740991),
 low bigint NOT NULL CHECK(low>0 AND low<=9007199254740991),
 close bigint NOT NULL CHECK(close>0 AND close<=9007199254740991),
 volume bigint NOT NULL CHECK(volume>=0 AND volume<=9007199254740991),
 source text NOT NULL CHECK(source IN ('kis','fixture')), collected_at timestamptz NOT NULL DEFAULT now(),
 CHECK(high>=greatest(open,close) AND low<=least(open,close) AND high>=low),
 PRIMARY KEY(code,exchange,trade_date,adjusted,source)
);
CREATE TABLE IF NOT EXISTS archive_collection_runs(
 id uuid PRIMARY KEY, source text NOT NULL CHECK(source IN ('kis','fixture')),
 status text NOT NULL CHECK(status IN ('running','success','partial','failed','interrupted')),
 date_from date NOT NULL, date_to date NOT NULL, started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 attempted integer NOT NULL DEFAULT 0, succeeded integer NOT NULL DEFAULT 0, rows_written integer NOT NULL DEFAULT 0,
 failure_codes text[] NOT NULL DEFAULT '{}'
);
INSERT INTO archive_schema_versions(version) VALUES(1) ON CONFLICT DO NOTHING;
`;
