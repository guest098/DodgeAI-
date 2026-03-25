# How To Run

## 1. Install prerequisites

- Node.js 20+
- npm

## 2. Install dependencies

```bash
npm install
```

## 3. Create environment file

Copy `.env.example` to `.env`

Set at least:

```env
PORT=4000
DATASET_ROOT=./dataset/sap-o2c-data
SQLITE_PATH=./apps/api/data/o2c.sqlite
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash-lite
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=openai/gpt-oss-20b
OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_MODEL=openai/gpt-oss-20b:free
OPENROUTER_SITE_URL=http://localhost:5173
OPENROUTER_APP_NAME=sap-order-to-cash-graph
```

## 4. Ingest the dataset

```bash
npm run ingest
```

## 5. Start the app

```bash
npm run dev
```

## 6. Open in browser

- Frontend: `http://localhost:5173`
- API: `http://localhost:4000/api/health`
