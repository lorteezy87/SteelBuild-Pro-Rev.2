// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildSafeEmailDocument } from '../emailBody';

const read = (html: string) => new DOMParser().parseFromString(html, 'text/html');
describe('untrusted email body', () => {
  it('preserves steel document text/tables while blocking tracking and active content', () => {
    const output = buildSafeEmailDocument(`<h2>Shop drawing review</h2><table><tr><td colspan="2">W24×55</td></tr></table>
      <img src="https://tracker.example/pixel" srcset="https://tracker.example/2 2x" onerror="alert(1)">
      <p style="background:url(https://tracker.example/css)">Approved</p><style>@import 'https://tracker.example/style';</style>
      <link href="https://tracker.example/font" rel="stylesheet"><meta http-equiv="refresh" content="0;url=https://tracker.example">
      <form action="https://tracker.example"><input name="secret"></form><iframe src="https://tracker.example"></iframe>
      <svg><a href="javascript:alert(1)">SVG</a></svg><script>alert(1)</script>`);
    const doc = read(output.html);
    expect(doc.body.textContent).toContain('W24×55'); expect(doc.querySelector('td')?.getAttribute('colspan')).toBe('2');
    expect(doc.body.querySelector('script,style,link,meta,form,iframe,svg,[style],[onerror],[srcset],[src]')).toBeNull();
    expect(doc.querySelector('meta[http-equiv]')?.getAttribute('content')).toContain("img-src 'none'");
    expect(output.blockedImages).toBe(1);
  });
  it('opt-in allows HTTPS images only, with no referrer and no other remote channels', () => {
    const output = buildSafeEmailDocument('<img src="https://images.example/beam.png"><img src="data:image/svg+xml,evil"><img src="//tracker.example/a"><a href="javascript:alert(1)">bad</a>', true);
    const doc = read(output.html);
    expect([...doc.querySelectorAll('[src]')].map(element => element.getAttribute('src'))).toEqual(['https://images.example/beam.png']);
    expect(doc.querySelector('[src]')?.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(doc.querySelector('a')?.hasAttribute('href')).toBe(false);
    expect(doc.querySelector('meta[http-equiv]')?.getAttribute('content')).toContain("connect-src 'none'");
  });
  it('rejects namespace and malformed-markup attempts without removing ordinary text', () => {
    const doc = read(buildSafeEmailDocument('<p>Safe</p><a href="https://safe.example/drawing">Drawing</a><math><mtext><table><mglyph><style><!--</style><img title="--><img src=x onerror=alert(1)>"></math>').html);
    expect(doc.body.querySelector('[onerror],math,svg,script')).toBeNull();
    expect(doc.body.textContent).toContain('Safe');
    expect(doc.querySelector('a')?.getAttribute('href')).toBe('https://safe.example/drawing');
  });
});
