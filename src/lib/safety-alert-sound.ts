import type {Notice} from './staff-notifications';

export const safetySoundRole=(role:string)=>role==='SAFETY'||role==='ADMIN';
export const safetySoundKey=(actorId:string)=>`fetchit:safety-sound:v1:${actorId}`;

// Observe every successful snapshot, including while muted. Opening the portal,
// changing views, reconnecting and enabling sound must not replay the backlog.
export class SafetyAlertTracker {
  private seen=new Set<string>();
  private initialized=false;
  observe(items:readonly Notice[]):string[]{
    const relevant=items.filter(item=>item.safetyReview===true);
    const fresh=this.initialized?relevant.filter(item=>!item.read&&!this.seen.has(item.id)).map(item=>item.id):[];
    for(const item of relevant)this.seen.add(item.id);
    this.initialized=true;
    // The feed contains at most 600 items. Bound memory in long-lived tabs.
    if(this.seen.size>3000)this.seen=new Set([...this.seen].slice(-2000).concat(relevant.map(item=>item.id)));
    return [...new Set(fresh)];
  }
}

type Storage=Pick<globalThis.Storage,'getItem'|'setItem'>;
// Called under a browser Web Lock when supported, so tabs share one chime.
// New events inside the cooldown are covered by the preceding attention chime.
export function reserveSafetyChime(storage:Storage,key:string,ids:readonly string[],now:number):boolean{
  if(!ids.length)return false;
  try{
    const value=JSON.parse(storage.getItem(key)??'null');
    const heard:string[]=Array.isArray(value?.ids)?value.ids.filter((id:unknown)=>typeof id==='string'):[];
    const fresh=ids.filter(id=>!heard.includes(id));
    if(!fresh.length)return false;
    const last=typeof value?.at==='number'&&Number.isFinite(value.at)?value.at:0;
    const play=last===0||now-last>=10000||now<last;
    storage.setItem(key,JSON.stringify({ids:[...new Set([...heard,...fresh])].slice(-600),at:play?now:last}));
    return play;
  }catch{return true;}
}

export class SafetyChime {
  private context:AudioContext|null=null;
  private disposed=false;
  get ready(){return !this.disposed&&this.context?.state==='running';}
  // Invoke directly from a click; never try to circumvent autoplay permission.
  async enable(){
    if(this.disposed)throw Error('Sound controls have closed. Reload the page to try again.');
    if(!window.AudioContext)throw Error('This browser does not support alert sounds. Visual alerts remain available.');
    this.context??=new window.AudioContext();
    if(this.context.state!=='running')await this.context.resume();
    if(!this.ready)throw Error('Sound is paused by your browser. Click Enable safety sounds to try again.');
  }
  play(){
    const context=this.context;
    if(!context||!this.ready)throw Error('Sound is paused. Click Enable safety sounds to resume it.');
    [740,988].forEach((frequency,index)=>{
      const start=context.currentTime+index*.18,oscillator=context.createOscillator(),gain=context.createGain();
      oscillator.type='sine';oscillator.frequency.setValueAtTime(frequency,start);
      gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.12,start+.015);gain.gain.exponentialRampToValueAtTime(.001,start+.16);
      oscillator.connect(gain);gain.connect(context.destination);
      oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
      oscillator.start(start);oscillator.stop(start+.17);
    });
  }
  close(){this.disposed=true;const context=this.context;this.context=null;if(context&&context.state!=='closed')void context.close().catch(()=>{});}
}
