// GROUPS PAGE
const GroupsPage = (() => {
  const timeAgo = (ts) => {
    const s = Math.floor(Date.now()/1000 - ts);
    if (s < 60) return 'только что';
    if (s < 3600) return `${Math.floor(s/60)} мин назад`;
    if (s < 86400) return `${Math.floor(s/3600)} ч назад`;
    return `${Math.floor(s/86400)} дн назад`;
  };

  const renderGroupCard = (g) => `
    <div class="group-card" onclick="App.nav('group',${g.id})">
      <div class="group-card-banner">
        ${g.avatar ? `<img src="${g.avatar}" alt="">` : '◈'}
      </div>
      <div class="group-card-body">
        <div class="group-card-name">${escHtml(g.name)}</div>
        <div class="group-card-desc">${escHtml(g.description||'Нет описания')}</div>
        <div class="group-card-footer">
          <span class="group-member-count">${g.member_count} участников</span>
          ${g.is_member ? `<span style="color:#23a55a;font-size:.78rem;font-weight:600">✓ Участник</span>` : ''}
        </div>
      </div>
    </div>`;

  return {
    async render(container, me) {
      container.innerHTML = `
      <div class="page">
        <div class="page-main">
          <div class="page-header">
            <div class="page-title">Сообщества</div>
            <button class="btn-primary" onclick="GroupsPage.showCreateModal()">+ Создать</button>
          </div>
          <input class="search-bar" style="margin-bottom:16px" placeholder="Поиск сообществ..."
                 id="groups-search" oninput="GroupsPage.filterGroups(this.value)">
          <div class="groups-grid" id="groups-grid"><div class="spinner"></div></div>
        </div>
        <div class="page-sidebar">
          <div class="section-label">Мои сообщества</div>
          <div id="my-groups-list"><div class="spinner" style="width:24px;height:24px;margin:10px auto"></div></div>
        </div>
      </div>`;
      await this.loadGroups();
    },

    _allGroups: [],

    async loadGroups() {
      try {
        const [groups, myGroups] = await Promise.all([API.getGroups(), API.getMyGroups()]);
        this._allGroups = groups;
        const grid = document.getElementById('groups-grid');
        if (grid) grid.innerHTML = groups.length
          ? groups.map(renderGroupCard).join('')
          : '<p class="text-muted">Пока нет сообществ</p>';

        const myList = document.getElementById('my-groups-list');
        if (myList) myList.innerHTML = myGroups.length
          ? myGroups.map(g => `
            <div class="search-result-item" onclick="App.nav('group',${g.id})">
              <div class="avatar" style="width:32px;height:32px;border-radius:6px">
                ${g.avatar
                  ? `<img src="${g.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:6px">`
                  : `<div style="width:100%;height:100%;background:linear-gradient(135deg,#5865f2,#9333ea);display:flex;align-items:center;justify-content:center;border-radius:6px">◈</div>`}
              </div>
              <div>
                <div style="font-weight:600;font-size:.85rem">${escHtml(g.name)}</div>
                <div class="text-muted">${g.role==='admin'?'Администратор':'Участник'}</div>
              </div>
            </div>`).join('')
          : '<p class="text-muted">Ты ещё не в группах</p>';
      } catch(e) { App.toast(e.message, 'error'); }
    },

    filterGroups(q) {
      const filtered = q
        ? this._allGroups.filter(g =>
            g.name.toLowerCase().includes(q.toLowerCase()) ||
            (g.description||'').toLowerCase().includes(q.toLowerCase()))
        : this._allGroups;
      const grid = document.getElementById('groups-grid');
      if (grid) grid.innerHTML = filtered.length
        ? filtered.map(renderGroupCard).join('')
        : '<p class="text-muted">Ничего не найдено</p>';
    },

    showCreateModal() {
      App.openModal(`
        <div class="modal-title">Создать сообщество</div>
        <div class="field"><label>Название *</label><input id="gname" type="text" placeholder="Название группы"></div>
        <div class="field"><label>Описание</label>
          <textarea id="gdesc" style="width:100%;background:#1e1f22;border:1px solid #1a1b1e;border-radius:4px;padding:8px;color:#dcddde;resize:vertical;min-height:80px"
            placeholder="О чём ваше сообщество?"></textarea></div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;color:#b5bac1;margin-top:8px">
          <input type="checkbox" id="gpriv"> Приватное сообщество
        </label>
        <div class="modal-actions">
          <button class="btn-secondary" onclick="App.closeModal()">Отмена</button>
          <button class="btn-primary" onclick="GroupsPage.createGroup()">Создать</button>
        </div>`);
    },

    async createGroup() {
      const name        = document.getElementById('gname')?.value.trim();
      const description = document.getElementById('gdesc')?.value.trim();
      const is_private  = document.getElementById('gpriv')?.checked;
      if (!name) return App.toast('Введи название', 'error');
      try {
        const g = await API.createGroup({ name, description, is_private });
        App.closeModal();
        App.toast('Сообщество создано!');
        App.nav('group', g.id);
      } catch(e) { App.toast(e.message, 'error'); }
    }
  };
})();

