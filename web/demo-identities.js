/* Display labels for the frozen public cohort. No names come from learner data. */
(function () {
  'use strict';

  const givenNames = (
    'Ada Aisha Alex Alice Amara Amelia Amir Anna Arjun Ava Ben Beth Bruno Caleb Cara ' +
    'Chloe Clara Daniel Dara David Dylan Eleni Ella Elliot Emilia Emma Erin Eva Evelyn ' +
    'Felix Finn Freya Grace Hannah Haris Harriet Hazel Helen Hugo Imogen Isaac Isla ' +
    'Ivy Jacob Jade Jamie Jasmine Jay Joel Jonah Joseph Julia Kai Kate Lara Leah Leo ' +
    'Liam Lina Lucas Lucy Maia Marcus Maya Mia Mina Nadia Naomi Noah Nora Oliver ' +
    'Oscar Owen Pippa Priya Rafael Reuben Rosa Rowan Ruby Sam Sara Sofia Theo ' +
    'Thomas Violet Yasmin Zara Zoe'
  ).split(' ');
  const familyNames = (
    'Ahmed Ali Allen Archer Baker Bell Bennett Bishop Blake Brooks Brown Campbell ' +
    'Carter Chan Chen Clarke Cole Collins Cooper Costa Davies Dean Diaz Edwards Ellis ' +
    'Evans Fisher Foster Fox Fraser Garcia Grant Gray Green Griffin Hall Harris ' +
    'Hassan Hayes Hill Ho Hughes Jackson James Jones Karim Khan Kim King Lane Lawrence ' +
    'Lee Lewis Li Lin Lopes Malik Martin Mason Mitchell Moore Morgan Morris Murray ' +
    'Nelson Ng Nolan Ortiz Owen Park Parker Patel Perry Price Quinn Reed Reid ' +
    'Reynolds Rhodes Rossi Scott Shah Singh Smith Stewart Stone Taylor Tran Walker ' +
    'Walsh Ward Watson Webb White Williams Wilson Wong Wright Young'
  ).split(' ');

  // Sorting public aliases gives the same display name regardless of model, queue
  // order, module filter, or input order. Each name pair occurs once per full cycle.
  function namesForAliases(aliases) {
    const sorted = [...new Set(aliases)].sort();
    const names = new Map();
    sorted.forEach((alias, index) => {
      const given = index % givenNames.length;
      const family = (Math.floor(index / givenNames.length) + 19 * given) % familyNames.length;
      if (index < givenNames.length * familyNames.length) {
        names.set(alias, givenNames[given] + ' ' + familyNames[family]);
      }
    });
    return names;
  }

  // Examples from the OU catalogue, chosen only by the broad subject domains
  // published in Table 1 of the OULAD paper. Original module titles were withheld.
  const courses = Object.freeze({
    BBB: { title: 'Economics in context', url: 'https://www.open.ac.uk/courses/qualifications/details/dd126/' },
    DDD: { title: 'Introducing statistics', url: 'https://css2.open.ac.uk/outis/descs/courses/M140.htm' },
    EEE: { title: 'Technologies in practice', url: 'https://css2.open.ac.uk/outis/descs/courses/TM129.htm' },
    FFF: { title: 'Questions in science', url: 'https://css2.open.ac.uk/outis/descs/courses/S111.htm' },
    GGG: { title: 'Introduction to criminology', url: 'https://css2.open.ac.uk/outis/descs/courses/DD105.htm' }
  });

  window.LAB_DEMO_IDENTITIES = Object.freeze({ namesForAliases, courses });
})();
