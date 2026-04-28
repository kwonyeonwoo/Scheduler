import { db } from '../../lib/firebase';
import { collection, getDocs, doc, deleteDoc } from 'firebase/firestore';
import { NextResponse } from 'next/server';

export const dynamic = 'force-static';

export async function GET() {
  try {
    const querySnapshot = await getDocs(collection(db, "schedules"));
    const deleted = [];

    for (const docSnap of querySnapshot.docs) {
      const data = docSnap.data();
      const id = docSnap.id;
      const name = data.name || "";
      const email = data.email || "";

      // 삭제 조건:
      // 1. 이름이나 ID에 'test'가 포함된 경우
      // 2. 이름이 '권연우'인데 새 계정(yeonyoo5969@gmail.com)이 아닌 다른 UID인 경우
      const isTest = name.toLowerCase().includes('test') || id.toLowerCase().includes('test');
      const isOldKwon = (name === "권연우" || id === "권연우") && email !== "yeonyoo5969@gmail.com" && id !== "9p4NYuk2WrYocssnQH2gSGR9P3j2";

      if (isTest || isOldKwon) {
        await deleteDoc(doc(db, "schedules", id));
        deleted.push({ id, name, reason: isTest ? "test account" : "old duplicate" });
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: `${deleted.length}개의 유령 데이터를 삭제했습니다.`,
      details: deleted
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
