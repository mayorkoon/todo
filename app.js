// ── Firebase imports ─────────────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getMessaging,
  getToken,
  onMessage
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js";

// ── Config ───────────────────────────────────────────────────
var firebaseConfig = {
  apiKey:            "AIzaSyDA8wZBHVMXhwb6Y7G5x3W_7bYQV6NSip8",
  authDomain:        "to-do-app-9f1b5.firebaseapp.com",
  projectId:         "to-do-app-9f1b5",
  storageBucket:     "to-do-app-9f1b5.firebasestorage.app",
  messagingSenderId: "98044565116",
  appId:             "1:98044565116:web:1e742abec84c2f77ba5bf9"
};
var VAPID_KEY = "BPdFXWgCofHxznSFu79bbDBmzFG9dCbZ2tztbn1ubw-TuSWkZjy3v07L6caYoYKTH-PDr3GglUxnQDsUvoJ3a-E";

var firebaseApp = initializeApp(firebaseConfig);
var auth        = getAuth(firebaseApp);
var db          = getFirestore(firebaseApp);
var messaging   = getMessaging(firebaseApp);

// ── State ────────────────────────────────────────────────────
var tasks         = [];
var filter        = "all";
var currentUser   = null;
var unsubscribe   = null;
var editingTaskId = null;
var reminderTimers = {};

// ────────────────────────────────────────────────────────────
// Bridge object: auth-ui.js (plain script) calls these to
// perform Firebase operations without needing module imports.
// ────────────────────────────────────────────────────────────
window._firebaseAuth = {
  submit: async function (isLogin, email, password, name) {
    var errEl = document.getElementById("authError");
    var btn   = document.getElementById("authSubmit");
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        var cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, { displayName: name });
      }
    } catch (e) {
      errEl.textContent = friendlyAuthError(e.code);
      btn.disabled = false;
      throw e;
    }
  },

  resetPassword: async function (email) {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (e) {
      var msg = (e.code === "auth/user-not-found")
        ? "No account found with this email."
        : "Something went wrong. Please try again.";
      throw msg;
    }
  }
};

function friendlyAuthError(code) {
  var map = {
    "auth/invalid-email":        "Invalid email address.",
    "auth/user-not-found":       "No account found with this email.",
    "auth/wrong-password":       "Incorrect password.",
    "auth/email-already-in-use": "An account with this email already exists.",
    "auth/weak-password":        "Password must be at least 6 characters.",
    "auth/invalid-credential":   "Incorrect email or password.",
    "auth/too-many-requests":    "Too many attempts. Please try again later."
  };
  return map[code] || "Something went wrong. Please try again.";
}

// ── Auth state listener ──────────────────────────────────────
onAuthStateChanged(auth, function (user) {
  if (user) {
    currentUser = user;
    document.getElementById("authScreen").style.display = "none";
    document.getElementById("appScreen").style.display  = "block";
    document.getElementById("userEmail").textContent    = user.displayName || user.email;
    startListening();
    updateDateDisplay();
    setupNotifications(user);
  } else {
    currentUser = null;
    document.getElementById("authScreen").style.display = "block";
    document.getElementById("appScreen").style.display  = "none";
    document.getElementById("authForm").style.display   = "flex";
    document.getElementById("resetForm").style.display  = "none";
    document.getElementById("authSubmit").disabled      = false;
    document.getElementById("authSubmit").textContent   = "Login";
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    tasks = [];
    Object.keys(reminderTimers).forEach(function (k) { clearTimeout(reminderTimers[k]); delete reminderTimers[k]; });
  }
});

window.handleLogout = async function () {
  await signOut(auth);
  filter = "all";
  document.querySelectorAll(".filter-btn").forEach(function (b, i) {
    b.classList.toggle("active", i === 0);
  });
};

// ── Push notifications ───────────────────────────────────────
async function setupNotifications(user) {
  try {
    var permission = await Notification.requestPermission();
    if (permission !== "granted") return;
    var reg   = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    var token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
    if (token) {
      await setDoc(doc(db, "users", user.uid, "fcmTokens", token), {
        token: token, createdAt: serverTimestamp()
      });
    }
  } catch (err) {
    console.error("Notification setup error:", err);
  }
}

onMessage(messaging, function (payload) {
  showToast("🔔 " + payload.notification.title + ": " + payload.notification.body);
});

function scheduleReminder(task) {
  if (!task.deadline || task.status === "done") return;
  cancelReminder(task.id);
  var now = Date.now();
  var db  = new Date(task.deadline + "T08:00:00");
  var dy  = new Date(task.deadline + "T08:00:00");
  db.setDate(db.getDate() - 1);
  var d1 = db.getTime() - now;
  var d2 = dy.getTime() - now;
  if (d1 > 0) reminderTimers[task.id + "_b"] = setTimeout(function () { showBrowserNotification("Due Tomorrow 📅", '"' + task.title + '" is due tomorrow!'); }, d1);
  if (d2 > 0) reminderTimers[task.id + "_d"] = setTimeout(function () { showBrowserNotification("Due Today ⏰",    '"' + task.title + '" is due today!'); }, d2);
}

