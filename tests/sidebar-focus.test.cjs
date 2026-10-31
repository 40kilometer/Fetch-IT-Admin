const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const exportsFocus={};new Function('exports',ts.transpileModule(fs.readFileSync('src/lib/sidebar-focus.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exportsFocus);
function element(tag,parent=null,open=false){const node={tagName:tag,parentElement:parent,children:[],getClientRects:()=>[{}],closest:()=>null,hasAttribute:name=>name==='open'&&open,contains(other){return other===this||this.children.some(child=>child.contains(other))}};parent?.children.push(node);return node}
test('mobile focus wrapping ignores collapsed details descendants even when they report rectangles',()=>{
 const root=element('ASIDE'),brand=element('A',root),team=element('DETAILS',root),heading=element('SUMMARY',team),hiddenLink=element('A',team),account=element('DETAILS',root),accountHeading=element('SUMMARY',account),logout=element('BUTTON',account);root.querySelectorAll=()=>[brand,heading,hiddenLink,accountHeading,logout];
 assert.deepEqual(exportsFocus.sidebarFocusTargets(root),[brand,heading,accountHeading]);
 team.hasAttribute=name=>name==='open';assert.deepEqual(exportsFocus.sidebarFocusTargets(root),[brand,heading,hiddenLink,accountHeading]);
 account.hasAttribute=name=>name==='open';assert.equal(exportsFocus.sidebarFocusTargets(root).at(-1),logout);
});
