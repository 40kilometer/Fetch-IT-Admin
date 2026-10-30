import { NextRequest, NextResponse } from "next/server";
import { currentStaff } from "./staff-access";
import type { Permission } from "./staff-policy";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
export class StaffError extends Error { constructor(message:string,public status=400){super(message);} }
export function staffRoute(permission:Permission|undefined, handler:(req:NextRequest,staff:NonNullable<Awaited<ReturnType<typeof currentStaff>>>)=>Promise<Response>) {
  return async(req:NextRequest)=> {
    const started=performance.now(), requestId=randomUUID();
    let authenticated=started;
    const finish=(response:Response)=>{
      const finished=performance.now();
      const authMs=authenticated-started, actionMs=finished-authenticated, totalMs=finished-started;
      response.headers.set('Cache-Control','private, no-store');
      response.headers.set('X-Request-ID',requestId);
      response.headers.set('Server-Timing',`auth;dur=${authMs.toFixed(1)}, action;dur=${actionMs.toFixed(1)}, total;dur=${totalMs.toFixed(1)}`);
      if(!['GET','HEAD'].includes(req.method)&&totalMs>=2000) console.info(JSON.stringify({operation:'staff:slow-request',requestId,method:req.method,status:response.status,authMs:Math.round(authMs),actionMs:Math.round(actionMs),durationMs:Math.round(totalMs)}));
      return response;
    };
    try {
      if(!["GET","HEAD"].includes(req.method) && req.headers.get("origin")!==req.nextUrl.origin) throw new StaffError("This request is not allowed.",403);
      const staff=await currentStaff(); authenticated=performance.now(); if(!staff) throw new StaffError("Please sign in.",401);
      const {hasPermission}=await import('./staff-policy');
      if(permission && !hasPermission(staff.role,permission)) throw new StaffError("You do not have access to this action.",403);
      return finish(await handler(req,staff));
    }catch(error){if(authenticated===started)authenticated=performance.now();return finish(NextResponse.json({error:error instanceof StaffError?error.message:'This service is unavailable. Please retry.'},{status:error instanceof StaffError?error.status:503}));}
  };
}
export function text(value:unknown,max=2000){ if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw new StaffError(`Enter text of up to ${max} characters.`);return value.trim(); }
