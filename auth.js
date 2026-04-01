// ─── Supabase Config ──────────────────────────────────────────
const SUPABASE_URL = "https://pjofdeahwogiekwwaylh.supabase.co";
const SUPABASE_KEY = "sb_publishable_XfzNozXAtnBwB9fPFiPHqQ_dC_LlR9e";

const { createClient } = supabase;
const _supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Theme ────────────────────────────────────────────────────
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('tf-theme', theme);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
}

(function () {
    const saved = localStorage.getItem('tf-theme') || 'dark';
    applyTheme(saved);
})();

// ─── Get current session token ────────────────────────────────
async function getAuthToken() {
    const { data: { session } } = await _supabase.auth.getSession();
    return session?.access_token || null;
}

// ─── Sign in with Google ──────────────────────────────────────
async function signInWithGoogle() {
    const { error } = await _supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: 'https://mylistify.vercel.app/index.html'
        }
    });
    if (error) showToast('Google sign-in failed. Try again.', 'error');
}

// ─── Send Magic Link ──────────────────────────────────────────
async function sendMagicLink() {
    const email = document.getElementById('emailInput')?.value.trim();
    if (!email) {
        showToast('Please enter your email address.', 'error');
        return;
    }

    const btn = document.getElementById('magicBtn');
    btn.textContent = 'Sending...';
    btn.disabled = true;

    const { error } = await _supabase.auth.signInWithOtp({
        email,
        options: {
            emailRedirectTo: window.location.origin + '/index.html'
        }
    });

    if (error) {
        showToast('Failed to send magic link. Try again.', 'error');
        btn.textContent = 'Send Magic Link';
        btn.disabled = false;
    } else {
        document.getElementById('magicSuccess').style.display = 'flex';
        btn.style.display = 'none';
    }
}

// ─── Sign out ─────────────────────────────────────────────────
async function signOut() {
    await _supabase.auth.signOut();
    window.location.href = 'login.html';
}

// ─── Route guard ──────────────────────────────────────────────
// On index.html → redirect to login if not authenticated
// On login.html → redirect to app if already authenticated
(async function routeGuard() {
    const { data: { session } } = await _supabase.auth.getSession();
    const isLoginPage = window.location.pathname.includes('login');

    if (!session && !isLoginPage) {
        window.location.href = 'login.html';
        return;
    }

    if (session && isLoginPage) {
        window.location.href = 'index.html';
        return;
    }

    // If on app page and logged in, show user info
    if (session && !isLoginPage) {
        const user = session.user;
        const emailEl  = document.getElementById('userEmail');
        const avatarEl = document.getElementById('userAvatar');

        if (emailEl) emailEl.textContent = user.email || user.user_metadata?.full_name || 'User';
        if (avatarEl) {
            const name = user.email || user.user_metadata?.full_name || '?';
            avatarEl.textContent = name[0].toUpperCase();
        }
    }
})();

// ─── Toast (shared) ───────────────────────────────────────────
function showToast(message, type = "info") {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.style.opacity   = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';
    });

    setTimeout(() => {
        toast.style.opacity   = '0';
        toast.style.transform = 'translateX(-50%) translateY(10px)';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}
