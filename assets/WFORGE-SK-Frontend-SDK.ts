// =====================================================
// W//FORGE-SK-Frontend-SDK.ts  v0.1.0
// Next.js / TypeScript · Zero Deps · fetch only
// Types + Client + DriftGuard  ·  One Source of Truth
// =====================================================
export type Role = 'owner'|'admin'|'member'|'viewer';
export type CharLibType = 'outfit'|'pose'|'expression'|'material';
export type RenderStatus = 'waiting'|'running'|'qc'|'completed'|'failed';
export type QCDecision = 'pass'|'refine'|'fail';

export interface WfUser { id:string; email:string; role:Role; }
export interface WfProject { id:string; slug:string; name:string; status:string; owner_id:string; brief?:any; created_at:string; }
export interface WfDNA { axes:Record<string,string>; prompt_fragment:string; }
export interface WfCharacter {
  id:string; slug:string; name:string; version:string; locked:boolean; drift_limit:number;
  dna:WfDNA; sheet:any; base_hash?:string; created_by:string; created_at:string;
}
export interface WfCharLib { id:string; char_id:string; type:CharLibType; name:string; fragment:string; version:string; hash?:string; }
export interface WfPromptModule { id:string; text:string; locked?:boolean; weight?:number; }
export interface WfPrompt {
  id:string; char_id:string; char_version:string; char_hash:string;
  modules:WfPromptModule[]; positive:string; negative:string; params:any;
  hash:string; version:number; created_at:string;
}
export interface WfBundle {
  id:string; project_id:string; char_id:string; prompt_id:string;
  char_snapshot:WfCharacter; prompt_snapshot:WfPrompt;
  authorized_by:string[]; authorized_at?:string; immutable:boolean; bundle_hash:string;
}
export interface WfRender { id:string; bundle_id:string; status:RenderStatus; seed?:string; progress:number; result_url?:string; created_at:string; }
export interface WfQC { id:string; render_id:string; scores:Record<string,number>; overall:number; flags:string[]; decision:QCDecision; }

// -------- DriftGuard (client-side first gate) --------
export const DriftGuard = {
  DRIFT_LIMIT: 0.03,
  RED_FLAGS: ['wrong hair','no horns','different face','change eye color','remove visor','different skin'],
  validateFragment(fragment:string, dna:WfDNA):{ok:boolean; issues:string[]} {
    const issues:string[] = [];
    const f = fragment.toLowerCase();
    this.RED_FLAGS.forEach(r => { if (f.includes(r)) issues.push(`RED_FLAG: ${r}`); });
    if (dna.prompt_fragment) {
      const keys = dna.prompt_fragment.toLowerCase().split(/[\s,]+/).filter(w=>w.length>5);
      const miss = keys.filter(k => !f.includes(k)).length;
      if (miss > keys.length * 0.4) issues.push(`TOO_MANY_MISSING_KEYS (${miss}/${keys.length})`);
    }
    return { ok: issues.length===0, issues };
  },
  score(overall:number):QCDecision {
    if (overall >= 90) return 'pass';
    if (overall >= 80) return 'refine';
    return 'fail';
  }
};

// -------- API Client --------
export class WForgeClient {
  constructor(readonly base:string, private token:string){}
  setToken(t:string){ this.token = t; }
  private async req<T>(path:string, opt:RequestInit={}):Promise<T>{
    const r = await fetch(this.base + path, {
      ...opt,
      headers: { Authorization:`Bearer ${this.token}`, 'Content-Type':'application/json', 'Prefer':'return=representation', ...(opt.headers||{}) }
    });
    if (!r.ok) throw new Error(`WF ${r.status} ${await r.text()}`);
    return r.json();
  }
  projects = { list:()=>this.req<WfProject[]>('/projects?select=*&order=created_at.desc') };
  characters = {
    get:(slug:string)=>this.req<WfCharacter[]>(`/characters?slug=eq.${slug}&limit=1`).then(r=>r[0]),
    lock:(id:string, reason:string)=>this.req<any>('/rpc/lock_character',{method:'POST',body:JSON.stringify({char_id:id,reason})}),
    lib:(id:string, type:CharLibType)=>this.req<WfCharLib[]>(`/char_libraries?char_id=eq.${id}&type=eq.${type}`),
  };
  prompts = {
    build:(p:{character_id:string;modules:any[];negative?:string[];params?:any})=>this.req<WfPrompt>('/rpc/build_prompt',{method:'POST',body:JSON.stringify(p)}),
    list:(charId:string)=>this.req<WfPrompt[]>(`/prompts?char_id=eq.${charId}&order=version.desc&limit=20`),
    validateDrift:(id:string)=>this.req<{ok:boolean;drift:number;issues:string[]}>('/rpc/validate_drift',{method:'POST',body:JSON.stringify({prompt_id:id})}),
  };
  bundles = {
    bapg:(p:{project_id:string;prompt_id:string;signatures:string[]})=>this.req<WfBundle>('/rpc/bapg_authorize',{method:'POST',body:JSON.stringify(p)}),
    get:(id:string)=>this.req<WfBundle[]>(`/bundles?id=eq.${id}&select=*`).then(r=>r[0]),
  };
  renders = {
    create:(bundle_id:string, params:any={})=>this.req<WfRender>('/renders',{method:'POST',body:JSON.stringify({bundle_id,params})}),
    list:(bundle_id:string)=>this.req<WfRender[]>(`/renders?bundle_id=eq.${bundle_id}&order=created_at.desc`),
  };
  qc = { run:(render_id:string)=>this.req<WfQC>('/rpc/qc_run',{method:'POST',body:JSON.stringify({render_id})}) };
}

// default singleton (replace with your Supabase project URL)
export const wf = new WForgeClient('https://YOUR-PROJECT.supabase.co/rest/v1', '');
export default WForgeClient;
