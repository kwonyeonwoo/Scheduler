'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { auth, db, isFirebaseConfigured, missingFirebaseConfig } from './lib/firebase';
import { getHoliday } from './lib/holidays';
import {
  DAYS_KOREAN,
  EMPTY_SCHEDULE,
  MAX_DAILY_HOURS,
  MAX_MONTHLY_HOURS,
  MAX_WEEKLY_HOURS,
  SEMESTER_MAX_HOURS,
  calculateMonth,
  clampHours,
  normalizeSchedule,
} from './lib/schedule';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut 
} from 'firebase/auth';
import { collection, doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';

export default function SchedulerPage() {
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState('login'); 
  const [emailId, setEmailId] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState(''); // 회원가입 시 사용자 이름
  const [authError, setAuthError] = useState('');
  const [authReady, setAuthReady] = useState(!auth);
  const [dataReady, setDataReady] = useState(false);
  const [syncError, setSyncError] = useState('');

  const [currentDate, setCurrentDate] = useState(new Date());
  const [state, setState] = useState(() => normalizeSchedule(EMPTY_SCHEDULE));
  const stateRef = useRef(normalizeSchedule(EMPTY_SCHEDULE));
  const lastSavedStateRef = useRef(normalizeSchedule(EMPTY_SCHEDULE));
  const saveQueueRef = useRef(Promise.resolve());
  const saveRevisionRef = useRef(0);
  const pendingSavesRef = useRef(0);
  
  const [teamSchedules, setTeamSchedules] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [viewMode, setViewMode] = useState('personal');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [rangeHours, setRangeHours] = useState(8);
  const [rangeStartTime, setRangeStartTime] = useState('09:00');
  const [rangeLunch, setRangeLunch] = useState('1.0');
  const [weekdaysOnly, setWeekdaysOnly] = useState(true);

  // 1. Auth Sync
  useEffect(() => {
    if (!auth) {
      return undefined;
    }
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
      setDataReady(!u);
      if (u) {
        setAuthError('');
      } else {
        const empty = normalizeSchedule(EMPTY_SCHEDULE);
        stateRef.current = empty;
        lastSavedStateRef.current = empty;
        setState(empty);
      }
    });
    return () => unsub();
  }, []);

  // 2. Data Sync (canonical document ID is the immutable Firebase UID)
  useEffect(() => {
    if (!user || !db) return undefined;
    let cancelled = false;
    let unsubscribe = () => {};
    const canonicalRef = doc(db, 'schedules', user.uid);

    const startSync = async () => {
      setDataReady(false);
      setSyncError('');
      try {
        const canonicalSnap = await getDoc(canonicalRef);
        if (!canonicalSnap.exists()) {
          const legacyId = user.email?.split('@')[0];
          let legacySnap = null;
          if (legacyId) {
            try {
              legacySnap = await getDoc(doc(db, 'schedules', legacyId));
            } catch (legacyError) {
              // Strict UID-only rules can deny this optional compatibility read.
              console.warn('Legacy schedule could not be read:', legacyError);
            }
          }
          const migrated = normalizeSchedule(legacySnap?.exists() ? legacySnap.data() : EMPTY_SCHEDULE);
          await setDoc(canonicalRef, {
            ...migrated,
            legacyId: legacySnap?.exists() ? legacyId : null,
            ownerUid: user.uid,
            createdAt: legacySnap?.data()?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }

        if (cancelled) return;
        unsubscribe = onSnapshot(canonicalRef, (snapshot) => {
          if (!snapshot.exists() || snapshot.metadata.hasPendingWrites || pendingSavesRef.current > 0) return;
          const normalized = normalizeSchedule(snapshot.data());
          stateRef.current = normalized;
          lastSavedStateRef.current = normalized;
          setState(normalized);
          setDataReady(true);
          setSyncError('');
        }, (error) => {
          console.error('Schedule subscription failed:', error);
          setSyncError('일정 데이터를 불러오지 못했습니다. 권한과 네트워크를 확인해 주세요.');
          setDataReady(true);
        });
      } catch (error) {
        console.error('Schedule initialization failed:', error);
        setSyncError('기존 일정 데이터를 불러오거나 이전하지 못했습니다.');
        setDataReady(true);
      }
    };

    startSync();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [user]);

  useEffect(() => {
    if (viewMode !== 'team') return;
    if (!db || !user) return undefined;
    const unsub = onSnapshot(collection(db, 'schedules'), (snapshot) => {
      const byOwner = new Map();
      const documents = snapshot.docs.map((snapshotDoc) => ({
        id: snapshotDoc.id,
        data: snapshotDoc.data(),
      }));
      const migratedLegacyIds = new Set(
        documents.map(({ data }) => data.ownerUid && data.legacyId).filter(Boolean)
      );

      documents.forEach(({ id, data }) => {
        if (!data.ownerUid && migratedLegacyIds.has(id)) return;
        const ownerKey = data.ownerUid || data.email || id;
        const candidate = {
          id,
          ...normalizeSchedule(data),
          name: data.name || '이름 없음',
          ownerUid: data.ownerUid || null,
          updatedAt: data.updatedAt || '',
        };
        const existing = byOwner.get(ownerKey);
        if (!existing || candidate.ownerUid || candidate.updatedAt > existing.updatedAt) {
          byOwner.set(ownerKey, candidate);
        }
      });
      setTeamSchedules([...byOwner.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko')));
      setSyncError('');
    }, (error) => {
      console.error('Team subscription failed:', error);
      setSyncError('팀 일정을 불러올 권한이 없습니다.');
    });
    return () => unsub();
  }, [viewMode, user]);

  // 3. Auth Actions
  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    const finalEmail = emailId.includes('@') ? emailId : `${emailId}@gmail.com`;
    try {
      if (authMode === 'login') {
        await signInWithEmailAndPassword(auth, finalEmail, password);
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, finalEmail, password);
        const newUser = userCredential.user;
        const initialSchedule = normalizeSchedule({ ...EMPTY_SCHEDULE, name: displayName.trim() });
        await setDoc(doc(db, 'schedules', newUser.uid), {
          ...initialSchedule,
          ownerUid: newUser.uid,
          createdAt: new Date().toISOString()
        });
      }
    } catch (err) {
      const messages = {
        'auth/email-already-in-use': '이미 사용 중인 ID입니다.',
        'auth/invalid-credential': 'ID 또는 비밀번호가 올바르지 않습니다.',
        'auth/weak-password': '비밀번호는 6자 이상이어야 합니다.',
        'auth/too-many-requests': '시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.',
      };
      setAuthError(messages[err.code] || '로그인 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    }
  };

  const handleLogout = () => signOut(auth);

  // 4. Calculations
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const calendarData = useMemo(
    () => calculateMonth(state, currentDate, getHoliday),
    [currentDate, state]
  );
  const teamCalendarById = useMemo(
    () => new Map(teamSchedules.map((member) => [
      member.id,
      new Map(calculateMonth(member, currentDate, getHoliday).days.filter(Boolean).map((day) => [day.dateKey, day])),
    ])),
    [currentDate, teamSchedules]
  );

  const saveState = async (updates) => {
    if (!user || !db) return;
    const revision = ++saveRevisionRef.current;
    const nextState = normalizeSchedule({ ...stateRef.current, ...updates });
    stateRef.current = nextState;
    setState(nextState);
    pendingSavesRef.current += 1;
    setIsSyncing(true);
    setSyncError('');

    saveQueueRef.current = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        try {
          await setDoc(doc(db, 'schedules', user.uid), {
            ...nextState,
            ownerUid: user.uid,
            updatedAt: new Date().toISOString(),
          });
          lastSavedStateRef.current = nextState;
        } catch (error) {
          console.error('Save failed:', error);
          if (saveRevisionRef.current === revision) {
            stateRef.current = lastSavedStateRef.current;
            setState(lastSavedStateRef.current);
            setSyncError('저장에 실패하여 마지막 저장 상태로 되돌렸습니다.');
          }
        } finally {
          pendingSavesRef.current = Math.max(0, pendingSavesRef.current - 1);
          if (pendingSavesRef.current === 0) setIsSyncing(false);
        }
      });

    return saveQueueRef.current;
  };

  const applyDateRange = (asOff = false) => {
    if (!rangeStart || !rangeEnd || rangeStart > rangeEnd) {
      setSyncError('시작일과 종료일을 올바르게 선택해 주세요.');
      return;
    }

    const exceptions = { ...state.exceptions };
    const startExceptions = { ...state.startExceptions };
    const lunchExceptions = { ...state.lunchExceptions };
    const cursor = new Date(`${rangeStart}T00:00:00`);
    const end = new Date(`${rangeEnd}T00:00:00`);
    let applied = 0;

    while (cursor <= end && applied < 120) {
      const dayOfWeek = cursor.getDay();
      if (!weekdaysOnly || (dayOfWeek !== 0 && dayOfWeek !== 6)) {
        const dateKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
        exceptions[dateKey] = asOff ? 0 : clampHours(rangeHours);
        startExceptions[dateKey] = rangeStartTime;
        lunchExceptions[dateKey] = rangeLunch;
        applied += 1;
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    saveState({ exceptions, startExceptions, lunchExceptions });
    setSyncError('');
  };

  if (!isFirebaseConfigured) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center p-6">
        <div className="max-w-lg rounded-3xl border border-red-200 bg-red-50 p-8">
          <h1 className="text-xl font-black text-red-300">Firebase 설정이 필요합니다</h1>
          <p className="mt-3 text-sm text-slate-600">
            누락된 환경변수: {missingFirebaseConfig.join(', ')}
          </p>
        </div>
      </div>
    );
  }

  if (!authReady || (user && !dataReady)) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-600 font-bold">Loading schedule…</div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white p-10 rounded-[3rem] border border-slate-200 shadow-xl space-y-8 animate-in fade-in zoom-in duration-500">
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400 tracking-tighter">TIME KEEPER</h1>
            <p className="text-slate-600 text-sm font-bold">Smart Work Scheduler</p>
          </div>
          <form onSubmit={handleAuth} className="space-y-4">
            {authError && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-xs font-bold text-red-300">{authError}</p>}
            <input type="text" autoComplete="username" value={emailId} onChange={(e) => setEmailId(e.target.value.trim())} required className="w-full bg-white border border-slate-300 rounded-2xl px-5 py-4 text-sm text-slate-900 focus:border-blue-500 outline-none font-bold shadow-inner" placeholder="Email ID" />
            {authMode === 'signup' && (
              <input type="text" autoComplete="name" maxLength={40} value={displayName} onChange={(e) => setDisplayName(e.target.value)} required className="w-full bg-white border border-slate-300 rounded-2xl px-5 py-4 text-sm text-slate-900 focus:border-blue-500 outline-none font-bold shadow-inner animate-in slide-in-from-top-2 duration-300" placeholder="Display Name (Your Name)" />
            )}
            <input type="password" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full bg-white border border-slate-300 rounded-2xl px-5 py-4 text-sm text-slate-900 focus:border-blue-500 outline-none font-bold shadow-inner" placeholder="Password" />
            <button type="submit" className="w-full py-5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-blue-900/20 transition-all">
              {authMode === 'login' ? 'Login' : 'Join'}
            </button>
          </form>
          <div className="text-center">
            <button onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')} className="text-xs font-bold text-slate-600 hover:text-blue-600 transition-colors">
              {authMode === 'login' ? 'Need an account? Join' : 'Already have an account? Login'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 bg-white p-8 rounded-3xl border border-slate-200 shadow-xl relative overflow-hidden">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400 tracking-tight">TIME KEEPER</h1>
              <button onClick={handleLogout} className="text-[10px] font-black bg-slate-100 px-2 py-1 rounded-lg text-slate-600 hover:text-red-600 transition-all">LOGOUT</button>
            </div>
            <div className="text-slate-600 font-bold text-xs">User ID: <span className="text-blue-600">{user.email?.split('@')[0]}</span></div>
            <div className="text-slate-600 font-bold text-xs">Name: <span className="text-purple-600">{state.name || '이름 없음'}</span></div>
          </div>
          <div className="flex flex-col justify-center space-y-3">
            <div className="flex justify-between text-xs font-black text-slate-600">
              <span>인정 근로시간</span>
              <span className="text-blue-600">{calendarData.totalAccHours.toFixed(1)}h</span>
            </div>
            <div className="w-full h-3 bg-slate-100 rounded-full border border-slate-200">
              <div className={`h-full transition-all duration-1000 ${calendarData.totalAccHours >= 80 ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(100, (calendarData.totalAccHours / 80) * 100)}%` }} />
            </div>
          </div>
          <div className="bg-blue-500/5 rounded-2xl border border-blue-500/10 p-4 flex flex-col items-center justify-center text-center">
            <span className="text-[10px] font-black text-blue-500/70 uppercase mb-1">Estimated Wage</span>
            <div className="text-2xl font-black text-blue-700 tracking-tighter">₩ {calendarData.totalWage.toLocaleString()}</div>
            <div className="text-[9px] text-slate-500 mt-1">시급 ₩{calendarData.hourlyWage.toLocaleString()}</div>
          </div>
        </div>

        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="flex gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow">
              <button onClick={() => setViewMode('personal')} className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'personal' ? 'bg-blue-600 text-white shadow' : 'text-slate-600 hover:text-slate-900'}`}>MY</button>
              <button onClick={() => setViewMode('team')} className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'team' ? 'bg-indigo-600 text-white shadow' : 'text-slate-600 hover:text-slate-900'}`}>TEAM</button>
            </div>
            {isSyncing && (
              <div className="flex items-center gap-2 animate-pulse">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Syncing...</span>
              </div>
            )}
            {syncError && <span role="alert" className="text-xs font-bold text-red-400">{syncError}</span>}
          </div>
        </div>

        {viewMode === 'personal' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <aside className="lg:col-span-3 space-y-6">
              <div className="bg-white p-6 rounded-2xl border border-blue-200 space-y-4 shadow">
                <h3 className="text-xs font-black text-blue-700 uppercase tracking-widest">국가근로 설정</h3>
                <label className="block space-y-2">
                  <span className="text-[10px] font-bold text-slate-500">학기 종료일</span>
                  <input
                    type="date"
                    value={state.semesterEndDate}
                    onChange={(e) => saveState({ semesterEndDate: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:border-blue-500 outline-none"
                  />
                </label>
                <label className="block space-y-2">
                  <span className="text-[10px] font-bold text-slate-500">집중근로</span>
                  <select
                    value={state.intensiveWork ? 'yes' : 'no'}
                    onChange={(e) => saveState({ intensiveWork: e.target.value === 'yes' })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:border-blue-500 outline-none"
                  >
                    <option value="no">무 · 월 80시간 / 주 40시간</option>
                    <option value="yes">유 · 주 40시간</option>
                  </select>
                </label>
                {state.intensiveWork && (
                  <label className="block space-y-2">
                    <span className="text-[10px] font-bold text-slate-500">집중근로 시작일</span>
                    <input
                      type="date"
                      value={state.intensiveStartDate}
                      onChange={(e) => saveState({ intensiveStartDate: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:border-blue-500 outline-none"
                    />
                    {!state.intensiveStartDate && (
                      <span className="block text-[9px] text-amber-400">시작일을 정하기 전에는 일반근로 제한이 적용됩니다.</span>
                    )}
                  </label>
                )}
                <label className="block space-y-2">
                  <span className="text-[10px] font-bold text-slate-500">근로 유형</span>
                  <select
                    value={state.workplaceType}
                    onChange={(e) => saveState({ workplaceType: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:border-blue-500 outline-none"
                  >
                    <option value="onCampus">교내근로 · 10,320원</option>
                    <option value="offCampus">교외근로 · 12,790원</option>
                  </select>
                </label>
                <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-[10px] leading-5 text-slate-700">
                  1일 {MAX_DAILY_HOURS}시간 · 주 {MAX_WEEKLY_HOURS}시간<br />
                  {state.intensiveWork && state.intensiveStartDate
                    ? `${state.intensiveStartDate}부터 집중근로: 월 제한 없음`
                    : `일반근로: 월 ${MAX_MONTHLY_HOURS}시간`}<br />
                  학기당 최대 {SEMESTER_MAX_HOURS}시간
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4 shadow">
                <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest">요일별 기본시간</h3>
                <div className="space-y-3">
                  {DAYS_KOREAN.map((day, idx) => (
                    <div key={day} className="flex items-center justify-between">
                      <span className={`text-xs font-bold ${idx === 0 ? 'text-red-500/70' : idx === 6 ? 'text-blue-500/70' : 'text-slate-500'}`}>{day}</span>
                      <input
                        aria-label={`${day}요일 기본 근무시간`}
                        type="number"
                        step="0.5"
                        min="0"
                        max={MAX_DAILY_HOURS}
                        value={state.defaults[idx]}
                        onChange={(e) => saveState({ defaults: { ...state.defaults, [idx]: clampHours(e.target.value) } })}
                        className="bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-[11px] text-slate-900 w-14 text-center focus:border-blue-500 outline-none font-bold"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4 shadow">
                <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest">빠른 일정 입력</h3>
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="text-[9px] text-slate-600">시작일</span>
                    <input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} className="w-full bg-white border border-slate-300 rounded-lg px-2 py-2 text-[10px] text-slate-900" />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[9px] text-slate-600">종료일</span>
                    <input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} className="w-full bg-white border border-slate-300 rounded-lg px-2 py-2 text-[10px] text-slate-900" />
                  </label>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <label className="space-y-1">
                    <span className="text-[9px] text-slate-600">시간</span>
                    <input type="number" min="0" max="8" step="0.5" value={rangeHours} onChange={(e) => setRangeHours(clampHours(e.target.value))} className="w-full bg-white border border-slate-300 rounded-lg px-2 py-2 text-[10px] text-slate-900" />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[9px] text-slate-600">시작</span>
                    <input type="time" value={rangeStartTime} onChange={(e) => setRangeStartTime(e.target.value)} className="w-full bg-white border border-slate-300 rounded-lg px-2 py-2 text-[10px] text-slate-900" />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[9px] text-slate-600">휴게</span>
                    <select value={rangeLunch} onChange={(e) => setRangeLunch(e.target.value)} className="w-full bg-white border border-slate-300 rounded-lg px-2 py-2 text-[10px] text-slate-900">
                      <option value="0">없음</option>
                      <option value="0.5">30분</option>
                      <option value="1.0">1시간</option>
                    </select>
                  </label>
                </div>
                <label className="flex items-center gap-2 text-[10px] text-slate-500">
                  <input type="checkbox" checked={weekdaysOnly} onChange={(e) => setWeekdaysOnly(e.target.checked)} />
                  평일에만 적용
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => applyDateRange(false)} className="rounded-xl bg-blue-600 py-2.5 text-[10px] font-black hover:bg-blue-500">근무 적용</button>
                  <button type="button" onClick={() => applyDateRange(true)} className="rounded-xl bg-slate-100 border border-slate-300 py-2.5 text-[10px] font-black text-red-600 hover:bg-slate-200">휴무 적용</button>
                </div>
              </div>
            </aside>

            <main className="lg:col-span-9 space-y-4">
              <div className="flex justify-center items-center gap-8 mb-2">
                <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="text-slate-500 hover:text-slate-900 transition-all text-xl">←</button>
                <h2 className="text-2xl font-black tracking-tighter text-slate-900">{year}년 {month + 1}월</h2>
                <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="text-slate-500 hover:text-slate-900 transition-all text-xl">→</button>
              </div>

              <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow">
                <div className="grid grid-cols-7 mb-6">
                  {DAYS_KOREAN.map((d, idx) => (
                    <div key={d} className={`text-center text-[10px] font-black uppercase tracking-widest ${idx === 0 ? 'text-red-500/50' : idx === 6 ? 'text-blue-500/50' : 'text-slate-600'}`}>{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-3">
                  {calendarData.days.map((d, i) => (
                    <div key={i} onClick={() => d && setSelectedDay(d)} className={`aspect-square rounded-[1.5rem] border transition-all relative flex flex-col items-center justify-center ${!d ? 'bg-transparent border-transparent' : 'bg-slate-50 border-slate-200 hover:border-blue-400 hover:bg-blue-50 cursor-pointer'} ${d?.type === 'holiday' ? 'opacity-50' : ''} ${d?.type === 'capped' ? 'ring-2 ring-amber-300 border-amber-400' : ''}`}>
                      {d && (
                        <>
                          <span className={`absolute top-3 left-4 text-[11px] font-black ${d.holidayName || d.dayOfWeek === 0 ? 'text-red-500/80' : d.dayOfWeek === 6 ? 'text-blue-500/60' : 'text-slate-500'}`}>{d.day}</span>
                          {d.effectiveHours > 0 ? (
                            <div className="text-center">
                              <div className={`text-sm md:text-lg font-black ${d.type === 'default' ? 'text-blue-700' : 'text-purple-700'}`}>
                                {Number(d.effectiveHours).toFixed(1)}
                              </div>
                              <div className="text-[8px] font-bold text-slate-500">인정시간</div>
                              <div className="text-[9px] text-slate-600 font-bold">{d.start}{d.end ? ` ~ ${d.end}` : ''}</div>
                            </div>
                          ) : (
                            d.holidayName && <div className="text-[10px] font-black text-red-500/40 uppercase tracking-tighter mt-4">Holiday</div>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </main>
          </div>
        ) : (
          <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow overflow-hidden">
            <div className="grid grid-cols-7 mb-6">
              {DAYS_KOREAN.map((d, idx) => (
                <div key={d} className={`text-center text-[10px] font-black uppercase tracking-widest ${idx === 0 ? 'text-red-500/50' : idx === 6 ? 'text-blue-500/50' : 'text-slate-600'}`}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
              {calendarData.days.map((d, i) => {
                if (!d) return <div key={i} className="aspect-square bg-transparent border-transparent" />;
                const workingMembers = teamSchedules.map((member) => {
                  const memberDay = teamCalendarById.get(member.id)?.get(d.dateKey);
                  return { name: member.name, day: memberDay };
                }).filter((member) => member.day?.effectiveHours > 0);

                return (
                  <div key={i} className="min-h-[120px] md:aspect-square rounded-[1.5rem] border bg-slate-50 border-slate-200 p-3 flex flex-col gap-2 relative overflow-hidden hover:border-slate-400 transition-all">
                    <span className={`text-[10px] font-black ${d.dayOfWeek === 0 ? 'text-red-500/60' : d.dayOfWeek === 6 ? 'text-blue-500/60' : 'text-slate-600'}`}>{d.day}</span>
                    <div className="flex flex-col gap-1 overflow-y-auto pr-1">
                      {workingMembers.length > 0 ? (
                        workingMembers.map((m, idx) => (
                          <div key={idx} className="bg-white rounded-lg p-1.5 border border-slate-200 shadow-sm">
                            <span className="text-[10px] font-black text-blue-700 truncate block">{m.name}</span>
                            <span className="text-[8px] font-bold text-slate-500">{m.day.start} ~ {m.day.end}</span>
                          </div>
                        ))
                      ) : (
                        <div className="flex-1 flex items-center justify-center">
                          <span className="text-[8px] font-bold text-slate-800 uppercase tracking-tighter">No Schedule</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {selectedDay && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/35 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white text-slate-900 w-full max-w-sm rounded-[3rem] border border-slate-200 p-10 shadow-2xl space-y-8">
              <div className="text-center space-y-1">
                <h3 className="text-2xl font-black text-blue-700 tracking-tighter">일정 수정</h3>
                <p className="text-slate-600 font-bold">{selectedDay.dateKey}</p>
              </div>
              <form onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const inputH = fd.get('type') === 'off' ? 0 : Number(fd.get('hours')) || 0;
                const finalH = clampHours(inputH);
                saveState({
                  exceptions: { ...state.exceptions, [selectedDay.dateKey]: finalH },
                  startExceptions: { ...state.startExceptions, [selectedDay.dateKey]: fd.get('start') },
                  lunchExceptions: { ...state.lunchExceptions, [selectedDay.dateKey]: fd.get('lunch') }
                });
                setSelectedDay(null);
              }} className="space-y-6">
                <div className="flex gap-2 p-1.5 bg-slate-100 rounded-2xl border border-slate-200">
                  <label className="flex-1"><input type="radio" name="type" value="work" defaultChecked={selectedDay.hours > 0} className="peer hidden" /><div className="text-center py-2.5 rounded-xl text-xs font-black cursor-pointer peer-checked:bg-blue-600 peer-checked:text-white text-slate-600 transition-all">근무</div></label>
                  <label className="flex-1"><input type="radio" name="type" value="off" defaultChecked={selectedDay.hours === 0} className="peer hidden" /><div className="text-center py-2.5 rounded-xl text-xs font-black cursor-pointer peer-checked:bg-red-600 peer-checked:text-white text-slate-600 transition-all">휴무</div></label>
                </div>
                <div className="space-y-5">
                  <input name="hours" type="number" step="0.5" min="0" max={MAX_DAILY_HOURS} defaultValue={selectedDay.hours} className="w-full bg-white border border-slate-300 rounded-2xl px-5 py-4 text-sm text-slate-900 focus:border-blue-500 outline-none font-bold shadow-inner" placeholder="근무시간" />
                  <div className="grid grid-cols-2 gap-4">
                    <input name="start" type="time" defaultValue={selectedDay.start} className="w-full bg-white border border-slate-300 rounded-2xl px-5 py-4 text-sm text-slate-900 focus:border-blue-500 outline-none font-bold shadow-inner" />
                    <select name="lunch" defaultValue={selectedDay.lunch} className="w-full bg-white border border-slate-300 rounded-2xl px-5 py-4 text-sm text-slate-900 focus:border-blue-500 outline-none font-bold appearance-none shadow-inner"><option value="0">휴게 없음</option><option value="0.5">30분</option><option value="1.0">1시간</option></select>
                  </div>
                </div>
                <div className="flex gap-4 pt-4">
                  <button type="button" onClick={() => setSelectedDay(null)} className="flex-1 py-4 rounded-2xl bg-slate-100 border border-slate-300 font-black text-xs hover:bg-slate-200 transition-all">취소</button>
                  <button type="submit" className="flex-1 py-4 rounded-2xl bg-blue-600 font-black text-xs hover:bg-blue-500 text-white transition-all shadow-xl shadow-blue-900/20">저장</button>
                </div>
              </form>
              <button
                type="button"
                onClick={() => {
                  const exceptions = { ...state.exceptions };
                  const startExceptions = { ...state.startExceptions };
                  const lunchExceptions = { ...state.lunchExceptions };
                  delete exceptions[selectedDay.dateKey];
                  delete startExceptions[selectedDay.dateKey];
                  delete lunchExceptions[selectedDay.dateKey];
                  saveState({ exceptions, startExceptions, lunchExceptions });
                  setSelectedDay(null);
                }}
                className="w-full text-[10px] font-bold text-slate-500 hover:text-slate-300"
              >
                요일별 기본시간으로 되돌리기
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
