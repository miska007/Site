// API helper — все запросы к серверу
const API = (() => {
  const BASE = '/api';

  const headers = () => {
    const h = { 'Content-Type': 'application/json' };
    const token = localStorage.getItem('sn_token');
    if (token) h['Authorization'] = 'Bearer ' + token;
    return h;
  };

  const req = async (method, path, body) => {
    const opts = { method, headers: headers() };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(BASE + path, opts);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Ошибка сервера');
    return data;
  };

  const upload = async (method, path, formData) => {
    const token = localStorage.getItem('sn_token');
    const h = {};
    if (token) h['Authorization'] = 'Bearer ' + token;
    const r = await fetch(BASE + path, { method, headers: h, body: formData });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Ошибка загрузки');
    return data;
  };

  return {
    // Auth
    login:    (b) => req('POST', '/auth/login', b),
    register: (b) => req('POST', '/auth/register', b),

    // Users
    me:           ()  => req('GET',   '/users/me'),
    getUser:      (u) => req('GET',   `/users/${u}`),
    updateMe:     (b) => req('PATCH', '/users/me', b),
    uploadAvatar: (f) => { const fd = new FormData(); fd.append('avatar', f); return upload('POST', '/users/me/avatar', fd); },
    searchUsers:  (q) => req('GET',   `/users/search/users?q=${encodeURIComponent(q)}`),

    // Posts
    feed:         (limit=20, offset=0) => req('GET', `/posts/feed?limit=${limit}&offset=${offset}`),
    userPosts:    (id, limit=20, offset=0) => req('GET', `/posts/user/${id}?limit=${limit}&offset=${offset}`),
    createPost:   (fd) => upload('POST', '/posts', fd),
    deletePost:   (id) => req('DELETE', `/posts/${id}`),
    likePost:     (id) => req('POST',   `/posts/${id}/like`),
    getComments:  (id) => req('GET',    `/posts/${id}/comments`),
    addComment:   (id, content) => req('POST', `/posts/${id}/comments`, { content }),
    deleteComment:(pid, cid) => req('DELETE', `/posts/${pid}/comments/${cid}`),

    // Friends
    getFriends:      ()       => req('GET',    '/friends'),
    sendFriendReq:   (id)     => req('POST',   `/friends/${id}`),
    respondFriend:   (id, action) => req('PATCH', `/friends/${id}`, { action }),
    removeFriend:    (id)     => req('DELETE', `/friends/${id}`),

    // Groups
    getGroups:        ()   => req('GET',    '/groups'),
    getMyGroups:      ()   => req('GET',    '/groups/my'),
    getGroup:         (id) => req('GET',    `/groups/${id}`),
    createGroup:      (b)  => req('POST',   '/groups', b),
    joinGroup:        (id) => req('POST',   `/groups/${id}/join`),
    leaveGroup:       (id) => req('DELETE', `/groups/${id}/leave`),
    inviteToGroup:    (groupId, userId) => req('POST', `/groups/${groupId}/invite/${userId}`),
    declineGroupInvite: (groupId)       => req('DELETE', `/groups/${groupId}/invite`),
    getGroupPosts:    (id, limit=20, offset=0) => req('GET', `/groups/${id}/posts?limit=${limit}&offset=${offset}`),
    getGroupMembers:  (id) => req('GET',  `/groups/${id}/members`),
    uploadGroupAvatar:(id, f) => { const fd = new FormData(); fd.append('avatar', f); return upload('POST', `/groups/${id}/avatar`, fd); },

    // Messages
    getDialogs:  ()         => req('GET',  '/messages'),
    getMessages: (id, limit=50, before) => req('GET', `/messages/${id}?limit=${limit}${before?'&before='+before:''}`),
    sendMessage: (id, content) => req('POST', `/messages/${id}`, { content }),

    // Notifications
    getNotifications: () => req('GET',  '/notifications'),
    getUnreadCount:   () => req('GET',  '/notifications/unread-count'),
    readAll:          () => req('POST', '/notifications/read-all'),
    deleteNotif:      (id) => req('DELETE', `/notifications/${id}`),

    // Admin
    adminStats:       () => req('GET',  '/admin/stats'),
    adminUsers:       () => req('GET',  '/admin/users'),
    adminPatchUser:   (id, b) => req('PATCH', `/admin/users/${id}`, b),
    adminDeleteUser:  (id)    => req('DELETE', `/admin/users/${id}`),
    adminGetSettings: () => req('GET',  '/admin/settings'),
    adminPutSettings: (b)    => req('PUT',  '/admin/settings', b),
    adminUploadSound: (type, file) => { const fd = new FormData(); fd.append('sound', file); return upload('POST', `/admin/sounds/${type}`, fd); },
    adminDeleteSound: (type)      => req('DELETE', `/admin/sounds/${type}`),

    // Public settings (sounds, theme vars)
    getPublicSettings: () => fetch('/api/settings').then(r => r.json()).catch(() => ({})),
  };
})();
