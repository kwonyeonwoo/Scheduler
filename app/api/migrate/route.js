import { db } from '../../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { NextResponse } from 'next/server';

export async function GET() {
  const oldUid = "2xfMFdrZTeRsuxw9ix5H8AtgWPE2"; // 기존 계정 UID
  const newUid = "9p4NYuk2WrYocssnQH2gSGR9P3j2"; // 새 계정 UID

  try {
    console.log(`Starting migration from ${oldUid} to ${newUid}`);
    
    // 1. 기존 데이터 읽기
    const oldDocRef = doc(db, "schedules", oldUid);
    const oldDocSnap = await getDoc(oldDocRef);

    if (!oldDocSnap.exists()) {
      return NextResponse.json({ 
        success: false, 
        message: "기존 계정(UID: 2xfMFdrZTeRsuxw9ix5H8AtgWPE2)의 데이터를 찾을 수 없습니다." 
      });
    }

    const oldData = oldDocSnap.data();

    // 2. 새 계정에 데이터 덮어쓰기
    await setDoc(doc(db, "schedules", newUid), {
      ...oldData,
      email: "yeonyoo5969@gmail.com", // 새 이메일 주소로 업데이트
      updatedAt: new Date().toISOString()
    });

    return NextResponse.json({ 
      success: true, 
      message: "데이터 이전이 완료되었습니다! 이제 새 계정으로 로그인하여 확인해 보세요.",
      migratedData: {
        name: oldData.name,
        month: new Date().getMonth() + 1
      }
    });

  } catch (error) {
    console.error("Migration Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
