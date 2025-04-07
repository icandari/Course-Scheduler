window.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const courseId = urlParams.get('course_id');
    const courseInfoDiv = document.getElementById('course-info');
    const courseSectionsDiv = document.getElementById('course-sections');
    const addSectionButton = document.getElementById('add-section-button');
    const addSectionModal = document.getElementById('add-section-modal');
    const addSectionForm = document.getElementById('add-section-form');
    const sectionTypeSelect = document.getElementById('section-type');
    const electiveOptions = document.getElementById('elective-options');
    const deleteCourseButton = document.getElementById('delete-course-button');
    const editCourseModal = document.getElementById('edit-course-modal');
    const editCourseForm = document.getElementById('edit-course-form');
    const editCourseButton = document.getElementById('edit-course-button');
    const editSectionModal = document.getElementById('edit-section-modal');
    const editSectionForm = document.getElementById('edit-section-form');
    const editSectionTypeSelect = document.getElementById('edit-section-type');
    const editElectiveOptions = document.getElementById('edit-elective-options');
    let searchTimeout;
    
    if (deleteCourseButton) {
        deleteCourseButton.addEventListener('click', async () => {
            if (!confirm('Are you sure you want to delete this course?')) return;
            try {
                const response = await fetch(`/api/courses/${courseId}`, {
                    method: 'DELETE'
                });
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Failed to delete course');
                }
               
                window.location.href = 'search.html'; // Redirect to search after deletion
            } catch (error) {
                console.error('Error deleting course:', error);
                alert(`Error: ${error.message}`);
            }
        });
    }

    if (editCourseButton) {
        editCourseButton.addEventListener('click', async () => {
            // Fetch current course data
            try {
                const response = await fetch(`/api/courses/${courseId}`);
                if (!response.ok) throw new Error('Failed to fetch course details');
                const courseData = await response.json();
                
                // Populate the form with current values
                document.getElementById('edit-course-name').value = courseData.course_name;
                document.getElementById('edit-course-type').value = courseData.course_type;
                // Set the holokai field value (if it exists, otherwise default to an empty string)
                document.getElementById('edit-holokai').value = courseData.holokai || '';
                
                // Show the modal
                editCourseModal.style.display = 'block';
            } catch (error) {
                console.error('Error fetching course details:', error);
                alert('Error loading course details');
            }
        });
    }
    
    editCourseForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const updatedData = {
            course_name: document.getElementById('edit-course-name').value,
            course_type: document.getElementById('edit-course-type').value,
            holokai: document.getElementById('edit-holokai').value  // New field added here
        };
    
        try {
            const response = await fetch(`/api/courses/${courseId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedData)
            });
    
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to update course');
            }
            
            // Hide modal and refresh page to show updated data
            editCourseModal.style.display = 'none';
            location.reload();
        } catch (error) {
            console.error('Error updating course:', error);
            alert(error.message);
        }
    });
    
    document.getElementById('cancel-edit-course').addEventListener('click', () => {
        editCourseModal.style.display = 'none';
        editCourseForm.reset();
    });
    
    window.addEventListener('click', (event) => {
        if (event.target === editCourseModal) {
            editCourseModal.style.display = 'none';
            editCourseForm.reset();
        }
    });

    if (!courseId) {
        courseInfoDiv.innerHTML = '<p>No valid course found.</p>';
        return;
    }

    // Show/hide elective options based on section type
    sectionTypeSelect.addEventListener('change', () => {
        electiveOptions.style.display = 
            sectionTypeSelect.value === 'elective' ? 'block' : 'none';
    });

    // Handle section modal
    addSectionButton.addEventListener('click', () => {
        addSectionModal.style.display = 'block';
    });

    document.getElementById('cancel-section').addEventListener('click', () => {
        addSectionModal.style.display = 'none';
        addSectionForm.reset();
    });

    // Handle section form submission
    addSectionForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const sectionData = {
            section_name: document.getElementById('section-name').value,
            is_required: sectionTypeSelect.value === 'required',
            credits_needed_to_take: sectionTypeSelect.value === 'elective' ? 
                parseInt(document.getElementById('classes-to-choose').value) : null
        };

        try {
            const response = await fetch(`/api/courses/${courseId}/sections`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(sectionData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to create section');
            }
            
            addSectionModal.style.display = 'none';
            addSectionForm.reset();
            location.reload();
        } catch (error) {
            console.error('Error creating section:', error);
            alert(error.message);
        }
    });

    try {
        // Fetch course details with sections
        const response = await fetch(`/api/courses/${encodeURIComponent(courseId)}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch course details: ${response.statusText}`);
        }
        const data = await response.json();
        if (!data) {
            courseInfoDiv.innerHTML = '<p>No details available for this course.</p>';
            return;
        }

        // Display course info
        displayCourse(data);

    } catch (error) {
        console.error(error);
        courseInfoDiv.innerHTML = `<p>Error: ${error.message}</p>`;
    }

    // First, inject the search modal HTML
    const searchModalHTML = `
        <div id="search-modal" class="modal">
            <div class="modal-content search-modal-content">
                <h2>Search Classes</h2>
                <input type="text" class="class-search-input" placeholder="Search by Class Number">
                <ul class="search-results"></ul>
                <div class="modal-buttons">
                    <button id="close-search-modal">Cancel</button>
                </div>
            </div>
        </div>`;
    document.body.insertAdjacentHTML('beforeend', searchModalHTML);

    // Now that the modal exists in the DOM, set up the search functionality
    const searchModal = document.getElementById('search-modal');
    const searchInput = searchModal.querySelector('.class-search-input');
    const searchResults = searchModal.querySelector('.search-results');

    // Add input event listener to search input
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const sectionId = searchModal.dataset.sectionId;
        searchTimeout = setTimeout(() => performSearch(sectionId), 500);
    });

    // Add modal close handlers
    document.getElementById('close-search-modal').onclick = () => {
        searchModal.style.display = 'none';
    };

    window.onclick = (event) => {
        if (event.target === searchModal) {
            searchModal.style.display = 'none';
        }
    };

    function displayCourse(data) {
        // Calculate total credits in the course
        let totalCredits = 0;
        if (data.sections && Array.isArray(data.sections)) {
          data.sections.forEach(section => {
            if (section.classes && Array.isArray(section.classes)) {
              section.classes.forEach(cls => {
                totalCredits += Number(cls.credits || 0);
              });
            }
          });
        }
      
        // Update the HTML: course type, credits, and category are shown on one line.
        // Using the same styling as defined in your stylesheet (#course-info h3 and .course-credits)
        courseInfoDiv.innerHTML = `
          <h2>${data.course_name}</h2>
          <h3>
            ${data.course_type || 'null'}
            <span class="course-credits">• ${totalCredits} Credits</span>
            <span class="course-credits">• ${data.holokai || 'null'}</span>
          </h3>
          <div class="editanddelete">
            <img id="edit-course-button" src="./assets/whiteedit.png" alt="Edit course">
            <img id="download-course-button" src="./assets/downloadcourse.png" alt="Download course">
            <img id="delete-course-button" src="./assets/whitedelete.png" alt="Delete course">
            <img id="copy-course-button" src="./assets/copy-button.png" alt="Duplicate course">
          </div>
        `;

        // Add this right after setting courseInfoDiv.innerHTML
        const editButton = document.getElementById('edit-course-button');
        if (editButton) {
            editButton.addEventListener('click', async () => {
                try {
                    const response = await fetch(`/api/courses/${courseId}`);
                    if (!response.ok) throw new Error('Failed to fetch course details');
                    const courseData = await response.json();
                    
                    // Populate the form with current values
                    document.getElementById('edit-course-name').value = courseData.course_name;
                    document.getElementById('edit-course-type').value = courseData.course_type;
                    
                    // Populate holokai field in edit modal
                    document.getElementById('edit-holokai').value = courseData.holokai || '';
                    
                    // Show the modal
                    const editCourseModal = document.getElementById('edit-course-modal');
                    editCourseModal.style.display = 'block';
                } catch (error) {
                    console.error('Error fetching course details:', error);
                    alert('Error loading course details');
                }
            });
        }

        if (editButton) {
            editButton.addEventListener('click', function() {
                const editAndDelete = this.closest('.editanddelete');
                editAndDelete.classList.toggle('active');
                this.classList.toggle('active');
            });
        }

        const deleteButton = document.getElementById('delete-course-button');
        if (deleteButton) {
            deleteButton.addEventListener('click', async () => {
                if (confirm('Are you sure you want to delete this course? This action cannot be undone.')) {
                    try {
                        const response = await fetch(`/api/courses/${courseId}`, {
                            method: 'DELETE'
                        });

                        if (!response.ok) {
                            const errorData = await response.json();
                            throw new Error(errorData.error || 'Failed to delete course');
                        }

                        window.location.href = 'search.html';
                    } catch (error) {
                        console.error('Error deleting course:', error);
                        alert('Error deleting course: ' + error.message);
                    }
                }
            });
        }

        const copyButton = document.getElementById('copy-course-button');
        if (copyButton) {
            copyButton.addEventListener('click', async () => {
                if (confirm('Do you want to create a copy of this course with all its sections and classes?')) {
                    try {
                        copyButton.style.opacity = '0.5';
                        copyButton.style.cursor = 'wait';
                        
                        const response = await fetch(`/api/courses/${courseId}/duplicate`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' }
                        });

                        if (!response.ok) {
                            const errorData = await response.json();
                            throw new Error(errorData.error || 'Failed to copy course');
                        }

                        const newCourse = await response.json();
                        
                        alert(`Course copied successfully! The new course is named "${newCourse.course_name}".`);
                        window.location.href = `course_details.html?course_id=${newCourse.id}`;
                    } catch (error) {
                        console.error('Error copying course:', error);
                        alert('Error copying course: ' + error.message);
                        copyButton.style.opacity = '1';
                        copyButton.style.cursor = 'pointer';
                    }
                }
            });
        }

        courseSectionsDiv.innerHTML = '';
        
        if (data.sections && Array.isArray(data.sections) && data.sections.length > 0) {
            data.sections.forEach((section, index) => {
                if (section && section.id) {
                    const sectionDiv = document.createElement('div');
                    sectionDiv.className = 'course-section';
                    sectionDiv.draggable = true;
                    sectionDiv.dataset.sectionId = section.id;
                    sectionDiv.dataset.index = index;
                    
                    sectionDiv.innerHTML = `
                        <div class="drag-handle"></div>
                        <div class="section-header">
                            <div class="section-info-container">
                                <h3 class="section-title">
                                    ${section.section_name}
                                    <img class="section-icon" src="./assets/editclassbutton.png" alt="Edit section" data-section="${section.id}">
                                </h3>
                                <div class="section-info">
                                    ${section.is_required ? 'Required' : `Take a total of ${section.credits_needed_to_take} credits`}
                                </div>
                            </div>
                            <div class="section-header-actions">
                                <button class="delete-section-button" data-section="${section.id}">Delete This Section</button>
                                <img class="toggle-actions-button" src="./assets/editclassbutton.png" alt="Toggle actions" data-section="${section.id}">
                            </div>
                        </div>
                        <ul class="classes-list" id="section-${section.id}-classes"></ul>
                        <div class="section-footer">
                            <div class="section-controls">
                                <div class="custom-button add-existing-class-button" data-section="${section.id}">
                                    <img src="./assets/addexistingclassbutton.png" alt="Add existing">
                                    <span>Add Existing Class</span>
                                </div>
                                <div class="custom-button add-new-class-button" data-section="${section.id}">
                                    <img src="./assets/addnewclassbutton.png" alt="Add new">
                                    <span>Add New Class</span>
                                </div>
                            </div>
                        </div>
                    `;
                    
                    courseSectionsDiv.appendChild(sectionDiv);
                    
                    const sectionClassesList = document.getElementById(`section-${section.id}-classes`);
                    if (section.classes && section.classes.length > 0) {
                        section.classes.forEach(cls => {
                            const li = document.createElement('li');
                            li.innerHTML = `
                                ${cls.class_number}: ${cls.class_name}
                                <div class="class-actions">
                                    <img class="update-class-button" 
                                        src="./assets/editclassbutton.png" 
                                        alt="Edit class"
                                        data-class-id="${cls.id}" 
                                        data-section-id="${section.id}">
                                    <img class="delete-class-button" 
                                        src="./assets/removebutton.png" 
                                        alt="Remove class"
                                        data-class-id="${cls.id}"
                                        data-section-id="${section.id}">
                                </div>
                            `;
                            sectionClassesList.appendChild(li);
                        });
                    } else {
                        sectionClassesList.innerHTML = '<li>No classes in this section</li>';
                    }
                }
            });
    
            attachSectionEventListeners();
            initDragAndDrop();
        }
    
        addSectionButton.style.display = 'block';
    }

    function attachSectionEventListeners() {
        document.querySelectorAll('.add-existing-class-button').forEach(button => {
            button.addEventListener('click', (e) => {
                const sectionId = button.dataset.section;
                showSearchContainer(sectionId);
            });
        });

        document.querySelectorAll('.add-new-class-button').forEach(button => {
            button.addEventListener('click', (e) => {
                const sectionId = button.dataset.section;
                window.location.href = `add_new_class.html?course_id=${courseId}&section_id=${sectionId}`;
            });
        });

        document.querySelectorAll('.update-class-button').forEach(button => {
            button.addEventListener('click', (e) => {
                const classId = e.target.dataset.classId;
                const sectionId = e.target.dataset.sectionId;
                window.location.href = `edit_class.html?course_id=${courseId}&class_id=${classId}&section_id=${sectionId}`;
            });
        });

        document.querySelectorAll('.delete-class-button').forEach(button => {
            button.addEventListener('click', async (e) => {
                const classId = e.target.dataset.classId;
                const sectionId = e.target.dataset.sectionId;
                
                if (confirm('Are you sure you want to remove this class from the section?')) {
                    try {
                        const response = await fetch(
                            `/api/courses/${courseId}/sections/${sectionId}/classes/${classId}`,
                            { method: 'DELETE' }
                        );
        
                        if (!response.ok) {
                            const errorData = await response.json();
                            throw new Error(errorData.error || 'Failed to remove class from section');
                        }
        
                        location.reload();
                    } catch (error) {
                        console.error('Error removing class from section:', error);
                        alert(error.message);
                    }
                }
            });
        });

        document.querySelectorAll('.delete-section-button').forEach(button => {
            button.addEventListener('click', async (e) => {
                const sectionId = e.target.dataset.section;
                
                if (confirm('Are you sure you want to delete this section? This will remove all class associations.')) {
                    try {
                        const response = await fetch(
                            `/api/courses/${courseId}/sections/${sectionId}`,
                            { method: 'DELETE' }
                        );

                        if (!response.ok) {
                            const errorData = await response.json();
                            throw new Error(errorData.error || 'Failed to delete section');
                        }

                        location.reload();
                    } catch (error) {
                        console.error('Error deleting section:', error);
                        alert(error.message);
                    }
                }
            });
        });

        document.querySelectorAll('.class-search-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const sectionId = e.target.closest('.section-controls')
                    .querySelector('.add-existing-class-button').dataset.section;
                
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => performSearch(sectionId), 500);
            });
        });

        document.querySelectorAll('.section-icon').forEach(button => {
            button.addEventListener('click', async (e) => {
                const sectionId = e.target.dataset.section;
                
                try {
                    const response = await fetch(`/api/courses/${courseId}/sections/${sectionId}`);
                    if (!response.ok) throw new Error('Failed to fetch section details');
                    const sectionData = await response.json();
                    
                    document.getElementById('edit-section-name').value = sectionData.section_name;
                    document.getElementById('edit-section-type').value = sectionData.is_required ? 'required' : 'elective';
                    
                    if (!sectionData.is_required) {
                        document.getElementById('edit-classes-to-choose').value = sectionData.credits_needed_to_take || 1;
                        editElectiveOptions.style.display = 'block';
                    } else {
                        editElectiveOptions.style.display = 'none';
                    }
                    
                    document.getElementById('edit-section-id').value = sectionId;
                    editSectionModal.style.display = 'block';
                } catch (error) {
                    console.error('Error fetching section details:', error);
                    alert('Error loading section details');
                }
            });
        });

        document.querySelectorAll('.toggle-actions-button').forEach(button => {
            button.addEventListener('click', (e) => {
                const sectionId = e.target.dataset.section;
                const classList = document.getElementById(`section-${sectionId}-classes`);
                const sectionElement = e.target.closest('.course-section');
                
                classList.classList.toggle('show-actions');
                sectionElement.classList.toggle('active');
                e.target.classList.toggle('active');
                e.target.style.transform = classList.classList.contains('show-actions') ? 
                    'rotate(180deg)' : 'rotate(0deg)';
            });
        });
    }

    editSectionTypeSelect.addEventListener('change', () => {
        editElectiveOptions.style.display = 
            editSectionTypeSelect.value === 'elective' ? 'block' : 'none';
    });

    document.getElementById('cancel-edit-section').addEventListener('click', () => {
        editSectionModal.style.display = 'none';
        editSectionForm.reset();
    });

    window.addEventListener('click', (event) => {
        if (event.target === editSectionModal) {
            editSectionModal.style.display = 'none';
            editSectionForm.reset();
        }
    });

    editSectionForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const sectionId = document.getElementById('edit-section-id').value;
        const isElective = editSectionTypeSelect.value === 'elective';
        
        const updatedData = {
            section_name: document.getElementById('edit-section-name').value,
            is_required: !isElective,
            credits_needed_to_take: isElective ? 
                parseInt(document.getElementById('edit-classes-to-choose').value) : null
        };

        try {
            const response = await fetch(`/api/courses/${courseId}/sections/${sectionId}`, {
                method: 'PUT', 
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to update section');
            }
            
            editSectionModal.style.display = 'none';
            location.reload();
        } catch (error) {
            console.error('Error updating section:', error);
            alert(error.message);
        }
    });

    function showSearchContainer(sectionId) {
        const searchModal = document.getElementById('search-modal');
        const searchInput = searchModal.querySelector('.class-search-input');
        const searchResults = searchModal.querySelector('.search-results');
        
        searchModal.dataset.sectionId = sectionId;
        searchInput.value = '';
        searchResults.innerHTML = '';
        searchModal.style.display = 'block';
        searchInput.focus();
    }

    async function performSearch(sectionId) {
        const searchModal = document.getElementById('search-modal');
        const searchInput = searchModal.querySelector('.class-search-input');
        const searchResults = searchModal.querySelector('.search-results');
        const query = searchInput.value.trim();
        
        console.log('Performing search with query:', query);
        
        if (!query) {
            searchResults.innerHTML = '';
            return;
        }

        try {
            const response = await fetch(`/api/classes/search?query=${encodeURIComponent(query)}`);
            console.log('Search response:', response);
            
            if (!response.ok) throw new Error('Search failed');

            const data = await response.json();
            console.log('Search results:', data);
            
            displaySearchResults(data.classes, sectionId, searchResults);
        } catch (error) {
            console.error('Search error:', error);
            searchResults.innerHTML = '<li class="error">Search failed. Please try again.</li>';
        }
    }

    function displaySearchResults(classes, sectionId, searchResults) {
        console.log('Adding class with:', {
            courseId: courseId,
            sectionId: sectionId,
            classes: classes
        });

        searchResults.innerHTML = '';
        if (!classes.length) {
            searchResults.innerHTML = '<li>No classes found</li>';
            return;
        }

        classes.forEach(cls => {
            const li = document.createElement('li');
            li.innerHTML = `
                ${cls.class_number}: ${cls.class_name}
                <button class="add-class-button" 
                    data-class-id="${cls.id}" 
                    data-section-id="${sectionId}">Add</button>
            `;
            searchResults.appendChild(li);
        });

        searchResults.querySelectorAll('.add-class-button').forEach(button => {
            button.addEventListener('click', async (e) => {
                const classId = button.dataset.classId;
                const sectionId = button.dataset.sectionId;
                
                console.log('Adding class:', {
                    courseId: courseId,
                    sectionId: sectionId,
                    classId: classId
                });

                try {
                    const response = await fetch(
                        `/api/courses/${courseId}/sections/${sectionId}/classes`, 
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ class_id: classId })
                        }
                    );

                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.error || 'Failed to add class');
                    }

                    location.reload();
                } catch (error) {
                    console.error('Error adding class:', error);
                    alert(error.message);
                }
            });
        });
    }

    function initDragAndDrop() {
        const sections = document.querySelectorAll('.course-section');
        let draggedSection = null;
        
        sections.forEach(section => {
            section.addEventListener('dragstart', (e) => {
                draggedSection = section;
                setTimeout(() => {
                    section.classList.add('dragging');
                }, 0);
                
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', section.dataset.sectionId);
            });
            
            section.addEventListener('dragend', () => {
                section.classList.remove('dragging');
                draggedSection = null;
                saveNewSectionOrder();
            });
            
            section.addEventListener('dragover', (e) => {
                e.preventDefault();
                if (draggedSection === section) return;
                
                const box = section.getBoundingClientRect();
                const offsetY = e.clientY - box.top - (box.height / 2);
                
                if (offsetY < 0) {
                    section.classList.add('drag-over-top');
                    section.classList.remove('drag-over-bottom');
                } else {
                    section.classList.add('drag-over-bottom');
                    section.classList.remove('drag-over-top');
                }
            });
            
            section.addEventListener('dragenter', (e) => {
                e.preventDefault();
                if (draggedSection === section) return;
            });
            
            section.addEventListener('dragleave', () => {
                section.classList.remove('drag-over-top', 'drag-over-bottom');
            });
            
            section.addEventListener('drop', (e) => {
                e.preventDefault();
                if (draggedSection === section) return;
                
                section.classList.remove('drag-over-top', 'drag-over-bottom');
                
                const box = section.getBoundingClientRect();
                const offsetY = e.clientY - box.top - (box.height / 2);
                
                if (offsetY < 0) {
                    courseSectionsDiv.insertBefore(draggedSection, section);
                } else {
                    courseSectionsDiv.insertBefore(draggedSection, section.nextSibling);
                }
            });
        });
    }

    async function saveNewSectionOrder() {
        try {
            const sections = document.querySelectorAll('.course-section');
            
            if (!sections || sections.length === 0) {
                console.log('No sections found to reorder');
                return;
            }
            
            const courseIdInt = parseInt(courseId, 10);
            
            if (isNaN(courseIdInt) || courseIdInt <= 0) {
                throw new Error('Invalid course ID');
            }
            
            const sectionDataArray = [];
            
            for (let i = 0; i < sections.length; i++) {
                const sectionIdRaw = sections[i].dataset.sectionId;
                const sectionIdInt = parseInt(sectionIdRaw, 10);
                
                if (isNaN(sectionIdInt) || sectionIdInt <= 0) {
                    console.warn(`Skipping invalid section ID: ${sectionIdRaw}`);
                    continue;
                }
                
                sectionDataArray.push({
                    section_id: sectionIdInt,
                    display_order: i + 1
                });
            }
            
            const requestBody = JSON.stringify({
                sections: sectionDataArray
            });
            
            console.log(`Sending request to /api/courses/${courseIdInt}/sections/reorder`);
            console.log(`Request body: ${requestBody}`);
            
            const response = await fetch(`/api/courses/${courseIdInt}/sections/reorder`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: requestBody
            });
            
            const responseText = await response.text();
            console.log('Raw API Response:', responseText);
            
            if (response.ok) {
                console.log('Section order updated successfully');
                return true;
            } else {
                let errorMessage = 'Failed to update section order';
                try {
                    const errorData = JSON.parse(responseText);
                    errorMessage = errorData.error || errorMessage;
                } catch (e) {
                    errorMessage = responseText || errorMessage;
                }
                throw new Error(errorMessage);
            }
        } catch (error) {
            console.error('Error saving section order:', error);
            alert('Error: ' + error.message);
            return false;
        }
    }

    async function saveNewSectionOrderAlternative() {
        try {
            const sections = document.querySelectorAll('.course-section');
            
            if (!sections || sections.length === 0) {
                return;
            }
            
            for (let i = 0; i < sections.length; i++) {
                const sectionId = parseInt(sections[i].dataset.sectionId, 10);
                const displayOrder = i + 1;
                
                if (isNaN(sectionId)) continue;
                
                await fetch(`/api/courses/${parseInt(courseId, 10)}/sections/${sectionId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        display_order: displayOrder
                    })
                });
            }
            
            console.log('All sections updated individually');
            return true;
        } catch (error) {
            console.error('Error in individual updates:', error);
            return false;
        }
    }
});
