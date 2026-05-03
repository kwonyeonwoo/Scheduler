'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { auth, db } from './lib/firebase';
import { getHoliday } from './lib/holidays';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut 
} from 'firebase/auth';
import { doc, onSnapshot, setDoc, collection, query, limit } from 'firebase/firestore';

// --- Constants ---
const MAX_MONTHLY_HOURS = 80;
const HOURLY_WAGE = 12790;
const DAYS_KOREAN = ['일', '월', '화', '수', '목', '금', '토'];

export default function SchedulerPage() {
  const calendarRef = useRef(null);
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState('login'); 
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const [currentDate, setCurrentDate] = useState(new Date());
  const [state, setState] = useState({
    name: '',
    defaults: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
    exceptions: {},
    startDefaults: { 0: "09:00", 1: "09:00", 2: "09:00", 3: "09:00", 4: "09:00", 5: "09:00", 6: "09:00" },
    startExceptions: {},
    lunchDefaults: { 0: "1.0", 1: "1.0", 2: "1.0", 3: "1.0", 4: "1.0", 5: "1.0", 6: "1.0" },
    lunchExceptions: {},
  });
  
  const [teamSchedules, setTeamSchedules] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [viewMode, setViewMode] = useState('personal');

  // Helper to get consistent Doc ID from user (User ID prefix)
  const getDocId = (u) => {
    if (!u) return null;
    // 사용자 ID (이메일 앞부분)를 우선적으로 사용
    return u.email.split('@')[0];
  };

  // 1. Auth Sync
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        setAuthError('');
      } else {
        setState({
          name: '',
          defaults: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
          exceptions: {},
          startDefaults: { 0: "09:00", 1: "09:00", 2: "09:00", 3: "09:00", 4: "09:00", 5: "09:00", 6: "09:00" },
          startExceptions: {},
          lunchDefaults: { 0: "1.0", 1: "1.0", 2: "1.0", 3: "1.0", 4: "1.0", 5: "1.0", 6: "1.0" },
          lunchExceptions: {},
        });
      }
    });
    return () => unsub();
  }, []);

  // 2. Data Sync
  useEffect(() => {
    if (!user) return;
    const docId = getDocId(user);
    const unsub = onSnapshot(doc(db, "schedules", docId), (docSnap) => {
      if (docSnap.exists() && !docSnap.metadata.hasPendingWrites) {
        const data = docSnap.data();
        
        // Firestore는 Map 키를 항상 문자열로 저장하므로, 다시 숫자로 변환 (데이터 정규화)
        const normalize = (obj) => {
          if (!obj) return {};
          const newObj = {};
          Object.keys(obj).forEach(key => {
            const numKey = parseInt(key, 10);
            newObj[isNaN(numKey) ? key : numKey] = obj[key];
          });
          return newObj;
        };

        setState(prev => ({
          ...prev,
          ...data,
          defaults: normalize(data.defaults) || prev.defaults,
          startDefaults: normalize(data.startDefaults) || prev.startDefaults,
          lunchDefaults: normalize(data.lunchDefaults) || prev.lunchDefaults,
          name: data.name || prev.name 
        }));
      }
    }, (err) => console.error("Snapshot error:", err));
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (viewMode !== 'team') return;
    const q = query(collection(db, "schedules"), limit(100));
    const unsub = onSnapshot(q, (qs) => {
      const s = [];
      qs.forEach((doc) => {
        const data = doc.data();
        const isTest = doc.id.toLowerCase().includes('test') || data.name?.toLowerCase().includes('test');
        if (!isTest) {
          s.push({ 
            id: doc.id, 
            ...data,
            name: data.name || data.email?.split('@')[0] || `User(${doc.id.slice(0,5)})`
          });
        }
      });
      setTeamSchedules(s);
    }, (err) => console.error("Team sync error:", err));
    return () => unsub();
  }, [viewMode]);

  // 3. Auth Actions
  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    const finalEmail = email.includes('@') ? email : `${email}@scheduler.com`;
    try {
      if (authMode === 'login') {
        await signInWithEmailAndPassword(auth, finalEmail, password);
      } else {
        await createUserWithEmailAndPassword(auth, finalEmail, password);
      }
    } catch (err) {
      setAuthError('Authentication failed. Check your ID/PW.');
    }
  };

  const handleLogout = () => signOut(auth);

  // 4. Calculations
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const getEndTime = (startTime, duration, lunch) => {
    if (!startTime || duration <= 0) return "";
    const [h, m] = startTime.split(':').map(Number);
    const totalMinutes = h * 60 + m + (Number(duration) + Number(lunch)) * 60;
    const endH = Math.floor(totalMinutes / 60) % 24;
    const endM = totalMinutes % 60;
    return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
  };

  const calendarData = useMemo(() => {
    const y = currentDate.getFullYear();
    const m = currentDate.getMonth();
    const firstDay = new Date(y, m, 1);
    const lastDay = new Date(y, m + 1, 0);
    const days = [];
    for (let i = 0; i < firstDay.getDay(); i++) days.push(null);
    
    let totalAccHours = 0;
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dateKey = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayOfWeek = new Date(y, m, d).getDay();
      const holidayName = getHoliday(dateKey);
      
      let scheduledHours = Number(state.exceptions[dateKey] !== undefined ? state.exceptions[dateKey] : state.defaults[dayOfWeek]) || 0;
      if (holidayName && state.exceptions[dateKey] === undefined) scheduledHours = 0;

      let effectiveHours = scheduledHours;
      let type = state.exceptions[dateKey] !== undefined ? (scheduledHours === 0 ? 'holiday' : 'exception') : (scheduledHours === 0 && holidayName ? 'holiday' : 'default');
      
      if (totalAccHours + scheduledHours > MAX_MONTHLY_HOURS) {
        effectiveHours = Math.max(0, MAX_MONTHLY_HOURS - totalAccHours);
        if (scheduledHours > 0) type = 'capped';
      }
      
      let start = state.startExceptions[dateKey] || state.startDefaults[dayOfWeek] || "09:00";
      let lunch = Number(state.lunchExceptions[dateKey] || state.lunchDefaults[dayOfWeek] || 1.0);
      const end = getEndTime(start, scheduledHours, lunch);
      
      totalAccHours += effectiveHours;
      days.push({ day: d, dateKey, hours: scheduledHours, effectiveHours, start, end, lunch, type, dayOfWeek, holidayName });
    }
    return { days, totalAccHours, totalWage: Math.min(totalAccHours, MAX_MONTHLY_HOURS) * HOURLY_WAGE };
  }, [currentDate, state]);

  const getAdjustedHours = (dateKey, targetHours) => {
    let dailyClamped = Math.max(0, Math.min(8, Number(targetHours) || 0));
    const [y, m, d_str] = dateKey.split('-').map(Number);
    const targetDay = d_str;
    let precedingDaysTotal = 0;
    for (let d = 1; d < targetDay; d++) {
      const currentKey = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayOfWeek = new Date(y, m - 1, d).getDay();
      const holidayName = getHoliday(currentKey);
      let h = Number(state.exceptions[currentKey] !== undefined ? state.exceptions[currentKey] : state.defaults[dayOfWeek]) || 0;
      if (holidayName && state.exceptions[currentKey] === undefined) h = 0;
      precedingDaysTotal += h;
    }
    const remainingMonthlyLimit = Math.max(0, MAX_MONTHLY_HOURS - precedingDaysTotal);
    return Math.min(dailyClamped, remainingMonthlyLimit);
  };

  const saveState = async (updates) => {
    if (!user) return;
    setIsSyncing(true);
    setState(prev => ({ ...prev, ...updates }));
    try {
      const docId = getDocId(user);
      await setDoc(doc(db, "schedules", docId), {
        ...updates,
        email: user.email,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (e) {
      console.error("Save failed:", e);
      alert("Save failed! Check your connection.");
    } finally {
      setIsSyncing(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-slate-900/40 p-10 rounded-[3rem] border border-slate-800 shadow-2xl backdrop-blur-xl space-y-8 animate-in fade-in zoom-in duration-500">
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400 tracking-tighter">TIME KEEPER</h1>
            <p className="text-slate-500 text-sm font-bold">Smart Work Scheduler</p>
          </div>
          <form onSubmit={handleAuth} className="space-y-4">
            <input type="text" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-5 py-4 text-sm focus:border-blue-500 outline-none font-bold" placeholder="User ID" />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-5 py-4 text-sm focus:border-blue-500 outline-none font-bold" placeholder="Password" />
            <button type="submit" className="w-full py-5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-blue-900/20 transition-all">
              {authMode === 'login' ? 'Login' : 'Join'}
            </button>
          </form>
          <div className="text-center">
            <button onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')} className="text-xs font-bold text-slate-500 hover:text-blue-400 transition-colors">
              {authMode === 'login' ? 'Need an account? Join' : 'Already have an account? Login'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d1117] text-slate-200 font-sans p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 bg-slate-900/40 p-8 rounded-3xl border border-slate-800 shadow-2xl backdrop-blur-xl relative overflow-hidden">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400 tracking-tight">TIME KEEPER</h1>
              <button onClick={handleLogout} className="text-[10px] font-black bg-slate-800 px-2 py-1 rounded-lg text-slate-500 hover:text-red-400 transition-all">LOGOUT</button>
            </div>
            <div className="text-slate-400 font-bold text-sm">User: {getDocId(user)}</div>
          </div>
          <div className="flex flex-col justify-center space-y-3">
            <div className="flex justify-between text-xs font-black text-slate-500 uppercase">
              <span>Monthly Progress</span>
              <span className={calendarData.totalAccHours >= 80 ? 'text-emerald-400' : 'text-blue-400'}>{calendarData.totalAccHours.toFixed(1)} / 80.0h</span>
            </div>
            <div className="w-full h-3 bg-slate-800/50 rounded-full border border-slate-700/50">
              <div className={`h-full transition-all duration-1000 ${calendarData.totalAccHours >= 80 ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(100, (calendarData.totalAccHours / 80) * 100)}%` }} />
            </div>
          </div>
          <div className="bg-blue-500/5 rounded-2xl border border-blue-500/10 p-4 flex flex-col items-center justify-center text-center">
            <span className="text-[10px] font-black text-blue-500/70 uppercase mb-1">Estimated Wage</span>
            <div className="text-2xl font-black text-blue-400 tracking-tighter">₩ {calendarData.totalWage.toLocaleString()}</div>
          </div>
        </div>

        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="flex gap-1 bg-slate-900/50 p-1 rounded-xl border border-slate-800 shadow-xl">
              <button onClick={() => setViewMode('personal')} className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'personal' ? 'bg-blue-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>MY</button>
              <button onClick={() => setViewMode('team')} className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'team' ? 'bg-indigo-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>TEAM</button>
            </div>
            {isSyncing && (
              <div className="flex items-center gap-2 animate-pulse">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Syncing...</span>
              </div>
            )}
          </div>
        </div>

        {viewMode === 'personal' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8" ref={calendarRef}>
            <aside className="lg:col-span-3 space-y-6">
              <div className="bg-slate-900/40 p-6 rounded-2xl border border-slate-800 space-y-4 shadow-xl">
                <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">User Profile</h3>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest px-1">Display Name</label>
                  <input type="text" value={state.name || ''} onChange={(e) => {
                    const newName = e.target.value;
                    setState(prev => ({ ...prev, name: newName }));
                    saveState({ name: newName });
                  }} className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-xs focus:border-blue-500 outline-none font-bold" placeholder="Enter name" />
                </div>
              </div>

              <div className="bg-slate-900/40 p-6 rounded-2xl border border-slate-800 space-y-4 shadow-xl">
                <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">Weekly Defaults</h3>
                <div className="space-y-3">
                  {DAYS_KOREAN.map((day, idx) => (
                    <div key={day} className="flex items-center justify-between">
                      <span className={`text-xs font-bold ${idx === 0 ? 'text-red-500/70' : idx === 6 ? 'text-blue-500/70' : 'text-slate-500'}`}>{day}</span>
                      <input type="number" step="0.5" value={state.defaults[idx]} onChange={(e) => saveState({ defaults: { ...state.defaults, [idx]: e.target.value }})} className="bg-slate-800/50 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] w-14 text-center focus:border-blue-500 outline-none font-bold" />
                    </div>
                  ))}
                </div>
              </div>
            </aside>

            <main className="lg:col-span-9 space-y-4">
              <div className="flex justify-center items-center gap-8 mb-2">
                <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="text-slate-600 hover:text-white transition-all text-xl">←</button>
                <h2 className="text-2xl font-black tracking-tighter text-slate-100">{year}년 {month + 1}월</h2>
                <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="text-slate-600 hover:text-white transition-all text-xl">→</button>
              </div>

              <div className="bg-slate-900/20 p-6 rounded-[2.5rem] border border-slate-800/50 shadow-inner">
                <div className="grid grid-cols-7 mb-6">
                  {DAYS_KOREAN.map((d, idx) => (
                    <div key={d} className={`text-center text-[10px] font-black uppercase tracking-widest ${idx === 0 ? 'text-red-500/50' : idx === 6 ? 'text-blue-500/50' : 'text-slate-600'}`}>{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-3">
                  {calendarData.days.map((d, i) => (
                    <div key={i} onClick={() => d && setSelectedDay(d)} className={`aspect-square rounded-[1.5rem] border transition-all relative flex flex-col items-center justify-center ${!d ? 'bg-transparent border-transparent' : 'bg-slate-900/40 border-slate-800/50 hover:border-blue-500/50 hover:bg-slate-800/60 cursor-pointer'} ${d?.type === 'holiday' ? 'opacity-40' : ''} ${d?.type === 'capped' ? 'ring-2 ring-emerald-500/30 border-emerald-500/50' : ''}`}>
                      {d && (
                        <>
                          <span className={`absolute top-3 left-4 text-[11px] font-black ${d.holidayName || d.dayOfWeek === 0 ? 'text-red-500/80' : d.dayOfWeek === 6 ? 'text-blue-500/60' : 'text-slate-500'}`}>{d.day}</span>
                          {d.effectiveHours > 0 ? (
                            <div className="text-center">
                              <div className={`text-sm md:text-lg font-black ${d.type === 'default' ? 'text-blue-400' : d.type === 'exception' ? 'text-purple-400' : 'text-emerald-400'}`}>
                                {Number(d.effectiveHours).toFixed(1)}
                              </div>
                              {d.effectiveHours < d.hours && (
                                <div className="text-[8px] font-black text-amber-500 uppercase tracking-tighter leading-none mb-1">Suspend</div>
                              )}
                              <div className="text-[9px] text-slate-600 font-bold">{d.start} ~ {d.end}</div>
                            </div>
                          ) : (
                            d.hours > 0 ? (
                              <div className="text-center opacity-40">
                                <div className="text-xs font-black text-red-500 uppercase tracking-tighter">Limit</div>
                                <div className="text-[8px] text-slate-700 font-bold line-through">{d.hours.toFixed(1)}h</div>
                              </div>
                            ) : (
                              d.holidayName && <div className="text-[10px] font-black text-red-500/40 uppercase tracking-tighter mt-4">Holiday</div>
                            )
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
          <div className="bg-slate-900/20 p-6 rounded-[2.5rem] border border-slate-800/50 shadow-inner overflow-hidden">
            <div className="grid grid-cols-7 mb-6">
              {DAYS_KOREAN.map((d, idx) => (
                <div key={d} className={`text-center text-[10px] font-black uppercase tracking-widest ${idx === 0 ? 'text-red-500/50' : idx === 6 ? 'text-blue-500/50' : 'text-slate-600'}`}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
              {calendarData.days.map((d, i) => {
                if (!d) return <div key={i} className="aspect-square bg-transparent border-transparent" />;
                const workingMembers = teamSchedules.filter(m => {
                  const h = Number(m.exceptions?.[d.dateKey] !== undefined ? m.exceptions[d.dateKey] : (m.defaults?.[d.dayOfWeek] || 0));
                  return h > 0;
                }).map(m => {
                  const h = Number(m.exceptions?.[d.dateKey] !== undefined ? m.exceptions[d.dateKey] : (m.defaults?.[d.dayOfWeek] || 0));
                  const start = m.startExceptions?.[d.dateKey] || m.startDefaults?.[d.dayOfWeek] || "09:00";
                  return { name: m.name, start };
                });

                return (
                  <div key={i} className="min-h-[120px] md:aspect-square rounded-[1.5rem] border bg-slate-900/40 border-slate-800/50 p-3 flex flex-col gap-2 relative overflow-hidden hover:border-slate-700 transition-all">
                    <span className={`text-[10px] font-black ${d.dayOfWeek === 0 ? 'text-red-500/60' : d.dayOfWeek === 6 ? 'text-blue-500/60' : 'text-slate-600'}`}>{d.day}</span>
                    <div className="flex flex-col gap-1 overflow-y-auto pr-1">
                      {workingMembers.length > 0 ? (
                        workingMembers.map((m, idx) => (
                          <div key={idx} className="bg-slate-800/50 rounded-lg p-1.5 border border-slate-700/50 shadow-sm">
                            <span className="text-[10px] font-black text-blue-400 truncate block">{m.name}</span>
                            <span className="text-[8px] font-bold text-slate-500">{m.start} ~</span>
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-[#161b22] w-full max-w-sm rounded-[3rem] border border-slate-700 p-10 shadow-2xl space-y-8">
              <div className="text-center space-y-1">
                <h3 className="text-2xl font-black text-blue-400 tracking-tighter">Edit Schedule</h3>
                <p className="text-slate-500 font-bold">{selectedDay.dateKey}</p>
              </div>
              <form onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const inputH = fd.get('type') === 'off' ? 0 : Number(fd.get('hours')) || 0;
                const finalH = getAdjustedHours(selectedDay.dateKey, inputH);
                saveState({
                  exceptions: { ...state.exceptions, [selectedDay.dateKey]: finalH },
                  startExceptions: { ...state.startExceptions, [selectedDay.dateKey]: fd.get('start') },
                  lunchExceptions: { ...state.lunchExceptions, [selectedDay.dateKey]: fd.get('lunch') }
                });
                setSelectedDay(null);
              }} className="space-y-6">
                <div className="flex gap-2 p-1.5 bg-slate-900 rounded-2xl border border-slate-800">
                  <label className="flex-1"><input type="radio" name="type" value="work" defaultChecked={selectedDay.hours > 0} className="peer hidden" /><div className="text-center py-2.5 rounded-xl text-xs font-black cursor-pointer peer-checked:bg-blue-600 peer-checked:text-white text-slate-600 transition-all">Work</div></label>
                  <label className="flex-1"><input type="radio" name="type" value="off" defaultChecked={selectedDay.hours === 0} className="peer hidden" /><div className="text-center py-2.5 rounded-xl text-xs font-black cursor-pointer peer-checked:bg-red-600 peer-checked:text-white text-slate-600 transition-all">Off</div></label>
                </div>
                <div className="space-y-5">
                  <input name="hours" type="number" step="0.5" defaultValue={selectedDay.hours || 8} className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-5 py-4 text-sm focus:border-blue-500 outline-none font-bold shadow-inner" placeholder="Daily Hours" />
                  <div className="grid grid-cols-2 gap-4">
                    <input name="start" type="time" defaultValue={selectedDay.start} className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-5 py-4 text-sm focus:border-blue-500 outline-none font-bold shadow-inner" />
                    <select name="lunch" defaultValue={selectedDay.lunch} className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-5 py-4 text-sm focus:border-blue-500 outline-none font-bold appearance-none shadow-inner"><option value="0">None</option><option value="0.5">30m</option><option value="1.0">1h</option></select>
                  </div>
                </div>
                <div className="flex gap-4 pt-4">
                  <button type="button" onClick={() => setSelectedDay(null)} className="flex-1 py-4 rounded-2xl bg-slate-800 font-black text-xs uppercase hover:bg-slate-700 transition-all">Cancel</button>
                  <button type="submit" className="flex-1 py-4 rounded-2xl bg-blue-600 font-black text-xs uppercase hover:bg-blue-500 text-white transition-all shadow-xl shadow-blue-900/20">Save</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
