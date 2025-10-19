from flask import Flask, request, jsonify
from flask_cors import CORS
import google.generativeai as genai
import json
import time
from datetime import datetime
import os
from uuid import uuid4
from threading import Lock
from typing import Any, Dict, Optional
from copy import deepcopy
from dotenv import load_dotenv


app = Flask(__name__)
CORS(app)

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
for env_name in (".env", "local.env"):
    env_path = os.path.join(BACKEND_DIR, env_name)
    if os.path.exists(env_path):
        load_dotenv(env_path)

# Fallback to repository root .env if not already loaded.
load_dotenv(os.path.join(BACKEND_DIR, "..", ".env"))

# Configure Gemini API
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')
if not GEMINI_API_KEY:
    raise RuntimeError('GEMINI_API_KEY environment variable is not set.')
genai.configure(api_key=GEMINI_API_KEY)
SYSTEM_INSTRUCTION = (
    "You are an AI Agent developed to help you complete tasks and help you analyze how your AI Skills. "
    "Provide concise, actionable guidance. Use Markdown formatting with short paragraphs and bullet points. "
    "Keep responses brief but informative."
)

GENERATION_CONFIG = {
    "temperature": 0.7,
    "top_p": 0.9
}

MAX_HISTORY_MESSAGES = 20

model = genai.GenerativeModel('gemini-2.5-flash')

# In-memory storage for tasks and conversations (scoped per user)
tasks_by_id: Dict[str, 'Task'] = {}
active_task_by_user: Dict[str, str] = {}


def _parse_ts(value: Optional[str], fallback: Optional[float] = None) -> Optional[float]:
    if value is None:
        return fallback
    try:
        return datetime.fromisoformat(value).timestamp()
    except Exception:
        return fallback


def _iso_now() -> str:
    return datetime.now().isoformat()


def _task_history_path(user_id: str) -> str:
    return os.path.join(TASK_HISTORY_DIR, f'{user_id}.json')


class Task:
    def __init__(
        self,
        user_id: str,
        task_name: str,
        category: str = "General",
        task_id: Optional[str] = None,
        messages: Optional[list] = None,
        iterations: Optional[int] = None,
        is_active: Optional[bool] = None,
        started_at: Optional[str] = None,
        completed_at: Optional[str] = None,
        created_at: Optional[str] = None,
        updated_at: Optional[str] = None,
        start_ts: Optional[float] = None,
        end_ts: Optional[float] = None,
    ):
        now_iso = _iso_now()
        self.id = task_id or str(int(time.time() * 1000))
        self.user_id = user_id
        self.name = task_name
        self.category = category
        self.messages = messages[:] if isinstance(messages, list) else []
        self._normalize_messages()
        self.iterations = int(iterations or 0)
        self.is_active = True if is_active is None else bool(is_active)
        self.started_at = started_at or now_iso
        self.completed_at = completed_at
        self.created_at = created_at or self.started_at
        self.updated_at = updated_at or now_iso
        self.start_ts = start_ts if start_ts is not None else _parse_ts(self.started_at, time.time())
        self.end_ts = end_ts if end_ts is not None else (_parse_ts(self.completed_at) if self.completed_at else None)

    def _normalize_messages(self) -> None:
        normalized = []
        for entry in self.messages:
            if not isinstance(entry, dict):
                continue
            cleaned = deepcopy(entry)
            metadata = cleaned.get('metadata')
            if metadata and not isinstance(metadata, dict):
                cleaned.pop('metadata', None)
                metadata = None
            if not cleaned.get('id'):
                cleaned['id'] = f"msg-{uuid4().hex}"
            normalized.append(cleaned)
        self.messages = normalized

    def add_message(self, role: str, content: str, metadata: Optional[Dict[str, Any]] = None) -> None:
        metadata_copy = deepcopy(metadata) if metadata else None
        message_id = None
        if metadata_copy:
            message_id = metadata_copy.pop('message_id', None)
        entry = {
            "id": message_id or f"msg-{uuid4().hex}",
            "role": role,
            "content": content,
            "timestamp": _iso_now()
        }
        if metadata_copy:
            entry["metadata"] = metadata_copy
        self.messages.append(entry)
        if role == "user":
            self.iterations += 1
        self.updated_at = entry["timestamp"]

    def get_duration(self) -> int:
        if self.start_ts is None:
            return 0
        if self.end_ts is not None:
            return max(0, int(self.end_ts - self.start_ts))
        if not self.is_active:
            return 0
        return max(0, int(time.time() - self.start_ts))

    def mark_completed(self):
        self.is_active = False
        self.completed_at = _iso_now()
        self.end_ts = time.time()
        self.updated_at = self.completed_at

    def to_dict(self) -> Dict[str, Any]:
        payload = {
            'id': self.id,
            'task_id': self.id,
            'user_id': self.user_id,
            'name': self.name,
            'category': self.category,
            'messages': deepcopy(self.messages),
            'iterations': self.iterations,
            'duration': self.get_duration(),
            'is_active': self.is_active,
            'started_at': self.started_at,
            'completed_at': self.completed_at,
            'created_at': self.created_at,
            'updated_at': self.updated_at,
            'start_ts': self.start_ts,
            'end_ts': self.end_ts
        }
        return payload

    def to_summary(self) -> Dict[str, Any]:
        payload = {
            'id': self.id,
            'task_id': self.id,
            'user_id': self.user_id,
            'name': self.name,
            'category': self.category,
            'iterations': self.iterations,
            'duration': self.get_duration(),
            'last_activity': self.messages[-1]['timestamp'] if self.messages else self.updated_at,
            'is_active': self.is_active,
            'started_at': self.started_at,
            'completed_at': self.completed_at
        }
        return payload

    @classmethod
    def from_record(cls, record: Dict[str, Any]) -> 'Task':
        if not isinstance(record, dict):
            raise ValueError('Invalid task record')
        return cls(
            user_id=record.get('user_id'),
            task_name=record.get('name') or record.get('title') or 'Untitled Task',
            category=record.get('category') or 'General',
            task_id=record.get('id') or record.get('task_id'),
            messages=record.get('messages') or [],
            iterations=record.get('iterations') or 0,
            is_active=record.get('is_active'),
            started_at=record.get('started_at'),
            completed_at=record.get('completed_at'),
            created_at=record.get('created_at'),
            updated_at=record.get('updated_at'),
            start_ts=record.get('start_ts'),
            end_ts=record.get('end_ts')
        )

