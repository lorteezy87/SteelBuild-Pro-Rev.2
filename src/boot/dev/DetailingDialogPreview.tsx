/** Development-only acceptance of the real submittal editor; no project writes. */
import { useState } from 'react';
import type { ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import SubmittalFormModal from '@/pages/submittals/SubmittalFormModal';
import ReviewStep from '@/components/drawings/uploadSteps/ReviewStep';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Dialog, DialogContent as DialogContentRaw, DialogHeader, DialogTitle as DialogTitleRaw } from '@/components/ui/dialog';
import { Popover, PopoverContent as PopoverContentRaw, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent as DropdownMenuContentRaw, DropdownMenuItem as DropdownMenuItemRaw, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ContextMenu, ContextMenuContent as ContextMenuContentRaw, ContextMenuItem as ContextMenuItemRaw, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Tooltip, TooltipContent as TooltipContentRaw, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { HoverCard, HoverCardContent as HoverCardContentRaw, HoverCardTrigger } from '@/components/ui/hover-card';
import type { DialogContentProps, DialogTitleProps } from '@radix-ui/react-dialog';
import type { PopoverContentProps } from '@radix-ui/react-popover';
import type { DropdownMenuContentProps, DropdownMenuItemProps } from '@radix-ui/react-dropdown-menu';
import type { ContextMenuContentProps, ContextMenuItemProps } from '@radix-ui/react-context-menu';
import type { TooltipContentProps } from '@radix-ui/react-tooltip';
import type { HoverCardContentProps } from '@radix-ui/react-hover-card';
import '@/globals.css';

// Existing JSX wrappers lose their primitive props in TypeScript inference.
// Keep the actual Radix contracts at this development-only boundary.
const DialogContent = DialogContentRaw as unknown as ComponentType<DialogContentProps>;
const DialogTitle = DialogTitleRaw as unknown as ComponentType<DialogTitleProps>;
const PopoverContent = PopoverContentRaw as unknown as ComponentType<PopoverContentProps>;
const DropdownMenuContent = DropdownMenuContentRaw as unknown as ComponentType<DropdownMenuContentProps>;
const DropdownMenuItem = DropdownMenuItemRaw as unknown as ComponentType<DropdownMenuItemProps>;
const ContextMenuContent = ContextMenuContentRaw as unknown as ComponentType<ContextMenuContentProps>;
const ContextMenuItem = ContextMenuItemRaw as unknown as ComponentType<ContextMenuItemProps>;
const TooltipContent = TooltipContentRaw as unknown as ComponentType<TooltipContentProps>;
const HoverCardContent = HoverCardContentRaw as unknown as ComponentType<HoverCardContentProps>;

const availableSets = Array.from({ length: 8 }, (_, index) => ({
  id: `fixture-set-${index + 1}`,
  set_number: index + 1,
  set_name: `Structural steel package ${index + 1} — anchor bolts and erection details`,
  revision: 'A',
}));

function ManualIntakePreview() {
  const [sheets, setSheets] = useState(Array.from({ length: 3 }, (_, index) => ({
    sheetNumber: '', sheetTitle: '', discipline: 'Structural', revision: 'A',
    sourceFile: 'manual.pdf', sourceFileUrl: 'app-files/manual.pdf', pdfPage: index + 1,
    selected: true, _note: 'AI unavailable — manually review this physical PDF page.',
  })));
  const [meta, setMeta] = useState({ setName: 'Manual package A', revision: 'A', issueDate: '2026-10-15', issuedBy: '', discipline: 'Structural' });
  const [saved, setSaved] = useState('');
  return <main style={{ padding: 16, color: 'var(--text-primary)' }}>
    <h1>Manual drawing intake verification</h1>
    {saved ? <p role="status">{saved}</p> : <ReviewStep
      sheets={sheets} setSheets={setSheets} meta={meta} setMeta={setMeta}
      fileResults={[{ fileName: 'manual.pdf', pageCount: 3, extractFailed: true }]}
      onBack={() => {}} onCreate={(rows: Array<{ pdfPage: number }>) => setSaved(`Saved ${rows.length} pages: ${rows.map(row => row.pdfPage).join(',')}`)}
      existingDrawings={[]} canSupersede={false} projectId={undefined}
    />}
  </main>;
}

function NestedControlsPreview() {
  const [accepted, setAccepted] = useState<string[]>([]);
  const accept = (name: string) => setAccepted(previous => [...previous, name]);
  return <Dialog open>
    <DialogContent aria-describedby={undefined}>
      <DialogHeader className=""><DialogTitle>Nested control verification</DialogTitle></DialogHeader>
      <Popover><PopoverTrigger>Open popover</PopoverTrigger><PopoverContent>
        <button onClick={() => accept('popover')}>Popover action</button>
      </PopoverContent></Popover>
      <DropdownMenu><DropdownMenuTrigger>Open menu</DropdownMenuTrigger><DropdownMenuContent>
        <DropdownMenuItem onSelect={() => accept('menu')}>Menu action</DropdownMenuItem>
      </DropdownMenuContent></DropdownMenu>
      <ContextMenu><ContextMenuTrigger>Open context menu</ContextMenuTrigger><ContextMenuContent>
        <ContextMenuItem onSelect={() => accept('context')}>Context action</ContextMenuItem>
      </ContextMenuContent></ContextMenu>
      <TooltipProvider delayDuration={0}><Tooltip><TooltipTrigger>Show tooltip</TooltipTrigger>
        <TooltipContent>Nested tooltip help</TooltipContent></Tooltip></TooltipProvider>
      <HoverCard openDelay={0}><HoverCardTrigger>Show hover details</HoverCardTrigger>
        <HoverCardContent>Nested hover details</HoverCardContent></HoverCard>
      <p role="status">{accepted.join(',')}</p>
    </DialogContent>
  </Dialog>;
}

function DetailingDialogPreview() {
  const search = new URLSearchParams(location.search);
  const editing = search.get('mode') === 'edit';
  const [open, setOpen] = useState(true);
  const [saved, setSaved] = useState(false);
  return (
    <>
      <header style={{ position: 'fixed', inset: '0 0 auto', height: 72, zIndex: 100, background: 'var(--bg-surface)', color: 'var(--text-primary)' }}>
        Workspace toolbar
      </header>
      <main style={{ paddingTop: 90 }}>
        <h1>Detailing dialog verification</h1>
        {saved && <p role="status">Submittal details accepted</p>}
        <button type="button" onClick={() => setOpen(true)}>Open submittal</button>
      </main>
      <SubmittalFormModal
        open={open}
        initial={{
          ...(editing ? { id: 'fixture-submittal' } : {}),
          submittal_number: 'SUB-001',
          title: 'Structural steel shop drawings — Area A',
          submittal_type: 'Shop Drawing',
          status: 'Draft',
          submitted_by: 'Fixture detailer',
        }}
        projectId="fixture-project"
        availableSets={availableSets}
        drawingTypesEnabled
        onClose={() => setOpen(false)}
        onSubmit={() => { setSaved(true); setOpen(false); }}
      />
    </>
  );
}

if (import.meta.env.DEV) {
  const search = new URLSearchParams(location.search);
  const dark = search.get('theme') === 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.classList.toggle('steelbuild-dark', dark);
  const root = document.getElementById('root');
  if (root) createRoot(root).render(search.get('view') === 'layers' ? <NestedControlsPreview /> : search.get('view') === 'intake'
    ? <QueryClientProvider client={new QueryClient()}><ManualIntakePreview /></QueryClientProvider>
    : <DetailingDialogPreview />);
}
