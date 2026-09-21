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
type SecureProvider='github'|'vercel'|'supabase';
export async function saveConnectorCredential(connectionId:string,userId:string,provider:SecureProvider,value:string) {
  const encrypted=encryptSecret(value), admin=createAdminClient();
  const {error}=await admin.from('connector_credentials').upsert({connection_id:connectionId,user_id:userId,provider,...encrypted,updated_at:new Date().toISOString()},{onConflict:'connection_id'});
  if(error) throw new Error(`${provider} was authorized, but its secure credential could not be saved.`);
}
export async function readConnectorCredential(connectionId:string,userId:string,provider:SecureProvider) {
  const admin=createAdminClient();
  const {data,error}=await admin.from('connector_credentials').select('ciphertext,iv,tag').eq('connection_id',connectionId).eq('user_id',userId).eq('provider',provider).maybeSingle();
  if(error || !data) return null;
  return decryptSecret(data);
}
export async function deleteConnectorCredential(connectionId:string,userId:string,provider:SecureProvider) {
  const admin=createAdminClient();
  const {error}=await admin.from('connector_credentials').delete().eq('connection_id',connectionId).eq('user_id',userId).eq('provider',provider);
  if(error) throw new Error(`The saved ${provider} credential could not be removed.`);
}
export async function saveGitHubToken(connectionId:string,userId:string,token:string) {
  return saveConnectorCredential(connectionId,userId,'github',token);
}
export async function readGitHubToken(connectionId:string,userId:string) {
  return readConnectorCredential(connectionId,userId,'github');
}
export async function deleteGitHubToken(connectionId:string,userId:string) {
  return deleteConnectorCredential(connectionId,userId,'github');
}
