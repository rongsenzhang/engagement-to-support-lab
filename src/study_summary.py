"""Summarise local study exports without publishing notes or counting practice as research."""
import argparse
from collections import Counter
import json
from pathlib import Path
import re

TASKS = ('patterns', 'context', 'capacity', 'explanation')
ROLES = ('Tutor / lecturer', 'Student support', 'Learning analytics', 'Other relevant experience')
MAX_BYTES = 256000


def read_session(path):
    if path.stat().st_size > MAX_BYTES:
        raise ValueError('Study file exceeds 256 KB: ' + path.name)
    try:
        session = json.loads(path.read_text(encoding='utf-8'))
    except (UnicodeError, json.JSONDecodeError) as error:
        raise ValueError('Invalid study JSON: ' + path.name) from error
    if not isinstance(session, dict) or session.get('schema_version') != 1 or session.get('app_version') != '0.4.0' or session.get('task_set_version') != 'synthetic-tutor-tasks-1':
        raise ValueError('Unsupported study record: ' + path.name)
    if session.get('mode') not in ('practice', 'facilitated'):
        raise ValueError('Missing or invalid session mode: ' + path.name)
    if session.get('status') not in ('paused', 'completed', 'stopped'):
        raise ValueError('Invalid saved session status: ' + path.name)
    if not isinstance(session.get('session_id'), str) or not re.fullmatch(r'STUDY-[a-zA-Z0-9-]+', session['session_id']):
        raise ValueError('Invalid session identifier: ' + path.name)
    tasks = session.get('tasks')
    if not isinstance(tasks, list) or len(tasks) != 4 or any(not isinstance(task, dict) or not isinstance(task.get('id'), str) for task in tasks) or {task.get('id') for task in tasks} != set(TASKS):
        raise ValueError('Expected the four distinct study tasks: ' + path.name)
    for task in tasks:
        if task.get('status') not in ('pending', 'paused', 'completed', 'skipped'):
            raise ValueError('Invalid task status: ' + path.name)
        duration, help_count = task.get('active_duration_ms'), task.get('assistance_count')
        if type(duration) is not int or not 0 <= duration <= 86400000 or type(help_count) is not int or not 0 <= help_count <= 500:
            raise ValueError('Invalid timing/help count: ' + path.name)
        if task['status'] == 'completed':
            if not task.get('initial_saved_at') or not str(task.get('initial_response', '')).strip() or not str(task.get('proposed_next_step', '')).strip():
                raise ValueError('Completed task lacks recorded responses: ' + path.name)
            if task['id'] == 'context' and (task.get('context_revealed') is not True or not task.get('revision_saved_at') or not str(task.get('revised_response', '')).strip()):
                raise ValueError('Completed context task lacks a revision: ' + path.name)
            if task['id'] == 'capacity':
                chosen = task.get('selected_case_ids', [])
                if not isinstance(chosen, list) or len(chosen) != 5 or any(not isinstance(code, str) or not re.fullmatch(r'SYN-(00[1-9]|0[1-4][0-9]|050)', code) for code in chosen) or len(set(chosen)) != 5:
                    raise ValueError('Completed capacity task must select five synthetic records: ' + path.name)
    if session['status'] == 'completed' and any(task['status'] not in {'completed', 'skipped'} for task in tasks):
        raise ValueError('Completed session still contains open tasks: ' + path.name)
    if session['mode'] == 'facilitated':
        if (session.get('adult_confirmed') is not True or session.get('consent_confirmed') is not True
                or not re.fullmatch(r'P[1-9][0-9]{0,2}', str(session.get('participant_code', '')))
                or session.get('broad_role') not in ROLES or not session.get('withdrawal_deadline')):
            raise ValueError('Facilitated record lacks participant agreement metadata: ' + path.name)
    return session


def summarise(input_dir):
    input_dir = Path(input_dir)
    paths = sorted(input_dir.glob('*.json')) if input_dir.exists() else []
    sessions = [read_session(path) for path in paths]
    seen_sessions, seen_people = set(), set()
    included = []
    excluded_practice, excluded_open = 0, 0
    for session in sessions:
        if session['session_id'] in seen_sessions:
            raise ValueError('Duplicate session export; keep one copy per session.')
        seen_sessions.add(session['session_id'])
        if session['mode'] == 'practice':
            excluded_practice += 1
            continue
        if session['status'] == 'paused':
            excluded_open += 1
            continue
        if session['participant_code'] in seen_people:
            raise ValueError('Repeated participant code; separate initial and retest rounds before summarising.')
        seen_people.add(session['participant_code'])
        included.append(session)
    result = {
        'schema_version': 1,
        'research_status': 'facilitated_records_available' if included else 'no_finalised_facilitated_records',
        'participant_count': len(included),
        'session_status_counts': dict(Counter(session['status'] for session in included)),
        'broad_role_counts': dict(Counter(session['broad_role'] for session in included)),
        'practice_sessions_excluded': excluded_practice,
        'unfinished_sessions_excluded': excluded_open,
        'tasks': [],
        'interpretation': 'Descriptive counts of facilitator-recorded sessions only. No themes, user findings or design improvements are inferred automatically. Practice is never participant evidence. Small convenience samples do not establish general effectiveness.'
    }
    for task_id in TASKS:
        rows = [next(task for task in session['tasks'] if task['id'] == task_id) for session in included]
        durations = [task['active_duration_ms'] / 1000 for task in rows if task['status'] in {'completed', 'skipped'}]
        result['tasks'].append({
            'task_id': task_id,
            'status_counts': dict(Counter(task['status'] for task in rows)),
            'help_requests': sum(task['assistance_count'] for task in rows),
            'active_seconds': durations,
            'mean_active_seconds': sum(durations) / len(durations) if durations else None,
        })
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input-dir', type=Path, default=Path('private_study/sessions'))
    parser.add_argument('--output', type=Path, default=Path('private_study/summary.json'))
    args = parser.parse_args(argv)
    try:
        result = summarise(args.input_dir)
    except (OSError, ValueError) as error:
        parser.exit(1, str(error) + '\n')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print('Finalised facilitated participants: ' + str(result['participant_count']))
    print('Practice sessions excluded: ' + str(result['practice_sessions_excluded']))
    print('Local summary: ' + str(args.output))


if __name__ == '__main__':
    main()
