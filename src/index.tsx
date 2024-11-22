import { Hono } from 'hono'
import { z } from 'zod'
import { jsx } from 'hono/jsx'
import type { FC } from "hono/jsx"
import { HTTPException } from 'hono/http-exception'

// Define types
type Bindings = {
  DB: D1Database
}
const LEAGUE_START = '2024-10-22'
type DraftPick = {
  pick_number: number
  round: number
  overall_pick: number
  player_id: number
  season: number
  verdict: string
  draft_round_fantasy_per_game_average: number
  fantasy_points_per_game: number
  player_name: string
  team_name: string
  team_id: number
}

type TeamSummary = {
  team_name: string
  team_id: number
  average_rating: number
  total_picks: number
  avg_points_per_pick: number
  weighted_ppg: number
  total_points: number
}

const RATING_QUERIES = {
  average_ppg: `
    SELECT
      team_name,
      team_id,
      COUNT(*) as total_picks,
      ROUND(AVG(CASE
        WHEN fantasy_per_game_verdict = 'Steal' THEN 4
        WHEN fantasy_per_game_verdict = 'Value' THEN 3
        WHEN fantasy_per_game_verdict = 'Fair' THEN 2
        WHEN fantasy_per_game_verdict = 'Reach' THEN 1
        WHEN fantasy_per_game_verdict = 'Bust' THEN 0
        ELSE NULL
      END), 2) as average_rating
    FROM draft_ratings
    WHERE snapshot_timestamp = ?
    AND season = ?
    GROUP BY team_name, team_id
    ORDER BY average_rating DESC NULLS LAST
  `,
  weighted_ppg: `
    SELECT
      team_name,
      team_id,
      COUNT(*) as total_picks,
      ROUND(AVG(CASE
        WHEN fantasy_per_game_verdict = 'Steal' THEN 4
        WHEN fantasy_per_game_verdict = 'Value' THEN 3
        WHEN fantasy_per_game_verdict = 'Fair' THEN 2
        WHEN fantasy_per_game_verdict = 'Reach' THEN 1
        WHEN fantasy_per_game_verdict = 'Bust' THEN 0
        ELSE NULL
      END), 2) as average_rating
    FROM draft_ratings
    WHERE snapshot_timestamp = ?
    AND season = ?
    GROUP BY team_name, team_id
    ORDER BY average_rating DESC NULLS LAST
  `,
  total_points: `
    SELECT
      team_name,
      team_id,
      COUNT(*) as total_picks,
      ROUND(AVG(CASE
        WHEN fantasy_per_game_verdict = 'Steal' THEN 4
        WHEN fantasy_per_game_verdict = 'Value' THEN 3
        WHEN fantasy_per_game_verdict = 'Fair' THEN 2
        WHEN fantasy_per_game_verdict = 'Reach' THEN 1
        WHEN fantasy_per_game_verdict = 'Bust' THEN 0
        ELSE NULL
      END), 2) as average_rating

    FROM draft_ratings
    WHERE snapshot_timestamp = ?
    AND season = ?
    GROUP BY team_name, team_id
    ORDER BY average_rating DESC NULLS LAST
  `
} as const;

type EvalMethod = keyof typeof RATING_QUERIES;
type DraftPicksPayload = {
  snapshot_timestamp: string
  allpicks: DraftPick[]
}

// Create validation schema with more specific constraints
const DraftPickSchema = z.object({
  pick_number: z.number().int().positive(),
  round: z.number().int().positive(),
  overall_pick: z.number().int().positive(),
  player_id: z.number().int().positive(),
  season: z.number().int(),
  verdict: z.string().min(1),
  draft_round_fantasy_per_game_average: z.number(),
  fantasy_points_per_game: z.number(),
  player_name: z.string().min(1),
  team_name: z.string().min(1),
  team_id: z.number().int().positive()
})

const DraftPicksPayloadSchema = z.object({
  snapshot_timestamp: z.string().min(1),
  allpicks: z.array(DraftPickSchema).min(1)
})

