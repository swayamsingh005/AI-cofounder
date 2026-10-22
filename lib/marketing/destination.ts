export type VerifiedCodingDestination={url:string;label:string;status:'verified_preview'};

export function verifiedCodingDestination(action:{output_payload?:Record<string,unknown>|null;input_payload?:Record<string,unknown>|null}|null):VerifiedCodingDestination|null {
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
