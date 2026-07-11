// FRIENDS PAGE
const FriendsPage = (() => {
  let currentTab = 'friends';

  return {
    async render(container, me) {
      container.innerHTML = `
      <div class="page">
        <div class="page-main">
          <div class="page-header">
            <div class="page-title">Друзья</div>
          </div>
          <div class="friends-tabs">
            <button class="tab-btn active" id="tab-friends" onclick="FriendsPage.setTab('friends')">Все друзья</button>
            <button class="tab-btn"        id="tab-pending" onclick="FriendsPage.setTab('pending')">Заявки</button>
            <button class="tab-btn"        id="tab-search"  onclick="FriendsPage.setTab('search')">Найти людей</button>
          </div>
          <div id="friends-content"><div class="spinner"></div></div>
        </div>
      </div>`;
      this.setTab('friends');
    },

    setTab(tab) {
      currentTab = tab;
      ['friends','pending','search'].forEach(t =>
        document.getElementById(`tab-${t}`)?.classList.toggle('active', t === tab));
      this.loadTab(tab);
    },

    async loadTab(tab) {
      const el = document.getElementById('friends-content');
      if (!el) return;
      if (tab === 'search') { el.innerHTML = this.renderSearchTab(); return; }

      el.innerHTML = '<div class="spinner"></div>';
      try {
        const all = await API.getFriends();
        const me = App.me;

        if (tab === 'friends') {
          const friends = all.filter(f => f.status === 'accepted');
          el.innerHTML = friends.length
            ? friends.map(f => `
              <div class="friend-item">
                <div class="avatar" onclick="App.navProfile('${f.username}')"><img src="${f.avatar||'/img/default-avatar.svg'}"></div>
                <div class="friend-info">
                  <div class="friend-name" onclick="App.navProfile('${f.username}')" style="cursor:pointer">${escHtml(f.display_name||f.username)}</div>
                  <div class="friend-username">@${f.username}</div>
                </div>
                <div class="friend-actions">
                  <button class="btn-icon" title="Написать сообщение"
                    onclick="App.nav('messages');setTimeout(()=>MessagesPage.openDialog(${f.id},'${escHtml(f.display_name||f.username)}','${f.avatar||''}'),200)">
                    <svg viewBox="0 0 24 24"><path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
                  </button>
                  <button class="btn-danger" onclick="FriendsPage.removeFriend(${f.id},'${f.username}')">Удалить</button>
                </div>
              </div>`).join('')
            : `<div class="empty-state">
                 <svg viewBox="0 0 24 24"><path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197"/></svg>
                 <p>Друзей пока нет — найди людей во вкладке "Найти людей"</p>
               </div>`;
        } else {
          const incoming = all.filter(f => f.status === 'pending' && f.requester_id !== me.id);
          const outgoing = all.filter(f => f.status === 'pending' && f.requester_id === me.id);
          let html = '';
          if (incoming.length) {
            html += `<div class="section-label" style="margin-bottom:8px">Входящие (${incoming.length})</div>`;
            html += incoming.map(f => `
              <div class="friend-item">
                <div class="avatar" onclick="App.navProfile('${f.username}')"><img src="${f.avatar||'/img/default-avatar.svg'}"></div>
                <div class="friend-info">
                  <div class="friend-name">${escHtml(f.display_name||f.username)}</div>
                  <div class="friend-username">@${f.username}</div>
                </div>
                <div class="friend-actions">
                  <button class="btn-primary" style="padding:7px 14px;font-size:.85rem"
                    onclick="FriendsPage.respond(${f.friendship_id},'accept')">Принять</button>
                  <button class="btn-danger"
                    onclick="FriendsPage.respond(${f.friendship_id},'decline')">Отклонить</button>
                </div>
              </div>`).join('');
          }
          if (outgoing.length) {
            html += `<div class="section-label" style="margin:16px 0 8px">Исходящие (${outgoing.length})</div>`;
            html += outgoing.map(f => `
              <div class="friend-item">
                <div class="avatar" onclick="App.navProfile('${f.username}')"><img src="${f.avatar||'/img/default-avatar.svg'}"></div>
                <div class="friend-info">
                  <div class="friend-name">${escHtml(f.display_name||f.username)}</div>
                  <div class="friend-username">@${f.username}</div>
                </div>
                <div class="friend-actions">
                  <button class="btn-secondary" onclick="FriendsPage.removeFriend(${f.id},'${f.username}')">Отозвать</button>
                </div>
              </div>`).join('');
          }
          el.innerHTML = html || `<div class="empty-state"><p>Нет заявок</p></div>`;
        }
      } catch(e) { App.toast(e.message, 'error'); }
    },

    renderSearchTab() {
      return `
        <input class="search-bar" placeholder="Поиск по имени или логину..."
               id="friend-search-input" oninput="FriendsPage.searchPeople(this.value)" autofocus>
        <div id="friend-search-results" style="margin-top:12px"></div>`;
    },

    async searchPeople(q) {
      const el = document.getElementById('friend-search-results');
      if (!el) return;
      if (!q.trim()) { el.innerHTML = ''; return; }
      try {
        const [users, friends] = await Promise.all([API.searchUsers(q), API.getFriends()]);
        const friendMap = new Map(friends.map(f => [f.id, f]));
        el.innerHTML = users.length ? users.map(u => {
          const f = friendMap.get(u.id);
          const status = f?.status || null;
          let btn = '';
          if (!status)              btn = `<button class="btn-primary" style="padding:7px 14px;font-size:.85rem" onclick="FriendsPage.addFriend(${u.id})">Добавить</button>`;
          else if (status==='accepted') btn = `<span style="color:#23a55a;font-size:.85rem;font-weight:600">✓ Друг</span>`;
          else if (status==='pending')  btn = `<span class="text-muted" style="font-size:.85rem">Заявка отправлена</span>`;
          return `
          <div class="friend-item">
            <div class="avatar" onclick="App.navProfile('${u.username}')"><img src="${u.avatar||'/img/default-avatar.svg'}"></div>
            <div class="friend-info">
              <div class="friend-name">${escHtml(u.display_name||u.username)}</div>
              <div class="friend-username">@${u.username}</div>
            </div>
            <div class="friend-actions">${btn}</div>
          </div>`;
        }).join('') : '<p class="text-muted">Никого не найдено</p>';
      } catch(e) { App.toast(e.message, 'error'); }
    },

    async addFriend(id) {
      try { await API.sendFriendReq(id); App.toast('Заявка отправлена'); this.loadTab(currentTab); }
      catch(e) { App.toast(e.message, 'error'); }
    },

    async respond(id, action) {
      try {
        await API.respondFriend(id, action);
        if (action === 'accept') App.playSound('friend_request');
        App.toast(action === 'accept' ? 'Заявка принята!' : 'Заявка отклонена');
        this.loadTab(currentTab);
      } catch(e) { App.toast(e.message, 'error'); }
    },

    async removeFriend(id, name) {
      if (!confirm(`Удалить ${name} из друзей?`)) return;
      try { await API.removeFriend(id); App.toast('Удалено'); this.loadTab(currentTab); }
      catch(e) { App.toast(e.message, 'error'); }
    }
  };
})();
