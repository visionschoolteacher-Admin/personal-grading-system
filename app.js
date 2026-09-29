// ============================================
// PERSONAL GRADING SYSTEM
// APP.JS
// Supabase Login + IndexedDB Grading System
// ============================================

let currentWorkspace = null;
let editingStudentId = null;
let selectedSemester = null;
let selectedSubject = null;
let selectedComponentIndex = null;
let editingGradeId = null;

// ============================================
// GRADING COMPONENTS
// ============================================

const GRADING_COMPONENTS = {
  English: [
    { name: "Reading (Fluency & Comprehension)", weight: 20 },
    { name: "Writing", weight: 20 },
    { name: "Speaking & Listening", weight: 20 },
    { name: "Homework, Classwork & Participation", weight: 10 },
    { name: "Semestrial Examination", weight: 25 },
    { name: "Attendance", weight: 5, type: "attendance" }
  ],

  Mathematics: [
    { name: "Written Test & Quizzes", weight: 15 },
    { name: "Performance Tasks / Problem Solving", weight: 20 },
    { name: "Classwork / Seatwork", weight: 10 },
    { name: "Homework", weight: 10 },
    { name: "Participation", weight: 15 },
    { name: "Semestrial Examination", weight: 25 },
    { name: "Attendance", weight: 5, type: "attendance" }
  ],

  Science: [
    { name: "Written Test & Quizzes", weight: 15 },
    { name: "Performance Tasks / Experiments", weight: 20 },
    { name: "Projects", weight: 15 },
    { name: "Classwork", weight: 10 },
    { name: "Participation", weight: 10 },
    { name: "Semestrial Examination", weight: 25 },
    { name: "Attendance", weight: 5, type: "attendance" }
  ]
};

/* ============================================
   METRIC SETTINGS — ADDITIVE UPDATE ONLY
   Keeps the existing grading system intact.
   Settings are stored locally per workspace.
   ============================================ */

const METRIC_SETTINGS_KEY = "personalGradingSystemMetricSettings_v1";

function isAttendanceComponent(component) {
  return component?.type === "attendance" || component?.name === "Attendance";
}

function getMetricSettingsStorage() {
  try {
    return JSON.parse(
      localStorage.getItem(METRIC_SETTINGS_KEY) || "{}"
    );
  } catch (error) {
    console.warn("Could not read metric settings:", error);
    return {};
  }
}

function saveMetricSettingsStorage(settings) {
  try {
    localStorage.setItem(
      METRIC_SETTINGS_KEY,
      JSON.stringify(settings)
    );
    return true;
  } catch (error) {
    console.error("Could not save metric settings:", error);
    return false;
  }
}

function applyMetricSettingsForWorkspace(workspace) {
  if (!workspace) return;

  const settings = getMetricSettingsStorage();
  const workspaceSettings = settings[workspace];

  if (!workspaceSettings) return;

  Object.keys(GRADING_COMPONENTS).forEach(subject => {
    const saved = workspaceSettings[subject];

    if (!Array.isArray(saved)) return;

    const current = GRADING_COMPONENTS[subject];

    saved.forEach((savedComponent, index) => {
      if (!current[index]) return;

      if (
        typeof savedComponent.name === "string" &&
        savedComponent.name.trim()
      ) {
        current[index].name = savedComponent.name.trim();
      }

      const weight = Number(savedComponent.weight);

      if (
        Number.isFinite(weight) &&
        weight >= 0 &&
        weight <= 100
      ) {
        current[index].weight = weight;
      }

      if (isAttendanceComponent(current[index])) {
        current[index].type = "attendance";
      }
    });
  });
}

function getMetricSettingsForWorkspace(workspace) {
  const settings = getMetricSettingsStorage();
  const result = {};

  Object.keys(GRADING_COMPONENTS).forEach(subject => {
    result[subject] = GRADING_COMPONENTS[subject].map(component => ({
      name: component.name,
      weight: Number(component.weight),
      ...(isAttendanceComponent(component)
        ? { type: "attendance" }
        : {})
    }));
  });

  return result;
}

function ensureMetricEditorUI() {
  if (!currentWorkspace) return;

  // Add only the new navigation button if it does not already exist.
  if (!document.getElementById("metricEditorNavButton")) {
    const existingNavButton =
      document.querySelector(".nav-button");

    if (existingNavButton?.parentElement) {
      const button =
        document.createElement("button");

      button.id = "metricEditorNavButton";
      button.className = "nav-button";
      button.type = "button";
      button.textContent = "⚙️ Edit Metrics";
      button.addEventListener("click", () => {
        showSection("metrics");
      });

      existingNavButton.parentElement.appendChild(button);
    }
  }

  // Add only the new section. No existing section is replaced.
  if (!document.getElementById("metricsSection")) {
    const workspace =
      document.getElementById("workspacePage");

    if (workspace) {
      const section =
        document.createElement("section");

      section.id = "metricsSection";
      section.className = "hidden";
      section.innerHTML = `
        <div class="section-header">
          <div>
            <h2>⚙️ Edit Metrics</h2>
            <p>Edit grading metric names and percentages for this workspace.</p>
          </div>
        </div>

        <div id="metricEditorContent"></div>
      `;

      workspace.appendChild(section);
    }
  }
}

function renderMetricEditor() {
  const container =
    document.getElementById("metricEditorContent");

  if (!container) return;

  container.innerHTML = Object.keys(GRADING_COMPONENTS)
    .map(subject => {
      const components =
        GRADING_COMPONENTS[subject] || [];

      const total =
        components.reduce(
          (sum, component) =>
            sum + Number(component.weight || 0),
          0
        );

      return `
        <div class="component-card metric-editor-card">
          <div class="component-card-header">
            <h3>${escapeHTML(subject)}</h3>
            <span class="weight-badge">
              Total: ${total.toFixed(2)}%
            </span>
          </div>

          <div class="metric-editor-list">
            ${components.map((component, index) => `
              <div class="form-grid metric-editor-row">
                <input
                  type="text"
                  id="metricName-${subject}-${index}"
                  value="${escapeHTML(component.name)}"
                  placeholder="Metric name"
                  aria-label="${escapeHTML(subject)} metric name">

                <input
                  type="number"
                  id="metricWeight-${subject}-${index}"
                  value="${Number(component.weight)}"
                  min="0"
                  max="100"
                  step="0.01"
                  placeholder="Percentage"
                  aria-label="${escapeHTML(subject)} metric percentage">
              </div>
            `).join("")}
          </div>

          <div class="form-actions">
            <button
              type="button"
              class="primary-button"
              onclick="saveMetricSettings('${subject}')">
              💾 Save ${escapeHTML(subject)}
            </button>
          </div>
        </div>
      `;
    })
    .join("");
}

