'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { doc, onSnapshot, setDoc, collection, query, limit } from 'firebase/firestore';

// --- Constants ---
const MAX_MONTHLY_HOURS = 80;
const HOURLY_WAGE = 12790;
const DAYS_KOREAN = ['일', '월', '화', '수', '목', '금', '토'];

export default function SchedulerPage() {
  const calendarRef = useRef(null);
  const [user, setUser] = useState(null);
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

  // 1. Auth & Data Sync
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) setUser(u);
      else signInAnonymously(auth);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, "schedules", user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setState(prev => ({ ...prev, ...data }));
      }
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (viewMode !== 'team') return;
    const q = query(collection(db, "schedules"), limit(50));
    const unsub = onSnapshot(q, (qs) => {
      const s = [];
      qs.forEach((doc) => s.push({ id: doc.id, ...doc.data() }));
      setTeamSchedules(s);
    });
    return () => unsub();
  }, [viewMode]);

  // 2. Helpers
  const getEndTime = (startTime, duration, lunch) => {
    if (!startTime || duration <= 0) return "";
    const [h, m] = startTime.split(':').map(Number);
    const totalMinutes = h * 60 + m + (Number(duration) + Number(lunch)) * 60;
    const endH = Math.floor(totalMinutes / 60) % 24;
    const endM = totalMinutes % 60;
    return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
  };

  // 3. Main Calculations (Defensive)
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const calendarData = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days = [];
    for (let i = 0; i < firstDay.getDay(); i++) days.push(null);
    
    let totalAccHours = 0;
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayOfWeek = new Date(year, month, d).getDay();
      
      // Force Number conversion to prevent string concatenation or undefined errors
      let hours = Number(state.exceptions[dateKey] !== undefined ? state.exceptions[dateKey] : state.defaults[dayOfWeek]) || 0;
      let start = state.startExceptions[dateKey] || state.startDefaults[dayOfWeek] || "09:00";
      let lunch = Number(state.lunchExceptions[dateKey] || state.lunchDefaults[dayOfWeek] || 1.0);
      
      let type = state.exceptions[dateKey] !== undefined ? (hours === 0 ? 'holiday' : 'exception') : 'default';
      
      if (totalAccHours + hours > MAX_MONTHLY_HOURS) {
        hours = Math.max(0, MAX_MONTHLY_HOURS - totalAccHours);
        type = 'capped';
      }
      const endTime = getEndTime(start, hours, lunch);
      totalAccHours += hours;
      days.push({ day: d, dateKey, hours, start, end: endTime, lunch, type, dayOfWeek });
    }
    return { days, totalAccHours: Number(totalAccHours) || 0, totalWage: (Number(totalAccHours) || 0) * HOURLY_WAGE };
  }, [year, month, state]);

  // 4. Actions
  const handleCapture = async () => {
    if (typeof window !== 'undefined' && window.html2canvas) {
      const canvas = await window.html2canvas(calendarRef.current, { backgroundColor: '#0d1117', scale: 2 });
      const link = document.createElement('a');
      link.download = `Schedule_${year}_${month + 1}.png`;
      link.href = canvas.toDataURL();
      link.click();
    } else {
      const script = document.createElement('script');
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
      document.head.appendChild(script);
      alert("캡처 엔진 준비 중... 1초 후 다시 시도해 주세요.");
    }
  };

  const saveState = async (updates) => {
    if (!user) return;
    setIsSyncing(true);
    const nextState = { ...state, ...updates };
    try {
      await setDoc(doc(db, "schedules", user.uid), {
        ...nextState,
        name: nextState.name || '익명',
        updatedAt: new Date().toISOString()
      });
    } catch (e) { console.error(e); }
    finally { setIsSyncing(false); }
  };

  return (
    <div className="min-h-screen bg-[#0d1117] text-slate-200 font-sans p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Dashboard Header */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 bg-slate-900/40 p-8 rounded-3xl border border-slate-800 shadow-2xl backdrop-blur-xl">
          <div className="space-y-2">
            <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400 tracking-tight">
              TIME KEEPER <span className="text-sm font-normal text-slate-500 ml-2">v2.3</span>
            </h1>
            <input 
              value={state.name} 
              placeholder="이름을 입력하세요"
              onChange={(e) => saveState({ name: e.target.value })}
              className="bg-transparent border-none text-slate-400 focus:ring-0 p-0 text-sm w-40 hover:text-slate-200 transition-colors"
            />
          </div>
          
          <div className="flex flex-col justify-center space-y-3">
            <div className="flex justify-between text-xs font-black text-slate-500 uppercase tracking-widest">
              <span>Monthly Progress</span>
              <span className={calendarData.totalAccHours >= 80 ? 'text-emerald-400' : 'text-blue-400'}>
                {(Number(calendarData.totalAccHours) || 0).toFixed(1)} / 80.0h
              </span>
            </div>
            <div className="w-full h-3 bg-slate-800/50 rounded-full overflow-hidden border border-slate-700/50">
              <div 
                className={`h-full transition-all duration-1000 ease-out ${calendarData.totalAccHours >= 80 ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.4)]' : 'bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.4)]'}`}
                style={{ width: `${Math.min(100, (calendarData.totalAccHours / 80) * 100)}%` }}
              />
            </div>
          </div>

          <div className="bg-blue-500/5 rounded-2xl border border-blue-500/10 p-4 flex flex-col items-center justify-center text-center">
            <span className="text-[10px] font-black text-blue-500/70 uppercase tracking-widest mb-1">Estimated Wage (₩12,790/h)</span>
            <div className="text-2xl font-black text-blue-400 tracking-tighter">
              ₩ {(Number(calendarData.totalWage) || 0).toLocaleString()}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex justify-between items-center">
          <div className="flex gap-1 bg-slate-900/50 p-1 rounded-xl w-fit border border-slate-800">
            <button onClick={() => setViewMode('personal')} className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'personal' ? 'bg-blue-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>내 스케줄</button>
            <button onClick={() => setViewMode('team')} className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'team' ? 'bg-indigo-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>팀 전체 보기</button>
          </div>
          <button onClick={handleCapture} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-black uppercase tracking-widest transition-all border border-slate-700 flex items-center gap-2">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span> 캡처 저장
          </button>
        </div>

        {viewMode === 'personal' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8" ref={calendarRef}>
            <aside className="lg:col-span-3 space-y-6">
              <div className="bg-slate-900/40 p-6 rounded-2xl border border-slate-800 space-y-4">
                <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span> 주간 기본 설정
                </h3>
                <div className="space-y-3">
                  {DAYS_KOREAN.map((day, idx) => (
                    <div key={day} className="flex items-center justify-between group">
                      <span className={`text-xs font-bold ${idx === 0 ? 'text-red-500/70' : idx === 6 ? 'text-blue-500/70' : 'text-slate-500'}`}>{day}</span>
                      <input 
                        type="number" step="0.5" value={state.defaults[idx]}
                        onChange={(e) => saveState({ defaults: { ...state.defaults, [idx]: Number(e.target.value) || 0 }})}
                        className="bg-slate-800/50 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] w-14 text-center focus:border-blue-500 outline-none"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </aside>

            <main className="lg:col-span-9 space-y-4">
              <div className="flex justify-center items-center gap-8 mb-2 text-slate-400 font-bold">
                <button onClick={() => setCurrentDate(new Date(year, month - 1))}>←</button>
                <h2 className="text-2xl font-black text-slate-100">{year}년 {month + 1}월</h2>
                <button onClick={() => setCurrentDate(new Date(year, month + 1))}>→</button>
              </div>

              <div className="bg-slate-900/20 p-6 rounded-[2.5rem] border border-slate-800/50">
                <div className="grid grid-cols-7 mb-6">
                  {DAYS_KOREAN.map((d, idx) => (
                    <div key={d} className={`text-center text-[10px] font-black uppercase tracking-widest ${idx === 0 ? 'text-red-500/50' : idx === 6 ? 'text-blue-500/50' : 'text-slate-600'}`}>{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-3">
                  {calendarData.days.map((d, i) => (
                    <div 
                      key={i} 
                      onClick={() => d && setSelectedDay(d)}
                      className={`
                        aspect-square rounded-[1.5rem] border transition-all relative flex flex-col items-center justify-center
                        ${!d ? 'bg-transparent border-transparent' : 'bg-slate-900/40 border-slate-800/50 hover:border-blue-500/50 hover:bg-slate-800/60 cursor-pointer'}
                        ${d?.type === 'holiday' ? 'opacity-30' : ''}
                        ${d?.type === 'capped' ? 'ring-2 ring-emerald-500/30 border-emerald-500/50' : ''}
                      `}
                    >
                      {d && (
                        <>
                          <span className={`absolute top-3 left-4 text-[11px] font-black ${d.dayOfWeek === 0 ? 'text-red-500/60' : d.dayOfWeek === 6 ? 'text-blue-500/60' : 'text-slate-500'}`}>
                            {d.day}
                          </span>
                          {d.hours > 0 && (
                            <div className="text-center">
                              <div className={`text-sm md:text-lg font-black ${d.type === 'default' ? 'text-blue-400' : d.type === 'exception' ? 'text-purple-400' : 'text-emerald-400'}`}>
                                {Number(d.hours).toFixed(1)}
                              </div>
                              <div className="text-[9px] text-slate-500 font-bold">{d.start} ~ {d.end}</div>
                            </>
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {teamSchedules.map((m) => {
              const total = Number(Object.values(m.exceptions || {}).reduce((a, b) => a + (Number(b) || 0), 0)) || 0;
              return (
                <div key={m.id} className="bg-slate-900/40 p-6 rounded-3xl border border-slate-800 space-y-4">
                  <div className="flex justify-between items-center font-black">
                    <span className="text-slate-200">{m.name}</span>
                    <span className="text-[9px] text-slate-500 uppercase">₩{(total * HOURLY_WAGE).toLocaleString()}</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-black text-blue-400/80 uppercase">
                      <span>{total.toFixed(1)}h</span>
                      <span>{Math.round((total/80)*100)}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 transition-all" style={{ width: `${(total / 80) * 100}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {selectedDay && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
            <div className="bg-[#161b22] w-full max-w-sm rounded-[2.5rem] border border-slate-700 p-10 shadow-2xl space-y-8">
              <div className="text-center space-y-1">
                <h3 className="text-2xl font-black text-blue-400 uppercase tracking-tighter">Edit Schedule</h3>
                <p className="text-slate-500 font-bold">{selectedDay.dateKey}</p>
              </div>
              <form onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const h = fd.get('type') === 'off' ? 0 : Number(fd.get('hours')) || 0;
                saveState({
                  exceptions: { ...state.exceptions, [selectedDay.dateKey]: h },
                  startExceptions: { ...state.startExceptions, [selectedDay.dateKey]: fd.get('start') },
                  lunchExceptions: { ...state.lunchExceptions, [selectedDay.dateKey]: fd.get('lunch') }
                });
                setSelectedDay(null);
              }} className="space-y-6">
                <div className="flex gap-2 p-1.5 bg-slate-900 rounded-2xl border border-slate-800">
                  <label className="flex-1">
                    <input type="radio" name="type" value="work" defaultChecked={selectedDay.hours > 0} className="peer hidden" />
                    <div className="text-center py-2.5 rounded-xl text-xs font-black cursor-pointer peer-checked:bg-blue-600 peer-checked:text-white text-slate-600">근무</div>
                  </label>
                  <label className="flex-1">
                    <input type="radio" name="type" value="off" defaultChecked={selectedDay.hours === 0} className="peer hidden" />
                    <div className="text-center py-2.5 rounded-xl text-xs font-black cursor-pointer peer-checked:bg-red-600 peer-checked:text-white text-slate-600">휴무</div>
                  </label>
                </div>
                <div className="space-y-5">
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest px-1">Daily Work Hours</label>
                    <input name="hours" type="number" step="0.5" defaultValue={selectedDay.hours || 8} className="bg-slate-900 border border-slate-800 rounded-2xl px-5 py-4 text-sm focus:border-blue-500 outline-none font-bold" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest px-1">Start Time</label>
                      <input name="start" type="time" defaultValue={selectedDay.start} className="bg-slate-900 border border-slate-800 rounded-2xl px-5 py-4 text-sm focus:border-blue-500 outline-none font-bold" />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest px-1">Lunch Break</label>
                      <select name="lunch" defaultValue={selectedDay.lunch} className="bg-slate-900 border border-slate-800 rounded-2xl px-5 py-4 text-sm focus:border-blue-500 outline-none font-bold appearance-none">
                        <option value="0">None</option><option value="0.5">30m</option><option value="1.0">1h</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div className="flex gap-4 pt-4">
                  <button type="button" onClick={() => setSelectedDay(null)} className="flex-1 py-4 rounded-2xl bg-slate-800 font-black text-xs uppercase hover:bg-slate-700 transition-all">Cancel</button>
                  <button type="submit" className="flex-1 py-4 rounded-2xl bg-blue-600 font-black text-xs uppercase hover:bg-blue-500 text-white transition-all">Save</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
