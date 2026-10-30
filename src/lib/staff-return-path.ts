export function staffReturnPath(input:string|null) {
  if(!input||!input.startsWith('/')||input.startsWith('//')||input.includes('\\')||input.length>2000)return '/dashboard';
  try{const url=new URL(input,'https://staff.invalid');return url.origin==='https://staff.invalid'&&(url.pathname==='/dashboard'||url.pathname.startsWith('/dashboard/'))?url.pathname+url.search:'/dashboard'}catch{return '/dashboard'}
}
