export const APP_VERSION = '0.1.6';
export const WELCOME_KEY = 'inkdice.welcome.seen.v1';
export const PROJECT_URL = 'https://github.com/ZerDarOn/InkDice';
export const FEEDBACK_URL = PROJECT_URL + '/issues/new/choose';

export function installAbout() {
  const dialog = document.createElement('dialog');
  dialog.id='aboutDialog'; dialog.className='about-dialog';
  dialog.setAttribute('aria-labelledby','aboutTitle');
  dialog.innerHTML=`<header class="about-heading"><img src="./assets/inkdice-logo.svg" width="72" height="72" alt="骰面与笔尖 Logo"/><div><h1 id="aboutTitle">墨骰工坊 <span>InkDice</span></h1><p>让填卡少一点繁琐，让冒险多一点自由。</p><small>版本 ${APP_VERSION} · 开发与维护：<a href="https://github.com/ZerDarOn" target="_blank" rel="noopener noreferrer">ZerDarOn</a></small></div><button type="button" class="icon-only about-close" aria-label="关闭关于">×</button></header>
  <div class="about-body" tabindex="0" aria-label="关于与使用说明">
    <p>墨骰工坊起于一个简单的想法：把散落在表格与资料里的内容整理起来，让玩家更方便地创建、记录和使用自己的人物。</p>
    <p>从最初的人物卡，到不同规则系统、资料查询与自动填入，这个工具是在一次次试用、反馈和修改中慢慢成形的。感谢参与测试、指出问题和提供建议的朋友们。</p>
    <p>我们希望自动化能够帮你省事，也希望你始终保留自己填写、修改和决定的自由。人物属于玩家，故事属于同桌的每一个人。</p>
    <h2>使用前，请了解</h2>
    <dl><dt>独立开发工具</dt><dd>本软件并非 D&D、Call of Cthulhu 或相关权利方的官方产品，也不代表其认可或背书。相关名称、规则及资料的权利归各自权利人所有。</dd>
    <dt>资料与计算</dt><dd>不同版本、扩展及第三方内容分别标注。当前收录和自动化仍可能存在遗漏或错误；有疑问时，请核对原始资料，并与主持人确认。</dd>
    <dt>AI 辅助</dt><dd>AI 回答仅供参考，可能误解规则。使用时会向你配置的服务发送当前人物摘要、匹配资料及近期对话；不使用 AI，不会因此发送这些内容。</dd>
    <dt>存档与备份</dt><dd>人物资料保存在本机。重要人物请定期导出 JSON 备份；Excel 适合查看、编辑和分享，完整迁移请使用 JSON。</dd></dl>
    <p class="about-signoff">感谢每一位陪我们把它做得更好的人。<br/>愿下一次掷骰，开启一个值得记住的故事。</p>
    <p class="about-feedback-note">欢迎通过 GitHub 留言、反馈问题或提出建议。公开反馈请勿附带 API 密钥或私人存档。</p>
  </div><footer class="about-footer"><a href="${PROJECT_URL}" target="_blank" rel="noopener noreferrer">项目主页</a><a href="${FEEDBACK_URL}" target="_blank" rel="noopener noreferrer">反馈问题 / 提出建议 ↗</a><button id="aboutStart" type="button" class="primary">开始使用</button></footer>`;
  document.body.append(dialog);
  const open=()=>{if(dialog.open)return;dialog.querySelector('.about-body').scrollTop=0;dialog.showModal();dialog.querySelector('#aboutStart').focus();};
  const markSeen=()=>{try{localStorage.setItem(WELCOME_KEY,'true');}catch{/* Storage may be unavailable; never block the sheet. */}};
  dialog.querySelector('.about-close').addEventListener('click',()=>dialog.close());
  dialog.querySelector('#aboutStart').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',markSeen);
  document.getElementById('aboutButton').addEventListener('click',()=>{dialog.querySelector('#aboutStart').textContent='返回人物卡';open();});
  let seen=false;try{seen=localStorage.getItem(WELCOME_KEY)==='true';}catch{}
  if(!seen)open();
  return {open};
}
