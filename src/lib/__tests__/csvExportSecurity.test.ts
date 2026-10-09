import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { escapeCsvCell } from '../csv';

vi.mock('@/lib/native/fileExport', () => ({ presentGeneratedFile: vi.fn() }));

// Execute the actual small exporter bodies without booting every route's query
// providers. No copied row mappings or replacement serializer are tested here.
function actualExporter(file: string, name: string, extra: Record<string, unknown> = {}) {
  const source = readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let implementation = '';
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) implementation = node.getText(ast).replace(/^export\s+/, '');
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) implementation = `const ${node.getText(ast)};`;
    ts.forEachChild(node, visit);
  };
  visit(ast);
  expect(implementation).not.toBe('');
  const files: Blob[] = [];
  const bindings = { escapeCsvCell, presentGeneratedFile: ({ blob }: { blob: Blob }) => { files.push(blob); }, ...extra };
  const js = ts.transpileModule(`${implementation}\nreturn ${name};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const run = new Function(...Object.keys(bindings), js)(...Object.values(bindings)) as (...args: unknown[]) => void;
  return { run, files };
}

const cases = [
  { file: 'src/pages/rfis/utils.js', name: 'exportRFIsToCSV', data: (value: string) => [{ title: value, question: value, cost_impact_amount: -5 }], extra: { daysOpen: () => 0 } },
  { file: 'src/pages/rfis/AgendaPanel.jsx', name: 'exportAgendaCsv', data: (value: string) => ({ items: [{ title: value, group: 'Blocking', reason: value }] }), extra: {} },
  { file: 'src/pages/ActionItems.jsx', name: 'exportActionItemsToCSV', data: (value: string) => [{ title: value }], extra: {} },
  { file: 'src/pages/ProductionStatus.jsx', name: 'exportProductionCSV', data: (value: string) => [{ piece_mark: value, quantity: -5 }], extra: {} },
  { file: 'src/pages/fabRelease/exportCsv.ts', name: 'exportFabReleaseCSV', data: (value: string) => [{ wp_number: value, crew: value, _signals: { stage: 'test', drawing: { packages: [] }, flags: [] } }], extra: { num: Number, getWorkPackageDisplayName: () => 'Package', stageMeta: () => ({ label: 'Stage' }), drawingPackageLabel: String } },
];
describe('active CSV exporters', () => {
  for (const item of cases) it.each(['=1+1', '+cmd', '-cmd', '@SUM(A1)', '\tcmd', '\rcmd', 'commas, quotes" and\nnewlines'])(`${item.name} safely serializes %j`, async value => {
    const { run, files } = actualExporter(item.file, item.name, item.extra);
    run(item.data(value));
    expect(await files[0].text()).toContain(escapeCsvCell(value));
  });
  it.each(['=1+1', '+cmd', '-cmd', '@SUM(A1)', '\tcmd', '\rcmd', 'a,"b"\nc'])('RiskHub safely serializes %j', async value => {
    const { run, files } = actualExporter('src/pages/RiskHub.jsx', 'handleExport', { filtered: [{ label: value, exposure: -5 }] });
    run();
    const csv = await files[0].text();
    expect(csv).toContain(escapeCsvCell(value)); expect(csv).toContain('"-5"'); expect(csv).not.toContain('"\'-5"');
  });
  it('keeps real negative numbers numeric and quotes embedded CSV syntax', () => {
    expect(escapeCsvCell(-5)).toBe('"-5"');
    expect(escapeCsvCell('-5')).toBe('"\'-5"');
    expect(escapeCsvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
  });
});
