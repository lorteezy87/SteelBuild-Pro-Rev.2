import { describe, expect, it } from 'vitest';
import { assertMacReleaseChecks } from '../macos-release-gate.mjs';
const names=['Lint + Typecheck + Test + Build','Secret scan (gitleaks)','Supabase drift check','Release Edge Function typecheck','Commercial SQL + concurrent PostgreSQL acceptance'];
const run={head_sha:'exact-sha',head_branch:'main',event:'push',status:'completed'};
const jobs=names.map(name=>({name,status:'completed',conclusion:'success'}));
describe('Mac release gate',()=>{
  it('permits an exact-main release with all five production checks',()=>{
    expect(()=>assertMacReleaseChecks(run,jobs,'exact-sha','main',true)).not.toThrow();
  });
  it.each(names)('rejects a failed or missing %s',name=>{
    expect(()=>assertMacReleaseChecks(run,jobs.filter(j=>j.name!==name),'exact-sha','main',true)).toThrow();
    expect(()=>assertMacReleaseChecks(run,jobs.map(j=>j.name===name?{...j,conclusion:'failure'}:j),'exact-sha','main',true)).toThrow();
  });
  it('rejects another commit, duplicate gates, incomplete CI, and PR uploads',()=>{
    expect(()=>assertMacReleaseChecks(run,jobs,'other','main',true)).toThrow();
    expect(()=>assertMacReleaseChecks(run,[...jobs,jobs[0]],'exact-sha','main',true)).toThrow();
    expect(()=>assertMacReleaseChecks({...run,status:'in_progress'},jobs,'exact-sha','main',true)).toThrow();
    expect(()=>assertMacReleaseChecks({...run,event:'pull_request'},jobs,'exact-sha','main',true)).toThrow();
    expect(()=>assertMacReleaseChecks({...run,head_branch:'feature'},jobs,'exact-sha','feature',true)).toThrow();
  });
  it('permits signed validation on an exact reviewed branch without upload',()=>{
    expect(()=>assertMacReleaseChecks({...run,head_branch:'feature',event:'pull_request'},jobs,'exact-sha','feature',false)).not.toThrow();
  });
});

describe('main is rechecked immediately before Mac upload',()=>{
  it('accepts the current source commit',async()=>{
    const { assertMacUploadMain }=await import('../macos-release-gate.mjs');
    await expect(assertMacUploadMain('owner/repo','release-sha','synthetic-token',async()=>new Response(JSON.stringify({commit:{sha:'release-sha'}}),{status:200}))).resolves.toBeUndefined();
  });
  it('blocks upload if main advanced during approval or packaging',async()=>{
    const { assertMacUploadMain }=await import('../macos-release-gate.mjs');
    await expect(assertMacUploadMain('owner/repo','release-sha','synthetic-token',async()=>new Response(JSON.stringify({commit:{sha:'new-main-sha'}}),{status:200}))).rejects.toThrow(/Main changed/);
  });
  it('fails closed when GitHub cannot confirm the branch head',async()=>{
    const { assertMacUploadMain }=await import('../macos-release-gate.mjs');
    await expect(assertMacUploadMain('owner/repo','release-sha','synthetic-token',async()=>new Response('',{status:403}))).rejects.toThrow(/HTTP 403/);
  });
});
