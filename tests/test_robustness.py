"""Functional checks of group isolation, independent selection and event masking."""
from pathlib import Path
import json
import math
import sys

import numpy as np
import pandas as pd
import pytest
from threadpoolctl import threadpool_limits

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src import robustness as r


@pytest.fixture
def development():
    rows = []
    rng = np.random.default_rng(1234)
    for j, module in enumerate(r.MODULES):
        for i in range(80):
            # One real student has different enrolment aliases across modules.
            student = i if i < 3 else 1000 * (j + 1) + i
            days = int(rng.integers(0, 29))
            rows.append({'id': 'S-%s-%03d' % (module, i), 'code_module': module,
                         'code_presentation': '2013J', '_student': student,
                         'outcome': int(i % 3 == 0), 'log_clicks_28': float(rng.random() * 5),
                         'active_days_28': days, 'days_since_last': 28 - days,
                         'no_activity': int(days == 0), 'log_activity_ratio': float(rng.normal()),
                         'activity_day_change': int(rng.integers(-7, 8)),
                         'overdue_fraction': float(i % 2), 'no_due_assessment': 0})
    return pd.DataFrame(rows)


def test_student_groups_are_disjoint_even_when_enrolment_aliases_differ(development):
    for index, module in enumerate(r.MODULES):
        fit, cal, outer, purged = r.prepare_outer(development, module, index)
        assert len(purged) == 12
        assert set(fit['_student']).isdisjoint(cal['_student'])
        assert set(fit['_student']).isdisjoint(outer['_student'])
        assert set(cal['_student']).isdisjoint(outer['_student'])
        assert module not in set(fit.code_module) | set(cal.code_module)
        for inner in sorted(fit.code_module.unique()):
            selection = fit[fit.code_module == inner]
            train = fit[(fit.code_module != inner) & ~fit['_student'].isin(selection['_student'])]
            assert set(train['_student']).isdisjoint(selection['_student'])


def test_outer_labels_cannot_change_selection_or_outer_probabilities(development):
    changed = development.copy()
    changed.loc[changed.code_module == 'BBB', 'outcome'] = 1 - changed.loc[changed.code_module == 'BBB', 'outcome']
    with threadpool_limits(limits=1):
        first, scores, _ = r.outer_fold(development, 'BBB', 0)
        second, scores_changed, _ = r.outer_fold(changed, 'BBB', 0)
    assert first['selection'] == second['selection']
    for method in ['activity', 'trend', 'context', 'nonlinear', 'course_prior']:
        np.testing.assert_array_equal(scores[method], scores_changed[method])
    assert first['positives'] != second['positives']


def test_calibration_labels_never_enter_inner_selection(development):
    fit, cal, _, _ = r.prepare_outer(development, 'BBB', 0)
    changed = development.copy()
    changed.loc[changed.id.isin(cal.id), 'outcome'] = 1 - changed.loc[changed.id.isin(cal.id), 'outcome']
    fit_again, cal_again, _, _ = r.prepare_outer(changed, 'BBB', 0)
    pd.testing.assert_frame_equal(fit, fit_again)
    assert not np.array_equal(cal.outcome, cal_again.outcome)
    with threadpool_limits(limits=1):
        assert r.select_nonlinear(fit) == r.select_nonlinear(fit_again)


def test_laplace_course_prior_and_unseen_fallback_do_not_consult_prediction_labels():
    fit = pd.DataFrame({'code_module': ['BBB', 'BBB', 'DDD'], 'outcome': [1, 0, 0]})
    prior = r.fit_prior(fit)
    assert prior == {'global': 2 / 5, 'modules': {'BBB': 2 / 4, 'DDD': 1 / 3}}
    evaluation = pd.DataFrame({'code_module': ['BBB', 'EEE'], 'outcome': [1, 1]})
    np.testing.assert_array_equal(r.prior_predict(prior, evaluation), [.5, .4])
    evaluation['outcome'] = 0
    np.testing.assert_array_equal(r.prior_predict(prior, evaluation), [.5, .4])


def test_capacity_rounding_and_alias_ties_are_shared_by_methods():
    frame = pd.DataFrame({'id': ['S-C', 'S-A', 'S-B'], 'outcome': [0, 1, 0]})
    first = r.describe_scores(frame, [1, 1, 1], 'context')
    second = r.describe_scores(frame, [90, 90, 90], 'reference')
    assert first['capacities'] == second['capacities']
    assert r.ten(first)['k'] == 1 and r.ten(first)['tp'] == 1
    assert second['brier'] is None
    np.testing.assert_array_equal(r.ranks([1, 1, 1], frame.id), [3, 1, 2])