# Paths for reflection data
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.environ.get('DATA_DIR', BASE_DIR)
QUESTIONS_PATH = os.path.join(DATA_DIR, 'questions.json')
RESULTS_PATH = os.path.join(DATA_DIR, 'results.json')
PROMPT_HACKS_PATH = os.path.join(DATA_DIR, 'prompt_hacks.json')
CLARITY_QUESTIONS_PATH = os.path.join(DATA_DIR, 'clarity_questions.json')
CLARITY_RESULTS_PATH = os.path.join(DATA_DIR, 'clarity_results.json')
USERS_PATH = os.path.join(DATA_DIR, 'users.json')
ONBOARDING_RESPONSES_PATH = os.path.join(DATA_DIR, 'onboarding_responses.json')
TASK_HISTORY_DIR = os.path.join(DATA_DIR, 'task_history')

_file_locks: Dict[str, Lock] = {}
_file_registry_lock = Lock()


def _get_file_lock(path: str) -> Lock:
    with _file_registry_lock:
        lock = _file_locks.get(path)
        if lock is None:
            lock = Lock()
            _file_locks[path] = lock
        return lock


def read_json_file(path, default):
    lock = _get_file_lock(path)
    with lock:
        try:
            if not os.path.exists(path):
                os.makedirs(os.path.dirname(path), exist_ok=True)
                with open(path, 'w') as f:
                    json.dump(default, f)
                return default
            with open(path, 'r') as f:
                return json.load(f)
        except Exception:
            return default

def write_json_file(path, data):
    lock = _get_file_lock(path)
    with lock:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w') as f:
            json.dump(data, f, indent=2)


def load_users() -> Dict[str, Dict[str, str]]:
    payload = read_json_file(USERS_PATH, {'users': {}})
    users = payload.get('users', {}) if isinstance(payload, dict) else {}
    return users if isinstance(users, dict) else {}


def save_users(users: Dict[str, Dict[str, str]]) -> None:
    write_json_file(USERS_PATH, {'users': users})


