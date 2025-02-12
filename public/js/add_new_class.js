document.addEventListener('DOMContentLoaded', async () => {
    const addClassForm = document.getElementById('add-class-form');
    const formMessage = document.getElementById('form-message');
    const backLink = document.getElementById('back-link');
    const formTitle = document.getElementById('form-title');
    const mainHeading = document.getElementById('main-heading');
    const submitButton = document.getElementById('submit-button');

    // Extract both course_id and section_id from URL
    const urlParams = new URLSearchParams(window.location.search);
    const courseId = urlParams.get('course_id');
    const sectionId = urlParams.get('section_id');

    // Update UI based on context
    if (courseId && sectionId) {
        backLink.href = `course_details.html?course_id=${encodeURIComponent(courseId)}`;
        formTitle.textContent = 'Add New Class to Section';
        mainHeading.textContent = 'Add a New Class to This Section';
        submitButton.textContent = 'Add Class to Section';
    } else if (courseId) {
        backLink.href = `course_details.html?course_id=${encodeURIComponent(courseId)}`;
        formTitle.textContent = 'Add New Class to Course';
        mainHeading.textContent = 'Add a New Class to This Course';
        submitButton.textContent = 'Add Class to Course';
    } else {
        backLink.href = 'search.html';
        formTitle.textContent = 'Add New Class';
        mainHeading.textContent = 'Add a New Class';
        submitButton.textContent = 'Add Class';
    }

    // Prerequisites and Corequisites elements
    const prerequisitesInput = document.getElementById('prerequisites');
    const prerequisitesSuggestions = document.getElementById('prerequisites-suggestions');
    const corequisitesInput = document.getElementById('corequisites');
    const corequisitesSuggestions = document.getElementById('corequisites-suggestions');

    // Track selected items with full object data
    let selectedPrerequisites = [];
    let selectedCorequisites = [];

    // Debounce function
    function debounce(func, delay) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), delay);
        };
    }

    // Display suggestions
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

    // Create tags container
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

    // Update tags display
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

    // Clear selected items
    function clearSelectedItems(type) {
        if (type === 'prereq') {
            selectedPrerequisites = [];
            const container = document.getElementById('prerequisites-tags');
            if (container) container.innerHTML = '';
        } else if (type === 'coreq') {
            selectedCorequisites = [];
            const container = document.getElementById('corequisites-tags');
            if (container) container.innerHTML = '';
        }
    }

    // Fetch prerequisites suggestions
    const fetchPrereqSuggestions = debounce(async () => {
        const query = prerequisitesInput.value.trim();
        if (query.length === 0) {
            prerequisitesSuggestions.innerHTML = '';
            return;
        }

        try {
            const response = await fetch(`/api/classes/search?query=${encodeURIComponent(query)}&limit=10`);
            if (!response.ok) throw new Error('Failed to fetch prerequisites');
            
            const data = await response.json();
            displaySuggestions(data.classes, prerequisitesSuggestions, (classItem) => {
                if (selectedCorequisites.some(c => c.id === classItem.id)) {
                    formMessage.textContent = 'This class is already added as a corequisite';
                    formMessage.style.color = 'red';
                    setTimeout(() => {
                        formMessage.textContent = '';
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
            console.error('Error fetching prerequisites:', error);
            prerequisitesSuggestions.innerHTML = `
                <div class="suggestion-item error">Error: ${error.message}</div>
            `;
        }
    }, 300);

    // Fetch corequisites suggestions
    const fetchCoreqSuggestions = debounce(async () => {
        const query = corequisitesInput.value.trim();
        if (query.length === 0) {
            corequisitesSuggestions.innerHTML = '';
            return;
        }

        try {
            const response = await fetch(`/api/classes/search?query=${encodeURIComponent(query)}&limit=10`);
            if (!response.ok) throw new Error('Failed to fetch corequisites');
            
            const data = await response.json();
            displaySuggestions(data.classes, corequisitesSuggestions, (classItem) => {
                if (selectedPrerequisites.some(p => p.id === classItem.id)) {
                    formMessage.textContent = 'This class is already added as a prerequisite';
                    formMessage.style.color = 'red';
                    setTimeout(() => {
                        formMessage.textContent = '';
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
            console.error('Error fetching corequisites:', error);
            corequisitesSuggestions.innerHTML = `
                <div class="suggestion-item error">Error: ${error.message}</div>
            `;
        }
    }, 300);

    // Event listeners for prerequisites
    prerequisitesInput.addEventListener('input', fetchPrereqSuggestions);
    document.addEventListener('click', (e) => {
        if (!prerequisitesSuggestions.contains(e.target) && 
            e.target !== prerequisitesInput) {
            prerequisitesSuggestions.innerHTML = '';
        }
    });

    // Event listeners for corequisites
    corequisitesInput.addEventListener('input', fetchCoreqSuggestions);
    document.addEventListener('click', (e) => {
        if (!corequisitesSuggestions.contains(e.target) && 
            e.target !== corequisitesInput) {
            corequisitesSuggestions.innerHTML = '';
        }
    });

    // Form submission
    addClassForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const classNumberInput = document.getElementById('class-number').value.trim();
        const className = document.getElementById('class-name').value.trim();
        const credits = parseInt(document.getElementById('credits').value, 10);

        const semestersOffered = Array.from(
            document.querySelectorAll('input[name="semesters_offered"]:checked')
        ).map(input => input.value);

        const daysOffered = Array.from(
            document.querySelectorAll('input[name="days_offered"]:checked')
        ).map(input => input.value);

        const timesOfferedInput = document.getElementById('times-offered').value.trim();
        const times_offered = timesOfferedInput ? 
            timesOfferedInput.split(',').map(s => s.trim()) : [];

        if (!classNumberInput || !className || isNaN(credits) || credits < 1) {
            formMessage.textContent = 'Please provide valid inputs for required fields.';
            formMessage.style.color = 'red';
            return;
        }

        try {
            const payload = {
                class_number: classNumberInput,
                class_name: className,
                credits: credits,
                semesters_offered: semestersOffered,
                prerequisites: selectedPrerequisites.map(p => p.id),
                corequisites: selectedCorequisites.map(c => c.id),
                days_offered: daysOffered,
                times_offered: times_offered
            };

            let response, resultMessage;

            if (courseId && sectionId) {
                response = await fetch(
                    `/api/courses/${courseId}/sections/${sectionId}/classes`, 
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    }
                );
                resultMessage = 'Class added successfully to the section!';
            } else if (courseId) {
                response = await fetch(
                    `/api/courses/${courseId}/classes`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    }
                );
                resultMessage = 'Class added successfully to the course!';
            } else {
                response = await fetch(
                    '/api/classes',
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    }
                );
                resultMessage = 'Class added successfully!';
            }

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to add class');
            }

            const result = await response.json();
            formMessage.textContent = result.message || resultMessage;
            formMessage.style.color = 'green';
            
            addClassForm.reset();
            clearSelectedItems('prereq');
            clearSelectedItems('coreq');

            setTimeout(() => {
                if (courseId) {
                    window.location.href = `course_details.html?course_id=${courseId}`;
                } else {
                    window.location.href = 'search.html';
                }
            }, 1500);

        } catch (error) {
            console.error('Error:', error);
            formMessage.textContent = `Error: ${error.message}`;
            formMessage.style.color = 'red';
        }
    });
});