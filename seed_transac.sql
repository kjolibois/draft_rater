-- Create the main table
CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transac_team TEXT NOT NULL,
    transac_date TEXT NOT NULL,
    transac_type TEXT NOT NULL,
    player_info TEXT NOT NULL,
    related_transaction INTEGER NOT NULL CHECK (related_transaction IN (0, 1)),
    transaction_group_id TEXT, -- Removed NOT NULL constraint
    snapshot_date TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Create indexes for common queries
CREATE INDEX idx_transaction_group ON transactions(transaction_group_id);
CREATE INDEX idx_transac_date ON transactions(transac_date);
CREATE INDEX idx_player_info ON transactions(player_info);