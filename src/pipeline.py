"""Reproducible, point-in-time OULAD experiment. No fabricated data/results."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import platform
from datetime import datetime, timezone
from pathlib import Path

import duckdb
import joblib
import numpy as np
import pandas as pd
import sklearn
from scipy.special import expit
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parents[1]
KEYS = ['code_module', 'code_presentation', 'id_student']
MODULES = ['BBB', 'DDD', 'EEE', 'FFF', 'GGG']
FEATURE_GROUPS = {
    'activity': ['log_clicks_28', 'active_days_28', 'days_since_last', 'no_activity'],
    'trend': ['log_clicks_28', 'active_days_28', 'days_since_last', 'no_activity',
              'log_activity_ratio', 'activity_day_change'],
    'context': ['log_clicks_28', 'active_days_28', 'days_since_last', 'no_activity',
                'log_activity_ratio', 'activity_day_change', 'overdue_fraction', 'no_due_assessment'],
}
LABELS = {
    'log_clicks_28': 'Recorded activity volume', 'active_days_28': 'Active days in first 28 days',
    'days_since_last': 'Days since last recorded activity', 'no_activity': 'No recorded activity',
    'log_activity_ratio': 'Recent activity versus previous week', 'activity_day_change': 'Change in active days',
    'overdue_fraction': 'Share of due assessments not recorded as submitted',
    'no_due_assessment': 'No assessment due by snapshot',
}
MODEL_LABELS = {'inactivity': 'Inactivity rule', 'activity': 'A · Activity',
                'trend': 'B · Activity + trend', 'context': 'C · Activity + trend + assessment'}


def read_csv(raw: Path, name: str, **kwargs):
    return pd.read_csv(raw / name, na_values=['?'], **kwargs)


def alias(module, presentation, student):
    value = f'{module}:{presentation}:{int(student)}'.encode()
    return 'S-' + hashlib.sha256(value).hexdigest()[:10].upper()


def build_features(raw_dir: Path, cutoff: int = 28, modules=None) -> pd.DataFrame:
    """Return eligible enrollment rows; outcomes are separate from explicit feature allowlist.

    Recorded clicks use course days 1..cutoff. Assessment expectations use known
    TMA/CMA deadlines <=cutoff, and only submissions timestamped <=cutoff.
    Banked credits dated -1 are satisfied; unavailable grades never enter features.
    """
    raw = Path(raw_dir)
    modules = MODULES if modules is None else modules
    info = read_csv(raw, 'studentInfo.csv')
    reg = read_csv(raw, 'studentRegistration.csv')
    courses = read_csv(raw, 'courses.csv')
    df = info.merge(reg, on=KEYS, validate='one_to_one').merge(
        courses, on=['code_module', 'code_presentation'], validate='many_to_one')
    counts = {'source_enrollments': int(len(df))}
    df = df[df.code_module.isin(modules)].copy()
    counts['in_selected_modules'] = int(len(df))
    counts['outside_selected_modules'] = counts['source_enrollments'] - len(df)
    # Sequential mutually exclusive exclusions, retained in the audit trail.
    for reason, mask in [
        ('missing_registration_date', lambda x: x.date_registration.isna()),
        ('registered_after_snapshot', lambda x: x.date_registration > cutoff),
        ('withdrawn_by_snapshot', lambda x: x.date_unregistration.notna() & (x.date_unregistration <= cutoff)),
        ('withdrawal_after_course_end', lambda x: x.date_unregistration > x.module_presentation_length),
    ]:
        m = mask(df)
        counts[reason] = int(m.sum())
        df = df[~m].copy()
    df['outcome'] = (df.date_unregistration.notna() & (df.date_unregistration > cutoff)).astype(int)
    df['id'] = [alias(*r) for r in df[KEYS].itertuples(index=False, name=None)]
    assert df.id.is_unique, 'Alias collision or duplicate enrollment'

    con = duckdb.connect()
    path_sql = str(raw / 'studentVle.csv').replace("'", "''")
    expressions = [
        'sum(sum_click) AS clicks_28', 'count(distinct date) AS active_days_28', 'max(date) AS last_day',
        f'sum(CASE WHEN date > {cutoff-7} THEN sum_click ELSE 0 END) AS clicks_7',
        f'count(distinct CASE WHEN date > {cutoff-7} THEN date END) AS active_days_7',
        f'sum(CASE WHEN date BETWEEN {cutoff-13} AND {cutoff-7} THEN sum_click ELSE 0 END) AS clicks_previous_7',
        f'count(distinct CASE WHEN date BETWEEN {cutoff-13} AND {cutoff-7} THEN date END) AS active_days_previous_7',
    ]
    for w in range(4):
        expressions.append(f'sum(CASE WHEN date BETWEEN {w*7+1} AND {w*7+7} THEN sum_click ELSE 0 END) AS week_{w+1}')
    sql = f"""SELECT code_module,code_presentation,id_student,{','.join(expressions)}
        FROM read_csv_auto('{path_sql}') WHERE date BETWEEN 1 AND {int(cutoff)} AND sum_click>0
        GROUP BY code_module,code_presentation,id_student"""
    clicks = con.execute(sql).df()
    con.close()
    df = df.merge(clicks, on=KEYS, how='left', validate='one_to_one')
    df['no_activity'] = df.last_day.isna().astype(int)
    df['days_since_last'] = (cutoff - df.last_day).fillna(cutoff)
    click_cols = ['clicks_28', 'active_days_28', 'clicks_7', 'active_days_7',
                  'clicks_previous_7', 'active_days_previous_7'] + [f'week_{w+1}' for w in range(4)]
    df[click_cols] = df[click_cols].fillna(0)
    df['log_clicks_28'] = np.log1p(df.clicks_28)
    df['log_activity_ratio'] = np.log1p(df.clicks_7) - np.log1p(df.clicks_previous_7)
    df['activity_day_change'] = df.active_days_7 - df.active_days_previous_7

    assessments = read_csv(raw, 'assessments.csv')
    due = assessments[(assessments.date <= cutoff) & assessments.assessment_type.isin(['TMA', 'CMA'])]
    # Score column is deliberately not even loaded: publication timing is unknown.
    subs = read_csv(raw, 'studentAssessment.csv', usecols=['id_assessment', 'id_student', 'date_submitted', 'is_banked'])
    subs = subs[subs.date_submitted <= cutoff].sort_values('date_submitted')
    subs = subs.drop_duplicates(['id_assessment', 'id_student'])
    expected = df[KEYS].merge(due[['code_module', 'code_presentation', 'id_assessment', 'date']],
                             on=['code_module', 'code_presentation'], how='left')
    expected = expected.merge(subs, on=['id_assessment', 'id_student'], how='left', validate='many_to_one')
    expected['is_due'] = expected.id_assessment.notna().astype(int)
    expected['observed_submission'] = (expected.is_due.astype(bool) & expected.date_submitted.notna()).astype(int)
    expected['not_observed'] = expected.is_due - expected.observed_submission
    ass = expected.groupby(KEYS, as_index=False).agg(due_count=('is_due','sum'),
                submitted_count=('observed_submission','sum'), overdue_count=('not_observed','sum'))
    df = df.merge(ass, on=KEYS, how='left', validate='one_to_one')
    df['overdue_fraction'] = np.where(df.due_count > 0, df.overdue_count / df.due_count.replace(0,1), 0)
    df['no_due_assessment'] = (df.due_count == 0).astype(int)
    df = df.sort_values('id').reset_index(drop=True)
    counts['eligible_before_split_dedup'] = int(len(df))
    df.attrs['exclusions'] = counts
    df.attrs['cutoff'] = cutoff
    return df


def split_data(df):
    """Keep an eligible student's records only in their earliest available split."""
    definitions = {'train': ['2013B','2013J'], 'validation': ['2014B'], 'test': ['2014J']}
    splits, removed, seen = {}, {}, set()
    for name, presentations in definitions.items():
        block = df[df.code_presentation.isin(presentations)].copy()
        duplicate = block.id_student.isin(seen)
        removed[name] = int(duplicate.sum())
        block = block[~duplicate].sort_values('id').reset_index(drop=True)
        seen.update(block.id_student.tolist())
        splits[name] = block
    return splits, removed


