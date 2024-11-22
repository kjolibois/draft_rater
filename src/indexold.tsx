import { Hono } from 'hono'
import { z } from 'zod'
import { jsx } from 'hono/jsx'
import type { FC } from "hono/jsx";

// Define types
type Bindings = {
  DB: D1Database
}

type DraftPick = {
  pick_number: number
  round: number
  overall_pick: number
  player_id: number
  season: number
  verdict: string
  average_points: number
  total_points: number
  player_name: string
  team_name: string
  team_id: number
}

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
  average_points: z.number(),
  total_points: z.number(),
  player_name: z.string().min(1),
  team_name: z.string().min(1),
  team_id: z.number().int().positive()
})

const DraftPicksPayloadSchema = z.object({
  snapshot_timestamp: z.string().min(1),
  allpicks: z.array(DraftPickSchema).min(1)
})

const app = new Hono<{ Bindings: Bindings }>()

app.post('/seed_draft_ratings', async (c) => {
  try {
    console.log('Starting request processing...')
    
    // Get the raw body as text first
    const rawBody = await c.req.text()
    console.log('Received raw body')

    // Parse the JSON string
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

    // Validate the parsed data
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

    // Create table with better error handling
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
          average_points REAL,
          total_points REAL,
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

    // Prepare and execute batch insert with progress logging
    const insertStmt = db.prepare(`
      INSERT INTO draft_ratings (
        snapshot_timestamp, pick_number, round, overall_pick,
        player_id, season, verdict, average_points, total_points,
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
        pick.verdict,
        pick.average_points,
        pick.total_points,
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

type TeamSummary = {
  team_name: string
  team_id: number
  average_rating: number
  total_picks: number
}


const Layout: FC = (props) => {
  return (
    <html>
      <head>
        <title>Draft Ratings Dashboard</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <script src="https://unpkg.com/htmx.org@1.9.6"></script>
        <script src="https://cdn.tailwindcss.com"></script>
        {/* Add specific icon we need instead of whole library */}
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



app.get('/', async (c) => {
  const db = c.env.DB
  
  const latestSnapshot = await db.prepare(`
    SELECT snapshot_timestamp 
    FROM draft_ratings 
    ORDER BY snapshot_timestamp DESC 
    LIMIT 1
  `).first<{ snapshot_timestamp: string }>()
  
  const teams = await db.prepare(`
    SELECT 
      team_name,
      team_id,
      COUNT(*) as total_picks,
      ROUND(AVG(CASE 
        WHEN verdict = 'Steal' THEN 4
        WHEN verdict = 'Value' THEN 3
        WHEN verdict = 'Fair' THEN 2
        WHEN verdict = 'Reach' THEN 1
        WHEN verdict = 'Bust' THEN 0
        ELSE NULL
      END), 2) as average_rating,
      ROUND(AVG(average_points), 1) as avg_points_per_pick
    FROM draft_ratings
    WHERE snapshot_timestamp = ?
    GROUP BY team_name, team_id
    ORDER BY average_rating DESC NULLS LAST
  `).bind(latestSnapshot?.snapshot_timestamp).all<TeamSummary>()


  return c.render(
    <Layout>
                {/* Team Picks Panel */}
                <div id="picks-section" class="bg-white rounded-lg shadow-lg p-4">
            <div id="team-picks-content" class="overflow-hidden">
              <p class="text-sm text-gray-500">Select a team to view their picks</p>
            </div>
          </div>
        </div>
      </div>
      <div class="max-w-7xl mx-auto">
        <div class="bg-white rounded-lg shadow-lg p-4 mb-4">
          <h1 class="text-xl sm:text-2xl font-bold text-gray-900 mb-2">Draft Ratings Dashboard</h1>
          <p class="text-sm sm:text-base text-gray-600">Latest Snapshot: {latestSnapshot?.snapshot_timestamp}</p>
        </div>

        <div class="grid grid-cols-1 gap-4">
          {/* Team Ratings Table */}
          <div class="bg-white rounded-lg shadow-lg p-4">
            <h2 class="text-lg sm:text-xl font-bold text-gray-900 mb-4">Team Ratings</h2>
            <div class="overflow-x-auto -mx-4 sm:mx-0">
              <table class="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr class="bg-gray-50">
                    <th scope="col" class="px-3 py-2 text-left text-xs font-medium text-gray-500">Team</th>
                    <th scope="col" class="px-3 py-2 text-left text-xs font-medium text-gray-500">Rating</th>
                    <th scope="col" class="px-3 py-2 text-left text-xs font-medium text-gray-500 hidden sm:table-cell">Points</th>
                    <th scope="col" class="px-3 py-2 text-right text-xs font-medium text-gray-500"></th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">
                  {teams?.results?.map((team) => (
                    <tr key={team.team_id} class="hover:bg-gray-50">
                      <td class="px-3 py-2 mobile-cell">
                        <div class="text-sm font-medium text-gray-900">{team.team_name}</div>
                        <div class="text-xs text-gray-500">{team.total_picks} picks</div>
                      </td>
                      <td class="px-3 py-2 mobile-cell">
                        <div class="text-sm font-medium text-gray-900">{team.average_rating?.toFixed(2) || 'N/A'}</div>
                      </td>
                      <td class="px-3 py-2 mobile-cell hidden sm:table-cell">
                        <div class="text-sm text-gray-900">{team.avg_points_per_pick}</div>
                      </td>
                      <td class="px-3 py-2 text-right">
                        <button
                          class="inline-flex items-center px-2 py-1 border border-blue-600 text-xs font-medium rounded-md text-blue-600 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                          hx-get={`/team/${team.team_id}/picks`}
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
          </div>

          {/* Scroll Indicator */}
          <div id="scroll-indicator" class="hidden opacity-0 text-center py-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 mx-auto text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M7 13l5 5 5-5M7 6l5 5 5-5"/>
            </svg>
            <p class="text-sm text-blue-500 font-medium">View Team Picks Below</p>
          </div>


    </Layout>
  )
})


app.get('/team/:id/picks', async (c) => {
  const teamId = c.req.param('id')
  const db = c.env.DB
  
  const latestSnapshot = await db.prepare(`
    SELECT snapshot_timestamp 
    FROM draft_ratings 
    ORDER BY snapshot_timestamp DESC 
    LIMIT 1
  `).first<{ snapshot_timestamp: string }>()
  
  const picks = await db.prepare(`
    SELECT *
    FROM draft_ratings
    WHERE team_id = ?
    AND snapshot_timestamp = ?
    ORDER BY overall_pick ASC
  `).bind(teamId, latestSnapshot?.snapshot_timestamp).all<DraftPick>()

  return c.html(
    <div>
      <h2 class="text-lg sm:text-xl font-bold text-gray-900 mb-4">
        {picks?.results?.[0]?.team_name}'s Picks
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
                {picks?.results?.map((pick) => (
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
                        <span class={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs sm:text-sm font-medium ${getVerdictStyle(pick.verdict)}`}>
                          {pick.verdict}
                        </span>
                      </td>
                      <td class="hidden sm:table-cell px-4 py-3">
                        <div class="text-sm sm:text-base text-gray-900 break-words">{pick.average_points.toFixed(1)} avg fantasy points per game by all picks in round {pick.round}</div>
                        <div class="text-xs sm:text-sm text-gray-500 break-words">{pick.total_points.toFixed(1)} fantasy points per game by {pick.player_name}</div>
                      </td>
                    </tr>
                    {/* Mobile points row */}
                    <tr class="sm:hidden bg-gray-50">
                      <td colspan="3" class="px-4 py-2">
                        <div class="text-sm text-gray-900">{pick.average_points.toFixed(1)} avg fantasy points per game by all picks in round {pick.round}</div>
                        <div class="text-xs text-gray-700">{pick.total_points.toFixed(1)} average fantasy points per game by {pick.player_name}</div>
                      </td>
                    </tr>
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
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


export default app