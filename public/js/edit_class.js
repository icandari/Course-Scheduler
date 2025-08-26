window.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const courseId = urlParams.get('course_id');
    const classId = urlParams.get('class_id');
    const editClassForm = document.getElementById('edit-class-form');
    const messageDiv = document.getElementById('form-message');
    const backToCourseLink = document.getElementById('back-to-course');

    // Create header container and set its position
    const headerContainer = document.createElement('div');
    headerContainer.className = 'header-container';
    editClassForm.insertAdjacentElement('beforebegin', headerContainer);
    
    // Move back link to left side of header
    headerContainer.appendChild(backToCourseLink);
    
    // Create delete button and add to right side
    const deleteButton = document.createElement('button');
    deleteButton.id = 'delete-class-btn';
    deleteButton.className = 'delete-button';
    deleteButton.textContent = 'Delete Class';
    headerContainer.appendChild(deleteButton);

    // Add restrictions mutual exclusivity logic
    const restrictionsSelect = document.getElementById('class-restrictions');
    const isSeniorCheckbox = document.getElementById('is-senior-class');

    if (restrictionsSelect && isSeniorCheckbox) {
        // Function to handle restrictions selection changes
        function handleRestrictionChange() {
            if (restrictionsSelect.value) {
                // If dropdown has a value, disable senior checkbox
                isSeniorCheckbox.checked = false;
                isSeniorCheckbox.disabled = true;
            } else {
                // If dropdown is empty, enable senior checkbox
                isSeniorCheckbox.disabled = false;
            }
        }

        // Function to handle senior checkbox changes
        function handleSeniorCheckboxChange() {
            if (isSeniorCheckbox.checked) {
                // If senior checkbox is checked, disable and reset restrictions dropdown
                restrictionsSelect.value = '';
                restrictionsSelect.disabled = true;
            } else {
                // If senior checkbox is unchecked, enable restrictions dropdown
                restrictionsSelect.disabled = false;
            }
        }

        // Add event listeners
        restrictionsSelect.addEventListener('change', handleRestrictionChange);
        isSeniorCheckbox.addEventListener('change', handleSeniorCheckboxChange);

        // Important: Make sure both handlers are called to establish initial state
        handleSeniorCheckboxChange();  // Check this first in case senior is checked
        handleRestrictionChange();     // Then check restrictions
    }

    // Create modal for delete confirmation
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h2>Delete Class</h2>
            <p>Are you sure you want to delete this class? This action cannot be undone.</p>
            <div class="modal-buttons">
                <button class="confirm-delete">Delete</button>
                <button class="cancel-delete">Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Delete button click handler
    deleteButton.addEventListener('click', () => {
        modal.style.display = 'block';
    });

    // Modal button handlers
    modal.querySelector('.cancel-delete').addEventListener('click', () => {
        modal.style.display = 'none';
    });

    modal.querySelector('.confirm-delete').addEventListener('click', async () => {
        try {
            // Always delete the class entity via the supported endpoint
            // If you need to only remove the class from a specific course section,
            // call DELETE /api/courses/:course_id/sections/:section_id/classes/:class_id instead.
            const deleteEndpoint = `/api/classes/${encodeURIComponent(classId)}`;

            const response = await fetch(deleteEndpoint, {
                method: 'DELETE'
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to delete class');
            }

            messageDiv.innerHTML = '<p style="color: green;">Class deleted successfully!</p>';
            modal.style.display = 'none';
            
            // Redirect after short delay
            setTimeout(() => {
                // Prefer going back to the course details if we came from a course context
                if (courseId) {
                    window.location.href = `course_details.html?course_id=${encodeURIComponent(courseId)}`;
                } else {
                    window.location.href = 'search.html';
                }
            }, 1200);

        } catch (error) {
            console.error('Error deleting class:', error);
            messageDiv.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
            modal.style.display = 'none';
        }
    });

    // Close modal when clicking outside
    window.addEventListener('click', (event) => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });

    if (!classId) {
        messageDiv.innerHTML = '<p style="color: red;">Invalid class ID.</p>';
        editClassForm.style.display = 'none';
        backToCourseLink.href = '#';
        return;
    }

    if (courseId) {
        backToCourseLink.href = `course_details.html?course_id=${encodeURIComponent(courseId)}`;
    } else {
        backToCourseLink.href = '/search.html';
    }

    let selectedPrerequisites = [];
    let selectedCorequisites = [];

    try {
        const apiEndpoint = courseId
            ? `/api/courses/${encodeURIComponent(courseId)}/classes/${encodeURIComponent(classId)}`
            : `/api/classes/${encodeURIComponent(classId)}`;

        const response = await fetch(apiEndpoint);
        if (!response.ok) {
            throw new Error(`Failed to fetch class details: ${response.statusText}`);
        }
        const classData = await response.json();

        // Populate basic form fields
        document.getElementById('class-number').value = classData.class_number || '';
        document.getElementById('class-name').value = classData.class_name || '';
        document.getElementById('credits').value = classData.credits != null ? classData.credits : '';
        
        // Populate new fields - description and restrictions
        document.getElementById('class-description').value = classData.description || '';
        document.getElementById('class-restrictions').value = classData.restrictions || '';
        document.getElementById('class-link').value = classData.link || ''; // <-- ADDED

        // Populate is-senior-class checkbox if present
        const isSeniorCheckbox = document.getElementById('is-senior-class');
        if (isSeniorCheckbox) {
            isSeniorCheckbox.checked = Boolean(classData.is_senior_class);
        }

        // Apply mutual exclusivity rules on page load
        handleRestrictionChange();
        handleSeniorCheckboxChange();

        // Handle checkboxes
        populateCheckboxes('semesters_offered', classData.semesters_offered || []);
        populateCheckboxes('days_offered', classData.days_offered || []);

        // Initialize prerequisites with full class objects
        if (classData.prerequisites && Array.isArray(classData.prerequisites)) {
            selectedPrerequisites = classData.prerequisites.map(prereq => ({
                id: prereq.id,
                class_number: prereq.class_number,
                class_name: prereq.class_name,
                name: `${prereq.class_number}: ${prereq.class_name}`
            }));
            updateTags('prerequisites', selectedPrerequisites);
        }

        // Initialize corequisites with full class objects
        if (classData.corequisites && Array.isArray(classData.corequisites)) {
            selectedCorequisites = classData.corequisites.map(coreq => ({
                id: coreq.id,
                class_number: coreq.class_number,
                class_name: coreq.class_name,
                name: `${coreq.class_number}: ${coreq.class_name}`
            }));
            updateTags('corequisites', selectedCorequisites);
        }

        document.getElementById('times-offered').value = Array.isArray(classData.times_offered) 
            ? classData.times_offered.join(', ') 
            : '';
    } catch (error) {
        console.error(error);
        messageDiv.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
        editClassForm.style.display = 'none';
        backToCourseLink.href = courseId
            ? `course_details.html?course_id=${encodeURIComponent(courseId)}`
            : '/search.html';
    }

    // Form submission handler
    editClassForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const classNumber = document.getElementById('class-number').value.trim();
        const className = document.getElementById('class-name').value.trim();
        const semestersOffered = getSelectedValues('semesters_offered');
        const credits = parseInt(document.getElementById('credits').value, 10);
        const daysOffered = getSelectedValues('days_offered');
        const timesOffered = document.getElementById('times-offered').value.trim();
        const description = document.getElementById('class-description').value.trim();
        const restrictions = document.getElementById('class-restrictions').value;
        const isSeniorClass = document.getElementById('is-senior-class').checked;
        const link = document.getElementById('class-link').value.trim(); // <-- ADDED

        if (!classNumber || !className || isNaN(credits)) {
            messageDiv.innerHTML = '<p style="color: red;">Please fill in all required fields.</p>';
            return;
        }

        const updatedClassData = {
            class_number: classNumber,
            class_name: className,
            semesters_offered: semestersOffered,
            credits: credits,
            prerequisites: selectedPrerequisites.map(p => p.id),
            corequisites: selectedCorequisites.map(c => c.id),
            days_offered: daysOffered,
            times_offered: timesOffered ? timesOffered.split(',').map(t => t.trim()) : [],
            is_senior_class: isSeniorClass,
            restrictions: restrictions,
            description: description,
            link: link // <-- ADDED
        };

        try {
            // Use the supported endpoint for updating a class entity
            const apiEndpoint = `/api/classes/${encodeURIComponent(classId)}`;

            const updateResponse = await fetch(apiEndpoint, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedClassData)
            });

            if (!updateResponse.ok) {
                const errorData = await updateResponse.json();
                throw new Error(errorData.error || 'Failed to update class');
            }

            const result = await updateResponse.json();
            messageDiv.innerHTML = `<p style="color: green;">${result.message || 'Class updated successfully!'}</p>`;

            setTimeout(() => {
                window.location.href = courseId
                    ? `course_details.html?course_id=${encodeURIComponent(courseId)}`
                    : '/search.html';
            }, 1500);
        } catch (error) {
            console.error('Error updating class:', error);
            messageDiv.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
        }
    });

    // Prerequisites autocomplete
    const prerequisitesInput = document.getElementById('prerequisites');
    const prerequisitesSuggestions = document.getElementById('prerequisites-suggestions');

    prerequisitesInput.addEventListener('input', debounce(async () => {
        const query = prerequisitesInput.value.trim();
        prerequisitesSuggestions.innerHTML = '';

        if (!query) return;

        try {
            const response = await fetch(`/api/classes/search?query=${encodeURIComponent(query)}&limit=10`);
            if (!response.ok) throw new Error('Failed to fetch prerequisites');
            
            const data = await response.json();
            displaySuggestions(data.classes, prerequisitesSuggestions, (classItem) => {
                // Check if class is already a corequisite
                if (selectedCorequisites.some(c => c.id === classItem.id)) {
                    messageDiv.innerHTML = '<p style="color: red;">This class is already added as a corequisite</p>';
                    setTimeout(() => {
                        messageDiv.innerHTML = '';
                    }, 3000);
                    return;
                }

                const prereqObject = {
                    id: classItem.id,
                    class_number: classItem.class_number,
                    class_name: classItem.class_name,
                    name: `${classItem.class_number}: ${classItem.class_name}`
                };
                
                if (!selectedPrerequisites.some(p => p.id === classItem.id)) {
                    selectedPrerequisites.push(prereqObject);
                    updateTags('prerequisites', selectedPrerequisites);
                }
                prerequisitesSuggestions.innerHTML = '';
                prerequisitesInput.value = '';
            });
        } catch (error) {
            console.error('Error:', error);
            prerequisitesSuggestions.innerHTML = `
                <div class="suggestion-item error">Error: ${error.message}</div>
            `;
        }
    }, 300));

    // Corequisites autocomplete
    const corequisitesInput = document.getElementById('corequisites');
    const corequisitesSuggestions = document.getElementById('corequisites-suggestions');

    corequisitesInput.addEventListener('input', debounce(async () => {
        const query = corequisitesInput.value.trim();
        corequisitesSuggestions.innerHTML = '';

        if (!query) return;

        try {
            const response = await fetch(`/api/classes/search?query=${encodeURIComponent(query)}&limit=10`);
            if (!response.ok) throw new Error('Failed to fetch corequisites');
            
            const data = await response.json();
            displaySuggestions(data.classes, corequisitesSuggestions, (classItem) => {
                // Check if class is already a prerequisite
                if (selectedPrerequisites.some(p => p.id === classItem.id)) {
                    messageDiv.innerHTML = '<p style="color: red;">This class is already added as a prerequisite</p>';
                    setTimeout(() => {
                        messageDiv.innerHTML = '';
                    }, 3000);
                    return;
                }

                const coreqObject = {
                    id: classItem.id,
                    class_number: classItem.class_number,
                    class_name: classItem.class_name,
                    name: `${classItem.class_number}: ${classItem.class_name}`
                };
                
                if (!selectedCorequisites.some(c => c.id === classItem.id)) {
                    selectedCorequisites.push(coreqObject);
                    updateTags('corequisites', selectedCorequisites);
                }
                corequisitesSuggestions.innerHTML = '';
                corequisitesInput.value = '';
            });
        } catch (error) {
            console.error('Error:', error);
            corequisitesSuggestions.innerHTML = `
                <div class="suggestion-item error">Error: ${error.message}</div>
            `;
        }
    }, 300));

    // Helper functions
    function displaySuggestions(classes, container, onSelect) {
        container.innerHTML = '';
        if (!classes.length) {
            container.innerHTML = '<div class="suggestion-item">No classes found</div>';
            return;
        }

        classes.forEach(cls => {
            const item = document.createElement('div');
            item.classList.add('suggestion-item');
            item.innerHTML = `
                <span>${cls.class_number}: ${cls.class_name}</span>
                <button type="button" class="add-button">Add</button>
            `;
            item.querySelector('.add-button').addEventListener('click', () => onSelect(cls));
            container.appendChild(item);
        });
    }

    function updateTags(field, selectedItems) {
        const container = document.getElementById(`${field}-tags`) || createTagsContainer(field);
        container.innerHTML = '';

        selectedItems.forEach(item => {
            const tag = document.createElement('span');
            tag.classList.add('tag');
            tag.textContent = item.name;

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.classList.add('remove-tag');
            removeBtn.textContent = '×';
            removeBtn.addEventListener('click', () => {
                if (field === 'prerequisites') {
                    selectedPrerequisites = selectedPrerequisites.filter(p => p.id !== item.id);
                    updateTags('prerequisites', selectedPrerequisites);
                } else {
                    selectedCorequisites = selectedCorequisites.filter(c => c.id !== item.id);
                    updateTags('corequisites', selectedCorequisites);
                }
            });

            tag.appendChild(removeBtn);
            container.appendChild(tag);
        });
    }

    function createTagsContainer(field) {
        const container = document.createElement('div');
        container.id = `${field}-tags`;
        container.classList.add('tags-container');
        document.getElementById(field).parentNode.insertBefore(
            container,
            document.getElementById(field).nextSibling
        );
        return container;
    }

    function populateCheckboxes(name, selectedValues) {
        document.querySelectorAll(`input[name="${name}"]`).forEach(checkbox => {
            checkbox.checked = selectedValues.includes(checkbox.value);
        });
    }

    function getSelectedValues(name) {
        return Array.from(
            document.querySelectorAll(`input[name="${name}"]:checked`)
        ).map(checkbox => checkbox.value);
    }

    function debounce(func, delay) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), delay);
        };
    }
});