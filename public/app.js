const appRoot = document.getElementById('app');
const toastContainer = document.getElementById('toastContainer');
const ReactRoot = ReactDOM.createRoot ? ReactDOM.createRoot(appRoot) : null;

function renderShell(markup) {
  if (ReactRoot) {
    ReactDOM.flushSync(() => {
      ReactRoot.render(
        React.createElement('div', {
          className: 'app-shell',
          dangerouslySetInnerHTML: { __html: markup },
        })
      );
    });
    return;
  }

  appRoot.innerHTML = markup;
}

const state = {
  token: localStorage.getItem('campusNotesToken') || '',
  user: JSON.parse(localStorage.getItem('campusNotesUser') || 'null'),
  studentView: 'dashboard',
  adminView: 'dashboard',
  browseMaterials: [],
  studentUploads: [],
  teacherMaterials: [],
  savedMaterials: JSON.parse(localStorage.getItem('campusNotesSaved') || '[]'),
};

appRoot.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;

  const studentNav = event.target.closest('[data-student-nav]');
  if (studentNav) {
    setStudentView(studentNav.getAttribute('data-student-nav'));
    return;
  }

  if (event.target.closest('[data-logout]') && window.confirm('Are you sure you want to logout?')) {
    clearAuthSession();
  }
});

const SUBJECT_CATALOG = {
  '1st Year': {
    'Semester 1': [
      'Engineering Mathematics I', 'Engineering Physics', 'Engineering Chemistry',
      'Engineering Graphics and Design', 'Basic Electrical Engineering',
      'Programming for Problem Solving', 'C Programming', 'Environmental Science',
      'Professional Communication', 'Engineering Mechanics', 'Introduction to Engineering',
    ],
    'Semester 2': [
      'Engineering Mathematics II', 'Applied Physics', 'Applied Chemistry',
      'Basic Electronics Engineering', 'Workshop Practice', 'Engineering Mechanics',
      'Problem Solving with Python', 'C++ Programming', 'Basic Civil Engineering',
      'Basic Mechanical Engineering', 'Basic Computer Engineering',
      'Engineering Drawing', 'Communication Skills',
    ],
  },
  '2nd Year': {
    'Semester 3': [
      'Data Structures', 'Object Oriented Programming', 'Discrete Mathematics',
      'Digital Logic Design', 'Electronic Devices and Circuits', 'Network Analysis',
      'Engineering Mathematics III', 'Thermodynamics', 'Fluid Mechanics',
      'Strength of Materials', 'Surveying', 'Building Materials and Construction',
      'Materials Science', 'Electrical Machines I', 'Signals and Systems',
      'Database Management Systems', 'Analog Electronics',
    ],
    'Semester 4': [
      'Algorithms', 'Database Management Systems', 'Computer Organization and Architecture',
      'Operating Systems', 'Analog Circuits', 'Microprocessors and Microcontrollers',
      'Electrical Machines II', 'Power Systems I', 'Control Systems',
      'Manufacturing Processes', 'Fluid Mechanics', 'Structural Analysis',
      'Geotechnical Engineering', 'Theory of Machines', 'Probability and Statistics',
      'Object Oriented Programming', 'Engineering Mathematics IV',
    ],
  },
  '3rd Year': {
    'Semester 5': [
      'Software Engineering', 'Compiler Design', 'Computer Networks',
      'Theory of Computation', 'Artificial Intelligence', 'Machine Learning',
      'Web Technologies', 'Database Systems', 'Embedded Systems',
      'Digital Signal Processing', 'Communication Systems', 'Power Systems II',
      'Power Electronics', 'Electrical Measurements and Instrumentation',
      'Heat Transfer', 'Machine Design', 'Design of Concrete Structures',
      'Transportation Engineering', 'Geotechnical Engineering',
    ],
    'Semester 6': [
      'Artificial Intelligence', 'Machine Learning', 'Information Security',
      'Cloud Computing', 'Distributed Systems', 'Mobile Application Development',
      'Computer Graphics', 'Internet of Things', 'VLSI Design',
      'Microcontrollers and Embedded Systems', 'Control Engineering',
      'Electrical Power Distribution', 'Renewable Energy Systems',
      'Refrigeration and Air Conditioning', 'Production Engineering',
      'Design of Steel Structures', 'Water Resources Engineering',
      'Environmental Engineering', 'Operations Research',
    ],
  },
  '4th Year': {
    'Semester 7': [
      'Cloud Computing', 'Cybersecurity', 'Big Data Analytics',
      'Deep Learning', 'Natural Language Processing', 'Advanced Database Systems',
      'Wireless Communication', 'Antenna and Wave Propagation',
      'Advanced VLSI Design', 'Smart Grid Technologies', 'High Voltage Engineering',
      'Electric Vehicles', 'Robotics and Automation', 'Finite Element Analysis',
      'Automobile Engineering', 'Earthquake Resistant Design',
      'Construction Management', 'Renewable Energy Engineering',
      'Industrial Engineering', 'Engineering Project Management',
    ],
    'Semester 8': [
      'Capstone Project', 'Industrial Training', 'Seminar', 'Research Methodology',
      'Professional Ethics', 'Entrepreneurship Development', 'Advanced Robotics',
      'Blockchain Technology', 'Computer Vision', 'Data Mining',
      'Advanced Power System Protection', 'Power Plant Engineering',
      'Mechatronics', 'Advanced Structural Design', 'Remote Sensing and GIS',
      'Sustainable Engineering', 'Supply Chain Management',
    ],
  },
};

const IT_AI_SUBJECTS = new Set([
  'Engineering Mathematics I', 'Engineering Mathematics II',
  'Engineering Mathematics III', 'Engineering Mathematics IV',
  'Programming for Problem Solving', 'C Programming', 'Problem Solving with Python',
  'C++ Programming', 'Basic Computer Engineering', 'Discrete Mathematics',
  'Data Structures', 'Object Oriented Programming', 'Digital Logic Design',
  'Algorithms', 'Database Management Systems', 'Computer Organization and Architecture',
  'Operating Systems', 'Probability and Statistics', 'Software Engineering',
  'Compiler Design', 'Computer Networks', 'Theory of Computation',
  'Artificial Intelligence', 'Machine Learning', 'Web Technologies',
  'Database Systems', 'Information Security', 'Cloud Computing',
  'Distributed Systems', 'Mobile Application Development', 'Computer Graphics',
  'Internet of Things', 'Cybersecurity', 'Big Data Analytics', 'Deep Learning',
  'Natural Language Processing', 'Advanced Database Systems', 'Capstone Project',
  'Industrial Training', 'Seminar', 'Research Methodology', 'Professional Ethics',
  'Entrepreneurship Development', 'Blockchain Technology', 'Computer Vision',
  'Data Mining',
]);

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

function getSubjectOptions() {
  return Object.values(SUBJECT_CATALOG)
    .flatMap((semesters) => Object.values(semesters).flat())
    .filter((subject) => IT_AI_SUBJECTS.has(subject))
    .map((subject) => `<option value="${escapeHtml(subject)}">${escapeHtml(subject)}</option>`)
    .join('');
}

function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});

  if (!(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (state.token) {
    headers.set('Authorization', `Bearer ${state.token}`);
  }

  return fetch(`/api${path}`, {
    ...options,
    headers,
    credentials: 'same-origin',
  }).then(async (response) => {
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) {
      throw new Error(payload?.message || 'Request failed.');
    }
    return payload;
  });
}

function setAuthSession(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem('campusNotesToken', token);
  localStorage.setItem('campusNotesUser', JSON.stringify(user));
}

function clearAuthSession() {
  state.token = '';
  state.user = null;
  localStorage.removeItem('campusNotesToken');
  localStorage.removeItem('campusNotesUser');
  state.studentView = 'dashboard';
  state.adminView = 'dashboard';
  window.location.hash = '#/';
}

function reloadUser() {
  if (!state.token) return;
  apiFetch('/me')
    .then((response) => {
      state.user = response.user;
      localStorage.setItem('campusNotesUser', JSON.stringify(response.user));
    })
    .catch(() => {
      clearAuthSession();
    });
}

function setRoute(path) {
  window.location.hash = path;
}

function bindRenderedForm(formId, handler) {
  const attach = () => {
    const form = document.getElementById(formId);
    if (!form) return false;
    form.addEventListener('submit', handler);
    return true;
  };

  if (!attach()) {
    requestAnimationFrame(attach);
  }
}

