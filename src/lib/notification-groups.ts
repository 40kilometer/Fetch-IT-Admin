export type InboxItem = { id: string; title: string; detail: string; at: string; href: string };
export function groupNotifications(items: InboxItem[]) {
  const unique = new Map<string, InboxItem & { ids: string[] }>();
  for (const item of [...items].sort((a,b)=>b.at.localeCompare(a.at))) {
    const prior = unique.get(item.href);
    if (prior) prior.ids.push(item.id); else unique.set(item.href,{...item,ids:[item.id]});
  }
  return [
    {key:"decisions",label:"Your decisions",items:[...unique.values()].filter(item=>/needs your decision|awaiting Admin decision/i.test(item.title))},
    {key:"customers",label:"Customer replies",items:[...unique.values()].filter(item=>item.href.startsWith('/dashboard/support/'))},
    {key:"followup",label:"Operational follow-up",items:[...unique.values()].filter(item=>!item.href.startsWith('/dashboard/support/')&&!/needs your decision|awaiting Admin decision/i.test(item.title))},
  ];
}
