// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import NudgeDraftModal from '../../rfis/NudgeDraftModal';
import { ComposeEmailModal, ReplyEmailModal } from '../modals';
const mocks = vi.hoisted(()=>({send:vi.fn(),success:vi.fn(),error:vi.fn()}));
vi.mock('@/api/supabaseClient',()=>({entities:{}}));
vi.mock('@/services/emailSendService',()=>({sendEmail:mocks.send,buildReplyDefaults:()=>({to:['sender@example.invalid'],cc:[],subject:'Re: Drawings',quoted_body:'\n> Original',reply_to_message_id:'message-a',thread_id:'thread-a',in_reply_to_external_id:'external-a'})}));
vi.mock('sonner',()=>({toast:{success:mocks.success,error:mocks.error}}));
vi.mock('@/lib/rfiNudge',()=>({buildRfiNudge:()=>({suggestedTo:['gc@example.invalid'],subject:'RFI follow-up',body:'Please respond'}),parseEmails:(value:string)=>value.split(',')}));
vi.mock('@/components/design-system',()=>({Button:({children,onClick,disabled}:{children:ReactNode;onClick:()=>void;disabled?:boolean})=><button onClick={onClick} disabled={disabled}>{children}</button>,Modal:({children,footer}:{children:ReactNode;footer:ReactNode})=><section>{children}{footer}</section>}));
beforeEach(()=>{vi.resetAllMocks();mocks.send.mockResolvedValue({success:false,error:'Outcome unknown; retry the same operation.'});});
afterEach(cleanup);
const uuid=/^[a-f0-9-]{36}$/i;
function compose(){render(<ComposeEmailModal projectId="project-a" onSent={vi.fn()} onClose={vi.fn()}/>);fireEvent.change(screen.getByPlaceholderText(/recipient@example/),{target:{value:'gc@example.invalid'}});fireEvent.change(screen.getByPlaceholderText('Email subject'),{target:{value:'Drawings'}});fireEvent.change(screen.getByPlaceholderText('Type your message...'),{target:{value:'Please review'}});}
it('retries the same draft with its key, changes key for changed content, and resets on a new compose',async()=>{
 compose();fireEvent.click(screen.getByRole('button',{name:'Send'}));await waitFor(()=>expect(mocks.error).toHaveBeenCalledTimes(1));
 const first=mocks.send.mock.calls[0][1];expect(first).toMatch(uuid);
 fireEvent.click(screen.getByRole('button',{name:'Send'}));await waitFor(()=>expect(mocks.error).toHaveBeenCalledTimes(2));expect(mocks.send.mock.calls[1][1]).toBe(first);
 fireEvent.change(screen.getByPlaceholderText('Email subject'),{target:{value:'Changed drawings'}});fireEvent.click(screen.getByRole('button',{name:'Send'}));await waitFor(()=>expect(mocks.error).toHaveBeenCalledTimes(3));expect(mocks.send.mock.calls[2][1]).not.toBe(first);
 cleanup();compose();fireEvent.click(screen.getByRole('button',{name:'Send'}));await waitFor(()=>expect(mocks.error).toHaveBeenCalledTimes(4));expect(mocks.send.mock.calls[3][1]).not.toBe(first);
});
it('suppresses synchronous repeated clicks while the same send is pending',async()=>{
 let resolve!:(value:unknown)=>void;mocks.send.mockImplementation(()=>new Promise(done=>{resolve=done;}));compose();const button=screen.getByRole('button',{name:'Send'});
 act(()=>{button.click();button.click();});expect(mocks.send).toHaveBeenCalledTimes(1);await act(async()=>resolve({success:true}));expect(mocks.success).toHaveBeenCalledTimes(1);
});
it('reply retries keep their operation key and preserve threading',async()=>{
 render(<ReplyEmailModal projectId="project-a" originalMessage={{id:'message-a',subject:'Drawings',sender_email:'sender@example.invalid'}} mode="reply" currentUserEmail="me@example.invalid" onSent={vi.fn()} onClose={vi.fn()}/>);
 fireEvent.change(screen.getByPlaceholderText('Type your reply...'),{target:{value:'Approved for review'}});fireEvent.click(screen.getByRole('button',{name:'Reply'}));await waitFor(()=>expect(mocks.error).toHaveBeenCalledTimes(1));
 fireEvent.click(screen.getByRole('button',{name:'Reply'}));await waitFor(()=>expect(mocks.error).toHaveBeenCalledTimes(2));expect(mocks.send.mock.calls[0][1]).toMatch(uuid);expect(mocks.send.mock.calls[1]).toEqual(mocks.send.mock.calls[0]);expect(mocks.send.mock.calls[0][0]).toMatchObject({reply_to_message_id:'message-a',thread_id:'thread-a'});
});

it('RFI nudge preserves the retry key but a newly opened nudge gets a fresh operation',async()=>{
 const rfi={id:'rfi-a',project_id:'project-a'};const tree=(open:boolean)=><NudgeDraftModal rfi={rfi} open={open} fromName="PM" onClose={vi.fn()}/>;const view=render(tree(true));
 fireEvent.click(screen.getByRole('button',{name:'Send Email'}));await waitFor(()=>expect(mocks.error).toHaveBeenCalledTimes(1));const key=mocks.send.mock.calls[0][1];expect(key).toMatch(uuid);
 fireEvent.click(screen.getByRole('button',{name:'Send Email'}));await waitFor(()=>expect(mocks.error).toHaveBeenCalledTimes(2));expect(mocks.send.mock.calls[1][1]).toBe(key);
 view.rerender(tree(false));view.rerender(tree(true));fireEvent.click(screen.getByRole('button',{name:'Send Email'}));await waitFor(()=>expect(mocks.error).toHaveBeenCalledTimes(3));expect(mocks.send.mock.calls[2][1]).not.toBe(key);
});
