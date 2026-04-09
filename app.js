const API_URL = "https://localhost:7071/api/home";

// ─── Authenticated fetch helper ───────────────────────────────
async function authFetch(url, options = {}) {
    const token = await getAuthToken();
    if (!token) {
        window.location.href = 'login.html';
        return null;
    }

    return fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...(options.headers || {})
        }
    });
}

// ─── UI State ─────────────────────────────────────────────────
function updateUI(tasks) {
    const total   = tasks.length;
    const done    = tasks.filter(t => t.isDone).length;
    const pending = total - done;
    const pct     = total === 0 ? 0 : Math.round((done / total) * 100);

    document.getElementById('totalCount').textContent    = total;
    document.getElementById('doneCount').textContent     = done;
    document.getElementById('pendingCount').textContent  = pending;
    document.getElementById('progressFill').style.width  = pct + '%';
    document.getElementById('progressLabel').textContent = pct + '%';

    document.getElementById('emptyState').style.display = total === 0 ? 'flex' : 'none';
    document.getElementById('clearBtn').style.display   = done > 0   ? 'inline' : 'none';
}

// ─── Due date helper ──────────────────────────────────────────
function getDueBadge(dueDate) {
    if (!dueDate) return '';
    const due = new Date(dueDate);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
    const diffDays = Math.round((dueDay - today) / (1000 * 60 * 60 * 24));

    let label, cls;
    if (diffDays < 0) {
        label = `Overdue by ${Math.abs(diffDays)}d`;
        cls = 'overdue';
    } else if (diffDays === 0) {
        label = 'Due today';
        cls = 'today';
    } else if (diffDays === 1) {
        label = 'Due tomorrow';
        cls = 'future';
    } else if (diffDays <= 7) {
        label = `Due in ${diffDays}d`;
        cls = 'future';
    } else {
        const options = { month: 'short', day: 'numeric' };
        label = due.toLocaleDateString('en-US', options);
        cls = 'future';
    }

    return { label, cls };
}

// ─── 1. Load tasks ────────────────────────────────────────────
async function loadTasks() {
    try {
        const res = await authFetch(API_URL);
        if (!res) return;
        if (!res.ok) throw new Error(`Server error: ${res.status}`);

        const tasks = await res.json();
        const list  = document.getElementById('myUL');
        list.innerHTML = '';

        // Sort by priority: High first, then Medium, then Low
        const priorityOrder = { 'High': 0, 'Medium': 1, 'Low': 2 };
        tasks.sort((a, b) => {
            const pa = priorityOrder[a.priority] ?? 1;
            const pb = priorityOrder[b.priority] ?? 1;
            return pa - pb;
        });

        tasks.forEach(task => {
            const li = document.createElement('li');
            if (task.isDone) li.classList.add('checked');
            const priority = task.priority || 'Medium';
            const priorityClass = priority.toLowerCase();

            // Due date badge
            const dueBadge = getDueBadge(task.dueDate);
            if (dueBadge) {
                if (dueBadge.cls === 'overdue' && !task.isDone) li.classList.add('overdue');
                if (dueBadge.cls === 'today' && !task.isDone) li.classList.add('due-today');
            }

            li.innerHTML = `
                <div class="task-check" onclick="toggleTask(${task.id})" title="Toggle complete">
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                        <path d="M1.5 5.5L4.5 8.5L9.5 2.5" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </div>
                <span class="task-text" onclick="toggleTask(${task.id})">${escapeHTML(task.title)}</span>
                ${dueBadge ? `<span class="due-badge ${dueBadge.cls}">${dueBadge.label}</span>` : ''}
                <span class="priority-badge ${priorityClass}">${priority}</span>
                <button class="delete-btn" onclick="deleteTask(${task.id})" title="Delete" aria-label="Delete task">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M1.5 1.5L10.5 10.5M10.5 1.5L1.5 10.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
                    </svg>
                </button>
            `;
            list.appendChild(li);
        });

        updateUI(tasks);

    } catch (error) {
        console.error("Could not load tasks:", error);
        showToast("Cannot reach server. Is your backend running?", "error");
    }
}

// ─── 2. Add task ──────────────────────────────────────────────
async function addTask() {
    const input = document.getElementById('myInput');
    const title = input.value.trim();
    if (!title) { input.focus(); return; }

    const priority = document.getElementById('prioritySelect')?.value || 'Medium';
    const dueDateInput = document.getElementById('dueDateInput')?.value;
    const dueDate = dueDateInput ? new Date(dueDateInput).toISOString() : null;

    try {
        const res = await authFetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({ title, isDone: false, priority, dueDate })
        });
        if (!res || !res.ok) throw new Error();
        input.value = '';
        loadTasks();
    } catch (err) {
        console.error("Failed to add task:", err);
        showToast("Failed to add task.", "error");
    }
}

// ─── 3. Toggle task ───────────────────────────────────────────
async function toggleTask(id) {
    try {
        const res = await authFetch(`${API_URL}/${id}`, { method: 'PUT' });
        if (!res || !res.ok) throw new Error();
        loadTasks();
    } catch (err) {
        console.error("Failed to update task:", err);
        showToast("Failed to update task.", "error");
    }
}

// ─── 4. Delete task ───────────────────────────────────────────
async function deleteTask(id) {
    try {
        const res = await authFetch(`${API_URL}/${id}`, { method: 'DELETE' });
        if (!res || !res.ok) throw new Error();
        loadTasks();
    } catch (err) {
        console.error("Failed to delete task:", err);
        showToast("Failed to delete task.", "error");
    }
}

// ─── 5. Clear completed ───────────────────────────────────────
async function clearCompleted() {
    try {
        const res   = await authFetch(API_URL);
        if (!res) return;
        const tasks = await res.json();
        const done  = tasks.filter(t => t.isDone);

        await Promise.all(done.map(t =>
            authFetch(`${API_URL}/${t.id}`, { method: 'DELETE' })
        ));

        showToast(`Cleared ${done.length} completed task${done.length !== 1 ? 's' : ''}.`, "success");
        loadTasks();
    } catch (err) {
        console.error("Failed to clear completed:", err);
        showToast("Failed to clear completed tasks.", "error");
    }
}

// ─── XSS Guard ────────────────────────────────────────────────
function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ─── Init ─────────────────────────────────────────────────────
// Wait for Supabase session to be ready before loading tasks
_supabase.auth.getSession().then(({ data: { session } }) => {
    if (session) {
        loadTasks();
    } else {
        window.location.href = 'login.html';
    }
});
