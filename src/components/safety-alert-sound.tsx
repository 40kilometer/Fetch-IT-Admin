'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {Notice} from '@/lib/staff-notifications';
import {SafetyAlertTracker,SafetyChime,reserveSafetyChime,safetySoundKey,safetySoundRole} from '@/lib/safety-alert-sound';

type Controls={observe:(items:readonly Notice[])=>void;enable:()=>void;mute:()=>void;test:()=>void;resume:()=>void};
export function useSafetyAlertSound(actorId:string,role:string){
  const available=safetySoundRole(role),enabled=useRef(false),runtime=useRef<Controls|null>(null);
  const [on,setOn]=useState(false),[paused,setPaused]=useState(false),[error,setError]=useState(''),[storageError,setStorageError]=useState('');
  const key=safetySoundKey(actorId);
  useEffect(()=>{
    let active=true,player:SafetyChime|null=null,resuming=false,draining=false,preview=false;
    const tracker=new SafetyAlertTracker(),pending=new Set<string>();
    enabled.current=false;setOn(false);setPaused(false);setError('');setStorageError('');
    function persist(value:boolean){
      try{localStorage.setItem(key,value?'on':'off');setStorageError('');}
      catch{setStorageError('This browser could not save your preference. The current setting still works until you leave.');}
    }
    function drain(){
      if(!active||!enabled.current||!player?.ready||draining||!pending.size)return;
      draining=true;
      const owned=player;
      const play=()=>{
        if(!active||!enabled.current||owned!==player||!owned.ready)return;
        const ids=[...pending];
        if(!ids.length)return;
        try{
          let receiptStorage:Storage|undefined;
          try{receiptStorage=localStorage;}catch{}
          if(receiptStorage)reserveSafetyChime(receiptStorage,key+':heard',ids,Date.now(),()=>owned.play());else owned.play();
          ids.forEach(id=>pending.delete(id));
        }catch(cause){setPaused(true);setError(cause instanceof Error?cause.message:'Audio is paused. Your sound preference remains on.');}
      };
      const result=navigator.locks?navigator.locks.request(key,play).catch(play):Promise.resolve(play());
      void result.finally(()=>{draining=false;});
    }
    function prepare(gesture=false){
      if(!active||!available||(!enabled.current&&!preview)||(resuming&&!gesture))return;
      if(!player){
        const created=new SafetyChime(()=>{
          if(!active||created!==player)return;
          setPaused(enabled.current&&!created.ready);
          if(created.ready){setError('');if(!preview)drain();}
        });
        player=created;
      }
      const owned=player;
      resuming=true;setPaused(enabled.current&&!owned.ready);
      // A browser-blocked resume may stay pending until the next interaction.
      // Do not await it inside the queue lock or disable the mute control.
      void owned.enable().then(()=>{
        if(!active||owned!==player)return;
        resuming=false;setPaused(enabled.current&&!owned.ready);setError('');
        if(preview){preview=false;owned.play();}
        drain();
      }).catch(cause=>{
        if(!active||owned!==player)return;
        resuming=false;preview=false;setPaused(enabled.current);
        setError(cause instanceof Error?cause.message:'Audio is paused. Your sound preference remains on.');
      });
    }
    function stop(){
      enabled.current=false;setOn(false);setPaused(false);setError('');pending.clear();preview=false;resuming=false;
      const previous=player;player=null;previous?.close();
    }
    function restore(value:boolean){
      if(!available||!value){stop();return;}
      enabled.current=true;setOn(true);setError('');prepare();
    }
    const controls:Controls={
      observe(items){
        const fresh=tracker.observe(items),unread=new Set(items.filter(item=>item.safetyReview&&!item.read).map(item=>item.id));
        for(const id of pending)if(!unread.has(id))pending.delete(id);
        if(!enabled.current)return;
        fresh.forEach(id=>pending.add(id));
        if(player?.ready)drain();else if(pending.size)prepare();
      },
      enable(){if(!available)return;enabled.current=true;setOn(true);setError('');persist(true);preview=true;prepare(true);},
      mute(){stop();persist(false);},
      test(){preview=true;setError('');prepare(true);},
      resume(){prepare(true);},
    };
    runtime.current=controls;
    try{restore(localStorage.getItem(key)==='on');}catch{restore(false);}
    const changed=(event:StorageEvent)=>{if(event.key===key||event.key===null)restore(event.newValue==='on');};
    const wake=()=>{if(enabled.current)prepare();};
    const interact=()=>{if(enabled.current&&!player?.ready)prepare(true);};
    const visible=()=>{if(document.visibilityState==='visible')wake();};
    window.addEventListener('storage',changed);window.addEventListener('focus',wake);
    window.addEventListener('pointerdown',interact,{passive:true});window.addEventListener('keydown',interact);
    document.addEventListener('visibilitychange',visible);
    return()=>{
      active=false;enabled.current=false;runtime.current=null;pending.clear();
      window.removeEventListener('storage',changed);window.removeEventListener('focus',wake);
      window.removeEventListener('pointerdown',interact);window.removeEventListener('keydown',interact);
      document.removeEventListener('visibilitychange',visible);player?.close();
    };
  },[key,available]);
  const observe=useCallback((items:readonly Notice[])=>runtime.current?.observe(items),[]);
  const controls=available?<section className="safety-sound-controls" aria-label="Safety Review alert sounds"><div><strong>Safety Review sounds</strong><p className="muted small">A distinct alert tone for new rider applications and safety cases only. Keep the portal open. Existing alerts stay silent.</p></div><div className="row-actions"><button type="button" className="btn" aria-pressed={on} onClick={()=>on?runtime.current?.mute():runtime.current?.enable()}>{on?'Mute safety sounds':'Enable safety sounds'}</button>{on&&paused&&<button type="button" className="btn" onClick={()=>runtime.current?.resume()}>Resume audio</button>}<button type="button" className="btn" onClick={()=>runtime.current?.test()}>Test sound</button></div><p className="small" role="status">{error||(on?paused?'Safety sounds are on. Click anywhere or Resume audio to allow playback. Your preference stays on.':'Safety sounds are on. This browser remembers your choice.':'Safety sounds are off.')}</p>{storageError&&<p className="small" role="alert">{storageError}</p>}</section>:null;
  return {observe,controls,enabled};
}
