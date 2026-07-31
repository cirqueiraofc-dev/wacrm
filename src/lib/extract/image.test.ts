import { describe, it, expect } from 'vitest'
import { buildVisionRequest, DEFAULT_IMAGE_PROMPT } from './image'

const base = {
  model: 'test-model',
  apiKey: 'sk-test',
  prompt: DEFAULT_IMAGE_PROMPT,
  base64: 'QUJD', // "ABC"
  mimeType: 'image/png',
}

describe('buildVisionRequest', () => {
  it('builds an OpenAI chat-completions payload with an inline data URL', () => {
    const req = buildVisionRequest({ provider: 'openai', ...base })
    expect(req.url).toBe('https://api.openai.com/v1/chat/completions')
    expect(req.headers.Authorization).toBe('Bearer sk-test')

    const body = req.body as {
      model: string
      messages: { role: string; content: unknown[] }[]
    }
    expect(body.model).toBe('test-model')
    const content = body.messages[0].content as {
      type: string
      text?: string
      image_url?: { url: string }
    }[]
    expect(content[0]).toEqual({ type: 'text', text: DEFAULT_IMAGE_PROMPT })
    expect(content[1].type).toBe('image_url')
    expect(content[1].image_url?.url).toBe('data:image/png;base64,QUJD')
  })

  it('builds an Anthropic messages payload with a base64 image block', () => {
    const req = buildVisionRequest({ provider: 'anthropic', ...base })
    expect(req.url).toBe('https://api.anthropic.com/v1/messages')
    expect(req.headers['x-api-key']).toBe('sk-test')
    expect(req.headers['anthropic-version']).toBe('2023-06-01')

    const body = req.body as {
      messages: { role: string; content: Record<string, unknown>[] }[]
    }
    const content = body.messages[0].content
    expect(content[0]).toMatchObject({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: 'QUJD' },
    })
    expect(content[1]).toEqual({ type: 'text', text: DEFAULT_IMAGE_PROMPT })
  })
})
