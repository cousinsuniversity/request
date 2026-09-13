// ==================== FIREBASE INITIALIZATION ====================
const firebaseConfig = {
  apiKey: "AIzaSyDhE0CtfujSQoTjVTD7uNJXrEFaNyp4hzQ",
  authDomain: "school-enrollment-system-356e2.firebaseapp.com",
  databaseURL: "https://school-enrollment-system-356e2-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "school-enrollment-system-356e2",
  storageBucket: "school-enrollment-system-356e2.firebasestorage.app",
  messagingSenderId: "445983385148",
  appId: "1:445983385148:web:55a608ebb987e2c7c94539"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const auth = firebase.auth();
const storage = firebase.storage();

// Database references
const studentsRef = database.ref('students');
const usersRef = database.ref('users');
const applicationsRef = database.ref('applications');
const enrollmentsRef = database.ref('enrollments');
const subjectsRef = database.ref('subjects');
const coursesRef = database.ref('courses');
const gradesRef = database.ref('grades');
const paymentsRef = database.ref('payments');
const settingsRef = database.ref('settings');

// Dedicated refs for this portal
const torRequestsRef = database.ref('tor_requests');
const transferRequestsRef = database.ref('transfer_requests');

let currentUser = null;
let currentUserProfile = null;
let myRequestsListener = null;

// ==================== DOM ELEMENTS ====================
const loginSection = document.getElementById('loginSection');
const appSection = document.getElementById('appSection');
const logoutBtn = document.getElementById('logoutBtn');
const userBadge = document.getElementById('userBadge');
const loginBtn = document.getElementById('loginBtn');
const loginEmail = document.getElementById('loginEmail');
const loginPassword = document.getElementById('loginPassword');
const loginMessage = document.getElementById('loginMessage');

// Tab elements
const tabs = document.querySelectorAll('.tab');
const torTab = document.getElementById('torTab');
const transferTab = document.getElementById('transferTab');
const myRequestsTab = document.getElementById('myRequestsTab');

// Form buttons
const submitTorBtn = document.getElementById('submitTorBtn');
const submitTransferBtn = document.getElementById('submitTransferBtn');

// ==================== UTILITY FUNCTIONS ====================
function showMessage(elementId, text, type) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.innerHTML = `<div class="message ${type}">${escapeHtml(text)}</div>`;
  setTimeout(() => {
    if (el) el.innerHTML = '';
  }, 6000);
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function val(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

function clearForm(ids) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

function formatDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleString();
}

// ==================== AUTH ====================
loginBtn.addEventListener('click', handleLogin);
loginPassword.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') handleLogin();
});

async function handleLogin() {
  const email = loginEmail.value.trim();
  const password = loginPassword.value;

  if (!email || !password) {
    showMessage('loginMessage', 'Please enter both email and password.', 'error');
    return;
  }

  loginBtn.disabled = true;
  loginBtn.textContent = 'Signing in...';

  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    console.error('Login error:', err);
    let msg = 'Login failed. ';
    if (err.code === 'auth/user-not-found') msg += 'No account found with that email.';
    else if (err.code === 'auth/wrong-password') msg += 'Incorrect password.';
    else if (err.code === 'auth/invalid-email') msg += 'Invalid email format.';
    else if (err.code === 'auth/too-many-requests') msg += 'Too many attempts. Try again later.';
    else msg += err.message;
    showMessage('loginMessage', msg, 'error');
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Sign In';
  }
}

logoutBtn.addEventListener('click', async () => {
  if (myRequestsListener) {
    myRequestsListener.off();
    myRequestsListener = null;
  }
  await auth.signOut();
});

auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    loginSection.classList.add('hidden');
    appSection.classList.remove('hidden');
    logoutBtn.classList.remove('hidden');
    userBadge.textContent = user.email;

    // Try to load user profile from 'users' node
    try {
      const snap = await usersRef.child(user.uid).once('value');
      if (snap.exists()) {
        currentUserProfile = snap.val();
        const name = currentUserProfile.fullName || currentUserProfile.name || user.email;
        userBadge.textContent = `${name} (${user.email})`;
      }
    } catch (e) {
      console.warn('Could not load user profile:', e);
    }

    // Auto-fill student ID if available
    if (currentUserProfile) {
      const sid = currentUserProfile.studentId || currentUserProfile.studentID || '';
      const sname = currentUserProfile.fullName || currentUserProfile.name || '';
      if (sid) {
        const t1 = document.getElementById('torStudentId');
        const t2 = document.getElementById('trStudentId');
        if (t1 && !t1.value) t1.value = sid;
        if (t2 && !t2.value) t2.value = sid;
      }
      if (sname) {
        const n1 = document.getElementById('torFullName');
        const n2 = document.getElementById('trFullName');
        if (n1 && !n1.value) n1.value = sname;
        if (n2 && !n2.value) n2.value = sname;
      }
    }

    loadMyRequests();
  } else {
    currentUser = null;
    currentUserProfile = null;
    loginSection.classList.remove('hidden');
    appSection.classList.add('hidden');
    logoutBtn.classList.add('hidden');
    if (myRequestsListener) {
      myRequestsListener.off();
      myRequestsListener = null;
    }
  }
});

// ==================== TABS ====================
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const target = tab.dataset.tab;
    torTab.classList.add('hidden');
    transferTab.classList.add('hidden');
    myRequestsTab.classList.add('hidden');
    if (target === 'tor') torTab.classList.remove('hidden');
    else if (target === 'transfer') transferTab.classList.remove('hidden');
    else if (target === 'myrequests') {
      myRequestsTab.classList.remove('hidden');
      loadMyRequests();
    }
  });
});

// ==================== TOR SUBMISSION ====================
submitTorBtn.addEventListener('click', async () => {
  if (!currentUser) {
    showMessage('torMessage', 'You must be logged in.', 'error');
    return;
  }

  const data = {
    studentId: val('torStudentId'),
    fullName: val('torFullName'),
    course: val('torCourse'),
    yearLevel: val('torYearLevel'),
    copies: val('torCopies'),
    purpose: val('torPurpose'),
    contact: val('torContact')
  };

  if (!data.studentId || !data.fullName || !data.course || !data.yearLevel || !data.purpose || !data.contact) {
    showMessage('torMessage', 'Please fill in all required fields.', 'error');
    return;
  }

  submitTorBtn.disabled = true;
  submitTorBtn.textContent = 'Submitting...';

  try {
    const newRef = torRequestsRef.push();
    await newRef.set({
      requestId: newRef.key,
      type: 'TOR',
      ...data,
      copies: parseInt(data.copies) || 1,
      status: 'pending',
      requestedBy: currentUser.uid,
      requestedByEmail: currentUser.email,
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      updatedAt: firebase.database.ServerValue.TIMESTAMP
    });

    showMessage('torMessage', 'TOR request submitted successfully! Please wait for approval from the registrar.', 'success');
    clearForm(['torStudentId', 'torCourse', 'torYearLevel', 'torCopies', 'torPurpose', 'torContact']);
    document.getElementById('torCopies').value = '1';
    if (currentUserProfile) {
      const sid = currentUserProfile.studentId || '';
      const sname = currentUserProfile.fullName || currentUserProfile.name || '';
      if (sid) document.getElementById('torStudentId').value = sid;
      if (sname) document.getElementById('torFullName').value = sname;
    }
    loadMyRequests();
  } catch (err) {
    console.error('TOR submit error:', err);
    showMessage('torMessage', 'Failed to submit: ' + err.message, 'error');
  } finally {
    submitTorBtn.disabled = false;
    submitTorBtn.textContent = 'Submit TOR Request';
  }
});

