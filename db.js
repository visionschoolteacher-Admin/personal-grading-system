// ============================================
// PERSONAL GRADING SYSTEM
// LOCAL DATABASE + SUPABASE SYNC
// ============================================

const DB_NAME = "personalGradingSystemDB";
const DB_VERSION = 6;

const STORES = {
  students: "students",
  grades: "grades",
  attendance: "attendance",
  notes: "notes",
  syncQueue: "syncQueue"
};

let db = null;
let syncRunning = false;

// ============================================
// SUPABASE / AUTH
// ============================================

function getSupabase() {
  return window.supabaseClient || null;
}

async function getCurrentUser() {
  const sb = getSupabase();

  if (!sb) return null;

  try {
    const {
      data: { user },
      error
    } = await sb.auth.getUser();

    if (error || !user) return null;

    return user;
  } catch (error) {
    console.error("Could not get current user:", error);
    return null;
  }
}

// ============================================
// DATABASE
// ============================================

function openDatabase() {
  return new Promise((resolve, reject) => {

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = e => {

      const d = e.target.result;

      const create = (name, indexes) => {

        if (!d.objectStoreNames.contains(name)) {

          const store = d.createObjectStore(name, {
            keyPath: "id",
            autoIncrement: true
          });

          indexes.forEach(indexName => {

            store.createIndex(
              indexName,
              indexName,
              { unique: false }
            );

          });
        }
      };

      create(STORES.students, [
        "studentId",
        "name",
        "workspace",
        "academicYear",
        "level",
        "user_id"
      ]);

      create(STORES.grades, [
        "studentId",
        "workspace",
        "academicYear",
        "semester",
        "subject",
        "component",
        "date",
        "user_id"
      ]);

      create(STORES.attendance, [
        "studentId",
        "studentName",
        "workspace",
        "academicYear",
        "date",
        "status",
        "month",
        "semester",
        "user_id"
      ]);

      create(STORES.notes, [
        "studentId",
        "workspace",
        "academicYear",
        "date",
        "user_id"
      ]);

      // ----------------------------------------
      // SYNC QUEUE
      // ----------------------------------------

      if (!d.objectStoreNames.contains(STORES.syncQueue)) {

        const queue = d.createObjectStore(
          STORES.syncQueue,
          {
            keyPath: "id",
            autoIncrement: true
          }
        );

        queue.createIndex(
          "storeName",
          "storeName",
          { unique: false }
        );

        queue.createIndex(
          "recordId",
          "recordId",
          { unique: false }
        );

        queue.createIndex(
          "operation",
          "operation",
          { unique: false }
        );
      }
    };

    request.onsuccess = e => {

      db = e.target.result;

      db.onversionchange = () => {
        db.close();
      };

      resolve(db);
    };

    request.onerror = e => {
      console.error(
        "IndexedDB error:",
        e.target.error
      );

      reject(e.target.error);
    };
  });
}

function ensureDB() {
  return db
    ? Promise.resolve(db)
    : openDatabase();
}

// ============================================
// GENERIC LOCAL DATABASE FUNCTIONS
// ============================================

