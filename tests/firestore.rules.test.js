import { after, before, beforeEach, test } from 'node:test';
import { readFileSync } from 'node:fs';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

let environment;

const schedule = (ownerUid) => ({
  ownerUid,
  legacyId: null,
  semesterEndDate: '2026-06-30',
  intensiveWork: false,
  intensiveStartDate: '',
  workplaceType: 'offCampus',
  name: '테스트 사용자',
  defaults: { 0: 0, 1: 8, 2: 8, 3: 8, 4: 8, 5: 8, 6: 0 },
  exceptions: {},
  startDefaults: { 0: '09:00', 1: '09:00', 2: '09:00', 3: '09:00', 4: '09:00', 5: '09:00', 6: '09:00' },
  startExceptions: {},
  lunchDefaults: { 0: '1.0', 1: '1.0', 2: '1.0', 3: '1.0', 4: '1.0', 5: '1.0', 6: '1.0' },
  lunchExceptions: {},
  updatedAt: new Date(0).toISOString(),
});

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: 'demo-time-keeper',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

beforeEach(async () => environment.clearFirestore());
after(async () => environment.cleanup());

test('unauthenticated reads are rejected', async () => {
  const database = environment.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(database, 'schedules', 'alice')));
});

test('users can write only their UID document', async () => {
  const database = environment.authenticatedContext('alice').firestore();
  await assertSucceeds(setDoc(doc(database, 'schedules', 'alice'), schedule('alice')));
  await assertFails(setDoc(doc(database, 'schedules', 'bob'), schedule('alice')));
});

test('signed-in team members can read but cannot overwrite another schedule', async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'schedules', 'alice'), schedule('alice'));
  });
  const database = environment.authenticatedContext('bob').firestore();
  await assertSucceeds(getDoc(doc(database, 'schedules', 'alice')));
  await assertFails(setDoc(doc(database, 'schedules', 'alice'), schedule('bob')));
});

test('unexpected fields such as email are rejected', async () => {
  const database = environment.authenticatedContext('alice').firestore();
  await assertFails(setDoc(doc(database, 'schedules', 'alice'), {
    ...schedule('alice'),
    email: 'alice@example.com',
  }));
});

test('invalid national work-study settings are rejected', async () => {
  const database = environment.authenticatedContext('alice').firestore();
  await assertFails(setDoc(doc(database, 'schedules', 'alice'), {
    ...schedule('alice'),
    workplaceType: 'private',
  }));
  await assertFails(setDoc(doc(database, 'schedules', 'alice'), {
    ...schedule('alice'),
    semesterEndDate: 20260731,
  }));
  await assertFails(setDoc(doc(database, 'schedules', 'alice'), {
    ...schedule('alice'),
    intensiveWork: 'yes',
  }));
  await assertFails(setDoc(doc(database, 'schedules', 'alice'), {
    ...schedule('alice'),
    intensiveStartDate: 20260720,
  }));
});

test('older clients without intensive-work fields remain write-compatible during rollout', async () => {
  const database = environment.authenticatedContext('alice').firestore();
  const legacySchedule = schedule('alice');
  delete legacySchedule.intensiveWork;
  delete legacySchedule.intensiveStartDate;
  await assertSucceeds(setDoc(doc(database, 'schedules', 'alice'), legacySchedule));
});
