"""Protocol v0.3: module holdouts and explicit event-availability simulations.

The original experiment is read-only. Source student identifiers are used only
in memory for grouping and event joins; public outputs contain enrolment aliases.
"""
from __future__ import annotations

import json
import math
from pathlib import Path
import time

import duckdb
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score
from sklearn.model_selection import GroupShuffleSplit
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from threadpoolctl import threadpool_limits

from src.pipeline import FEATURE_GROUPS, LABELS, MODULES, alias, top_indices

ROOT = Path(__file__).resolve().parents[1]
SEED = 20261115
PROTOCOL_COMMIT = 'c3172732fa333352c270e0214526e2da22c09863'
CAPACITIES = (5, 10, 20)
N_LEAVES = (7, 15, 31)
KEYS = ['code_module', 'code_presentation', '_student']
METHODS = {
    'inactivity': ('Inactivity rule', 'rule'),
    'activity': ('A · Activity', 'probability'),
    'trend': ('B · Activity + trend', 'probability'),
    'context': ('C · Activity + trend + assessment', 'probability'),
    'reference': ('R · Transparent reference', 'index'),
    'course_prior': ('P · Training-only module prior', 'probability'),
    'nonlinear': ('N · Histogram gradient boosting', 'probability'),
}
SIGNALS = list(dict.fromkeys(FEATURE_GROUPS['context'] + [
    'clicks_28', 'clicks_7', 'active_days_7', 'clicks_previous_7',
    'active_days_previous_7', 'due_count', 'overdue_count', 'submitted_count']))


def population(frame):
    return {'n': int(len(frame)), 'students': int(frame['_student'].nunique()),
            'positives': int(frame.outcome.sum()), 'prevalence': float(frame.outcome.mean())}


def read_inputs(root, raw):
    """Recover grouping by the existing alias; reject ambiguous or partial joins."""
    info = pd.read_csv(Path(raw) / 'studentInfo.csv', usecols=['code_module', 'code_presentation', 'id_student'])
    info['id'] = [alias(*row) for row in info[['code_module', 'code_presentation', 'id_student']].itertuples(index=False, name=None)]
    if not info.id.is_unique:
        raise ValueError('Source enrolment aliases are not unique')
    info = info.rename(columns={'id_student': '_student'})
    blocks = {}
    seen = set()
    expected_presentations = {'train': {'2013B', '2013J'}, 'validation': {'2014B'}, 'test': {'2014J'}}
    for name in ('train', 'validation', 'test'):
        table = pd.read_csv(Path(root) / 'artifacts' / (name + '_features.csv'))
        if not table.id.is_unique or not table.outcome.isin([0, 1]).all():
            raise ValueError('Invalid frozen feature identity/outcome')
        table = table.merge(info, on=['id', 'code_module', 'code_presentation'], how='left', validate='one_to_one')
        if table['_student'].isna().any() or set(table.code_presentation) != expected_presentations[name]:
            raise ValueError('Source identity or original split membership mismatch: ' + name)
        table['_student'] = table['_student'].astype(int)
        if set(table['_student']) & seen:
            raise ValueError('A student crosses original temporal splits')
        seen.update(table['_student'])
        if not np.isfinite(table[FEATURE_GROUPS['context']].to_numpy()).all():
            raise ValueError('Non-finite frozen features')
        blocks[name] = table.sort_values('id').reset_index(drop=True)
    return blocks


def fit_prior(frame):
    rates = {module: float((block.outcome.sum() + 1) / (len(block) + 2))
             for module, block in frame.groupby('code_module')}
    return {'global': float((frame.outcome.sum() + 1) / (len(frame) + 2)), 'modules': rates}


def prior_predict(prior, frame):
    return np.asarray([prior['modules'].get(module, prior['global']) for module in frame.code_module])