def test_undefined_metrics_are_explicit():
    frame = pd.DataFrame({'id': ['A', 'B'], 'outcome': [0, 0]})
    report = r.describe_scores(frame, [.1, .2], 'context')
    assert report['average_precision'] is None and report['roc_auc'] is None
    assert report['undefined']['average_precision'] and report['undefined']['roc_auc']
    with pytest.raises(ValueError, match='both outcome classes'):
        r.require_classes(frame, 'Fixture')


@pytest.fixture
def raw_events(tmp_path):
    raw = tmp_path / 'raw'
    raw.mkdir()
    frame = pd.DataFrame([{'id': r.alias('BBB', '2014J', i), 'code_module': 'BBB',
                           'code_presentation': '2014J', '_student': i, 'outcome': int(i == 1)}
                          for i in [1, 2, 3]]).sort_values('id').reset_index(drop=True)
    events = [(1, 1, 2), (1, 21, 3), (1, 25, 5), (1, 26, 7), (1, 28, 11),
              (1, 29, 999), (2, 7, 4), (3, 40, 1000)]
    pd.DataFrame([{'code_module': 'BBB', 'code_presentation': '2014J', 'id_student': i,
                   'id_site': 1, 'date': day, 'sum_click': count} for i, day, count in events]).to_csv(raw / 'studentVle.csv', index=False)
    pd.DataFrame([{'code_module': 'BBB', 'code_presentation': '2014J', 'id_assessment': a,
                   'assessment_type': kind, 'date': day, 'weight': 10}
                  for a, kind, day in [(100, 'TMA', 10), (101, 'CMA', 28),
                                       (102, 'TMA', 29), (103, 'Exam', '?')]]).to_csv(raw / 'assessments.csv', index=False)
    pd.DataFrame([{'id_assessment': a, 'id_student': i, 'date_submitted': day, 'is_banked': bank,
                   'score': 99} for a, i, day, bank in [(100, 1, 9, 0), (101, 1, 27, 0),
                                                       (100, 2, -1, 1), (101, 2, 29, 0)]]).to_csv(raw / 'studentAssessment.csv', index=False)
    return raw, frame


def test_masks_recompute_linked_features_without_changing_day28_population(raw_events):
    raw, frame = raw_events
    original = {p.name: p.read_bytes() for p in raw.iterdir()}
    clean = r.observed_features(raw, frame).set_index('_student')
    delayed = r.observed_features(raw, frame, activity_until=25).set_index('_student')
    sub_delay = r.observed_features(raw, frame, submission_until=25).set_index('_student')
    missing = r.observed_features(raw, frame, missing_ids=[r.alias('BBB', '2014J', 1)]).set_index('_student')
    assert clean.loc[1, 'clicks_28'] == 28
    assert delayed.loc[1, 'clicks_28'] == 10 and delayed.loc[1, 'days_since_last'] == 3
    assert delayed.loc[1, 'clicks_7'] == 5 and delayed.loc[1, 'clicks_previous_7'] == 3
    assert delayed.loc[1, 'log_activity_ratio'] == pytest.approx(math.log1p(5) - math.log1p(3))
    assert clean.loc[1, 'overdue_fraction'] == 0 and sub_delay.loc[1, 'overdue_fraction'] == .5
    assert sub_delay.loc[2, 'submitted_count'] == 1  # The earlier banked record remains visible.
    assert missing.loc[1, 'no_activity'] == 1 and missing.loc[1, 'days_since_last'] == 28
    assert missing.loc[1, 'log_clicks_28'] == missing.loc[1, 'log_activity_ratio'] == 0
    assert missing.loc[1, 'overdue_fraction'] == clean.loc[1, 'overdue_fraction']
    for alternative in [delayed, sub_delay, missing]:
        pd.testing.assert_series_equal(alternative.outcome, clean.outcome)
        pd.testing.assert_series_equal(alternative.id, clean.id)
        pd.testing.assert_series_equal(alternative.due_count, clean.due_count)
    assert original == {p.name: p.read_bytes() for p in raw.iterdir()}


