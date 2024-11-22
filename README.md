# Draft Ratings Dashboard

## Prerequisites

- Node.js >= 16
- pnpm
- Cloudflare account

## Installation

```bash
# Install npx if not installed
pnpm install -g npx

# Install Wrangler
pnpm install -g wrangler

# Clone and install deps
git clone <repository-url>
cd draft-ratings-dashboard
pnpm install

# Login to Cloudflare
npx wrangler login

# Create D1 database
npx wrangler d1 create draft-ratings
```

Update `wrangler.toml`:
```toml
[[d1_databases]]
binding = "DB"
database_name = "draft-ratings"
database_id = "your-database-id"
```

## Development

```bash
# Run migrations (local only)
npx wrangler d1 execute draft-ratings --file=./schema.sql

# Start dev server
npx wrangler dev
```

## Deployment

```bash 
# Deploy
npx wrangler deploy

# Run prod migrations (no --local flag)
npx wrangler d1 execute draft-ratings --file=./schema.sql
```