def describe_scores(frame, scores, model_id):
    y = frame.outcome.to_numpy(dtype=int)
    scores = np.asarray(scores, dtype=float)
    if not len(y) or len(y) != len(scores) or not np.isfinite(scores).all():
        raise ValueError('Population and finite predictions must agree')
    label, kind = METHODS[model_id]
    if kind == 'probability' and ((scores < 0).any() or (scores > 1).any()):
        raise ValueError('Invalid probability')
    positives = int(y.sum())
    capacities = []
    for percent in CAPACITIES:
        selected = top_indices(scores, frame.id, percent / 100)
        tp = int(y[selected].sum())
        capacities.append({'percent': percent, 'k': len(selected), 'tp': tp,
                           'fp': len(selected) - tp, 'fn': positives - tp,
                           'precision': tp / len(selected), 'recall': tp / positives if positives else None})
    return {'id': model_id, 'label': label, 'kind': kind,
            'average_precision': float(average_precision_score(y, scores)) if positives else None,
            'roc_auc': float(roc_auc_score(y, scores)) if len(np.unique(y)) == 2 else None,
            'brier': float(brier_score_loss(y, scores)) if kind == 'probability' else None,
            'undefined': {'average_precision': 'No positive outcomes' if not positives else None,
                          'roc_auc': 'Only one outcome class' if len(np.unique(y)) < 2 else None,
                          'brier': 'Not a probability model' if kind != 'probability' else None},
            'capacities': capacities}


def ten(metrics):
    return next(row for row in metrics['capacities'] if row['percent'] == 10)


def deltas(models):
    by_id = {row['id']: row for row in models}
    output = {}
    for baseline, key in [('trend', 'C_minus_B'), ('activity', 'C_minus_A')]:
        left, right = by_id[baseline], by_id['context']
        output[key] = {'average_precision': None if left['average_precision'] is None or right['average_precision'] is None else right['average_precision'] - left['average_precision'],
                       'precision_at_10': ten(right)['precision'] - ten(left)['precision'],
                       'recall_at_10': None if ten(left)['recall'] is None else ten(right)['recall'] - ten(left)['recall'],
                       'tp_at_10': ten(right)['tp'] - ten(left)['tp']}
    return output


def evaluate_population(frame, predictions, module):
    models = [describe_scores(frame, value, name) for name, value in predictions.items()]
    return {'module': module, **population(frame), 'models': models, 'deltas': deltas(models)}


def historical_report(blocks, root):
    frame = blocks['test']
    published = pd.read_csv(Path(root) / 'artifacts/test_predictions.csv').set_index('id')
    if set(published.index) != set(frame.id) or not np.array_equal(published.loc[frame.id].outcome, frame.outcome):
        raise ValueError('Frozen predictions do not match the historical population')
    reference = json.loads((Path(root) / 'artifacts/v0.2/reference_results.json').read_text())
    reference = {row['id']: row['score'] for row in reference['records']}
    if set(reference) != set(frame.id):
        raise ValueError('Reference population mismatch')
    scores = {name: published.loc[frame.id, name].to_numpy() for name in ('inactivity', 'activity', 'trend', 'context')}
    scores['reference'] = np.asarray([reference[value] for value in frame.id])
    prior = fit_prior(blocks['train'])
    scores['course_prior'] = prior_predict(prior, frame)
    populations = [evaluate_population(frame, scores, 'ALL')]
    for module in MODULES:
        mask = frame.code_module.to_numpy() == module
        populations.append(evaluate_population(frame.loc[mask], {name: value[mask] for name, value in scores.items()}, module))
    for entry in populations:
        subset = frame if entry['module'] == 'ALL' else frame[frame.code_module == entry['module']]
        entry['assessment_applicability'] = {
            'with_due': int((subset.no_due_assessment == 0).sum()),
            'without_due': int((subset.no_due_assessment == 1).sum()),
        }
    return {'populations': populations, 'prior_rates': prior,
            'allocation': {'global_k': ten(populations[0]['models'][0])['k'],
                           'module_k_sum': sum(ten(row['models'][0])['k'] for row in populations[1:])},
            'note': 'Observed 2014J outcomes: descriptive follow-up only. A/B/C/inactivity/R remain frozen. Separate module allocations are not the global review list.',
            'assessment_applicability_note': 'Post-result descriptive diagnostic: counts of records with and without an eligible assessment due by day 28. No due assessment is an applicability condition, not evidence of missing data; these counts did not change models, selection or the fixed protocol.'}, scores