def top_indices(scores, ids, fraction=.1):
    k = max(1, int(math.ceil(len(scores)*fraction)))
    return np.lexsort((np.asarray(ids, dtype=str), -np.asarray(scores)))[:k]


def capacity_metrics(y, scores, ids, percent):
    y = np.asarray(y)
    ix = top_indices(scores, ids, percent/100)
    tp = int(y[ix].sum())
    return {'percent':percent, 'k':len(ix), 'tp':tp, 'fp':int(len(ix)-tp),
            'precision':tp/len(ix), 'recall':tp/int(y.sum()) if y.sum() else None}


def evaluate(y, scores, ids, probability=True):
    y, scores = np.asarray(y), np.asarray(scores)
    cap = capacity_metrics(y, scores, ids, 10)
    return {'average_precision':float(average_precision_score(y,scores)),
            'roc_auc':float(roc_auc_score(y,scores)) if len(np.unique(y))==2 else None,
            'brier':float(brier_score_loss(y,scores)) if probability else None,
            'precision_at_10pct':cap['precision'], 'recall_at_10pct':cap['recall']}


def calibration_bins(y,p):
    out=[]
    # Fixed bins disclose sample count; empty bins are omitted, not invented.
    for lo in np.arange(0,1,.1):
        mask=(p>=lo)&(p<lo+.1 if lo<.89 else p<=1)
        if mask.sum(): out.append({'mean_pred':float(np.mean(p[mask])), 'observed':float(np.mean(y[mask])), 'n':int(mask.sum())})
    return out