function renderLanding() {
  renderShell(`
    <header class="header">
      <div class="container nav">
        <div class="brand">
          <div class="brand-mark">N</div>
          <div class="brand-text">
            <span>CampusNotes</span>
            <small>Academic Exchange</small>
          </div>
        </div>
        <div class="nav-actions">
          <button class="secondary-btn" onclick="setRoute('#/student-login')">Student Portal</button>
          <button class="secondary-btn" onclick="setRoute('#/teacher-login')">Teacher Portal</button>
          <button class="primary-btn" onclick="setRoute('#/admin-login')">Admin Portal</button>
        </div>
      </div>
    </header>

    <main class="container hero">
      <section class="hero-grid">
        <div class="hero-copy">
          <div class="kicker">CampusNotes</div>
          <h1>Share smarter study material with your <span class="highlight">college community.</span></h1>
          <p>
            Discover approved resources, upload classroom materials, and help students access useful notes,
            previous papers, practical files, and academic references in one professional platform.
          </p>
          <div class="hero-actions">
            <button class="primary-btn" onclick="setRoute('#/student-login')">Open Student Portal</button>
            <button class="secondary-btn" onclick="setRoute('#/teacher-login')">Teacher Login</button>
            <button class="secondary-btn" onclick="setRoute('#/admin-login')">Admin Login</button>
          </div>
          <div class="metrics">
            <div class="metric-card">
              <strong>0</strong>
              <span>Approved materials</span>
            </div>
            <div class="metric-card">
              <strong>0</strong>
              <span>Students online</span>
            </div>
            <div class="metric-card">
              <strong>0</strong>
              <span>Pending reviews</span>
            </div>
          </div>
        </div>
        <div class="hero-visual">
          <div class="visual-panel">
            <div class="visual-header">
              <strong>Library</strong>
              <span class="pill success">3 categories</span>
            </div>
            <div class="visual-list">
              <div class="visual-item">
                <div class="visual-icon">📘</div>
                <div>
                  <strong>Subject Notes</strong>
                  <small>Semester notes • All branches</small>
                </div>
                <span class="pill success">Popular</span>
              </div>
              <div class="visual-item">
                <div class="visual-icon">📝</div>
                <div>
                  <strong>Previous Year Question Paper</strong>
                  <small>Past papers • All semesters</small>
                </div>
                <span class="pill success">Updated</span>
              </div>
              <div class="visual-item">
                <div class="visual-icon">🧪</div>
                <div>
                  <strong>Manual Lab</strong>
                  <small>Practical guides • Lab files</small>
                </div>
                <span class="pill warning">Shared</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>

    <section class="container portal-grid">
      <div class="card">
        <div class="kicker">For Students</div>
        <h3>Register and upload study resources</h3>
        <p>Browse approved notes, submit materials for admin review, and manage your academic uploads.</p>
        <button class="primary-btn" onclick="setRoute('#/student-login')">Student Login</button>
      </div>
      <div class="card">
        <div class="kicker">For Teachers</div>
        <h3>Access your assigned subject</h3>
        <p>Create a teacher account linked to your subject and sign in to the teacher portal.</p>
        <button class="primary-btn" onclick="setRoute('#/teacher-login')">Teacher Login</button>
      </div>
      <div class="card">
        <div class="kicker">For Admin</div>
        <h3>Review and control study uploads</h3>
        <p>Approve submissions, monitor student activity, and enable or disable student uploads at any time.</p>
        <button class="secondary-btn" onclick="setRoute('#/admin-login')">Admin Login</button>
      </div>
    </section>
  `);
}