def require_classes(frame, label):
    if set(frame.outcome) != {0, 1}:
        raise ValueError(label + ' lacks both outcome classes; protocol forbids reseeding or dropping this fold')


def prepare_outer(development, module, outer_index):
    frame = development.sort_values('id').reset_index(drop=True)
    outer = frame[frame.code_module == module].copy()
    remaining = frame[frame.code_module != module].copy()
    purged = remaining[remaining['_student'].isin(outer['_student'])].copy()
    remaining = remaining[~remaining['_student'].isin(outer['_student'])].reset_index(drop=True)
    splitter = GroupShuffleSplit(n_splits=1, test_size=.2, random_state=SEED + outer_index)
    fit_index, cal_index = next(splitter.split(remaining, groups=remaining['_student']))
    fit = remaining.iloc[fit_index].sort_values('id').reset_index(drop=True)
    cal = remaining.iloc[cal_index].sort_values('id').reset_index(drop=True)
    require_classes(fit, 'Outer fitting partition')
    require_classes(cal, 'Outer calibration partition')
    return fit, cal, outer, purged


def nonlinear(leaves):
    return HistGradientBoostingClassifier(max_leaf_nodes=leaves, learning_rate=.05,
        max_iter=100, min_samples_leaf=30, l2_regularization=1, early_stopping=False,
        random_state=SEED)


def select_nonlinear(fit):
    candidates = []
    for leaves in N_LEAVES:
        inner_results = []
        for module in sorted(fit.code_module.unique()):
            selection = fit[fit.code_module == module]
            before = fit[fit.code_module != module]
            training = before[~before['_student'].isin(selection['_student'])]
            require_classes(training, 'Inner fitting partition')
            if not selection.outcome.sum():
                raise ValueError('Inner selection AP undefined; protocol cannot choose a setting')
            model = nonlinear(leaves)
            model.fit(training[FEATURE_GROUPS['context']], training.outcome)
            predicted = model.predict_proba(selection[FEATURE_GROUPS['context']])[:, 1]
            inner_results.append({'module': module, 'average_precision': float(average_precision_score(selection.outcome, predicted)),
                                  'fit_n': len(training), 'fit_positives': int(training.outcome.sum()),
                                  'selection_n': len(selection), 'selection_positives': int(selection.outcome.sum()),
                                  'purged_n': len(before) - len(training),
                                  'student_overlap': len(set(training['_student']) & set(selection['_student']))})
        candidates.append({'max_leaf_nodes': leaves, 'mean_ap': float(np.mean([r['average_precision'] for r in inner_results])), 'inner': inner_results})
    selected = max(candidates, key=lambda row: (row['mean_ap'], -row['max_leaf_nodes']))['max_leaf_nodes']
    return {'selected_max_leaf_nodes': selected, 'candidates': candidates}


def fit_calibrated(fit, calibration, model_id, leaves=None):
    features = FEATURE_GROUPS['context' if model_id == 'nonlinear' else model_id]
    model = nonlinear(leaves) if model_id == 'nonlinear' else make_pipeline(
        StandardScaler(), LogisticRegression(C=1, max_iter=2000, random_state=SEED))
    model.fit(fit[features], fit.outcome)
    raw = model.decision_function(calibration[features]).reshape(-1, 1)
    calibrator = LogisticRegression(C=1e6, max_iter=2000, random_state=SEED)
    calibrator.fit(raw, calibration.outcome)
    return {'model': model, 'calibrator': calibrator, 'features': list(features)}


def predict(bundle, frame):
    return bundle['calibrator'].predict_proba(bundle['model'].decision_function(frame[bundle['features']]).reshape(-1, 1))[:, 1]