def subgroup_audit(test,p):
    flagged=np.zeros(len(test),dtype=bool)
    flagged[top_indices(p,test.id)]=True
    y=test.outcome.to_numpy()
    rows=[]
    for attr in ['gender','age_band','disability']:
        for group in sorted(test[attr].dropna().unique()):
            mask=test[attr].to_numpy()==group
            n,pos=int(mask.sum()),int(y[mask].sum())
            if n<100 or pos<20 or n-pos<20: continue
            tp=int(np.sum(mask&flagged&(y==1))); fp=int(np.sum(mask&flagged&(y==0)))
            rows.append({'attribute':attr,'group':str(group),'n':n,'positives':pos,
                         'flagged':tp+fp,'tp':tp,'fp':fp,'fn':pos-tp,
                         'recall':tp/pos,'fpr':fp/(n-pos),'precision':tp/(tp+fp) if tp+fp else None})
    return rows


def paired_bootstrap(test, predictions, repetitions=200):
    """Student-cluster bootstrap for paired C-minus-A AP on held-out data."""
    groups=[np.flatnonzero(test.id_student.to_numpy()==sid) for sid in test.id_student.unique()]
    rng=np.random.default_rng(20261108)
    y=test.outcome.to_numpy(); deltas=[]
    for _ in range(repetitions):
        ix=np.concatenate([groups[j] for j in rng.integers(0,len(groups),len(groups))])
        deltas.append(average_precision_score(y[ix],predictions['context'][ix])-average_precision_score(y[ix],predictions['activity'][ix]))
    return {'comparison':'C minus A: average precision', 'resampling_unit':'student', 'repetitions':repetitions,
            'estimate':float(average_precision_score(y,predictions['context'])-average_precision_score(y,predictions['activity'])),
            'ci95_percentile':[float(x) for x in np.percentile(deltas,[2.5,97.5])],
            'note':'Within this held-out cohort only; does not quantify uncertainty across institutions.'}


