import { describe, expect, it } from 'vitest'
import { extractInAppPath } from '../capacitor'

describe('native Universal Link routing', () => {
  it('accepts only HTTPS links on the exact product domains', () => {
    expect(extractInAppPath('https://steelbuild-pro.com/projects/123?tab=drawings#sheet')).toBe('/projects/123?tab=drawings#sheet')
    expect(extractInAppPath('https://www.steelbuild-pro.com/settings')).toBe('/settings')
    for (const url of [
      'http://steelbuild-pro.com/projects/123',
      'https://steelbuild-pro.com.evil.example/projects/123',
      'https://evil.example/projects/123',
      'https://steelbuild-pro.com:8443/projects/123',
      'steelbuildpro://projects/123',
      'https://steelbuild-pro.com/',
    ]) {
      expect(extractInAppPath(url)).toBeNull()
    }
  })
})