def outer_fold(development, module, outer_index):
    fit, calibration, outer, purged = prepare_outer(development, module, outer_index)
    selection = select_nonlinear(fit)
    predictions = {}
    for model_id in ('activity', 'trend', 'context', 'nonlinear'):
        bundle = fit_calibrated(fit, calibration, model_id, selection['selected_max_leaf_nodes'])
        predictions[model_id] = predict(bundle, outer)
    prior = fit_prior(fit)
    predictions['course_prior'] = prior_predict(prior, outer)
    report = evaluate_population(outer, predictions, module)
    report.update({'fit': population(fit), 'calibration': population(calibration),
                   'evaluation': population(outer), 'purged_n': len(purged),
                   'selection': selection, 'prior_rates': prior,
                   'isolation': {'fit_calibration': len(set(fit['_student']) & set(calibration['_student'])),
                                 'fit_outer': len(set(fit['_student']) & set(outer['_student'])),
                                 'calibration_outer': len(set(calibration['_student']) & set(outer['_student'])),
                                 'outer_module_in_fit': int((fit.code_module == module).sum())}})
    if any(report['isolation'].values()) or any(r['student_overlap'] for c in selection['candidates'] for r in c['inner']):
        raise ValueError('Student or module isolation failed')
    group_aliases = development.groupby('_student').id.min().to_dict()
    table = outer[['id', 'code_module', 'outcome']].rename(columns={'code_module': 'module'}).copy()
    table['student_group_alias'] = outer['_student'].map(group_aliases)
    table['outer_module'] = module
    for name, values in predictions.items():
        table[name] = values
    memberships = []
    for role, part in [('fit', fit), ('calibration', calibration), ('evaluation', outer), ('purged', purged)]:
        memberships.extend({'outer_module': module, 'id': row['id'], 'module': row['code_module'],
                            'role': role, 'student_group_alias': group_aliases[row['_student']]}
                           for row in part.to_dict('records'))
    return report, table, memberships


def development_report(development):
    folds, predictions, memberships = [], [], []
    for index, module in enumerate(MODULES):
        print('Development outer module:', module, flush=True)
        report, table, membership = outer_fold(development, module, index)
        folds.append(report)
        predictions.append(table)
        memberships.extend(membership)
    predicted = pd.concat(predictions).sort_values('id').reset_index(drop=True)
    if len(predicted) != len(development) or not predicted.id.is_unique or set(predicted.id) != set(development.id):
        raise ValueError('Outer predictions must cover each development enrolment once')
    frame = development.set_index('id').loc[predicted.id].reset_index()
    method_ids = ('activity', 'trend', 'context', 'nonlinear', 'course_prior')
    pooled = evaluate_population(frame, {name: predicted[name].to_numpy() for name in method_ids}, 'POOLED_OOF')
    macro = []
    for name in method_ids:
        metrics = [next(m for m in fold['models'] if m['id'] == name) for fold in folds]
        item = {'id': name, 'label': METHODS[name][0], 'folds': len(folds)}
        for field in ('average_precision', 'roc_auc', 'brier'):
            values = [m[field] for m in metrics if m[field] is not None]
            item[field] = float(np.mean(values)) if values else None
            item[field + '_defined_folds'] = len(values)
        for field in ('precision', 'recall'):
            values = [ten(m)[field] for m in metrics if ten(m)[field] is not None]
            item[field + '_at_10'] = float(np.mean(values)) if values else None
        macro.append(item)
    return {'population': population(development), 'folds': folds, 'macro': macro, 'pooled': pooled,
            'note': 'Five development leave-module-out folds; inner selection and independent student-group calibration. Macro gives each module equal weight. Pooled OOF combines different fitted models, not one population-wide model. No 2014J selection or new 2014J nonlinear predictions.'}, predicted, pd.DataFrame(memberships)