function renderStudentLogin() {
  renderShell(`
    <div class="form-shell">
      <div class="container">
        <div class="form-box">
          <div class="form-header">
            <div>
              <div class="kicker">Student Portal</div>
              <h2>Login to CampusNotes</h2>
            </div>
            <button class="ghost-btn" onclick="setRoute('#/')">Back to home</button>
          </div>
          <form id="studentLoginForm">
            <div class="form-grid">
              <div class="form-group full">
                <label for="studentIdentifier">Email / Student ID</label>
                <input id="studentIdentifier" name="emailOrStudentId" type="text" placeholder="Enter your email or student ID" required />
              </div>
              <div class="form-group full">
                <label for="studentPassword">Password</label>
                <input id="studentPassword" name="password" type="password" placeholder="Enter your password" required />
              </div>
            </div>
            <div class="form-actions">
              <label style="display:flex;align-items:center;gap:0.5rem;">
                <input type="checkbox" name="remember" />
                <span>Remember Me</span>
              </label>
              <a class="helper-link" href="#">Forgot Password</a>
            </div>
            <div class="form-actions" style="margin-top:1.5rem;">
              <button class="primary-btn" type="submit">Login</button>
              <button type="button" class="secondary-btn" onclick="setRoute('#/student-register')">Create Account</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `);

  bindRenderedForm('studentLoginForm', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = {
      emailOrStudentId: form.emailOrStudentId.value.trim(),
      password: form.password.value,
    };

    try {
      const response = await apiFetch('/auth/student-login', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setAuthSession(response.token, response.user);
      showToast('Welcome back to CampusNotes.');
      state.studentView = 'dashboard';
      setRoute('#/student-dashboard');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

function renderTeacherLogin() {
  renderShell(`
    <div class="form-shell">
      <div class="container">
        <div class="form-box">
          <div class="form-header">
            <div>
              <div class="kicker">Teacher Portal</div>
              <h2>Subject-wise teacher login</h2>
            </div>
            <button class="ghost-btn" onclick="setRoute('#/')">Back to home</button>
          </div>
          <form id="teacherLoginForm">
            <div class="form-grid">
              <div class="form-group full">
                <label for="teacherLoginEmail">Email</label>
                <input id="teacherLoginEmail" name="email" type="email" placeholder="Enter your teacher email" autocomplete="username" required />
              </div>
              <div class="form-group full">
                <label for="teacherLoginSubject">Subject</label>
                <select id="teacherLoginSubject" name="subject" required>
                  <option value="">Select your assigned subject</option>
                  ${getSubjectOptions()}
                </select>
              </div>
              <div class="form-group full">
                <label for="teacherLoginPassword">Password</label>
                <input id="teacherLoginPassword" name="password" type="password" placeholder="Enter your password" autocomplete="current-password" required />
              </div>
            </div>
            <div class="form-actions" style="margin-top:1.5rem;">
              <button class="primary-btn" type="submit">Login to Teacher Portal</button>
              <button type="button" class="secondary-btn" onclick="setRoute('#/teacher-register')">Create Teacher Account</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `);

  bindRenderedForm('teacherLoginForm', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;

    try {
      const response = await apiFetch('/auth/teacher-login', {
        method: 'POST',
        body: JSON.stringify({
          email: form.email.value.trim(),
          subject: form.subject.value,
          password: form.password.value,
        }),
      });
      setAuthSession(response.token, response.user);
      showToast(`Welcome to the ${response.user.subject} teacher portal.`);
      setRoute('#/teacher-dashboard');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

function renderTeacherRegister() {
  renderShell(`
    <div class="form-shell">
      <div class="container">
        <div class="form-box">
          <div class="form-header">
            <div>
              <div class="kicker">Teacher Portal</div>
              <h2>Create your teacher account</h2>
            </div>
            <button class="ghost-btn" onclick="setRoute('#/teacher-login')">Already registered?</button>
          </div>
          <form id="teacherRegisterForm">
            <div class="form-grid">
              <div class="form-group full">
                <label for="teacherFullName">Full Name</label>
                <input id="teacherFullName" name="fullName" type="text" autocomplete="name" required />
              </div>
              <div class="form-group full">
                <label for="teacherEmail">Email</label>
                <input id="teacherEmail" name="email" type="email" autocomplete="email" required />
              </div>
              <div class="form-group full">
                <label for="teacherSubject">Assigned Subject</label>
                <select id="teacherSubject" name="subject" required>
                  <option value="">Select your subject</option>
                  ${getSubjectOptions()}
                </select>
              </div>
              <div class="form-group">
                <label for="teacherRegisterPassword">Password</label>
                <input id="teacherRegisterPassword" name="password" type="password" autocomplete="new-password" minlength="6" required />
              </div>
              <div class="form-group">
                <label for="teacherConfirmPassword">Confirm Password</label>
                <input id="teacherConfirmPassword" name="confirmPassword" type="password" autocomplete="new-password" minlength="6" required />
              </div>
            </div>
            <div class="form-actions" style="margin-top:1.5rem;">
              <button class="primary-btn" type="submit">Create Teacher Account</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `);

  bindRenderedForm('teacherRegisterForm', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;

    try {
      const response = await apiFetch('/auth/teacher-register', {
        method: 'POST',
        body: JSON.stringify({
          fullName: form.fullName.value.trim(),
          email: form.email.value.trim(),
          subject: form.subject.value,
          password: form.password.value,
          confirmPassword: form.confirmPassword.value,
        }),
      });
      setAuthSession(response.token, response.user);
      showToast('Teacher account created successfully.');
      setRoute('#/teacher-dashboard');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

function renderTeacherDashboard() {
  const teacher = state.user;
  renderShell(`
    <div class="form-shell">
      <div class="container">
        <div class="form-box">
          <div class="form-header">
            <div>
              <div class="kicker">Teacher Portal</div>
              <h2>Welcome, ${escapeHtml(teacher.name)}</h2>
            </div>
            <button class="ghost-btn" onclick="logoutStudent()">Log out</button>
          </div>
          <div class="card">
            <div class="kicker">Your assigned subject</div>
            <h3>${escapeHtml(teacher.subject || 'Subject not available')}</h3>
            <p>Upload subject notes or lecture videos for your students. New uploads are published after administrator approval.</p>
            <p><strong>Email:</strong> ${escapeHtml(teacher.email)}</p>
          </div>
          <section class="teacher-upload-section">
            <div class="status-row">
              <h3>Share teaching material</h3>
            </div>
            <form id="teacherUploadForm" class="panel">
              <div class="form-grid">
                <div class="form-group">
                  <label for="teacherMaterialTitle">Title</label>
                  <input id="teacherMaterialTitle" name="title" maxlength="160" required />
                </div>
                <div class="form-group">
                  <label for="teacherMaterialType">Material type</label>
                  <select id="teacherMaterialType" name="materialType" required>
                    <option value="Subject Notes">Subject Notes</option>
                    <option value="Lecture Video">Lecture Video</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Assigned subject</label>
                  <input value="${escapeHtml(teacher.subject || '')}" readonly />
                </div>
                <div class="form-group">
                  <label for="teacherMaterialBranch">Branch</label>
                  <input id="teacherMaterialBranch" name="branch" required />
                </div>
                <div class="form-group">
                  <label for="teacherMaterialYear">Year</label>
                  <select id="teacherMaterialYear" name="year" required>
                    <option value="">Select year</option>
                    <option>1st Year</option>
                    <option>2nd Year</option>
                    <option>3rd Year</option>
                    <option>4th Year</option>
                  </select>
                </div>
                <div class="form-group">
                  <label for="teacherMaterialSemester">Semester</label>
                  <select id="teacherMaterialSemester" name="semester" required>
                    <option value="">Select semester</option>
                    ${Array.from({ length: 8 }, (_, index) => `<option>Semester ${index + 1}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group full">
                  <label for="teacherMaterialDescription">Description</label>
                  <textarea id="teacherMaterialDescription" name="description" maxlength="2000"></textarea>
                </div>
                <div class="form-group" id="teacherVideoSourceGroup" hidden>
                  <label for="teacherVideoSource">Lecture video source</label>
                  <select id="teacherVideoSource">
                    <option value="upload">Upload a video</option>
                    <option value="link">Link to YouTube or another platform</option>
                  </select>
                </div>
                <div class="form-group full">
                  <label id="teacherFileLabel" for="teacherMaterialFile">Notes file</label>
                  <input id="teacherMaterialFile" type="file" name="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png" required />
                  <small id="teacherFileHelp">Accepted notes formats: PDF, DOC, DOCX, PPT, PPTX, JPG, PNG. Maximum 25 MB.</small>
                </div>
                <div class="form-group full" id="teacherVideoUrlGroup" hidden>
                  <label for="teacherVideoUrl">Lecture video URL</label>
                  <input id="teacherVideoUrl" name="videoUrl" type="url" placeholder="https://www.youtube.com/watch?v=..." />
                  <small>Use a direct HTTP or HTTPS video link from YouTube or another video platform.</small>
                </div>
              </div>
              <div class="form-actions" style="margin-top:1.25rem;">
                <button class="primary-btn" type="submit">Submit teaching material</button>
              </div>
            </form>
          </section>
          <section class="teacher-materials-section">
            <div class="status-row">
              <h3>Your teaching materials</h3>
              <button class="secondary-btn small-btn" type="button" onclick="loadTeacherMaterials()">Refresh</button>
            </div>
            <div class="panel"><div id="teacherMaterialsList"></div></div>
          </section>
        </div>
      </div>
    </div>
  `);
  bindTeacherActions();
}

function bindTeacherActions() {
  const form = document.getElementById('teacherUploadForm');
  if (!form) return;

  const typeSelect = document.getElementById('teacherMaterialType');
  const sourceSelect = document.getElementById('teacherVideoSource');
  const fileInput = document.getElementById('teacherMaterialFile');
  const fileLabel = document.getElementById('teacherFileLabel');
  const fileHelp = document.getElementById('teacherFileHelp');
  const sourceGroup = document.getElementById('teacherVideoSourceGroup');
  const urlGroup = document.getElementById('teacherVideoUrlGroup');
  const urlInput = document.getElementById('teacherVideoUrl');

  const updateMaterialFields = () => {
    const isVideo = typeSelect.value === 'Lecture Video';
    const isLink = isVideo && sourceSelect.value === 'link';
    sourceGroup.hidden = !isVideo;
    urlGroup.hidden = !isLink;
    urlInput.required = isLink;
    fileInput.hidden = isLink;
    fileInput.required = !isLink;
    fileLabel.hidden = isLink;
    fileHelp.hidden = isLink;
    if (isLink) fileInput.value = '';
    if (isVideo) {
      fileLabel.textContent = 'Lecture video file';
      fileInput.accept = '.mp4,.webm,.mov,.m4v';
      fileHelp.textContent = 'Accepted video formats: MP4, WEBM, MOV, M4V. Maximum 250 MB.';
    } else {
      fileLabel.textContent = 'Notes file';
      fileInput.accept = '.pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png';
      fileHelp.textContent = 'Accepted notes formats: PDF, DOC, DOCX, PPT, PPTX, JPG, PNG. Maximum 25 MB.';
    }
  };

  typeSelect.addEventListener('change', updateMaterialFields);
  sourceSelect.addEventListener('change', updateMaterialFields);
  updateMaterialFields();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const response = await apiFetch('/teacher/materials', {
        method: 'POST',
        body: new FormData(form),
      });
      showToast(response.message);
      form.reset();
      updateMaterialFields();
      loadTeacherMaterials();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  loadTeacherMaterials();
}

async function loadTeacherMaterials() {
  try {
    const materials = await apiFetch('/teacher/materials');
    state.teacherMaterials = materials;
    const list = document.getElementById('teacherMaterialsList');
    if (!list) return;

    if (!materials.length) {
      list.innerHTML = `
        <div class="empty-state">
          <h3>You haven't shared any teaching materials yet.</h3>
          <p>Your notes and lecture videos will appear here after you submit them.</p>
        </div>
      `;
      return;
    }

    list.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Title</th><th>Type</th><th>Uploaded</th><th>Status</th><th>Resource</th></tr>
          </thead>
          <tbody>
            ${materials.map((item) => `
              <tr>
                <td>${escapeHtml(item.title)}</td>
                <td>${escapeHtml(item.materialType)}</td>
                <td>${new Date(item.uploadedAt).toLocaleDateString()}</td>
                <td><span class="badge ${escapeHtml(String(item.status).toLowerCase())}">${escapeHtml(item.status)}</span></td>
                <td>${item.videoUrl
                  ? `<a class="secondary-btn small-btn" href="${escapeHtml(item.videoUrl)}" target="_blank" rel="noopener noreferrer">Open video</a>`
                  : item.fileUrl
                    ? `<a class="secondary-btn small-btn" href="${escapeHtml(item.fileUrl)}" target="_blank" rel="noopener noreferrer">${item.materialType === 'Lecture Video' ? 'Watch video' : 'Open file'}</a>`
                    : '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function renderStudentRegister() {
  renderShell(`
    <div class="form-shell">
      <div class="container">
        <div class="form-box">
          <div class="form-header">
            <div>
              <div class="kicker">Student Portal</div>
              <h2>Create your account</h2>
            </div>
            <button class="ghost-btn" onclick="setRoute('#/student-login')">Already registered?</button>
          </div>
          <form id="studentRegisterForm">
            <div class="form-grid">
              <div class="form-group">
                <label for="fullName">Full Name</label>
                <input id="fullName" name="fullName" type="text" required />
              </div>
              <div class="form-group">
                <label for="studentId">Student / College ID</label>
                <input id="studentId" name="studentId" type="text" required />
              </div>
              <div class="form-group">
                <label for="email">Email</label>
                <input id="email" name="email" type="email" required />
              </div>
              <div class="form-group">
                <label for="phone">Phone Number</label>
                <input id="phone" name="phone" type="tel" />
              </div>
              <div class="form-group">
                <label for="branch">Branch</label>
                <select id="branch" name="branch" required>
                  <option value="">Select your branch</option>
                  <option>Artificial Intelligence and Data Science</option>
                  <option>Artificial Intelligence and Machine Learning</option>
                  <option>Computer Science and Engineering</option>
                  <option>Computer Science and Business Systems</option>
                  <option>Computer Science and Design</option>
                  <option>Computer Engineering</option>
                  <option>Cyber Security</option>
                  <option>Data Science</option>
                  <option>Information Technology</option>
                  <option>Information Science and Engineering</option>
                  <option>Internet of Things</option>
                  <option>Software Engineering</option>
                </select>
              </div>
              <div class="form-group">
                <label for="year">Year</label>
                <select id="year" name="year" required>
                  <option value="">Select</option>
                  <option>1st Year</option>
                  <option>2nd Year</option>
                  <option>3rd Year</option>
                  <option>4th Year</option>
                </select>
              </div>
              <div class="form-group">
                <label for="semester">Semester</label>
                <select id="semester" name="semester" required>
                  <option value="">Select</option>
                  <option>Semester 1</option>
                  <option>Semester 2</option>
                  <option>Semester 3</option>
                  <option>Semester 4</option>
                  <option>Semester 5</option>
                  <option>Semester 6</option>
                  <option>Semester 7</option>
                  <option>Semester 8</option>
                </select>
              </div>
              <div class="form-group">
                <label for="registerPassword">Password</label>
                <input id="registerPassword" name="password" type="password" required />
              </div>
              <div class="form-group full">
                <label for="confirmPassword">Confirm Password</label>
                <input id="confirmPassword" name="confirmPassword" type="password" required />
              </div>
            </div>
            <div class="form-actions" style="margin-top:1.5rem;">
              <button class="primary-btn" type="submit">Create Account</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `);

  bindRenderedForm('studentRegisterForm', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = {
      fullName: form.fullName.value,
      studentId: form.studentId.value,
      email: form.email.value,
      phone: form.phone.value,
      branch: form.branch.value,
      year: form.year.value,
      semester: form.semester.value,
      password: form.password.value,
      confirmPassword: form.confirmPassword.value,
    };

    try {
      const response = await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setAuthSession(response.token, response.user);
      showToast('Account created successfully.');
      setRoute('#/student-dashboard');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

function renderAdminLogin() {
  renderShell(`
    <div class="form-shell">
      <div class="container">
        <div class="form-box">
          <div class="form-header">
            <div>
              <div class="kicker">Admin Portal</div>
              <h2>Administrator Login</h2>
            </div>
            <button class="ghost-btn" onclick="setRoute('#/')">Back to home</button>
          </div>
          <form id="adminLoginForm">
            <div class="form-grid">
              <div class="form-group full">
                <label for="adminUsername">Username</label>
                <input id="adminUsername" name="username" type="text" placeholder="Enter any username" value="admin" required />
              </div>
              <div class="form-group full">
                <label for="adminPassword">Password</label>
                <input id="adminPassword" name="password" type="password" placeholder="Enter admin password" required />
              </div>
            </div>
            <div class="form-actions" style="margin-top:1.5rem;">
              <button type="submit" class="primary-btn">Access Admin Portal</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `);

  bindRenderedForm('adminLoginForm', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const response = await apiFetch('/auth/admin-login', {
        method: 'POST',
        body: JSON.stringify({
          username: form.username.value,
          password: form.password.value,
        }),
      });
      setAuthSession(response.token, response.user);
      showToast('Admin access granted.');
      setRoute('#/admin-dashboard');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

function renderStudentDashboard() {
  const view = state.studentView || 'dashboard';
  const content = getStudentViewMarkup(view);
  const userName = state.user?.name || 'Student';

  renderShell(`
    <div class="portal-shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">N</div>
          <div class="brand-text">
            <span>CampusNotes</span>
            <small>Student Portal</small>
          </div>
        </div>
        <nav class="sidebar-nav">
          ${['dashboard','browse','upload','my-uploads','saved','profile','settings'].map((item) => {
            const titles = {
              dashboard: '🏠 Dashboard',
              browse: '📚 Browse Materials',
              upload: '⬆️ Upload Material',
              'my-uploads': '📂 My Uploads',
              saved: '❤️ Saved Materials',
              profile: '👤 My Profile',
              settings: '⚙️ Settings',
            };
            return `<button class="nav-item ${view === item ? 'active' : ''}" data-student-nav="${item}">${titles[item]}</button>`;
          }).join('')}
          <button class="nav-item" data-logout="student">🚪 Logout</button>
        </nav>
      </aside>
      <main class="portal-main">
        <div class="page-header">
          <h1>${userName}</h1>
          <div class="meta">
            <div class="user-chip">👤 ${userName}</div>
          </div>
        </div>
        ${content}
      </main>
    </div>
  `);

  bindStudentActions();
}

function getStudentViewMarkup(view) {
  switch (view) {
    case 'browse':
      return `
        <div class="status-row">
          <h2>Browse Materials</h2>
          <button class="secondary-btn small-btn" onclick="loadBrowseMaterials()">Refresh</button>
        </div>
        <div class="panel">
          <div class="form-grid" style="margin-bottom:1rem;">
            <div class="form-group">
              <label>Search</label>
              <input id="browseSearch" type="text" placeholder="Search title or subject" />
            </div>
            <div class="form-group">
              <label>Branch</label>
              <select id="filterBranch">
                <option value="">All</option>
                <option>CSE</option>
                <option>ECE</option>
                <option>EEE</option>
                <option>ME</option>
                <option>IT</option>
                <option>Civil</option>
                <option>Chemical</option>
                <option>Aerospace</option>
                <option>Biomedical</option>
                <option>Biotechnology</option>
                <option>Environmental</option>
                <option>Industrial</option>
              </select>
            </div>
            <div class="form-group">
              <label>Year</label>
              <select id="filterYear">
                <option value="">Select year</option>
                <option>1st Year</option>
                <option>2nd Year</option>
                <option>3rd Year</option>
                <option>4th Year</option>
              </select>
            </div>
            <div class="form-group">
              <label>Semester</label>
              <select id="filterSemester">
                <option value="">Select semester</option>
                <option>Semester 1</option>
                <option>Semester 2</option>
                <option>Semester 3</option>
                <option>Semester 4</option>
                <option>Semester 5</option>
                <option>Semester 6</option>
                <option>Semester 7</option>
                <option>Semester 8</option>
              </select>
            </div>
            <div class="form-group">
              <label>Subject</label>
              <select id="filterSubject" disabled>
                <option value="">Select year and semester first</option>
              </select>
            </div>
            <div class="form-group">
              <label for="sortMaterials">Sort by</label>
              <select id="sortMaterials">
                <option value="top-rated">Highest rated first</option>
                <option value="newest">Newest first</option>
              </select>
            </div>
          </div>
          <div id="materialsList" class="material-grid"></div>
        </div>
      `;
    case 'upload':
      return `
        <div class="status-row">
          <h2>Upload Material</h2>
        </div>
        <div class="panel">
          <form id="uploadForm">
            <div class="form-grid">
              <div class="form-group">
                <label>Material Title</label>
                <input name="title" required />
              </div>
              <div class="form-group">
                <label>Year</label>
                <select name="year" id="uploadYear" required>
                  <option value="">Select</option>
                  <option>1st Year</option>
                  <option>2nd Year</option>
                  <option>3rd Year</option>
                  <option>4th Year</option>
                </select>
              </div>
              <div class="form-group">
                <label>Semester</label>
                <select name="semester" id="uploadSemester" required>
                  <option value="">Select</option>
                  <option>Semester 1</option>
                  <option>Semester 2</option>
                  <option>Semester 3</option>
                  <option>Semester 4</option>
                  <option>Semester 5</option>
                  <option>Semester 6</option>
                  <option>Semester 7</option>
                  <option>Semester 8</option>
                </select>
              </div>
              <div class="form-group">
                <label>Subject</label>
                <select name="subject" id="uploadSubject" required disabled>
                  <option value="">Select year and semester first</option>
                </select>
              </div>
              <div class="form-group full">
                <label>Description</label>
                <textarea name="description"></textarea>
              </div>
              <div class="form-group">
                <label>Branch</label>
                <input name="branch" required />
              </div>
              <div class="form-group">
                <label>Material Type</label>
                <select name="materialType" required>
                  <option value="">Select</option>
                  <option>Subject Notes</option>
                  <option>Previous Year Question Paper</option>
                  <option>Manual Lab</option>
                </select>
              </div>
              <div class="form-group full">
                <label>File</label>
                <input type="file" name="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png" required />
              </div>
            </div>
            <div class="form-actions" style="margin-top:1.25rem;">
              <button class="primary-btn" type="submit">Submit Material</button>
            </div>
          </form>
        </div>
      `;
    case 'my-uploads':
      return `
        <div class="status-row">
          <h2>My Uploads</h2>
          <button class="secondary-btn small-btn" onclick="loadStudentUploads()">Refresh</button>
        </div>
        <div class="panel">
          <div id="myUploadsList"></div>
        </div>
      `;
    case 'saved':
      return `
        <div class="status-row">
          <h2>Saved Materials</h2>
        </div>
        <div class="panel">
          <div id="savedMaterialsList"></div>
        </div>
      `;
    case 'profile':
      return `
        <div class="status-row">
          <h2>My Profile</h2>
        </div>
        <div class="panel">
          <div class="form-grid">
            <div class="form-group">
              <label>Full Name</label>
              <input value="${escapeHtml(state.user?.name || '')}" readonly />
            </div>
            <div class="form-group">
              <label>Student ID</label>
              <input value="${escapeHtml(state.user?.studentId || '')}" readonly />
            </div>
            <div class="form-group">
              <label>Email</label>
              <input value="${escapeHtml(state.user?.email || '')}" readonly />
            </div>
            <div class="form-group">
              <label>Role</label>
              <input value="Student" readonly />
            </div>
          </div>
        </div>
      `;
    case 'settings':
      return `
        <div class="status-row">
          <h2>Settings</h2>
        </div>
        <div class="panel">
          <p>Manage your CampusNotes account preferences. You can update your profile after registration from this area.</p>
        </div>
      `;
    default:
      return `
        <div class="stats-grid">
          <div class="stat-card">
            <div class="label">Approved</div>
            <strong id="approvedCount">0</strong>
            <div class="trend">Published</div>
          </div>
          <div class="stat-card">
            <div class="label">Pending</div>
            <strong id="pendingCount">0</strong>
            <div class="trend">Awaiting review</div>
          </div>
          <div class="stat-card">
            <div class="label">Saved</div>
            <strong>${state.savedMaterials.length}</strong>
            <div class="trend">Favorites</div>
          </div>
        </div>
        <div class="content-grid">
          <div class="panel">
            <h3>Latest updates</h3>
            <div class="list-card">
              <span>Study materials are reviewed by the admin before publication.</span>
            </div>
            <div class="list-card">
              <span>Uploading new documents requires permission from the admin.</span>
            </div>
          </div>
          <div class="panel">
            <h3>Quick actions</h3>
            <div class="actions">
              <button class="primary-btn small-btn" onclick="setStudentView('browse')">Browse Library</button>
              <button class="secondary-btn small-btn" onclick="setStudentView('upload')">Upload Material</button>
            </div>
          </div>
        </div>
      `;
  }
}

function bindStudentActions() {
  const uploadForm = document.getElementById('uploadForm');
  if (uploadForm) {
    uploadForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(uploadForm);

      try {
        const response = await fetch('/api/materials', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${state.token}`,
          },
          body: formData,
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.message || 'Upload failed.');
        }

        showToast(payload.message || 'Upload submitted successfully.');
        state.studentView = 'my-uploads';
        renderStudentDashboard();
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
  }

  const browseSearch = document.getElementById('browseSearch');
  if (browseSearch) {
    browseSearch.addEventListener('input', () => renderMaterialCards());
  }

  ['filterBranch', 'filterYear', 'filterSemester', 'filterSubject'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', () => {
        if (id === 'filterYear' || id === 'filterSemester') {
          populateBrowseSubjectFilter();
        }
        renderMaterialCards();
      });
    }
  });

  const sortMaterials = document.getElementById('sortMaterials');
  if (sortMaterials) {
    sortMaterials.addEventListener('change', renderMaterialCards);
  }

  const uploadYear = document.getElementById('uploadYear');
  const uploadSemester = document.getElementById('uploadSemester');
  if (uploadYear && uploadSemester) {
    [uploadYear, uploadSemester].forEach((el) => {
      el.addEventListener('change', populateUploadSubjectOptions);
    });
    populateUploadSubjectOptions();
  }

  if (viewIsLoaded('browse')) {
    populateBrowseSubjectFilter();
    loadBrowseMaterials();
  }
  if (viewIsLoaded('my-uploads')) {
    loadStudentUploads();
  }
  if (viewIsLoaded('saved')) {
    renderSavedMaterials();
  }
  if (viewIsLoaded('dashboard')) {
    loadDashboardCounts();
  }
}

function viewIsLoaded(viewName) {
  return state.studentView === viewName;
}

function setStudentView(view) {
  state.studentView = view;
  renderStudentDashboard();
}

async function loadDashboardCounts() {
  try {
    const materials = await apiFetch('/materials');
    const pending = materials.filter((item) => item.status === 'Pending').length;
    const approved = materials.filter((item) => item.status === 'Approved').length;
    document.getElementById('approvedCount').textContent = String(approved || 0);
    document.getElementById('pendingCount').textContent = String(pending || 0);
  } catch (error) {
    console.error(error);
  }
}

async function loadBrowseMaterials() {
  try {
    const materials = await apiFetch('/materials');
    state.browseMaterials = materials;
    renderMaterialCards();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function populateBrowseSubjectFilter() {
  const yearEl = document.getElementById('filterYear');
  const semesterEl = document.getElementById('filterSemester');
  const subjectEl = document.getElementById('filterSubject');
  if (!yearEl || !semesterEl || !subjectEl) return;

  const selectedYear = yearEl.value;
  const selectedSemester = semesterEl.value;

  if (!selectedYear || !selectedSemester) {
    subjectEl.innerHTML = '<option value="">Select year and semester first</option>';
    subjectEl.disabled = true;
    return;
  }

  const subjects = [...new Set([
    ...(SUBJECT_CATALOG[selectedYear]?.[selectedSemester] || []),
    ...state.browseMaterials
      .filter((item) => item.year === selectedYear && item.semester === selectedSemester)
      .map((item) => item.subject)
      .filter(Boolean),
  ])].sort((a, b) => a.localeCompare(b));

  subjectEl.innerHTML = ['<option value="">All subjects</option>', ...subjects.map((subject) => `<option value="${escapeHtml(subject)}">${escapeHtml(subject)}</option>`)].join('');
  subjectEl.disabled = subjects.length === 0;
}

function populateUploadSubjectOptions() {
  const yearEl = document.getElementById('uploadYear');
  const semesterEl = document.getElementById('uploadSemester');
  const subjectEl = document.getElementById('uploadSubject');
  if (!yearEl || !semesterEl || !subjectEl) return;

  const selectedYear = yearEl.value;
  const selectedSemester = semesterEl.value;

  if (!selectedYear || !selectedSemester) {
    subjectEl.innerHTML = '<option value="">Select year and semester first</option>';
    subjectEl.disabled = true;
    return;
  }

  const subjectOptions = (SUBJECT_CATALOG[selectedYear]?.[selectedSemester] || [])
    .filter((subject) => IT_AI_SUBJECTS.has(subject));
  subjectEl.innerHTML = ['<option value="">Select subject</option>', ...subjectOptions.map((subject) => `<option value="${escapeHtml(subject)}">${escapeHtml(subject)}</option>`)].join('');
  subjectEl.disabled = false;
}

function renderMaterialCards() {
  const list = document.getElementById('materialsList');
  if (!list) return;

  const search = document.getElementById('browseSearch')?.value.toLowerCase() || '';
  const branch = document.getElementById('filterBranch')?.value || '';
  const year = document.getElementById('filterYear')?.value || '';
  const semester = document.getElementById('filterSemester')?.value || '';
  const subject = document.getElementById('filterSubject')?.value || '';

  const filtered = state.browseMaterials.filter((item) => {
    const matchesSearch = !search || [item.title, item.subject, item.branch, item.materialType, item.uploadedByName].join(' ').toLowerCase().includes(search);
    const matchesBranch = !branch || item.branch === branch;
    const matchesYear = !year || item.year === year;
    const matchesSemester = !semester || item.semester === semester;
    const matchesSubject = !subject || item.subject === subject;
    return matchesSearch && matchesBranch && matchesYear && matchesSemester && matchesSubject;
  });
  const sorted = [...filtered];
  if (document.getElementById('sortMaterials')?.value !== 'newest') {
    sorted.sort((a, b) =>
      Number(b.averageRating || 0) - Number(a.averageRating || 0)
      || Number(b.ratingCount || 0) - Number(a.ratingCount || 0)
      || new Date(b.uploadedAt) - new Date(a.uploadedAt)
    );
  } else {
    sorted.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  }

  if (!sorted.length) {
    list.innerHTML = `
      <div class="empty-state">
        <h3>📚 No study materials available yet.</h3>
        <p>Approved notes and lecture videos shared by your teachers and classmates will appear here.</p>
      </div>
    `;
    return;
  }

  list.innerHTML = sorted.map((item) => {
    const saved = state.savedMaterials.includes(item.id);
    const canRate = item.materialType === 'Subject Notes'
      && !(item.uploadedByRole === 'student' && Number(item.uploadedBy) === Number(state.user?.id));
    return `
      <article class="material-card">
        <div class="material-top">
          <div class="status-row">
            <h4>${escapeHtml(item.title)}</h4>
            <span class="badge approved">Approved</span>
          </div>
          <div class="material-meta">
            <span>${escapeHtml(item.subject)}</span>
            <span>•</span>
            <span>${escapeHtml(item.branch)}</span>
            <span>•</span>
            <span>${escapeHtml(item.semester)}</span>
          </div>
        </div>
        <div class="material-body">
          <p>${escapeHtml(item.description || 'No description available.')}</p>
          <div class="material-meta">
            <span>Type: ${escapeHtml(item.materialType)}</span>
            <span>•</span>
            <span>By: ${escapeHtml(item.uploadedByName || (item.uploadedByRole === 'teacher' ? 'Teacher' : 'Student'))}</span>
          </div>
          ${item.materialType === 'Subject Notes' ? `
            <div class="rating-summary">
              <strong>★ ${Number(item.averageRating || 0).toFixed(1)}</strong>
              <span>${Number(item.ratingCount || 0) ? `${item.ratingCount} ${Number(item.ratingCount) === 1 ? 'rating' : 'ratings'}` : 'Not rated yet'}</span>
            </div>
            ${canRate ? `
              <div class="note-rating" role="group" aria-label="Rate these notes from 1 to 5 stars">
                <span>Your rating</span>
                ${[1, 2, 3, 4, 5].map((rating) => `
                  <button class="rating-star ${rating <= Number(item.myRating || 0) ? 'selected' : ''}"
                    type="button" data-rate-material="${item.id}" data-rating="${rating}"
                    aria-label="Rate ${rating} out of 5 stars" aria-pressed="${Number(item.myRating || 0) === rating}">★</button>
                `).join('')}
              </div>
            ` : ''}
          ` : ''}
          ${item.materialType === 'Lecture Video' && item.fileUrl
            ? `<video class="material-video" controls preload="metadata" src="${escapeHtml(item.fileUrl)}">Your browser does not support video playback.</video>`
            : ''}
          <div class="material-footer">
            <small>${new Date(item.uploadedAt).toLocaleDateString()}</small>
            <div class="actions">
              ${item.videoUrl
                ? `<a class="primary-btn small-btn" href="${escapeHtml(item.videoUrl)}" target="_blank" rel="noopener noreferrer">Watch lecture</a>`
                : item.fileUrl
                  ? `<a class="primary-btn small-btn" href="${escapeHtml(item.fileUrl)}" target="_blank" rel="noopener noreferrer">${item.materialType === 'Lecture Video' ? 'Open video' : 'Download'}</a>`
                  : ''}
              <button class="secondary-btn small-btn" data-save-material="${item.id}">${saved ? 'Saved' : 'Save'}</button>
            </div>
          </div>
        </div>
      </article>
    `;
  }).join('');

  document.querySelectorAll('[data-save-material]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = Number(button.getAttribute('data-save-material'));
      toggleSavedMaterial(id);
      renderMaterialCards();
    });
  });
  bindMaterialRatingButtons();
}

function bindMaterialRatingButtons() {
  document.querySelectorAll('[data-rate-material]').forEach((button) => {
    button.addEventListener('click', async () => {
      const materialId = Number(button.getAttribute('data-rate-material'));
      const rating = Number(button.getAttribute('data-rating'));
      try {
        const response = await apiFetch(`/materials/${materialId}/rating`, {
          method: 'PUT',
          body: JSON.stringify({ rating }),
        });
        showToast(response.message);
        await loadBrowseMaterials();
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
  });
}

async function loadStudentUploads() {
  try {
    const uploads = await apiFetch('/my-materials');
    state.studentUploads = uploads;
    const list = document.getElementById('myUploadsList');
    if (!list) return;

    if (!uploads.length) {
      list.innerHTML = `
        <div class="empty-state">
          <h3>📂 You haven't uploaded any materials yet.</h3>
          <p>Your approved, pending, and rejected files will appear here.</p>
        </div>
      `;
      return;
    }

    list.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Subject</th>
              <th>Date</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${uploads.map((item) => `
              <tr>
                <td>${escapeHtml(item.title)}</td>
                <td>${escapeHtml(item.subject)}</td>
                <td>${new Date(item.uploadedAt).toLocaleDateString()}</td>
                <td><span class="badge ${item.status.toLowerCase()}">${item.status}</span></td>
                <td>
                  ${item.fileUrl ? `<a class="secondary-btn small-btn" href="${item.fileUrl}" target="_blank">Download</a>` : ''}
                  ${item.rejectionReason ? `<small>${escapeHtml(item.rejectionReason)}</small>` : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function renderSavedMaterials() {
  const list = document.getElementById('savedMaterialsList');
  if (!list) return;

  const saved = state.browseMaterials.filter((item) => state.savedMaterials.includes(item.id));
  if (!saved.length) {
    list.innerHTML = `
      <div class="empty-state">
        <h3>💙 No saved materials yet.</h3>
        <p>Bookmarks will appear here when you save study materials.</p>
      </div>
    `;
    return;
  }

  list.innerHTML = saved.map((item) => `
    <div class="material-card">
      <div class="material-top">
        <h4>${escapeHtml(item.title)}</h4>
        <div class="material-meta">
          <span>${escapeHtml(item.subject)}</span>
          <span>•</span>
          <span>${escapeHtml(item.branch)}</span>
        </div>
      </div>
      <div class="material-body">
        ${item.materialType === 'Lecture Video' && item.fileUrl
          ? `<video class="material-video" controls preload="metadata" src="${escapeHtml(item.fileUrl)}">Your browser does not support video playback.</video>`
          : ''}
        <div class="material-footer">
          <small>${new Date(item.uploadedAt).toLocaleDateString()}</small>
          <div class="actions">
            ${item.videoUrl
              ? `<a class="primary-btn small-btn" href="${escapeHtml(item.videoUrl)}" target="_blank" rel="noopener noreferrer">Watch lecture</a>`
              : item.fileUrl
                ? `<a class="primary-btn small-btn" href="${escapeHtml(item.fileUrl)}" target="_blank" rel="noopener noreferrer">${item.materialType === 'Lecture Video' ? 'Open video' : 'Download'}</a>`
                : ''}
            <button class="ghost-btn small-btn" data-remove-saved="${item.id}">Remove</button>
          </div>
        </div>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('[data-remove-saved]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = Number(button.getAttribute('data-remove-saved'));
      toggleSavedMaterial(id);
      renderSavedMaterials();
    });
  });
}

function toggleSavedMaterial(id) {
  const existing = state.savedMaterials.includes(id);
  if (existing) {
    state.savedMaterials = state.savedMaterials.filter((item) => item !== id);
    showToast('Material removed from saved list.');
  } else {
    state.savedMaterials = [...state.savedMaterials, id];
    showToast('Material saved to your bookmarks.');
  }
  localStorage.setItem('campusNotesSaved', JSON.stringify(state.savedMaterials));
}

function escapeHtml(input) {
  return String(input || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function renderAdminDashboard() {
  const view = state.adminView || 'dashboard';
  const userName = state.user?.name || 'Administrator';

  renderShell(`
    <div class="portal-shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">N</div>
          <div class="brand-text">
            <span>CampusNotes</span>
            <small>Admin Portal</small>
          </div>
        </div>
        <nav class="sidebar-nav">
          ${['dashboard','pending','materials','students','permission','reports','logs','settings'].map((item) => {
            const labels = {
              dashboard: '🏠 Dashboard',
              pending: '📋 Pending Approvals',
              materials: '📚 All Materials',
              students: '👨‍🎓 Students',
              permission: '🔐 Upload Permission',
              reports: '📊 Reports',
              logs: '📝 Activity Logs',
              settings: '⚙️ Settings',
            };
            return `<button class="nav-item ${view === item ? 'active' : ''}" data-admin-nav="${item}">${labels[item]}</button>`;
          }).join('')}
          <button class="nav-item" data-logout="admin">🚪 Logout</button>
        </nav>
      </aside>
      <main class="portal-main">
        <div class="page-header">
          <h1>Admin Dashboard</h1>
          <div class="meta">
            <div class="user-chip">👤 ${userName}</div>
          </div>
        </div>
        ${getAdminViewMarkup(view)}
      </main>
    </div>
  `);

  bindAdminActions();
}

function getAdminViewMarkup(view) {
  switch (view) {
    case 'pending':
      return `
        <div class="panel">
          <div class="status-row">
            <h2>Pending Approvals</h2>
            <button class="secondary-btn small-btn" onclick="loadPendingApprovals()">Refresh</button>
          </div>
          <div id="pendingTable"></div>
        </div>
      `;
    case 'materials':
      return `
        <div class="panel">
          <div class="status-row">
            <h2>All Materials</h2>
            <button class="secondary-btn small-btn" onclick="loadAllMaterials()">Refresh</button>
          </div>
          <div id="materialsTable"></div>
        </div>
      `;
    case 'students':
      return `
        <div class="panel">
          <div class="status-row">
            <h2>Students</h2>
            <button class="secondary-btn small-btn" onclick="loadStudentsList()">Refresh</button>
          </div>
          <div id="studentsTable"></div>
        </div>
      `;
    case 'permission':
      return `
        <div class="panel">
          <div class="status-row">
            <h2>Student Upload Permission</h2>
          </div>
          <div id="uploadPermissionBox"></div>
        </div>
      `;
    case 'reports':
      return `
        <div class="panel">
          <h2>Reports</h2>
          <p>Platform metrics will appear here as data is generated by student activity.</p>
        </div>
      `;
    case 'logs':
      return `
        <div class="panel">
          <div class="status-row">
            <h2>Activity Logs</h2>
            <button class="secondary-btn small-btn" onclick="loadLogs()">Refresh</button>
          </div>
          <div id="logsTable"></div>
        </div>
      `;
    case 'settings':
      return `
        <div class="panel">
          <h2>Settings</h2>
          <p>Platform settings and administrative controls are managed here.</p>
        </div>
      `;
    default:
      return `
        <div class="stats-grid">
          <div class="stat-card"><div class="label">Total Students</div><strong id="statStudents">0</strong></div>
          <div class="stat-card"><div class="label">Total Materials</div><strong id="statMaterials">0</strong></div>
          <div class="stat-card"><div class="label">Pending Materials</div><strong id="statPending">0</strong></div>
          <div class="stat-card"><div class="label">Approved Materials</div><strong id="statApproved">0</strong></div>
          <div class="stat-card"><div class="label">Rejected Materials</div><strong id="statRejected">0</strong></div>
          <div class="stat-card"><div class="label">Total Downloads</div><strong>0</strong></div>
          <div class="stat-card"><div class="label">Student Upload Status</div><strong id="statUploadStatus">0</strong></div>
        </div>
      `;
  }
}

function bindAdminActions() {
  document.querySelectorAll('[data-admin-nav]').forEach((button) => {
    button.addEventListener('click', () => {
      const next = button.getAttribute('data-admin-nav');
      state.adminView = next;
      renderAdminDashboard();
    });
  });

  if (state.adminView === 'dashboard') {
    loadAdminStats();
  }
  if (state.adminView === 'pending') {
    loadPendingApprovals();
  }
  if (state.adminView === 'materials') {
    loadAllMaterials();
  }
  if (state.adminView === 'students') {
    loadStudentsList();
  }
  if (state.adminView === 'permission') {
    loadUploadPermission();
  }
  if (state.adminView === 'logs') {
    loadLogs();
  }
}

async function loadAdminStats() {
  try {
    const stats = await apiFetch('/dashboard/stats');
    document.getElementById('statStudents').textContent = stats.totalStudents;
    document.getElementById('statMaterials').textContent = stats.totalMaterials;
    document.getElementById('statPending').textContent = stats.pendingMaterials;
    document.getElementById('statApproved').textContent = stats.approvedMaterials;
    document.getElementById('statRejected').textContent = stats.rejectedMaterials;
    document.getElementById('statUploadStatus').textContent = stats.studentUploadStatus;
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function loadPendingApprovals() {
  try {
    const materials = await apiFetch('/materials?status=Pending');
    const container = document.getElementById('pendingTable');
    if (!container) return;

    if (!materials.length) {
      container.innerHTML = `<div class="empty-state"><h3>✅ No pending submissions.</h3><p>All submitted materials have been reviewed.</p></div>`;
      return;
    }

    container.innerHTML = `
      <div class="table-wrap">
        <table class="approval-table">
          <thead>
            <tr>
              <th>Material</th>
              <th>Course</th>
              <th>Details</th>
              <th>Review</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${materials.map((item) => `
              <tr>
                <td data-label="Material">
                  <strong>${escapeHtml(item.title)}</strong>
                  <small>By ${escapeHtml(item.uploadedByName || (item.uploadedByRole === 'teacher' ? 'Teacher' : 'Student'))}</small>
                </td>
                <td data-label="Course">
                  <strong>${escapeHtml(item.subject)}</strong>
                  <small>${escapeHtml(item.branch || '-')}</small>
                </td>
                <td data-label="Details">
                  <strong>${escapeHtml(item.semester || '-')}</strong>
                  <small>${escapeHtml(item.materialType || '-')}</small>
                </td>
                <td data-label="Review">
                  <strong>${new Date(item.uploadedAt).toLocaleDateString()}</strong>
                  <small><span class="badge pending">Pending</span></small>
                </td>
                <td class="approval-action-cell">
                  <div class="actions approval-actions">
                    ${item.videoUrl
                      ? `<a class="secondary-btn small-btn" href="${escapeHtml(item.videoUrl)}" target="_blank" rel="noopener noreferrer">View video</a>`
                      : item.fileUrl
                        ? `<a class="secondary-btn small-btn" href="${escapeHtml(item.fileUrl)}" target="_blank" rel="noopener noreferrer">View file</a>`
                        : ''}
                    <button class="primary-btn small-btn" data-approve-material="${item.id}">Approve</button>
                    <button class="danger-btn small-btn" data-reject-material="${item.id}">Reject</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    document.querySelectorAll('[data-approve-material]').forEach((button) => {
      button.addEventListener('click', async () => {
        const id = Number(button.getAttribute('data-approve-material'));
        try {
          const response = await apiFetch(`/materials/${id}/approve`, { method: 'PATCH' });
          showToast(response.message);
          loadPendingApprovals();
        } catch (error) {
          showToast(error.message, 'error');
        }
      });
    });

    document.querySelectorAll('[data-reject-material]').forEach((button) => {
      button.addEventListener('click', async () => {
        const reason = prompt('Optional rejection reason:');
        const id = Number(button.getAttribute('data-reject-material'));
        try {
          const response = await apiFetch(`/materials/${id}/reject`, {
            method: 'PATCH',
            body: JSON.stringify({ rejectionReason: reason || 'No reason provided' }),
          });
          showToast(response.message);
          loadPendingApprovals();
        } catch (error) {
          showToast(error.message, 'error');
        }
      });
    });
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function loadAllMaterials() {
  try {
    const materials = await apiFetch('/materials?status=all');
    const container = document.getElementById('materialsTable');
    if (!container) return;

    if (!materials.length) {
      container.innerHTML = `<div class="empty-state"><h3>📚 No materials have been uploaded yet.</h3><p>Approved, pending, and rejected files will appear here once students share them.</p></div>`;
      return;
    }

    container.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Subject</th>
              <th>Type</th>
              <th>Status</th>
              <th>Uploaded By</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${materials.map((item) => `
              <tr>
                <td>${escapeHtml(item.title)}</td>
                <td>${escapeHtml(item.subject)}</td>
                <td>${escapeHtml(item.materialType || '-')}</td>
                <td><span class="badge ${item.status.toLowerCase()}">${item.status}</span></td>
                <td>${escapeHtml(item.uploadedByName || (item.uploadedByRole === 'teacher' ? 'Teacher' : 'Student'))}</td>
                <td>
                  <div class="actions">
                    ${item.videoUrl
                      ? `<a class="secondary-btn small-btn" href="${escapeHtml(item.videoUrl)}" target="_blank" rel="noopener noreferrer">View video</a>`
                      : item.fileUrl
                        ? `<a class="secondary-btn small-btn" href="${escapeHtml(item.fileUrl)}" target="_blank" rel="noopener noreferrer">View file</a>`
                        : ''}
                    <button class="danger-btn small-btn" data-delete-material="${item.id}">Delete</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    document.querySelectorAll('[data-delete-material]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to delete this material?')) return;
        const id = Number(button.getAttribute('data-delete-material'));
        try {
          const response = await apiFetch(`/materials/${id}`, { method: 'DELETE' });
          showToast(response.message);
          loadAllMaterials();
        } catch (error) {
          showToast(error.message, 'error');
        }
      });
    });
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function loadStudentsList() {
  try {
    const students = await apiFetch('/students');
    const container = document.getElementById('studentsTable');
    if (!container) return;

    if (!students.length) {
      container.innerHTML = `<div class="empty-state"><h3>👨‍🎓 No students registered yet.</h3><p>Student accounts will appear here after registration.</p></div>`;
      return;
    }

    container.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Student ID</th>
              <th>Email</th>
              <th>Branch</th>
              <th>Year</th>
              <th>Semester</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${students.map((student) => `
              <tr>
                <td>${escapeHtml(student.name)}</td>
                <td>${escapeHtml(student.studentId || '-')}</td>
                <td>${escapeHtml(student.email)}</td>
                <td>${escapeHtml(student.branch || '-')}</td>
                <td>${escapeHtml(student.year || '-')}</td>
                <td>${escapeHtml(student.semester || '-')}</td>
                <td><span class="badge ${student.status === 'active' ? 'approved' : 'rejected'}">${student.status || 'active'}</span></td>
                <td>
                  <div class="actions">
                    <button class="secondary-btn small-btn" data-toggle-student-status="${student.id}" data-status="${student.status === 'active' ? 'inactive' : 'active'}">${student.status === 'active' ? 'Deactivate' : 'Activate'}</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    document.querySelectorAll('[data-toggle-student-status]').forEach((button) => {
      button.addEventListener('click', async () => {
        const id = Number(button.getAttribute('data-toggle-student-status'));
        const nextStatus = button.getAttribute('data-status');
        try {
          const response = await apiFetch(`/students/${id}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: nextStatus }),
          });
          showToast(response.message);
          loadStudentsList();
        } catch (error) {
          showToast(error.message, 'error');
        }
      });
    });
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function loadUploadPermission() {
  try {
    const response = await apiFetch('/settings/student-uploads');
    const box = document.getElementById('uploadPermissionBox');
    if (!box) return;

    const enabled = Boolean(response.enabled);
    box.innerHTML = `
      <div class="status-row">
        <h3>${enabled ? '🟢 Students are currently allowed to upload study material.' : '🔴 Students are currently not allowed to upload study material.'}</h3>
      </div>
      <div class="actions">
        <button class="primary-btn" data-toggle-upload-permission="${enabled ? 'false' : 'true'}">${enabled ? 'Disable uploads' : 'Enable uploads'}</button>
      </div>
    `;

    document.querySelector('[data-toggle-upload-permission]').addEventListener('click', async () => {
      const shouldEnable = document.querySelector('[data-toggle-upload-permission]').getAttribute('data-toggle-upload-permission') === 'true';
      const confirmText = shouldEnable
        ? 'Enable student uploads? Students will be able to submit new study material for approval.'
        : 'Are you sure you want to disable student uploads? Students will no longer be able to submit new study material.';

      if (!confirm(confirmText)) return;

      try {
        const result = await apiFetch('/settings/student-uploads', {
          method: 'PUT',
          body: JSON.stringify({ enabled: shouldEnable }),
        });
        showToast(result.message);
        loadUploadPermission();
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function loadLogs() {
  try {
    const logs = await apiFetch('/activity-logs');
    const container = document.getElementById('logsTable');
    if (!container) return;

    if (!logs.length) {
      container.innerHTML = `<div class="empty-state"><h3>📝 No activity logs yet.</h3><p>Admin actions will appear here.</p></div>`;
      return;
    }

    container.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Action</th>
              <th>User/Admin</th>
              <th>Date</th>
              <th>Time</th>
              <th>Target</th>
            </tr>
          </thead>
          <tbody>
            ${logs.map((log) => `
              <tr>
                <td>${escapeHtml(log.action)}</td>
                <td>${escapeHtml(log.performedBy || 'System')}</td>
                <td>${new Date(log.timestamp).toLocaleDateString()}</td>
                <td>${new Date(log.timestamp).toLocaleTimeString()}</td>
                <td>${escapeHtml(log.targetId || '-')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function routeFromHash() {
  const hash = window.location.hash.slice(1) || '/';
  if (hash === '/') return 'home';
  if (hash === '/student-login') return 'student-login';
  if (hash === '/student-register') return 'student-register';
  if (hash === '/teacher-login') return 'teacher-login';
  if (hash === '/teacher-register') return 'teacher-register';
  if (hash === '/admin-login') return 'admin-login';
  if (hash === '/student-dashboard') return 'student-dashboard';
  if (hash === '/teacher-dashboard') return 'teacher-dashboard';
  if (hash === '/admin-dashboard') return 'admin-dashboard';
  return 'home';
}

function render() {
  const route = routeFromHash();

  if (state.user && state.user.role === 'student' && route === 'student-dashboard') {
    renderStudentDashboard();
    return;
  }

  if (state.user && state.user.role === 'teacher' && route === 'teacher-dashboard') {
    renderTeacherDashboard();
    return;
  }

  if (state.user && state.user.role === 'admin' && route === 'admin-dashboard') {
    renderAdminDashboard();
    return;
  }

  switch (route) {
    case 'student-login':
      renderStudentLogin();
      break;
    case 'student-register':
      renderStudentRegister();
      break;
    case 'teacher-login':
      renderTeacherLogin();
      break;
    case 'teacher-register':
      renderTeacherRegister();
      break;
    case 'admin-login':
      renderAdminLogin();
      break;
    case 'student-dashboard':
      if (state.user?.role === 'student') {
        renderStudentDashboard();
      } else {
        renderStudentLogin();
      }
      break;
    case 'teacher-dashboard':
      if (state.user?.role === 'teacher') {
        renderTeacherDashboard();
      } else {
        renderTeacherLogin();
      }
      break;
    case 'admin-dashboard':
      if (state.user?.role === 'admin') {
        renderAdminDashboard();
      } else {
        renderAdminLogin();
      }
      break;
    default:
      renderLanding();
  }
}

window.addEventListener('hashchange', () => {
  render();
});

window.addEventListener('load', () => {
  if (state.token && state.user) {
    const role = state.user.role;
    if (role === 'student') {
      setRoute('#/student-dashboard');
    } else if (role === 'teacher') {
      setRoute('#/teacher-dashboard');
    } else if (role === 'admin') {
      setRoute('#/admin-dashboard');
    }
  }
  render();
  reloadUser();
});

window.logoutStudent = () => clearAuthSession();
window.setStudentView = setStudentView;
window.loadBrowseMaterials = loadBrowseMaterials;
window.loadStudentUploads = loadStudentUploads;
window.loadPendingApprovals = loadPendingApprovals;
window.loadAllMaterials = loadAllMaterials;
window.loadStudentsList = loadStudentsList;
window.loadUploadPermission = loadUploadPermission;
window.loadLogs = loadLogs;
window.loadAdminStats = loadAdminStats;
