import { NextRequest, NextResponse } from "next/server";
import { currentStaff } from "./staff-access";
import type { Permission } from "./staff-policy";
export class StaffError extends Error { constructor(message:string,public status=400){super(message);} }
export function staffRoute(permission:Permission|undefined, handler:(req:NextRequest,staff:NonNullable<Awaited<ReturnType<typeof currentStaff>>>)=>Promise<Response>) {
  return async(req:NextRequest)=> {
    try {
      if(!["GET","HEAD"].includes(req.method) && req.headers.get("origin")!==req.nextUrl.origin) throw new StaffError("This request is not allowed.",403);
      const staff=await currentStaff(); if(!staff) throw new StaffError("Please sign in.",401);
      const {hasPermission}=await import('./staff-policy');
      if(permission && !hasPermission(staff.role,permission)) throw new StaffError("You do not have access to this action.",403);
      const response=await handler(req,staff); response.headers.set('Cache-Control','private, no-store'); return response;
    }catch(error){return NextResponse.json({error:error instanceof StaffError?error.message:'This service is unavailable. Please retry.'},{status:error instanceof StaffError?error.status:503,headers:{'Cache-Control':'private, no-store'}});}
  };
}
export function text(value:unknown,max=2000){ if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw new StaffError(`Enter text of up to ${max} characters.`);return value.trim(); }