def observed_features(raw, frame, activity_until=28, submission_until=28, missing_ids=()):
    """Recompute available events at the fixed day-28 snapshot; do not change labels."""
    if activity_until not in (25, 28) or submission_until not in (25, 28):
        raise ValueError('Only the specified day-28 availability masks are supported')
    raw = Path(raw)
    con = duckdb.connect()
    try:
        sql_path = str(raw / 'studentVle.csv').replace("'", "''")
        activity = con.execute(f"""SELECT code_module,code_presentation,id_student AS _student,
            sum(sum_click) AS clicks_28,count(distinct date) AS active_days_28,max(date) AS last_day,
            sum(CASE WHEN date BETWEEN 22 AND 28 THEN sum_click ELSE 0 END) AS clicks_7,
            count(distinct CASE WHEN date BETWEEN 22 AND 28 THEN date END) AS active_days_7,
            sum(CASE WHEN date BETWEEN 15 AND 21 THEN sum_click ELSE 0 END) AS clicks_previous_7,
            count(distinct CASE WHEN date BETWEEN 15 AND 21 THEN date END) AS active_days_previous_7
            FROM read_csv_auto('{sql_path}') WHERE date BETWEEN 1 AND {activity_until} AND sum_click>0
            GROUP BY code_module,code_presentation,id_student""").df()
    finally:
        con.close()
    result = frame[['id', *KEYS, 'outcome']].merge(activity, on=KEYS, how='left', validate='one_to_one')
    missing = result.id.isin(set(missing_ids))
    activity_columns = ['clicks_28', 'active_days_28', 'last_day', 'clicks_7', 'active_days_7', 'clicks_previous_7', 'active_days_previous_7']
    result.loc[missing, activity_columns] = np.nan
    result['no_activity'] = result.last_day.isna().astype(int)
    result['days_since_last'] = (28 - result.last_day).fillna(28)
    for field in set(activity_columns) - {'last_day'}:
        result[field] = result[field].fillna(0)
    result['log_clicks_28'] = np.log1p(result.clicks_28)
    result['log_activity_ratio'] = np.log1p(result.clicks_7) - np.log1p(result.clicks_previous_7)
    result['activity_day_change'] = result.active_days_7 - result.active_days_previous_7
    assessments = pd.read_csv(raw / 'assessments.csv', na_values=['?'])
    due = assessments[(assessments.date <= 28) & assessments.assessment_type.isin(['TMA', 'CMA'])]
    subs = pd.read_csv(raw / 'studentAssessment.csv', na_values=['?'], usecols=['id_assessment', 'id_student', 'date_submitted', 'is_banked'])
    subs = subs[subs.date_submitted <= submission_until].sort_values('date_submitted').drop_duplicates(['id_assessment', 'id_student'])
    subs = subs.rename(columns={'id_student': '_student'})
    expected = frame[KEYS].merge(due[['code_module', 'code_presentation', 'id_assessment']], on=['code_module', 'code_presentation'], how='left')
    expected = expected.merge(subs, on=['id_assessment', '_student'], how='left', validate='many_to_one')
    expected['is_due'] = expected.id_assessment.notna().astype(int)
    expected['submitted'] = (expected.is_due.astype(bool) & expected.date_submitted.notna()).astype(int)
    counts = expected.groupby(KEYS, as_index=False).agg(due_count=('is_due', 'sum'), submitted_count=('submitted', 'sum'))
    result = result.merge(counts, on=KEYS, how='left', validate='one_to_one')
    result['overdue_count'] = result.due_count - result.submitted_count
    result['overdue_fraction'] = np.where(result.due_count > 0, result.overdue_count / result.due_count.replace(0, 1), 0)
    result['no_due_assessment'] = (result.due_count == 0).astype(int)
    return result.sort_values('id').reset_index(drop=True)


def ranks(scores, ids):
    ordering = np.lexsort((np.asarray(ids, dtype=str), -np.asarray(scores)))
    result = np.empty(len(scores), dtype=int)
    result[ordering] = np.arange(1, len(scores) + 1)
    return result


def contribution_detail(bundle, row):
    features = bundle['features']
    x = pd.DataFrame([{feature: float(row[feature]) for feature in features}])
    scaler = bundle['model'].named_steps['standardscaler']
    lr = bundle['model'].named_steps['logisticregression']
    terms = scaler.transform(x)[0] * lr.coef_[0] * bundle['calibrator'].coef_[0, 0]
    return [{'feature': feature, 'label': LABELS[feature], 'contribution': float(value)}
            for feature, value in zip(features, terms)]


