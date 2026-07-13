// PROFILE PAGE
const ProfilePage = (() => {
  const timeAgo = (ts) => {
    const s = Math.floor(Date.now()/1000-ts);
    if (s<60) return 'только что';
    if (s<3600) return `${Math.floor(s/60)} мин назад`;
    if (s<86400) return `${Math.floor(s/3600)} ч назад`;
    if (s<604800) return `${Math.floor(s/86400)} дн назад`;
    return new Date(ts*1000).toLocaleDateString('ru');
  };

  const renderPost = (p, me) => {
    const isOwn = p.user_id === me.id;
    return `<div class="post-card" id="ppost-${p.id}">
      <div class="post-header">
        <div class="avatar"><img src="${p.avatar||'/img/default-avatar.svg'}"></div>
        <div class="post-header-info">
          <div class="post-author">${escHtml(p.display_name||p.username)}</div>
          <div class="post-time">${timeAgo(p.created_at)}</div>
        </div>
        ${isOwn?`<div class="post-menu"><button onclick="ProfilePage.deletePost(${p.id})" title="Удалить"><svg viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button></div>`:''}
      </div>
      <div class="post-content">${escHtml(p.content)}</div>
      ${p.image_url?`<img class="post-image" src="${p.image_url}" onclick="App.lightbox(this.src)" alt="">`:''}
      <div class="post-actions">
        <button class="post-action-btn ${p.liked?'liked':''}" id="plike-btn-${p.id}" onclick="ProfilePage.toggleLike(${p.id})">
          <svg viewBox="0 0 24 24"><path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
          <span id="plike-count-${p.id}">${p.likes}</span>
        </button>
      </div>
    </div>`;
  };

  return {
    async render(container, me, username) {
      container.innerHTML = '<div class="spinner"></div>';
      const target = username || me.username;
      let user;
      try {
        user = await API.getUser(target);
      } catch(e) { container.innerHTML = `<div class="page"><div class="page-main"><p class="text-muted" style="padding:24px">${e.message}</p></div></div>`; return; }

      const isMe = user.id === me.id;
      const fs = user.friend_status;

      let friendBtn = '';
      if (!isMe) {
        if (!fs) friendBtn = `<button class="btn-primary" onclick="ProfilePage.addFriend(${user.id})">Добавить в друзья</button>`;
        else if (fs === 'accepted') friendBtn = `<button class="btn-danger" onclick="ProfilePage.removeFriend(${user.id})">Удалить из друзей</button>`;
        else if (fs === 'pending') friendBtn = `<button class="btn-secondary" disabled>Заявка отправлена</button>`;
      }

      const memberSince = new Date(user.created_at * 1000).toLocaleDateString('ru', { year: 'numeric', month: 'long' });

      container.innerHTML = `
      <div class="page">
        <div class="page-main">
          <div class="profile-page">
            <div class="profile-header-card">
              <div class="profile-banner"></div>
              <div class="profile-header-body">
                <div class="profile-avatar-wrap">
                  <div class="avatar-xl">
                    <img id="profile-avatar-img" src="${user.avatar||'/img/default-avatar.svg'}" alt="">
                  </div>
                  ${isMe ? `<label style="display:block;text-align:center;margin-top:6px;cursor:pointer;color:#96989d;font-size:.8rem">
                    Сменить
                    <input type="file" accept="image/*" class="hidden" onchange="ProfilePage.uploadAvatar(this)">
                  </label>` : ''}
                </div>
                <div class="profile-info">
                  <div class="profile-displayname">${escHtml(user.display_name||user.username)}</div>
                  <div class="profile-username">@${user.username}</div>
                  ${!isMe ? `<div style="margin-top:4px">${App.presenceHtml(user.id, user.last_seen)}</div>` : ''}
                  ${user.bio ? `<div class="profile-bio">${escHtml(user.bio)}</div>` : ''}
                  <div class="profile-stats">
                    <div class="profile-stat"><div class="profile-stat-num">${user.post_count}</div><div class="profile-stat-label">постов</div></div>
                    <div class="profile-stat"><div class="profile-stat-num">${user.friend_count}</div><div class="profile-stat-label">друзей</div></div>
                  </div>
                  <div class="text-muted" style="font-size:.78rem;margin-top:6px">на сайте с ${memberSince}</div>
                </div>
                <div class="profile-actions">
                  ${friendBtn}
                  ${!isMe ? `<button class="btn-icon" onclick="App.nav('messages');setTimeout(()=>MessagesPage.openDialog(${user.id},'${escHtml(user.display_name||user.username)}','${user.avatar||''}',${user.last_seen||0}),200)">
                    <svg viewBox="0 0 24 24"><path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
                    Написать
                  </button>` : ''}
                  ${isMe ? `<button class="btn-secondary" onclick="ProfilePage.showEditModal()">Редактировать</button>
                  <button class="btn-secondary" onclick="ProfilePage.showPasswordModal()">Сменить пароль</button>` : ''}
                </div>
              </div>
            </div>
            <div id="profile-posts"><div class="spinner"></div></div>
          </div>
        </div>
      </div>`;

      // Load posts
      try {
        const posts = await API.userPosts(user.id);
        const el = document.getElementById('profile-posts');
        if (el) el.innerHTML = posts.length ? posts.map(p => renderPost(p, me)).join('') : '<div class="empty-state"><p>Постов пока нет</p></div>';
      } catch {}
    },

    async addFriend(id) {
      try { await API.sendFriendReq(id); App.toast('Заявка отправлена'); App.navProfile(); }
      catch(e) { App.toast(e.message, 'error'); }
    },

    async removeFriend(id) {
      if (!confirm('Удалить из друзей?')) return;
      try { await API.removeFriend(id); App.toast('Удалено'); App.navProfile(); }
      catch(e) { App.toast(e.message, 'error'); }
    },

    async uploadAvatar(input) {
      const file = input.files[0]; if (!file) return;
      try {
        const r = await API.uploadAvatar(file);
        document.getElementById('profile-avatar-img')?.setAttribute('src', r.avatar);
        document.getElementById('my-avatar-img')?.setAttribute('src', r.avatar);
        App.me.avatar = r.avatar;
        App.toast('Аватар обновлён');
      } catch(e) { App.toast(e.message, 'error'); }
    },

    showEditModal() {
      const me = App.me;
      App.openModal(`
        <div class="modal-title">Редактировать профиль</div>
        <div class="field"><label>Отображаемое имя</label><input id="edit-dname" type="text" value="${escHtml(me.display_name||'')}"></div>
        <div class="field"><label>О себе</label><textarea id="edit-bio" style="width:100%;background:#1e1f22;border:1px solid #1a1b1e;border-radius:4px;padding:8px;color:#dcddde;resize:vertical;min-height:80px">${escHtml(me.bio||'')}</textarea></div>
        <div class="modal-actions">
          <button class="btn-secondary" onclick="App.closeModal()">Отмена</button>
          <button class="btn-primary" onclick="ProfilePage.saveEdit()">Сохранить</button>
        </div>`);
    },

    showPasswordModal() {
      App.openModal(`
        <div class="modal-title">Сменить пароль</div>
        <div class="field"><label>Старый пароль</label><input id="pw-old" type="password" placeholder="Текущий пароль" autocomplete="current-password"></div>
        <div class="field"><label>Новый пароль</label><input id="pw-new" type="password" placeholder="Минимум 6 символов" autocomplete="new-password"></div>
        <div class="field"><label>Повторите новый пароль</label><input id="pw-confirm" type="password" placeholder="Повторите новый пароль" autocomplete="new-password"></div>
        <div id="pw-error" class="error-msg hidden"></div>
        <div class="modal-actions">
          <button class="btn-secondary" onclick="App.closeModal()">Отмена</button>
          <button class="btn-primary" onclick="ProfilePage.savePassword()">Сохранить</button>
        </div>`);
    },

    async savePassword() {
      const old_password = document.getElementById('pw-old')?.value;
      const new_password = document.getElementById('pw-new')?.value;
      const confirm      = document.getElementById('pw-confirm')?.value;
      const errEl        = document.getElementById('pw-error');

      const setErr = (msg) => { if (errEl) { errEl.textContent = msg; errEl.classList.remove('hidden'); } };

      if (!old_password || !new_password || !confirm) return setErr('Заполни все поля');
      if (new_password !== confirm) return setErr('Новые пароли не совпадают');
      if (new_password.length < 6)  return setErr('Новый пароль: минимум 6 символов');

      try {
        await API.changePassword({ old_password, new_password });
        App.closeModal();
        App.toast('Пароль успешно изменён');
      } catch(e) { setErr(e.message); }
    },

    async saveEdit() {
      const display_name = document.getElementById('edit-dname')?.value.trim();
      const bio = document.getElementById('edit-bio')?.value.trim();
      try {
        const updated = await API.updateMe({ display_name, bio });
        Object.assign(App.me, updated);
        App.closeModal();
        App.toast('Профиль обновлён');
        App.navProfile();
      } catch(e) { App.toast(e.message, 'error'); }
    },

    async deletePost(id) {
      if (!confirm('Удалить пост?')) return;
      try { await API.deletePost(id); document.getElementById(`ppost-${id}`)?.remove(); App.toast('Удалено'); }
      catch(e) { App.toast(e.message, 'error'); }
    },

    async toggleLike(id) {
      try {
        const r = await API.likePost(id);
        const btn = document.getElementById(`plike-btn-${id}`);
        const cnt = document.getElementById(`plike-count-${id}`);
        if (!btn||!cnt) return;
        const cur = parseInt(cnt.textContent);
        r.liked ? (btn.classList.add('liked'), cnt.textContent=cur+1) : (btn.classList.remove('liked'), cnt.textContent=Math.max(0,cur-1));
      } catch(e) { App.toast(e.message, 'error'); }
    }
  };
})();
