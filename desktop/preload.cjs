const { ipcRenderer } = require('electron');
// Read-only startup diagnostic. No Node or IPC API is exposed to page content.
window.addEventListener('DOMContentLoaded', () => {
  const report = () => {
    const title = document.getElementById('characterTitle')?.textContent;
    const statCount = document.querySelectorAll('.stat-ribbon button').length;
    if (!title || title === '未命名角色') return;
    ipcRenderer.send('desktop-ready', { title, statCount, characterCount: document.querySelectorAll('[data-character-id]').length });
    observer.disconnect();
  };
  const observer = new MutationObserver(report);
  observer.observe(document.body,{childList:true,subtree:true});
  report();
  setTimeout(() => observer.disconnect(),15000);
});