def stress_report(frame, raw, bundles, frozen_scores):
    clean = observed_features(raw, frame)
    if clean.id.tolist() != frame.id.tolist() or not np.array_equal(clean.outcome, frame.outcome):
        raise ValueError('Event reconstruction changed the fixed historical cohort')
    np.testing.assert_allclose(clean[FEATURE_GROUPS['context']], frame[FEATURE_GROUPS['context']], rtol=0, atol=1e-10)
    baseline = {name: predict(bundles[name], clean) for name in ('activity', 'trend', 'context')}
    for name, scores in baseline.items():
        np.testing.assert_allclose(scores, frozen_scores[name], rtol=0, atol=1e-10)
    rng = np.random.default_rng(SEED)
    chosen = set(frame.id.iloc[rng.choice(len(frame), size=math.ceil(.10 * len(frame)), replace=False)])
    definitions = [
        ('activity_delay', 'Activity events from days 26–28 delayed', {'activity_until': 25}),
        ('submission_delay', 'Submission events from days 26–28 delayed', {'submission_until': 25}),
        ('activity_missing', 'Activity feed missing for a seeded 10% of enrolments', {'missing_ids': chosen}),
    ]
    scenarios, tables = [], []
    warning = 'Simulated data-quality impairment: verify the activity/submission feed before interpreting a changed score. Missing traces are not evidence of no learning.'
    baseline_metrics = {name: describe_scores(clean, value, name) for name, value in baseline.items()}
    for scenario_id, label, config in definitions:
        print('Stress scenario:', scenario_id, flush=True)
        stressed = observed_features(raw, frame, **config)
        if stressed.id.tolist() != clean.id.tolist() or not np.array_equal(stressed.outcome, clean.outcome):
            raise ValueError('Stress simulation changed eligibility or labels')
        changed = np.any(np.abs(stressed[FEATURE_GROUPS['context']].to_numpy() - clean[FEATURE_GROUPS['context']].to_numpy()) > 1e-12, axis=1)
        affected = stressed.id.isin(chosen).to_numpy() if scenario_id == 'activity_missing' else changed.copy()
        predictions = {name: predict(bundles[name], stressed) for name in baseline}
        model_rows = []
        for name, scores in predictions.items():
            before = baseline[name]
            old_rank, new_rank = ranks(before, clean.id), ranks(scores, clean.id)
            overlap = []
            for percent in CAPACITIES:
                first = set(top_indices(before, clean.id, percent / 100))
                second = set(top_indices(scores, clean.id, percent / 100))
                intersection = len(first & second)
                overlap.append({'percent': percent, 'k': len(first), 'intersection': intersection,
                                'turnover': len(first) - intersection, 'jaccard': intersection / len(first | second)})
            model_rows.append({'id': name, 'label': METHODS[name][0], 'baseline': baseline_metrics[name],
                               'stressed': describe_scores(clean, scores, name), 'overlap': overlap,
                               'mean_abs_probability_change': float(np.mean(np.abs(scores - before))),
                               'max_abs_probability_change': float(np.max(np.abs(scores - before))),
                               'median_abs_rank_change': float(np.median(np.abs(new_rank - old_rank))),
                               'max_abs_rank_change': int(np.max(np.abs(new_rank - old_rank)))})
        original_rank = ranks(baseline['context'], clean.id)
        stressed_rank = ranks(predictions['context'], clean.id)
        indices = sorted(np.flatnonzero(affected), key=lambda index: (-abs(int(stressed_rank[index]) - int(original_rank[index])), clean.id.iloc[index]))[:3]
        cases = []
        for index in indices:
            case = {'id': clean.id.iloc[index], 'module': clean.code_module.iloc[index], 'warning': warning}
            for key, data, values, order in [('clean', clean, baseline['context'], original_rank), ('stressed', stressed, predictions['context'], stressed_rank)]:
                row = data.iloc[index]
                case[key] = {'probability': float(values[index]), 'rank': int(order[index]),
                             'signals': {feature: float(row[feature]) for feature in SIGNALS},
                             'contributions': contribution_detail(bundles['context'], row)}
            cases.append(case)
        scenarios.append({'id': scenario_id, 'label': label, 'n': len(clean), 'affected_n': int(affected.sum()),
                          'changed_n': int(changed.sum()), 'warning': warning, 'models': model_rows, 'cases': cases,
                          'affected_definition': 'Seeded enrolments, including records already without activity' if scenario_id == 'activity_missing' else 'Enrolments with at least one changed model input after hiding events'})
        table = clean[['id', 'code_module', 'outcome']].rename(columns={'code_module': 'module'}).copy()
        table.insert(0, 'scenario', scenario_id)
        table['affected'] = affected
        table['input_changed'] = changed
        for name, scores in predictions.items():
            table[name] = scores
        table['clean_context_rank'] = original_rank
        table['stressed_context_rank'] = stressed_rank
        tables.append(table)
    return {'scenarios': scenarios, 'note': 'Artificial availability masks at the unchanged day-28 snapshot. Frozen models are rescored without fitting. These are naive score responses, not a missing-data policy or measured feed reliability.'}, pd.concat(tables, ignore_index=True)


