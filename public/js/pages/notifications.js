// NOTIFICATIONS PAGE
const NotificationsPage = (() => {
  const timeAgo = (ts) => {
    const s = Math.floor(Date.now()/1000-ts);
    if (s<60) return 'только что';
    if (s<3600) return `${Math.floor(s/60)} мин назад`;
    if (s<86400) return `${Math.floor(s/3600)} ч назад`;
    return `${Math.floor(s/86400)} дн назад`;
  };

  const iconFor = (type) => {
    switch(type) {
      case 'like':           return `<svg viewBox="0 0 24 24" style="width:20px;height:20px;color:#f04747"><path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>`;
      case 'comment':        return `<svg viewBox="0 0 24 24" style="width:20px;height:20px;color:#5865f2"><path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72"/></svg>`;
      case 'friend_request': return `<svg viewBox="0 0 24 24" style="width:20px;height:20px;color:#23a55a"><path d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/></svg>`;
      case 'friend_accepted':return `<svg viewBox="0 0 24 24" style="width:20px;height:20px;color:#23a55a"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;
      case 'group_invite':   return `<svg viewBox="0 0 24 24" style="width:20px;height:20px;color:#faa61a"><path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>`;
      default:               return `<svg viewBox="0 0 24 24" style="width:20px;height:20px"><path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>`;
    }
  };

  return {
    async render(container, me) {
      container.innerHTML = `
      <div class="page">
        <div class="page-main" style="max-width:680px;margin:0 auto">
          <div class="page-header">
            <div class="page-title">Уведомления</div>
            <button class="btn-secondary" onclick="NotificationsPage.readAll()">Отметить все прочитанными</button>
          </div>
          <div id="notif-list"><div class="spinner"></div></div>
        </div>
      </div>`;
      await this.loadNotifications();
      await API.readAll();
      document.getElementById('notif-badge')?.classList.add('hidden');
    },

    async loadNotifications() {
      const el = document.getElementById('notif-list');
      if (!el) return;
      try {
        const notifs = await API.getNotifications();
        el.innerHTML = notifs.length ? notifs.map(n => `
          <div class="notif-item ${!n.read_at ? 'unread' : ''}" id="notif-${n.id}">
            <div style="flex-shrink:0;margin-top:2px">${iconFor(n.type)}</div>
            <div class="avatar" style="width:38px;height:38px;cursor:pointer"
                 onclick="${n.from_username ? `App.navProfile('${n.from_username}')` : ''}">
              <img src="${n.from_avatar||'/img/default-avatar.svg'}">
            </div>
            <div class="notif-body">
              <div class="notif-text">${escHtml(n.text)}</div>
              <div class="notif-time">${timeAgo(n.created_at)}</div>
              ${n.type === 'friend_request' ? `
              <div style="display:flex;gap:8px;margin-top:8px">
                <button class="btn-primary" style="padding:6px 14px;font-size:.82rem"
                  onclick="NotificationsPage.respondFriend('${n.from_id}', 'accept', ${n.id})">Принять</button>
                <button class="btn-danger"
                  onclick="NotificationsPage.respondFriend('${n.from_id}', 'decline', ${n.id})">Отклонить</button>
              </div>` : ''}
              ${n.type === 'group_invite' && n.ref_id ? `
              <div style="display:flex;gap:8px;margin-top:8px">
                <button class="btn-primary" style="padding:6px 14px;font-size:.82rem"
                  onclick="NotificationsPage.acceptGroupInvite(${n.ref_id}, ${n.id})">Вступить</button>
                <button class="btn-danger"
                  onclick="NotificationsPage.declineGroupInvite(${n.ref_id}, ${n.id})">Отклонить</button>
              </div>` : ''}
            </div>
            ${!n.read_at ? '<div class="notif-unread-dot"></div>' : ''}
          </div>`).join('')
          : '<div class="empty-state"><p>Уведомлений нет</p></div>';
      } catch(e) { App.toast(e.message, 'error'); }
    },

    async readAll() {
      try {
        await API.readAll();
        document.querySelectorAll('.notif-item.unread').forEach(el => {
          el.classList.remove('unread');
          el.querySelector('.notif-unread-dot')?.remove();
        });
      } catch {}
      App.updateBadges();
    },

    async respondFriend(fromId, action, notifId) {
      try {
        const friends = await API.getFriends();
        const f = friends.find(fr =>
          String(fr.id) === String(fromId) &&
          fr.status === 'pending' &&
          fr.requester_id !== App.me.id
        );
        if (f) await API.respondFriend(f.friendship_id, action);
        // Remove action buttons
        const notifEl = document.getElementById(`notif-${notifId}`);
        notifEl?.querySelector('[style*="gap:8px"]')?.remove();
        App.toast(action === 'accept' ? 'Заявка принята!' : 'Заявка отклонена');
        if (action === 'accept') App.playSound('friend_request');
      } catch(e) { App.toast(e.message, 'error'); }
    },

    async acceptGroupInvite(groupId, notifId) {
      try {
        await API.joinGroup(groupId);
        const notifEl = document.getElementById(`notif-${notifId}`);
        notifEl?.querySelector('[style*="gap:8px"]')?.remove();
        App.toast('Ты вступил в сообщество!');
        App.nav('group', groupId);
      } catch(e) { App.toast(e.message, 'error'); }
    },

    async declineGroupInvite(groupId, notifId) {
      try {
        await API.declineGroupInvite(groupId);
        const notifEl = document.getElementById(`notif-${notifId}`);
        notifEl?.querySelector('[style*="gap:8px"]')?.remove();
        App.toast('Приглашение отклонено');
      } catch(e) { App.toast(e.message, 'error'); }
    }
  };
})();