// ─── GROUP DETAIL PAGE ────────────────────────────────────────────────────────
const GroupPage = (() => {
  let postOffset   = 0;
  let hasMore      = true;
  let loading      = false;
  let groupId      = null;
  let groupData    = null;
  let postImageFile = null;

  const timeAgo = (ts) => {
    const s = Math.floor(Date.now()/1000-ts);
    if (s<60) return 'только что';
    if (s<3600) return `${Math.floor(s/60)} мин назад`;
    if (s<86400) return `${Math.floor(s/3600)} ч назад`;
    return `${Math.floor(s/86400)} дн назад`;
  };

  const renderPost = (p, me) => {
    const isOwn = p.user_id === me.id || me.is_admin;
    return `<div class="post-card" id="gpost-${p.id}">
      <div class="post-header">
        <div class="avatar" onclick="App.navProfile('${p.username}')"><img src="${p.avatar||'/img/default-avatar.svg'}"></div>
        <div class="post-header-info">
          <div class="post-author" onclick="App.navProfile('${p.username}')">${escHtml(p.display_name||p.username)}</div>
          <div class="post-time">${timeAgo(p.created_at)}</div>
        </div>
        ${isOwn?`<div class="post-menu"><button onclick="GroupPage.deletePost(${p.id})" title="Удалить">
          <svg viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
        </button></div>`:''}
      </div>
      <div class="post-content">${escHtml(p.content)}</div>
      ${p.image_url?`<img class="post-image" src="${p.image_url}" onclick="App.lightbox(this.src)" alt="">`:''}
      <div class="post-actions">
        <button class="post-action-btn ${p.liked?'liked':''}" id="glike-btn-${p.id}" onclick="GroupPage.toggleLike(${p.id})">
          <svg viewBox="0 0 24 24"><path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
          <span id="glike-count-${p.id}">${p.likes}</span>
        </button>
        <button class="post-action-btn" onclick="GroupPage.toggleComments(${p.id})">
          <svg viewBox="0 0 24 24"><path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
          <span>${p.comments}</span>
        </button>
      </div>
      <div class="comments-section hidden" id="gcomments-${p.id}"></div>
    </div>`;
  };

  return {
    async render(container, me, id) {
      groupId = parseInt(id); postOffset = 0; hasMore = true; postImageFile = null;
      container.innerHTML = '<div class="spinner"></div>';
      try {
        groupData = await API.getGroup(groupId);
      } catch(e) {
        container.innerHTML = `<p class="text-muted" style="padding:24px">${escHtml(e.message)}</p>`;
        return;
      }

      const isMember  = !!groupData.my_role;
      const isAdmin   = groupData.my_role === 'admin';
      const hasInvite = !!groupData.has_invite;

      container.innerHTML = `
      <div class="page">
        <div class="page-main">
          <div class="group-header">
            <div class="group-banner">${groupData.avatar?`<img src="${groupData.avatar}">`:'◈'}</div>
            <div class="group-info">
              <div class="group-info-left">
                <div>
                  <div class="group-name">${escHtml(groupData.name)}</div>
                  <div class="group-members-count">${groupData.member_count} участников</div>
                  ${groupData.description?`<div style="color:#b5bac1;font-size:.9rem;margin-top:4px">${escHtml(groupData.description)}</div>`:''}
                </div>
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
                ${isAdmin?`<label class="btn-icon" style="cursor:pointer" title="Загрузить обложку">
                  <svg viewBox="0 0 24 24"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14"/></svg>
                  <input type="file" accept="image/*" class="hidden" onchange="GroupPage.uploadAvatar(this)">
                </label>`:''}
                ${isAdmin?`<button class="btn-icon" onclick="GroupPage.showInviteModal()">
                  <svg viewBox="0 0 24 24"><path d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/></svg>
                  Пригласить
                </button>`:''}
                ${isMember && !isAdmin?`<button class="btn-secondary" onclick="GroupPage.leave()">Выйти</button>`:''}
                ${!isMember && !hasInvite && !groupData.is_private?`<button class="btn-primary" onclick="GroupPage.join()">Вступить</button>`:''}
                ${!isMember && hasInvite?`
                  <button class="btn-primary" onclick="GroupPage.join()">Принять приглашение</button>
                  <button class="btn-danger" onclick="GroupPage.declineInvite()">Отклонить</button>
                `:''}
                ${!isMember && !hasInvite && groupData.is_private?`
                  <span style="color:#96989d;font-size:.85rem;padding:8px">🔒 Приватная группа</span>
                `:''}
                <button class="btn-icon" onclick="GroupPage.showMembers()">
                  <svg viewBox="0 0 24 24"><path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0"/></svg>
                  Участники
                </button>
              </div>
            </div>
          </div>
          ${isMember ? `
          <div class="create-post" style="margin-bottom:16px">
            <textarea class="post-textarea" id="gpost-content" placeholder="Написать в сообществе..."></textarea>
            <div class="create-post-actions">
              <label class="post-image-label">
                <svg viewBox="0 0 24 24"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14"/></svg>
                Фото<input type="file" accept="image/*" class="hidden" onchange="GroupPage.previewImage(this)">
              </label>
              <button class="btn-primary" onclick="GroupPage.submitPost()">Опубликовать</button>
            </div>
            <img id="gpost-img-preview" class="post-image-preview hidden" alt="">
          </div>` : ''}
          <div id="gfeed-list"></div>
          <div id="gfeed-loader" class="spinner hidden"></div>
        </div>
      </div>`;

      await this.loadMore(me);
      container.querySelector('.page-main').addEventListener('scroll', (e) => {
        const el = e.target;
        if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) GroupPage.loadMore(me);
      });
    },

    async loadMore(me) {
      if (loading || !hasMore) return;
      loading = true;
      document.getElementById('gfeed-loader')?.classList.remove('hidden');
      try {
        const posts = await API.getGroupPosts(groupId, 20, postOffset);
        const list = document.getElementById('gfeed-list');
        if (!list) return;
        if (posts.length === 0 && postOffset === 0) {
          list.innerHTML = '<div class="empty-state"><p>Постов пока нет</p></div>';
          hasMore = false;
        } else {
          list.insertAdjacentHTML('beforeend', posts.map(p => renderPost(p, me)).join(''));
          postOffset += posts.length;
          if (posts.length < 20) hasMore = false;
        }
      } catch(e) { App.toast(e.message, 'error'); }
      loading = false;
      document.getElementById('gfeed-loader')?.classList.add('hidden');
    },

    previewImage(input) {
      const file = input.files[0]; if (!file) return;
      postImageFile = file;
      const p = document.getElementById('gpost-img-preview');
      if (p) { p.src = URL.createObjectURL(file); p.classList.remove('hidden'); }
    },

    async submitPost() {
      const content = document.getElementById('gpost-content')?.value.trim();
      if (!content) return App.toast('Пост пустой', 'error');
      const fd = new FormData();
      fd.append('content', content);
      fd.append('group_id', groupId);
      if (postImageFile) fd.append('image', postImageFile);
      try {
        const post = await API.createPost(fd);
        document.getElementById('gpost-content').value = '';
        document.getElementById('gpost-img-preview')?.classList.add('hidden');
        postImageFile = null;
        document.getElementById('gfeed-list')?.insertAdjacentHTML('afterbegin', renderPost(post, App.me));
        App.toast('Пост опубликован');
      } catch(e) { App.toast(e.message, 'error'); }
    },

    async deletePost(id) {
      if (!confirm('Удалить?')) return;
      try { await API.deletePost(id); document.getElementById(`gpost-${id}`)?.remove(); App.toast('Удалено'); }
      catch(e) { App.toast(e.message, 'error'); }
    },

    async toggleLike(id) {
      try {
        const r = await API.likePost(id);
        const btn = document.getElementById(`glike-btn-${id}`);
        const cnt = document.getElementById(`glike-count-${id}`);
        if (!btn||!cnt) return;
        const cur = parseInt(cnt.textContent);
        r.liked
          ? (btn.classList.add('liked'), cnt.textContent=cur+1)
          : (btn.classList.remove('liked'), cnt.textContent=Math.max(0,cur-1));
      } catch(e) { App.toast(e.message, 'error'); }
    },

    async toggleComments(postId) {
      const section = document.getElementById(`gcomments-${postId}`);
      if (!section) return;
      if (!section.classList.contains('hidden')) { section.classList.add('hidden'); return; }
      section.innerHTML = '<div class="spinner" style="width:24px;height:24px;margin:8px auto"></div>';
      section.classList.remove('hidden');
      try {
        const comments = await API.getComments(postId);
        const me = App.me;
        const list = comments.map(c =>
          `<div class="comment">
            <div class="avatar" style="width:28px;height:28px"><img src="${c.avatar||'/img/default-avatar.svg'}"></div>
            <div class="comment-body">
              <div class="comment-author">${escHtml(c.display_name||c.username)}</div>
              <div class="comment-text">${escHtml(c.content)}</div>
            </div>
          </div>`).join('');
        section.innerHTML = `${list||'<p class="text-muted" style="margin-bottom:8px">Нет комментариев</p>'}
          <div class="comment-input-row">
            <img src="${me.avatar||'/img/default-avatar.svg'}" class="avatar" style="width:28px;height:28px" alt="">
            <input class="comment-input" placeholder="Комментарий..." id="gci-${postId}"
              onkeydown="if(event.key==='Enter'){event.preventDefault();GroupPage.submitComment(${postId})}">
            <button class="btn-icon" onclick="GroupPage.submitComment(${postId})">
              <svg viewBox="0 0 24 24"><path d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
            </button>
          </div>`;
      } catch(e) { App.toast(e.message, 'error'); }
    },

    async submitComment(postId) {
      const input = document.getElementById(`gci-${postId}`);
      if (!input) return;
      const content = input.value.trim(); if (!content) return;
      try {
        const c = await API.addComment(postId, content);
        input.value = '';
        const html = `<div class="comment">
          <div class="avatar" style="width:28px;height:28px"><img src="${c.avatar||'/img/default-avatar.svg'}"></div>
          <div class="comment-body">
            <div class="comment-author">${escHtml(c.display_name||c.username)}</div>
            <div class="comment-text">${escHtml(c.content)}</div>
          </div>
        </div>`;
        input.closest('.comment-input-row').insertAdjacentHTML('beforebegin', html);
      } catch(e) { App.toast(e.message, 'error'); }
    },

    async join() {
      try {
        await API.joinGroup(groupId);
        App.toast(groupData?.has_invite ? 'Приглашение принято!' : 'Ты в группе!');
        App.nav('group', groupId);
      } catch(e) { App.toast(e.message, 'error'); }
    },

    async declineInvite() {
      try {
        await API.declineGroupInvite(groupId);
        App.toast('Приглашение отклонено');
        App.nav('groups');
      } catch(e) { App.toast(e.message, 'error'); }
    },

    async leave() {
      if (!confirm('Выйти из группы?')) return;
      try { await API.leaveGroup(groupId); App.toast('Ты вышел из группы'); App.nav('groups'); }
      catch(e) { App.toast(e.message, 'error'); }
    },

    async uploadAvatar(input) {
      const file = input.files[0]; if (!file) return;
      try { await API.uploadGroupAvatar(groupId, file); App.toast('Обложка обновлена'); App.nav('group', groupId); }
      catch(e) { App.toast(e.message, 'error'); }
    },

    async showMembers() {
      try {
        const members = await API.getGroupMembers(groupId);
        const isAdmin = groupData?.my_role === 'admin';
        App.openModal(`
          <div class="modal-title">Участники (${members.length})</div>
          <div style="display:flex;flex-direction:column;gap:4px;max-height:400px;overflow-y:auto">
            ${members.map(m=>`
              <div class="search-result-item">
                <div class="avatar" onclick="App.closeModal();App.navProfile('${m.username}')"><img src="${m.avatar||'/img/default-avatar.svg'}"></div>
                <div style="flex:1;min-width:0" onclick="App.closeModal();App.navProfile('${m.username}')">
                  <div style="font-weight:600;font-size:.9rem">${escHtml(m.display_name||m.username)}</div>
                  <div class="text-muted">${m.role==='admin'?'Администратор':'Участник'}</div>
                </div>
              </div>`).join('')}
          </div>
          <div class="modal-actions">
            ${isAdmin ? `<button class="btn-icon" onclick="App.closeModal();GroupPage.showInviteModal()">
              <svg viewBox="0 0 24 24" style="width:16px;height:16px"><path d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
              Пригласить
            </button>` : ''}
            <button class="btn-secondary" onclick="App.closeModal()">Закрыть</button>
          </div>`);
      } catch(e) { App.toast(e.message, 'error'); }
    },

    // ── Invite modal ──────────────────────────────────────────────────────────
    showInviteModal() {
      App.openModal(`
        <div class="modal-title">Пригласить в «${escHtml(groupData?.name||'')}»</div>
        <input class="search-bar" placeholder="Поиск пользователя..." id="inv-search"
               oninput="GroupPage.searchInvite(this.value)" autofocus>
        <div id="inv-results" style="margin-top:12px"></div>
        <div class="modal-actions"><button class="btn-secondary" onclick="App.closeModal()">Отмена</button></div>`);
    },

    async searchInvite(q) {
      const el = document.getElementById('inv-results');
      if (!el || !q.trim()) { if(el) el.innerHTML=''; return; }
      try {
        const users = await API.searchUsers(q);
        // Filter out existing members
        const members = await API.getGroupMembers(groupId);
        const memberIds = new Set(members.map(m => m.id));
        const filtered = users.filter(u => !memberIds.has(u.id));
        el.innerHTML = filtered.length
          ? filtered.map(u => `
            <div class="search-result-item">
              <div class="avatar"><img src="${u.avatar||'/img/default-avatar.svg'}"></div>
              <div style="flex:1">
                <div style="font-weight:600">${escHtml(u.display_name||u.username)}</div>
                <div class="text-muted">@${u.username}</div>
              </div>
              <button class="btn-primary" style="padding:5px 12px;font-size:.82rem"
                onclick="GroupPage.sendInvite(${u.id},'${escHtml(u.display_name||u.username)}',this)">
                Пригласить
              </button>
            </div>`).join('')
          : '<p class="text-muted">Пользователей не найдено</p>';
      } catch(e) { App.toast(e.message, 'error'); }
    },

    async sendInvite(userId, userName, btn) {
      try {
        await API.inviteToGroup(groupId, userId);
        if (btn) { btn.textContent = '✓ Отправлено'; btn.disabled = true; btn.classList.remove('btn-primary'); btn.classList.add('btn-secondary'); }
        App.toast(`Приглашение отправлено ${userName}`);
      } catch(e) { App.toast(e.message, 'error'); }
    }
  };
})();
