import { authHeaders } from '../lib/aiClient';
import type { DataStore } from './DataStore';
import type { JobAnalysis,JobMatch,MatchPreferences } from '../types';
import type { PromptConfig,PromptChangeLogEntry } from '../types/promptConfig';
import { defaultBillingState,type BillingState } from '../types/billing';
import type { AllowedModelsConfig } from '../types/aiModels';
export class HttpDataStore implements DataStore {
  private revisions=new Map<string,number>();private writes=new Map<string,Promise<void>>();
  hasPendingWrites(){return this.writes.size>0;}
  private async request(path:string,body?:any){const res=await fetch(path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-CJ-Request':'1',...await authHeaders()},...(body===undefined?{}:{body:JSON.stringify(body)})});const value=await res.json();if(!res.ok){window.dispatchEvent(new CustomEvent('career-journey:save-error',{detail:{message:value.error||'Request failed',conflict:res.status===409}}));throw new Error(value.error||'Request failed');}return value;}
  private read(collection:string,id?:string){return this.request('/api/data/read',{collection,...(id?{id}:{})});}
  private write(collection:string,id:string,value:any){return this.request('/api/data/write',{collection,id,value});}
  private enqueue(collection:'jobs'|'matches',id:string,value?:any){const key=`${collection}/${id}`,previous=this.writes.get(key)||Promise.resolve();const work=previous.then(async()=>{const expectedRevision=this.revisions.get(key)||0;if(value){const result=await this.request('/api/agent/save',{collection,expectedRevision,value,requestId:crypto.randomUUID()});this.revisions.set(key,result.revision);}else{await this.request('/api/agent/delete',{collection,id,expectedRevision});this.revisions.delete(key);}});this.writes.set(key,work);void work.finally(()=>{if(this.writes.get(key)===work)this.writes.delete(key);}).catch(()=>{});return work;}
  private async list(collection:string){const rows=await this.read(collection);for(const row of rows)if(!this.writes.has(`${collection}/${row.id}`))this.revisions.set(`${collection}/${row.id}`,row.revision||0);return Object.fromEntries(rows.map((r:any)=>[r.id,r]));}
  getCareerJourney(){return this.read('careerJourney','current');}
  async saveCareerJourney(journey:any){await this.write('careerJourney','current',journey);}
  async listJobs():Promise<Record<string,JobAnalysis>>{return this.list('jobs');}
  async saveJob(job:JobAnalysis){await this.enqueue('jobs',job.id,job);}
  async deleteJob(id:string){await this.enqueue('jobs',id);}
  async listMatches():Promise<Record<string,JobMatch>>{return this.list('matches');}
  async saveMatch(match:JobMatch){await this.enqueue('matches',match.id,match);}
  async deleteMatch(id:string){await this.enqueue('matches',id);}
  getMatchPreferences():Promise<MatchPreferences|null>{return this.read('matchPreferences','current');}
  async saveMatchPreferences(value:MatchPreferences){await this.write('matchPreferences','current',value);}
  getPromptConfigs():Promise<Record<string,PromptConfig>>{return this.list('promptConfigs');}
  async savePromptConfig(value:PromptConfig){await this.write('promptConfigs',value.id,value);}
  getPromptChangeLog(id:string):Promise<PromptChangeLogEntry[]>{return this.request('/api/data/prompt-history',{id});}
  async getBilling():Promise<BillingState|null>{return await this.read('meta','billing')||defaultBillingState();}
  getAllowedModels():Promise<AllowedModelsConfig|null>{return this.request('/api/data/models');}
}
