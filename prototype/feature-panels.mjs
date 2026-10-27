// Move the existing editor into the modal: one set of fields and event handlers.
let active = null;
let dialog, popover, closeSuggestions;
const observers = new Map();

export function setupFeaturePanels(form, suggestions, close) {
  popover = suggestions; closeSuggestions = close;
  dialog = document.createElement('dialog');
  dialog.className = 'feature-reader-dialog';
  dialog.setAttribute('aria-labelledby', 'featureReaderTitle');
  dialog.innerHTML = '<header><h2 id="featureReaderTitle"></h2><button type="button" data-close-feature-reader aria-label="关闭完整能力列表">关闭 ×</button></header><div class="feature-reader-body"></div>';
  form.append(dialog);
  form.addEventListener('click', event => {
    const button = event.target.closest('[data-expand-features]');
    if (button) openPanel(button);
    if (event.target.closest('[data-close-feature-reader]')) dialog.close();
  });
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => {
    if (!active) return;
    closeSuggestions();
    const {panel, marker, button, popoverParent} = active;
    marker.replaceWith(panel);
    popoverParent.append(popover);
    panel.classList.remove('is-expanded');
    panel.querySelectorAll('textarea').forEach(input => input.style.height = '');
    active = null;
    refreshFeaturePanels();
    button.focus({preventScroll:true});
  });
  form.addEventListener('input', event => {
    if (active && event.target.matches('.feature-reader-dialog textarea')) fitTextarea(event.target);
  });
  form.addEventListener('wheel', event => {
    const list = event.target.closest('.feature-scroll-region');
    if (!list || active || !event.target.matches('textarea') || list.children.length <= 3 || event.ctrlKey) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 20 : event.deltaMode === 2 ? list.clientHeight : 1;
    list.scrollTop += event.deltaY * unit;
  }, {passive:false});
}

function fitTextarea(input) {
  input.style.height = 'auto';
  input.style.height = `${Math.max(80, input.scrollHeight)}px`;
}

function openPanel(button) {
  if (active) return;
  closeSuggestions();
  const panel = button.closest('.feature-ledger');
  const marker = document.createElement('div');
  marker.className = `feature-panel-placeholder${panel.classList.contains('feature-special')?' feature-special':''}`;
  marker.style.height = `${panel.getBoundingClientRect().height}px`;
  marker.setAttribute('aria-hidden','true');
  panel.before(marker);
  active = {panel, marker, button, popoverParent:popover.parentElement};
  dialog.querySelector('h2').textContent = panel.querySelector('h2').textContent;
  dialog.querySelector('.feature-reader-body').append(panel);
  dialog.append(popover);
  panel.classList.add('is-expanded');
  dialog.showModal();
  refreshFeaturePanels();
}

export function refreshFeaturePanels() {
  for (const observer of observers.values()) observer.disconnect();
  observers.clear();
  document.querySelectorAll('.feature-ledger').forEach(panel => {
    const container = panel.querySelector(':scope > [id$="Rows"]');
    if (!container) return;
    const rows = [...container.children].filter(row => row.matches('.feature-ledger-row'));
    container.classList.add('feature-scroll-region');
    container.tabIndex = 0;
    container.setAttribute('aria-label', `${panel.querySelector('h2').textContent}列表，共${rows.length}项`);
    let button = panel.querySelector('[data-expand-features]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button'; button.dataset.expandFeatures = '';
      button.title = '弹窗查看完整列表';
      panel.querySelector('.section-heading').append(button);
    }
    button.textContent = `展开 · ${rows.length}`;
    button.setAttribute('aria-label', `展开${panel.querySelector('h2').textContent}完整列表`);
    if (panel.classList.contains('is-expanded')) {
      container.style.maxHeight = 'none';
      panel.querySelectorAll('textarea').forEach(fitTextarea);
      return;
    }
    const measure = () => {
      const height = rows.slice(0,3).reduce((sum,row) => sum + row.getBoundingClientRect().height, 0);
      container.style.maxHeight = rows.length > 3 && height ? `${Math.ceil(height)}px` : '';
    };
    measure();
    const observer = new ResizeObserver(measure);
    rows.slice(0,3).forEach(row => observer.observe(row));
    observers.set(container, observer);
  });
}