function cancelReminder(id) {
  clearTimeout(reminderTimers[id + "_b"]);
  clearTimeout(reminderTimers[id + "_d"]);
  delete reminderTimers[id + "_b"];
  delete reminderTimers[id + "_d"];
}

function showBrowserNotification(title, body) {
  if (Notification.permission !== "granted") return;
  new Notification(title, { body: body, icon: "/icons/icon-192.png", tag: "todo-reminder", requireInteraction: true });
}

// ── Firestore listener ───────────────────────────────────────
function startListening() {
  if (unsubscribe) unsubscribe();
  var q = query(collection(db, "users", currentUser.uid, "tasks"), orderBy("createdAt", "desc"));
  unsubscribe = onSnapshot(q, function (snap) {
    tasks = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
    renderTasks();
    updateStats();
    setSyncStatus("synced");
    tasks.forEach(function (t) { if (t.status !== "done" && t.deadline) scheduleReminder(t); });
  }, function () { setSyncStatus("error"); });
}

window.addTask = async function () {
  var title = document.getElementById("taskInput").value.trim();
  if (!title || !currentUser) { showToast("Please enter a task!"); return; }
  var btn = document.getElementById("addBtn");
  btn.disabled = true;
  setSyncStatus("syncing");
  try {
    await addDoc(collection(db, "users", currentUser.uid, "tasks"), {
      title:     title,
      category:  document.getElementById("categorySelect").value,
      deadline:  document.getElementById("deadlineInput").value,
      status:    "pending",
      done:      false,
      createdAt: serverTimestamp()
    });
    document.getElementById("taskInput").value     = "";
    document.getElementById("deadlineInput").value = "";
    showToast("Task added!");
  } catch (e) {
    showToast("Error adding task.");
    setSyncStatus("error");
  } finally {
    btn.disabled = false;
  }
};

async function deleteTask(id) {
  if (!currentUser) return;
  cancelReminder(id);
  setSyncStatus("syncing");
  try { await deleteDoc(doc(db, "users", currentUser.uid, "tasks", id)); showToast("Task deleted."); }
  catch (e) { setSyncStatus("error"); }
}

async function changeStatus(id, newStatus) {
  if (!currentUser) return;
  if (newStatus === "done") cancelReminder(id);
  setSyncStatus("syncing");
  var update = { status: newStatus, done: newStatus === "done" };
  if (newStatus === "done") update.completedAt = serverTimestamp();
  try { await updateDoc(doc(db, "users", currentUser.uid, "tasks", id), update); }
  catch (e) { setSyncStatus("error"); }
}

// ── Filtering ────────────────────────────────────────────────
window.setFilter = function (f, btn) {
  filter = f;
  document.querySelectorAll(".filter-btn").forEach(function (b) { b.classList.remove("active"); });
  btn.classList.add("active");
  renderTasks();
};

// ── Rendering ────────────────────────────────────────────────
function getDeadlineStatus(deadline) {
  if (!deadline) return null;
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var dl    = new Date(deadline + "T00:00:00");
  var diff  = (dl - today) / 86400000;
  if (diff < 0)  return "overdue";
  if (diff <= 1) return "soon";
  return "ok";
}

