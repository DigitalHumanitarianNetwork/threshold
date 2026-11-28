/* Threshold admin area. Sign-in with Google, every action checked by the
   Apps Script go-between against the Allowlist tab of the private sheet. */
var THR_CLIENT_ID = '410104533080-hf6usfgcbdcjaho8f70sbokssjcp0k90.apps.googleusercontent.com';
var THR_API = 'https://script.google.com/macros/s/AKfycbzYTbvqBkUhDG-bjU3LYGXAIH00VSvWkFfcv6VLw2bJOnwjEv9VWaIl_0nzD-p1sokUlQ/exec'; // /exec URL of the deployed go-between

function thrToken() { return sessionStorage.getItem('thr_token') || ''; }

function thrApi(action, data) {
  var body = { action: action, token: thrToken() };
  if (data) for (var k in data) body[k] = data[k];
  return fetch(THR_API, { method: 'POST', body: JSON.stringify(body) }).then(function (r) { return r.json(); });
}

function thrSignOut() {
  sessionStorage.removeItem('thr_token');
  if (window.google && google.accounts) google.accounts.id.disableAutoSelect();
  location.href = 'login.html';
}

function thrMsg(el, text, isErr) {
  el.textContent = text;
  el.style.color = isErr ? '#c8102e' : '#0c7d7d';
}

/* Page guard: needs a valid token and one of the given roles.
   Fills the who-bar. Returns a promise of {email, name, role}. */
function thrGuard(roles) {
  if (!thrToken()) { location.href = 'login.html'; return new Promise(function () {}); }
  return thrApi('whoami').then(function (r) {
    if (r.error === 'invalid_token') { sessionStorage.removeItem('thr_token'); location.href = 'login.html'; throw new Error('redirect'); }
    if (r.error) throw new Error(r.error);
    if (roles.indexOf(r.role) < 0) {
      document.body.innerHTML = '<div class="tbar"><div class="wrap tbar-in"><a class="tmark" href="login.html">Threshold <span>Evaluations</span> <span class="alpha-badge">alpha</span></a></div></div>' +
        '<section class="asect"><div class="wrap"><h1 class="ah1">Waiting for approval</h1>' +
        '<p class="alead">Your account <b>' + r.email + '</b> is on the list as <b>pending</b>. An admin has been emailed. You will get in once they change your role to editor or admin.</p>' +
        '<p class="alead"><a href="login.html">Back to sign in</a></p></div></section>';
      throw new Error('pending');
    }
    var who = document.getElementById('who-name');
    if (who) {
      who.innerHTML = '';
      who.appendChild(document.createTextNode(r.name || r.email));
      var chip = document.createElement('span');
      chip.className = 'role-chip' + (r.role === 'editor' ? ' editor' : '');
      chip.textContent = r.role.charAt(0).toUpperCase() + r.role.slice(1);
      who.appendChild(chip);
    }
    var so = document.getElementById('signout');
    if (so) so.onclick = function (e) { e.preventDefault(); thrSignOut(); };
    return r;
  });
}

/* Login page: render the Google button, handle the credential. */
function thrInitLogin(buttonEl, waitEl, msgEl) {
  var tries = 0;
  function init() {
    if (window.google && google.accounts && google.accounts.id) {
      google.accounts.id.initialize({
        client_id: THR_CLIENT_ID,
        callback: function (resp) {
          sessionStorage.setItem('thr_token', resp.credential);
          thrMsg(msgEl, 'Checking your access...', false);
          thrApi('whoami').then(function (r) {
            if (r.error === 'invalid_token') { sessionStorage.removeItem('thr_token'); thrMsg(msgEl, 'Sign-in could not be verified. Please try again.', true); return; }
            if (r.error) { thrMsg(msgEl, 'Something went wrong. Please try again.', true); return; }
            if (r.role === 'pending') { thrMsg(msgEl, 'Signed in as ' + r.email + '. Your access is pending: an admin has been emailed to approve you.', true); return; }
            location.href = 'admin.html';
          }).catch(function () { thrMsg(msgEl, 'Could not reach the access check. Please try again.', true); });
        },
        use_fedcm_for_prompt: true,
      });
      google.accounts.id.renderButton(buttonEl, { theme: 'outline', size: 'large', shape: 'pill', text: 'signin_with', width: 320 });
      waitEl.classList.add('hidden');
    } else if (tries++ < 50) {
      setTimeout(init, 200);
    } else {
      waitEl.textContent = 'Google sign-in could not load. Check your connection and reload.';
    }
  }
  init();
}
