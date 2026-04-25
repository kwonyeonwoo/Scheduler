const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, setDoc, deleteDoc } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyBPcHgtS1jvZw0VRavxvcYW8oIZK_8nPE4",
  authDomain: "scheduler-f1463.firebaseapp.com",
  projectId: "scheduler-f1463",
  storageBucket: "scheduler-f1463.firebasestorage.app",
  messagingSenderId: "859695122247",
  appId: "1:859695122247:web:61af75cbd7759dc81aee62"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function runMigration() {
  console.log("Starting final migration...");
  const querySnapshot = await getDocs(collection(db, "schedules"));
  
  let oldData = null;
  let oldId = null;
  let newData = null;
  let newId = null;

  querySnapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const id = docSnap.id;
    
    // 기존 계정 찾기: 이름이 '권연우'인 데이터
    if (data.name === "권연우" || id.includes("권연우")) {
      oldData = data;
      oldId = id;
      console.log("Found old data:", id);
    }
    
    // 새 계정 찾기: yeonyoo5969@gmail.com 계정 (ID가 이메일의 앞자리거나 UID 형식)
    if (data.name === "yeonyoo5969" || (data.email && data.email === "yeonyoo5969@gmail.com")) {
      newData = data;
      newId = id;
      console.log("Found new account:", id);
    }
  });

  if (oldData && newId) {
    console.log(`Copying data from ${oldId} to ${newId}...`);
    
    // 데이터 복사 (이름은 유지하거나 '권연우'로 설정)
    await setDoc(doc(db, "schedules", newId), {
      ...oldData,
      name: "권연우", // 이름을 '권연우'로 통일
      email: "yeonyoo5969@gmail.com", // 이메일 정보는 새 것으로 업데이트
      updatedAt: new Date().toISOString()
    });

    console.log("Migration successful!");
  } else {
    console.log("Migration failed.");
    if (!oldData) console.log("- Could not find old data for '권연우'.");
    if (!newId) console.log("- Could not find new account 'yeonyoo5969@gmail.com'.");
  }
}

runMigration().catch(console.error);
