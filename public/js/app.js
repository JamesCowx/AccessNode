(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return document.querySelectorAll(s); };

  var state = {
    filter: 'all', category: 'all', search: '', view: localStorage.getItem('an_view') || 'grid',
    sort: 'updated', density: localStorage.getItem('an_density') || 'comfortable',
    selected: new Set(), lockTimeout: null, allEntries: []
  };

  function getCsrfToken() {
    var meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute('content') : '';
  }

  var API = {
    _req: function (m, u, b) {
      var headers = { 'Content-Type': 'application/json' };
      var csrf = getCsrfToken();
      if (csrf && m !== 'GET' && m !== 'HEAD') { headers['x-csrf-token'] = csrf; }
      var o = { method: m, headers: headers, credentials: 'same-origin' };
      if (b) o.body = JSON.stringify(b);
      return fetch(u, o).then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Request failed'); return d; }); });
    },
    get: function (u) { return this._req('GET', u); },
    post: function (u, b) { return this._req('POST', u, b); },
    put: function (u, b) { return this._req('PUT', u, b); },
    del: function (u) { return this._req('DELETE', u); },
    patch: function (u, b) { return this._req('PATCH', u, b); }
  };

  var tc = $('#toast-container');
  function toast(msg, type) {
    if (!tc) return;
    var el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.innerHTML = '<span class="toast-icon">' + (type === 'success' ? '&#10003;' : type === 'error' ? '&#10007;' : '&#9432;') + '</span>' + msg;
    tc.appendChild(el);
    setTimeout(function () { el.classList.add('toast-out'); setTimeout(function () { el.parentNode && el.parentNode.removeChild(el); }, 300); }, 2800);
  }

  function confetti() {
    var colors = ['#6366f1', '#a855f7', '#06b6d4', '#22c55e', '#eab308', '#ec4899'];
    for (var i = 0; i < 40; i++) {
      var piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.left = Math.random() * 100 + '%';
      piece.style.top = -(Math.random() * 20 + 10) + 'px';
      piece.style.width = (Math.random() * 8 + 4) + 'px';
      piece.style.height = (Math.random() * 8 + 4) + 'px';
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
      piece.style.animationDuration = (Math.random() * 1.5 + 1) + 's';
      piece.style.animationDelay = Math.random() * 0.3 + 's';
      document.body.appendChild(piece);
      setTimeout(function () { piece.parentNode && piece.parentNode.removeChild(piece); }, 2000);
    }
  }

  // Ripple
  function addRipple(e, el) {
    var rect = el.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;
    var ripple = document.createElement('span');
    ripple.className = 'ripple-effect';
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    ripple.style.width = ripple.style.height = Math.max(rect.width, rect.height) + 'px';
    el.appendChild(ripple);
    setTimeout(function () { ripple.parentNode && ripple.parentNode.removeChild(ripple); }, 600);
  }

  // Ripple on all buttons
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.btn');
    if (btn) addRipple(e, btn);
  });

  // 3D Tilt
  function initTilt(card) {
    card.addEventListener('mousemove', function (e) {
      var rect = card.getBoundingClientRect();
      var x = e.clientX - rect.left;
      var y = e.clientY - rect.top;
      var centerX = rect.width / 2, centerY = rect.height / 2;
      var rotateX = (y - centerY) / centerY * -6;
      var rotateY = (x - centerX) / centerX * 6;
      card.style.transform = 'perspective(1000px) rotateX(' + rotateX + 'deg) rotateY(' + rotateY + 'deg) scale3d(1.02, 1.02, 1.02)';
      card.style.setProperty('--mx', ((x / rect.width) * 100) + '%');
      card.style.setProperty('--my', ((y / rect.height) * 100) + '%');
    });
    card.addEventListener('mouseleave', function () {
      card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale3d(1, 1, 1)';
    });
  }

  // Spotlight
  function initSpotlight(el) {
    el.addEventListener('mousemove', function (e) {
      var rect = el.getBoundingClientRect();
      el.style.setProperty('--mx', ((e.clientX - rect.left) / rect.width * 100) + '%');
      el.style.setProperty('--my', ((e.clientY - rect.top) / rect.height * 100) + '%');
    });
  }

  function confirmDialog(msg, title, btnText, onOk) {
    $('#confirm-message').textContent = msg || 'Are you sure?';
    $('#confirm-title').textContent = title || 'Confirm';
    var ok = $('#confirm-ok');
    ok.textContent = btnText || 'Delete';
    ok.onclick = function () { onOk(); closeModals(); };
    showModal('confirm-modal');
  }

  function closeModals() { var o = $('#modal-overlay'); if (o) o.style.display = 'none'; }
  function showModal(id) {
    var overlay = $('#modal-overlay'); overlay.style.display = 'flex';
    $$('.modal').forEach(function (m) { m.style.display = 'none'; });
    var t = $('#' + id); if (t) t.style.display = 'block';
  }
  $$('.modal-close').forEach(function (b) { b.addEventListener('click', closeModals); });
  var mo = $('#modal-overlay');
  if (mo) mo.addEventListener('click', function (e) { if (e.target === this) closeModals(); });

  var iconColors = ['blue', 'purple', 'green', 'orange', 'cyan', 'pink', 'yellow'];
  function iconColor(s) { var h = 0; for (var i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i); return iconColors[Math.abs(h) % iconColors.length]; }

  function pwStrength(p) {
    var s = 0;
    if (p.length >= 8) s++; if (p.length >= 12) s++; if (p.length >= 16) s++; if (p.length >= 20) s++;
    if (/[a-z]/.test(p)) s++; if (/[A-Z]/.test(p)) s++; if (/[0-9]/.test(p)) s++; if (/[^a-zA-Z0-9]/.test(p)) s += 2;
    if (s <= 3) return { label: 'Weak', color: '#ef4444', score: s, level: 'weak' };
    if (s <= 5) return { label: 'Fair', color: '#f97316', score: s, level: 'fair' };
    if (s <= 7) return { label: 'Strong', color: '#22c55e', score: s, level: 'strong' };
    return { label: 'Very Strong', color: '#10b981', score: s, level: 'very-strong' };
  }

  function genPw() {
    var len = parseInt($('#gen-length').value) || 20;
    var upper = $('#gen-uppercase').checked, lower = $('#gen-lowercase').checked, nums = $('#gen-numbers').checked, syms = $('#gen-symbols').checked;
    var chars = { upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ', lower: 'abcdefghjkmnpqrstuvwxyz', nums: '23456789', syms: '!@#$%^&*()_+-=[]{}|;:,.<>?' };
    var pool = ''; if (upper) pool += chars.upper; if (lower) pool += chars.lower; if (nums) pool += chars.nums; if (syms) pool += chars.syms;
    if (!pool) pool = chars.lower + chars.nums;
    var arr = new Uint32Array(len + 8); crypto.getRandomValues(arr);
    var pw = ''; for (var i = 0; i < len; i++) pw += pool[arr[i] % pool.length];
    if (upper && !/[A-Z]/.test(pw)) pw = pw.substring(0,1) + chars.upper[arr[len] % chars.upper.length] + pw.substring(1);
    if (lower && !/[a-z]/.test(pw)) pw = pw.substring(0,2) + chars.lower[arr[len+1] % chars.lower.length] + pw.substring(2);
    if (nums && !/[0-9]/.test(pw)) pw = pw.substring(0,3) + chars.nums[arr[len+2] % chars.nums.length] + pw.substring(3);
    if (syms && !/[^a-zA-Z0-9]/.test(pw)) pw = pw.substring(0,4) + chars.syms[arr[len+3] % chars.syms.length] + pw.substring(4);
    return pw;
  }

  // Theme
  function initTheme() {
    var saved = localStorage.getItem('an_theme');
    if (!saved) saved = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    API.put('/api/vault/theme', { theme: saved }).catch(function () {});
  }
  function toggleTheme() {
    var cur = document.documentElement.getAttribute('data-theme');
    var next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('an_theme', next);
    var btn = $('#theme-toggle'); if (btn) btn.innerHTML = next === 'dark' ? '&#9789;' : '&#9788;';
    API.put('/api/vault/theme', { theme: next }).catch(function () {});
  }

  // Auto-lock
  function resetLockTimer() { clearTimeout(state.lockTimeout); state.lockTimeout = setTimeout(lockVault, 15 * 60 * 1000); }
  function lockVault() { toast('Vault locked due to inactivity', ''); setTimeout(function () { API.post('/api/auth/logout').then(function () { window.location.href = '/login'; }).catch(function () { window.location.href = '/login'; }); }, 1500); }
  document.addEventListener('mousemove', resetLockTimer);
  document.addEventListener('keydown', resetLockTimer);
  document.addEventListener('click', resetLockTimer);

  // Welcome greeting
  function updateGreeting() {
    var h = new Date().getHours();
    var g = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    var el = $('#welcome-greeting'); if (el) el.innerHTML = g + ', <span>' + (el.querySelector('span') ? el.querySelector('span').textContent : 'User') + '</span>';
  }

  // Animate counter
  function animateCounter(el, target) {
    var current = parseInt(el.textContent) || 0;
    if (current === target) return;
    var duration = 600, start = performance.now();
    function step(ts) {
      var progress = Math.min((ts - start) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(current + (target - current) * eased);
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // ---- Auth pages ----
  var lf = $('#login-form');
  if (lf) {
    lf.addEventListener('submit', function (e) {
      e.preventDefault();
      var err = $('#login-error'); err.style.display = 'none';
      API.post('/api/auth/login', { email: $('#email').value.trim(), password: $('#password').value })
        .then(function (d) { window.location.href = d.redirect; })
        .catch(function (e2) { err.textContent = e2.message; err.style.display = 'block'; });
    });
  }
  var rf = $('#register-form');
  if (rf) {
    var pi = $('#password'), ps = $('#password-strength'), sf = $('#strength-fill'), sl = $('#strength-label');
    if (pi) { pi.addEventListener('input', function () { var p = pi.value; if (!p) { ps.style.display = 'none'; return; } ps.style.display = 'block'; var s = pwStrength(p); sf.style.width = ((s.score / 9) * 100) + '%'; sf.style.background = s.color; sl.textContent = s.label; sl.style.color = s.color; }); }
    rf.addEventListener('submit', function (e) { e.preventDefault(); var err = $('#register-error'); err.style.display = 'none'; API.post('/api/auth/register', { email: $('#email').value.trim(), password: pi.value }).then(function (d) { window.location.href = d.redirect; }).catch(function (e2) { err.textContent = e2.message; err.style.display = 'block'; }); });
  }

  // ---- Dashboard ----
  var entriesEl = $('#entries-container');
  if (!entriesEl) return;

  initTheme();
  resetLockTimer();
  updateGreeting();

  function sortEntries(entries) {
    var s = state.sort;
    return entries.slice().sort(function (a, b) {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      if (a.favorite && !b.favorite) return -1;
      if (!a.favorite && b.favorite) return 1;
      if (s === 'title') return (a.title || '').localeCompare(b.title || '');
      if (s === 'title-desc') return (b.title || '').localeCompare(a.title || '');
      if (s === 'category') return (a.category || '').localeCompare(b.category || '');
      if (s === 'created') return new Date(b.created_at) - new Date(a.created_at);
      return new Date(b.updated_at) - new Date(a.updated_at);
    });
  }

  function loadEntries() {
    showSkeleton();
    var params = new URLSearchParams();
    if (state.filter === 'favorites') params.set('favorite', '1');
    if (state.filter === 'trash') params.set('trash', '1');
    if (state.category !== 'all') params.set('category', state.category);
    if (state.search) params.set('search', state.search);

    API.get('/api/vault/entries?' + params.toString())
      .then(function (entries) {
        entries.forEach(function (e) { e.pinned = (localStorage.getItem('an_pin_' + e.id) === '1'); });
        state.allEntries = entries;
        renderEntries(sortEntries(entries));
        loadStats();
        updateCounts(entries);
        var tb = $('#trash-info-bar'); if (tb) tb.style.display = state.filter === 'trash' ? 'flex' : 'none';
        var welcomeT = $('#welcome-total'); if (welcomeT) animateCounter(welcomeT, state.allEntries.filter(function (e) { return !e.deleted_at; }).length);
      })
      .catch(function (err) { entriesEl.innerHTML = '<div class="empty-state"><div class="empty-icon">&#9888;</div><h3>Failed to load</h3><p>' + escHtml(err.message) + '</p></div>'; });
  }

  function showSkeleton() {
    if (state.view === 'grid') { var h = '<div class="entries-grid">'; for (var i = 0; i < 6; i++) h += '<div class="skeleton skeleton-card"></div>'; entriesEl.innerHTML = h + '</div>'; }
    else { var h2 = '<div class="entries-list">'; for (var j = 0; j < 10; j++) h2 += '<div class="skeleton skeleton-row"></div>'; entriesEl.innerHTML = h2 + '</div>'; }
  }

  function renderEntries(entries) {
    var isTrash = state.filter === 'trash';
    state.selected.clear();
    updateMultiselect();

    if (!entries.length) {
      var icon = isTrash ? '&#128465;' : (state.search ? '&#128269;' : '&#128274;');
      var title = isTrash ? 'Trash is empty' : (state.search ? 'No results' : 'Your vault is empty');
      var msg = isTrash ? 'No deleted items.' : (state.search ? 'Try a different search.' : 'Click "New Entry" to get started.');
      entriesEl.innerHTML = '<div class="empty-state"><div class="empty-icon float-anim">' + icon + '</div><h3>' + title + '</h3><p>' + msg + '</p>' + (!isTrash && !state.search ? '<button class="btn btn-primary" id="empty-add-btn">+ Add Your First Entry</button>' : '') + '</div>';
      var eab = $('#empty-add-btn'); if (eab) eab.addEventListener('click', openNewEntry);
      return;
    }

    if (state.view === 'grid') {
      var html = '<div class="entries-grid">';
      entries.forEach(function (e) {
        var initial = (e.title || 'A')[0].toUpperCase();
        var pinned = e.pinned;
        var strength = e.password ? pwStrength(e.password) : null;
        var cls = 'entry-card spotlight';
        if (strength && strength.level === 'very-strong') cls += ' strong-pw accent-top';
        else if (strength && strength.level === 'weak') cls += ' weak-pw accent-top';
        if (pinned) cls += ' border-glow';
        var favBtn = '';
        if (!isTrash) favBtn = '<button class="entry-fav' + (e.favorite ? ' active' : '') + '" data-id="' + e.id + '">' + (e.favorite ? '&#9733;' : '&#9734;') + '</button>';
        html += '<div class="' + cls + '" data-id="' + e.id + '">' +
          (pinned ? '<div class="pinned-indicator">&#128204;</div>' : '') +
          '<div class="select-check" data-id="' + e.id + '"></div>' +
          '<div class="entry-card-header"><div class="entry-avatar ' + iconColor(e.title) + '">' + initial + '</div>' + favBtn + '</div>' +
          '<div class="entry-title">' + escHtml(e.title) + (pinned ? ' <span class="pinned-badge">Pinned</span>' : '') + '</div>' +
          '<div class="entry-username">' + escHtml(e.username) + '</div>' +
          '<div class="entry-footer"><div class="entry-meta"><span class="entry-cat">' + escHtml(e.category) + '</span>' +
          (strength ? '<span class="strength-badge ' + strength.level + '">' + strength.label + '</span>' : '') + '</div>' +
          '<div class="entry-actions-row">' +
          (isTrash ? '<button class="btn btn-ghost btn-xs restore-entry" data-id="' + e.id + '">Restore</button><button class="btn btn-ghost btn-xs perm-delete-entry" data-id="' + e.id + '" style="color:var(--red);">Delete</button>' :
            '<button class="btn btn-ghost btn-xs copy-btn" data-copy="' + escAttr(e.username) + '">User</button>' +
            '<button class="btn btn-ghost btn-xs copy-btn" data-copy="' + escAttr(e.password) + '">Pass</button>' +
            '<button class="btn btn-ghost btn-xs edit-entry" data-id="' + e.id + '">Edit</button>') +
          '</div></div></div>';
      });
      html += '</div>';
      entriesEl.innerHTML = html;
    } else {
      var lhtml = '<div class="entries-list">';
      entries.forEach(function (e) {
        var strength = e.password ? pwStrength(e.password) : null;
        lhtml += '<div class="entry-row spotlight" data-id="' + e.id + '">' +
          '<div class="select-check" data-id="' + e.id + '"></div>' +
          '<div class="entry-row-title"><div class="entry-row-avatar entry-avatar ' + iconColor(e.title) + '">' + (e.title || 'A')[0].toUpperCase() + '</div><span>' + escHtml(e.title) + '</span>' + (isTrash ? '<span class="trash-badge" style="margin-left:8px;">Deleted</span>' : (e.pinned ? '<span class="pinned-badge" style="margin-left:6px;">Pinned</span>' : '')) + '</div>' +
          '<div class="entry-row-user">' + escHtml(e.username) + '</div>' +
          '<div class="entry-row-cat">' + escHtml(e.category) + (strength ? ' <span class="strength-badge ' + strength.level + '">' + strength.label + '</span>' : '') + '</div>' +
          '<div class="entry-row-actions">' +
          (isTrash ? '<button class="btn btn-ghost btn-xs restore-entry" data-id="' + e.id + '">Restore</button><button class="btn btn-ghost btn-xs perm-delete-entry" data-id="' + e.id + '" style="color:var(--red);">Del</button>' :
            '<button class="btn btn-ghost btn-xs copy-btn" data-copy="' + escAttr(e.username) + '">Copy</button><button class="btn btn-ghost btn-xs copy-btn" data-copy="' + escAttr(e.password) + '">Pass</button><button class="btn btn-ghost btn-xs edit-entry" data-id="' + e.id + '">Edit</button>') +
          '</div></div>';
      });
      lhtml += '</div>';
      entriesEl.innerHTML = lhtml;
    }
    bindEntryEvents();
  }

  function bindEntryEvents() {
    // Tilt + spotlight
    entriesEl.querySelectorAll('.entry-card').forEach(function (c) { initTilt(c); initSpotlight(c); c.classList.add('tilt-card'); });
    entriesEl.querySelectorAll('.entry-row').forEach(function (r) { initSpotlight(r); });

    // Copy
    entriesEl.querySelectorAll('.copy-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) { e.stopPropagation(); copyText(btn.dataset.copy); var o = btn.textContent; btn.textContent = 'Copied!'; btn.classList.add('copy-flash'); setTimeout(function () { btn.textContent = o; btn.classList.remove('copy-flash'); }, 1400); });
    });
    // Select checkboxes
    entriesEl.querySelectorAll('.select-check').forEach(function (chk) {
      chk.addEventListener('click', function (e) {
        e.stopPropagation(); var id = chk.dataset.id;
        if (state.selected.has(id)) { state.selected.delete(id); chk.classList.remove('checked'); }
        else { state.selected.add(id); chk.classList.add('checked'); }
        updateMultiselect();
      });
    });
    // Fav
    entriesEl.querySelectorAll('.entry-fav').forEach(function (btn) {
      btn.addEventListener('click', function (e) { e.stopPropagation(); API.patch('/api/vault/entries/' + btn.dataset.id + '/favorite').then(loadEntries).catch(function (err) { toast(err.message, 'error'); }); });
    });
    // Edit / card click
    entriesEl.querySelectorAll('.edit-entry').forEach(function (el) { el.addEventListener('click', function (e) { e.stopPropagation(); openEditModal(el.dataset.id); }); });
    entriesEl.querySelectorAll('.entry-card, .entry-row').forEach(function (el) {
      if (state.filter !== 'trash') {
        el.addEventListener('click', function (e) {
          if (e.target.closest('.select-check') || e.target.closest('.entry-fav') || e.target.closest('button')) return;
          if (e.ctrlKey || e.metaKey) {
            var id = el.dataset.id; var chk = el.querySelector('.select-check');
            if (state.selected.has(id)) { state.selected.delete(id); if (chk) chk.classList.remove('checked'); }
            else { state.selected.add(id); if (chk) chk.classList.add('checked'); }
            updateMultiselect();
          } else if (state.selected.size > 0) {
            var id2 = el.dataset.id; var chk2 = el.querySelector('.select-check');
            if (state.selected.has(id2)) { state.selected.delete(id2); if (chk2) chk2.classList.remove('checked'); }
            else { state.selected.add(id2); if (chk2) chk2.classList.add('checked'); }
            updateMultiselect();
          } else {
            openEditModal(el.dataset.id);
          }
        });
      }
    });
    // Trash actions
    entriesEl.querySelectorAll('.restore-entry').forEach(function (btn) { btn.addEventListener('click', function (e) { e.stopPropagation(); API.patch('/api/vault/entries/' + btn.dataset.id + '/restore').then(function () { loadEntries(); toast('Entry restored', 'success'); }).catch(function (err) { toast(err.message, 'error'); }); }); });
    entriesEl.querySelectorAll('.perm-delete-entry').forEach(function (btn) { btn.addEventListener('click', function (e) { e.stopPropagation(); confirmDialog('This item will be permanently deleted.', 'Delete Forever', 'Delete Forever', function () { var el = entriesEl.querySelector('[data-id="' + btn.dataset.id + '"]'); if (el) el.classList.add('shake-out'); setTimeout(function () { API.del('/api/vault/entries/' + btn.dataset.id + '/permanent').then(function () { loadEntries(); loadStats(); toast('Entry permanently deleted', 'success'); }).catch(function (err) { toast(err.message, 'error'); }); }, 400); }); }); });

    // Right-click context menu
    if (state.filter !== 'trash') {
      entriesEl.querySelectorAll('.entry-card, .entry-row').forEach(function (el) {
        el.addEventListener('contextmenu', function (e) { e.preventDefault(); showContextMenu(e, el.dataset.id); });
      });
    }
  }

  function showContextMenu(e, id) {
    var existing = document.querySelector('.quick-actions.show');
    if (existing) existing.classList.remove('show');
    var menu = document.createElement('div');
    menu.className = 'quick-actions show';
    menu.style.position = 'fixed';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    menu.innerHTML =
      '<button data-action="edit" data-id="' + id + '">&#9998; Edit Entry</button>' +
      '<button data-action="copy-user" data-id="' + id + '">&#128203; Copy Username</button>' +
      '<button data-action="copy-pass" data-id="' + id + '">&#128273; Copy Password</button>' +
      '<button data-action="pin" data-id="' + id + '">&#128204; ' + (localStorage.getItem('an_pin_' + id) === '1' ? 'Unpin' : 'Pin to Top') + '</button>' +
      '<button data-action="duplicate" data-id="' + id + '">&#128196; Duplicate</button>' +
      '<button data-action="delete" data-id="' + id + '" class="danger">&#128465; Move to Trash</button>';
    document.body.appendChild(menu);
    var close = function () { menu.classList.remove('show'); setTimeout(function () { if (menu.parentNode) menu.parentNode.removeChild(menu); }, 200); };
    menu.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        var action = b.dataset.action, eid = b.dataset.id;
        if (action === 'edit') openEditModal(eid);
        else if (action === 'copy-user' || action === 'copy-pass') {
          var entry = state.allEntries.find(function (x) { return String(x.id) === eid; });
          if (entry) { copyText(action === 'copy-user' ? entry.username : entry.password); toast('Copied!', 'success'); }
        } else if (action === 'pin') togglePin(eid);
        else if (action === 'duplicate') duplicateEntry(eid);
        else if (action === 'delete') confirmDialog('Move this entry to trash?', 'Move to Trash', 'Move', function () { API.del('/api/vault/entries/' + eid).then(function () { loadEntries(); loadStats(); toast('Moved to trash', 'success'); }); });
        close();
      });
    });
    setTimeout(function () { document.addEventListener('click', function handler() { close(); document.removeEventListener('click', handler); }); }, 0);
  }

  function togglePin(id) {
    var key = 'an_pin_' + id;
    var val = localStorage.getItem(key) === '1' ? '0' : '1';
    localStorage.setItem(key, val);
    loadEntries();
    toast(val === '1' ? 'Entry pinned' : 'Entry unpinned', 'success');
  }

  function duplicateEntry(id) {
    var entry = state.allEntries.find(function (x) { return String(x.id) === id; });
    if (!entry) return;
    API.post('/api/vault/entries', {
      title: entry.title + ' (Copy)',
      username: entry.username,
      password: entry.password,
      url: entry.url,
      notes: entry.notes,
      category: entry.category
    }).then(function () { loadEntries(); loadStats(); toast('Entry duplicated', 'success'); confetti(); });
  }

  function updateMultiselect() {
    var bar = $('#multiselect-bar');
    if (!bar) return;
    if (state.selected.size > 0) {
      bar.style.display = 'flex';
      $('#multiselect-count').textContent = state.selected.size + ' selected';
    } else {
      bar.style.display = 'none';
    }
  }

  function loadStats() {
    API.get('/api/vault/stats').then(function (s) {
      animateCounter($('#stat-total'), s.total);
      animateCounter($('#stat-strong'), s.health.strong);
      animateCounter($('#stat-weak'), s.health.weak);
      animateCounter($('#stat-old'), s.health.old);
      $('#count-trash').textContent = s.trash;
      var sec = $('#welcome-secure'); if (sec) animateCounter(sec, s.health.strong);
      var reused = s.health.reused > 0 ? s.health.reused + ' reused' : '';
      $('#stat-reused').textContent = reused;
    }).catch(function () {});
  }

  function updateCounts(entries) { var ac = $('#count-all'); if (ac) ac.textContent = entries.length; }

  function loadCategories() {
    API.get('/api/vault/categories').then(function (cats) {
      var list = $('#category-list'), sel = $('#entry-category');
      list.innerHTML = '';
      if (sel) sel.innerHTML = '<option value="General">General</option>';
      cats.forEach(function (c) {
        list.innerHTML += '<button class="category-item' + (state.category === c.name ? ' active' : '') + '" data-cat="' + escAttr(c.name) + '">' +
          '<span class="category-dot" style="background:' + (c.color || '#6b7280') + '"></span>' + escHtml(c.name) +
          '<span class="category-count">' + (c.entry_count || 0) + '</span></button>';
        if (sel && c.name !== 'General') sel.innerHTML += '<option value="' + escAttr(c.name) + '">' + escHtml(c.name) + '</option>';
      });
      list.querySelectorAll('.category-item').forEach(function (item) {
        item.addEventListener('click', function () {
          state.category = item.dataset.cat;
          if (state.category !== 'all') state.filter = 'all';
          list.querySelectorAll('.category-item').forEach(function (i) { i.classList.remove('active'); });
          item.classList.add('active');
          $$('.sidebar-link').forEach(function (l) { l.classList.remove('active'); });
          loadEntries();
        });
      });
    }).catch(function () {});
  }

  function openNewEntry() {
    $('#modal-title').textContent = 'New Entry';
    $('#entry-id').value = ''; $('#entry-title').value = ''; $('#entry-username').value = ''; $('#entry-password').value = '';
    $('#entry-url').value = ''; $('#entry-notes').value = ''; $('#entry-category').value = 'General';
    $('#delete-entry-btn').style.display = 'none'; $('#entry-error').style.display = 'none';
    $('#password-history-section').style.display = 'none';
    loadCategories(); showModal('entry-modal');
    setTimeout(function () { $('#entry-title').focus(); }, 180);
  }

  function openEditModal(id) {
    API.get('/api/vault/entries/' + id).then(function (e) {
      $('#modal-title').textContent = 'Edit Entry';
      $('#entry-id').value = e.id; $('#entry-title').value = e.title; $('#entry-username').value = e.username;
      $('#entry-password').value = e.password; $('#entry-url').value = e.url || ''; $('#entry-notes').value = e.notes || '';
      $('#entry-category').value = e.category || 'General';
      $('#delete-entry-btn').style.display = 'inline-flex'; $('#delete-entry-btn').textContent = 'Move to Trash';
      $('#entry-error').style.display = 'none';
      loadCategories(); loadPasswordHistory(id); showModal('entry-modal');
    }).catch(function (err) { toast(err.message, 'error'); });
  }

  function loadPasswordHistory(entryId) {
    API.get('/api/vault/entries/' + entryId + '/history').then(function (history) {
      if (!history.length) { $('#password-history-section').style.display = 'none'; return; }
      $('#password-history-section').style.display = 'block';
      var list = $('#password-history-list'); list.innerHTML = '';
      history.forEach(function (h) {
        list.innerHTML += '<div class="history-item"><span class="history-pw">' + maskPw(h.password) + '</span><span class="history-date">' + fmtDate(h.changed_at) + '</span><button class="btn btn-ghost btn-xs copy-btn" data-copy="' + escAttr(h.password) + '">Copy</button></div>';
      });
      list.querySelectorAll('.copy-btn').forEach(function (b) { b.addEventListener('click', function () { copyText(b.dataset.copy); b.textContent = 'Copied!'; setTimeout(function () { b.textContent = 'Copy'; }, 1400); }); });
    }).catch(function () {});
  }

  function maskPw(pw) { if (pw.length <= 4) return '****'; return pw.substring(0,2) + '••••' + pw.substring(pw.length-2); }
  function fmtDate(d) { var dt = new Date(d); return dt.toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }); }

  function saveEntry() {
    var errEl = $('#entry-error'); errEl.style.display = 'none';
    var data = { title: $('#entry-title').value.trim(), username: $('#entry-username').value.trim(), password: $('#entry-password').value, url: $('#entry-url').value.trim(), notes: $('#entry-notes').value.trim(), category: $('#entry-category').value };
    if (!data.title || !data.username || !data.password) { errEl.textContent = 'All required fields must be filled.'; errEl.style.display = 'block'; return; }
    var id = $('#entry-id').value;
    (id ? API.put('/api/vault/entries/' + id, data) : API.post('/api/vault/entries', data))
      .then(function () { closeModals(); loadEntries(); loadStats(); toast(id ? 'Entry updated' : 'Entry created', 'success'); confetti(); })
      .catch(function (err) { errEl.textContent = err.message; errEl.style.display = 'block'; });
  }

  // View toggle
  function restoreViewToggle() { $$('#view-toggle button').forEach(function (b) { b.classList.remove('active'); }); var a = document.querySelector('#view-toggle button[data-view="' + state.view + '"]'); if (a) a.classList.add('active'); }
  $$('#view-toggle button').forEach(function (b) { b.addEventListener('click', function () { state.view = b.dataset.view; localStorage.setItem('an_view', state.view); restoreViewToggle(); loadEntries(); }); });
  restoreViewToggle();

  // Density
  function restoreDensity() { $$('#density-toggle button').forEach(function (b) { b.classList.remove('active'); }); var a = document.querySelector('#density-toggle button[data-density="' + state.density + '"]'); if (a) a.classList.add('active'); document.documentElement.setAttribute('data-density', state.density); }
  $$('#density-toggle button').forEach(function (b) { b.addEventListener('click', function () { state.density = b.dataset.density; localStorage.setItem('an_density', state.density); restoreDensity(); loadEntries(); }); });
  restoreDensity();

  // Sort
  $('#sort-select').value = state.sort;
  $('#sort-select').addEventListener('change', function () { state.sort = this.value; loadEntries(); });

  // Event bindings
  $('#add-entry-btn').addEventListener('click', openNewEntry);
  $('#entry-form').addEventListener('submit', function (e) { e.preventDefault(); saveEntry(); });
  $('#delete-entry-btn').addEventListener('click', function () {
    var id = $('#entry-id').value;
    confirmDialog('Move to trash? You can restore it within 30 days.', 'Move to Trash', 'Move', function () {
      API.del('/api/vault/entries/' + id).then(function () { closeModals(); loadEntries(); loadStats(); toast('Moved to trash', 'success'); }).catch(function (err) { toast(err.message, 'error'); });
    });
  });

  // Multi-select actions
  $('#multiselect-clear').addEventListener('click', function () { state.selected.clear(); loadEntries(); });
  $('#multiselect-delete').addEventListener('click', function () {
    confirmDialog('Move ' + state.selected.size + ' entries to trash?', 'Bulk Delete', 'Move ' + state.selected.size, function () {
      var promises = []; state.selected.forEach(function (id) { promises.push(API.del('/api/vault/entries/' + id)); });
      Promise.all(promises).then(function () { state.selected.clear(); loadEntries(); loadStats(); toast('Entries moved to trash', 'success'); }).catch(function (err) { toast(err.message, 'error'); });
    });
  });
  $('#multiselect-pin').addEventListener('click', function () { state.selected.forEach(function (id) { localStorage.setItem('an_pin_' + id, '1'); }); loadEntries(); toast('Entries pinned', 'success'); });
  $('#multiselect-export').addEventListener('click', function () {
    var data = { entries: state.allEntries.filter(function (e) { return state.selected.has(String(e.id)); }) };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob); var a = document.createElement('a'); a.href = url; a.download = 'accessnode-selection.json'; a.click(); URL.revokeObjectURL(url);
    toast('Selection exported', 'success');
  });

  // Empty trash
  $('#empty-trash-btn').addEventListener('click', function () {
    confirmDialog('Permanently delete all items in trash?', 'Empty Trash', 'Empty', function () {
      API.post('/api/vault/entries/empty-trash').then(function () { loadEntries(); loadStats(); toast('Trash emptied', 'success'); }).catch(function (err) { toast(err.message, 'error'); });
    });
  });

  // Logout
  $('#logout-btn').addEventListener('click', function (e) { e.preventDefault(); clearTimeout(state.lockTimeout); API.post('/api/auth/logout').then(function (d) { window.location.href = d.redirect; }).catch(function () { window.location.href = '/'; }); });
  $('#theme-toggle').addEventListener('click', toggleTheme);

  // Sidebar
  $$('.sidebar-link').forEach(function (link) {
    link.addEventListener('click', function (e) {
      e.preventDefault(); state.filter = link.dataset.filter; state.category = 'all';
      $$('.sidebar-link').forEach(function (l) { l.classList.remove('active'); }); link.classList.add('active');
      $$('.category-item').forEach(function (i) { i.classList.remove('active'); }); loadEntries();
    });
  });

  // Search
  var si = $('#search-input'), cs = $('#clear-search'), st;
  si.addEventListener('input', function () { clearTimeout(st); st = setTimeout(function () { state.search = si.value.trim(); cs.style.display = state.search ? 'flex' : 'none'; loadEntries(); }, 300); });
  cs.addEventListener('click', function () { si.value = ''; state.search = ''; cs.style.display = 'none'; loadEntries(); si.focus(); });

  // Generator
  var gg = $('#gen-generate');
  $('#generator-btn').addEventListener('click', function (e) { e.preventDefault(); showModal('generator-modal'); });
  gg.addEventListener('click', function () { var pw = genPw(); var el2 = $('#generated-password'); el2.textContent = pw; el2.classList.remove('empty'); el2.style.color = pwStrength(pw).color; });
  $('#gen-copy').addEventListener('click', function () { var pw = $('#generated-password').textContent; if (pw === 'Click Generate') return; copyText(pw); toast('Password copied', 'success'); });
  $('#gen-use').addEventListener('click', function () { var pw = $('#generated-password').textContent; if (pw === 'Click Generate') return; $('#entry-password').value = pw; closeModals(); showModal('entry-modal'); toast('Password applied', 'success'); });
  $('#generated-password').addEventListener('click', function () { var pw = this.textContent; if (pw === 'Click Generate') return; copyText(pw); toast('Copied!', 'success'); });
  var gl = $('#gen-length'), glv = $('#gen-length-val');
  if (gl) gl.addEventListener('input', function () { glv.textContent = gl.value; });
  $('#gen-pass-btn').addEventListener('click', function () { showModal('generator-modal'); gg.click(); });

  // Category
  $('#add-category-btn').addEventListener('click', function () { $('#cat-name').value = ''; $('#cat-color').value = '#6366f1'; showModal('category-modal'); setTimeout(function () { $('#cat-name').focus(); }, 150); });
  $('#category-form').addEventListener('submit', function (e) { e.preventDefault(); API.post('/api/vault/categories', { name: $('#cat-name').value.trim(), color: $('#cat-color').value }).then(function () { closeModals(); loadCategories(); loadEntries(); toast('Category created', 'success'); confetti(); }).catch(function (err) { toast(err.message, 'error'); }); });

  // Import
  $('#import-btn').addEventListener('click', function () { $('#import-status').textContent = ''; showModal('import-modal'); });
  var iz = $('#import-zone'), iif = $('#import-file');
  if (iz) { iz.addEventListener('click', function () { iif.click(); }); iz.addEventListener('dragover', function (e) { e.preventDefault(); iz.classList.add('dragover'); }); iz.addEventListener('dragleave', function () { iz.classList.remove('dragover'); }); iz.addEventListener('drop', function (e) { e.preventDefault(); iz.classList.remove('dragover'); handleImport(e.dataTransfer.files[0]); }); iif.addEventListener('change', function () { if (iif.files[0]) handleImport(iif.files[0]); }); }
  function handleImport(file) {
    if (!file || !file.name.endsWith('.json')) { $('#import-status').textContent = 'Invalid file. Select a .json export.'; return; }
    var r = new FileReader(); r.onload = function (e) { try { var d = JSON.parse(e.target.result); if (!d.entries) throw Error('Bad format'); $('#import-status').textContent = 'Importing ' + d.entries.length + ' entries...'; API.post('/api/vault/import', { entries: d.entries }).then(function (res) { $('#import-status').textContent = 'Imported ' + res.imported + '. ' + (res.skipped ? res.skipped + ' skipped.' : ''); setTimeout(function () { closeModals(); loadEntries(); loadStats(); loadCategories(); }, 1500); }).catch(function (err) { $('#import-status').textContent = err.message; }); } catch (ex) { $('#import-status').textContent = 'Invalid file format.'; } }; r.readAsText(file);
  }

  // Export
  $('#export-btn').addEventListener('click', function () { API.get('/api/vault/export').then(function (d) { var b = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }); var u = URL.createObjectURL(b); var a = document.createElement('a'); a.href = u; a.download = 'accessnode-backup-' + new Date().toISOString().slice(0,10) + '.json'; a.click(); URL.revokeObjectURL(u); toast('Vault exported', 'success'); }).catch(function (err) { toast(err.message, 'error'); }); });

  // Toggle password
  $$('.toggle-password').forEach(function (b) { b.addEventListener('click', function () { var inp = $('#' + b.dataset.target); if (inp.type === 'password') { inp.type = 'text'; b.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'; } else { inp.type = 'password'; b.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'; } }); });

  function copyText(text) { if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).catch(function () { fallback(text); }); } else { fallback(text); } }
  function fallback(text) { var ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} document.body.removeChild(ta); }
  function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function escAttr(s) { return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // Keyboard
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeModals(); state.selected.clear(); loadEntries(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); si.focus(); si.select(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); openNewEntry(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'g') { e.preventDefault(); showModal('generator-modal'); gg.click(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'a' && document.activeElement !== si) { e.preventDefault(); state.allEntries.forEach(function (x) { state.selected.add(String(x.id)); }); loadEntries(); }
    if (e.key === 'Enter' && $('#modal-overlay').style.display === 'flex') { var ef = $('#entry-form'); if (ef && document.activeElement && ef.contains(document.activeElement)) { e.preventDefault(); saveEntry(); } }
  });

  // Init
  loadEntries(); loadStats(); loadCategories(); resetLockTimer();
})();
