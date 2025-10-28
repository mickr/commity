# Commity Worker

Cloudflare Worker proxy for Fireworks AI API.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a KV namespace:
```bash
npx wrangler kv:namespace create RATE_LIMIT
npx wrangler kv:namespace create RATE_LIMIT --preview
```

3. Update `wrangler.toml` with the KV namespace IDs from step 2

4. Set your Fireworks API key as a secret:
```bash
npx wrangler secret put FIREWORKS_API_KEY
```

5. Deploy:
```bash
npm run deploy
```

## Local Development

1. Create `.dev.vars` file with your API key:
```
FIREWORKS_API_KEY=your-fireworks-api-key-here
```

2. Start dev server:
```bash
npm run dev
```

## Endpoints

- `POST /api/generate` - Generate commit message
  - Body: `{ "prompt": "your prompt here" }`
  - Returns: `{ "message": "generated commit message" }`
  
- `GET /health` - Health check

## Rate Limiting

- 100 requests per hour per IP (configurable in `wrangler.toml`)
