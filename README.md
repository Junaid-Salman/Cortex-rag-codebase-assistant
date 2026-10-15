# Cortex

A RAG-powered codebase Q&A assistant — point it at a repo, ask natural-language
questions, and get back answers grounded in the actual code, with file citations.

```
$ node src/cli.js ask my-project "What does this codebase do?"

This codebase sets up a basic web server using Express.js. It serves
static files from the 'public' directory and has two main routes...
(file path: server.js)
```

---

## Why this project

Most beginner RAG projects are "chat with your PDF." This one applies RAG to
source code instead — a harder, more realistic domain that surfaces the parts
of RAG that actually matter in practice: chunking strategy, hybrid retrieval,
and measurable evaluation, not just "call an embeddings API."

The project is being built in deliberate phases, each one a recognized
category of RAG architecture:

| Phase | RAG Category | Status |
|---|---|---|
| v0 — naive retrieve-then-generate | Naive RAG | ✅ Working |
| v1 — AST-aware chunking | Advanced RAG (pre-retrieval optimization) | 🚧 In progress |
| v2 — vector + code-graph retrieval | Hybrid RAG / Graph RAG | ⬜ Planned |
| v3 — evaluation harness + citations | — | ⬜ Planned |
| Future — self-grading retrieval, agentic tool use, conversational memory | Corrective RAG / Agentic RAG / Conversational RAG | 💭 Roadmap |

---

## Stack

| Layer | Choice |
|---|---|
| Language | JavaScript (Node.js) |
| RAG framework | [LangChain.js](https://js.langchain.com) |
| Embeddings | [Ollama](https://ollama.com) — `nomic-embed-text` (local, free) |
| Generation | Ollama — `llama3.1:8b` (local, free) |
| Vector store | [Supabase](https://supabase.com) (Postgres + `pgvector`) |
| Code parsing (v1+) | `tree-sitter` |

No paid API keys required — embeddings and generation both run locally via Ollama.

---

## How it works

```
Your repo → chunk → embed (Ollama) → store (Supabase)
Your question → embed (Ollama) → search (Supabase) → retrieved chunks → generate (Ollama) → cited answer
```

1. **Ingestion** — walks a target repo, filters to relevant source files
2. **Embedding & storage** — chunks are embedded locally via Ollama and stored in Supabase as vectors
3. **Retrieval** — a question is embedded the same way, then matched against stored chunks via similarity search
4. **Generation** — retrieved chunks are passed to a local LLM, which answers using only that context and cites its sources

---

## Setup

### Prerequisites
- Node.js 18+
- [Ollama](https://ollama.com) installed locally
- A free [Supabase](https://supabase.com) project

### 1. Install Ollama models
```bash
ollama pull llama3.1:8b
ollama pull nomic-embed-text
```

### 2. Set up Supabase
In your Supabase project's SQL editor, run:
```sql
create extension if not exists vector;

create table code_chunks (
  id uuid primary key default gen_random_uuid(),
  content text,
  metadata jsonb,
  embedding vector(768)
);

create or replace function match_code_chunks (
  query_embedding vector(768),
  match_count int default 5,
  filter jsonb default '{}'
) returns table (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    code_chunks.id,
    code_chunks.content,
    code_chunks.metadata,
    1 - (code_chunks.embedding <=> query_embedding) as similarity
  from code_chunks
  where code_chunks.metadata @> filter
  order by code_chunks.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Code graph (functions, call/reference sites, imports) used by the
-- graph retriever for structural questions like "what calls X".
create table if not exists code_graph (
  id bigint generated always as identity primary key,
  repo text not null,
  kind text not null,          -- 'function' | 'reference' | 'import'
  name text,
  scope text,
  file text,
  start_line int,
  end_line int,
  data jsonb
);
create index if not exists code_graph_repo_kind_idx on code_graph (repo, kind);
create index if not exists code_graph_repo_name_idx on code_graph (repo, name);
```

### 3. Install dependencies
```bash
npm install --legacy-peer-deps
```

### 4. Configure environment
Create a `.env` file:
```env
SUPABASE_URL=your_project_url
SUPABASE_SERVICE_KEY=your_secret_key
```

---

## Usage

**Index a repo:**
```bash
node src/cli.js index <path-to-repo> <repo-name>
```

**Ask a question:**
```bash
node src/cli.js ask <repo-name> "How does authentication work in this repo?"
```

---

## Project structure

```
cortex/
├── src/
│   ├── ingest/
│   │   ├── loadRepo.js        # walks a repo, filters source files
│   │   └── buildIndex.js      # chunks, embeds, and stores in Supabase
│   ├── retrieval/
│   │   ├── vectorRetriever.js # (planned) vector similarity retrieval
│   │   └── graphRetriever.js  # (planned) call-graph / import-graph retrieval
│   ├── chain/
│   │   └── qaChain.js         # retrieval + generation chain
│   ├── eval/
│   │   ├── dataset.json       # (planned) Q&A pairs for evaluation
│   │   └── runEval.js         # (planned) retrieval hit-rate scoring
│   └── cli.js                 # entry point
├── .env
└── package.json
```

---

## Roadmap

- [x] **v0** — naive end-to-end RAG pipeline
- [ ] **v1** — AST-aware chunking (function/class-level chunks instead of character splits), with a documented before/after retrieval comparison
- [ ] **v2** — hybrid retrieval combining vector search with a code call-graph, for structural questions ("what calls this function")
- [ ] **v3** — evaluation harness with measured retrieval hit-rate, plus file/line citations on generated answers
- [ ] Embedding space visualization (2D projection of stored vectors, to sanity-check chunking quality)
- [ ] Corrective RAG — self-grading retrieval with automatic re-querying
- [ ] Agentic RAG — model-driven, multi-step retrieval across vector + graph sources
- [ ] Conversational memory — multi-turn question answering with follow-up resolution

---

## License

MIT
