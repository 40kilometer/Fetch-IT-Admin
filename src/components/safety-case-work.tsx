'use client';
import {useRef,useState} from 'react';
import {ActionForm} from './action-form';
type Contact={name:string;phone:string|null}|null;
export function SafetyCaseWork({id,version,canReply}:{id:string;version:number;canReply:boolean}){
  const [contacts,setContacts]=useState<{customer:Contact;rider:Contact}|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),pending=useRef(false);
  async function contact(action:'contacts'|'call-start',target?:string){
    if(pending.current)return;pending.current=true;setBusy(true);setError('');setNotice('');
    try{
      const response=await fetch(`/api/cases/${id}/contact`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,target})});
      const data=await response.json();if(!response.ok){setContacts(null);throw Error(data.error||'Contact action unavailable.');}
      if(action==='contacts')setContacts(data.contacts);
      else if(typeof data.dial==='string'&&/^tel:\+?\d{7,20}$/.test(data.dial)){setNotice('Dialer requested. After your call, record whether anyone answered.');window.location.assign(data.dial);}
    }catch(cause){setError(cause instanceof Error?cause.message:'Contact details are unavailable.');}
    finally{pending.current=false;setBusy(false);}
  }
  return <section className="card conversation section-block" aria-labelledby="safety-contact-title"><h2 id="safety-contact-title">Contact & follow-up</h2><p>You own this Safety case. Check whether the customer is safe, coordinate the next step, and keep them updated. Internal findings and call notes stay private.</p>
    {!contacts?<button className="btn" disabled={busy} onClick={()=>void contact('contacts')}>{busy?'Loading contacts…':'Show case contact details'}</button>:<div className="safety-contact-grid">{(['customer','rider'] as const).map(target=><div className="safety-contact-person" key={target}><h3>{target==='customer'?'Customer':'Assigned rider'}</h3><p>{contacts[target]?.name??'No participant linked'}</p><p>{contacts[target]?.phone??'No phone number recorded'}</p><button type="button" className="btn" disabled={busy||!contacts[target]?.phone} onClick={()=>void contact('call-start',target)}>Call {target}</button></div>)}</div>}
    {error&&<p className="error-message" role="alert">{error}</p>}{notice&&<p className="scope-notice" role="status">{notice}</p>}
    <p className="muted small">Call opens this device’s dialer. Opening it does not mean the call connected. For immediate danger, direct the person to emergency services; this portal is not emergency dispatch.</p>
    <ActionForm url={`/api/cases/${id}`} method="PATCH" hidden={{action:'call-log',version}} label="Save call outcome" collapsible fields={[{name:'target',label:'Who did you call?',options:[{value:'customer',label:'Customer'},{value:'rider',label:'Assigned rider'}],required:true},{name:'outcome',label:'Call outcome',options:[{value:'',label:'Choose an outcome'},{value:'ANSWERED',label:'Answered'},{value:'NO_ANSWER',label:'No answer'},{value:'BUSY',label:'Busy'},{value:'UNREACHABLE',label:'Unreachable'}],required:true},{name:'calledAt',label:'Call date and time — Philippine time',type:'datetime-local',required:true},{name:'note',label:'Private call notes and next step',type:'textarea',required:true}]}/>
    {canReply?<><h3>Message the customer</h3><p className="muted small">Sent to their existing support conversation. Do not include private investigation notes or another person’s contact details.</p><ActionForm url={`/api/cases/${id}`} method="PATCH" hidden={{action:'reply',version}} label="Send Safety reply" confirm fields={[{name:'reply',label:'Public reply to the customer',type:'textarea',required:true}]}/></>:<p className="scope-notice">A linked, open customer conversation is required to reply. Ask Admin to correct the link or reopen the conversation.</p>}
  </section>;
}
