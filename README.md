# The Summarizer ✦

An AI-powered web app that summarizes plain text, YouTube videos, and PDF documents — built with React, Vite, and the Groq API.

**Live app:** https://my-summarizer-virid.vercel.app
**Repo:** https://github.com/Mansi-Upadhyay-12/AI-powered-summarizer

> This README is written so that if I come back to this project in 6 months and forget everything, I can read this top to bottom and understand exactly what I built, why I made each decision, and how to run/change it again.

---

## 1. What this project does

A single-page app with three tabs:
- **Plain Text** — paste any text, get a summary
- **YouTube** — paste a video URL, it fetches the transcript and summarizes that
- **PDF File** — upload a PDF, extract its text in the browser, and summarize it

For each, you can pick a summary length: **Brief** (2–3 sentences), **Standard** (1 paragraph), or **Detailed** (structured breakdown with headings/bullets).

## 2. Why I built it this way (the reasoning, not just the code)

**Why Groq instead of OpenAI/Gemini?**
Groq runs open models (I used Llama 3.3 70B) on custom LPU hardware instead of GPUs, which makes responses noticeably faster. For a "paste text, get summary instantly" tool, that latency advantage mattered more than model choice flexibility.

**Why Vite instead of Create React App or Next.js?**
Vite gives near-instant dev server startup and hot reload, and I didn't need Next.js's server-side rendering or routing for a single-page tool like this. Simpler tool for the actual job.

**Why a serverless function instead of calling Groq directly from the frontend?**
This was the most important architectural decision in the project, and I got it wrong on the first version — worth remembering why.

Originally, `App.jsx` called Groq's API directly from the browser using `import.meta.env.VITE_GROQ_API_KEY`. The problem: **anything prefixed `VITE_` in a Vite project gets bundled into the public JavaScript that ships to every visitor's browser.** That means my API key was sitting in plain view in the browser's dev tools / network tab for anyone to copy and use on my account.

The fix: move the Groq call into `api/summarize.js`, a **Vercel serverless function**. The frontend now calls my own `/api/summarize` endpoint instead of Groq directly. The actual Groq key lives only as a server-side environment variable (`GROQ_API_KEY`, no `VITE_` prefix) that the serverless function reads with `process.env.GROQ_API_KEY` — this value never gets sent to the browser at all.

**Lesson for future me:** any environment variable prefixed `VITE_` (or `NEXT_PUBLIC_`, `REACT_APP_`, etc. in other frameworks) is PUBLIC by design. Only use that prefix for things that are safe to expose (like a public analytics ID). Secrets always go through a backend.

## 3. Architecture

```
User Input (text / YouTube URL / PDF)
        │
        ▼
React Frontend (src/App.jsx)
   - PDF text extracted client-side via pdf.js
   - YouTube transcript fetched from a public transcript API
        │
        ▼
POST /api/summarize  (Vercel serverless function, api/summarize.js)
   - Reads GROQ_API_KEY from server-side environment variable
   - Forwards the request to Groq's chat completions endpoint
        │
        ▼
Groq API (Llama 3.3 70B) — generates the summary
        │
        ▼
Response flows back through the serverless function to the frontend
        │
        ▼
Summary rendered in the UI (custom lightweight markdown renderer for
Detailed mode's headings/bullets)
```

## 4. Tech stack

| Layer | Tech | Why |
|---|---|---|
| Frontend | React 19 + Vite | Fast dev experience, no unneeded SSR/routing |
| Styling | Plain CSS-in-JS (template literal in App.jsx) | No extra build tooling needed for a single-page app |
| LLM | Groq API (Llama 3.3 70B) | Low latency inference |
| PDF parsing | pdf.js (loaded via CDN import) | Runs entirely client-side, no file upload to a server needed |
| YouTube transcripts | yt-transcript-api (public API) | Fetches captions without needing YouTube's own API key |
| Backend | Vercel Serverless Function (`api/summarize.js`) | Keeps the Groq key off the client; zero extra server to manage |
| Hosting | Vercel | Free tier, auto-deploys from GitHub, handles both static frontend + serverless function together |

## 5. Project structure

```
my-summarizer/
├── api/
│   └── summarize.js      # Serverless function — the ONLY place GROQ_API_KEY is read
├── src/
│   ├── App.jsx            # Everything: tabs, PDF/YouTube/text handling, UI, styling
│   ├── main.jsx            # React entry point
│   └── App.css / index.css
├── public/
├── .env                    # LOCAL ONLY — never committed, holds GROQ_API_KEY
├── .gitignore              # Must include `.env` — this is what keeps the key out of git
├── vite.config.js
└── package.json
```

## 6. Environment variables

| Name | Where it lives | Purpose |
|---|---|---|
| `GROQ_API_KEY` | Local `.env` (dev) + Vercel Project Settings → Environment Variables (production) | Used only inside `api/summarize.js` via `process.env.GROQ_API_KEY`. Never prefixed with `VITE_`. |

**If I ever regenerate this key:** update it in two places — my local `.env` file, AND Vercel's dashboard (Settings → Environment Variables) — then redeploy with `vercel --prod` so the live site picks up the new value.

## 7. Running it locally

```bash
git clone https://github.com/Mansi-Upadhyay-12/AI-powered-summarizer.git
cd AI-powered-summarizer
npm install

# create .env with my Groq key (get one at console.groq.com)
echo "GROQ_API_KEY=your_key_here" > .env

# Vercel CLI is required locally too, because plain `npm run dev`
# does NOT run the /api serverless function — only `vercel dev` does
npm install -g vercel
vercel dev
```
Open the local URL it prints (something like `http://localhost:3000`).

## 8. Deploying

```bash
vercel --prod
```
First time only: also go to the Vercel dashboard → this project → **Settings → Environment Variables** → add `GROQ_API_KEY` there (checked for Production, Preview, and Development) before the key will work live. Redeploy after adding it if the first deploy happened before the variable was set.

## 9. Known limitations / things to improve later

- **No chunking for very large PDFs** — if a PDF's extracted text exceeds the model's context window, the request will fail or get truncated. A fix would be splitting text into chunks, summarizing each, then summarizing the summaries (map-reduce).
- **No retry/backoff on API failure** — if Groq's API times out or rate-limits, the user just sees a generic error. Could add automatic retries with exponential backoff.
- **No automated tests yet** — would want to add Vitest tests for `api/summarize.js` (checking it rejects non-POST requests, missing fields, etc.) and a couple of component tests for the tab-switching logic.
- **YouTube transcript fetching depends on a third-party public API** — if that service goes down, the YouTube tab breaks. Worth having a fallback or self-hosted transcript fetcher eventually.

## 10. Quick troubleshooting notes to future me

- **Getting a 401 error?** Almost always means `GROQ_API_KEY` is missing, wrong, or the key was revoked. Check it's set with no `VITE_` prefix, and restart `vercel dev` after editing `.env` (it only reads env vars on startup, not live).
- **Local test works but live site doesn't?** You forgot to add `GROQ_API_KEY` in Vercel's dashboard — your local `.env` never gets uploaded, it's a separate value that has to be set on Vercel's side too.
- **Committed `.env` by accident?** Revoke the key immediately on console.groq.com and generate a new one — don't just delete the file from a future commit, since old commit history still has it.

## Author

**Mansi Upadhyay**
B.Tech CSE, Galgotias University
[GitHub](https://github.com/Mansi-Upadhyay-12) · [LinkedIn](#) · [LeetCode](#)