async function saveMetricSettings(subject) {
  const components =
    GRADING_COMPONENTS[subject] || [];

  if (!components.length) return;

  const updated = [];

  for (let index = 0; index < components.length; index++) {
    const nameInput =
      document.getElementById(
        `metricName-${subject}-${index}`
      );

    const weightInput =
      document.getElementById(
        `metricWeight-${subject}-${index}`
      );

    const name =
      nameInput?.value.trim() || "";

    const weight =
      Number(weightInput?.value);

    if (!name) {
      return alert(
        `Please enter a name for metric ${index + 1}.`
      );
    }

    if (
      !Number.isFinite(weight) ||
      weight < 0 ||
      weight > 100
    ) {
      return alert(
        `Please enter a valid percentage for "${name}".`
      );
    }

    updated.push({
      oldName: components[index].name,
      name,
      weight,
      type: isAttendanceComponent(components[index])
        ? "attendance"
        : undefined
    });
  }

  const total =
    updated.reduce(
      (sum, component) =>
        sum + component.weight,
      0
    );

  if (Math.abs(total - 100) > 0.001) {
    return alert(
      `${subject} metrics must total exactly 100%. Current total: ${total.toFixed(2)}%.`
    );
  }

  const allGrades =
    await getAllRecords(STORES.grades);

  // Preserve existing grade history when a metric is renamed.
  for (const change of updated) {
    if (change.oldName === change.name) continue;

    const matchingRecords =
      allGrades.filter(record =>
        record.workspace === currentWorkspace &&
        record.subject === subject &&
        record.component === change.oldName
      );

    for (const record of matchingRecords) {
      record.component = change.name;
      record.componentWeight = change.weight;
      await updateRecord(
        STORES.grades,
        record
      );
    }
  }

  components.forEach((component, index) => {
    component.name = updated[index].name;
    component.weight = updated[index].weight;

    if (updated[index].type === "attendance") {
      component.type = "attendance";
    }
  });

  const settings =
    getMetricSettingsStorage();

  settings[currentWorkspace] =
    getMetricSettingsForWorkspace(
      currentWorkspace
    );

  if (!saveMetricSettingsStorage(settings)) {
    return alert(
      "The metrics were updated, but the settings could not be saved on this device."
    );
  }

  renderMetricEditor();

  if (selectedSubject === subject) {
    await renderGradingComponents();
  }

  alert(
    `${subject} metrics updated successfully.`
  );
}

// Load saved metric settings immediately for the current workspace.
function initializeMetricSettings() {
  applyMetricSettingsForWorkspace(
    currentWorkspace
  );
}

// ============================================
// AUTHENTICATION
// ============================================

async function checkLoginSession() {
  try {
    const { data, error } = await supabaseClient.auth.getSession();

    if (error) throw error;

    if (data.session) {
      showApp();
    } else {
      showLoginPage();
    }
  } catch (error) {
    console.error("Session check failed:", error);
    showLoginPage();
  }
}

function showLoginPage() {
  document.getElementById("loginPage")?.classList.remove("hidden");
  document.getElementById("dashboardPage")?.classList.add("hidden");
  document.getElementById("workspacePage")?.classList.add("hidden");
}

function showApp() {
  document.getElementById("loginPage")?.classList.add("hidden");
  document.getElementById("workspacePage")?.classList.add("hidden");
  document.getElementById("dashboardPage")?.classList.remove("hidden");
}

async function loginUser(email, password) {
  const { data, error } =
    await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

  if (error) throw error;

  return data;
}

async function logoutUser() {
  try {
    const { error } = await supabaseClient.auth.signOut();

    if (error) throw error;

    currentWorkspace = null;
    showLoginPage();

  } catch (error) {
    console.error("Logout failed:", error);
    alert("Unable to sign out.");
  }
}

function setupLogin() {
  const form = document.getElementById("loginForm");

  if (!form) return;

  form.addEventListener("submit", async event => {
    event.preventDefault();

    const email =
      document.getElementById("loginEmail")?.value.trim();

    const password =
      document.getElementById("loginPassword")?.value;

    const message =
      document.getElementById("loginMessage");

    if (!email || !password) {
      if (message) {
        message.textContent =
          "Please enter your email and password.";
      }

      return;
    }

    if (message) {
      message.textContent = "Signing in...";
    }

    try {
      await loginUser(email, password);

      if (message) {
        message.textContent = "";
      }

      showApp();

    } catch (error) {
      console.error("Login failed:", error);

      if (message) {
        message.textContent =
          error.message || "Invalid email or password.";
      }
    }
  });
}

// ============================================
// WORKSPACE
// ============================================

function openWorkspace(type) {
  currentWorkspace = type;

  initializeMetricSettings();
  ensureMetricEditorUI();

  document.body.classList.remove(
    "wife-theme",
    "personal-theme"
  );

  document.body.classList.add(
    type === "wife"
      ? "wife-theme"
      : "personal-theme"
  );

  const dashboard =
    document.getElementById("dashboardPage");

  const workspace =
    document.getElementById("workspacePage");

  dashboard?.classList.add("hidden");
  workspace?.classList.remove("hidden");

  const title =
    document.getElementById("workspaceTitle");

  const subtitle =
    document.getElementById("workspaceSubtitle");

  if (title) {
    title.textContent =
      type === "wife"
        ? "👩‍🏫 Wife's Workspace"
        : "👨‍🏫 Husband's Workspace";
  }

  if (subtitle) {
    subtitle.textContent =
      "Student Records & Academic Management";
  }

  resetRecordsInterface();

  showSection("students");
}

function goHome() {
  document.body.classList.remove(
    "wife-theme",
    "personal-theme"
  );

  document.getElementById("workspacePage")
    ?.classList.add("hidden");

  document.getElementById("dashboardPage")
    ?.classList.remove("hidden");

  currentWorkspace = null;
}

async function showSection(section) {
  const sections = [
    "students",
    "records",
    "attendance",
    "notes",
    "reports",
    "excel",
    "metrics"
  ];

  sections.forEach(s => {
    document
      .getElementById(s + "Section")
      ?.classList.add("hidden");
  });

  document
    .getElementById(section + "Section")
    ?.classList.remove("hidden");

  document
    .querySelectorAll(".nav-button")
    .forEach(button =>
      button.classList.remove("active")
    );

  const index = sections.indexOf(section);

  document
    .querySelectorAll(".nav-button")[index]
    ?.classList.add("active");

  if (section === "students") {
    await loadStudents();
  }

  if (section === "records") {
    await loadGradeStudents();
  }

  if (section === "attendance") {
    await initializeAttendance();
  }

  if (section === "notes") {
    await initializeNotes();
  }

  if (section === "reports") {
    await loadReportStudents();
  }

  if (section === "metrics") {
    ensureMetricEditorUI();
    renderMetricEditor();
  }
}

// ============================================
// STUDENTS
// ============================================

function showStudentForm() {
  editingStudentId = null;

  const heading =
    document.querySelector("#studentForm h3");

  if (heading) {
    heading.textContent = "Add Student";
  }

  document.getElementById("studentId").value = "";
  document.getElementById("studentName").value = "";
  document.getElementById("studentSection").value = "";

  document
    .getElementById("studentForm")
    ?.classList.remove("hidden");
}

