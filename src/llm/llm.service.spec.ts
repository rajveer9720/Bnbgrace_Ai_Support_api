import { ConfigService } from '@nestjs/config';

import { LlmService } from './llm.service.js';

const http = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }));

vi.mock('axios', () => ({ default: http }));

describe('LlmService', () => {
  const makeService = (config: Record<string, string>) =>
    new LlmService(new ConfigService(config));

  beforeEach(() => vi.resetAllMocks());

  it('extracts OpenAI text after reasoning output without calling Ollama', async () => {
    http.post.mockResolvedValue({
      data: {
        status: 'completed',
        output: [
          { type: 'reasoning' },
          {
            type: 'message',
            content: [{ type: 'output_text', text: 'Hello' }],
          },
        ],
      },
    });
    const service = makeService({
      LLM_PROVIDER: 'openai',
      OPENAI_API_KEY: 'test-key',
      OPENAI_MODEL: 'test-model',
    });
    await expect(service.generateReply('Hi')).resolves.toBe('Hello');
    expect(http.post).toHaveBeenCalledExactlyOnceWith(
      'https://api.openai.com/v1/responses',
      { model: 'test-model', input: 'Hi', store: false },
      { headers: { Authorization: 'Bearer test-key' }, timeout: 60000 },
    );
  });

  it('requests numeric OpenAI embeddings', async () => {
    http.post.mockResolvedValue({
      data: { data: [{ embedding: [0.2, 0.5] }] },
    });
    const service = makeService({
      LLM_PROVIDER: 'openai',
      OPENAI_API_KEY: 'test-key',
    });
    await expect(service.getEmbedding('Hello')).resolves.toEqual([0.2, 0.5]);
    expect(http.post).toHaveBeenCalledWith(
      'https://api.openai.com/v1/embeddings',
      {
        model: 'text-embedding-3-small',
        input: 'Hello',
        encoding_format: 'float',
      },
      expect.any(Object),
    );
  });

  it('uses Ollama for chat and embeddings without an OpenAI key', async () => {
    http.post
      .mockResolvedValueOnce({ data: { message: { content: 'Local reply' } } })
      .mockResolvedValueOnce({ data: { embeddings: [[0.3, 0.7]] } });
    const service = makeService({
      LLM_PROVIDER: 'ollama',
      OLLAMA_URL: 'http://localhost:11434/',
    });
    await expect(service.generateReply('Hi')).resolves.toBe('Local reply');
    await expect(service.getEmbedding('Hi')).resolves.toEqual([0.3, 0.7]);
    expect(http.post).toHaveBeenNthCalledWith(
      1,
      'http://localhost:11434/api/chat',
      expect.objectContaining({ stream: false }),
      { headers: undefined, timeout: 60000 },
    );
    expect(http.post).toHaveBeenNthCalledWith(
      2,
      'http://localhost:11434/api/embed',
      expect.objectContaining({ input: 'Hi' }),
      { headers: undefined, timeout: 60000 },
    );
  });

  it('rejects missing keys and unsupported providers before any request', async () => {
    await expect(
      makeService({ LLM_PROVIDER: 'openai', OPENAI_API_KEY: '' }).generateReply(
        'Hi',
      ),
    ).rejects.toThrow('OPENAI_API_KEY is required');
    await expect(
      makeService({ LLM_PROVIDER: 'invalid' }).generateReply('Hi'),
    ).rejects.toThrow('LLM_PROVIDER must be');
    expect(http.post).not.toHaveBeenCalled();
  });

  it('rejects blank input before any request', async () => {
    await expect(
      makeService({ LLM_PROVIDER: 'ollama' }).generateReply('  '),
    ).rejects.toThrow('non-empty');
    expect(http.post).not.toHaveBeenCalled();
  });

  it('does not expose upstream secrets or switch providers on failure', async () => {
    http.post.mockRejectedValue(new Error('Authorization: Bearer secret'));
    await expect(
      makeService({
        LLM_PROVIDER: 'openai',
        OPENAI_API_KEY: 'secret',
      }).generateReply('Hi'),
    ).rejects.toThrow('LLM request failed.');
    expect(http.post).toHaveBeenCalledTimes(1);
  });

  it('rejects incomplete responses and malformed embeddings', async () => {
    const service = makeService({
      LLM_PROVIDER: 'openai',
      OPENAI_API_KEY: 'test-key',
    });
    http.post.mockResolvedValueOnce({
      data: { status: 'incomplete', output: [] },
    });
    await expect(service.generateReply('Hi')).rejects.toThrow(
      'did not complete',
    );
    http.post.mockResolvedValueOnce({
      data: { data: [{ embedding: ['bad'] }] },
    });
    await expect(service.getEmbedding('Hi')).rejects.toThrow(
      'invalid embedding',
    );
  });

  it('lists OpenAI models without contacting Ollama', async () => {
    http.get.mockResolvedValue({
      data: { data: [{ id: 'test-model' }] },
    });
    await expect(
      makeService({
        LLM_PROVIDER: 'openai',
        OPENAI_API_KEY: 'test-key',
      }).getModels(),
    ).resolves.toEqual({
      provider: 'openai',
      models: [{ name: 'test-model' }],
    });
    expect(http.get).toHaveBeenCalledExactlyOnceWith(
      'https://api.openai.com/v1/models',
      { headers: { Authorization: 'Bearer test-key' }, timeout: 15000 },
    );
  });
});
