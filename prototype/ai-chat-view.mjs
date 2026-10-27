import {cardContext,retrieveContext} from './ai-context.mjs';
const node=(tag,text,className)=>{const el=document.createElement(tag);if(text!=null)el.textContent=text;if(className)el.className=className;return el;};
export function installAiChat({getCharacter,getProfile,readLibrary,openSettings}){
  document.querySelector('.assistant-tabs').insertAdjacentHTML('beforeend','<button id="chatTab" data-panel="chat" role="tab" aria-selected="false" aria-controls="panel-chat">AI</button>');
  const panel=document.createElement('section');panel.id='panel-chat';panel.className='assistant-panel chat-panel';panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby','chatTab');document.getElementById('assistantPopover').append(panel);
  panel.innerHTML=`<div class="chat-heading"><strong>人物顾问</strong><button type="button" data-chat-settings>API 设置</button><button type="button" data-chat-clear>清空</button></div><p class="chat-scope"></p><div class="chat-messages" aria-label="当前人物的本次会话"></div><p class="chat-status" role="status" aria-live="polite"></p><form class="chat-compose"><label for="chatQuestion">询问当前人物与规则</label><textarea id="chatQuestion" maxlength="2000" rows="3" placeholder="例如：我的生命上限怎么算？这个法术能否准备？"></textarea><div class="chat-actions"><button type="button" data-chat-stop hidden>停止</button><button type="submit" class="primary">发送</button></div></form><p class="chat-disclosure">发送本卡摘要、匹配资料与近期对话；不含立绘、玩家名字段或其他人物。仅作建议，不改卡。会话刷新后清空。</p><details class="chat-context"><summary>查看当前卡摘要</summary><pre></pre></details>`;
  const sessions=new Map();let activeKey='',operation=null;
  const key=()=>{const c=getCharacter();return c?c.id+':'+c.ruleset:'';};
  const session=()=>{const k=key();if(!sessions.has(k))sessions.set(k,{messages:[],draft:'',status:''});return sessions.get(k);};
  const status=message=>{session().status=message;panel.querySelector('.chat-status').textContent=message;};
  function busy(on){panel.querySelector('[type=submit]').disabled=on;panel.querySelector('[data-chat-stop]').hidden=!on;}
  function cancel(message='已停止；未完成的内容不会加入对话。'){if(operation){const owner=operation.owner;operation.controller.abort();operation=null;busy(false);const previous=sessions.get(owner);if(previous)previous.status=message;if(owner===key())status(message);}}
  function render(){const out=panel.querySelector('.chat-messages');out.replaceChildren();const messages=session().messages;
    if(!messages.length)out.append(node('p','可以询问当前卡数值、职业选择、规则或资料。回答依据发送时的卡片快照。','chat-empty'));
    for(const message of messages){const article=node('article',null,'chat-message '+message.role);article.append(node('strong',message.role==='user'?'你':'墨骰 AI'));article.append(node('div',message.content,'chat-answer'));
      if(message.sources){if(message.warning)article.append(node('p',message.warning,'chat-warning'));const details=node('details',null,'chat-sources');details.append(node('summary',`本次提供的资料 · ${message.sources.length} 条`));for(const source of message.sources){const item=node('details');item.append(node('summary',`[${source.citation}] ${source.name} · ${source.book||'来源待核'} · ${source.sourceType||'来源待核'}`));item.append(node('pre',source.text));details.append(item);}article.append(details);if(!message.sources.length)article.append(node('small','本次未取得匹配出处，请核对规则结论。'));}
      out.append(article);
    }
    out.scrollTop=out.scrollHeight;
  }
  function refresh(){const c=getCharacter();if(!c)return;if(activeKey!==key()){cancel('切换人物，已停止上一人物的请求。');activeKey=key();panel.querySelector('textarea').value=session().draft;busy(false);render();panel.querySelector('.chat-status').textContent=session().status;}
    const profile=getProfile();panel.querySelector('.chat-scope').textContent=`${c.name||'未命名'} · ${c.ruleset==='coc-7e'?'CoC 七版':c.ruleset==='dnd5e-2014'?'5E · 2014':'5R · 2024'} · ${profile?.model||'未配置模型'}`;
    try{panel.querySelector('.chat-context pre').textContent=JSON.stringify(cardContext(c),null,2);}catch(error){status('人物摘要暂不可用：'+error.message);}
  }
  panel.querySelector('textarea').addEventListener('input',e=>session().draft=e.target.value);
  panel.querySelector('textarea').addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();panel.querySelector('form').requestSubmit();}});
  panel.querySelector('[data-chat-settings]').addEventListener('click',openSettings);
  panel.querySelector('[data-chat-stop]').addEventListener('click',()=>cancel());
  panel.querySelector('[data-chat-clear]').addEventListener('click',()=>{cancel();session().messages=[];status('本次对话已清空。');render();});
  panel.querySelector('form').addEventListener('submit',async event=>{
    event.preventDefault();if(operation)return;
    const question=panel.querySelector('textarea').value.trim(),profile=getProfile();if(!question)return status('请先输入问题。');if(!profile?.apiKey||!profile?.baseUrl||!profile?.model)return status('请打开 API 设置，配置模型并输入当前会话密钥。');
    const owner=key(),s=session(),controller=new AbortController(),op={owner,controller};operation=op;busy(true);status('正在检索当前系统的资料…');
    const alive=()=>operation===op&&owner===key()&&!controller.signal.aborted;
    try{
      const previous=s.messages.findLast(m=>m.role==='user')?.content||'';
      const lookup=/这个|那个|这些|它|上面|刚才|继续|详细/.test(question)&&previous?previous.slice(0,160)+'\n'+question:question;
      const card=cardContext(getCharacter()),retrieved=await retrieveContext(lookup,card,readLibrary,{signal:controller.signal});if(!alive())return;
      status(`${retrieved.sources.length} 条相关资料，正在等待 ${profile.model} 回复…`);
      const response=await fetch('/api/ai/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({profile,question,card,sources:retrieved.sources,retrievalStatus:retrieved.status,history:s.messages.slice(-12).map(({role,content})=>({role,content}))}),signal:controller.signal});
      const result=await response.json().catch(()=>({message:'本地对话服务返回了无法解析的响应'}));if(!alive())return;if(!response.ok||!result.ok)throw Error(result.message||result.error||'请求失败');
      s.messages.push({role:'user',content:question},{role:'assistant',content:result.answer,sources:retrieved.sources,warning:[retrieved.status.includes('失败')?retrieved.status:'',result.citationWarning,result.truncated?'回答达到长度上限，可继续追问。':''].filter(Boolean).join(' ')});s.messages=s.messages.slice(-24);s.draft='';panel.querySelector('textarea').value='';render();status('已回答；仅作填卡建议，请核对引用。');
    }catch(error){if(alive())status('无法回答：'+error.message+'。原问题已保留，可以重试。');}
    finally{if(operation===op){operation=null;busy(false);}}
  });
  return {refresh,invalidate:()=>cancel('资料包已变化，请重新发送以使用最新资料。')};
}
