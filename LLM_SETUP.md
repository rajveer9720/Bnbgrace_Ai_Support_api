# LLM setup

Set these values in `.env` for OpenAI testing:

```dotenv
LLM_PROVIDER=openai
OPENAI_API_KEY=your_actual_api_key
OPENAI_MODEL=gpt-4o-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

Restart with `npm run start:dev`. Keep the existing database and JWT settings.

Send an authenticated `POST /query` with `Authorization: Bearer <jwt>` and JSON body `{"prompt":"What is the check-in time?"}`. It retrieves uploaded knowledge and returns `{"answer":"...","fallback":false,"sources":[...]}`. It no longer bypasses knowledge retrieval.

`POST /agent/generate-reply` accepts `{"question":"..."}` and returns `{"reply":"...","fallback":false,"sources":[...]}`. It requires an agent or admin JWT and stored embeddings from the selected embedding model. Without relevant chunks it returns the supervisor fallback. Both routes use the same retrieval flow. Query logging is off by default (`QUERY_LOGGING_ENABLED=false`).

`GET /knowledge` lists uploaded sources, including `needsReindex`. Admins can upload PDF, URL or Q&A knowledge. See [KNOWLEDGE.md](KNOWLEDGE.md) for endpoints and migration instructions.

For Ollama, pull the configured models:

```sh
ollama pull llama3.1:8b
ollama pull nomic-embed-text
```

Then set:

```dotenv
LLM_PROVIDER=ollama
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
```

Restart the backend. OpenAI code can remain; it is not called in Ollama mode. The OpenAI key can be removed from `.env` when it is no longer needed.

Before deploying this change against an existing database, run `npm run migration:run`, then `npm run knowledge:reindex`. Do the same reindex step after changing the embedding provider or model. The command regenerates vectors for sources with unknown or different models. Admins can also call `POST /knowledge/:id/reindex`. Retrieval excludes unknown or incompatible models, even when vector lengths match. Use a stable embedding model version/tag; if a provider changes a model behind the same name, run `npm run knowledge:reindex -- --all`.

OpenAI uses the [Responses API](https://developers.openai.com/api/reference/cli/resources/responses/methods/create) for replies and the [Embeddings API](https://developers.openai.com/api/docs/guides/embeddings) for vectors. Model names are configurable. Requests time out after 60 seconds; provider failures do not automatically send data to another provider.
