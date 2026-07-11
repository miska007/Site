// ADMIN PAGE
const AdminPage = (() => {
  let currentTab = 'stats';

  const tabs = [
    { id: 'stats',      label: 'Статистика' },
    { id: 'users',      label: 'Пользователи' },
    { id: 'sounds',     label: 'Звуки' },
    { id: 'appearance', label: 'Оформление' },
  ];

  const tabBar = () => tabs.map(t => `
    <button class="tab-btn ${currentTab===t.id?'active':''}" onclick="AdminPage.switchTab('${t.id}')">${t.label}</button>
  `).join('');

  return {
    async render(container, me) {
      if (!me.is_admin) {
        container.innerHTML = `<div class="page"><div class="page-main"><div class="empty-state"><p>Доступ запрещён</p></div></div></div>`;
        return;
      }
      container.innerHTML = `
        <div class="page">
          <div class="page-main">
            <div class="admin-main">
              <div class="page-header">
                <div class="page-title">⚙ Панель администратора</div>
              </div>
              <div class="admin-tabs" id="admin-tabs">${tabBar()}</div>
              <div id="admin-content"><div class="spinner"></div></div>
            </div>
          </div>
        </div>`;
      await this.loadTab(currentTab, me);
    },

    async switchTab(tab) {
      currentTab = tab;
      document.getElementById('admin-tabs').innerHTML = tabBar();
      document.getElementById('admin-content').innerHTML = '<div class="spinner"></div>';
      await this.loadTab(tab, App.me);
    },

    async loadTab(tab, me) {
      const el = document.getElementById('admin-content');
      if (!el) return;
      try {
        switch(tab) {
          case 'stats':      await this.renderStats(el); break;
          case 'users':      await this.renderUsers(el); break;
          case 'sounds':     await this.renderSounds(el); break;
          case 'appearance': await this.renderAppearance(el); break;
        }
      } catch(e) { el.innerHTML = `<p class="text-muted">${escHtml(e.message)}</p>`; }
    },

    async renderStats(el) {
      const s = await API.adminStats();
      el.innerHTML = `
        <div class="stats-grid">
          <div class="stat-card"><div class="stat-card-num">${s.users}</div><div class="stat-card-label">Пользователей</div></div>
          <div class="stat-card"><div class="stat-card-num">${s.posts}</div><div class="stat-card-label">Постов</div></div>
          <div class="stat-card"><div class="stat-card-num">${s.messages}</div><div class="stat-card-label">Сообщений</div></div>
          <div class="stat-card"><div class="stat-card-num">${s.groups}</div><div class="stat-card-label">Сообществ</div></div>
          <div class="stat-card"><div class="stat-card-num">${s.unread_notifications}</div><div class="stat-card-label">Непрочитанных уведомлений</div></div>
        </div>`;
    },

    async renderUsers(el) {
      const users = await API.adminUsers();
      el.innerHTML = `
        <div style="overflow-x:auto">
          <table class="admin-table">
            <thead><tr>
              <th>Пользователь</th><th>Email</th><th>Постов</th>
              <th>Регистрация</th><th>Администратор</th><th>Действия</th>
            </tr></thead>
            <tbody>
              ${users.map(u => `
              <tr id="auser-${u.id}">
                <td>
                  <div style="display:flex;align-items:center;gap:8px">
                    <div class="avatar" style="width:32px;height:32px"><img src="${u.avatar||'/img/default-avatar.svg'}"></div>
                    <div>
                      <div style="font-weight:600;color:#fff">${escHtml(u.display_name||u.username)}</div>
                      <div class="text-muted">@${escHtml(u.username)}</div>
                    </div>
                  </div>
                </td>
                <td class="text-muted">${escHtml(u.email)}</td>
                <td>${u.post_count}</td>
                <td class="text-muted">${new Date(u.created_at*1000).toLocaleDateString('ru')}</td>
                <td>
                  <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
                    <input type="checkbox" ${u.is_admin?'checked':''} onchange="AdminPage.toggleAdmin(${u.id},this.checked)"
                      ${u.id === App.me.id ? 'disabled title="Нельзя изменить себя"' : ''}>
                    <span class="text-muted">Админ</span>
                  </label>
                </td>
                <td>
                  ${u.id !== App.me.id ? `<button class="btn-danger" style="padding:4px 10px;font-size:.78rem"
                    onclick="AdminPage.deleteUser(${u.id},'${escHtml(u.username)}')">Удалить</button>` : ''}
                </td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    },

    async toggleAdmin(userId, isAdmin) {
      try {
        await API.adminPatchUser(userId, { is_admin: isAdmin });
        App.toast(isAdmin ? 'Права администратора выданы' : 'Права администратора сняты');
      } catch(e) { App.toast(e.message, 'error'); }
    },

    async deleteUser(userId, username) {
      if (!confirm(`Удалить пользователя @${username}? Это удалит все его данные.`)) return;
      try {
        await API.adminDeleteUser(userId);
        document.getElementById(`auser-${userId}`)?.remove();
        App.toast('Пользователь удалён');
      } catch(e) { App.toast(e.message, 'error'); }
    },

    async renderSounds(el) {
      const settings = await API.adminGetSettings();
      const soundTypes = [
        { type: 'message',      label: 'Новое сообщение' },
        { type: 'notification', label: 'Уведомление' },
        { type: 'friend_request', label: 'Запрос в друзья' },
        { type: 'group_invite', label: 'Приглашение в группу' },
      ];

      el.innerHTML = `
        <p class="text-muted" style="margin-bottom:16px">Загрузи звуки в формате MP3, OGG или WAV (макс. 2MB).</p>
        <div class="sound-list">
          ${soundTypes.map(s => {
            const url = settings[`sound_${s.type}`] || '';
            return `
            <div class="sound-row" id="srow-${s.type}">
              <div class="sound-row-info">
                <div class="sound-row-name">${s.label}</div>
                <div class="sound-row-url">${url ? url : 'Не загружен'}</div>
              </div>
              ${url ? `
                <audio controls src="${url}" style="height:32px;width:160px"></audio>
                <button class="btn-danger" style="padding:4px 10px;font-size:.78rem" onclick="AdminPage.deleteSound('${s.type}')">Удалить</button>
              ` : ''}
              <label class="btn-icon" style="cursor:pointer">
                <svg viewBox="0 0 24 24"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                Загрузить
                <input type="file" accept=".mp3,.ogg,.wav,.m4a,.aac,.webm,audio/*" class="hidden"
                  onchange="AdminPage.uploadSound('${s.type}', this)">
              </label>
            </div>`;
          }).join('')}
        </div>`;
    },

    async uploadSound(type, input) {
      const file = input.files[0]; if (!file) return;
      try {
        const r = await API.adminUploadSound(type, file);
        App.toast('Звук загружен');
        // Refresh tab
        await this.switchTab('sounds');
        // Update runtime sounds
        App.reloadSounds();
      } catch(e) { App.toast(e.message, 'error'); }
    },

    async deleteSound(type) {
      try {
        await API.adminDeleteSound(type);
        App.toast('Звук удалён');
        await this.switchTab('sounds');
        App.reloadSounds();
      } catch(e) { App.toast(e.message, 'error'); }
    },

    // ── Appearance editor ────────────────────────────────────────────────────
    async renderAppearance(el) {
      const settings = await API.adminGetSettings();

      const cssVars = [
        { key: 'css_accent',      label: 'Основной цвет (accent)', def: '#5865f2', type: 'color' },
        { key: 'css_accent_dark', label: 'Accent (тёмный)',         def: '#4752c4', type: 'color' },
        { key: 'css_danger',      label: 'Danger (красный)',         def: '#da373c', type: 'color' },
        { key: 'css_success',     label: 'Success (зелёный)',        def: '#23a55a', type: 'color' },
        { key: 'css_bg_dark',     label: 'Фон (тёмный)',             def: '#1e1f22', type: 'color' },
        { key: 'css_bg_mid',      label: 'Фон (средний)',            def: '#2b2d31', type: 'color' },
        { key: 'css_bg_light',    label: 'Фон (светлый)',            def: '#313338', type: 'color' },
        { key: 'css_text',        label: 'Цвет текста',              def: '#dcddde', type: 'color' },
        { key: 'css_text_muted',  label: 'Текст (приглушённый)',     def: '#96989d', type: 'color' },
        { key: 'css_site_name',   label: 'Название сайта',           def: 'SocialNet', type: 'text' },
      ];

      el.innerHTML = `
        <p class="text-muted" style="margin-bottom:16px">Изменения применяются сразу для всех пользователей после сохранения.</p>
        <div class="theme-grid" id="theme-grid">
          ${cssVars.map(v => `
          <div class="theme-var">
            <label>${v.label}</label>
            ${v.type === 'color'
              ? `<input type="color" id="tv-${v.key}" value="${settings[v.key]||v.def}">`
              : `<input type="text" id="tv-${v.key}" value="${escHtml(settings[v.key]||v.def)}">`}
          </div>`).join('')}
        </div>
        <div style="display:flex;gap:12px;margin-top:20px;flex-wrap:wrap">
          <button class="btn-primary" onclick="AdminPage.saveAppearance()">Сохранить оформление</button>
          <button class="btn-secondary" onclick="AdminPage.resetAppearance()">Сбросить к умолчаниям</button>
          <button class="btn-secondary" onclick="AdminPage.previewAppearance()">Предпросмотр</button>
        </div>`;
    },

    _collectAppearance() {
      const keys = [
        'css_accent','css_accent_dark','css_danger','css_success',
        'css_bg_dark','css_bg_mid','css_bg_light','css_text','css_text_muted','css_site_name'
      ];
      const data = {};
      keys.forEach(k => {
        const el = document.getElementById(`tv-${k}`);
        if (el) data[k] = el.value;
      });
      return data;
    },

    previewAppearance() {
      App.applyCssVars(this._collectAppearance());
      App.toast('Предпросмотр применён');
    },

    async saveAppearance() {
      const data = this._collectAppearance();
      try {
        await API.adminPutSettings(data);
        App.applyCssVars(data);
        App.toast('Оформление сохранено');
      } catch(e) { App.toast(e.message, 'error'); }
    },

    async resetAppearance() {
      if (!confirm('Сбросить оформление к стандартным значениям?')) return;
      const defaults = {
        css_accent:'#5865f2', css_accent_dark:'#4752c4', css_danger:'#da373c',
        css_success:'#23a55a', css_bg_dark:'#1e1f22', css_bg_mid:'#2b2d31',
        css_bg_light:'#313338', css_text:'#dcddde', css_text_muted:'#96989d',
        css_site_name:'SocialNet'
      };
      try {
        await API.adminPutSettings(defaults);
        App.applyCssVars(defaults);
        App.toast('Сброшено');
        await this.switchTab('appearance');
      } catch(e) { App.toast(e.message, 'error'); }
    }
  };
})();