def get_user(user_id: Optional[str]) -> Optional[Dict[str, str]]:
    if not user_id:
        return None
    users = load_users()
    user = users.get(user_id)
    return user if isinstance(user, dict) else None


def find_user_by_email(email: Optional[str]) -> Optional[Dict[str, str]]:
    if not email:
        return None
    lowered = email.lower()
    users = load_users()
    for user in users.values():
        if isinstance(user, dict) and user.get('email', '').lower() == lowered:
            return user
    return None


def sanitize_user(user: Optional[Dict[str, str]]) -> Optional[Dict[str, str]]:
    if not user:
        return None
    return {
        key: value
        for key, value in user.items()
        if key != 'password'
    }


def ensure_seed_user() -> None:
    users = load_users()
    target_email = 'Nikhil31@gmail.com'
    for user in users.values():
        if isinstance(user, dict) and user.get('email', '').lower() == target_email.lower():
            return
    user_id = f"user-{uuid4().hex}"
    seed_user = {
        'id': user_id,
        'name': 'Nikhil',
        'email': target_email,
        'password': 'QOG1',
        'created_at': datetime.now().isoformat()
    }
    users[user_id] = seed_user
    save_users(users)


def load_onboarding_responses() -> Dict[str, Dict[str, Any]]:
    data = read_json_file(ONBOARDING_RESPONSES_PATH, {})
    return data if isinstance(data, dict) else {}


def save_onboarding_responses(responses: Dict[str, Dict[str, Any]]) -> None:
    write_json_file(ONBOARDING_RESPONSES_PATH, responses)


ensure_seed_user()


def load_task_history(user_id: str) -> Dict[str, Dict[str, Any]]:
    if not user_id:
        return {}
    path = _task_history_path(user_id)
    data = read_json_file(path, {})
    return data if isinstance(data, dict) else {}


def save_task_history(user_id: str, tasks: Dict[str, Dict[str, Any]]) -> None:
    if not user_id:
        return
    path = _task_history_path(user_id)
    write_json_file(path, tasks)

def load_results(path: str = RESULTS_PATH, user_id: Optional[str] = None):
    raw_results = read_json_file(path, [])
    if not isinstance(raw_results, list):
        raw_results = []
    normalized = []
    for entry in raw_results:
        if not isinstance(entry, dict):
            continue
        entry.setdefault('context', 'reflection')
        entry.setdefault('task_meta', {})
        if user_id and entry.get('user_id') != user_id:
            continue
        normalized.append(entry)
    return normalized


def persist_result(record: Dict[str, Any], path: str = RESULTS_PATH) -> None:
    existing = read_json_file(path, [])
    if not isinstance(existing, list):
        existing = []
    existing.append(record)
    write_json_file(path, existing)


def persist_task(task: Task) -> None:
    if not task.user_id:
        return
    stored = load_task_history(task.user_id)
    stored[task.id] = task.to_dict()
    save_task_history(task.user_id, stored)


def hydrate_tasks_for_user(user_id: str) -> Dict[str, Task]:
    hydrated: Dict[str, Task] = {}
    stored = load_task_history(user_id)
    for task_id, payload in stored.items():
        existing = tasks_by_id.get(task_id)
        if existing and existing.user_id == user_id:
            hydrated[task_id] = existing
            continue
        try:
            task_obj = Task.from_record(payload)
            if not task_obj.user_id:
                task_obj.user_id = user_id
            tasks_by_id[task_obj.id] = task_obj
            hydrated[task_obj.id] = task_obj
        except Exception:
            continue
    return hydrated

def load_clarity_questions():
    data = read_json_file(CLARITY_QUESTIONS_PATH, { 'questions': [] })
    questions = data.get('questions', [])
    return questions if isinstance(questions, list) else []

def load_prompt_hacks():
    data = read_json_file(PROMPT_HACKS_PATH, { 'hacks': [] })
    hacks = data.get('hacks', [])
    return hacks if isinstance(hacks, list) else []

def _find_message_index(task: Task, message_id: str) -> int:
    if not message_id:
        return -1
    for idx, message in enumerate(task.messages):
        if message.get('id') == message_id:
            return idx
    return -1