const app = new Hono<{ Bindings: Bindings }>()
const EvalMethodSelector: FC<{ currentMethod: string }> = ({ currentMethod }) => {
  return (
    <div class="bg-white rounded-lg shadow-lg p-4 mb-4">
      <div class="flex items-center justify-between">
        <label htmlFor="evalMethod" class="block text-sm font-medium text-gray-700">
          Evaluation Method
        </label>
        <div class="relative w-40">
          <select
            id="evalMethod"
            name="evalMethod"
            class="block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
            hx-get="/"
            hx-target="body"
            hx-push-url="true"
            hx-include="[name='evalMethod'], [name='season']"
          >
            <option value="average_ppg" selected={currentMethod === 'average_ppg'}>Average PPG</option>
            <option value="weighted_ppg" selected={currentMethod === 'weighted_ppg'}>PPG × Games</option>
            <option value="total_points" selected={currentMethod === 'total_points'}>Total Points</option>
          </select>
        </div>
      </div>
    </div>
  )
}
// Add season selector component
const SeasonSelector: FC<{ currentSeason: number }> = ({ currentSeason }) => {
  const seasons = Array.from({ length: 15 }, (_, i) => 2025 - i)
  
  return (
    <div class="bg-white rounded-lg shadow-lg p-4 mb-4">
      <div class="flex items-center justify-between">
        <label htmlFor="season" class="block text-sm font-medium text-gray-700">
          Select Season
        </label>
        <div class="relative w-40">
          <select
            id="season"
            name="season"
            class="block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
            hx-get="/"
            hx-target="body"
            hx-push-url="true"
            hx-include="[name='season']"
          >
            {seasons.map(year => (
              <option value={year} selected={year === currentSeason}>
                {year}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}

const Layout: FC = (props) => {
  return (
    <html>
      <head>
        <title>Draft Ratings Dashboard</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <script src="https://unpkg.com/htmx.org@1.9.6"></script>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          {`
            @keyframes bounce {
              0%, 100% {
                transform: translateY(0);
              }
              50% {
                transform: translateY(10px);
              }
            }
            
            .scroll-indicator {
              animation: bounce 1.5s infinite;
              transition: opacity 0.3s ease-in-out;
            }
            
            @media (max-width: 640px) {
              .mobile-container {
                padding-left: 0 !important;
                padding-right: 0 !important;
              }
              .mobile-table {
                display: block;
                width: 100%;
              }
              .mobile-cell {
                white-space: normal !important;
              }
            }
          `}
        </style>
        <script>
          {`
            document.addEventListener('htmx:afterSwap', function(event) {
              if (event.detail.target.id === 'team-picks-content') {
                // Show scroll indicator
                const indicator = document.getElementById('scroll-indicator');
                if (indicator) {
                  indicator.classList.remove('opacity-0', 'hidden');
                }

                // Scroll to picks section
                const picksSection = document.getElementById('picks-section');
                if (picksSection) {
                  setTimeout(() => {
                    window.scrollTo({
                      top: picksSection.offsetTop - 20,
                      behavior: 'smooth'
                    });
                  }, 100);
                }

                // Hide scroll indicator after delay
                setTimeout(() => {
                  if (indicator) {
                    indicator.classList.add('opacity-0');
                    setTimeout(() => {
                      indicator.classList.add('hidden');
                    }, 300);
                  }
                }, 2000);
              }
            });
          `}
        </script>
      </head>
      <body class="bg-gray-100">
        <div class="px-2 sm:px-8 py-4 sm:py-8 w-full">
          {props.children}
        </div>
      </body>
    </html>
  )
}

app.post('/seed_draft_ratings', async (c) => {
  try {
    console.log('Starting request processing...')
    
    const rawBody = await c.req.text()
    console.log('Received raw body')

    let body
    try {
      body = JSON.parse(rawBody)
      console.log(typeof body)
      console.log('Successfully parsed JSON')
    } catch (e) {
      console.error('JSON parse error:', e)
      return c.json({
        success: false,
        message: 'Invalid JSON format',
        error: e instanceof Error ? e.message : 'Unknown error'
      }, 400)
    }

    let validatedData
    try {
      validatedData = DraftPicksPayloadSchema.parse(body)
      console.log('Validation successful')
    } catch (e) {
      if (e instanceof z.ZodError) {
        console.error('Validation error:', JSON.stringify(e.errors, null, 2))
        return c.json({
          success: false,
          message: 'Data validation failed',
          errors: e.errors.map(err => ({
            path: err.path.join('.'),
            message: err.message
          }))
        }, 400)
      }
      throw e
    }

    console.log('Processing validated data...')
    const db = c.env.DB

    try {
      await db.prepare(`
        CREATE TABLE IF NOT EXISTS draft_ratings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          snapshot_timestamp TEXT,
          pick_number INTEGER,
          round INTEGER,
          overall_pick INTEGER,
          player_id INTEGER,
          season INTEGER,
          verdict TEXT,
          draft_round_fantasy_per_game_average REAL,
          fantasy_points_per_game REAL,
          player_name TEXT,
          team_name TEXT,
          team_id INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run()
      console.log('Table creation/verification successful')
    } catch (e) {
      console.error('Database table creation error:', e)
      throw e
    }

    const insertStmt = db.prepare(`
      INSERT INTO draft_ratings (
        snapshot_timestamp, pick_number, round, overall_pick,
        player_id, season, fantasy_per_game_verdict, draft_round_fantasy_per_game_average, fantasy_points_per_game,
        player_name, team_name, team_id
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `)

    console.log(`Preparing to insert ${validatedData.allpicks.length} records...`)
    
    const batch = validatedData.allpicks.map(pick => 
      insertStmt.bind(
        validatedData.snapshot_timestamp,
        pick.pick_number,
        pick.round,
        pick.overall_pick,
        pick.player_id,
        pick.season,
        pick.fantasy_per_game_verdict,
        pick.draft_round_fantasy_per_game_average,
        pick.fantasy_points_per_game,
        pick.player_name,
        pick.team_name,
        pick.team_id
      )
    )

    await db.batch(batch)
    console.log('Batch insert completed successfully')

    return c.json({
      success: true,
      message: `Successfully inserted ${validatedData.allpicks.length} draft picks`,
      timestamp: validatedData.snapshot_timestamp
    }, 201)
    
  } catch (error) {
    console.error('Unhandled error:', error)
    return c.json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})
app.get('/', async (c) => {
  const db = c.env.DB;
  const season = parseInt(c.req.query('season') || '2025');
  const evalMethod = (c.req.query('evalMethod') || 'average_ppg') as EvalMethod;

  const snapshotResult = await db.prepare(`
    SELECT snapshot_timestamp 
    FROM draft_ratings 
    WHERE season = ?
    ORDER BY snapshot_timestamp DESC 
    LIMIT 1
  `).bind(season).first<{ snapshot_timestamp: string }>();

  const latestSnapshot = snapshotResult?.snapshot_timestamp || '';

  const teams = latestSnapshot ? await db.prepare(RATING_QUERIES[evalMethod])
    .bind(latestSnapshot, season)
    .all<TeamSummary>() : { results: [] };
  return c.render(
    <Layout>
      <div class="max-w-7xl mx-auto">
        <div class="flex flex-wrap gap-4 mb-4">
          <SeasonSelector currentSeason={season} />
          <EvalMethodSelector currentMethod={evalMethod} />

        </div>

        <div class="bg-white rounded-lg shadow-lg p-4 mb-4">
          <h1 class="text-xl sm:text-2xl font-bold text-gray-900 mb-2">Draft Ratings Dashboard</h1>
          <p class="text-sm sm:text-base text-gray-600">
            {season} Season {latestSnapshot ? `• Latest Snapshot: ${latestSnapshot}` : '• No data available'}
          </p>
        </div>

        <div class="grid grid-cols-1 gap-4">
          <div class="bg-white rounded-lg shadow-lg p-4">
            <h2 class="text-lg sm:text-xl font-bold text-gray-900 mb-4">Team Ratings</h2>
            {teams.results && teams.results.length > 0 ? (
              <div class="overflow-x-auto -mx-4 sm:mx-0">
                <table class="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr class="bg-gray-50">
                      <th scope="col" class="px-3 py-2 text-left text-xs font-medium text-gray-500">Team</th>
                      <th scope="col" class="px-3 py-2 text-left text-xs font-medium text-gray-500">Rating</th>
                      <th scope="col" class="px-3 py-2 text-left text-xs font-medium text-gray-500 hidden sm:table-cell">
                        {evalMethod === 'average_ppg' ? 'PPG' :
                         evalMethod === 'weighted_ppg' ? 'Weighted PPG' :
                         'Total Points'}
                      </th>
                      <th scope="col" class="px-3 py-2 text-right text-xs font-medium text-gray-500"></th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-200">
                    {teams.results.map((team) => (
                        <tr key={team.team_id} class="hover:bg-gray-50">
                        <td class="px-3 py-2 mobile-cell">
                          <a href={`/team/${team.team_id}`} class="hover:text-blue-600">
                            <div class="text-sm font-medium text-gray-900">{team.team_name}</div>
                            <div class="text-xs text-gray-500">{team.total_picks} picks</div>
                          </a>
                        </td>
                        <td class="px-3 py-2 mobile-cell">
                          <div class="text-sm font-medium text-gray-900">{team.average_rating?.toFixed(2) || 'N/A'}</div>
                        </td>
                        <td class="px-3 py-2 mobile-cell hidden sm:table-cell">
                          <div class="text-sm text-gray-900">
                            {evalMethod === 'average_ppg' ? team.avg_points_per_pick :
                             evalMethod === 'weighted_ppg' ? team.weighted_ppg :
                             team.fantasy_points_per_game}
                          </div>
                        </td>
                        <td class="px-3 py-2 text-right">
                          <button
                            class="inline-flex items-center px-2 py-1 border border-blue-600 text-xs font-medium rounded-md text-blue-600 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                            hx-get={`/team/${team.team_id}/picks?season=${season}`}
                            hx-target="#team-picks-content"
                            hx-swap="innerHTML"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div class="text-center py-8">
                <p class="text-gray-500">No draft data available for {season} season</p>
              </div>
            )}
          </div>

          <div id="scroll-indicator" class="hidden opacity-0 text-center py-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 mx-auto text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M7 13l5 5 5-5M7 6l5 5 5-5"/>
            </svg>
            <p class="text-sm text-blue-500 font-medium">View Team Picks Below</p>
          </div>

          <div id="picks-section" class="bg-white rounded-lg shadow-lg p-4">
            <div id="team-picks-content" class="overflow-hidden">
              <p class="text-sm text-gray-500">Select a team to view their picks</p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
})
app.get('/team/:id', async (c) => {
  const teamId = c.req.param('id')
  
  const teamData = await c.env.DB.prepare(`
    WITH latest_snapshots AS (
      SELECT season, MAX(snapshot_timestamp) as latest_snapshot
      FROM draft_ratings
      GROUP BY season
    )
    SELECT 
      d.team_name,
      COUNT(*) as total_picks,
      ROUND(AVG(CASE 
        WHEN fantasy_per_game_verdict = 'Steal' THEN 4
        WHEN fantasy_per_game_verdict = 'Value' THEN 3
        WHEN fantasy_per_game_verdict = 'Fair' THEN 2
        WHEN fantasy_per_game_verdict = 'Reach' THEN 1
        WHEN fantasy_per_game_verdict = 'Bust' THEN 0
        ELSE NULL
      END), 2) as lifetime_rating,
      ROUND(AVG(draft_round_fantasy_per_game_average), 1) as lifetime_ppg,
      COUNT(DISTINCT d.season) as seasons_drafted
    FROM draft_ratings d
    JOIN latest_snapshots ls 
      ON d.season = ls.season 
      AND d.snapshot_timestamp = ls.latest_snapshot
    WHERE team_id = ?
    GROUP BY d.team_id
  `).bind(teamId).first()

  return c.render(
    <Layout>
      <div class="max-w-3xl mx-auto">
        <div class="bg-white rounded-lg shadow-lg p-6">
          <h1 class="text-2xl font-bold text-gray-900 mb-4">{teamData.team_name}</h1>
          <div class="grid grid-cols-2 gap-4 mb-6">
            <div class="bg-gray-50 p-4 rounded-lg">
              <div class="text-sm text-gray-500">Lifetime Draft Rating</div>
              <div class="text-2xl font-bold text-gray-900">{teamData.lifetime_rating}</div>
            </div>
            <div class="bg-gray-50 p-4 rounded-lg">
              <div class="text-sm text-gray-500">Average PPG per Pick</div>
              <div class="text-2xl font-bold text-gray-900">{teamData.lifetime_ppg}</div>
            </div>
          </div>
          <div class="text-sm text-gray-600">
            <div>Total Picks: {teamData.total_picks}</div>
            <div>Seasons: {teamData.seasons_drafted}</div>
          </div>
        </div>
      </div>
    </Layout>
  )
})
app.get('/team/:id/picks', async (c) => {
  const teamId = c.req.param('id')
  const season = parseInt(c.req.query('season') || '2025')
  const db = c.env.DB
  
  // Add null check and default value for snapshot
  const snapshotResult = await db.prepare(`
    SELECT snapshot_timestamp 
    FROM draft_ratings 
    WHERE season = ?
    ORDER BY snapshot_timestamp DESC 
    LIMIT 1
  `).bind(season).first<{ snapshot_timestamp: string }>()

  const latestSnapshot = snapshotResult?.snapshot_timestamp || ''
  
  // Only fetch picks if we have a valid snapshot and teamId
  const picks = (latestSnapshot && teamId) ? await db.prepare(`
    SELECT *
    FROM draft_ratings
    WHERE team_id = ?
    AND snapshot_timestamp = ?
    AND season = ?
    ORDER BY overall_pick ASC
  `).bind(teamId, latestSnapshot, season).all<DraftPick>() : { results: [] }

  return c.html(
    <div>
      {picks.results && picks.results.length > 0 ? (
        <>
          <h2 class="text-lg sm:text-xl font-bold text-gray-900 mb-4">
            {picks.results[0].team_name}'s {season} Picks
          </h2>
          <div class="overflow-x-auto mobile-scroll -mx-4 sm:mx-0">
            <div class="min-w-full inline-block align-middle">
              <div class="overflow-hidden">
                <table class="min-w-full">
                  <thead>
                    <tr class="bg-gray-50">
                      <th scope="col" class="px-4 py-3 text-left text-xs sm:text-sm font-medium text-gray-500">Pick</th>
                      <th scope="col" class="px-4 py-3 text-left text-xs sm:text-sm font-medium text-gray-500">Player</th>
                      <th scope="col" class="px-4 py-3 text-left text-xs sm:text-sm font-medium text-gray-500">Verdict</th>
                      <th scope="col" class="hidden sm:table-cell px-4 py-3 text-left text-xs sm:text-sm font-medium text-gray-500">Points</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-200">
                    {picks.results.map((pick) => (
                      <>
                        <tr key={`${pick.player_id}-${pick.overall_pick}`}>
                          <td class="px-4 py-3 whitespace-nowrap">
                            <div class="text-sm sm:text-base font-medium text-gray-900">Round {pick.round}.{pick.pick_number}</div>
                            <div class="text-xs sm:text-sm text-gray-500">#{pick.overall_pick} overall</div>
                          </td>
                          <td class="px-4 py-3">
                            <div class="text-sm sm:text-base text-gray-900">{pick.player_name}</div>
                          </td>
                          <td class="px-4 py-3 whitespace-nowrap">
                          <span class={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs sm:text-sm font-medium ${getVerdictStyle(pick.fantasy_per_game_verdict)}`}>
                            {pick.fantasy_per_game_verdict}
                          </span>
                          </td>
                          <td class="hidden sm:table-cell px-4 py-3">
                            <div class="text-sm sm:text-base text-gray-900 break-words">{pick.draft_round_fantasy_per_game_average.toFixed(1)} avg fantasy points per game by all picks in round {pick.round}</div>
                            <div class="text-xs sm:text-sm text-gray-500 break-words">{pick.fantasy_points_per_game.toFixed(1)} fantasy points per game by {pick.player_name}</div>
                          </td>
                        </tr>
                        {/* Mobile points row */}
                        <tr class="sm:hidden bg-gray-50">
                          <td colspan="3" class="px-4 py-2">
                            <div class="text-sm text-gray-900">{pick.draft_round_fantasy_per_game_average.toFixed(1)} avg fantasy points per game by all picks in round {pick.round}</div>
                            <div class="text-xs text-gray-700">{pick.fantasy_points_per_game.toFixed(1)} average fantasy points per game by {pick.player_name}</div>
                          </td>
                        </tr>
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div class="text-center py-8">
          <p class="text-gray-500">No picks available for this team in {season} season</p>
        </div>
      )}
    </div>
  )
})

// Zod schema for transaction validation
const TransactionSchema = z.object({
  snapshot_date: z.string(),
  transactions: z.array(z.object({
    transac_team: z.string(),
    transac_date: z.string(),
    transac_type: z.string(),
    player_info: z.string(),
    related_transaction: z.boolean(),
    transaction_group_id: z.string().optional()
  }))
})

app.post('/transactions', async (c) => {
  const db = c.env.DB

  try {
    const body = await c.req.json()
    console.log(body)
    let validatedData =[]
    try {
      validatedData = TransactionSchema.parse(body)
      console.log('Validation successful')
    } catch (e) {
      if (e instanceof z.ZodError) {
        console.error('Validation error:', JSON.stringify(e.errors, null, 2))
        return c.json({
          success: false,
          message: 'Data validation failed',
          errors: e.errors.map(err => ({
            path: err.path.join('.'),
            message: err.message
          }))
        }, 400)
      }
      throw e
    }
    console.log(validatedData)
    // Create table if it doesn't exist

try{
    // Insert transactions in a batch
    const stmt = db.prepare(`
      INSERT INTO transactions (
        transac_team,
        transac_date,
        transac_type,
        player_info,
        related_transaction,
        transaction_group_id,
        snapshot_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `)

    const batch = validatedData.transactions.map(tx => {
      // Explicitly convert undefined to null
      const transac_team = typeof tx.transac_team === 'undefined' ? null : tx.transac_team
      const transaction_group_id = typeof tx.transaction_group_id === 'undefined' ? null : tx.transaction_group_id

      return stmt.bind(
        transac_team,
        tx.transac_date,
        tx.transac_type,
        tx.player_info,
        tx.related_transaction ? 1 : 0,
        transaction_group_id,
        validatedData.snapshot_date
      )
    })


    await db.batch(batch)
  }
  catch (e) {
    console.error('Database table  error:', e)
    throw e
  }
    return c.json({
      success: true,
      message: `Inserted ${validatedData.transactions.length} transactions`
    })

  } catch (error) {
    return c.json({
      success: false,
      error: error.message
    }, 400)
  }
})
  // Updated verdict style function
  function getVerdictStyle(verdict: string): string {
    const styles = {
      'Steal': 'bg-purple-100 text-purple-800',
      'Value': 'bg-green-100 text-green-800',
      'Fair': 'bg-yellow-100 text-yellow-800',
      'Reach': 'bg-red-100 text-red-800',
      'Bust': 'bg-gray-800 text-white',
      'No Verdict': 'bg-gray-100 text-gray-800'
    }
    return styles[verdict as keyof typeof styles] || styles['No Verdict']
  }
  
  
// Helper to get week number from date
function getWeekNumber(date: string): number {
  return Math.ceil((new Date(date).getTime() - new Date('2024-11-01').getTime()) / (7 * 24 * 60 * 60 * 1000))
}
type Transaction = {
  transac_team: string
  team_name:string
  transac_date: string
  transac_type: string
  player_info: string
  week: string
}

app.get('/waiverwire', async (c) => {
  const db = c.env.DB
  const filterType = c.req.query('type')
  const week = c.req.query('week')
  
  const currentWeek = Math.ceil((new Date().getTime() - new Date(LEAGUE_START).getTime()) / (7 * 24 * 60 * 60 * 1000))
  const selectedWeek = week ? Number(week) : currentWeek

  const query = `
  WITH latest_ratings AS (
    SELECT DISTINCT team_id, team_name
    FROM draft_ratings
    WHERE snapshot_timestamp = (
      SELECT MAX(snapshot_timestamp) 
      FROM draft_ratings
    )
  )
  SELECT 
    t.*,
    d.team_name as team_name,
    CAST(
      (julianday(date(t.transac_date)) - julianday(date(?))) / 7 + 1
      AS INTEGER
    ) as week
  FROM transactions t
  LEFT JOIN latest_ratings d ON t.transac_team = d.team_id
  WHERE 
    CAST((julianday(date(t.transac_date)) - julianday(date(?))) / 7 + 1 AS INTEGER) = ?
    ${filterType === 'adds' ? "AND t.transac_type LIKE '%ADDED'" :
       filterType === 'drops' ? "AND t.transac_type = 'DROPPED'" :
       ''}
  ORDER BY d.team_name, t.transac_date DESC
  `
 
  const { results } = await db.prepare(query)
    .bind(LEAGUE_START, LEAGUE_START, selectedWeek)
    .all()

  // Group transactions by team
  const groupedTransactions = results?.reduce((acc, t) => {
    if (!acc[t.team_name]) {
      acc[t.team_name] = []
    }
    acc[t.team_name].push(t)
    return acc
  }, {})

  return c.render(
    <Layout>
      <div class="max-w-3xl mx-auto">
        {/* Navigation */}
        <div class="flex flex-col space-y-4 mb-6">
          {/* Filter buttons on top */}
          <div class="flex justify-center space-x-2">
            <a href={`/waiverwire?week=${selectedWeek}`} class={`px-4 py-2 rounded ${!filterType ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}>All</a>
            <a href={`/waiverwire?week=${selectedWeek}&type=adds`} class={`px-4 py-2 rounded ${filterType === 'adds' ? 'bg-green-500 text-white' : 'bg-gray-200'}`}>Adds</a>
            <a href={`/waiverwire?week=${selectedWeek}&type=drops`} class={`px-4 py-2 rounded ${filterType === 'drops' ? 'bg-red-500 text-white' : 'bg-gray-200'}`}>Drops</a>
          </div>
    
          {/* Week navigation below */}
          <div class="flex items-center justify-center space-x-4">
            {selectedWeek > 1 && (
              <a href={`/waiverwire?week=${selectedWeek - 1}${filterType ? `&type=${filterType}` : ''}`} class="px-4 py-2 bg-gray-200 rounded">
                ← Week {selectedWeek - 1}
              </a>
            )}
            
            <select 
              class="px-4 py-2 border rounded"
              onChange="window.location.href=`/waiverwire?week=${this.value}${window.location.search.includes('type') ? `&type=${new URLSearchParams(window.location.search).get('type')}` : ''}`"
            >
              {Array.from(
                { length: currentWeek },
                (_, i) => i + 1
              ).map(weekNum => (
                <option value={weekNum} selected={weekNum === selectedWeek}>
                  Week {weekNum}
                </option>
              ))}
            </select>
    
            {selectedWeek < currentWeek && (
              <a href={`/waiverwire?week=${selectedWeek + 1}${filterType ? `&type=${filterType}` : ''}`} class="px-4 py-2 bg-gray-200 rounded">
                Week {selectedWeek + 1} →
              </a>
            )}
          </div>
        </div>
    
        {/* Transactions grouped by team */}
        <h2 class="text-xl font-bold mb-4">Week {selectedWeek} Transactions</h2>
        <div class="space-y-2">
          {results?.length === 0 ? (
            <div class="text-gray-500 text-center py-8">
              No transactions this week
            </div>
          ) : (
            Object.entries(groupedTransactions).sort().map(([teamName, transactions]) => (
              <details class="bg-white rounded-lg shadow mb-4">
                <summary class="px-4 py-3 cursor-pointer hover:bg-gray-50 flex justify-between items-center">
                  <span class="font-medium">{teamName || 'Unknown Team'}</span>
                  <span class="text-sm text-gray-500">{transactions.length} transaction{transactions.length !== 1 ? 's' : ''}</span>
                </summary>
                <div class="px-4 pb-4 space-y-2">
                  {transactions.map((t) => (
                    <div class={`p-3 rounded ${
                      t.transac_type.includes('ADDED') ? 'bg-green-50' : 
                      t.transac_type === 'DROPPED' ? 'bg-red-50' : 
                      'bg-gray-50'
                    }`}>
                      <div class="flex justify-between">
                        <span class="font-medium">{t.player_info}</span>
                        <span class="text-gray-500">{new Date(t.transac_date).toLocaleDateString()}</span>
                      </div>
                      <div class="text-sm text-gray-600 mt-1">
                        {t.transac_type}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            ))
          )}
        </div>
      </div>
    </Layout>
  )
})
const playerSchema = z.object({
  PLAYER_ID: z.number(),
  PLAYER_NAME: z.string(),
  TEAM_ID: z.number().nullable(),
  TEAM_ABBREVIATION: z.string().nullable(),
  AGE: z.number(),
  GP: z.number(),
  MIN: z.number(),
  PTS: z.number(),
  FGM: z.number(),
  FGA: z.number(),
  FG_PCT: z.number(),
  FG3M: z.number(),
  FG3A: z.number(),
  FG3_PCT: z.number(),
  FTM: z.number(),
  FTA: z.number(),
  FT_PCT: z.number(),
  REB: z.number(),
  AST: z.number(),
  STL: z.number(),
  BLK: z.number(),
  TOV: z.number()
})

const payloadSchema = z.object({
  snapshot_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format. Use YYYY-MM-DD'),
  player_info: z.array(playerSchema).min(1, 'Player info array cannot be empty')
})

app.post('/load_gp', async (c) => {
  try {
    const body = await c.req.json()
    const validatedData = payloadSchema.parse(body)
    const { snapshot_date, player_info } = validatedData
    const db = c.env.DB
 
    const stmt = db.prepare(`
      INSERT INTO player_snapshots (
        snapshot_date, player_id, player_name, team_id, team_abbreviation,
        age, gp, min, pts, fgm, fga, fg_pct, fg3m, fg3a, fg3_pct,
        ftm, fta, ft_pct, reb, ast, stl, blk, tov
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(snapshot_date, player_id) DO UPDATE SET
        team_id = excluded.team_id,
        team_abbreviation = excluded.team_abbreviation,
        gp = excluded.gp,
        min = excluded.min,
        pts = excluded.pts,
        fgm = excluded.fgm,
        fga = excluded.fga,
        fg_pct = excluded.fg_pct,
        fg3m = excluded.fg3m,
        fg3a = excluded.fg3a,
        fg3_pct = excluded.fg3_pct,
        ftm = excluded.ftm,
        fta = excluded.fta,
        ft_pct = excluded.ft_pct,
        reb = excluded.reb,
        ast = excluded.ast,
        stl = excluded.stl,
        blk = excluded.blk,
        tov = excluded.tov`)
        
    for (const player of player_info) {
      console.log(player)
      await stmt.bind(
        snapshot_date,
        player.PLAYER_ID,
        player.PLAYER_NAME,
        player.TEAM_ID, 
        player.TEAM_ABBREVIATION,
        player.AGE,
        player.GP,
        player.MIN,
        player.PTS,
        player.FGM,
        player.FGA,
        player.FG_PCT,
        player.FG3M,
        player.FG3A,
        player.FG3_PCT,
        player.FTM,
        player.FTA,
        player.FT_PCT,
        player.REB,
        player.AST,
        player.STL,
        player.BLK,
        player.TOV
      ).run()
    }
 
    return c.json({ success: true, count: player_info.length })
  } catch (error) {
    console.error('Error:', error)
    return c.json({ success: false, error: error.message }, 400)
  }
 })
 app.get('/matching-players/:season', async (c) => {
  const season = c.req.param('season')
  
  const stmt = await c.env.DB.prepare(`
    SELECT DISTINCT 
      d.player_name as draft_name,
      d.player_id as draft_id,
      COALESCE(n.gp, 0) as gp
    FROM (SELECT * FROM draft_ratings WHERE season = ?) d
    LEFT JOIN (
      SELECT 
        player_name,
        LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
          REPLACE(REPLACE(REPLACE(REPLACE(
            player_name,
            'ć', 'c'), 'č', 'c'), 'š', 's'), 'ž', 'z'), 'đ', 'dj'),
            'ň', 'n'), 'ř', 'r'), 'ı', 'i'), 'ş', 's'), 'ģ', 'g'
        ))) as norm_name,
        gp
      FROM player_snapshots
    ) n ON LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
          REPLACE(REPLACE(REPLACE(REPLACE(
            d.player_name,
            'ć', 'c'), 'č', 'c'), 'š', 's'), 'ž', 'z'), 'đ', 'dj'),
            'ň', 'n'), 'ř', 'r'), 'ı', 'i'), 'ş', 's'), 'ģ', 'g'
        ))) = n.norm_name
  `).bind(season)
  
  const results = await stmt.all()
  console.log(results.results.length)
  return c.json(results)
})

export default app