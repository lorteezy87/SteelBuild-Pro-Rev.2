import { afterEach, describe, expect, it } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeMacBundlePermissions } from '../macos-bundle-permissions.mjs';
const roots: string[]=[];
afterEach(()=>{ for(const root of roots.splice(0)) rmSync(root,{recursive:true,force:true}); });
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'mac-bundle-permissions-')); roots.push(root);
 const app=join(root,'SteelBuild Pro.app'); const binary=join(app,'Contents/MacOS/SteelBuildPro');
 const resource=join(app,'Contents/Resources/web/index.html');
 mkdirSync(join(app,'Contents/MacOS'),{recursive:true,mode:0o700});
 mkdirSync(join(app,'Contents/Resources/web'),{recursive:true,mode:0o700});
 for(const [path,body] of [[binary,'binary'],[resource,'web bundle'],[join(app,'Contents/Info.plist'),'plist']]){
  writeFileSync(path,body,{mode:0o600}); chmodSync(path,0o600);
 }
 chmodSync(binary,0o700);
 return {root,app,binary,resource};
}
describe('Mac App Store bundle readability',()=>{
 it('makes packaged resources readable and directories traversable without making assets executable',()=>{
  const {root,app,binary,resource}=fixture();
  const privateKey=join(root,'installer.p12'); writeFileSync(privateKey,'private test fixture',{mode:0o600});
  normalizeMacBundlePermissions(app);
  for(const path of [app,join(app,'Contents'),join(app,'Contents/Resources/web')]) expect(statSync(path).mode&0o777).toBe(0o755);
  expect(statSync(binary).mode&0o777).toBe(0o755);
  expect(statSync(resource).mode&0o777).toBe(0o644);
  expect(statSync(join(app,'Contents/Info.plist')).mode&0o777).toBe(0o644);
  expect(readFileSync(resource,'utf8')).toBe('web bundle');
  expect(statSync(privateKey).mode&0o777).toBe(0o600);
 });
 it('rejects unexpected symlinks without changing files outside the bundle',()=>{
  const {root,app}=fixture(); const outside=join(root,'private.pem');writeFileSync(outside,'private fixture',{mode:0o600});
  symlinkSync(outside,join(app,'Contents/Resources/link'));
  expect(()=>normalizeMacBundlePermissions(app)).toThrow(/symlink/i);
  expect(statSync(outside).mode&0o777).toBe(0o600);
 });
});