def _build_context_messages(messages: Any) -> list:
    if isinstance(messages, Task):
        source = messages.messages
    else:
        source = messages
    history = (source or [])[-MAX_HISTORY_MESSAGES:]
    compiled = [{
        'role': 'user',
        'parts': [{'text': SYSTEM_INSTRUCTION}]
    }]
    for message in history:
        role = message.get('role')
        content = message.get('content', '')
        if not content:
            continue
        mapped_role = 'model' if role == 'assistant' else 'user'
        compiled.append({
            'role': mapped_role,
            'parts': [{'text': content}]
        })
    return compiled


def _generate_markdown_response(context_source: Any) -> str:
    context_messages = _build_context_messages(context_source)
    response = model.generate_content(
        contents=context_messages,
        generation_config=GENERATION_CONFIG
    )
    raw_text = getattr(response, 'text', '') or ''
    return raw_text.strip()


def get_task_meta(task_id: Optional[str], user_id: Optional[str] = None):
    if not task_id:
        return {}
    task = tasks_by_id.get(task_id)
    if not task and user_id:
        hydrate_tasks_for_user(user_id)
        task = tasks_by_id.get(task_id)
    if not task or (user_id and task.user_id != user_id):
        return {}
    return {
        'id': task.id,
        'name': task.name,
        'category': task.category
    }

def compute_reflection_score(answers: dict):
    """Compute scores using provided formula:
    Likert: normalized to 0-100 via (x - min) / (max - min) * 100
    MCQ (single/multi): percentage of selected options that are tagged as (+1).
    Overall: average of Likert mean and MCQ mean (when both present).
    """
    qbank = read_json_file(QUESTIONS_PATH, { 'questions': [] }).get('questions', [])
    q_by_id = { q.get('id'): q for q in qbank }

    likert_scores = []
    mcq_scores = []

    for qid, value in (answers or {}).items():
        q = q_by_id.get(qid)
        if not q:
            continue
        qtype = q.get('type')
        if qtype == 'scale':
            scale = q.get('scale', {})
            min_v = float(scale.get('min', 1))
            max_v = float(scale.get('max', 5))
            try:
                x = float(value)
            except Exception:
                continue
            if max_v == min_v:
                continue
            norm = max(0.0, min(1.0, (x - min_v) / (max_v - min_v)))
            likert_scores.append(norm * 100.0)
        elif qtype in ('single', 'multi'):
            options = q.get('options', [])
            def is_positive(opt: str):
                return '(+1' in opt or '+1' in opt
            positives = [opt for opt in options if is_positive(opt)]
            if qtype == 'single':
                selected = [value] if isinstance(value, str) else []
            else:
                selected = value if isinstance(value, list) else []
            if not selected:
                mcq_scores.append(0.0)
                continue
            pos_selected = [opt for opt in selected if isinstance(opt, str) and is_positive(opt)]
            pct = (len(pos_selected) / len(selected)) * 100.0
            mcq_scores.append(pct)

    likert_mean = sum(likert_scores) / len(likert_scores) if likert_scores else None
    mcq_mean = sum(mcq_scores) / len(mcq_scores) if mcq_scores else None

    if likert_mean is not None and mcq_mean is not None:
        overall = (likert_mean + mcq_mean) / 2.0
    elif likert_mean is not None:
        overall = likert_mean
    elif mcq_mean is not None:
        overall = mcq_mean
    else:
        overall = 0.0

    return {
        'overall': round(overall, 2),
        'likert_mean': round(likert_mean, 2) if likert_mean is not None else None,
        'mcq_mean': round(mcq_mean, 2) if mcq_mean is not None else None,
        'likert_count': len(likert_scores),
        'mcq_count': len(mcq_scores)
    }


@app.route('/api/auth/signup', methods=['POST'])
def signup():
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    email = (data.get('email') or '').strip()
    password = data.get('password') or ''

    if not name or not email or not password:
        return jsonify({'error': 'name, email, and password are required'}), 400

    if find_user_by_email(email):
        return jsonify({'error': 'Email already registered'}), 409

    users = load_users()
    user_id = f"user-{uuid4().hex}"
    timestamp = datetime.now().isoformat()
    record = {
        'id': user_id,
        'name': name,
        'email': email,
        'password': password,
        'created_at': timestamp,
        'updated_at': timestamp
    }
    users[user_id] = record
    save_users(users)

    responses = load_onboarding_responses()
    onboarding_entry = responses.get(user_id, {})

    return jsonify({
        'user': sanitize_user(record),
        'credentials_plaintext': True,
        'onboarding': {
            'completed': bool(onboarding_entry.get('completed')),
            'completed_at': onboarding_entry.get('completed_at')
        }
    })


