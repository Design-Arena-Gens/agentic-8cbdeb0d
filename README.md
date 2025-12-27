## LinkedIn Post Navigator

Agentic workflow for generating daily LinkedIn posts from your own talking points. Capture topics, tag the tone, and let the built-in AI assistant produce polished drafts on demand.

### Quick start

```bash
cd agentic-linkedin
npm install
npm run dev
```

The app runs at `http://localhost:3000`.

### Environment

Create an `.env.local` file inside `agentic-linkedin/` with your OpenAI key:

```
OPENAI_API_KEY=sk-...
```

The generator calls the `gpt-4o-mini` model through the official OpenAI SDK. Drafts stay in your browser’s local storage—no backend database required.

### Core features

- Topic planner with tone, hook style, CTA, hashtags, and key points
- Local queue sorted by scheduled date
- One-click AI draft generation + regeneration
- Clipboard copy + status tracking (scheduled → generated → posted)
- Daily dashboard to monitor today’s queue and ready-to-ship drafts

### Tech stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS
- Edge-ready API route powered by the OpenAI SDK

### Deployment

The app is optimized for Vercel. Build with `npm run build` and deploy using the provided CLI command in the prompt.
