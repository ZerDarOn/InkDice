// Display only facts supplied by the current card and local calculation results.
export function assistantTasks(issues, derived) {
  const all=[...issues];
  if(derived.effects?.backgroundBonusWarning) all.push({field:'backgroundAutomation',message:derived.effects.backgroundBonusWarning,severity:'warning'});
  const groups=new Map();
  for(const item of all) {
    if(!item.message) continue;
    const group=groups.get(item.field)||{field:item.field,messages:[],severity:'warning'};
    if(!group.messages.includes(item.message)) group.messages.push(item.message);
    if(item.severity==='error') group.severity='error';
    groups.set(item.field,group);
  }
  return [...groups.values()].sort((a,b)=>(a.severity==='error'?0:1)-(b.severity==='error'?0:1));
}

export function assistantAiStatus(profile,hasSessionKey) {
  if(!profile?.baseUrl||!profile?.model) return '未配置 AI。当前显示本机计算与查询，不是模型回复。';
  const date=new Date(profile.testedAt);
  const tested=Number.isFinite(date.getTime())?`上次连通测试：${date.toLocaleString('zh-CN')}`:'没有有效的连通测试记录';
  return `已保存模型：${profile.model}。${tested}。${hasSessionKey?'会话中有密钥，可在 AI 页发送问题；服务是否在线以实际回复为准。':'当前会话无密钥，请在设置中重新输入。'}发送时附带当前卡摘要与同系统的匹配资料，不会直接修改人物。`;
}

export function assistantGeometry(x,y,width,height) {
  const margin=12,panelWidth=Math.max(0,Math.min(416,width-margin*2)),panelHeight=Math.max(0,Math.min(620,height-margin*2));
  return {width:panelWidth,height:panelHeight,left:Math.max(margin,Math.min(x+58-panelWidth,width-panelWidth-margin)),top:Math.max(margin,Math.min(y-12-panelHeight,height-panelHeight-margin))};
}