def run(raw, output, cutoff=28):
    if cutoff!=28: raise ValueError('v1 protocol is fixed at day28; change the protocol explicitly for other cutoffs.')
    output=Path(output); output.mkdir(parents=True,exist_ok=True)
    print('Building point-in-time features...',flush=True)
    df=build_features(raw,cutoff); counts=df.attrs['exclusions']; splits, removed=split_data(df)
    train,val,test=[splits[x] for x in ['train','validation','test']]
    print('Split enrollments:',{k:len(v) for k,v in splits.items()},flush=True)
    checks={'finite_features':bool(np.isfinite(df[FEATURE_GROUPS['context']].to_numpy()).all()),
            'active_at_snapshot':bool((df.date_registration<=cutoff).all() and (df.date_unregistration.isna()|(df.date_unregistration>cutoff)).all()),
            'student_overlap_train_validation':len(set(train.id_student)&set(val.id_student)),
            'student_overlap_train_test':len(set(train.id_student)&set(test.id_student)),
            'student_overlap_validation_test':len(set(val.id_student)&set(test.id_student)),
            'sensitive_predictors':[], 'label_or_future_predictors':[], 'score_columns_loaded':False,
            'cutoff_day':cutoff,'test_alias_unique':bool(test.id.is_unique)}
    assert checks['finite_features'] and checks['active_at_snapshot'] and checks['test_alias_unique']
    assert not any(checks[k] for k in checks if k.startswith('student_overlap'))
    model_results=[]; predictions={}; contributions={}; bundles={}; validation={}
    ytest=test.outcome.to_numpy(); yval=val.outcome.to_numpy()
    for name, features in FEATURE_GROUPS.items():
        model=make_pipeline(StandardScaler(),LogisticRegression(C=1.0,max_iter=2000,random_state=42))
        model.fit(train[features],train.outcome)
        val_logit=model.decision_function(val[features])
        calibrator=LogisticRegression(C=1e6,max_iter=2000,random_state=42)
        calibrator.fit(val_logit.reshape(-1,1),yval)
        test_logit=model.decision_function(test[features])
        prob=calibrator.predict_proba(test_logit.reshape(-1,1))[:,1]
        validation[name]=evaluate(yval,calibrator.predict_proba(val_logit.reshape(-1,1))[:,1],val.id)
        predictions[name]=prob
        scaler=model.named_steps['standardscaler']; lr=model.named_steps['logisticregression']
        adjusted_coef=lr.coef_[0]*calibrator.coef_[0,0]
        terms=scaler.transform(test[features])*adjusted_coef
        intercept=float(lr.intercept_[0]*calibrator.coef_[0,0]+calibrator.intercept_[0])
        assert np.allclose(expit(terms.sum(axis=1)+intercept),prob,atol=1e-10)
        contributions[name]=terms
        metrics=evaluate(ytest,prob,test.id)
        model_results.append({'id':name,'label':MODEL_LABELS[name],'kind':'logistic','features':features,
            'metrics':metrics,'validation_metrics':validation[name], 'calibration':calibration_bins(ytest,prob),
            'capacity':[capacity_metrics(ytest,prob,test.id,p) for p in [5,10,15,20,30,40,50]],
            'coefficients':[{'feature':f,'label':LABELS[f],'coefficient':float(c)} for f,c in zip(features,adjusted_coef)],
            'intercept':intercept,'calibration_slope':float(calibrator.coef_[0,0])})
        bundles[name]={'model':model,'calibrator':calibrator,'features':features}
        print(name,metrics,flush=True)
    selected=max(FEATURE_GROUPS,key=lambda k:(validation[k]['average_precision'],-validation[k]['brier']))
    rule=test.days_since_last.to_numpy()
    predictions['inactivity']=rule
    model_results.insert(0,{'id':'inactivity','label':MODEL_LABELS['inactivity'],'kind':'rule',
          'features':['days_since_last'],'metrics':evaluate(ytest,rule,test.id,False),
          'calibration':[],'capacity':[capacity_metrics(ytest,rule,test.id,p) for p in [5,10,15,20,30,40,50]],'coefficients':[]})
    signals=['clicks_28','active_days_28','clicks_7','active_days_7','clicks_previous_7','active_days_previous_7',
             'days_since_last','no_activity','log_activity_ratio','activity_day_change','due_count',
             'overdue_count','submitted_count','overdue_fraction','no_due_assessment']
    students=[]
    for i,row in enumerate(test.to_dict(orient='records')):
        item={'id':row['id'],'module':row['code_module'],'presentation':row['code_presentation'],
              'outcome':int(row['outcome']), 'scores':{name:float(v[i]) for name,v in predictions.items()},
              'signals':{s:float(row[s]) for s in signals}, 'weeks':[float(row[f'week_{w}']) for w in range(1,5)],'contributions':{}}
        for name,features in FEATURE_GROUPS.items():
            terms=[{'feature':f,'label':LABELS[f],'value':float(row[f]),'contribution':float(v)} for f,v in zip(features,contributions[name][i])]
            item['contributions'][name]=sorted(terms,key=lambda x:x['contribution'],reverse=True)
        students.append(item)
    research_file=ROOT/'docs/research.json'
    research=json.loads(research_file.read_text()) if research_file.exists() else []
    if isinstance(research,dict): research=research.get('research',research.get('cards',[]))
    limits=[
      'Independent application prototype; not a Kortext product, integration or reproduction of its proprietary algorithm.',
      'Historical, anonymised Open University distance-learning records from 2013–2014. No contemporary or external-institution validation.',
      'Target is later withdrawal from a module, not university dropout, psychological disengagement or mental health.',
      'No classroom timetable, offline study, extensions, personal circumstances or intervention outcomes are available.',
      'No recorded activity is not proof of no learning or of a data-feed outage. Missing assessment records need human review.',
      'Model contributions explain statistical associations with a prediction, not causes or the effect of changing behaviour.',
      'Retrospective ranking performance does not establish that outreach prevents withdrawal or identifies who benefits most.',
      'Later cohorts exclude previously seen eligible students. This tests new-student generalisation and changes the evaluation population.',
      'B and J presentations may differ. Module/season breakdowns are necessary; this is not an exact calendar-time deployment replay.',
      'No user interviews, institutional pilot, production security review or causal evaluation has been conducted.',
    ]
    meta={'title':'Engagement-to-Support Lab','version':'0.1.0','generated_at':datetime.now(timezone.utc).isoformat(),
          'cutoff_day':28,'target':'Subsequent module withdrawal after day 28 and on/before the recorded module end, among still-registered students.',
          'dataset':'OULAD · 2013–2014','license':'CC BY 4.0','dataset_url':'https://archive.ics.uci.edu/dataset/349/open+university+learning+analytics+dataset',
          'split_description':'Train: 2013B+2013J. Calibration/model selection: 2014B. Locked test: 2014J. Five shared modules; no student crosses splits.',
          'splits':{name:{'n':len(block),'unique_students':int(block.id_student.nunique()),'positives':int(block.outcome.sum()),
                'prevalence':float(block.outcome.mean()),'presentations':sorted(block.code_presentation.unique().tolist())} for name,block in splits.items()},
          'exclusions':{**counts,'cross_split_repeats_removed':removed},'limits':limits,'default_model':selected,
          'selection_rule':'Highest validation average precision among A/B/C, with lower Brier score as tie-breaker. No test-set model selection.',
          'feature_groups':FEATURE_GROUPS,'reproducibility':{'seed':42,'python':platform.python_version(),'sklearn':sklearn.__version__,
            'numpy':np.__version__,'pandas':pd.__version__,'duckdb':duckdb.__version__,'source_archive_sha256':hashlib.sha256((Path(raw).parent/'oulad.zip').read_bytes()).hexdigest() if (Path(raw).parent/'oulad.zip').exists() else None},
          'explanation_note':'Contributions are additive calibrated log-odds relative to training-feature means; intercept is separate.'}
    data={'meta':meta,'models':model_results,'students':students,'audit':subgroup_audit(test,predictions[selected]),
          'research':research,'checks':checks,'uncertainty':paired_bootstrap(test,predictions)}
    text=json.dumps(data,ensure_ascii=False,allow_nan=False,separators=(',',':'))
    (output/'demo_data.json').write_text(text,encoding='utf-8')
    (ROOT/'web/data.js').write_text('window.LAB_DATA = '+text+';\n',encoding='utf-8')
    (output/'metrics.json').write_text(json.dumps({k:v for k,v in data.items() if k not in ['students']},ensure_ascii=False,indent=2,allow_nan=False),encoding='utf-8')
    # Export reproducible research tables without source student identifiers or demographics.
    for name,block in splits.items():
        columns=['id','code_module','code_presentation']+FEATURE_GROUPS['context']+['outcome']
        block[columns].to_csv(output/f'{name}_features.csv',index=False)
    pd.DataFrame([{'id':r['id'],'module':r['module'],'outcome':r['outcome'],**r['scores']} for r in students]).to_csv(output/'test_predictions.csv',index=False)
    joblib.dump(bundles,output/'models.joblib')
    print('Selected on validation:',selected,flush=True)
    print('Paired bootstrap:',data['uncertainty'],flush=True)
    print('Exported',len(students),'test records to',output,flush=True)
    return data


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--raw-dir',type=Path,default=ROOT/'data/raw')
    parser.add_argument('--output-dir',type=Path,default=ROOT/'artifacts')
    args=parser.parse_args()
    run(args.raw_dir,args.output_dir)
