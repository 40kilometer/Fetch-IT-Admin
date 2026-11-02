'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {Notice} from '@/lib/staff-notifications';
import {SafetyAlertTracker,SafetyChime,reserveSafetyChime,safetySoundKey,safetySoundRole} from '@/lib/safety-alert-sound';

export function useSafetyAlertSound(actorId:string,role:string){
  const available=safetySoundRole(role),player=useRef<SafetyChime|null>(null),tracker=useRef(new SafetyAlertTracker());
  const enabled=useRef(false),generation=useRef(0),busy=useRef(false);
  const [on,setOn]=useState(false),[working,setWorking]=useState(false),[error,setError]=useState(''),[remembered,setRemembered]=useState(false);
  const key=safetySoundKey(actorId);
  useEffect(()=>{
    const chime=new SafetyChime();player.current=chime;tracker.current=new SafetyAlertTracker();enabled.current=false;generation.current++;
    setOn(false);setError('');setRemembered(false);
    try{setRemembered(localStorage.getItem(key)==='on');}catch{}
    const changed=(event:StorageEvent)=>{if(event.key===key&&event.newValue==='off'){enabled.current=false;generation.current++;setOn(false);setRemembered(false);player.current?.close();}};
    window.addEventListener('storage',changed);
    return()=>{enabled.current=false;generation.current++;player.current?.close();player.current=null;window.removeEventListener('storage',changed);};
  },[key,available]);
  const observe=useCallback((items:readonly Notice[])=>{
    const ids=tracker.current.observe(items);
    if(!available||!enabled.current||!ids.length)return;
    const current=generation.current;
    const play=()=>{
      if(!enabled.current||current!==generation.current)return;
      try{
        if(!player.current?.ready)throw Error('Sound is paused. Click Enable safety sounds to resume it.');
        let shouldPlay=true;
        try{shouldPlay=reserveSafetyChime(localStorage,key+':heard',ids,Date.now());}catch{}
        if(shouldPlay)player.current.play();
      }catch(cause){enabled.current=false;setOn(false);setError(cause instanceof Error?cause.message:'Sound could not play. Visual alerts remain available.');}
    };
    if(navigator.locks)void navigator.locks.request(key,play).catch(play);else play();
  },[available,key]);
  async function activate(testOnly=false){
    if(busy.current)return;
    busy.current=true;setWorking(true);setError('');
    const current=generation.current;
    try{
      // A previously muted/closed context is replaced only on this user gesture.
      if(!player.current||!player.current.ready){player.current?.close();player.current=new SafetyChime();}
      await player.current.enable();
      if(current!==generation.current)return;
      player.current.play();
      if(!testOnly){enabled.current=true;setOn(true);setRemembered(true);try{localStorage.setItem(key,'on');}catch{}}
    }catch(cause){enabled.current=false;setOn(false);setError(cause instanceof Error?cause.message:'Sound could not play. Visual alerts remain available.');}
    finally{busy.current=false;setWorking(false);}
  }
  function mute(){enabled.current=false;generation.current++;setOn(false);setRemembered(false);setError('');player.current?.close();try{localStorage.setItem(key,'off');}catch{}}
  const controls=available?<section className="safety-sound-controls" aria-label="Safety Review alert sounds"><div><strong>Safety Review sounds</strong><p className="muted small">New rider applications and safety case alerts only. Keep the portal open. Existing alerts stay silent.</p></div><div className="row-actions"><button type="button" className="btn" disabled={working} aria-pressed={on} onClick={()=>on?mute():void activate()}>{working?'Enabling…':on?'Mute safety sounds':'Enable safety sounds'}</button><button type="button" className="btn" disabled={working} onClick={()=>void activate(true)}>Test sound</button></div><p className="small" role="status">{error|| (on?'Safety sounds are on for this visit.':remembered?'Your preference is saved. Enable safety sounds for this visit.':'Safety sounds are off.')}</p></section>:null;
  return {observe,controls,enabled};
}
