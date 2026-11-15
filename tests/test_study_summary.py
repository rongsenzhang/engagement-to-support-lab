"""No simulated/software-test record can silently become participant evidence."""
from copy import deepcopy
import json

import pytest

from src.study_summary import summarise


def fixture(mode='facilitated', code='P1', session_id='STUDY-example-1'):
    return {
        'schema_version': 1, 'app_version': '0.4.0', 'task_set_version': 'synthetic-tutor-tasks-1',
        'session_id': session_id, 'mode': mode, 'participant_code': code if mode == 'facilitated' else '',
        'broad_role': 'Tutor / lecturer', 'adult_confirmed': mode == 'facilitated',
        'consent_confirmed': mode == 'facilitated', 'withdrawal_deadline': '2026-12-01',
        'status': 'completed', 'feedback': {'clarity': 'private free text must not enter summary'},
        'events': [], 'events_truncated': False,
        'tasks': [{'id': task, 'status': 'skipped', 'active_duration_ms': 2000, 'assistance_count': 1,
                   'observation': 'private observation', 'participant_explanation': 'private explanation'}
                  for task in ['patterns', 'context', 'capacity', 'explanation']],
    }


def write(directory, name, value):
    (directory / name).write_text(json.dumps(value), encoding='utf-8')


def test_no_sessions_is_not_research_and_empty_durations_are_null(tmp_path):
    report = summarise(tmp_path)
    assert report['participant_count'] == 0
    assert report['research_status'] == 'no_finalised_facilitated_records'
    assert all(task['mean_active_seconds'] is None for task in report['tasks'])


def test_practice_is_excluded_even_when_all_tasks_are_closed(tmp_path):
    write(tmp_path, 'practice.json', fixture('practice'))
    result = summarise(tmp_path)
    assert result['participant_count'] == 0
    assert result['practice_sessions_excluded'] == 1
    assert all(task['help_requests'] == 0 for task in result['tasks'])


def test_finalised_sessions_count_actions_but_never_export_free_text_or_codes(tmp_path):
    write(tmp_path, 'one.json', fixture())
    second = fixture(code='P2', session_id='STUDY-example-2')
    second['status'] = 'stopped'
    second['tasks'][1]['status'] = 'pending'
    second['tasks'][1]['active_duration_ms'] = 0
    write(tmp_path, 'two.json', second)
    result = summarise(tmp_path)
    assert result['participant_count'] == 2
    assert result['tasks'][0]['status_counts'] == {'skipped': 2}
    assert result['tasks'][1]['status_counts'] == {'skipped': 1, 'pending': 1}
    assert result['tasks'][1]['active_seconds'] == [2]
    exported = json.dumps(result)
    assert 'private observation' not in exported and 'private free text' not in exported
    assert 'P1' not in exported and 'P2' not in exported


@pytest.mark.parametrize('field,value', [('consent_confirmed', False), ('adult_confirmed', False), ('participant_code', 'Name'), ('mode', 'unknown')])
def test_invalid_agreement_or_record_type_is_rejected(tmp_path, field, value):
    session = fixture()
    session[field] = value
    write(tmp_path, 'bad.json', session)
    with pytest.raises(ValueError):
        summarise(tmp_path)


def test_duplicate_export_and_repeated_participant_are_not_double_counted(tmp_path):
    first = fixture()
    write(tmp_path, 'one.json', first)
    write(tmp_path, 'copy.json', first)
    with pytest.raises(ValueError, match='Duplicate session'):
        summarise(tmp_path)
    second = deepcopy(first)
    second['session_id'] = 'STUDY-retest-2'
    write(tmp_path, 'copy.json', second)
    with pytest.raises(ValueError, match='Repeated participant'):
        summarise(tmp_path)


def test_incomplete_sessions_are_not_presented_as_completed_sessions(tmp_path):
    session = fixture()
    session['status'] = 'paused'
    write(tmp_path, 'open.json', session)
    result = summarise(tmp_path)
    assert result['participant_count'] == 0 and result['unfinished_sessions_excluded'] == 1


def test_impossible_complete_task_and_bad_numeric_fields_are_rejected(tmp_path):
    session = fixture()
    session['tasks'][0]['status'] = 'completed'
    write(tmp_path, 'bad.json', session)
    with pytest.raises(ValueError, match='responses'):
        summarise(tmp_path)
    session['tasks'][0]['status'] = 'skipped'
    session['tasks'][0]['active_duration_ms'] = -1
    write(tmp_path, 'bad.json', session)
    with pytest.raises(ValueError, match='timing'):
        summarise(tmp_path)


def test_truncated_event_history_keeps_task_totals_and_reports_its_limit(tmp_path):
    session = fixture()
    session['events'] = [{'task_id': 'patterns', 'event': 'help_requested', 'at': '2026-11-15T12:00:00Z'}] * 500
    session['events_truncated'] = True
    session['tasks'][0]['assistance_count'] = 503
    write(tmp_path, 'one.json', session)
    report = summarise(tmp_path)
    assert report['participant_count'] == 1
    assert report['sessions_with_truncated_events'] == 1
    assert report['tasks'][0]['help_requests'] == 503
    assert report['tasks'][0]['active_seconds'] == [2]


def test_active_time_separates_completion_skipping_and_paused_attempts(tmp_path):
    first = fixture()
    first['tasks'][0].update(status='completed', active_duration_ms=8000,
                             initial_saved_at='2026-11-15T12:00:00Z',
                             initial_response='Observed a decline.', proposed_next_step='Check the timetable.')
    second = fixture(code='P2', session_id='STUDY-example-2')
    second['status'] = 'stopped'
    second['tasks'][1].update(status='paused', active_duration_ms=3000)
    write(tmp_path, 'one.json', first)
    write(tmp_path, 'two.json', second)
    report = summarise(tmp_path)
    assert report['tasks'][0]['mean_active_seconds'] == 5
    assert report['tasks'][0]['active_seconds_by_status'] == {'completed': [8], 'skipped': [2], 'paused': []}
    assert report['tasks'][0]['mean_active_seconds_by_status'] == {'completed': 8, 'skipped': 2, 'paused': None}
    assert report['tasks'][1]['active_seconds_by_status']['paused'] == [3]
    assert 'not task-completion times' in report['interpretation']


@pytest.mark.parametrize('marker,events', [('true', []), (True, []), (False, [{}] * 501)])
def test_invalid_event_history_metadata_is_rejected(tmp_path, marker, events):
    session = fixture()
    session['events_truncated'], session['events'] = marker, events
    write(tmp_path, 'bad.json', session)
    with pytest.raises(ValueError, match='event history'):
        summarise(tmp_path)
