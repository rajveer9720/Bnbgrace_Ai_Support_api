# LLM setup

Set these values in `.env` for OpenAI testing:

```dotenv
LLM_PROVIDER=openai
OPENAI_API_KEY=your_actual_api_key
OPENAI_MODEL=gpt-4o-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

Restart with `npm run start:dev`. Keep the existing database and JWT settings.

Send an authenticated `POST /query` with `Authorization: Bearer <jwt>` and JSON body `{"prompt":"Say hello"}`. The response is `{"answer":"..."}`. This route tests generation without knowledge chunks.

`POST /agent/generate-reply` accepts `{"question":"..."}` and uses knowledge chunks, similarity matching and query logging. It requires an agent or admin JWT and stored embeddings from the selected embedding model. Without relevant chunks it returns the supervisor fallback.

`GET /knowledge` currently lists models from the selected provider. It does not upload or ingest knowledge documents.

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

Before using knowledge retrieval after changing providers or embedding models, regenerate every stored chunk embedding using the injected `LlmProvider.getEmbedding(chunk.content)`. This project currently has no ingestion or reindex endpoint. Embeddings from different models must not be mixed, even if their lengths match.

OpenAI uses the [Responses API](https://developers.openai.com/api/reference/cli/resources/responses/methods/create) for replies and the [Embeddings API](https://developers.openai.com/api/docs/guides/embeddings) for vectors. Model names are configurable. Requests time out after 60 seconds; provider failures do not automatically send data to another provider.
