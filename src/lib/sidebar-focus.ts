/** Closed <details> descendants can still report layout rectangles. */
export function sidebarFocusTargets(root:HTMLElement|null) {
  return Array.from(root?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), summary, [tabindex="0"]')??[]).filter(element=>{
    if(!element.getClientRects().length||element.closest('[hidden], [inert]'))return false;
    for(let parent=element.parentElement;parent&&parent!==root;parent=parent.parentElement){
      if(parent.tagName==='DETAILS'&&!parent.hasAttribute('open')){
        const summary=Array.from(parent.children).find(child=>child.tagName==='SUMMARY');
        if(!summary?.contains(element))return false;
      }
    }
    return true;
  });
}
