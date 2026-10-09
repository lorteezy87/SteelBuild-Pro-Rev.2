// @vitest-environment jsdom
import { createElement } from 'react';
import { act,renderHook } from '@testing-library/react';
import { beforeEach,expect,it,vi } from 'vitest';
const state=vi.hoisted(()=>({user:'user-a',org:{currentOrg:{id:'org-a'},isLoadingOrgs:false}}));
vi.mock('@/lib/AuthContext',async()=>({AuthContext:(await import('react')).createContext(undefined)}));
vi.mock('@/components/shared/OrgContext',()=>({useOptionalOrg:()=>state.org}));
import { AuthContext } from '@/lib/AuthContext';
import { setActiveOrgId } from '@/lib/activeOrg';
import { useOwnedCalculatorState } from '../useOwnedCalculatorState';
const wrapper=({children}:{children:React.ReactNode})=>createElement(AuthContext.Provider,{value:{user:state.user?{id:state.user}:null,isAuthenticated:!!state.user} as never},children);
beforeEach(()=>{localStorage.clear();state.user='user-a';state.org.currentOrg.id='org-a';setActiveOrgId('org-a');});
it('retains unassigned legacy rows without showing or assigning them',()=>{
  localStorage.setItem('crane-pick-history','[{"load":"A-private"}]');
  const {result}=renderHook(()=>useOwnedCalculatorState('crane-pick-history',[]),{wrapper});
  expect(result.current[0]).toEqual([]);
  expect(localStorage.getItem('crane-pick-history')).toBe('[{"load":"A-private"}]');
});
it('isolates stored values across people and workspaces while the original owner can recover them',()=>{
  const {result,rerender}=renderHook(()=>useOwnedCalculatorState('rate',''),{wrapper});
  act(()=>result.current[1]('A confidential rate'));
  state.user='user-b';rerender();expect(result.current[0]).toBe('');
  state.user='user-a';rerender();expect(result.current[0]).toBe('A confidential rate');
  state.org.currentOrg.id='org-b';act(()=>setActiveOrgId('org-b'));rerender();expect(result.current[0]).toBe('');
  state.org.currentOrg.id='org-a';act(()=>setActiveOrgId('org-a'));rerender();expect(result.current[0]).toBe('A confidential rate');
});
it('ignores delayed setters from before a same-company sign-out and re-entry',()=>{
  const {result,rerender}=renderHook(()=>useOwnedCalculatorState('rows',[] as string[]),{wrapper});
  act(()=>result.current[1](['retained']));const oldSet=result.current[1];
  act(()=>{setActiveOrgId(null);setActiveOrgId('org-a');});rerender();
  act(()=>oldSet(['late old result']));
  expect(result.current[0]).toEqual(['retained']);
});
