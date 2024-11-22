
CREATE TABLE IF NOT EXISTS draft_ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pick_number INTEGER NOT NULL,
    round INTEGER NOT NULL,
    overall_pick INTEGER NOT NULL,
    player_id INTEGER NOT NULL,
    season INTEGER NOT NULL,
    verdict TEXT NOT NULL CHECK (verdict IN ('Steal', 'Value', 'Fair', 'Reach', 'Bust', 'No Verdict')),
    average_points REAL NOT NULL,
    total_points REAL NOT NULL,
    player_name TEXT NOT NULL,
    team_name TEXT NOT NULL,
    team_id INTEGER NOT NULL,
    snapshot_timestamp TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_draft_ratings_team 
ON draft_ratings(team_id, season);

CREATE INDEX IF NOT EXISTS idx_draft_ratings_player 
ON draft_ratings(player_id, season);

CREATE INDEX IF NOT EXISTS idx_draft_ratings_snapshot 
ON draft_ratings(snapshot_timestamp DESC);

-- Create index for draft order queries
CREATE INDEX IF NOT EXISTS idx_draft_order 
ON draft_ratings(season, round, pick_number);