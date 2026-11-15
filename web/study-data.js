/* Invented teaching scenarios. No row is an OULAD record or a fitted prediction. */
(function () {
  'use strict';
  const cases = Array.from({ length: 50 }, (_, i) => {
    const number = i + 1;
    const weeks = [18 + (number * 13) % 85, 12 + (number * 19) % 79,
      9 + (number * 7) % 71, 3 + (number * 11) % 67];
    const due = number % 4 === 0 ? 0 : 1 + number % 2;
    const recorded = due ? number % (due + 1) : 0;
    return {
      id: 'SYN-' + String(number).padStart(3, '0'),
      title: 'Invented learner ' + String(number).padStart(2, '0'),
      weeks, active_days_recent: 1 + number % 7, days_since_activity: number % 12,
      assessments_due: due, submissions_recorded: recorded,
      illustrative_index: 25 + (number * 17) % 71,
      setting: ['Weekly online seminar', 'Mixed independent and group work', 'Reading and project work'][i % 3],
      context: 'The platform record does not describe all learning. Check the local timetable, record freshness and the learner’s account before interpreting it.'
    };
  });
  Object.assign(cases[0], { title: 'Learner A', weeks: [50, 50, 50, 50],
    active_days_recent: 5, days_since_activity: 1, assessments_due: 1, submissions_recorded: 1,
    illustrative_index: 32 });
  Object.assign(cases[1], { title: 'Learner B', weeks: [110, 60, 25, 5],
    active_days_recent: 1, days_since_activity: 6, assessments_due: 1, submissions_recorded: 1,
    illustrative_index: 68 });
  Object.assign(cases[2], { title: 'Submission not recorded', weeks: [40, 42, 36, 30],
    active_days_recent: 4, days_since_activity: 2, assessments_due: 1, submissions_recorded: 0,
    illustrative_index: 74,
    context: 'Hypothetical new information: an authorised extension moves this deadline from day 28 to day 35. The learner also reports working offline on the assignment. Neither fact was included in the original platform record. Confirm the extension and record update before treating this as a missed deadline.' });
  Object.assign(cases[3], { title: 'An illustrative false alarm', weeks: [60, 20, 8, 2],
    active_days_recent: 1, days_since_activity: 9, assessments_due: 1, submissions_recorded: 0,
    illustrative_index: 88, illustrative_probability: 0.72,
    hypothetical_outcome: 'In this invented scenario, the learner did not withdraw from the module.',
    context: 'A planned offline placement and a late transfer of submission records explain some of the apparent gap. The story does not prove that contacting the learner changed the outcome.' });
  const tasks = [
    { id: 'patterns', title: 'Compare the patterns', case_ids: ['SYN-001', 'SYN-002'],
      prompt: 'These two invented learners each have 200 recorded clicks. What differs, what remains unknown, and what would you check next?',
      hint: 'Describe the observations before interpreting them. The same total can conceal different recent patterns.' },
    { id: 'context', title: 'Revisit a missing submission', case_ids: ['SYN-003'],
      prompt: 'Record an initial interpretation and a next check. Then reveal new hypothetical context and revise your response.',
      hint: 'A submission absent from this record is not enough to establish an overdue assignment. Look for information that could change that interpretation.' },
    { id: 'capacity', title: 'Choose five to review', case_ids: cases.map(c => c.id),
      prompt: 'You have time to review five of these 50 invented records. Select exactly five and explain your choices. You are planning checks, not deciding who receives support.',
      hint: 'The example index is a discussion aid, not a probability or a command. Consider what evidence you need and what your limited capacity means.' },
    { id: 'explanation', title: 'Explain uncertainty and an error', case_ids: ['SYN-004'],
      prompt: 'Explain the illustrative 72% figure to a colleague. What can and cannot be concluded from the later outcome and the suggested explanation?',
      hint: 'Separate a probability from certainty, an association from a cause, and a prediction from evidence that an intervention works.' }
  ];
  window.LAB_STUDY_CASES = {
    schema_version: 1, task_set_version: 'synthetic-tutor-tasks-1',
    provenance: 'All 50 cases, indices, probabilities and outcomes are deliberately invented for interface practice. They are not measured model results.',
    cases, tasks
  };
})();
