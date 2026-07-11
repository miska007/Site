// FEED PAGE
const FeedPage = (() => {
  let offset = 0;
  let loading = false;
  let hasMore = true;
  let postImageFile = null;

  const timeAgo = (ts) => {
    const s = Math.floor(Date.now() / 1000 - ts);
    if (s < 60) return 'только что';
    if (s < 3600) return `${Math.floor(s/60)} мин назад`;
    if (s < 86400) return `${Math.floor(s/3600)} ч назад`;
    return `${Math.floor(s/86400)} дн назад`;
  };

  const renderPost = (p, me) => {
    const isOwn = p.user_id === me.id;
    return `
    <div class="post-card" id="post-${p.id}">
      <div class="post-header">
        <div class="avatar" onclick="App.navProfile('${p.username}')">
          <img src="${p.avatar || '/img/default-avatar.svg'}" alt="">
        </div>
        <div class="post-header-info">
          <div class="post-author" onclick="App.navProfile('${p.username}')">${escHtml(p.display_name || p.username)}</div>
          <div class="post-time">${timeAgo(p.created_at)}${p.group_name ? ` · <span class="post-group-tag" onclick="App.nav('group',${p.gid})" style="cursor:pointer">${escHtml(p.group_name)}</span>` : ''}</div>
        </div>
        ${isOwn ? `<div class="post-menu"><button onclick="FeedPage.deletePost(${p.id})" title="Удалить"><svg viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button></div>` : ''}
      </div>
      <div class="post-content">${escHtml(p.content)}</div>
      ${p.image_url ? `<img class="post-image" src="${p.image_url}" onclick="App.lightbox(this.src)" alt="">` : ''}
      <div class="post-actions">
        <button class="post-action-btn ${p.liked ? 'liked' : ''}" id="like-btn-${p.id}" onclick="FeedPage.toggleLike(${p.id})">
          <svg viewBox="0 0 24 24"><path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
          <span id="like-count-${p.id}">${p.likes}</span>
        </button>
        <button class="post-action-btn" onclick="FeedPage.toggleComments(${p.id})">
          <svg viewBox="0 0 24 24"><path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
          <span>${p.comments}</span>
        </button>
      </div>
      <div class="comments-section hidden" id="comments-${p.id}"></div>
    </div>`;
  };

  const renderComments = (postId, comments, me) => {
    const list = comments.map(c => `
      <div class="comment">
        <div class="avatar" style="width:32px;height:32px">
          <img src="${c.avatar || '/img/default-avatar.svg'}" alt="">
        </div>
        <div class="comment-body">
          <div class="comment-author">${escHtml(c.display_name || c.username)}</div>
          <div class="comment-text">${escHtml(c.content)}</div>
        </div>
      </div>`).join('');
    return `
      ${list || '<p class="text-muted" style="margin-bottom:8px">Комментариев пока нет</p>'}
      <div class="comment-input-row">
        <img src="${me.avatar || '/img/default-avatar.svg'}" class="avatar" style="width:28px;height:28px" alt="">
        <input class="comment-input" placeholder="Написать комментарий..." id="ci-${postId}"
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();FeedPage.submitComment(${postId})}">
        <button class="btn-icon" onclick="FeedPage.submitComment(${postId})">
          <svg viewBox="0 0 24 24"><path d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
        </button>
      </div>`;
  };

  return {
    async render(container, me) {
      offset = 0; hasMore = true; postImageFile = null;
      container.innerHTML = `
      <div class="page">
        <div class="page-main">
          <div class="feed-inner">
            <div class="create-post">
              <div class="create-post-header">
                <div class="avatar"><img src="${me.avatar || '/img/default-avatar.svg'}" alt=""></div>
                <textarea class="post-textarea" id="post-content" placeholder="Что у тебя нового, ${escHtml(me.display_name || me.username)}?"></textarea>
              </div>
              <img id="post-img-preview" class="post-image-preview hidden" alt="">
              <div class="create-post-actions">
                <label class="post-image-label" for="post-img-input">
                  <svg viewBox="0 0 24 24"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                  Фото
                </label>
                <input type="file" id="post-img-input" accept="image/*" class="hidden" onchange="FeedPage.previewImage(this)">
                <button class="btn-primary" onclick="FeedPage.submitPost()">Опубликовать</button>
              </div>
            </div>
            <div id="feed-list"></div>
            <div id="feed-loader" class="spinner hidden"></div>
            <div id="feed-end" class="text-center text-muted hidden" style="padding:16px">Больше постов нет</div>
          </div>
        </div>
        <div class="page-sidebar">
          <div class="section-label">Поиск людей</div>
          <input class="search-bar" placeholder="Найти пользователя..." oninput="FeedPage.searchUsers(this.value)">
          <div id="search-results" style="margin-top:8px"></div>
          <div class="divider"></div>
          <div class="section-label">Мои группы</div>
          <div id="sidebar-groups"></div>
        </div>
      </div>`;

      await this.loadMore(me);
      this.loadSidebarGroups();

      // Infinite scroll
      container.querySelector('.page-main').addEventListener('scroll', (e) => {
        const el = e.target;
        if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) FeedPage.loadMore(me);
      });
    },

    async loadMore(me) {
      if (loading || !hasMore) return;
      loading = true;
      const loader = document.getElementById('feed-loader');
      if (loader) loader.classList.remove('hidden');
      try {
        const posts = await API.feed(20, offset);
        const list = document.getElementById('feed-list');
        if (!list) return;
        if (posts.length === 0) {
          hasMore = false;
          document.getElementById('feed-end')?.classList.remove('hidden');
          if (offset === 0) list.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24"><path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg><p>Лента пуста — добавь друзей или вступи в группу</p></div>`;
        } else {
          list.insertAdjacentHTML('beforeend', posts.map(p => renderPost(p, me)).join(''));
          offset += posts.length;
          if (posts.length < 20) hasMore = false;
        }
      } catch(e) { App.toast(e.message, 'error'); }
      loading = false;
      if (loader) loader.classList.add('hidden');
    },

    previewImage(input) {
      const file = input.files[0];
      if (!file) return;
      postImageFile = file;
      const preview = document.getElementById('post-img-preview');
      preview.src = URL.createObjectURL(file);
      preview.classList.remove('hidden');
    },

    async submitPost() {
      const content = document.getElementById('post-content')?.value.trim();
      if (!content) return App.toast('Напиши что-нибудь', 'error');
      const fd = new FormData();
      fd.append('content', content);
      if (postImageFile) fd.append('image', postImageFile);
      try {
        const post = await API.createPost(fd);
        document.getElementById('post-content').value = '';
        document.getElementById('post-img-preview').classList.add('hidden');
        document.getElementById('post-img-input').value = '';
        postImageFile = null;
        const list = document.getElementById('feed-list');
        if (list) list.insertAdjacentHTML('afterbegin', renderPost(post, App.me));
        App.toast('Пост опубликован');
      } catch(e) { App.toast(e.message, 'error'); }
    },

    async deletePost(id) {
      if (!confirm('Удалить пост?')) return;
      try {
        await API.deletePost(id);
        document.getElementById(`post-${id}`)?.remove();
        App.toast('Пост удалён');
      } catch(e) { App.toast(e.message, 'error'); }
    },

    async toggleLike(id) {
      try {
        const r = await API.likePost(id);
        const btn = document.getElementById(`like-btn-${id}`);
        const cnt = document.getElementById(`like-count-${id}`);
        if (!btn || !cnt) return;
        const cur = parseInt(cnt.textContent);
        if (r.liked) { btn.classList.add('liked'); cnt.textContent = cur + 1; }
        else { btn.classList.remove('liked'); cnt.textContent = Math.max(0, cur - 1); }
      } catch(e) { App.toast(e.message, 'error'); }
    },

    async toggleComments(postId) {
      const section = document.getElementById(`comments-${postId}`);
      if (!section) return;
      if (!section.classList.contains('hidden')) { section.classList.add('hidden'); return; }
      section.innerHTML = '<div class="spinner" style="width:24px;height:24px;margin:10px auto"></div>';
      section.classList.remove('hidden');
      try {
        const comments = await API.getComments(postId);
        section.innerHTML = renderComments(postId, comments, App.me);
      } catch(e) { App.toast(e.message, 'error'); }
    },

    async submitComment(postId) {
      const input = document.getElementById(`ci-${postId}`);
      if (!input) return;
      const content = input.value.trim();
      if (!content) return;
      try {
        const c = await API.addComment(postId, content);
        input.value = '';
        const section = document.getElementById(`comments-${postId}`);
        const html = `<div class="comment"><div class="avatar" style="width:32px;height:32px"><img src="${c.avatar || '/img/default-avatar.svg'}" alt=""></div><div class="comment-body"><div class="comment-author">${escHtml(c.display_name||c.username)}</div><div class="comment-text">${escHtml(c.content)}</div></div></div>`;
        input.closest('.comment-input-row').insertAdjacentHTML('beforebegin', html);
      } catch(e) { App.toast(e.message, 'error'); }
    },

    async searchUsers(q) {
      const el = document.getElementById('search-results');
      if (!el || !q.trim()) { if (el) el.innerHTML = ''; return; }
      try {
        const users = await API.searchUsers(q);
        el.innerHTML = users.length ? users.map(u => `
          <div class="search-result-item" onclick="App.navProfile('${u.username}')">
            <div class="avatar" style="width:32px;height:32px"><img src="${u.avatar||'/img/default-avatar.svg'}"></div>
            <div><div style="font-weight:600;font-size:.9rem">${escHtml(u.display_name||u.username)}</div><div class="text-muted">@${u.username}</div></div>
          </div>`).join('') : '<p class="text-muted" style="padding:8px">Никого не найдено</p>';
      } catch {}
    },

    async loadSidebarGroups() {
      const el = document.getElementById('sidebar-groups');
      if (!el) return;
      try {
        const groups = await API.getMyGroups();
        el.innerHTML = groups.length ? groups.map(g => `
          <div class="search-result-item" onclick="App.nav('group',${g.id})">
            <div class="avatar" style="width:32px;height:32px;border-radius:6px;background:linear-gradient(135deg,#5865f2,#9333ea);display:flex;align-items:center;justify-content:center;font-size:1rem">
              ${g.avatar ? `<img src="${g.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:6px">` : '◈'}
            </div>
            <div style="min-width:0"><div style="font-weight:600;font-size:.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(g.name)}</div><div class="text-muted">${g.member_count} участников</div></div>
          </div>`).join('') : '<p class="text-muted">Ты ещё не в группах</p>';
      } catch {}
    }
  };
})();
