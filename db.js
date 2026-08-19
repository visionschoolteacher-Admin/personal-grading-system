const DB_NAME="personalGradingSystemDB";
const DB_VERSION=4;
const STORES={students:"students",grades:"grades",attendance:"attendance",notes:"notes"};
let db=null;

function openDatabase(){
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open(DB_NAME,DB_VERSION);
  request.onupgradeneeded=e=>{
   const d=e.target.result;
   const create=(name,indexes)=>{
    if(!d.objectStoreNames.contains(name)){
     const s=d.createObjectStore(name,{keyPath:"id",autoIncrement:true});
     indexes.forEach(i=>s.createIndex(i,i,{unique:false}));
    }
   };
   create(STORES.students,["studentId","name","workspace","academicYear","level"]);
   create(STORES.grades,["studentId","workspace","academicYear","semester","subject","component","date"]);
   create(STORES.attendance,["studentId","studentName","workspace","academicYear","date","status","month","semester"]);
   create(STORES.notes,["studentId","workspace","academicYear","date"]);
  };
  request.onsuccess=e=>{db=e.target.result;resolve(db)};
  request.onerror=e=>reject(e.target.error);
 });
}
function ensureDB(){return db?Promise.resolve(db):openDatabase();}
async function addRecord(storeName,data){await ensureDB();return new Promise((res,rej)=>{const r=db.transaction(storeName,"readwrite").objectStore(storeName).add(data);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function getRecord(storeName,id){await ensureDB();return new Promise((res,rej)=>{const r=db.transaction(storeName,"readonly").objectStore(storeName).get(Number(id));r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function getAllRecords(storeName){await ensureDB();return new Promise((res,rej)=>{const r=db.transaction(storeName,"readonly").objectStore(storeName).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function updateRecord(storeName,data){await ensureDB();return new Promise((res,rej)=>{const r=db.transaction(storeName,"readwrite").objectStore(storeName).put(data);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function deleteRecord(storeName,id){await ensureDB();return new Promise((res,rej)=>{const r=db.transaction(storeName,"readwrite").objectStore(storeName).delete(Number(id));r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
openDatabase().then(()=>console.log("Personal Grading System database ready.")).catch(console.error);