'use client';

import { useState, useEffect, useMemo } from 'react';
import { auth, db, isFirebaseConfigured } from '../lib/firebase';
import { getHoliday } from '../lib/holidays';
import { DAYS_KOREAN, EMPTY_SCHEDULE, calculateMonth, normalizeSchedule } from '../lib/schedule';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';

export default function WidgetPage() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(!auth);
  const [error, setError] = useState('');
  const [currentDate] = useState(new Date());
  const [state, setState] = useState(() => normalizeSchedule(EMPTY_SCHEDULE));

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  useEffect(() => {
    if (!auth) {
      return undefined;
    }
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user || !db) return undefined;
    const unsub = onSnapshot(doc(db, "schedules", user.uid), (docSnap) => {
      if (docSnap.exists()) setState(normalizeSchedule(docSnap.data()));
      setError('');
    }, () => setError('일정을 불러오지 못했습니다.'));
    return () => unsub();
  }, [user]);

  const calendarData = useMemo(
    () => calculateMonth(state, currentDate, getHoliday),
    [currentDate, state]
  );

  if (!isFirebaseConfigured) return <div className="p-4 text-center text-red-400 text-xs font-black">Firebase 설정 필요</div>;
  if (!authReady) return <div className="p-4 text-center text-slate-500 text-xs font-black">Loading…</div>;
  if (!user) return <div className="p-4 text-center text-slate-500 text-xs font-black uppercase">Please Login</div>;
  if (error) return <div className="p-4 text-center text-red-400 text-xs font-black">{error}</div>;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-2 flex flex-col font-sans">
      <div className="flex justify-between items-center mb-3 px-2">
        <h2 className="text-lg font-black text-slate-900 tracking-tighter">{month + 1}월 현황</h2>
        <div className="text-right">
          <div className="text-[10px] font-black text-blue-700 tracking-widest">인정 {calendarData.totalAccHours.toFixed(1)}h</div>
          <div className="w-20 h-1 bg-slate-200 rounded-full mt-0.5 overflow-hidden">
            <div className="h-full bg-blue-500" style={{ width: `${(calendarData.totalAccHours / 80) * 100}%` }} />
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-7 gap-1 flex-1">
        {DAYS_KOREAN.map((d, idx) => (
          <div key={d} className={`text-center text-[8px] font-black uppercase ${idx === 0 ? 'text-red-500/50' : idx === 6 ? 'text-blue-500/50' : 'text-slate-600'}`}>{d}</div>
        ))}
        {calendarData.days.map((d, i) => (
          <div key={i} className={`aspect-square rounded-lg border flex flex-col items-center justify-center ${!d ? 'bg-transparent border-transparent' : 'bg-white border-slate-200'}`}>
            {d && (
              <>
                <span className={`text-[8px] font-bold mb-0.5 ${d.dayOfWeek === 0 ? 'text-red-500/60' : d.dayOfWeek === 6 ? 'text-blue-500/60' : 'text-slate-500'}`}>{d.day}</span>
                {d.effectiveHours > 0 && <div className="text-[10px] font-black text-blue-700">{d.effectiveHours}</div>}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