def test_future_events_and_grades_cannot_change_any_stress_features(raw_events):
    raw, frame = raw_events
    configurations = [{}, {'activity_until': 25}, {'submission_until': 25}, {'missing_ids': [frame.id.iloc[0]]}]
    before = [r.observed_features(raw, frame, **config) for config in configurations]
    vle = pd.read_csv(raw / 'studentVle.csv')
    vle.loc[vle.date > 28, 'sum_click'] = 999999
    vle.loc[vle.date > 28, 'date'] = 100
    vle.to_csv(raw / 'studentVle.csv', index=False)
    subs = pd.read_csv(raw / 'studentAssessment.csv')
    subs.loc[subs.date_submitted > 28, 'date_submitted'] = 90
    subs['score'] = 0
    subs.to_csv(raw / 'studentAssessment.csv', index=False)
    for config, expected in zip(configurations, before):
        pd.testing.assert_frame_equal(r.observed_features(raw, frame, **config), expected)


def test_generated_predictions_membership_and_browser_report_agree():
    output = ROOT / 'artifacts/v0.3'
    assert (output / 'report.json').is_file(), 'Run the committed v0.3 protocol before validating its artifacts'
    report_text = (output / 'report.json').read_text()
    report = json.loads(report_text)
    assert (ROOT / 'web/robustness-data.js').read_text() == 'window.LAB_ROBUSTNESS = ' + report_text.rstrip('\n') + ';\n'
    historical_features = pd.read_csv(ROOT / 'artifacts/test_features.csv')
    for part in report['historical']['populations']:
        subset = historical_features if part['module'] == 'ALL' else historical_features[historical_features.code_module == part['module']]
        assert part['assessment_applicability'] == {
            'with_due': int((subset.no_due_assessment == 0).sum()),
            'without_due': int((subset.no_due_assessment == 1).sum()),
        }
        assert sum(part['assessment_applicability'].values()) == part['n']
    assert report['historical']['assessment_applicability_note'].startswith('Post-result descriptive diagnostic')
    predictions = pd.read_csv(output / 'development_predictions.csv')
    membership = pd.read_csv(output / 'development_membership.csv')
    assert len(predictions) == 16196 and predictions.id.is_unique
    assert predictions.student_group_alias.nunique() == 16075
    assert not any(name in predictions.columns for name in ['_student', 'id_student'])
    for fold in report['development']['folds']:
        rows = predictions[predictions.module == fold['module']]
        selected = membership[membership.outer_module == fold['module']]
        groups = {role: set(selected.loc[selected.role == role, 'student_group_alias'])
                  for role in ['fit', 'calibration', 'evaluation']}
        assert groups['fit'].isdisjoint(groups['calibration'])
        assert groups['fit'].isdisjoint(groups['evaluation'])
        assert groups['calibration'].isdisjoint(groups['evaluation'])
        for model in fold['models']:
            expected = r.describe_scores(rows, rows[model['id']], model['id'])
            assert expected['average_precision'] == pytest.approx(model['average_precision'])
            assert expected['roc_auc'] == pytest.approx(model['roc_auc'])
            assert expected['brier'] == pytest.approx(model['brier'])
            assert expected['capacities'] == model['capacities']
        assert fold['fit']['n'] == len(selected[selected.role == 'fit'])
        assert fold['calibration']['n'] == len(selected[selected.role == 'calibration'])
    stress = pd.read_csv(output / 'stress_predictions.csv')
    frozen = pd.read_csv(output / 'historical_predictions.csv').set_index('id')
    for scenario in report['stress']['scenarios']:
        rows = stress[stress.scenario == scenario['id']]
        assert len(rows) == 6362 and rows.id.is_unique
        assert rows.outcome.tolist() == frozen.loc[rows.id].outcome.tolist()
        assert int(rows.affected.sum()) == scenario['affected_n']
        assert scenario['warning'] and all(case['warning'] for case in scenario['cases'])
        for model in scenario['models']:
            expected = r.describe_scores(rows, rows[model['id']], model['id'])
            assert expected['capacities'] == model['stressed']['capacities']
        movement = abs(rows.stressed_context_rank - rows.clean_context_rank)
        expected_cases = rows.assign(movement=movement).loc[rows.affected].sort_values(['movement', 'id'], ascending=[False, True]).head(3).id.tolist()
        assert expected_cases == [case['id'] for case in scenario['cases']]
