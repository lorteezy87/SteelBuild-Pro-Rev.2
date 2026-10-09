import { describe, expect, it } from 'vitest';
import { classifyAttachmentContent } from '../attachmentContent';
const bytes = (text: string) => new TextEncoder().encode(text);
describe('server attachment admission', () => {
  it.each([
    ['drawing.svg', 'image/svg+xml', '<svg onload="alert(1)"></svg>'],
    ['drawing.pdf', 'application/pdf', '<!doctype html><html>spoofed</html>'],
    ['drawing.txt', 'text/plain', '<!-- comment -->\n<svg>active</svg>'],
    ['drawing.csv', 'text/html', 'Name,Weight'],
    ['drawing.xml', 'application/octet-stream', '<?xml version="1.0"?><data/>'],
    ['drawing.png', 'image/png', 'not a png'],
    ['drawing.exe', 'application/octet-stream', 'MZbinary'],
  ])('rejects active or mismatched %s', (filename, contentType, data) => {
    expect(classifyAttachmentContent({ filename, contentType, bytes: bytes(data) }).allowed).toBe(false);
  });
  it('detects UTF-16 disguised HTML', () => {
    const data = new Uint8Array([0xff, 0xfe, ...[...'<html>'].flatMap(char => [char.charCodeAt(0), 0])]);
    expect(classifyAttachmentContent({ filename: 'notes.txt', bytes: data }).allowed).toBe(false);
  });
  it.each([
    ['drawing.pdf', 'application/pdf', [37, 80, 68, 70, 45, 49, 46, 55]],
    ['photo.png', 'image/png', [137, 80, 78, 71, 13, 10, 26, 10]],
    ['photo.jpg', 'image/jpeg', [255, 216, 255, 224]],
    ['photo.gif', 'image/gif', [...bytes('GIF89a')]],
    ['photo.webp', 'image/webp', [...bytes('RIFF1234WEBP')]],
  ])('recognizes %s from bytes', (filename, contentType, data) => {
    expect(classifyAttachmentContent({ filename, contentType, bytes: new Uint8Array(data) })).toEqual({ allowed: true, contentType, inlineSafe: true, disposition: 'attachment' });
  });
  it.each(['dwg', 'dxf', 'ifc', 'ifczip', 'docx', 'xlsx', 'csv', 'nc1'])('preserves %s construction files as forced binary downloads', extension => {
    expect(classifyAttachmentContent({ filename: `file.${extension}`, contentType: 'application/untrusted', bytes: bytes('normal construction data') })).toEqual({ allowed: true, contentType: 'application/octet-stream', inlineSafe: false, disposition: 'attachment' });
  });
  it('rejects mismatched declared image MIME and misleading extension', () => {
    expect(classifyAttachmentContent({ filename: 'file.png', contentType: 'image/png', bytes: bytes('%PDF-1.7') }).allowed).toBe(false);
    expect(classifyAttachmentContent({ filename: 'file.pdf', contentType: 'image/png', bytes: bytes('%PDF-1.7') }).allowed).toBe(false);
  });
  it.each([
    ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  ])('accepts the standard %s MIME as a forced download', (extension, contentType) => {
    expect(classifyAttachmentContent({ filename: `file.${extension}`, contentType, bytes: bytes('PK\u0003\u0004office archive') }))
      .toEqual({ allowed: true, contentType: 'application/octet-stream', inlineSafe: false, disposition: 'attachment' });
  });
  it.each(['application/xml', 'text/xml', 'application/atom+xml', 'image/svg+xml', 'application/xhtml+xml', 'application/javascript'])('still denies active MIME %s on a download extension', contentType => {
    expect(classifyAttachmentContent({ filename: 'file.docx', contentType, bytes: bytes('PK\u0003\u0004archive') }).allowed).toBe(false);
  });
});
