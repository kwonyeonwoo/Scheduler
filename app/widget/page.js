'use client';

import { useState, useEffect, useMemo } from 'react';
import { auth, db } from '../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';

const MAX_MONTHLY_HOURS = 80;
const DAYS_KOREAN = ['일', '월', '화', '수', '목', '금', '토'];

export default function WidgetPage() {
  const [user, setUser] = useState(null);
  const [currentDate] = useState(new Date());
  const [state, setState] = useState({
    defaults: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
    exceptions: {},
  });

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, "schedules", user.uid), (docSnap) => {
      if (docSnap.exists()) setState(prev => ({ ...prev, ...docSnap.data() }));
    });
    return () => unsub();
  }, [user]);

  const calendarData = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days = [];
    for (let i = 0; i < firstDay.getDay(); i++) days.push(null);
    
    let totalAccHours = 0;
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayOfWeek = new Date(year, month, d).getDay();
      const scheduledHours = Number(state.exceptions[dateKey] !== undefined ? state.exceptions[dateKey] : state.defaults[dayOfWeek]) || 0;
      totalAccHours += Math.min(MAX_MONTHLY_HOURS - totalAccHours, scheduledHours);
      days.push({ day: d, hours: scheduledHours, dayOfWeek });
    }
    return { days, totalAccHours };
  }, [year, month, state]);

  if (!user) return <div className="p-4 text-center text-slate-500 text-xs font-black uppercase">Please Login</div>;

  return (
    <div className="min-h-screen bg-[#0d1117] p-2 flex flex-col font-sans">
      <div className="flex justify-between items-center mb-3 px-2">
        <h2 className="text-lg font-black text-white tracking-tighter">{month + 1}월 현황</h2>
        <div className="text-right">
          <div className="text-[10px] font-black text-blue-500 uppercase tracking-widest">{calendarData.totalAccHours.toFixed(1)} / 80h</div>
          <div className="w-20 h-1 bg-slate-800 rounded-full mt-0.5 overflow-hidden">
            <div className="h-full bg-blue-500" style={{ width: `${(calendarData.totalAccHours / 80) * 100}%` }} />
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-7 gap-1 flex-1">
        {DAYS_KOREAN.map((d, idx) => (
          <div key={d} className={`text-center text-[8px] font-black uppercase ${idx === 0 ? 'text-red-500/50' : idx === 6 ? 'text-blue-500/50' : 'text-slate-600'}`}>{d}</div>
        ))}
        {calendarData.days.map((d, i) => (
          <div key={i} className={`aspect-square rounded-lg border flex flex-col items-center justify-center ${!d ? 'bg-transparent border-transparent' : 'bg-slate-900/60 border-slate-800/50'}`}>
            {d && (
              <>
                <span className={`text-[8px] font-bold mb-0.5 ${d.dayOfWeek === 0 ? 'text-red-500/60' : d.dayOfWeek === 6 ? 'text-blue-500/60' : 'text-slate-500'}`}>{d.day}</span>
                {d.hours > 0 && <div className="text-[10px] font-black text-blue-400">{d.hours}</div>}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
