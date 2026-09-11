import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/ifc/ifcEngine', () => ({ getEngine: async () => ({ WebIFC: {IFCBEAM:1}, api: {
  OpenModel: () => 1, GetLine: (_m:number,id:number) => ({GlobalId:{value:`g${id}`}}), GetLineType: () => 1,
  StreamAllMeshes: (_m:number,visit:(m:unknown)=>void) => { for (const id of [1,2]) visit({expressID:id,geometries:{size:()=>id===1?2:1,get:()=>({geometryExpressID:1,flatTransformation:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],color:{x:1,y:1,z:1,w:1}})}}); },
  GetGeometry: () => ({GetVertexData:()=>0,GetVertexDataSize:()=>18,GetIndexData:()=>0,GetIndexDataSize:()=>3,delete:()=>{}}),
  GetVertexArray: () => new Float32Array([0,0,0,0,0,1,1,0,0,0,0,1,0,1,0,0,0,1]),GetIndexArray:()=>new Uint32Array([0,1,2]),CloseModel:()=>{},
} }) }));
import { loadIfcGeometry } from '../loadIfcGeometry';
describe('IFC geometry coverage', () => {
  it('counts an element once even when it has multiple placed meshes, and recolors every mesh on status refresh', async () => {
    const model=await loadIfcGeometry(new ArrayBuffer(1));
    expect(model.group.children).toHaveLength(3);expect(model.count).toBe(2);
    expect(model.recolor(({guid}:{guid:string})=>guid==='g1'?'#dc2626':null)).toMatchObject({colored:1,total:2});
    expect(model.group.children.slice(0,2).map((m:any)=>m.material.color.getHexString())).toEqual(['dc2626','dc2626']);
    model.recolor(():null=>null);
    expect(model.group.children.map((m:any)=>m.material.color.getHexString())).toEqual(['ffffff','ffffff','ffffff']);
    model.dispose();
  });
});
