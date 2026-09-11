import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createAdminClient } from '../supabase/admin';

function encryptionKey() {
  const raw=process.env.CONNECTOR_ENCRYPTION_KEY;
  if(!raw) throw new Error('Connector encryption is not configured.');
  const decoded=Buffer.from(raw,'base64');
  if(decoded.length!==32) throw new Error('Connector encryption key must be 32 bytes.');
  return decoded;
}
export function encryptSecret(value:string) {
  const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv);
  const ciphertext=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
  return {ciphertext:ciphertext.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64')};
}
export function decryptSecret(payload:{ciphertext:string;iv:string;tag:string}) {
  const decipher=createDecipheriv('aes-256-gcm',encryptionKey(),Buffer.from(payload.iv,'base64'));
  decipher.setAuthTag(Buffer.from(payload.tag,'base64'));
  return Buffer.concat([decipher.update(Buffer.from(payload.ciphertext,'base64')),decipher.final()]).toString('utf8');
}
export async function saveGitHubToken(connectionId:string,userId:string,token:string) {
  const encrypted=encryptSecret(token), admin=createAdminClient();
  const {error}=await admin.from('connector_credentials').upsert({connection_id:connectionId,user_id:userId,provider:'github',...encrypted,updated_at:new Date().toISOString()},{onConflict:'connection_id'});
  if(error) throw new Error('GitHub was authorized, but its secure credential could not be saved.');
}
export async function readGitHubToken(connectionId:string,userId:string) {
  const admin=createAdminClient();
  const {data,error}=await admin.from('connector_credentials').select('ciphertext,iv,tag').eq('connection_id',connectionId).eq('user_id',userId).eq('provider','github').maybeSingle();
  if(error || !data) return null;
  return decryptSecret(data);
}
export async function deleteGitHubToken(connectionId:string,userId:string) {
  const admin=createAdminClient();
  const {error}=await admin.from('connector_credentials').delete().eq('connection_id',connectionId).eq('user_id',userId).eq('provider','github');
  if(error) throw new Error('The saved GitHub credential could not be removed.');
}
