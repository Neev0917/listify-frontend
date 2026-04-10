const API_URL = "https://listify-backend-production-daf2.up.railway.app/api/home";
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


// ─── Notifications ────────────────────────────────────────────
function checkNotifications(tasks) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);

    const alerts = [];

    tasks.forEach(task => {
        if (task.isDone || !task.dueDate) return;
        const due = new Date(task.dueDate);
        const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
        const diffDays = Math.round((dueDay - today) / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
            alerts.push({ task, type: 'overdue', label: `Overdue by ${Math.abs(diffDays)}d` });
        } else if (diffDays === 0) {
            alerts.push({ task, type: 'today', label: 'Due today' });
        } else if (diffDays === 1) {
            alerts.push({ task, type: 'soon', label: 'Due tomorrow' });
        }
    });

    updateNotifBadge(alerts);
    updateNotifDropdown(alerts);
    sendBrowserNotifications(alerts);
}

function updateNotifBadge(alerts) {
    const badge = document.getElementById('notifBadge');
    if (!badge) return;
    if (alerts.length > 0) {
        badge.textContent = alerts.length > 9 ? '9+' : alerts.length;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

function updateNotifDropdown(alerts) {
    const list = document.getElementById('notifList');
    if (!list) return;

    if (alerts.length === 0) {
        list.innerHTML = '<div class="notif-empty">🎉 All caught up! No pending alerts.</div>';
        return;
    }

    list.innerHTML = alerts.map(({ task, type, label }) => `
        <div class="notif-item">
            <div class="notif-dot ${type}"></div>
            <div class="notif-content">
                <div class="notif-task-title">${escapeHTML(task.title)}</div>
                <div class="notif-task-sub ${type}">${label} · ${task.priority} priority</div>
            </div>
        </div>
    `).join('');
}

function toggleNotifDropdown() {
    const dropdown = document.getElementById('notifDropdown');
    if (!dropdown) return;
    dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
}

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    const wrap = document.querySelector('.notif-wrap');
    if (wrap && !wrap.contains(e.target)) {
        const dropdown = document.getElementById('notifDropdown');
        if (dropdown) dropdown.style.display = 'none';
    }
});

// ─── Browser Push Notifications ───────────────────────────────
let browserNotifsShown = false;

async function requestNotifPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
        await Notification.requestPermission();
    }
}

function sendBrowserNotifications(alerts) {
    if (browserNotifsShown) return;
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    if (alerts.length === 0) return;

    browserNotifsShown = true;

    // Send one summary notification
    const overdueCount = alerts.filter(a => a.type === 'overdue').length;
    const todayCount   = alerts.filter(a => a.type === 'today').length;
    const soonCount    = alerts.filter(a => a.type === 'soon').length;

    let body = '';
    if (overdueCount > 0) body += `${overdueCount} overdue · `;
    if (todayCount > 0)   body += `${todayCount} due today · `;
    if (soonCount > 0)    body += `${soonCount} due tomorrow`;
    body = body.replace(/ · $/, '');

    new Notification('Listify — Task Reminder 🔔', {
        body,
        icon: '/favicon.ico',
        badge: '/favicon.ico'
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
                <span class="task-text" onclick="toggleTask(${task.id})" ondblclick="openEditModal(${task.id}, '${escapeHTML(task.title)}', '${priority}', '${task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : ''}')" title="Double-click to edit">${escapeHTML(task.title)}</span>
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
        checkNotifications(tasks);

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



// ─── 7. Open edit modal ───────────────────────────────────────
function openEditModal(id, title, priority, dueDate) {
    // Remove existing modal
    const existing = document.getElementById('editModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'editModal';
    modal.className = 'edit-modal-overlay';
    modal.innerHTML = `
        <div class="edit-modal">
            <div class="edit-modal-header">
                <span class="edit-modal-title">Edit Task</span>
                <button class="edit-modal-close" onclick="closeEditModal()">&times;</button>
            </div>
            <div class="edit-modal-body">
                <div class="edit-field">
                    <label>Title</label>
                    <input type="text" id="editTitle" value="${title}" class="edit-input" />
                </div>
                <div class="edit-row">
                    <div class="edit-field">
                        <label>Priority</label>
                        <select id="editPriority" class="edit-select">
                            <option value="High" ${priority === 'High' ? 'selected' : ''}>🔴 High</option>
                            <option value="Medium" ${priority === 'Medium' ? 'selected' : ''}>🟡 Medium</option>
                            <option value="Low" ${priority === 'Low' ? 'selected' : ''}>🟢 Low</option>
                        </select>
                    </div>
                    <div class="edit-field">
                        <label>Due Date</label>
                        <input type="date" id="editDueDate" value="${dueDate}" class="edit-input" />
                    </div>
                </div>
            </div>
            <div class="edit-modal-footer">
                <button class="edit-cancel-btn" onclick="closeEditModal()">Cancel</button>
                <button class="edit-clear-date-btn" onclick="clearDueDate(${id})">Remove Date</button>
                <button class="edit-save-btn" onclick="saveEdit(${id})">Save Changes</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Focus title input
    setTimeout(() => document.getElementById('editTitle')?.focus(), 50);

    // Close on overlay click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeEditModal();
    });

    // Close on Escape
    document.addEventListener('keydown', handleModalKeydown);
}

function handleModalKeydown(e) {
    if (e.key === 'Escape') closeEditModal();
    if (e.key === 'Enter' && e.target.id === 'editTitle') {
        const modal = document.getElementById('editModal');
        if (modal) {
            const id = parseInt(modal.dataset.taskId);
        }
    }
}

function closeEditModal() {
    const modal = document.getElementById('editModal');
    if (modal) modal.remove();
    document.removeEventListener('keydown', handleModalKeydown);
}

async function saveEdit(id) {
    const title    = document.getElementById('editTitle')?.value.trim();
    const priority = document.getElementById('editPriority')?.value;
    const dueDate  = document.getElementById('editDueDate')?.value;

    if (!title) {
        showToast('Title cannot be empty.', 'error');
        return;
    }

    try {
        const res = await authFetch(`${API_URL}/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({
                title,
                priority,
                updateDueDate: true,
                dueDate: dueDate ? new Date(dueDate).toISOString() : null
            })
        });
        if (!res || !res.ok) throw new Error();
        closeEditModal();
        loadTasks();
        showToast('Task updated!', 'success');
    } catch (err) {
        showToast('Failed to update task.', 'error');
    }
}

async function clearDueDate(id) {
    document.getElementById('editDueDate').value = '';
}

// ─── XSS Guard ────────────────────────────────────────────────
function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ─── Init ─────────────────────────────────────────────────────
// Request browser notification permission
requestNotifPermission();
// Wait for Supabase session to be ready before loading tasks
_supabase.auth.getSession().then(({ data: { session } }) => {
    if (session) {
        loadTasks();
    } else {
        window.location.href = 'login.html';
    }
});
