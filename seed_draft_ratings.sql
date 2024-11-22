CREATE TABLE IF NOT EXISTS draft_ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pick_number INTEGER NOT NULL,
    round INTEGER NOT NULL,
    overall_pick INTEGER NOT NULL,
    player_id INTEGER NOT NULL,
    season INTEGER NOT NULL,
    fantasy_per_game_verdict TEXT NOT NULL CHECK (fantasy_per_game_verdict IN ('Steal', 'Value', 'Fair', 'Reach', 'Bust', 'No Verdict')),
    fantasy_total_verdict TEXT,
    games_played_verdict TEXT,
    draft_round_fantasy_per_game_average REAL NOT NULL,
    draft_round_total_points_average REAL,
    draft_round_games_played_weighted_average REAL,
    fantasy_points_per_game REAL,
    total_points REAL NOT NULL,
    player_name TEXT NOT NULL,
    team_name TEXT NOT NULL,
    team_id INTEGER NOT NULL,
    snapshot_timestamp TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_draft_ratings_team 
ON draft_ratings(team_id, season);

CREATE INDEX IF NOT EXISTS idx_draft_ratings_player 
ON draft_ratings(player_id, season);

CREATE INDEX IF NOT EXISTS idx_draft_ratings_snapshot 
ON draft_ratings(snapshot_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_draft_order 
ON draft_ratings(season, round, pick_number);

CREATE INDEX IF NOT EXISTS idx_draft_ratings_fantasy 
ON draft_ratings(fantasy_points_per_game, season);

CREATE INDEX IF NOT EXISTS idx_draft_round_averages 
ON draft_ratings(draft_round_fantasy_per_game_average, draft_round_total_points_average);