@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    email = (data.get('email') or '').strip()
    password = data.get('password') or ''

    if not email or not password:
        return jsonify({'error': 'email and password are required'}), 400

    user = find_user_by_email(email)
    if not user or user.get('password') != password:
        return jsonify({'error': 'Invalid credentials'}), 401

    responses = load_onboarding_responses()
    onboarding_entry = responses.get(user['id'], {})

    return jsonify({
        'user': sanitize_user(user),
        'credentials_plaintext': True,
        'onboarding': {
            'completed': bool(onboarding_entry.get('completed')),
            'completed_at': onboarding_entry.get('completed_at')
        }
    })


@app.route('/api/onboarding/status', methods=['GET'])
def onboarding_status():
    user_id = request.args.get('user_id')
    if not user_id:
        return jsonify({'error': 'user_id is required'}), 400
    if not get_user(user_id):
        return jsonify({'error': 'User not found'}), 404

    responses = load_onboarding_responses()
    entry = responses.get(user_id, {})
    return jsonify({
        'user_id': user_id,
        'completed': bool(entry.get('completed')),
        'completed_at': entry.get('completed_at'),
        'answers': entry.get('answers', {})
    })

@app.route('/api/new-task', methods=['POST'])
def new_task():
    data = request.get_json() or {}
    user_id = data.get('user_id')
    if not user_id:
        return jsonify({'error': 'user_id is required'}), 400
    if not get_user(user_id):
        return jsonify({'error': 'User not found'}), 404

    task_name = data.get('name', 'New Task')
    category = data.get('category', 'General')

    task = Task(user_id=user_id, task_name=task_name, category=category)
    tasks_by_id[task.id] = task
    active_task_by_user[user_id] = task.id
    persist_task(task)

    return jsonify(task.to_dict())


@app.route('/api/send-message', methods=['POST'])
def send_message():
    data = request.get_json() or {}
    user_id = data.get('user_id')
    if not user_id:
        return jsonify({'error': 'user_id is required'}), 400
    if not get_user(user_id):
        return jsonify({'error': 'User not found'}), 404

    task_id = data.get('task_id') or active_task_by_user.get(user_id)
    if not task_id:
        return jsonify({'error': 'No active task'}), 400

    hydrate_tasks_for_user(user_id)
    task = tasks_by_id.get(task_id)
    if not task or task.user_id != user_id:
        return jsonify({'error': 'Task not found'}), 404

    message = (data.get('message') or '').strip()
    if not message:
        return jsonify({'error': 'message is required'}), 400

    has_prior_assistant = any(msg.get('role') == 'assistant' for msg in task.messages)

    task.add_message("user", message)

    try:
        markdown_reply = _generate_markdown_response(task)
        task.add_message("assistant", markdown_reply, metadata={
            'format': 'markdown'
        })
        persist_task(task)
    except Exception as error:
        if task.messages and task.messages[-1]['role'] == 'user':
            task.messages.pop()
            task.iterations = max(0, task.iterations - 1)
        persist_task(task)
        return jsonify({'error': f'Failed to generate response: {str(error)}'}), 500

    active_task_by_user[user_id] = task.id
    persist_task(task)
    return jsonify(task.to_dict())