def flatten_metrics(report):
    rows = []
    populations = [('historical', p) for p in report['historical']['populations']]
    populations += [('development', p) for p in report['development']['folds']]
    populations += [('development', report['development']['pooled'])]
    for stage, part in populations:
        for model in part['models']:
            for capacity in model['capacities']:
                rows.append({'stage': stage, 'module': part['module'], 'model': model['id'],
                             'n': part['n'], 'positives': part['positives'],
                             **{name: model[name] for name in ('average_precision', 'roc_auc', 'brier')}, **capacity})
    return pd.DataFrame(rows)


def build_robustness(raw, root=ROOT):
    started = time.monotonic()
    root, raw = Path(root), Path(raw)
    blocks = read_inputs(root, raw)
    development = pd.concat([blocks['train'], blocks['validation']]).sort_values('id').reset_index(drop=True)
    if len(development) != 16196 or development['_student'].nunique() != 16075 or len(blocks['test']) != 6362:
        raise ValueError('Population differs from the committed v0.3 protocol')
    with threadpool_limits(limits=1):
        historical, historical_scores = historical_report(blocks, root)
        development_result, development_predictions, memberships = development_report(development)
        bundles = joblib.load(root / 'artifacts/models.joblib')
        stress, stress_predictions = stress_report(blocks['test'], raw, bundles, historical_scores)
    report = {'meta': {'version': '0.3.0', 'protocol_commit': PROTOCOL_COMMIT, 'seed': SEED,
                       'notes': ['Exploratory public historical research, not contemporary institutional validation.',
                                 'B to C adds assessment features; A to C adds trend and assessment.',
                                 'No changes to frozen predictions, no intervention-effect claim, and no completed tutor study.',
                                 'Source student identities are used only for grouping/event joins and are absent from public outputs.']},
              'historical': historical, 'development': development_result, 'stress': stress}
    text = json.dumps(report, ensure_ascii=False, allow_nan=False, separators=(',', ':'))
    output = root / 'artifacts/v0.3'
    output.mkdir(parents=True, exist_ok=True)
    (output / 'report.json').write_text(text + '\n', encoding='utf-8')
    (root / 'web/robustness-data.js').write_text('window.LAB_ROBUSTNESS = ' + text + ';\n', encoding='utf-8')
    historical_table = blocks['test'][['id', 'code_module', 'outcome']].rename(columns={'code_module': 'module'}).copy()
    for name, scores in historical_scores.items():
        historical_table[name] = scores
    historical_table.to_csv(output / 'historical_predictions.csv', index=False)
    development_predictions.to_csv(output / 'development_predictions.csv', index=False)
    memberships.to_csv(output / 'development_membership.csv', index=False)
    stress_predictions.to_csv(output / 'stress_predictions.csv', index=False)
    flatten_metrics(report).to_csv(output / 'metrics.csv', index=False)
    print('Completed v0.3 in %.1f seconds' % (time.monotonic() - started), flush=True)
    return report
