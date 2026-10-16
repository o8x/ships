'use strict';

(function registerTwofaTool() {
  const { el, Icons, copyText } = window.ShipsUI;
  const i18n = window.ShipsI18n;
  const COPY_FEEDBACK_MS = (window.ShipsConstants && window.ShipsConstants.COPY_FEEDBACK_MS) || 1200;

  i18n.extend({
    zh: {
      twofa: {
        placeholder: '输入 otpauth:// 链接或 Base32 密钥',
        add: '添加',
        empty: '暂无验证码，输入 otpauth:// 链接或密钥后点「添加」',
        untitled: '未命名',
        confirmDelete: '确认删除？',
        errors: {
          empty: '请输入 otpauth:// 链接或密钥',
          'invalid-secret': '密钥格式不正确',
          'invalid-url': '链接格式不正确',
          'unsupported-type': '仅支持 TOTP（不支持 HOTP）',
          duplicate: '该密钥已添加',
          failed: '添加失败',
        },
      },
    },
    en: {
      twofa: {
        placeholder: 'Enter an otpauth:// link or Base32 secret',
        add: 'Add',
        empty: 'No codes yet. Paste an otpauth:// link or secret, then click Add.',
        untitled: 'Untitled',
        confirmDelete: 'Delete?',
        errors: {
          empty: 'Enter an otpauth:// link or secret',
          'invalid-secret': 'Invalid secret',
          'invalid-url': 'Invalid link',
          'unsupported-type': 'Only TOTP is supported (not HOTP)',
          duplicate: 'This secret is already added',
          failed: 'Failed to add',
        },
      },
    },
  });

  const TICK_MS = 250;
  const ALERT_SECONDS = 5;

  function errorText(code) {
    const key = `twofa.errors.${code}`;
    const text = i18n.t(key);
    return text === key ? i18n.t('twofa.errors.failed') : text;
  }

  function mount(container) {
    const cards = [];
    let tickTimer = null;
    let fetching = false;

    const input = el('input', {
      class: 'field flex-1 font-mono',
      type: 'text',
      spellcheck: 'false',
      autocomplete: 'off',
      placeholder: i18n.t('twofa.placeholder'),
    });
    const addBtn = el('button', { class: 'btn btn-accent shrink-0', type: 'button' }, i18n.t('twofa.add'));
    const inputRow = el('div', { class: 'mb-3 flex items-stretch gap-2' });
    inputRow.append(input, addBtn);

    const errorLine = el('div', { class: 'mb-2.5 hidden text-[11px] text-danger' }, '');
    const list = el('div', { class: 'flex flex-col gap-2.5' });
    container.append(inputRow, errorLine, list);

    function showError(code) {
      errorLine.textContent = errorText(code);
      errorLine.classList.remove('hidden');
      input.classList.add('invalid');
      input.classList.remove('blink-error');
      void input.offsetWidth;
      input.classList.add('blink-error');
    }

    function clearError() {
      errorLine.classList.add('hidden');
      input.classList.remove('invalid', 'blink-error');
    }

    input.addEventListener('input', clearError);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') submit();
    });

    /* ------- 卡片 ------- */

    function displayNames(account) {
      const title = (account.title || '').trim();
      const subtitle = (account.subtitle || '').trim();
      if (title) return { title, subtitle };
      if (subtitle) return { title: subtitle, subtitle: '' };
      return { title: i18n.t('twofa.untitled'), subtitle: '' };
    }

    function buildDigits(count) {
      const groupSize = Math.ceil(count / 2);
      const row = el('div', { class: 'flex min-w-0 items-center gap-1.5' });
      const boxes = [];
      for (let i = 0; i < count; i += 1) {
        if (i > 0 && i % groupSize === 0) row.appendChild(el('span', { class: 'w-1.5' }, ''));
        const box = el(
          'span',
          {
            class:
              'inline-flex h-11 w-8 items-center justify-center rounded-control border border-border bg-surface-2 font-mono text-[22px] font-medium text-fg',
          },
          '·'
        );
        boxes.push(box);
        row.appendChild(box);
      }
      return { row, boxes };
    }

    function renderActions(card) {
      card.els.actions.innerHTML = '';
      if (card.confirming) {
        const wrap = el('div', { class: 'flex shrink-0 items-center gap-1' });
        wrap.appendChild(el('span', { class: 'whitespace-nowrap text-[11px] text-danger' }, i18n.t('twofa.confirmDelete')));
        const yes = el('button', { class: 'icon-btn h-7 w-7', type: 'button' });
        yes.innerHTML = Icons.check(15);
        yes.style.color = 'var(--color-danger)';
        yes.addEventListener('click', () => removeAccount(card));
        const no = el('button', { class: 'icon-btn h-7 w-7', type: 'button' });
        no.innerHTML = Icons.x(15);
        no.addEventListener('click', () => {
          card.confirming = false;
          renderActions(card);
        });
        wrap.append(yes, no);
        card.els.actions.appendChild(wrap);
        return;
      }
      const copy = el('button', {
        class: 'icon-btn h-7 w-7 shrink-0',
        type: 'button',
        'data-tip': i18n.t('common.copy'),
      });
      copy.innerHTML = Icons.copy(15);
      copy.addEventListener('click', async () => {
        if (!card.code) return;
        const ok = await copyText(card.code);
        if (!ok) return;
        copy.innerHTML = Icons.check(15);
        copy.style.color = 'var(--color-success)';
        setTimeout(() => {
          copy.innerHTML = Icons.copy(15);
          copy.style.color = '';
        }, COPY_FEEDBACK_MS);
      });
      const del = el('button', {
        class: 'icon-btn h-7 w-7 shrink-0',
        type: 'button',
        'data-tip': i18n.t('common.delete'),
      });
      del.innerHTML = Icons.trash(15);
      del.addEventListener('click', () => {
        card.confirming = true;
        renderActions(card);
      });
      card.els.actions.append(copy, del);
    }

    function buildCard(account) {
      const names = displayNames(account);
      const card = { account, confirming: false, code: '', lastStep: -1, disposed: false, els: {} };

      const root = el('div', {
        class: 'flex flex-col gap-3 rounded-card border border-border bg-surface px-3 pb-2.5 pt-2',
      });

      const head = el('div', { class: 'flex items-center gap-2' });
      const namesBox = el('div', { class: 'flex min-w-0 flex-1 items-baseline gap-2' });
      namesBox.appendChild(el('div', { class: 'truncate text-[13px] font-medium text-fg' }, names.title));
      if (names.subtitle) {
        namesBox.appendChild(el('div', { class: 'truncate text-[11px] text-fg-muted' }, names.subtitle));
      }
      const actions = el('div', { class: 'flex shrink-0 items-center' });
      head.append(namesBox, actions);
      root.appendChild(head);

      const codeRow = el('div', { class: 'flex items-end gap-2' });
      const { row, boxes } = buildDigits(account.digits);
      const secs = el('div', { class: 'ml-auto shrink-0 font-mono text-[11px] text-fg-muted' }, '');
      codeRow.append(row, secs);
      root.appendChild(codeRow);

      const bar = el('div', { class: 'h-1 w-full overflow-hidden rounded-pill bg-surface-3' });
      const fill = el('div', { class: 'h-full rounded-pill' });
      fill.style.width = '0%';
      fill.style.background = 'var(--color-accent)';
      fill.style.transition = 'width 0.25s linear, background 0.2s ease';
      bar.appendChild(fill);
      root.appendChild(bar);

      card.els = { root, boxes, secs, fill, actions };
      renderActions(card);
      list.appendChild(root);
      return card;
    }

    /* ------- 实时刷新 ------- */

    function fillCode(card, code) {
      card.code = code;
      for (let i = 0; i < card.els.boxes.length; i += 1) {
        card.els.boxes[i].textContent = code[i] || '·';
      }
    }

    async function refreshCodes() {
      if (fetching || !cards.length) return;
      fetching = true;
      try {
        const map = await window.ships.totp.codes();
        for (const card of cards) {
          if (card.disposed) continue;
          const code = map && map[card.account.id];
          if (code) fillCode(card, code);
        }
      } catch (err) {
        /* 忽略：下一拍会重试 */
      } finally {
        fetching = false;
      }
    }

    function tick() {
      if (!cards.length) return;
      const epoch = Math.floor(Date.now() / 1000);
      let stepChanged = false;
      for (const card of cards) {
        if (card.disposed) continue;
        const period = card.account.period || 30;
        const remaining = period - (epoch % period);
        card.els.secs.textContent = `${remaining}s`;
        card.els.fill.style.width = `${(Math.max(0, remaining / period) * 100).toFixed(1)}%`;
        card.els.fill.style.background =
          remaining <= ALERT_SECONDS ? 'var(--color-danger)' : 'var(--color-accent)';
        const step = Math.floor(epoch / period);
        if (step !== card.lastStep) {
          card.lastStep = step;
          stepChanged = true;
        }
      }
      if (stepChanged) refreshCodes();
    }

    function renderEmpty() {
      list.innerHTML = '';
      list.appendChild(el('div', { class: 'py-10 text-center text-[12px] text-fg-muted' }, i18n.t('twofa.empty')));
    }

    function addAccount(account) {
      const card = buildCard(account);
      cards.push(card);
      if (cards.length === 1) {
        // 从空态切换：清掉「暂无验证码」提示，只保留卡片。
        list.innerHTML = '';
        list.appendChild(card.els.root);
      }
      tick();
    }

    async function removeAccount(card) {
      await window.ships.totp.remove(card.account.id);
      card.disposed = true;
      card.els.root.remove();
      const index = cards.indexOf(card);
      if (index >= 0) cards.splice(index, 1);
      if (!cards.length) renderEmpty();
    }

    async function submit() {
      const value = input.value.trim();
      if (!value) {
        showError('empty');
        return;
      }
      addBtn.disabled = true;
      try {
        const result = await window.ships.totp.add(value);
        if (result && result.ok) {
          clearError();
          input.value = '';
          addAccount(result.account);
        } else {
          showError((result && result.error) || 'failed');
        }
      } catch (err) {
        showError('failed');
      } finally {
        addBtn.disabled = false;
      }
    }

    addBtn.addEventListener('click', submit);

    (async () => {
      let accounts = [];
      try {
        accounts = await window.ships.totp.list();
      } catch (err) {
        accounts = [];
      }
      if (!accounts || !accounts.length) {
        renderEmpty();
      } else {
        for (const account of accounts) cards.push(buildCard(account));
        list.innerHTML = '';
        for (const card of cards) list.appendChild(card.els.root);
      }
      tick();
    })();

    tickTimer = setInterval(tick, TICK_MS);

    return () => {
      clearInterval(tickTimer);
      for (const card of cards) card.disposed = true;
    };
  }

  window.ShipsToolRegistry.register({ id: 'twofa', icon: 'shield', mount });
})();