@app.route('/api/improve-message', methods=['POST'])
def improve_message():
    data = request.get_json() or {}
    user_id = data.get('user_id')
    task_id = data.get('task_id') or active_task_by_user.get(user_id)
    message_id = data.get('message_id')
    feedback = (data.get('feedback') or '').strip()

    if not user_id:
        return jsonify({'error': 'user_id is required'}), 400
    if not task_id:
        return jsonify({'error': 'task_id is required'}), 400
    if not message_id:
        return jsonify({'error': 'message_id is required'}), 400
    if not feedback:
        return jsonify({'error': 'feedback is required'}), 400
    if not get_user(user_id):
        return jsonify({'error': 'User not found'}), 404

    hydrate_tasks_for_user(user_id)
    task = tasks_by_id.get(task_id)
    if not task or task.user_id != user_id:
        return jsonify({'error': 'Task not found'}), 404

    target_index = _find_message_index(task, message_id)
    if target_index < 0:
        return jsonify({'error': 'Message not found'}), 404

    target_message = task.messages[target_index]
    if target_message.get('role') != 'assistant':
        return jsonify({'error': 'Selected message is not an assistant response'}), 400

    instruction = (
        f"Improve your earlier response (message id: {message_id}). "
        f"User feedback:\n{feedback.strip()}\n"
        "Revise the answer, keeping correct parts while addressing the feedback."
    )

    task.add_message("user", instruction, metadata={
        'kind': 'improve_feedback',
        'target_message_id': message_id,
        'feedback': feedback
    })

    try:
        markdown_reply = _generate_markdown_response(task)
        task.add_message("assistant", markdown_reply, metadata={
            'kind': 'improved_response',
            'target_message_id': message_id,
            'format': 'markdown'
        })
        persist_task(task)
    except Exception as error:
        if task.messages and task.messages[-1]['role'] == 'assistant':
            task.messages.pop()
        if task.messages and task.messages[-1]['role'] == 'user':
            task.messages.pop()
            task.iterations = max(0, task.iterations - 1)
        persist_task(task)
        return jsonify({'error': f'Failed to improve response: {str(error)}'}), 500

    active_task_by_user[user_id] = task.id
    return jsonify(task.to_dict())


@app.route('/api/get-task/<task_id>', methods=['GET'])
def get_task(task_id):
    user_id = request.args.get('user_id')
    if not user_id:
        return jsonify({'error': 'user_id is required'}), 400
    hydrate_tasks_for_user(user_id)
    task = tasks_by_id.get(task_id)
    if not task or task.user_id != user_id:
        return jsonify({'error': 'Task not found'}), 404
    return jsonify(task.to_dict())


@app.route('/api/task-messages', methods=['GET'])
def get_task_messages():
    user_id = request.args.get('user_id')
    task_id = request.args.get('task_id')
    cursor = request.args.get('cursor')
    limit_raw = request.args.get('limit', '20')

    if not user_id:
        return jsonify({'error': 'user_id is required'}), 400
    if not task_id:
        return jsonify({'error': 'task_id is required'}), 400
    if not get_user(user_id):
        return jsonify({'error': 'User not found'}), 404

    try:
        limit = max(1, min(100, int(limit_raw)))
    except ValueError:
        return jsonify({'error': 'limit must be an integer'}), 400

    hydrate_tasks_for_user(user_id)
    task = tasks_by_id.get(task_id)
    if not task or task.user_id != user_id:
        return jsonify({'error': 'Task not found'}), 404

    messages = deepcopy(task.messages)
    if cursor:
        cursor_index = _find_message_index(task, cursor)
        if cursor_index < 0:
            return jsonify({'error': 'cursor not found'}), 400
        end_index = cursor_index
    else:
        end_index = len(messages)

    start_index = max(0, end_index - limit)
    page = messages[start_index:end_index]
    has_more = start_index > 0
    next_cursor = page[0]['id'] if has_more and page else None

    return jsonify({
        'messages': page,
        'next_cursor': next_cursor,
        'has_more': has_more
    })


@app.route('/api/get-all-tasks', methods=['GET'])
def get_all_tasks():
    user_id = request.args.get('user_id')
    if not user_id:
        return jsonify({'error': 'user_id is required'}), 400
    if not get_user(user_id):
        return jsonify({'error': 'User not found'}), 404

    hydrated = hydrate_tasks_for_user(user_id)
    task_list = [task.to_summary() for task in hydrated.values()]
    task_list.sort(key=lambda item: item.get('last_activity') or '', reverse=True)
    return jsonify(task_list)


@app.route('/api/complete-task', methods=['POST'])
def complete_task():
    data = request.get_json() or {}
    user_id = data.get('user_id')
    if not user_id:
        return jsonify({'error': 'user_id is required'}), 400
    if not get_user(user_id):
        return jsonify({'error': 'User not found'}), 404

    fallback_task_id = active_task_by_user.get(user_id)
    task_id = data.get('task_id') or fallback_task_id
    if not task_id:
        return jsonify({'error': 'No active task'}), 400

    hydrate_tasks_for_user(user_id)
    task = tasks_by_id.get(task_id)
    if not task or task.user_id != user_id:
        return jsonify({'error': 'Task not found'}), 404

    task.mark_completed()
    persist_task(task)

    if active_task_by_user.get(user_id) == task_id:
        active_task_by_user.pop(user_id, None)

    return jsonify({
        'task_id': task.id,
        'id': task.id,
        'duration': task.get_duration(),
        'iterations': task.iterations
    })


