export type VerifiedCodingDestination={url:string;label:string;status:'verified_preview'};
type CodingAction={output_payload?:Record<string,unknown>|null;input_payload?:Record<string,unknown>|null};

export function verifiedCodingDestination(action:CodingAction|null):VerifiedCodingDestination|null {
  const validation=action?.input_payload?.validation;
  const candidates=[action?.output_payload?.preview,validation&&typeof validation==='object'&&!Array.isArray(validation)?(validation as Record<string,unknown>).preview:null];
  for(const candidate of candidates) {
    if(!candidate||typeof candidate!=='object'||Array.isArray(candidate))continue;
    const url=(candidate as Record<string,unknown>).url;
    if(typeof url!=='string')continue;
    try { const parsed=new URL(url); if(parsed.protocol==='https:')return {url:parsed.toString(),label:'Open the Coding Agent app',status:'verified_preview'}; } catch {}
  }
  return null;
}

export function codingProductEvidence(action:CodingAction|null):string {
  if(!action?.input_payload)return '';
  const payload=action.input_payload, objective=typeof payload.objective==='string'?payload.objective.slice(0,1000):'';
  const validation=payload.validation&&typeof payload.validation==='object'&&!Array.isArray(payload.validation)?payload.validation as Record<string,unknown>:{};
  const validationSummary=typeof validation.summary==='string'?validation.summary.slice(0,500):'';
  const files=Array.isArray(payload.files)?payload.files.slice(0,8).flatMap(file=>{
    if(!file||typeof file!=='object'||Array.isArray(file))return [];
    const value=file as Record<string,unknown>,path=typeof value.path==='string'?value.path.slice(0,240):'',content=typeof value.content==='string'?value.content.slice(0,2500):'';
    return path&&content?[{path,content}]:[];
  }):[];
  if(!objective&&!validationSummary&&!files.length)return '';
  return JSON.stringify({objective,validationSummary,files});
}
