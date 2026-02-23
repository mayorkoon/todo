import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  query,
  onSnapshot,
  doc,
  deleteDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

var firebaseConfig = {
  apiKey:            "AIzaSyDA8wZBHVMXhwb6Y7G5x3W_7bYQV6NSip8",
  authDomain:        "to-do-app-9f1b5.firebaseapp.com",
  projectId:         "to-do-app-9f1b5",
  storageBucket:     "to-do-app-9f1b5.firebasestorage.app",
  messagingSenderId: "98044565116",
  appId:             "1:98044565116:web:1e742abec84c2f77ba5bf9"
};

var firebaseApp = initializeApp(firebaseConfig);
var auth        = getAuth(firebaseApp);
var db          = getFirestore(firebaseApp);
var currentUser = null;
var unsubscribe = null;

// ── Auth gate ─────────────────────────────────────────────────
onAuthStateChanged(auth, function (user) {
  if (user) {
    currentUser = user;
    document.getElementById("authGate").style.display      = "none";
    document.getElementById("historyScreen").style.display = "block";
    document.getElementById("userEmail").textContent       = user.displayName || user.email;
    startListening();
  } else {
    window.location.href = "index.html";
  }
});

window.handleLogout = async function () {
  if (unsubscribe) unsubscribe();
  await signOut(auth);
  window.location.href = "index.html";
};

// ── Load all tasks, filter + sort done ones in JS (no index needed) ──
function startListening() {
  if (unsubscribe) unsubscribe();

  var q = query(collection(db, "users", currentUser.uid, "tasks"));

  unsubscribe = onSnapshot(q, function (snap) {
    var tasks = snap.docs
      .map(function (d) { return Object.assign({ id: d.id }, d.data()); })
      .filter(function (t) { return t.status === "done" || t.done; })
      .sort(function (a, b) {
        var aTime = (a.completedAt && a.completedAt.toMillis) ? a.completedAt.toMillis() : 0;
        var bTime = (b.completedAt && b.completedAt.toMillis) ? b.completedAt.toMillis() : 0;
        return bTime - aTime;
      });

    renderHistory(tasks);
    setSyncStatus("synced");
  }, function (err) {
    console.error("History listener error:", err);
    setSyncStatus("error");
  });
}

// ── Render grouped by completion date ─────────────────────────
function renderHistory(tasks) {
  var list = document.getElementById("historyList");

  document.getElementById("historyCount").textContent =
    tasks.length === 0 ? "No completed tasks yet." :
    tasks.length === 1 ? "1 completed task" :
    tasks.length + " completed tasks";

  if (!tasks.length) {
    list.innerHTML =
      '<div class="history-empty">' +
        '<span>✓</span>' +
        'No completed tasks yet.' +
        '<p>Tasks you mark as Done will appear here.</p>' +
      '</div>';
    return;
  }

  // Group by completion date
  var groups = {};
  tasks.forEach(function (t) {
    var dateKey = "Completed (date unknown)";
    if (t.completedAt && t.completedAt.toDate) {
      var d = t.completedAt.toDate();
      dateKey = d.toLocaleDateString([], { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    }
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(t);
  });

  list.innerHTML = Object.keys(groups).map(function (dateKey) {
    var groupTasks = groups[dateKey];
    var taskHtml = groupTasks.map(function (t) {
      var dlHtml = t.deadline
        ? '<span class="deadline">📅 ' + formatDate(t.deadline) + "</span>"
        : "";
      return (
        '<div class="task history-task done">' +
          '<div class="task-body">' +
            '<div class="task-title">' + t.title + "</div>" +
            '<div class="task-meta">' +
              '<span class="tag tag-' + t.category + '">' + t.category + "</span>" +
              dlHtml +
            "</div>" +
          "</div>" +
          '<button class="task-restore" data-action="restore" data-id="' + t.id + '" title="Move back to active">↩ Restore</button>' +
          '<button class="task-delete"  data-action="delete"  data-id="' + t.id + '" title="Delete from history">✕</button>' +
        "</div>"
      );
    }).join("");

    return (
      '<div class="history-group">' +
        '<div class="history-date"><span>' + dateKey + "</span></div>" +
        taskHtml +
      "</div>"
    );
  }).join("");

  // Attach action listeners — handles both restore and delete
  list.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-action]");
    if (!btn) return;
    if (btn.dataset.action === "restore") restoreTask(btn.dataset.id);
    if (btn.dataset.action === "delete")  deleteTask(btn.dataset.id);
  });
}

// ── Restore task back to active ───────────────────────────────
async function restoreTask(id) {
  if (!currentUser) return;
  try {
    await updateDoc(doc(db, "users", currentUser.uid, "tasks", id), {
      status:      "pending",
      done:        false,
      completedAt: null
    });
    showToast("Task restored to active!");
  } catch (e) {
    showToast("Error restoring task.");
  }
}

// ── Delete task ───────────────────────────────────────────────
async function deleteTask(id) {
  if (!currentUser) return;
  try {
    await deleteDoc(doc(db, "users", currentUser.uid, "tasks", id));
    showToast("Task removed from history.");
  } catch (e) {
    showToast("Error removing task.");
  }
}

// ── Helpers ───────────────────────────────────────────────────
function formatDate(deadline) {
  if (!deadline) return "";
  return new Date(deadline + "T00:00:00").toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function setSyncStatus(s) {
  var el  = document.getElementById("syncIndicator");
  var map = {
    synced:  ["● Synced",     "synced"],
    syncing: ["◌ Syncing...", "syncing"],
    error:   ["✕ Sync error", "error"]
  };
  el.textContent = map[s][0];
  el.className   = "sync-indicator " + map[s][1];
}

function showToast(msg) {
  var t = document.getElementById("toast");
  t.textContent   = msg;
  t.style.display = "block";
  setTimeout(function () { t.style.display = "none"; }, 3000);
}