@app.route('/api/switch-task', methods=['POST'])
def switch_task():
    data = request.get_json() or {}
    user_id = data.get('user_id')
    task_id = data.get('task_id')

    if not user_id:
        return jsonify({'error': 'user_id is required'}), 400
    if not task_id:
        return jsonify({'error': 'task_id is required'}), 400
    if not get_user(user_id):
        return jsonify({'error': 'User not found'}), 404

    hydrate_tasks_for_user(user_id)
    task = tasks_by_id.get(task_id)
    if not task or task.user_id != user_id:
        return jsonify({'error': 'Task not found'}), 404

    active_task_by_user[user_id] = task_id
    persist_task(task)
    return jsonify(task.to_dict())

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'healthy', 'message': 'QOG Chatbot API is running'})

# Reflection APIs
@app.route('/api/reflection/questions', methods=['GET'])
def get_reflection_questions():
    data = read_json_file(QUESTIONS_PATH, { 'version': 1, 'questions': [] })
    return jsonify(data)

@app.route('/api/reflection/submit', methods=['POST'])
def submit_reflection():
    payload = request.get_json() or {}
    user_id = payload.get('user_id')
    if not user_id:
        return jsonify({'error': 'user_id is required'}), 400
    if not get_user(user_id):
        return jsonify({'error': 'User not found'}), 404

    task_id = payload.get('task_id')
    answers = payload.get('answers', {})
    task_meta = payload.get('task_meta') or get_task_meta(task_id, user_id)
    score = compute_reflection_score(answers)
    record = {
        'timestamp': datetime.now().isoformat(),
        'user_id': user_id,
        'task_id': task_id,
        'answers': answers,
        'iterations': payload.get('iterations'),
        'duration': payload.get('duration'),
        'score': score,
        'context': 'reflection',
        'task_meta': task_meta or {}
    }
    persist_result(record)
    return jsonify({'status': 'ok'})

@app.route('/api/reflection/results', methods=['GET'])
def get_reflection_results():
    user_id = request.args.get('user_id')
    if not user_id:
        return jsonify({'error': 'user_id is required'}), 400
    results = load_results(user_id=user_id)
    return jsonify(results)

@app.route('/api/baseline/questions', methods=['GET'])
def get_baseline_questions():
    questions = load_clarity_questions()
    return jsonify({
        'questions': questions,
        'total': len(questions),
        'requested': len(questions)
    })

@app.route('/api/baseline/submit', methods=['POST'])
def submit_baseline():
    payload = request.get_json() or {}
    user_id = payload.get('user_id')
    if not user_id:
        return jsonify({'error': 'user_id is required'}), 400
    user = get_user(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    answers = payload.get('answers', {})
    timestamp = datetime.now().isoformat()
    baseline_record = {
        'timestamp': timestamp,
        'user_id': user_id,
        'task_id': payload.get('task_id'),
        'answers': answers,
        'iterations': payload.get('iterations') or 0,
        'duration': payload.get('duration') or 0,
        'task_meta': payload.get('task_meta') or {},
        'context': 'baseline'
    }
    score = compute_reflection_score(answers) if answers else None
    with_score = {**baseline_record, 'score': score}
    persist_result(with_score)
    persist_result(with_score, CLARITY_RESULTS_PATH)

    responses = load_onboarding_responses()
    responses[user_id] = {
        'completed': True,
        'completed_at': timestamp,
        'answers': answers,
        'score': score
    }
    save_onboarding_responses(responses)

    return jsonify({'status': 'ok', 'completed': True})

@app.route('/api/prompt-hacks', methods=['GET'])
def get_prompt_hacks():
    hacks = load_prompt_hacks()
    return jsonify({ 'hacks': hacks })

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5050))
    app.run(debug=False, host='0.0.0.0', port=port)
