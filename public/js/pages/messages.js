// MESSAGES PAGE — fixed message layout
const MessagesPage = (() => {
  let currentUserId = null;
  let currentUserName = '';
  let messagesOffset = 0;

  const timeStr = (ts) => new Date(ts * 1000).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });

  // Fixed layout: avatar + inner-wrapper with bubble + timestamp
  const renderMsg = (m, me) => {
    const isMine = m.sender_id === me.id;
    const avatarHtml = !isMine
      ? `<div class="avatar" style="width:32px;height:32px;flex-shrink:0"><img src="${m.avatar||'/img/default-avatar.svg'}"></div>`
      : '';
    return `<div class="msg-row ${isMine ? 'mine' : ''}">
      ${avatarHtml}
      <div class="msg-content">
        <div class="msg-bubble">${escHtml(m.content)}</div>
        <div class="msg-time">${timeStr(m.created_at)}</div>
      </div>
    </div>`;
  };

  return {
    async render(container, me) {
      container.innerHTML = `
      <div class="page" style="padding:0">
        <div class="messages-layout">
          <div class="dialogs-list">
            <div class="dialogs-header">Сообщения</div>
            <div id="dialogs-items"><div class="spinner" style="width:24px;height:24px;margin:16px auto"></div></div>
          </div>
          <div class="chat-area" id="chat-area">
            <div class="chat-empty">
              <svg viewBox="0 0 24 24" style="width:48px;height:48px;opacity:.3"><path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
              <p class="text-muted">Выбери диалог или начни новый</p>
              <button class="btn-primary" onclick="MessagesPage.showNewDialog()">Новое сообщение</button>
            </div>
          </div>
        </div>
      </div>`;
      await this.loadDialogs(me);
    },

    async loadDialogs(me) {
      const el = document.getElementById('dialogs-items');
      if (!el) return;
      try {
        const dialogs = await API.getDialogs();
        el.innerHTML = dialogs.length ? dialogs.map(d => `
          <div class="dialog-item ${d.id === currentUserId ? 'active' : ''}" id="dialog-${d.id}"
               onclick="MessagesPage.openDialog(${d.id},'${escHtml(d.display_name||d.username)}','${d.avatar||''}')">
            <div class="avatar" style="width:38px;height:38px"><img src="${d.avatar||'/img/default-avatar.svg'}"></div>
            <div class="dialog-info">
              <div class="dialog-name">${escHtml(d.display_name||d.username)}</div>
              <div class="dialog-last">${escHtml(d.last_message||'')}</div>
            </div>
            ${d.unread > 0 ? `<div class="dialog-unread">${d.unread}</div>` : ''}
          </div>`).join('')
          : '<p class="text-muted" style="padding:8px;font-size:.85rem">Нет диалогов</p>';
      } catch(e) { App.toast(e.message, 'error'); }
    },

    async openDialog(userId, userName, avatar) {
      currentUserId = parseInt(userId);
      currentUserName = userName;
      const me = App.me;

      document.querySelectorAll('.dialog-item').forEach(d => d.classList.remove('active'));
      document.getElementById(`dialog-${userId}`)?.classList.add('active');

      const chatArea = document.getElementById('chat-area');
      if (!chatArea) return;
      chatArea.innerHTML = `
        <div class="chat-header">
          <div class="avatar" style="width:36px;height:36px"><img src="${avatar||'/img/default-avatar.svg'}"></div>
          <div class="chat-name">${escHtml(userName)}</div>
        </div>
        <div class="chat-messages" id="chat-msgs"></div>
        <div class="chat-input-area">
          <div class="chat-input-row">
            <textarea class="chat-input" id="chat-input" placeholder="Написать ${escHtml(userName)}..." rows="1"
              onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();MessagesPage.sendMsg()}"
              oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,150)+'px'"></textarea>
            <button class="chat-send-btn" onclick="MessagesPage.sendMsg()">
              <svg viewBox="0 0 24 24"><path d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
            </button>
          </div>
        </div>`;

      try {
        const msgs = await API.getMessages(userId);
        const msgsEl = document.getElementById('chat-msgs');
        if (!msgsEl) return;
        if (msgs.length === 0) {
          msgsEl.innerHTML = `<div class="chat-empty"><p class="text-muted">Начни переписку!</p></div>`;
        } else {
          msgsEl.innerHTML = msgs.map(m => renderMsg(m, me)).join('');
          msgsEl.scrollTop = msgsEl.scrollHeight;
        }
        document.getElementById(`dialog-${userId}`)?.querySelector('.dialog-unread')?.remove();
        App.updateBadges();
      } catch(e) { App.toast(e.message, 'error'); }

      document.getElementById('chat-input')?.focus();
    },

    appendMessage(msg) {
      if (!currentUserId) return;
      const isRelevant = (msg.sender_id === currentUserId && msg.receiver_id === App.me?.id) ||
                         (msg.sender_id === App.me?.id   && msg.receiver_id === currentUserId);
      if (!isRelevant) return;
      const msgsEl = document.getElementById('chat-msgs');
      if (!msgsEl) return;
      msgsEl.querySelector('.chat-empty')?.remove();
      msgsEl.insertAdjacentHTML('beforeend', renderMsg(msg, App.me));
      msgsEl.scrollTop = msgsEl.scrollHeight;
    },

    async sendMsg() {
      if (!currentUserId) return;
      const input = document.getElementById('chat-input');
      if (!input) return;
      const content = input.value.trim();
      if (!content) return;
      input.value = '';
      input.style.height = 'auto';

      if (App.socket && App.socket.connected) {
        App.socket.emit('message:send', { to: currentUserId, content });
      } else {
        try {
          const msg = await API.sendMessage(currentUserId, content);
          this.appendMessage(msg);
        } catch(e) { App.toast(e.message, 'error'); }
      }
    },

    showNewDialog() {
      App.openModal(`
        <div class="modal-title">Новое сообщение</div>
        <input class="search-bar" placeholder="Поиск пользователя..." id="ndlg-search"
               oninput="MessagesPage.searchForNew(this.value)" autofocus>
        <div id="ndlg-results" style="margin-top:12px"></div>
        <div class="modal-actions"><button class="btn-secondary" onclick="App.closeModal()">Отмена</button></div>`);
    },

    async searchForNew(q) {
      const el = document.getElementById('ndlg-results');
      if (!el || !q.trim()) { if(el) el.innerHTML=''; return; }
      try {
        const users = await API.searchUsers(q);
        el.innerHTML = users.map(u => `
          <div class="search-result-item" onclick="App.closeModal();App.nav('messages');
               setTimeout(()=>MessagesPage.openDialog(${u.id},'${escHtml(u.display_name||u.username)}','${u.avatar||''}'),200)">
            <div class="avatar"><img src="${u.avatar||'/img/default-avatar.svg'}"></div>
            <div><div style="font-weight:600">${escHtml(u.display_name||u.username)}</div>
            <div class="text-muted">@${u.username}</div></div>
          </div>`).join('') || '<p class="text-muted">Не найдено</p>';
      } catch {}
    }
  };
})();
