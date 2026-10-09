// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { EmailBodyContent } from '../components';

afterEach(cleanup);
it('blocks remote resources by default, allows deliberate images, and resets for a different message', () => {
  const body = '<p>Framing approved</p><img src="https://tracker.example/image.png"><style>@import "https://tracker.example/css"</style>';
  const view = render(<EmailBodyContent message={{ id: 'first', body_html: body }} attachments={[]} />);
  const frame = () => screen.getByTitle('Email body') as HTMLIFrameElement;
  expect(frame().getAttribute('sandbox')).toBe('allow-same-origin');
  expect(frame().srcdoc).not.toContain('src="https://tracker.example/image.png"');
  fireEvent.click(screen.getByRole('button', { name: 'Load images for this message' }));
  expect(frame().srcdoc).toContain('src="https://tracker.example/image.png"');
  expect(frame().srcdoc).not.toContain('@import');
  view.rerender(<EmailBodyContent message={{ id: 'second', body_html: body }} attachments={[]} />);
  expect(frame().srcdoc).not.toContain('src="https://tracker.example/image.png"');
});
it('renders attacker-provided attachment names as text with no inline active document or raw link', () => {
  render(<EmailBodyContent message={{ id: 'mail', body_text: 'See attached drawing.' }} attachments={[{ id: 'attachment', filename: '<img src=x onerror=alert(1)>.svg', storage_path: 'javascript:alert(1)', content_type: 'image/svg+xml' }]} />);
  expect(screen.getByText('<img src=x onerror=alert(1)>.svg')).toBeTruthy();
  expect(screen.queryByRole('img')).toBeNull(); expect(screen.queryByRole('link')).toBeNull();
});
