const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
const cache=new Map();
function load(relative){
  const filename=path.resolve(root,relative);if(cache.has(filename))return cache.get(filename).exports;
  const mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));cache.set(filename,mod);
  const original=mod.require.bind(mod);
  const quoteRoot=path.resolve(process.env.CUSTOMER_APP_PATH||path.resolve(root,'../fetch-customer'));
  mod.require=name=>name.startsWith('@/')?load(path.resolve(filename.startsWith(quoteRoot+path.sep)?quoteRoot:root,'src',name.slice(2)+'.ts')):name.startsWith('.')?load(path.relative(root,path.resolve(path.dirname(filename),name+'.ts'))):original(name);
  mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);
  return mod.exports;
}
const {defaultPlatformSettings,validatePlatformSettings,configuredSurge}=load('src/lib/platform-policy.ts');
const customerRoot=process.env.CUSTOMER_APP_PATH || path.resolve(root,'../fetch-customer');
const fareFile=path.join(customerRoot,'src/lib/fare.ts');
const {hasPermission,supportScope,caseScope}=load('src/lib/staff-policy.ts');
test('staff permissions preserve owner-only capabilities and specialist boundaries',()=>{
  assert(hasPermission('ADMIN','operations'));
  assert(!hasPermission('SUPPORT','operations'));
  assert(!hasPermission('SUPPORT_SUPERVISOR','finance'));
  assert(!hasPermission('SUPPORT_SUPERVISOR','safety'));
  assert(hasPermission('SUPPORT_SUPERVISOR','support.manage'));
  assert(!hasPermission('FINANCE','support'));
  assert(!hasPermission('SAFETY','finance'));
  assert(hasPermission('SUPERADMIN','operations'));
});
test('support and reviewer scopes do not expose another team or agent',()=>{
  assert.deepEqual(supportScope({id:'agent',role:'SUPPORT'}),{OR:[{assignedAdminId:'agent'},{assignedAdminId:null}]});
  assert(!hasPermission('FINANCE','finance'));
  assert.equal(caseScope({id:'reviewer',role:'SAFETY'}).kind,'SAFETY');
  assert.deepEqual(caseScope({id:'supervisor',role:'SUPPORT_SUPERVISOR'}).OR,[{kind:'ESCALATION'},{createdById:'supervisor'}]);
});
test('invalid or incomplete financial/service settings cannot be saved',()=>{
  for(const change of [{commissionPercent:101},{offerSeconds:29},{offerSeconds:30.5},{vehicles:[]},{rideEnabled:'yes'},{maxSurge:Infinity},{extraCapability:true}])assert.throws(()=>validatePlatformSettings({...defaultPlatformSettings(),...change}));
  const settings=defaultPlatformSettings();settings.fares.TRICYCLE.perKm=-1;assert.throws(()=>validatePlatformSettings(settings));
  assert.deepEqual(validatePlatformSettings(defaultPlatformSettings()),defaultPlatformSettings());
});
test('saved prices affect new ride and delivery quotes without mutating an earlier quote',{skip:!fs.existsSync(fareFile)&&'Set CUSTOMER_APP_PATH to include the Customer quote integration'},()=>{
  const {quoteFare,quoteRideFare}=load(fareFile);
  const input={pickup:{lat:16.03,lng:120.23},dropoff:{lat:16.05,lng:120.25},vehicleClass:'TRICYCLE',cargoWeightKg:0,when:new Date('2026-10-19T04:00:00Z')};
  const settings=defaultPlatformSettings();const original=quoteFare({...input,settings});const recorded=original.fare.totalFare;
  settings.fares.TRICYCLE.baseFare+=100;
  const delivery=quoteFare({...input,settings}),ride=quoteRideFare({...input,settings});
  assert.equal(delivery.fare.totalFare,recorded+100);assert.equal(ride.fare.totalFare,delivery.fare.totalFare);assert.equal(original.fare.totalFare,recorded);
});
test('configured Philippine rush-hour surge respects the cap',()=>{
  const settings=defaultPlatformSettings();settings.fridayExtra=.5;settings.maxSurge=1.4;
  assert.equal(configuredSurge(settings,new Date('2026-10-16T10:00:00Z')),1.4);
  assert.equal(configuredSurge(settings,new Date('2026-10-19T04:00:00Z')),1);
});
