# Knowledge storage and retrieval

The active knowledge flow uses two existing tables:

| Table               | Stored data                                                                       |
| ------------------- | --------------------------------------------------------------------------------- |
| `knowledge_sources` | ID, type, title, original reference, creation date, embedding model, content hash |
| `knowledge_chunks`  | ID, source ID, text, embedding, creation date                                     |

Original PDF files, raw HTML, complete duplicate document text, generated summaries, and per-request retrieval results are not stored. The only added columns are `embedding_model` (up to 255 characters) and `content_hash` (64 characters), once per source. The unique hash prevents duplicate indexed content, including simultaneous uploads. Text chunks retain a small overlap for context.

`users` remains necessary for authentication. The existing `query_logs` table and its rows are preserved, but neither answer endpoint writes chat history unless `QUERY_LOGGING_ENABLED=true` is explicitly set. The frontend already stores conversations locally. If logging is enabled for diagnostics, establish an appropriate retention period; there is no automatic log deletion.

## Upgrade an existing database

Keep the backend stopped or in maintenance while migrating and reindexing:

```sh
npm run build
npm run migration:run
npm run knowledge:reindex
npm run start:prod
```

The migration adds nullable metadata columns and a unique hash constraint. It does not delete existing knowledge, chat logs or users. Unknown embeddings cannot be safely assigned a model by examining their dimensions, so the reindex command regenerates them with the configured provider. This calls the embedding API and may incur charges. It commits each source atomically, leaves a source's old vectors intact if embedding generation fails, and can be rerun to resume. Existing duplicate sources are preserved; subsequent uploads reuse an indexed copy.

Run with the same provider/environment for reindexing and the application. `DB_SYNCHRONIZE=false` is recommended for normal operation. This incremental migration expects the application's base tables to exist. For a new disposable development database, initialize the existing base schema with `DB_SYNCHRONIZE=true`, then turn it off; production schema provisioning must include the base schema first.

Changing only the reply model does not require reindexing. Changing the embedding model does. Sources with a missing or different embedding model are excluded from retrieval and reported with `needsReindex: true`. If the embedding model changes behind the same configured name, use:

```sh
npm run knowledge:reindex -- --all
```

## API

Knowledge routes require an admin JWT:

| Method | Route                    | Input                                                |
| ------ | ------------------------ | ---------------------------------------------------- |
| GET    | `/knowledge`             | None; returns source summaries with `needsReindex`   |
| POST   | `/knowledge/qa`          | `{ "question": "Check-in time?", "answer": "2 PM" }` |
| POST   | `/knowledge/url`         | `{ "url": "https://example.com/policies" }`          |
| POST   | `/knowledge/upload`      | Multipart PDF field `file`, maximum 20 MB            |
| POST   | `/knowledge/:id/reindex` | None; rebuilds that source's embeddings              |
| DELETE | `/knowledge/:id`         | Deletes the source and its chunks                    |

Duplicates return the existing source with `duplicate: true`. Documents over 60,000 normalized characters are rejected with a clear error rather than silently truncated. Split larger documents into smaller topics. PDF text extraction requires readable text; OCR is not included. Ingestion and reindexing are synchronous and process bounded documents; no queue or additional database is introduced.

Both answer endpoints use the same retrieval path. `/query` preserves `answer`; `/agent/generate-reply` preserves `reply` and `fallback`. The additional `sources` array identifies retrieved source references, not independently verified sentence-level citations. Existing frontend response fields remain compatible. Fallbacks return an empty source array.

## Retrieval and operational limits

- Questions must be nonempty and at most 2,000 characters.
- Only compatible, finite, nonzero embeddings participate. The best five matches above `KNOWLEDGE_SIMILARITY_THRESHOLD` are used.
- Embeddings are scanned in pages of 200, and only matching document text is loaded. This bounds application memory but remains a linear scan. A large corpus or high traffic will need indexed vector search; this implementation deliberately keeps the existing MySQL storage.
- Application rules are supplied separately from the untrusted question and excerpts, using OpenAI instructions or an Ollama system message. The model is told to fall back for insufficient or conflicting information. This reduces risk but does not prove factual correctness or eliminate prompt injection.
- URL ingestion validates every redirect, blocks non-public addresses, pins the HTTP connection to validated DNS results, and disables environment proxies. Use network egress restrictions as another layer in production.
- Validate the similarity threshold with representative answerable, unrelated and conflicting support questions before rollout. Passing regression tests validates control flow, not live LLM accuracy.

Implementation references: [OpenAI prompt guidance](https://developers.openai.com/api/docs/guides/prompt-engineering), [OWASP SSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html).
