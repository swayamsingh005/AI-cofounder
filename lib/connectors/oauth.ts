import { createHash, randomBytes } from 'node:crypto';

export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const oauthState=()=>randomBytes(32).toString('base64url');
export const pkceVerifier=()=>randomBytes(48).toString('base64url');
export const pkceChallenge=(value:string)=>createHash('sha256').update(value).digest('base64url');
export const secureCookie=(request:Request)=>new URL(request.url).protocol==='https:';
