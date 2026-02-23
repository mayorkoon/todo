/**
 * auth-ui.js  — plain (non-module) script
 *
 * All functions called by onclick="" attributes live here so they are
 * available on window immediately, before the Firebase module loads.
 * Firebase auth calls (signIn, createUser, resetPassword) are delegated
 * to window._firebaseAuth which app.js populates once it is ready.
 */

// ── Initial page state ───────────────────────────────────────
(function initAuthUI() {
  // Show auth screen, hide app screen
  document.getElementById("authScreen").style.display = "block";
  document.getElementById("appScreen").style.display  = "none";

  // Show login form, hide reset form
  document.getElementById("authForm").style.display  = "flex";
  document.getElementById("resetForm").style.display = "none";

  // Apply login-tab defaults
  document.getElementById("nameInput").style.display     = "none";
  document.getElementById("passwordRules").style.display = "none";
  document.getElementById("forgotLink").style.display    = "block";
})();

// Set today as minimum date on both date pickers
document.addEventListener("DOMContentLoaded", function () {
  var today = new Date().toISOString().split("T")[0];
  document.getElementById("deadlineInput").min = today;
  document.getElementById("editDeadline").min  = today;
});

// ── Tab switching ────────────────────────────────────────────
function switchTab(tab) {
  var isLogin = (tab === "login");

  // Highlight correct tab
  document.getElementById("loginTab").classList.toggle("active", isLogin);
  document.getElementById("signupTab").classList.toggle("active", !isLogin);

  // Name field only on sign up
  document.getElementById("nameInput").style.display = isLogin ? "none" : "block";

  // Forgot password link only on login
  document.getElementById("forgotLink").style.display = isLogin ? "block" : "none";

  // Button text and re-enable
  document.getElementById("authSubmit").textContent = isLogin ? "Login" : "Create Account";
  document.getElementById("authSubmit").disabled    = false;

  // Clear inputs
  document.getElementById("nameInput").value     = "";
  document.getElementById("emailInput").value    = "";
  document.getElementById("passwordInput").value = "";
  document.getElementById("authError").textContent = "";

  // Hide password rules
  document.getElementById("passwordRules").style.display = "none";

  // Reset rule indicators
  var rules = {
    "rule-length":  "At least 8 characters",
    "rule-upper":   "One uppercase letter",
    "rule-number":  "One number",
    "rule-special": "One special character (!@#$%^&*)"
  };
  Object.keys(rules).forEach(function (id) {
    var el = document.getElementById(id);
    el.classList.remove("pass");
    el.textContent = "✕ " + rules[id];
  });

  // Always show auth form, hide reset form
  document.getElementById("authForm").style.display  = "flex";
  document.getElementById("resetForm").style.display = "none";
}

// ── Forgot password ──────────────────────────────────────────
function showForgotPassword() {
  document.getElementById("authForm").style.display   = "none";
  document.getElementById("resetForm").style.display  = "flex";
  document.getElementById("resetEmail").value         = "";
  document.getElementById("resetError").textContent   = "";
  document.getElementById("resetSuccess").textContent = "";
  document.getElementById("resetSubmit").textContent  = "Send Reset Link";
  document.getElementById("resetSubmit").disabled     = false;
  document.getElementById("resetEmail").focus();
}

function hideForgotPassword() {
  document.getElementById("resetForm").style.display = "none";
  document.getElementById("authForm").style.display  = "flex";
}

// ── Password rules live feedback ─────────────────────────────
document.addEventListener("DOMContentLoaded", function () {
  document.getElementById("passwordInput").addEventListener("input", function (e) {
    var isSignup = document.getElementById("signupTab").classList.contains("active");
    if (!isSignup) return;
    document.getElementById("passwordRules").style.display = "flex";
    updatePasswordRules(e.target.value);
  });
});

function updatePasswordRules(pw) {
  var checks = {
    "rule-length":  pw.length >= 8,
    "rule-upper":   /[A-Z]/.test(pw),
    "rule-number":  /[0-9]/.test(pw),
    "rule-special": /[!@#$%^&*]/.test(pw)
  };
  var labels = {
    "rule-length":  "At least 8 characters",
    "rule-upper":   "One uppercase letter",
    "rule-number":  "One number",
    "rule-special": "One special character (!@#$%^&*)"
  };
  Object.keys(checks).forEach(function (id) {
    var el = document.getElementById(id);
    el.classList.toggle("pass", checks[id]);
    el.textContent = (checks[id] ? "✓ " : "✕ ") + labels[id];
  });
}

// ── Validate email format ────────────────────────────────────
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ── Validate password strength ───────────────────────────────
function checkPassword(pw) {
  if (pw.length < 8)          return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(pw))      return "Password must include an uppercase letter.";
  if (!/[0-9]/.test(pw))      return "Password must include a number.";
  if (!/[!@#$%^&*]/.test(pw)) return "Password must include a special character (!@#$%^&*).";
  return "";
}

// ── Auth form submit ─────────────────────────────────────────
function handleAuth() {
  var isLogin  = document.getElementById("loginTab").classList.contains("active");
  var email    = document.getElementById("emailInput").value.trim();
  var password = document.getElementById("passwordInput").value;
  var name     = document.getElementById("nameInput").value.trim();
  var errEl    = document.getElementById("authError");
  var btn      = document.getElementById("authSubmit");

  errEl.textContent = "";

  if (!email)              { errEl.textContent = "Please enter your email."; return; }
  if (!isValidEmail(email)){ errEl.textContent = "Please enter a valid email address."; return; }
  if (!password)           { errEl.textContent = "Please enter your password."; return; }

  if (!isLogin) {
    if (!name) { errEl.textContent = "Please enter your name."; return; }
    var pwError = checkPassword(password);
    if (pwError) { errEl.textContent = pwError; return; }
  }

  btn.disabled = true;

  // Delegate to Firebase (set up by app.js)
  if (!window._firebaseAuth) {
    errEl.textContent = "App still loading, please try again.";
    btn.disabled = false;
    return;
  }

  window._firebaseAuth.submit(isLogin, email, password, name)
    .catch(function () { btn.disabled = false; });
}

// ── Password reset submit ────────────────────────────────────
function handlePasswordReset() {
  var email     = document.getElementById("resetEmail").value.trim();
  var errEl     = document.getElementById("resetError");
  var successEl = document.getElementById("resetSuccess");
  var btn       = document.getElementById("resetSubmit");

  errEl.textContent     = "";
  successEl.textContent = "";

  if (!email)               { errEl.textContent = "Please enter your email."; return; }
  if (!isValidEmail(email)) { errEl.textContent = "Please enter a valid email address."; return; }

  btn.disabled = true;

  if (!window._firebaseAuth) {
    errEl.textContent = "App still loading, please try again.";
    btn.disabled = false;
    return;
  }

  window._firebaseAuth.resetPassword(email)
    .then(function () {
      successEl.textContent = "✓ Reset link sent! Check your inbox.";
      btn.textContent       = "Sent!";
    })
    .catch(function (msg) {
      errEl.textContent = msg;
      btn.disabled      = false;
    });
}