// ==================== TRANSFER SUBMISSION ====================
submitTransferBtn.addEventListener('click', async () => {
  if (!currentUser) {
    showMessage('transferMessage', 'You must be logged in.', 'error');
    return;
  }

  const data = {
    studentId: val('trStudentId'),
    fullName: val('trFullName'),
    currentCourse: val('trCurrentCourse'),
    yearLevel: val('trYearLevel'),
    destinationSchool: val('trDestSchool'),
    destinationCourse: val('trDestCourse'),
    reason: val('trReason'),
    contact: val('trContact')
  };

  if (!data.studentId || !data.fullName || !data.currentCourse || !data.yearLevel ||
      !data.destinationSchool || !data.destinationCourse || !data.reason || !data.contact) {
    showMessage('transferMessage', 'Please fill in all required fields.', 'error');
    return;
  }

  submitTransferBtn.disabled = true;
  submitTransferBtn.textContent = 'Submitting...';

  try {
    const newRef = transferRequestsRef.push();
    await newRef.set({
      requestId: newRef.key,
      type: 'TRANSFER',
      ...data,
      status: 'pending',
      requestedBy: currentUser.uid,
      requestedByEmail: currentUser.email,
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      updatedAt: firebase.database.ServerValue.TIMESTAMP
    });

    showMessage('transferMessage', 'Transfer request submitted successfully! Please wait for approval.', 'success');
    clearForm(['trStudentId', 'trCurrentCourse', 'trYearLevel', 'trDestSchool', 'trDestCourse', 'trReason', 'trContact']);
    if (currentUserProfile) {
      const sid = currentUserProfile.studentId || '';
      const sname = currentUserProfile.fullName || currentUserProfile.name || '';
      if (sid) document.getElementById('trStudentId').value = sid;
      if (sname) document.getElementById('trFullName').value = sname;
    }
    loadMyRequests();
  } catch (err) {
    console.error('Transfer submit error:', err);
    showMessage('transferMessage', 'Failed to submit: ' + err.message, 'error');
  } finally {
    submitTransferBtn.disabled = false;
    submitTransferBtn.textContent = 'Submit Transfer Request';
  }
});

// ==================== LOAD MY REQUESTS ====================
function loadMyRequests() {
  if (!currentUser) return;
  const listEl = document.getElementById('myRequestsList');
  listEl.innerHTML = '<div class="loading">Loading your requests...</div>';

  if (myRequestsListener) myRequestsListener.off();

  Promise.all([
    torRequestsRef.orderByChild('requestedBy').equalTo(currentUser.uid).once('value'),
    transferRequestsRef.orderByChild('requestedBy').equalTo(currentUser.uid).once('value')
  ]).then(([torSnap, trSnap]) => {
    const items = [];
    torSnap.forEach(c => items.push(c.val()));
    trSnap.forEach(c => items.push(c.val()));

    items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    if (items.length === 0) {
      listEl.innerHTML = '<div class="loading">You have no requests yet.</div>';
      return;
    }

    listEl.innerHTML = items.map(it => {
      const title = it.type === 'TOR'
        ? `Transcript of Records (${it.copies || 1} ${it.copies == 1 ? 'copy' : 'copies'})`
        : `Transfer to ${escapeHtml(it.destinationSchool || 'N/A')}`;
      const status = (it.status || 'pending').toLowerCase();
      const remarks = it.remarks ? `<br><small><strong>Remarks:</strong> ${escapeHtml(it.remarks)}</small>` : '';
      return `
        <div class="request-item">
          <div class="request-info">
            <strong>${escapeHtml(title)}</strong>
            <small>Submitted: ${formatDate(it.createdAt)}</small>
            ${remarks}
          </div>
          <span class="status ${status}">${escapeHtml(status)}</span>
        </div>
      `;
    }).join('');
  }).catch(err => {
    console.error('Load requests error:', err);
    listEl.innerHTML = `<div class="message error">Failed to load requests: ${escapeHtml(err.message)}</div>`;
  });
}