function formatDeadline(deadline) {
  if (!deadline) return "";
  return new Date(deadline + "T00:00:00").toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function renderTasks() {
  var list = document.getElementById("taskList");
  // Main view never shows done tasks — they live in history.html
  var active = tasks.filter(function (t) { return t.status !== "done" && !t.done; });
  var filtered = active.filter(function (t) {
    if (filter === "all")        return true;
    if (filter === "pending")    return t.status === "pending" || !t.status;
    if (filter === "inprogress") return t.status === "inprogress";
    return t.category === filter;
  });

  if (!filtered.length) {
    list.innerHTML = '<div class="empty"><span>✦</span>No tasks here yet.</div>';
    return;
  }

  list.innerHTML = filtered.map(function (t) {
    var dlSt     = getDeadlineStatus(t.deadline);
    var dlClass  = dlSt === "overdue" ? "overdue" : dlSt === "soon" ? "soon" : "";
    var dot      = (dlSt === "overdue" || dlSt === "soon") && t.status !== "done"
      ? '<div class="reminder-dot" title="' + (dlSt === "overdue" ? "Overdue!" : "Due soon!") + '"></div>' : "";
    var tStatus  = t.status || (t.done ? "done" : "pending");
    var tClass   = tStatus === "done" ? "done" : tStatus === "inprogress" ? "inprogress" : "";
    var dlHtml   = t.deadline ? '<span class="deadline ' + dlClass + '">📅 ' + formatDeadline(t.deadline) + "</span>" : "";

    return '<div class="task ' + tClass + '">' +
      '<div class="task-body">' +
        '<div class="task-title">' + t.title + "</div>" +
        '<div class="task-meta">' +
          '<span class="tag tag-' + t.category + '">' + t.category + "</span>" +
          dlHtml + dot +
        "</div>" +
      "</div>" +
      '<button class="task-edit"     data-action="edit"   data-id="' + t.id + '">Edit</button>' +
      '<select class="status-select" data-action="status" data-id="' + t.id + '">' +
        '<option value="pending"    ' + (tStatus === "pending"    ? "selected" : "") + ">Pending</option>" +
        '<option value="inprogress" ' + (tStatus === "inprogress" ? "selected" : "") + ">In Progress</option>" +
        '<option value="done"       ' + (tStatus === "done"       ? "selected" : "") + ">Done</option>" +
      "</select>" +
      '<button class="task-delete" data-action="delete" data-id="' + t.id + '">✕</button>' +
    "</div>";
  }).join("");
}

function updateStats() {
  var active = tasks.filter(function (t) { return t.status !== "done" && !t.done; });
  var done   = tasks.filter(function (t) { return t.status === "done" || t.done; }).length;
  var inp    = active.filter(function (t) { return t.status === "inprogress"; }).length;
  var pend   = active.filter(function (t) { return t.status === "pending" || !t.status; }).length;
  document.getElementById("statTotal").textContent      = active.length;
  document.getElementById("statDone").textContent       = done;
  document.getElementById("statInProgress").textContent = inp;
  document.getElementById("statPending").textContent    = pend;
}

// ── Edit modal ───────────────────────────────────────────────
function openEditModal(id) {
  var task = tasks.find(function (t) { return t.id === id; });
  if (!task) return;
  editingTaskId = id;
  document.getElementById("editTitle").value    = task.title;
  document.getElementById("editCategory").value = task.category;
  document.getElementById("editDeadline").value = task.deadline || "";
  document.getElementById("modalOverlay").style.display = "block";
  document.getElementById("editModal").style.display    = "block";
  document.getElementById("editTitle").focus();
}

function closeModal() {
  document.getElementById("modalOverlay").style.display = "none";
  document.getElementById("editModal").style.display    = "none";
  editingTaskId = null;
}

async function saveEdit() {
  if (!editingTaskId || !currentUser) return;
  var title = document.getElementById("editTitle").value.trim();
  if (!title) { showToast("Title can't be empty."); return; }
  var btn = document.getElementById("modalSaveBtn");
  btn.disabled = true;
  setSyncStatus("syncing");
  try {
    await updateDoc(doc(db, "users", currentUser.uid, "tasks", editingTaskId), {
      title:    title,
      category: document.getElementById("editCategory").value,
      deadline: document.getElementById("editDeadline").value
    });
    showToast("Task updated!");
    closeModal();
  } catch (e) {
    showToast("Error saving changes.");
    setSyncStatus("error");
  } finally {
    btn.disabled = false;
  }
}

// ── UI helpers ───────────────────────────────────────────────
function setSyncStatus(s) {
  var el  = document.getElementById("syncIndicator");
  var map = { synced: ["● Synced", "synced"], syncing: ["◌ Syncing...", "syncing"], error: ["✕ Sync error", "error"] };
  el.textContent = map[s][0];
  el.className   = "sync-indicator " + map[s][1];
}

function showToast(msg) {
  var t = document.getElementById("toast");
  t.textContent   = msg;
  t.style.display = "block";
  setTimeout(function () { t.style.display = "none"; }, 3000);
}

function updateDateDisplay() {
  var now = new Date();
  document.getElementById("dateDisplay").innerHTML =
    now.toLocaleDateString([], { weekday: "long" }) + "<br>" +
    now.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
}

// ── Event listeners ──────────────────────────────────────────
document.getElementById("taskInput").addEventListener("keydown", function (e) {
  if (e.key === "Enter") window.addTask();
});

document.getElementById("taskList").addEventListener("click", function (e) {
  var el = e.target.closest("[data-action]");
  if (!el) return;
  if (el.dataset.action === "edit")   openEditModal(el.dataset.id);
  if (el.dataset.action === "delete") deleteTask(el.dataset.id);
});

document.getElementById("taskList").addEventListener("change", function (e) {
  var el = e.target.closest("[data-action='status']");
  if (el) changeStatus(el.dataset.id, el.value);
});

document.getElementById("modalOverlay").addEventListener("click", closeModal);
document.getElementById("modalCloseBtn").addEventListener("click", closeModal);
document.getElementById("modalCancelBtn").addEventListener("click", closeModal);
document.getElementById("modalSaveBtn").addEventListener("click", saveEdit);
document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });
