// ── Utility ──────────────────────────────────────────────────────────────────
const escHtml = (str) => {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
};

// ── App ───────────────────────────────────────────────────────────────────────
const App = (() => {
  let _me          = null;
  let _socket      = null;
  let _currentPage = null;
  let _badgeTimer  = null;
  let _toastTimer  = null;
  let _sounds      = {};   // type -> Audio

  // ── CSS vars (theme editor) ────────────────────────────────────────────────
  const CSS_MAP = {
    css_accent:      '--accent',
    css_accent_dark: '--accent-dark',
    css_danger:      '--danger',
    css_success:     '--success',
    css_bg_dark:     '--bg-dark',
    css_bg_mid:      '--bg-mid',
    css_bg_light:    '--bg-light',
    css_text:        '--text',
    css_text_muted:  '--text-muted',
  };

  const applyCssVars = (settings) => {
    const root = document.documentElement;
    Object.entries(CSS_MAP).forEach(([key, varName]) => {
      if (settings[key]) root.style.setProperty(varName, settings[key]);
    });
    if (settings.css_site_name) {
      document.title = settings.css_site_name;
      const logoText = document.querySelector('.logo-text');
      if (logoText) logoText.textContent = settings.css_site_name;
    }
  };

  // ── Sounds ─────────────────────────────────────────────────────────────────
  const SOUND_TYPES = ['message', 'notification', 'friend_request', 'group_invite'];

  const loadSounds = async () => {
    try {
      const settings = await API.getPublicSettings();
      SOUND_TYPES.forEach(type => {
        const url = settings[`sound_${type}`];
        if (url) {
          _sounds[type] = new Audio(url);
          _sounds[type].volume = 0.5;
        } else {
          delete _sounds[type];
        }
      });
      // Apply CSS vars too (same settings endpoint)
      applyCssVars(settings);
    } catch {}
  };

  const playSound = (type) => {
    const audio = _sounds[type];
    if (!audio) return;
    try {
      audio.currentTime = 0;
      audio.play().catch(() => {}); // ignore autoplay policy errors
    } catch {}
  };

  // ── Screens ────────────────────────────────────────────────────────────────
  const showAuth = () => {
    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
  };

  const showApp = () => {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
  };

  // ── Auth forms ─────────────────────────────────────────────────────────────
  const showLogin = () => {
    document.getElementById('login-form').classList.remove('hidden');
    document.getElementById('register-form').classList.add('hidden');
    document.getElementById('login-error').classList.add('hidden');
    document.getElementById('login-login')?.focus();
  };

  const showRegister = () => {
    document.getElementById('register-form').classList.remove('hidden');
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('reg-error').classList.add('hidden');
    document.getElementById('reg-displayname')?.focus();
  };

  const setError = (id, msg) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
  };

  const doLogin = async () => {
    const login    = document.getElementById('login-login')?.value.trim();
    const password = document.getElementById('login-password')?.value;
    if (!login || !password) return setError('login-error', 'Заполни все поля');
    try {
      const data = await API.login({ login, password });
      localStorage.setItem('sn_token', data.token);
      await boot(data.token, data.user);
    } catch (e) { setError('login-error', e.message); }
  };

  const doRegister = async () => {
    const display_name = document.getElementById('reg-displayname')?.value.trim();
    const username     = document.getElementById('reg-username')?.value.trim();
    const email        = document.getElementById('reg-email')?.value.trim();
    const password     = document.getElementById('reg-password')?.value;
    if (!username || !email || !password) return setError('reg-error', 'Заполни все поля');
    try {
      const data = await API.register({ username, email, password, display_name });
      localStorage.setItem('sn_token', data.token);
      await boot(data.token, data.user);
    } catch (e) { setError('reg-error', e.message); }
  };

  // Enter-key support on auth inputs
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (document.activeElement?.closest('#login-form'))    doLogin();
    if (document.activeElement?.closest('#register-form')) doRegister();
  });

  // ── Socket.IO ──────────────────────────────────────────────────────────────
  const connectSocket = (token) => {
    if (_socket) { _socket.disconnect(); _socket = null; }
    _socket = io({ auth: { token } });
    _socket.on('connect',       () => console.log('🔌 Socket OK'));
    _socket.on('connect_error', (e) => console.warn('Socket:', e.message));

    _socket.on('message:new', (msg) => {
      if (_currentPage === 'messages') MessagesPage.appendMessage(msg);
      // Play sound only for incoming messages
      if (msg.sender_id !== _me?.id) playSound('message');
      updateBadges();
    });

    _socket.on('notification:new', (data) => {
      playSound(data.type === 'group_invite' ? 'group_invite' : 'notification');
      updateBadges();
    });
  };

  // ── Badges ─────────────────────────────────────────────────────────────────
  const updateBadges = async () => {
    try {
      const data = await API.getUnreadCount();
      const n = data.notifications ?? data.count ?? 0;
      const m = data.messages ?? 0;
      const nb = document.getElementById('notif-badge');
      const mb = document.getElementById('msg-badge');
      if (nb) { nb.textContent = n; nb.classList.toggle('hidden', n === 0); }
      if (mb) { mb.textContent = m; mb.classList.toggle('hidden', m === 0); }
    } catch {}
  };

  // ── Navigation ─────────────────────────────────────────────────────────────
  const nav = async (page, param) => {
    _currentPage = page;
    const content = document.getElementById('content');
    if (!content) return;

    ['feed','groups','friends','messages','notifications','admin'].forEach(p => {
      const isActive = p === page || (page === 'group' && p === 'groups');
      document.getElementById(`nav-${p}`)?.classList.toggle('active', isActive);
    });

    content.innerHTML = '<div class="spinner"></div>';
    try {
      switch (page) {
        case 'feed':          await FeedPage.render(content, _me);           break;
        case 'groups':        await GroupsPage.render(content, _me);         break;
        case 'group':         await GroupPage.render(content, _me, param);   break;
        case 'friends':       await FriendsPage.render(content, _me);        break;
        case 'messages':      await MessagesPage.render(content, _me);       break;
        case 'notifications': await NotificationsPage.render(content, _me);  break;
        case 'profile':       await ProfilePage.render(content, _me, param); break;
        case 'admin':
          if (_me?.is_admin) await AdminPage.render(content, _me);
          else               await FeedPage.render(content, _me);
          break;
        default:              await FeedPage.render(content, _me);
      }
    } catch (e) {
      console.error('nav error', e);
      content.innerHTML = `<div class="page"><div class="page-main"><p class="text-muted" style="padding:24px">Ошибка загрузки: ${escHtml(e.message)}</p></div></div>`;
    }
  };

  const navProfile = (username) => nav('profile', username || _me?.username);

  // ── Toast ──────────────────────────────────────────────────────────────────
  const toast = (msg, type = 'success') => {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = type === 'error' ? 'toast error' : 'toast';
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => el.classList.add('hidden'), 3000);
  };

  // ── Modal ──────────────────────────────────────────────────────────────────
  const openModal = (html) => {
    document.getElementById('modal-content').innerHTML = html;
    document.getElementById('modal-overlay').classList.remove('hidden');
    setTimeout(() => document.querySelector('#modal-box input, #modal-box textarea')?.focus(), 50);
  };

  const closeModal = () => {
    document.getElementById('modal-overlay').classList.add('hidden');
    document.getElementById('modal-content').innerHTML = '';
  };

  // ── Lightbox ───────────────────────────────────────────────────────────────
  const lightbox = (src) => {
    openModal(`<img src="${escHtml(src)}" style="max-width:100%;max-height:80vh;display:block;border-radius:4px" alt="">`);
  };

  // ── Logout ─────────────────────────────────────────────────────────────────
  const logout = () => {
    localStorage.removeItem('sn_token');
    if (_socket) { _socket.disconnect(); _socket = null; }
    clearInterval(_badgeTimer);
    _me = null;
    showAuth();
    showLogin();
  };

  // ── Boot ───────────────────────────────────────────────────────────────────
  const boot = async (token, userHint) => {
    try {
      _me = (userHint && userHint.email) ? userHint : await API.me();
    } catch {
      localStorage.removeItem('sn_token');
      showAuth();
      showLogin();
      return;
    }

    const avatarImg = document.getElementById('my-avatar-img');
    if (avatarImg && _me.avatar) avatarImg.src = _me.avatar;

    // Show admin button if admin
    const adminBtn = document.getElementById('nav-admin');
    if (adminBtn) adminBtn.classList.toggle('hidden', !_me.is_admin);

    connectSocket(token);
    await loadSounds();
    showApp();
    await nav('feed');
    await updateBadges();

    clearInterval(_badgeTimer);
    _badgeTimer = setInterval(updateBadges, 30000);
  };

  // ── Init ───────────────────────────────────────────────────────────────────
  const init = async () => {
    // Load public settings (theme) even before login
    try {
      const settings = await API.getPublicSettings();
      applyCssVars(settings);
    } catch {}

    const token = localStorage.getItem('sn_token');
    if (token) {
      try {
        const user = await API.me();
        await boot(token, user);
        return;
      } catch {
        localStorage.removeItem('sn_token');
      }
    }
    showAuth();
    showLogin();
  };

  document.addEventListener('DOMContentLoaded', init);

  // ── Public API ─────────────────────────────────────────────────────────────
  return {
    get me()     { return _me; },
    set me(v)    { _me = v; },
    get socket() { return _socket; },
    nav,
    navProfile,
    toast,
    openModal,
    closeModal,
    lightbox,
    logout,
    showLogin,
    showRegister,
    doLogin,
    doRegister,
    updateBadges,
    applyCssVars,
    reloadSounds: loadSounds,
    playSound,
  };
})();
