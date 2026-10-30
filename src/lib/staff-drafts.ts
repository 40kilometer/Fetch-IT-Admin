export const DRAFT_TTL = 24 * 60 * 60 * 1000;
export const DRAFT_PREFIX = "fetchit:staff-draft:v1:";
export type DraftValues = Record<string, string>;
export type SavedDraft = { values: DraftValues; revision: string; savedAt: number; expiresAt: number };
export function draftKey(account: string, record: string) { return DRAFT_PREFIX + encodeURIComponent(account) + ":" + encodeURIComponent(record); }
export function readDraft(storage: Pick<Storage,"getItem"|"removeItem">, key: string, now=Date.now()): SavedDraft | null {
  try {
    const raw=storage.getItem(key); if(!raw)return null;
    const value=JSON.parse(raw);
    if(!value||!Number.isFinite(value.savedAt)||!Number.isFinite(value.expiresAt)||value.expiresAt<=now||value.expiresAt-value.savedAt>DRAFT_TTL||typeof value.revision!=="string"||!value.values||typeof value.values!=="object"||Array.isArray(value.values)||Object.keys(value.values).length>30||Object.entries(value.values).some(([k,v])=>/password|secret|token|otp/i.test(k)||typeof v!=="string"||v.length>8000)) {storage.removeItem(key);return null;}
    return value;
  } catch { return null; }
}
export function writeDraft(storage: Pick<Storage,"setItem"|"removeItem">, key:string,values:DraftValues,revision:string,now=Date.now(),allowEmpty=false) {
  const safe=Object.fromEntries(Object.entries(values).filter(([k,v])=>!/password|secret|token|otp/i.test(k)&&typeof v==='string').map(([k,v])=>[k,v.slice(0,8000)]));
  if(!allowEmpty&&!Object.values(safe).some(v=>v.trim())){storage.removeItem(key);return null;}
  const value:SavedDraft={values:safe,revision,savedAt:now,expiresAt:now+DRAFT_TTL};storage.setItem(key,JSON.stringify(value));return value;
}
export function pruneDrafts(storage:Storage,now=Date.now()) {
  const keys=Array.from({length:storage.length},(_,i)=>storage.key(i)).filter((key):key is string=>!!key&&key.startsWith(DRAFT_PREFIX));
  for(const key of keys)readDraft(storage,key,now);
}
