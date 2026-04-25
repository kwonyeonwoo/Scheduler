import { db } from '../../lib/firebase';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const querySnapshot = await getDocs(collection(db, "schedules"));
    let oldData = null;
    let targetUid = null;

    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const id = docSnap.id;
      
      // 기존 계정 찾기
      if (data.name === "권연우") {
        oldData = data;
      }
      
      // 새 계정 찾기 (이메일 기준)
      if (data.email === "yeonyoo5969@gmail.com") {
        targetUid = id;
      }
    });

    if (oldData && targetUid) {
      // 데이터 이전 (복사)
      await setDoc(doc(db, "schedules", targetUid), {
        ...oldData,
        name: "권연우", // 이름 유지
        email: "yeonyoo5969@gmail.com", // 새 이메일로 갱신
        updatedAt: new Date().toISOString()
      });

      return NextResponse.json({ 
        success: true, 
        message: "권연우 님의 데이터가 yeonyoo5969@gmail.com 계정으로 성공적으로 이전되었습니다.",
        targetId: targetUid
      });
    }

    return NextResponse.json({ 
      success: false, 
      message: "데이터를 찾지 못했습니다.",
      oldDataFound: !!oldData,
      targetAccountFound: !!targetUid
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