async function getRecord(storeName, id) {

  await ensureDB();

  return new Promise((resolve, reject) => {

    const request = db
      .transaction(storeName, "readonly")
      .objectStore(storeName)
      .get(Number(id));

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

async function getAllRecords(storeName) {

  await ensureDB();

  return new Promise((resolve, reject) => {

    const request = db
      .transaction(storeName, "readonly")
      .objectStore(storeName)
      .getAll();

    request.onsuccess = () => {
      resolve(request.result || []);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

async function addLocalRecord(storeName, data) {

  await ensureDB();

  return new Promise((resolve, reject) => {

    const request = db
      .transaction(storeName, "readwrite")
      .objectStore(storeName)
      .add(data);

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

async function updateLocalRecord(storeName, data) {

  await ensureDB();

  return new Promise((resolve, reject) => {

    const request = db
      .transaction(storeName, "readwrite")
      .objectStore(storeName)
      .put(data);

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

async function deleteLocalRecord(storeName, id) {

  await ensureDB();

  return new Promise((resolve, reject) => {

    const request = db
      .transaction(storeName, "readwrite")
      .objectStore(storeName)
      .delete(Number(id));

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

// ============================================
// SYNC QUEUE
// ============================================

async function addToSyncQueue(storeName, recordId, operation) {

  await ensureDB();

  return new Promise((resolve, reject) => {

    const request = db
      .transaction(STORES.syncQueue, "readwrite")
      .objectStore(STORES.syncQueue)
      .add({
        storeName,
        recordId: Number(recordId),
        operation,
        createdAt: new Date().toISOString()
      });

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getSyncQueue() {
  return await getAllRecords(STORES.syncQueue);
}

async function removeSyncQueueItem(id) {

  await ensureDB();

  return new Promise((resolve, reject) => {

    const request = db
      .transaction(STORES.syncQueue, "readwrite")
      .objectStore(STORES.syncQueue)
      .delete(Number(id));

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// ============================================
// SUPABASE TABLE NAMES
// ============================================

function supabaseTable(storeName) {

  const tables = {
    students: "students",
    grades: "grades",
    attendance: "attendance",
    notes: "notes"
  };

  return tables[storeName];
}

// ============================================
// LOCAL → SUPABASE DATA CLEANUP
// ============================================

function prepareForSupabase(storeName, record) {

  const clean = { ...record };

  // IndexedDB-only fields
  delete clean.id;

  // ------------------------------------------
  // STUDENTS
  // ------------------------------------------

  if (storeName === STORES.students) {

    return {
      student_id: clean.studentId,
      name: clean.name,
      section: clean.section || null,
      academic_year: clean.academicYear,
      level: clean.level,
      workspace: clean.workspace,
      created_at: clean.createdAt || new Date().toISOString(),
      updated_at: clean.updatedAt || new Date().toISOString(),
      user_id: clean.user_id
    };
  }

  // ------------------------------------------
  // GRADES
  // ------------------------------------------

  if (storeName === STORES.grades) {

    return {
      student_id: clean.studentId,
      workspace: clean.workspace,
      academic_year: clean.academicYear,
      semester: clean.semester,
      subject: clean.subject,
      component: clean.component,
      component_weight: clean.componentWeight,
      record_name: clean.recordName,
      date: clean.date,
      score: clean.score,
      total: clean.total,
      percentage: clean.percentage,
      notes: clean.notes || "",
      created_at: clean.createdAt || new Date().toISOString(),
      updated_at: clean.updatedAt || new Date().toISOString(),
      user_id: clean.user_id
    };
  }

  // ------------------------------------------
  // ATTENDANCE
  // ------------------------------------------

  if (storeName === STORES.attendance) {

    return {
      student_id: clean.studentId,
      student_name: clean.studentName || "",
      workspace: clean.workspace,
      academic_year: clean.academicYear,
      semester: clean.semester,
      date: clean.date,
      month: clean.month,
      status: clean.status,
      created_at: clean.createdAt || new Date().toISOString(),
      updated_at: clean.updatedAt || new Date().toISOString(),
      user_id: clean.user_id
    };
  }

  // ------------------------------------------
  // NOTES
  // ------------------------------------------

  if (storeName === STORES.notes) {

    return {
      student_id: clean.studentId,
      workspace: clean.workspace,
      academic_year: clean.academicYear,
      date: clean.date,
      note: clean.note,
      created_at: clean.createdAt || new Date().toISOString(),
      user_id: clean.user_id
    };
  }

  return clean;
}

// ============================================
// SUPABASE → LOCAL DATA CONVERSION
// ============================================

function prepareFromSupabase(storeName, record) {

  if (storeName === STORES.students) {

    return {
      id: Number(record.id),
      studentId: record.student_id,
      name: record.name,
      section: record.section || "",
      academicYear: record.academic_year,
      level: record.level,
      workspace: record.workspace,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      user_id: record.user_id
    };
  }

  if (storeName === STORES.grades) {

    return {
      id: Number(record.id),
      studentId: Number(record.student_id),
      workspace: record.workspace,
      academicYear: record.academic_year,
      semester: record.semester,
      subject: record.subject,
      component: record.component,
      componentWeight: Number(record.component_weight),
      recordName: record.record_name,
      date: record.date,
      score: Number(record.score),
      total: Number(record.total),
      percentage: Number(record.percentage),
      notes: record.notes || "",
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      user_id: record.user_id
    };
  }

  if (storeName === STORES.attendance) {

    return {
      id: Number(record.id),
      studentId: Number(record.student_id),
      studentName: record.student_name || "",
      workspace: record.workspace,
      academicYear: record.academic_year,
      semester: record.semester,
      date: record.date,
      month: record.month,
      status: record.status,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      user_id: record.user_id
    };
  }

  if (storeName === STORES.notes) {

    return {
      id: Number(record.id),
      studentId: Number(record.student_id),
      workspace: record.workspace,
      academicYear: record.academic_year,
      date: record.date,
      note: record.note,
      createdAt: record.created_at,
      user_id: record.user_id
    };
  }

  return record;
}

// ============================================
// PUBLIC ADD RECORD
// ============================================

async function addRecord(storeName, data) {

  const user = await getCurrentUser();

  if (user) {
    data.user_id = user.id;
  }

  data.updatedAt =
    data.updatedAt || new Date().toISOString();

  data.createdAt =
    data.createdAt || data.updatedAt;

  // ------------------------------------------
  // ONLINE
  // ------------------------------------------

  if (navigator.onLine && user) {

    try {

      const sb = getSupabase();
      const table = supabaseTable(storeName);

      const payload =
        prepareForSupabase(storeName, data);

      const { data: inserted, error } =
        await sb
          .from(table)
          .insert(payload)
          .select()
          .single();

      if (error) {
        console.warn(
          "Supabase insert failed. Saving locally:",
          error
        );

        const localId =
          await addLocalRecord(storeName, data);

        await addToSyncQueue(
          storeName,
          localId,
          "insert"
        );

        return localId;
      }

      const localRecord =
        prepareFromSupabase(
          storeName,
          inserted
        );

      return await addLocalRecord(
        storeName,
        localRecord
      );

    } catch (error) {

      console.warn(
        "Online save failed. Saving locally:",
        error
      );
    }
  }

  // ------------------------------------------
  // OFFLINE
  // ------------------------------------------

  const localId =
    await addLocalRecord(storeName, data);

  if (user) {
    await addToSyncQueue(
      storeName,
      localId,
      "insert"
    );
  }

  return localId;
}

// ============================================
// PUBLIC UPDATE RECORD
// ============================================

async function updateRecord(storeName, data) {

  const user = await getCurrentUser();

  if (user) {
    data.user_id = user.id;
  }

  data.updatedAt =
    new Date().toISOString();

  // ------------------------------------------
  // ONLINE + REAL SUPABASE ID
  // ------------------------------------------

  if (
    navigator.onLine &&
    user &&
    Number(data.id) > 0
  ) {

    try {

      const sb = getSupabase();
      const table = supabaseTable(storeName);

      const payload =
        prepareForSupabase(storeName, data);

      const { data: updated, error } =
        await sb
          .from(table)
          .update(payload)
          .eq("id", Number(data.id))
          .eq("user_id", user.id)
          .select()
          .single();

      if (!error && updated) {

        const localRecord =
          prepareFromSupabase(
            storeName,
            updated
          );

        return await updateLocalRecord(
          storeName,
          localRecord
        );
      }

      console.warn(
        "Supabase update failed:",
        error
      );

    } catch (error) {

      console.warn(
        "Online update failed:",
        error
      );
    }
  }

  // ------------------------------------------
  // ALWAYS SAVE LOCALLY
  // ------------------------------------------

  const result =
    await updateLocalRecord(
      storeName,
      data
    );

  if (user) {

    await addToSyncQueue(
      storeName,
      data.id,
      "update"
    );
  }

  return result;
}

// ============================================
// PUBLIC DELETE RECORD
// ============================================

async function deleteRecord(storeName, id) {

  const user = await getCurrentUser();

  // ------------------------------------------
  // DELETE ONLINE
  // ------------------------------------------

  if (
    navigator.onLine &&
    user &&
    Number(id) > 0
  ) {

    try {

      const sb = getSupabase();
      const table = supabaseTable(storeName);

      const { error } =
        await sb
          .from(table)
          .delete()
          .eq("id", Number(id))
          .eq("user_id", user.id);

      if (error) {

        console.warn(
          "Supabase delete failed:",
          error
        );

        if (user) {
          await addToSyncQueue(
            storeName,
            id,
            "delete"
          );
        }
      }

    } catch (error) {

      console.warn(
        "Online delete failed:",
        error
      );

      if (user) {
        await addToSyncQueue(
          storeName,
          id,
          "delete"
        );
      }
    }
  } else if (user) {

    await addToSyncQueue(
      storeName,
      id,
      "delete"
    );
  }

  return await deleteLocalRecord(
    storeName,
    id
  );
}

// ============================================
// SYNC ONE RECORD
// ============================================

async function syncQueueItem(item) {

  const user = await getCurrentUser();

  if (!user) return false;

  const sb = getSupabase();

  if (!sb) return false;

  const table =
    supabaseTable(item.storeName);

  const localRecord =
    await getRecord(
      item.storeName,
      item.recordId
    );

  // ------------------------------------------
  // DELETE
  // ------------------------------------------

  if (item.operation === "delete") {

    if (Number(item.recordId) > 0) {

      const { error } =
        await sb
          .from(table)
          .delete()
          .eq("id", Number(item.recordId))
          .eq("user_id", user.id);

      if (error) {
        console.error(
          "Sync delete failed:",
          error
        );

        return false;
      }
    }

    return true;
  }

  if (!localRecord) {
    return true;
  }

  // ------------------------------------------
  // INSERT
  // ------------------------------------------

  if (
    item.operation === "insert" &&
    Number(localRecord.id) < 0
  ) {

    const payload =
      prepareForSupabase(
        item.storeName,
        localRecord
      );

    const { data: inserted, error } =
      await sb
        .from(table)
        .insert(payload)
        .select()
        .single();

    if (error) {

      console.error(
        "Sync insert failed:",
        error
      );

      return false;
    }

    const newLocal =
      prepareFromSupabase(
        item.storeName,
        inserted
      );

    // Remove temporary record
    await deleteLocalRecord(
      item.storeName,
      localRecord.id
    );

    // Add real Supabase record
    await addLocalRecord(
      item.storeName,
      newLocal
    );

    // Update dependent student IDs
    if (
      item.storeName === STORES.students
    ) {

      await updateDependentStudentIds(
        localRecord.id,
        newLocal.id
      );
    }

    return true;
  }

  // ------------------------------------------
  // INSERT WITH NORMAL LOCAL ID
  // ------------------------------------------

  if (item.operation === "insert") {

    const payload =
      prepareForSupabase(
        item.storeName,
        localRecord
      );

    const { data: inserted, error } =
      await sb
        .from(table)
        .insert(payload)
        .select()
        .single();

    if (error) {

      // Possible duplicate:
      // try to find matching record
      console.warn(
        "Insert sync failed:",
        error
      );

      return false;
    }

    const newLocal =
      prepareFromSupabase(
        item.storeName,
        inserted
      );

    await deleteLocalRecord(
      item.storeName,
      localRecord.id
    );

    await addLocalRecord(
      item.storeName,
      newLocal
    );

    if (
      item.storeName === STORES.students
    ) {

      await updateDependentStudentIds(
        localRecord.id,
        newLocal.id
      );
    }

    return true;
  }

  // ------------------------------------------
  // UPDATE
  // ------------------------------------------

  if (item.operation === "update") {

    if (Number(localRecord.id) <= 0) {
      return false;
    }

    const payload =
      prepareForSupabase(
        item.storeName,
        localRecord
      );

    const { error } =
      await sb
        .from(table)
        .update(payload)
        .eq("id", Number(localRecord.id))
        .eq("user_id", user.id);

    if (error) {

      console.error(
        "Sync update failed:",
        error
      );

      return false;
    }

    return true;
  }

  return true;
}

// ============================================
// UPDATE DEPENDENT RECORDS AFTER STUDENT SYNC
// ============================================

async function updateDependentStudentIds(
  oldStudentId,
  newStudentId
) {

  const stores = [
    STORES.grades,
    STORES.attendance,
    STORES.notes
  ];

  for (const storeName of stores) {

    const records =
      await getAllRecords(storeName);

    const matching =
      records.filter(
        r =>
          Number(r.studentId) ===
          Number(oldStudentId)
      );

    for (const record of matching) {

      record.studentId =
        Number(newStudentId);

      await updateLocalRecord(
        storeName,
        record
      );
    }
  }
}

// ============================================
// SYNC QUEUE
// ============================================

async function syncPendingChanges() {

  if (syncRunning) return;

  if (!navigator.onLine) return;

  const user =
    await getCurrentUser();

  if (!user) return;

  syncRunning = true;

  try {

    const queue =
      await getSyncQueue();

    if (!queue.length) {
      return;
    }

    console.log(
      `🔄 Syncing ${queue.length} pending change(s)...`
    );

    for (const item of queue) {

      try {

        const success =
          await syncQueueItem(item);

        if (success) {

          await removeSyncQueueItem(
            item.id
          );
        }

      } catch (error) {

        console.error(
          "Sync item error:",
          error
        );
      }
    }

    console.log(
      "✅ Pending changes sync finished."
    );

  } finally {

    syncRunning = false;
  }
}

// ============================================
// DOWNLOAD SUPABASE DATA
// ============================================

async function pullSupabaseData() {

  if (!navigator.onLine) return;

  const user =
    await getCurrentUser();

  if (!user) return;

  const sb = getSupabase();

  if (!sb) return;

  console.log(
    "☁️ Loading your Supabase records..."
  );

  const stores = [
    STORES.students,
    STORES.grades,
    STORES.attendance,
    STORES.notes
  ];

  for (const storeName of stores) {

    const table =
      supabaseTable(storeName);

    try {

      const { data, error } =
        await sb
          .from(table)
          .select("*")
          .eq("user_id", user.id);

      if (error) {

        console.error(
          `Could not load ${table}:`,
          error
        );

        continue;
      }

      for (const record of data || []) {

        const local =
          prepareFromSupabase(
            storeName,
            record
          );

        const existing =
          await getRecord(
            storeName,
            local.id
          );

        if (existing) {

          await updateLocalRecord(
            storeName,
            local
          );

        } else {

          await addLocalRecord(
            storeName,
            local
          );
        }
      }

    } catch (error) {

      console.error(
        `Supabase pull error (${table}):`,
        error
      );
    }
  }

  console.log(
    "✅ Supabase records loaded locally."
  );
}

// ============================================
// INITIALIZE SYNC
// ============================================

async function initializeSync() {

  await ensureDB();

  if (!navigator.onLine) {

    console.log(
      "📴 Offline mode — using local database."
    );

    return;
  }

  const user =
    await getCurrentUser();

  if (!user) {

    console.log(
      "ℹ️ No active user. Local database available."
    );

    return;
  }

  try {

    // First pull cloud records
    await pullSupabaseData();

    // Then upload offline changes
    await syncPendingChanges();

  } catch (error) {

    console.error(
      "Sync initialization failed:",
      error
    );
  }
}

// ============================================
// INTERNET EVENTS
// ============================================

window.addEventListener(
  "online",
  async () => {

    console.log(
      "🌐 Internet connection restored."
    );

    await initializeSync();
  }
);

window.addEventListener(
  "offline",
  () => {

    console.log(
      "📴 Offline mode enabled."
    );
  }
);

// ============================================
// SUPABASE AUTH EVENTS
// ============================================

function setupSupabaseSyncListener() {

  const sb = getSupabase();

  if (!sb) {

    console.warn(
      "Supabase client not available yet."
    );

    return;
  }

  sb.auth.onAuthStateChange(
    async (event, session) => {

      console.log(
        "Auth event:",
        event
      );

      if (
        event === "SIGNED_IN" ||
        event === "INITIAL_SESSION"
      ) {

        if (session?.user) {

          setTimeout(
            () => initializeSync(),
            100
          );
        }
      }

      if (event === "SIGNED_OUT") {

        console.log(
          "User signed out."
        );
      }
    }
  );
}

// ============================================
// START DATABASE
// ============================================

openDatabase()
  .then(async () => {

    console.log(
      "Personal Grading System database ready."
    );

    setupSupabaseSyncListener();

    await initializeSync();

  })
  .catch(error => {

    console.error(
      "Database startup error:",
      error
    );
  });

console.log(
  "Personal Grading System database/sync layer loaded."
);
