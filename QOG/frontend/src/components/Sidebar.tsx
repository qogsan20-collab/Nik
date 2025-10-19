import React, { useState } from 'react';
import '../styles/Sidebar.css';
// Using image logo per user's request
import { Plus, Search, Settings, HelpCircle, ChevronDown, ChevronUp, LayoutDashboard, LogOut } from 'lucide-react';

interface Task {
  id: string;
  name: string;
  category: string;
  iterations: number;
  duration: number;
  last_activity?: string | null;
  is_active?: boolean;
}

interface SidebarProps {
  onNewTask: (taskName?: string, category?: string) => void;
  previousTasks: Task[];
  onSwitchTask: (taskId: string) => void;
  isLoading: boolean;
  onShowDashboard: () => void;
  activeView: 'chat' | 'dashboard';
  userName?: string;
  userEmail?: string;
  onLogout?: () => void;
  activeTaskId?: string;
}

const Sidebar: React.FC<SidebarProps> = ({
  onNewTask,
  previousTasks,
  onSwitchTask,
  isLoading,
  onShowDashboard,
  activeView,
  userName,
  userEmail,
  onLogout,
  activeTaskId
}) => {
  const [showPreviousTasks, setShowPreviousTasks] = useState(false);
  const [showNewTaskForm, setShowNewTaskForm] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskCategory, setNewTaskCategory] = useState('General');
  const displayName = userName ?? 'QOG User';
  const displayEmail = userEmail ?? 'user@example.com';

  const handleNewTaskClick = () => {
    if (showNewTaskForm) {
      if (newTaskName.trim()) {
        onNewTask(newTaskName.trim(), newTaskCategory);
        setNewTaskName('');
        setNewTaskCategory('General');
        setShowNewTaskForm(false);
      }
    } else {
      setShowNewTaskForm(true);
    }
  };

  const handleTaskClick = (taskId: string) => {
    onSwitchTask(taskId);
  };

  const formatTime = (timeInSeconds: number) => {
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = timeInSeconds % 60;
    return `${minutes}m ${seconds}s`;
  };

  const formatRelativeTime = (timestamp?: string | null) => {
    if (!timestamp) return '—';
    const value = new Date(timestamp).getTime();
    if (!Number.isFinite(value)) return '—';
    const diff = Date.now() - value;
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (diff < minute) return 'Just now';
    if (diff < hour) {
      const mins = Math.round(diff / minute);
      return `${mins}m ago`;
    }
    if (diff < day) {
      const hrs = Math.round(diff / hour);
      return `${hrs}h ago`;
    }
    const days = Math.round(diff / day);
    return `${days}d ago`;
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="logo"><img src="/assets/qog-logo.png" alt="Qog Logo" className="logo-img" /></div>
        <div className="user-info">
          <span>{displayName}</span>
          <small>{displayEmail}</small>
        </div>
        <div className="sidebar-actions">
          <button 
            className={`dashboard-link ${activeView === 'dashboard' ? 'active' : ''}`}
            onClick={onShowDashboard}
            type="button"
          >
            <LayoutDashboard size={18} />
            Clarity Dashboard
          </button>
          {onLogout && (
            <button className="logout-btn" type="button" onClick={onLogout}>
              Log out
            </button>
          )}
        </div>
      </div>
      
      <nav className="sidebar-nav">
        <div className="new-task-section">
          {showNewTaskForm ? (
            <div className="new-task-form">
              <input
                type="text"
                placeholder="Task name"
                value={newTaskName}
                onChange={(e) => setNewTaskName(e.target.value)}
                className="task-name-input"
              />
              <select
                value={newTaskCategory}
                onChange={(e) => setNewTaskCategory(e.target.value)}
                className="category-select"
              >
                <option value="General">General</option>
                <option value="Work">Work</option>
                <option value="Personal">Personal</option>
                <option value="Project">Project</option>
              </select>
              <div className="form-buttons">
                <button 
                  className="create-btn" 
                  onClick={handleNewTaskClick}
                  disabled={isLoading || !newTaskName.trim()}
                >
                  <Plus size={16} /> Create
                </button>
                <button 
                  className="cancel-btn" 
                  onClick={() => {
                    setShowNewTaskForm(false);
                    setNewTaskName('');
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button 
              className="new-task-btn" 
              onClick={handleNewTaskClick}
              disabled={isLoading}
            >
              <Plus size={16} /> New Task
            </button>
          )}
        </div>
        <a href="#"><Search size={16} /> Search Tasks</a>
        <a href="#">My Templates</a>
      </nav>
      
      <div className="task-categories">
        <p>New Task Category +</p>
        <ul>
          <li><a href="#">General</a></li>
          <li><a href="#">Work</a></li>
          <li><a href="#">Project</a></li>
        </ul>
      </div>
      
      <div className="previous-tasks">
        <div 
          className="previous-tasks-header"
          onClick={() => setShowPreviousTasks(!showPreviousTasks)}
        >
          <p>Previous Tasks</p>
          {showPreviousTasks ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
        {showPreviousTasks && (
          <ul>
            {previousTasks.length === 0 ? (
              <li className="no-tasks">No previous tasks</li>
            ) : (
              previousTasks.map((task) => {
                const isActiveTask = activeTaskId === task.id;
                const statusLabel = task.is_active ? 'Active' : 'Completed';
                return (
                  <li key={task.id}>
                    <a 
                      href="#" 
                      onClick={(e) => {
                        e.preventDefault();
                        handleTaskClick(task.id);
                      }}
                      className={`task-link${isActiveTask ? ' active' : ''}`}
                    >
                      <div className="task-info">
                        <span className="task-name">{task.name}</span>
                        <div className="task-meta">
                          <span className="task-category">{task.category}</span>
                          <span className="task-stats">
                            {task.iterations} iter • {formatTime(task.duration)}
                          </span>
                          <span className="task-updated">{formatRelativeTime(task.last_activity)}</span>
                        </div>
                        <span className={`task-status ${task.is_active ? 'open' : 'closed'}`}>{statusLabel}</span>
                      </div>
                    </a>
                  </li>
                );
              })
            )}
          </ul>
        )}
      </div>
      
      <div className="sidebar-footer">
        <a href="#"><Settings size={16} /> Settings</a>
        <a href="#"><HelpCircle size={16} /> Help</a>
        {onLogout && (
          <button className="sidebar-footer-btn" type="button" onClick={onLogout}>
            <LogOut size={16} /> Log out
          </button>
        )}
      </div>
    </div>
  );
};

export default Sidebar;