function hideStudentForm() {
  editingStudentId = null;

  document
    .getElementById("studentForm")
    ?.classList.add("hidden");
}

async function saveStudent() {
  const sid =
    document.getElementById("studentId")
      ?.value.trim();

  const name =
    document.getElementById("studentName")
      ?.value.trim();

  const section =
    document.getElementById("studentSection")
      ?.value.trim();

  const year =
    document.getElementById("academicYearSelect")
      ?.value;

  const level =
    document.getElementById("levelSelect")
      ?.value;

  if (!sid || !name || !year || !level) {
    return alert(
      "Please complete Student ID, Name, Academic Year and Level."
    );
  }

  const all =
    await getAllRecords(STORES.students);

  if (editingStudentId !== null) {

    const student =
      await getRecord(
        STORES.students,
        editingStudentId
      );

    if (!student) return;

    Object.assign(student, {
      studentId: sid,
      name,
      section,
      academicYear: year,
      level,
      workspace: currentWorkspace,
      updatedAt: new Date().toISOString()
    });

    await updateRecord(
      STORES.students,
      student
    );

    alert("Student updated successfully.");

  } else {

    const duplicate = all.some(student =>
      student.studentId === sid &&
      student.workspace === currentWorkspace &&
      student.academicYear === year
    );

    if (duplicate) {
      return alert(
        "A student with this ID already exists."
      );
    }

    await addRecord(
      STORES.students,
      {
        studentId: sid,
        name,
        section,
        academicYear: year,
        level,
        workspace: currentWorkspace,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    );

    alert("Student added successfully.");
  }

  hideStudentForm();

  await loadStudents();
}

async function loadStudents() {
  if (!currentWorkspace) return;

  const all =
    await getAllRecords(STORES.students);

  const year =
    document.getElementById("academicYearSelect")
      ?.value;

  const list = all.filter(student =>
    student.workspace === currentWorkspace &&
    (!year || student.academicYear === year)
  );

  renderStudents(list);

  await loadGradeStudents();
  await loadNoteStudents();
  await loadReportStudents();
}

function renderStudents(list) {
  const container =
    document.getElementById("studentList");

  if (!container) return;

  if (!list.length) {

    container.className = "empty-state";

    container.innerHTML = `
      <div class="empty-icon">👨‍🎓</div>
      <h3>No students found</h3>
      <p>Add students or select another academic year.</p>
    `;

    return;
  }

  container.className = "student-list";

  list.sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  container.innerHTML = list.map(student => `
    <div class="student-card">

      <div class="student-info">

        <div class="student-avatar">
          👨‍🎓
        </div>

        <div>

          <h3>
            ${escapeHTML(student.name)}
          </h3>

          <p>
            ID: ${escapeHTML(student.studentId)}
          </p>

          <div class="student-tags">

            <span>
              ${escapeHTML(student.level)}
            </span>

            <span>
              ${escapeHTML(student.academicYear)}
            </span>

            ${
              student.section
                ? `<span>${escapeHTML(student.section)}</span>`
                : ""
            }

          </div>

        </div>

      </div>

      <div class="student-actions">

        <button
          class="edit-button"
          onclick="editStudent(${student.id})">
          ✏️ Edit
        </button>

        <button
          class="delete-button"
          onclick="removeStudent(${student.id})">
          🗑️ Remove
        </button>

      </div>

    </div>
  `).join("");
}

async function editStudent(id) {
  const student =
    await getRecord(STORES.students, id);

  if (!student) return;

  editingStudentId = id;

  const heading =
    document.querySelector("#studentForm h3");

  if (heading) {
    heading.textContent = "Update Student";
  }

  document.getElementById("studentId").value =
    student.studentId || "";

  document.getElementById("studentName").value =
    student.name || "";

  document.getElementById("studentSection").value =
    student.section || "";

  document.getElementById("academicYearSelect").value =
    student.academicYear || "";

  document.getElementById("levelSelect").value =
    student.level || "";

  document
    .getElementById("studentForm")
    ?.classList.remove("hidden");
}

async function removeStudent(id) {
  const student =
    await getRecord(STORES.students, id);

  if (!student) return;

  if (confirm(`Remove ${student.name}?`)) {

    await deleteRecord(
      STORES.students,
      id
    );

    await loadStudents();
  }
}

// ============================================
// GRADE RECORDS
// ============================================

async function loadGradeStudents() {
  const select =
    document.getElementById("gradeStudentSelect");

  if (!select) return;

  const all =
    await getAllRecords(STORES.students);

  const list = all.filter(student =>
    student.workspace === currentWorkspace
  );

  list.sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  select.innerHTML =
    '<option value="">Select Student</option>' +
    list.map(student => `
      <option
        value="${student.id}"
        data-academic-year="${escapeHTML(student.academicYear || "")}">
        ${escapeHTML(student.name)}
        — ${escapeHTML(student.level)}
        (${escapeHTML(student.academicYear)})
      </option>
    `).join("");
}

function resetGradeView() {
  selectedSemester = null;
  selectedSubject = null;
  selectedComponentIndex = null;
  editingGradeId = null;

  document
    .getElementById("subjectArea")
    ?.classList.add("hidden");

  document
    .getElementById("componentArea")
    ?.classList.add("hidden");

  document
    .getElementById("subjectResult")
    ?.classList.add("hidden");
}

function selectSemester(semester) {

  if (
    !document
      .getElementById("gradeStudentSelect")
      ?.value
  ) {
    return alert(
      "Please select a student first."
    );
  }

  selectedSemester = semester;
  selectedSubject = null;
  selectedComponentIndex = null;

  document
    .getElementById("subjectArea")
    ?.classList.remove("hidden");

  document
    .getElementById("componentArea")
    ?.classList.add("hidden");
}

async function selectSubject(subject) {

  if (!selectedSemester) {
    return alert(
      "Please select a semester first."
    );
  }

  selectedSubject = subject;
  selectedComponentIndex = null;

  document
    .getElementById("componentArea")
    ?.classList.remove("hidden");

  document
    .getElementById("subjectArea")
    ?.classList.remove("hidden");

  const title =
    document.getElementById("selectedSubjectTitle");

  const semesterTitle =
    document.getElementById("selectedSemesterTitle");

  if (title) {
    title.textContent = subject;
  }

  if (semesterTitle) {
    semesterTitle.textContent =
      selectedSemester === "first"
        ? "First Semester — August to December"
        : "Second Semester — January to May";
  }

  document
    .getElementById("subjectResult")
    ?.classList.add("hidden");

  await renderGradingComponents();
}

async function renderGradingComponents() {

  const box =
    document.getElementById("gradingComponents");

  if (!box) return;

  const components =
    GRADING_COMPONENTS[selectedSubject] || [];

  box.innerHTML = components.map(
    (component, index) => `
      <div class="component-card">

        <div class="component-card-header">

          <h3>
            ${escapeHTML(component.name)}
          </h3>

          <span class="weight-badge">
            ${component.weight}%
          </span>

        </div>

        <div
          id="componentRecords-${index}"
          class="component-records">
        </div>

        ${
          isAttendanceComponent(component)

            ? `
              <div class="attendance-grade-info">
                Attendance is calculated automatically
                from attendance records.
              </div>
            `

            : `
              <button
                class="add-record-button"
                onclick="openGradeRecordForm(${index})">
                + Add Record
              </button>
            `
        }

      </div>
    `
  ).join("");

  for (
    let i = 0;
    i < components.length;
    i++
  ) {
    await renderComponentRecords(i);
  }
}

function openGradeRecordForm(
  index,
  preserveEditing = false
) {
  const select =
    document.getElementById("gradeStudentSelect");

  if (!select?.value) {
    return alert(
      "Please select a student first."
    );
  }

  selectedComponentIndex = index;

  if (!preserveEditing) {
    editingGradeId = null;
  }

  closeGradeRecordForm();

  const component =
    GRADING_COMPONENTS[selectedSubject][index];

  const form =
    document.createElement("div");

  form.id = "gradeRecordForm";
  form.className = "form-card";

  form.innerHTML = `
    <h3>
      ${editingGradeId
        ? "Edit Grade Record"
        : "Add Grade Record"}
    </h3>

    <p>
      ${escapeHTML(component.name)}
      — ${component.weight}%
    </p>

    <div class="form-grid">

      <input
        id="gradeRecordName"
        placeholder="Record / Activity Name">

      <input
        type="date"
        id="gradeRecordDate"
        value="${getTodayDate()}">

      <input
        type="number"
        id="gradeScore"
        placeholder="Score Obtained"
        min="0"
        step=".01">

      <input
        type="number"
        id="gradeTotal"
        placeholder="Total Score"
        min=".01"
        step=".01">

    </div>

    <textarea
      id="gradeNotes"
      class="daily-note"
      placeholder="Optional notes">
    </textarea>

    <div class="form-actions">

      <button
        class="primary-button"
        onclick="saveGradeRecord()">
        Save Record
      </button>

      <button
        class="secondary-button"
        onclick="closeGradeRecordForm()">
        Cancel
      </button>

    </div>
  `;

  document
    .getElementById("componentArea")
    ?.appendChild(form);
}

function closeGradeRecordForm() {
  document
    .getElementById("gradeRecordForm")
    ?.remove();
}

async function saveGradeRecord() {

  const studentId =
    Number(
      document
        .getElementById("gradeStudentSelect")
        ?.value
    );

  const name =
    document
      .getElementById("gradeRecordName")
      ?.value.trim();

  const date =
    document
      .getElementById("gradeRecordDate")
      ?.value;

  const score =
    Number(
      document
        .getElementById("gradeScore")
        ?.value
    );

  const total =
    Number(
      document
        .getElementById("gradeTotal")
        ?.value
    );

  const notes =
    document
      .getElementById("gradeNotes")
      ?.value.trim();

  if (
    !studentId ||
    !name ||
    !date ||
    !Number.isFinite(score) ||
    !Number.isFinite(total) ||
    total <= 0
  ) {
    return alert(
      "Please complete the record."
    );
  }

  if (score < 0) {
    return alert(
      "Score cannot be negative."
    );
  }

  if (score > total) {
    return alert(
      "Score cannot be greater than total."
    );
  }

  const component =
    GRADING_COMPONENTS[selectedSubject]
      [selectedComponentIndex];

  const student =
    await getRecord(
      STORES.students,
      studentId
    );

  const now =
    new Date().toISOString();

  const record = {
    studentId,
    workspace: currentWorkspace,
    academicYear:
      student?.academicYear || "",
    semester: selectedSemester,
    subject: selectedSubject,
    component: component.name,
    componentWeight: component.weight,
    recordName: name,
    date,
    score,
    total,
    percentage:
      score / total * 100,
    notes,
    updatedAt: now
  };

  if (editingGradeId) {

    record.id = editingGradeId;

    const old =
      await getRecord(
        STORES.grades,
        editingGradeId
      );

    record.createdAt =
      old?.createdAt || now;

    await updateRecord(
      STORES.grades,
      record
    );

  } else {

    record.createdAt = now;

    await addRecord(
      STORES.grades,
      record
    );
  }

  closeGradeRecordForm();

  editingGradeId = null;

  await renderGradingComponents();

  alert(
    "Grade record saved successfully."
  );
}

async function renderComponentRecords(index) {

  const container =
    document.getElementById(
      `componentRecords-${index}`
    );

  const studentId =
    Number(
      document
        .getElementById("gradeStudentSelect")
        ?.value
    );

  if (!container || !studentId) return;

  const component =
    GRADING_COMPONENTS[selectedSubject][index];

  const year =
    await getStudentAcademicYear(studentId);

  if (isAttendanceComponent(component)) {

    const attendance =
      await getAttendancePercentageForStudent(
        studentId,
        year,
        selectedSemester
      );

    container.innerHTML = `
      <div class="component-average">

        <strong>
          Attendance:
        </strong>

        ${attendance.percentage.toFixed(2)}%

        &nbsp;

        <strong>
          Weighted:
        </strong>

        ${attendance.weighted.toFixed(2)}%

        <br>

        <small>
          ${attendance.present} Present /
          ${attendance.late} Late /
          ${attendance.absent} Absent /
          ${attendance.total} Marked
        </small>

      </div>
    `;

    return;
  }

  const grades =
    await getAllRecords(STORES.grades);

  const records =
    grades.filter(record =>
      record.studentId === studentId &&
      record.workspace === currentWorkspace &&
      record.academicYear === year &&
      record.semester === selectedSemester &&
      record.subject === selectedSubject &&
      record.component === component.name
    );

  if (!records.length) {

    container.innerHTML =
      '<div class="component-empty">No records yet.</div>';

    return;
  }

  const average =
    records.reduce(
      (sum, record) =>
        sum + Number(record.percentage),
      0
    ) / records.length;

  const weighted =
    average * component.weight / 100;

  container.innerHTML = `
    <div class="component-average">

      <strong>
        Average:
      </strong>

      ${average.toFixed(2)}%

      &nbsp;

      <strong>
        Weighted:
      </strong>

      ${weighted.toFixed(2)}%

    </div>

    ${
      records.map(record => `
        <div class="grade-record">

          <div>

            <strong>
              ${escapeHTML(record.recordName)}
            </strong>

            <small>
              ${record.date}
            </small>

          </div>

          <strong>
            ${formatNumber(record.score)}
            /
            ${formatNumber(record.total)}
            (${Number(record.percentage).toFixed(2)}%)
          </strong>

          <div class="record-actions">

            <button
              class="edit-button"
              onclick="editGradeRecord(${record.id})">
              ✏️ Edit
            </button>

            <button
              class="delete-button"
              onclick="removeGradeRecord(${record.id})">
              🗑️ Remove
            </button>

          </div>

        </div>
      `).join("")
    }
  `;
}

async function editGradeRecord(id) {

  const record =
    await getRecord(
      STORES.grades,
      id
    );

  if (!record) return;

  document
    .getElementById("gradeStudentSelect")
    .value = record.studentId;

  selectedSemester =
    record.semester;

  selectedSubject =
    record.subject;

  selectedComponentIndex =
    (
      GRADING_COMPONENTS[record.subject] || []
    ).findIndex(
      component =>
        component.name === record.component
    );

  editingGradeId = id;

  await selectSubject(
    record.subject
  );

  openGradeRecordForm(
    selectedComponentIndex,
    true
  );

  const heading =
    document.querySelector(
      "#gradeRecordForm h3"
    );

  if (heading) {
    heading.textContent =
      "Edit Grade Record";
  }

  document.getElementById(
    "gradeRecordName"
  ).value =
    record.recordName || "";

  document.getElementById(
    "gradeRecordDate"
  ).value =
    record.date || "";

  document.getElementById(
    "gradeScore"
  ).value =
    record.score ?? "";

  document.getElementById(
    "gradeTotal"
  ).value =
    record.total ?? "";

  document.getElementById(
    "gradeNotes"
  ).value =
    record.notes || "";
}

async function removeGradeRecord(id) {

  if (
    confirm(
      "Remove this grade record?"
    )
  ) {

    await deleteRecord(
      STORES.grades,
      id
    );

    await renderGradingComponents();
  }
}

// ============================================
// ATTENDANCE
// ============================================

function getSemesterFromDate(date) {

  if (
    !date ||
    typeof date !== "string"
  ) {
    return null;
  }

  const month =
    parseInt(
      date.substring(5, 7),
      10
    );

  if (
    month >= 8 &&
    month <= 12
  ) {
    return "first";
  }

  if (
    month >= 1 &&
    month <= 5
  ) {
    return "second";
  }

  return null;
}

// ============================================
// ATTENDANCE CALCULATION
// ============================================
// IMPORTANT:
// Existing attendance records may not have a
// "semester" field.
//
// New records do have semester because setAttendance()
// saves it.
//
// For old records without semester, we determine
// the semester from the actual attendance date.
//
// This function is used by:
// Attendance component
// Grade Calculation
// Report Card
// Grade Summary Export
// ============================================

async function getAttendancePercentageForStudent(
  studentId,
  year,
  semester
) {

  const all =
    await getAllRecords(
      STORES.attendance
    );

  const records =
    all.filter(attendance => {

      // --------------------------------------------
      // Basic student/workspace/year filtering
      // --------------------------------------------

      if (
        attendance.studentId !== studentId ||
        attendance.workspace !== currentWorkspace ||
        attendance.academicYear !== year
      ) {
        return false;
      }

      // --------------------------------------------
      // Determine semester
      // --------------------------------------------
      //
      // If the record already has semester,
      // use the stored value.
      //
      // If semester is missing, determine it
      // from the attendance date.
      //

      const recordSemester =
        attendance.semester ||
        getSemesterFromDate(attendance.date);

      // --------------------------------------------
      // If no semester was requested,
      // include all attendance records.
      // --------------------------------------------

      if (!semester) {
        return true;
      }

      // --------------------------------------------
      // Only count attendance records belonging
      // to the selected semester.
      // --------------------------------------------

      return recordSemester === semester;
    });

  const present =
    records.filter(
      attendance =>
        attendance.status === "present"
    ).length;

  const late =
    records.filter(
      attendance =>
        attendance.status === "late"
    ).length;

  const absent =
    records.filter(
      attendance =>
        attendance.status === "absent"
    ).length;

  const attended =
    present + late;

  const total =
    attended + absent;

  const percentage =
    total
      ? attended / total * 100
      : 0;

  return {
    present,
    late,
    absent,
    attended,
    total,
    percentage,

    // Attendance is worth 5% of every subject.
    weighted:
      percentage * 0.05
  };
}

async function initializeAttendance() {

  const date =
    document.getElementById(
      "attendanceDate"
    );

  const year =
    document.getElementById(
      "attendanceAcademicYear"
    );

  if (
    date &&
    !date.value
  ) {
    date.value =
      getTodayDate();
  }

  if (
    year &&
    !year.value
  ) {
    year.value =
      document.getElementById(
        "academicYearSelect"
      )?.value ||
      getAcademicYearFromToday();
  }

  if (year) {
    year.onchange =
      loadAttendance;
  }

  if (date) {
    date.onchange =
      loadAttendance;
  }

  await loadAttendance();
}

async function loadAttendance() {

  const year =
    document.getElementById(
      "attendanceAcademicYear"
    )?.value;

  const date =
    document.getElementById(
      "attendanceDate"
    )?.value;

  const container =
    document.getElementById(
      "attendanceStudentList"
    );

  if (!container) return;

  if (!year || !date) {

    container.innerHTML = `
      <div class="empty-state">

        <div class="empty-icon">
          📅
        </div>

        <h3>
          Select academic year and date
        </h3>

      </div>
    `;

    return;
  }

  const students =
    (
      await getAllRecords(
        STORES.students
      )
    ).filter(student =>
      student.workspace === currentWorkspace &&
      student.academicYear === year
    );

  const attendance =
    await getAllRecords(
      STORES.attendance
    );

  if (!students.length) {

    container.innerHTML = `
      <div class="empty-state">

        <div class="empty-icon">
          👨‍🎓
        </div>

        <h3>
          No students found
        </h3>

      </div>
    `;

    return;
  }

  students.sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  container.innerHTML =
    students.map(student => {

      const record =
        attendance.find(att =>
          att.studentId === student.id &&
          att.workspace === currentWorkspace &&
          att.academicYear === year &&
          att.date === date
        );

      return `
        <div class="attendance-student-card">

          <div class="attendance-student-info">

            <div class="student-avatar">
              👨‍🎓
            </div>

            <div>

              <h3>
                ${escapeHTML(student.name)}
              </h3>

              <p>
                ${escapeHTML(student.level)}
                ${
                  student.section
                    ? " • " +
                      escapeHTML(student.section)
                    : ""
                }
              </p>

            </div>

          </div>

          <div class="attendance-actions">

            <button
              class="attendance-button present-button
                ${
                  record?.status === "present"
                    ? "selected"
                    : ""
                }"
              onclick="setAttendance(
                ${student.id},
                'present'
              )">
              🟢 Present
            </button>

            <button
              class="attendance-button absent-button
                ${
                  record?.status === "absent"
                    ? "selected"
                    : ""
                }"
              onclick="setAttendance(
                ${student.id},
                'absent'
              )">
              🔴 Absent
            </button>

            <button
              class="attendance-button late-button
                ${
                  record?.status === "late"
                    ? "selected"
                    : ""
                }"
              onclick="setAttendance(
                ${student.id},
                'late'
              )">
              🟡 Late
            </button>

          </div>

        </div>
      `;
    }).join("");

  await updateAttendanceSummary(
    year,
    date
  );
}

async function setAttendance(
  studentId,
  status
) {

  const year =
    document.getElementById(
      "attendanceAcademicYear"
    )?.value;

  const date =
    document.getElementById(
      "attendanceDate"
    )?.value;

  if (!year || !date) {
    return alert(
      "Please select academic year and date."
    );
  }

  const semester =
    getSemesterFromDate(date);

  if (!semester) {
    return alert(
      "Unable to determine semester from this date."
    );
  }

  const all =
    await getAllRecords(
      STORES.attendance
    );

  const existing =
    all.find(attendance =>
      attendance.studentId === studentId &&
      attendance.workspace === currentWorkspace &&
      attendance.academicYear === year &&
      attendance.date === date
    );

  const student =
    await getRecord(
      STORES.students,
      studentId
    );

  const now =
    new Date().toISOString();

  if (existing) {

    existing.status = status;
    existing.semester = semester;
    existing.month =
      date.slice(0, 7);
    existing.updatedAt = now;

    await updateRecord(
      STORES.attendance,
      existing
    );

  } else {

    await addRecord(
      STORES.attendance,
      {
        studentId,
        studentName:
          student?.name || "",
        workspace:
          currentWorkspace,
        academicYear:
          year,
        semester,
        date,
        month:
          date.slice(0, 7),
        status,
        createdAt: now,
        updatedAt: now
      }
    );
  }

  await loadAttendance();
}

async function updateAttendanceSummary(
  year,
  date
) {

  const month =
    date.slice(0, 7);

  const records =
    (
      await getAllRecords(
        STORES.attendance
      )
    ).filter(attendance =>
      attendance.workspace === currentWorkspace &&
      attendance.academicYear === year &&
      attendance.month === month
    );

  const present =
    records.filter(
      attendance =>
        attendance.status === "present"
    ).length;

  const late =
    records.filter(
      attendance =>
        attendance.status === "late"
    ).length;

  const absent =
    records.filter(
      attendance =>
        attendance.status === "absent"
    ).length;

  const attended =
    present + late;

  const total =
    attended + absent;

  document
    .getElementById("attendanceSummary")
    ?.classList.remove("hidden");

  const presentTotal =
    document.getElementById(
      "presentTotal"
    );

  const absentTotal =
    document.getElementById(
      "absentTotal"
    );

  const schoolDaysTotal =
    document.getElementById(
      "schoolDaysTotal"
    );

  const attendancePercentage =
    document.getElementById(
      "attendancePercentage"
    );

  if (presentTotal) {
    presentTotal.textContent =
      present;
  }

  if (absentTotal) {
    absentTotal.textContent =
      absent;
  }

  if (schoolDaysTotal) {
    schoolDaysTotal.textContent =
      countSchoolDays(
        year,
        month
      );
  }

  if (attendancePercentage) {
    attendancePercentage.textContent =
      (
        total
          ? attended / total * 100
          : 0
      ).toFixed(1) + "%";
  }
}

function countSchoolDays(
  year,
  month
) {

  const [y, m] =
    month
      .split("-")
      .map(Number);

  const lastDay =
    new Date(
      y,
      m,
      0
    ).getDate();

  let count = 0;

  for (
    let day = 1;
    day <= lastDay;
    day++
  ) {

    const weekday =
      new Date(
        y,
        m - 1,
        day
      ).getDay();

    if (
      weekday !== 0 &&
      weekday !== 6
    ) {
      count++;
    }
  }

  return count;
}

// ============================================
// GRADE CALCULATION
// ============================================

async function computeGrades() {

  const studentId =
    Number(
      document
        .getElementById(
          "gradeStudentSelect"
        )
        ?.value
    );

  if (
    !studentId ||
    !selectedSubject ||
    !selectedSemester
  ) {
    return alert(
      "Please select a student, semester and subject."
    );
  }

  const year =
    await getStudentAcademicYear(
      studentId
    );

  const finalGrade =
    await calculateSubjectGrade(
      studentId,
      year,
      selectedSemester,
      selectedSubject
    );

  document
    .getElementById(
      "subjectResult"
    )
    ?.classList.remove("hidden");

  const value =
    document.getElementById(
      "subjectGradeValue"
    );

  if (value) {
    value.textContent =
      finalGrade.toFixed(2) + "%";
  }
}

async function calculateSubjectGrade(
  studentId,
  academicYear,
  semester,
  subject
) {

  const grades =
    await getAllRecords(
      STORES.grades
    );

  const components =
    GRADING_COMPONENTS[subject] || [];

  let total = 0;

  for (
    const component of components
  ) {

    if (
      isAttendanceComponent(component)
    ) {

      const attendance =
        await getAttendancePercentageForStudent(
          studentId,
          academicYear,
          semester
        );

      total +=
        attendance.weighted;

    } else {

      const records =
        grades.filter(record =>
          record.studentId === studentId &&
          record.workspace === currentWorkspace &&
          record.academicYear === academicYear &&
          record.semester === semester &&
          record.subject === subject &&
          record.component === component.name
        );

      if (records.length) {

        const average =
          records.reduce(
            (sum, record) =>
              sum +
              Number(record.percentage),
            0
          ) / records.length;

        total +=
          average *
          component.weight /
          100;
      }
    }
  }

  return total;
}

// ============================================
// DAILY NOTES
// ============================================

async function loadNoteStudents() {

  const select =
    document.getElementById(
      "noteStudentSelect"
    );

  if (!select) return;

  const list =
    (
      await getAllRecords(
        STORES.students
      )
    ).filter(student =>
      student.workspace === currentWorkspace
    );

  list.sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  select.innerHTML =
    '<option value="">Select Student</option>' +
    list.map(student => `
      <option value="${student.id}">
        ${escapeHTML(student.name)}
        —
        ${escapeHTML(student.level)}
      </option>
    `).join("");
}

async function initializeNotes() {

  const date =
    document.getElementById(
      "noteDate"
    );

  if (
    date &&
    !date.value
  ) {
    date.value =
      getTodayDate();
  }

  await loadNoteStudents();
  await loadNotes();
}

async function saveNote() {

  const studentId =
    Number(
      document
        .getElementById(
          "noteStudentSelect"
        )
        ?.value
    );

  const date =
    document.getElementById(
      "noteDate"
    )?.value;

  const text =
    document.getElementById(
      "dailyNote"
    )?.value.trim();

  if (
    !studentId ||
    !date ||
    !text
  ) {
    return alert(
      "Select a student, date and enter a note."
    );
  }

  const student =
    await getRecord(
      STORES.students,
      studentId
    );

  await addRecord(
    STORES.notes,
    {
      studentId,
      workspace:
        currentWorkspace,
      academicYear:
        student?.academicYear || "",
      date,
      note: text,
      createdAt:
        new Date().toISOString(),
      updatedAt:
        new Date().toISOString()
    }
  );

  document.getElementById(
    "dailyNote"
  ).value = "";

  await loadNotes();
}

async function loadNotes() {

  const listElement =
    document.getElementById(
      "notesList"
    );

  if (!listElement) return;

  const records =
    await getAllRecords(
      STORES.notes
    );

  const students =
    await getAllRecords(
      STORES.students
    );

  const list =
    records
      .filter(record =>
        record.workspace === currentWorkspace
      )
      .sort((a, b) =>
        b.date.localeCompare(a.date)
      );

  if (!list.length) {

    listElement.innerHTML = `
      <div class="empty-state">

        <div class="empty-icon">
          📝
        </div>

        <h3>
          No notes yet
        </h3>

      </div>
    `;

    return;
  }

  listElement.innerHTML =
    list.map(record => {

      const student =
        students.find(
          s =>
            s.id === record.studentId
        );

      return `
        <div class="note-card">

          <strong>
            ${escapeHTML(
              student?.name ||
              "Unknown Student"
            )}
          </strong>

          <small>
            ${record.date}
            —
            ${escapeHTML(
              record.academicYear || ""
            )}
          </small>

          <p>
            ${escapeHTML(record.note)}
          </p>

          <button
            class="delete-button"
            onclick="removeNote(${record.id})">
            🗑️ Remove
          </button>

        </div>
      `;

    }).join("");
}

async function removeNote(id) {

  if (
    confirm(
      "Remove this note?"
    )
  ) {

    await deleteRecord(
      STORES.notes,
      id
    );

    await loadNotes();
  }
}

// ============================================
// REPORT CARDS
// ============================================

async function loadReportStudents() {

  const select =
    document.getElementById(
      "reportStudentSelect"
    );

  if (!select) return;

  const list =
    (
      await getAllRecords(
        STORES.students
      )
    ).filter(student =>
      student.workspace === currentWorkspace
    );

  list.sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  select.innerHTML =
    '<option value="">Select Student</option>' +
    list.map(student => `
      <option
        value="${student.id}"
        data-academic-year="${escapeHTML(
          student.academicYear || ""
        )}">
        ${escapeHTML(student.name)}
        —
        ${escapeHTML(student.level)}
        (${escapeHTML(student.academicYear || "")})
      </option>
    `).join("");
}

async function generateReportCard() {

  const studentId =
    Number(
      document
        .getElementById(
          "reportStudentSelect"
        )
        ?.value
    );

  const semester =
    document.getElementById(
      "reportSemester"
    )?.value;

  if (!studentId) {
    return alert(
      "Please select a student."
    );
  }

  const student =
    await getRecord(
      STORES.students,
      studentId
    );

  if (!student) {

    await loadReportStudents();

    const preview =
      document.getElementById(
        "reportPreview"
      );

    if (preview) {
      preview.innerHTML = "";
    }

    return alert(
      "This student no longer exists. Please select another student."
    );
  }

  const year =
    student.academicYear;

  let rows = "";

  let overall = 0;
  let count = 0;

  for (
    const subject of
    Object.keys(GRADING_COMPONENTS)
  ) {

    const grade =
      await calculateSubjectGrade(
        studentId,
        year,
        semester,
        subject
      );

    overall += grade;
    count++;

    const components =
      GRADING_COMPONENTS[subject] || [];

    let componentDetails = "";

    for (const component of components) {

      let componentPercentage = 0;

      if (isAttendanceComponent(component)) {

        const attendanceResult =
          await getAttendancePercentageForStudent(
            studentId,
            year,
            semester
          );

        componentPercentage =
          Number(attendanceResult.percentage) || 0;

      } else {

        const grades =
          await getAllRecords(
            STORES.grades
          );

        const records =
          grades.filter(record =>
            record.studentId === studentId &&
            record.workspace === currentWorkspace &&
            record.academicYear === year &&
            record.semester === semester &&
            record.subject === subject &&
            record.component === component.name
          );

        if (records.length) {

          componentPercentage =
            records.reduce(
              (sum, record) =>
                sum + Number(record.percentage || 0),
              0
            ) / records.length;
        }
      }

      componentDetails += `
        <div class="report-component-detail">
          <span>
            ${escapeHTML(component.name)}
          </span>
          <strong>
            ${componentPercentage.toFixed(2)}%
          </strong>
        </div>
      `;
    }

    rows += `
      <tr>

        <td>
          <strong>
            ${escapeHTML(subject)}
          </strong>

          <div class="report-component-list">
            ${componentDetails}
          </div>
        </td>

        <td>
          ${grade.toFixed(2)}%
        </td>

        <td>
          ${
            grade >= 75
              ? "PASS"
              : "Failed"
          }
        </td>

      </tr>
    `;
  }

  const attendance =
    await getAttendancePercentageForStudent(
      studentId,
      year,
      semester
    );

  const preview =
    document.getElementById(
      "reportPreview"
    );

  if (!preview) return;

  const semesterName =
    semester === "first"
      ? "First Semester"
      : "Second Semester";

  const overallAverage =
    count
      ? overall / count
      : 0;

  preview.innerHTML = `

    <div class="report-card">

      <h1>
        Student Report Card
      </h1>

      <p>
        <strong>Student:</strong>
        ${escapeHTML(student.name)}

        &nbsp;

        <strong>ID:</strong>
        ${escapeHTML(student.studentId)}
      </p>

      <p>
        <strong>Level:</strong>
        ${escapeHTML(student.level)}

        &nbsp;

        <strong>Academic Year:</strong>
        ${escapeHTML(year)}
      </p>

      <p>
        <strong>Semester:</strong>
        ${semesterName}
      </p>

      <table>

        <thead>

          <tr>
            <th>Subject &amp; Grading Components</th>
            <th>Final Grade</th>
            <th>Status</th>
          </tr>

        </thead>

        <tbody>
          ${rows}
        </tbody>

      </table>

      <div class="report-attendance">

        <strong>
          Attendance:
        </strong>

        ${attendance.percentage.toFixed(2)}%

        (
        ${attendance.present} Present /
        ${attendance.late} Late /
        ${attendance.absent} Absent
        )

      </div>

      <h2>
        Overall Average:
        ${overallAverage.toFixed(2)}%
      </h2>

      <button
        class="primary-button"
        onclick="window.print()">
        🖨️ Print Report Card
      </button>

    </div>
  `;
}

// ============================================
// EXPORTS
// ============================================

function csvCell(value) {

  return `"${String(
    value ?? ""
  ).replace(/"/g, '""')}"`;
}

function downloadCSV(
  filename,
  rows
) {

  const csv =
    rows
      .map(row =>
        row
          .map(csvCell)
          .join(",")
      )
      .join("\r\n");

  const blob =
    new Blob(
      ["\ufeff" + csv],
      {
        type:
          "text/csv;charset=utf-8"
      }
    );

  const link =
    document.createElement("a");

  link.href =
    URL.createObjectURL(blob);

  link.download =
    filename;

  link.click();

  setTimeout(
    () =>
      URL.revokeObjectURL(
        link.href
      ),
    0
  );
}

async function exportDetailedGrades() {

  const records =
    (
      await getAllRecords(
        STORES.grades
      )
    ).filter(record =>
      record.workspace === currentWorkspace
    );

  downloadCSV(
    "Grade_Detailed_Records.csv",
    [
      [
        "Student ID",
        "Record",
        "Academic Year",
        "Semester",
        "Subject",
        "Component",
        "Date",
        "Score",
        "Total",
        "Percentage",
        "Notes"
      ],

      ...records.map(record => [
        record.studentId,
        record.recordName,
        record.academicYear,
        record.semester,
        record.subject,
        record.component,
        record.date,
        record.score,
        record.total,
        Number(record.percentage)
          .toFixed(2) + "%",
        record.notes
      ])
    ]
  );
}

async function exportGradeSummary() {

  const students =
    (
      await getAllRecords(
        STORES.students
      )
    ).filter(student =>
      student.workspace === currentWorkspace
    );

  const rows = [
    [
      "Student",
      "Student ID",
      "Academic Year",
      "Level",
      "Semester",
      "English",
      "Mathematics",
      "Science"
    ]
  ];

  for (
    const student of students
  ) {

    for (
      const semester of
      ["first", "second"]
    ) {

      const grades =
        await Promise.all(
          Object.keys(
            GRADING_COMPONENTS
          ).map(subject =>
            calculateSubjectGrade(
              student.id,
              student.academicYear,
              semester,
              subject
            )
          )
        );

      rows.push([
        student.name,
        student.studentId,
        student.academicYear,
        student.level,

        semester === "first"
          ? "First Semester"
          : "Second Semester",

        ...grades.map(
          grade =>
            grade.toFixed(2) + "%"
        )
      ]);
    }
  }

  downloadCSV(
    "Grade_Summary.csv",
    rows
  );
}

async function exportAttendanceMonthly() {

  const students =
    (
      await getAllRecords(
        STORES.students
      )
    ).filter(student =>
      student.workspace === currentWorkspace
    );

  const attendance =
    await getAllRecords(
      STORES.attendance
    );

  const rows = [
    [
      "Student Name",
      "Student ID",
      "Academic Year",
      "Month",
      "Present",
      "Late",
      "Absent",
      "Total Marked",
      "Attendance %"
    ]
  ];

  for (
    const student of students
  ) {

    const months = [
      ...new Set(
        attendance
          .filter(record =>
            record.studentId === student.id &&
            record.workspace === currentWorkspace
          )
          .map(record =>
            record.month
          )
      )
    ].sort();

    for (
      const month of months
    ) {

      const records =
        attendance.filter(record =>
          record.studentId === student.id &&
          record.workspace === currentWorkspace &&
          record.month === month
        );

      const present =
        records.filter(
          record =>
            record.status === "present"
        ).length;

      const late =
        records.filter(
          record =>
            record.status === "late"
        ).length;

      const absent =
        records.filter(
          record =>
            record.status === "absent"
        ).length;

      // Present + Late are both treated as attended.
      const attended =
        present + late;

      const total =
        attended + absent;

      rows.push([
        student.name,
        student.studentId,
        student.academicYear,
        month,
        present,
        late,
        absent,
        total,
        (
          total
            ? attended / total * 100
            : 0
        ).toFixed(2) + "%"
      ]);
    }
  }

  downloadCSV(
    "Attendance_Monthly_Summary.csv",
    rows
  );
}

async function exportAttendanceAll() {

  const records =
    (
      await getAllRecords(
        STORES.attendance
      )
    ).filter(record =>
      record.workspace === currentWorkspace
    );

  downloadCSV(
    "Attendance_Detailed.csv",
    [
      [
        "Student Name",
        "Student ID",
        "Academic Year",
        "Date",
        "Month",
        "Semester",
        "Status"
      ],

      ...records.map(record => [
        record.studentName,
        record.studentId,
        record.academicYear,
        record.date,
        record.month,
        record.semester,
        record.status
      ])
    ]
  );
}

// ============================================
// HELPERS
// ============================================

async function getStudentAcademicYear(id) {

  const student =
    await getRecord(
      STORES.students,
      Number(id)
    );

  return student?.academicYear || null;
}

function getSelectedAcademicYear() {

  return (
    document.getElementById(
      "academicYearSelect"
    )?.value || ""
  );
}

function getTodayDate() {

  const date =
    new Date();

  return `
    ${date.getFullYear()}-
    ${String(
      date.getMonth() + 1
    ).padStart(2, "0")}-
    ${String(
      date.getDate()
    ).padStart(2, "0")}
  `.replace(/\s/g, "");
}

function getAcademicYearFromToday() {

  const date =
    new Date();

  const year =
    date.getFullYear();

  const month =
    date.getMonth() + 1;

  return `${
    month >= 8
      ? year
      : year - 1
  }–${
    month >= 8
      ? year + 1
      : year
  }`;
}

function formatNumber(value) {

  const number =
    Number(value);

  return Number.isInteger(number)
    ? String(number)
    : number.toFixed(2);
}

function escapeHTML(value) {

  const div =
    document.createElement("div");

  div.textContent =
    value == null
      ? ""
      : value;

  return div.innerHTML;
}

function resetRecordsInterface() {

  selectedSemester = null;
  selectedSubject = null;
  selectedComponentIndex = null;
  editingGradeId = null;

  closeGradeRecordForm();

  document
    .getElementById("subjectArea")
    ?.classList.add("hidden");

  document
    .getElementById("componentArea")
    ?.classList.add("hidden");

  document
    .getElementById("subjectResult")
    ?.classList.add("hidden");
}

// ============================================
// START APPLICATION
// ============================================

document.addEventListener(
  "DOMContentLoaded",
  async () => {

    console.log(
      "Personal Grading System loaded."
    );

    const academicYear =
      document.getElementById(
        "academicYearSelect"
      );

    if (academicYear) {
      academicYear.value =
        "2026–2027";
    }

    const attendanceDate =
      document.getElementById(
        "attendanceDate"
      );

    if (attendanceDate) {
      attendanceDate.value =
        getTodayDate();
    }

    const noteDate =
      document.getElementById(
        "noteDate"
      );

    if (noteDate) {
      noteDate.value =
        getTodayDate();
    }

    // Service Worker
    if (
      "serviceWorker" in navigator
    ) {

      navigator.serviceWorker
        .register("sw.js")
        .then(() => {

          console.log(
            "✅ Service Worker registered."
          );

        })
        .catch(error => {

          console.warn(
            "Service Worker registration failed:",
            error
          );

        });
    }

    setupLogin();

    await checkLoginSession();
  }
);

// ============================================
// SUPABASE AUTH STATE
// ============================================

if (
  typeof supabaseClient !==
  "undefined"
) {

  supabaseClient.auth
    .onAuthStateChange(
      (event, session) => {

        console.log(
          "Auth event:",
          event
        );

        if (
          event ===
          "SIGNED_OUT"
        ) {
          showLoginPage();
        }

        if (
          event ===
            "SIGNED_IN" &&
          session
        ) {
          showApp();
        }
      }
    );
}

console.log(
  "Personal Grading System loaded."
);
