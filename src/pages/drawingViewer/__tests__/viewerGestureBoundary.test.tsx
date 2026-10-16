// @vitest-environment jsdom
import React from 'react';
import { readFileSync } from 'node:fs';
import { fireEvent, render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import ts from 'typescript';
import AnnotationLayer from '@/components/drawings/viewer/AnnotationLayer';

// Exercise the actual viewer's key expression with the actual gesture component.
// This is a boundary test, not a full routed viewer or PostgreSQL test.
const source = readFileSync('src/pages/DrawingViewer.jsx', 'utf8');
const expression = source.match(/<AnnotationLayer\s+key=\{([^\n]+)\}/)?.[1];
const drawing = { id: 'd', file_url: 'a.pdf', pdf_page: 1, revision_number: 'A' };
function key(row: typeof drawing, page: number, actor: string) {
  return expression ? new Function('projectId', 'activeDrawing', 'currentPage', 'currentRevision', 'userId', 'return ' + expression)('p', row, page, { id: 'r1' }, actor) : 'unkeyed';
}
it.each(['page', 'source', 'actor', 'revision'])('discards a half-finished calibration gesture when %s changes', change => {
  vi.stubGlobal('PointerEvent', MouseEvent);
  const onCalibrate = vi.fn();
  const draw = (row: typeof drawing, page: number, actor: string) => <AnnotationLayer
    key={key(row, page, actor)} viewport={{ convertToPdfPoint: (x: number, y: number) => [x, y], convertToViewportPoint: (x: number, y: number) => [x, y] }}
    canvasWidth={400} canvasHeight={300} pdfPage={page} items={[]} activeTool="calibrate" activeColor="#fff" markupScale={null}
    onAddItem={vi.fn()} onRemoveItem={vi.fn()} onUpdateItem={vi.fn()} onCalibrate={onCalibrate} />;
  const { container, rerender } = render(draw(drawing, 1, 'a'));
  fireEvent.pointerDown(container.querySelector('svg')!, { clientX: 10, clientY: 10, button: 0 });
  rerender(draw({ ...drawing, ...(change === 'source' ? { file_url: 'b.pdf' } : {}), ...(change === 'revision' ? { revision_number: 'B' } : {}) }, change === 'page' ? 2 : 1, change === 'actor' ? 'b' : 'a'));
  fireEvent.pointerDown(container.querySelector('svg')!, { clientX: 100, clientY: 100, button: 0 });
  expect(onCalibrate).not.toHaveBeenCalled();
  fireEvent.pointerDown(container.querySelector('svg')!, { clientX: 200, clientY: 200, button: 0 });
  expect(onCalibrate).toHaveBeenCalledTimes(1);
  vi.unstubAllGlobals();
});
it('the actual manual callback holds before prompting for a mismatched page and saves a normal match', async () => {
  const file = ts.createSourceFile('DrawingViewer.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  let callback = '';
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'handleCalibrate' && node.initializer && ts.isCallExpression(node.initializer)) callback = node.initializer.arguments[0].getText(file);
    ts.forEachChild(node, visit);
  };
  visit(file);
  expect(callback).not.toBe('');
  const prompt = vi.spyOn(window, 'prompt').mockReturnValue('120');
  const ready = vi.fn((): void => { throw new Error('Select the registered PDF page'); });
  const save = vi.fn();
  const toast = { error: vi.fn(), success: vi.fn() };
  const compiled = ts.transpile('const callback = ' + callback, { target: ts.ScriptTarget.ES2022 });
  const handle = new Function('activeDrawing', 'assertCalibrationReady', 'saveCalibration', 'toast', 'parseRealDistance', 'formatScaleFraction', compiled + '; return callback;')(drawing, ready, save, toast, Number, String);
  await handle(2);
  expect(prompt).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
  ready.mockImplementation(() => undefined);
  await handle(2);
  expect(prompt).toHaveBeenCalledOnce(); expect(save).toHaveBeenCalledExactlyOnceWith(60);
  prompt.mockRestore();
});
