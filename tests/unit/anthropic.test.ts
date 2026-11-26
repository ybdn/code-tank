import { describe, expect, it } from 'vitest'
import { urlAnthropicAutorisee } from '../../server/utils/anthropic'

describe('urlAnthropicAutorisee', () => {
  it('accepte l\'API d\'Anthropic et la machine locale', () => {
    expect(urlAnthropicAutorisee('https://api.anthropic.com/v1/messages/count_tokens')).toBe(true)
    expect(urlAnthropicAutorisee('http://127.0.0.1:4000/v1/messages/count_tokens')).toBe(true)
    expect(urlAnthropicAutorisee('http://localhost:4000/x')).toBe(true)
  })
  it('refuse toute autre destination', () => {
    for (const v of ['', 'pas une url', 'http://api.anthropic.com/v1', 'https://api.anthropic.com.evil.example/v1', 'https://evil.example/v1',
      'https://api.anthropic.com@evil.example/v1', 'https://127.0.0.1/x', 'http://127.0.0.1.evil.example/x', 'ftp://localhost/x']) {
      expect(urlAnthropicAutorisee(v), v).toBe(false)
    }
  })
})
