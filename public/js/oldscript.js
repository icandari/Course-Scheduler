// Global variables to store data
let allClassesData = []; // Will store ALL classes from the API
let basicCourses = []; // Lightweight course data for dropdowns

// Add missing englishCourses definition
let englishCourses = [
  { id: 5, course_name: "EIL Level 1" },
  { id: 6, course_name: "EIL Level 2" }
];

// Separate tracking for each menu's Holokai selections
let selectedHolokai = {
  major: null,
  minor1: null,
  minor2: null
};

// Add a separate object for the semester-based path
let selectedHolokaiSemester = {
  major: null,
  minor1: null,
  minor2: null
};

// View management functions
function showWelcomeScreen() {
  document.getElementById('welcome-screen').classList.remove('hidden');
  document.getElementById('credits-based-menu').classList.add('hidden');
  document.getElementById('semesters-based-menu').classList.add('hidden');
  
  // Hide the schedule when returning to welcome screen
  const scheduleContainer = document.getElementById('schedule-container');
  if (scheduleContainer) {
    scheduleContainer.classList.add('hidden');
    // Optionally clear the content
    scheduleContainer.innerHTML = '';
  }
  
  // Reset selections when going back to welcome screen
  selectedHolokai = {
    major: null,
    minor1: null,
    minor2: null
  };
  
  selectedHolokaiSemester = {
    major: null, 
    minor1: null,
    minor2: null
  };
}

function showCreditsBasedMenu() {
  document.getElementById('welcome-screen').classList.add('hidden');
  document.getElementById('credits-based-menu').classList.remove('hidden');
  document.getElementById('semesters-based-menu').classList.add('hidden');
  
  // Reset semester-based selections when switching to credits-based menu
  selectedHolokaiSemester = {
    major: null,
    minor1: null,
    minor2: null
  };
}

function showSemestersBasedMenu() {
  document.getElementById('welcome-screen').classList.add('hidden');
  document.getElementById('credits-based-menu').classList.add('hidden');
  document.getElementById('semesters-based-menu').classList.remove('hidden');
  
  // Reset credits-based selections when switching to semester-based menu
  selectedHolokai = {
    major: null,
    minor1: null,
    minor2: null
  };
}

// First year credits popup
function createCreditsPopup(target) {
  const checkbox = document.getElementById(target);
  const rect = checkbox.getBoundingClientRect();
  
  // Create popup
  const popup = document.createElement('div');
  popup.className = 'credits-popup simple-popup';
  popup.id = 'credits-popup';
  
  // Popup content
  popup.innerHTML = `
    <div class="popup-header">
      <h3 class="popup-title">First Year Credit Limits</h3>
      <button class="close-popup">&times;</button>
    </div>
    <div class="popup-content">
      <div class="input-group">
        <label for="first-year-fall-winter">Fall/Winter Credits:</label>
        <select id="first-year-fall-winter">
          <option value="12">12 Credits</option>
          <option value="13">13 Credits</option>
          <option value="14">14 Credits</option>
          <option value="15" selected>15 Credits</option>
          <option value="16">16 Credits</option>
          <option value="17">17 Credits</option>
          <option value="18">18 Credits</option>
        </select>
      </div>
      
      <div class="input-group">
        <label for="first-year-spring">Spring Credits:</label>
        <select id="first-year-spring">
          <option value="9">9 Credits</option>
          <option value="10" selected>10 Credits</option>
          <option value="11">11 Credits</option>
          <option value="12">12 Credits</option>
        </select>
      </div>
    </div>
    
    <div class="popup-buttons">
      <button id="save-credits">Save</button>
    </div>
  `;
  
  // Add to document
  document.body.appendChild(popup);
  
  // Position function to reuse for initial placement and window resize
  const positionPopup = () => {
    const updatedRect = checkbox.getBoundingClientRect();
    const topPosition = updatedRect.bottom + window.scrollY + 10;
    const leftPosition = updatedRect.left + window.scrollX;
    
    popup.style.position = 'absolute';
    popup.style.top = `${topPosition}px`;
    popup.style.left = `${leftPosition}px`;
    popup.style.transform = 'none';
  };
  
  // Initial positioning
  positionPopup();
  
  // Handle window resize
  const handleResize = () => {
    positionPopup();
  };
  
  window.addEventListener('resize', handleResize);
  
  // Handle close button click
  popup.querySelector('.close-popup').addEventListener('click', () => {
    popup.remove();
    window.removeEventListener('resize', handleResize);
  });
  
  // Handle click outside
  document.addEventListener('click', function closePopup(event) {
    if (!popup.contains(event.target) && event.target !== checkbox) {
      popup.remove();
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('click', closePopup);
    }
  });
  
  // Handle save button click
  popup.querySelector('#save-credits').addEventListener('click', () => {
    const fallWinterCredits = popup.querySelector('#first-year-fall-winter').value;
    const springCredits = popup.querySelector('#first-year-spring').value;
    
    // Store the selected values to use when generating the schedule
    sessionStorage.setItem('firstYearFallWinterCredits', fallWinterCredits);
    sessionStorage.setItem('firstYearSpringCredits', springCredits);
    
    popup.remove();
    window.removeEventListener('resize', handleResize);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // 1. Fetch basic course data for dropdowns
    const basicResponse = await fetch('/api/courses/basic');
    if (!basicResponse.ok) {
      throw new Error(`Error fetching basic courses: ${basicResponse.statusText}`);
    }
    basicCourses = await basicResponse.json();
    console.log("Fetched basic courses for dropdowns:", basicCourses);
    
    // Filter and sort majors and minors alphabetically
    const majors = basicCourses
      .filter(course => course.course_type && course.course_type.toLowerCase() === "major")
      .sort((a, b) => a.course_name.localeCompare(b.course_name));
    
    const minors = basicCourses
      .filter(course => course.course_type && course.course_type.toLowerCase() === "minor")
      .sort((a, b) => a.course_name.localeCompare(b.course_name));

    // Populate dropdowns
    populateAllDropdowns(majors, minors, basicCourses);
    
    // UPDATED: Fetch classes from the proper endpoint
    try {
      // Try fetching without parameters first
      const allClassesResponse = await fetch('/api/classes');
      if (!allClassesResponse.ok) {
        throw new Error(`Error fetching classes: ${allClassesResponse.statusText}`);
      }
      allClassesData = await allClassesResponse.json();
    } catch (classError) {
      console.warn("Error fetching from /api/classes, trying alternate endpoint", classError);
      
      // Alternative: If fetching all classes at once doesn't work, 
      // fetch them by course ID when needed
      allClassesData = [];
      console.log("Will fetch classes by course ID when needed");
    }
    
    console.log(`Loaded ${allClassesData.length} classes for scheduling`);
    
    // Create lookup maps if we have data
    if (allClassesData.length > 0) {
      createClassLookupMaps();
    }

    // When page loads, disable minor dropdowns and Generate Schedule button
    disableCustomDropdown("minor1Select");
    disableCustomDropdown("minor2Select");
    updateGenerateButtonState();
    
    // Setup view navigation
    document.getElementById('credits-path-btn').addEventListener('click', () => {
      showCreditsBasedMenu();
    });
    
    document.getElementById('semesters-path-btn').addEventListener('click', showSemestersBasedMenu);
    document.getElementById('credits-back-btn').addEventListener('click', showWelcomeScreen);
    document.getElementById('semesters-back-btn').addEventListener('click', showWelcomeScreen);
    
    // Setup credits limit checkboxes
    document.getElementById('limit-first-year-sem').addEventListener('change', function() {
      if (this.checked) {
        createCreditsPopup('limit-first-year-sem');
      }
    });
    
    // Add event listener for the credits-based menu checkbox
    document.getElementById('limit-first-year-credits').addEventListener('change', function() {
      if (this.checked) {
        createCreditsPopup('limit-first-year-credits');
      }
    });
    
    // Make sure we initially show the welcome screen
    showWelcomeScreen();
    
    // Set up the schedule generation buttons for both views
    document.getElementById('calculate-schedule').addEventListener('click', generateScheduleFromCredits);
    document.getElementById('calculate-schedule-sem').addEventListener('click', generateScheduleFromSemesters);
    
  } catch (error) {
    console.error("Error during initialization:", error);
  }
});

// Maps for fast lookups
let classesById = {};
let classesByCourseId = {};
let prerequisiteMap = {};
let corequisiteMap = {};

// Create lookup maps for faster access to class data
function createClassLookupMaps() {
  // Map classes by ID
  classesById = allClassesData.reduce((map, cls) => {
    if (cls.id) map[cls.id] = cls;
    return map;
  }, {});
  
  // Group classes by course_id (for filtering by selected courses)
  classesByCourseId = allClassesData.reduce((map, cls) => {
    if (cls.course_id) {
      if (!map[cls.course_id]) map[cls.course_id] = [];
      map[cls.course_id].push(cls);
    }
    return map;
  }, {});
  
  // Create prerequisite relationships map
  prerequisiteMap = {};
  allClassesData.forEach(cls => {
    if (cls.prerequisites && Array.isArray(cls.prerequisites) && cls.prerequisites.length > 0) {
      prerequisiteMap[cls.id] = cls.prerequisites.map(prereq => 
        typeof prereq === 'object' ? prereq.id || prereq.class_id : prereq
      );
    }
  });
  
  // Create corequisite relationships map
  corequisiteMap = {};
  allClassesData.forEach(cls => {
    if (cls.corequisites && Array.isArray(cls.corequisites) && cls.corequisites.length > 0) {
      corequisiteMap[cls.id] = cls.corequisites.map(coreq => 
        typeof coreq === 'object' ? coreq.id || coreq.class_id : coreq
      );
    }
  });
}

// Add this function to determine holokai type class
function getHolokaiClass(holokaiType) {
  if (!holokaiType) return 'no-holokai';
  
  const type = holokaiType.toLowerCase();
  if (type.includes('arts') || type.includes('humanities')) {
    return 'arts-humanities';
  } else if (type.includes('professional')) {
    return 'professional-studies';
  } else if (type.includes('math') || type.includes('sciences')) {
    return 'math-sciences';
  }
  return 'no-holokai';
}

// Modified function to create styled custom dropdowns instead of using regular selects
function populateDropdowns(majors, minors, courses) {
  // Save original data for refiltering later
  const originalMajors = [...majors];
  const originalMinors = [...minors];
  
  // Create custom dropdown for Major
  createCustomDropdown("majorSelect", "selectedMajor", majors, "Select a Major", option => {
    // Check if selection is incompatible with current minors
    const newMajorHolokai = option.dataset.holokai || null;
    let resetMinor1 = false;
    let resetMinor2 = false;
    
    // Check conflicts with existing minors
    if (selectedHolokai.minor1 && selectedHolokai.minor1 === newMajorHolokai) {
        console.log("Minor1 has same Holokai as newly selected Major");
        resetMinor1 = true;
    }
    
    if (selectedHolokai.minor2 && selectedHolokai.minor2 === newMajorHolokai) {
        console.log("Minor2 has same Holokai as newly selected Major");
        resetMinor2 = true;
    }
    
    // Update major Holokai
    document.getElementById("majorHolokai").textContent = newMajorHolokai || '';
    selectedHolokai.major = newMajorHolokai;
    
    // Enable/disable minor dropdowns based on major selection
    if (option.dataset.value) {
        enableCustomDropdown("minor1Select");
        enableCustomDropdown("minor2Select");
        
        // Only reset conflicting minors
        if (resetMinor1) {
            resetCustomDropdown("minor1Select", "selectedMinor1", "minor1Holokai");
            selectedHolokai.minor1 = null;
        }
        if (resetMinor2) {
            resetCustomDropdown("minor2Select", "selectedMinor2", "minor2Holokai");
            selectedHolokai.minor2 = null;
        }
    } else {
        // If major is deselected, disable and reset minor dropdowns
        disableCustomDropdown("minor1Select");
        disableCustomDropdown("minor2Select");
        resetCustomDropdown("minor1Select", "selectedMinor1", "minor1Holokai");
        resetCustomDropdown("minor2Select", "selectedMinor2", "minor2Holokai");
        selectedHolokai.minor1 = null;
        selectedHolokai.minor2 = null;
    }
    
    // Update minors with incompatible options
    updateCustomDropdownsWithIncompatible("minor1Select", "minor2Select", originalMinors);
    
    // Update Generate button state
    updateGenerateButtonState();
}, option => false); // Major has no incompatibility function
  
  // Modified minor1 selection handler
  createCustomDropdown("minor1Select", "selectedMinor1", minors, "Select Your First Minor", option => {
    if (option.classList.contains('incompatible')) {
        alert("This minor is from the same Holokai section as your major. Please choose a different Holokai section.");
        resetCustomDropdown("minor1Select", "selectedMinor1", "minor1Holokai");
        return;
    }
    
    const newMinor1Holokai = option.dataset.holokai || null;
    
    // Check if minor2 exists and has the same Holokai type as the new minor1
    if (selectedHolokai.minor2 && selectedHolokai.minor2 === newMinor1Holokai) {
        console.log("Minor2 has same Holokai as newly selected Minor1, resetting Minor2");
        resetCustomDropdown("minor2Select", "selectedMinor2", "minor2Holokai");
        selectedHolokai.minor2 = null;
    } else {
        console.log("Minor2 has different Holokai, keeping selection");
    }
    
    // Update UI and state for minor1
    document.getElementById("minor1Holokai").textContent = newMinor1Holokai || '';
    selectedHolokai.minor1 = newMinor1Holokai;
    
    // Always update minor2 dropdown to reflect the new incompatible options
    updateCustomDropdownWithIncompatible("minor2Select", originalMinors);
    
    // Update Generate button state
    updateGenerateButtonState();
  }, option => {
    return selectedHolokai.major && option.holokai === selectedHolokai.major;
  });
  
  // Modified minor2 selection handler 
  createCustomDropdown("minor2Select", "selectedMinor2", minors, "Select Your Second Minor", option => {
    if (option.classList.contains('incompatible')) {
        alert("This minor is from the same Holokai section as your major or first minor. Please choose a different Holokai section.");
        resetCustomDropdown("minor2Select", "selectedMinor2", "minor2Holokai");
        return;
    }
    
    const newMinor2Holokai = option.dataset.holokai || null;
    
    // Check if minor1 exists and has the same Holokai type as the new minor2
    if (selectedHolokai.minor1 && selectedHolokai.minor1 === newMinor2Holokai) {
        console.log("Minor1 has same Holokai as newly selected Minor2, resetting Minor1");
        resetCustomDropdown("minor1Select", "selectedMinor1", "minor1Holokai");
        selectedHolokai.minor1 = null;
        updateCustomDropdownWithIncompatible("minor1Select", originalMinors);
    } else {
        console.log("Minor1 has different Holokai, keeping selection");
    }
    
    // Update UI and state for minor2
    document.getElementById("minor2Holokai").textContent = newMinor2Holokai || '';
    selectedHolokai.minor2 = newMinor2Holokai;
    
    // Update Generate button state
    updateGenerateButtonState();
  }, option => {
    return (selectedHolokai.major && option.holokai === selectedHolokai.major) ||
           (selectedHolokai.minor1 && option.holokai === selectedHolokai.minor1);
  });
  
  // Populate English Level Dropdown 
  const englishLevelSelect = document.getElementById("english-level");
  if (englishLevelSelect) {
    englishLevelSelect.innerHTML = "";
    
    // Add the fluent option
    const fluentOption = document.createElement("option");
    fluentOption.value = "Fluent";
    fluentOption.textContent = "Fluent (No EIL Required)";
    englishLevelSelect.appendChild(fluentOption);
    
    // Add EIL course options
    englishCourses.forEach(course => {
      const option = document.createElement("option");
      option.value = course.course_name;
      option.textContent = course.course_name;
      englishLevelSelect.appendChild(option);
    });
  }
}

// Create a custom dropdown with colored dots and incompatible styling
function createCustomDropdown(selectId, hiddenInputId, options, placeholder, onSelect, isIncompatibleFn = null) {
  const originalSelect = document.getElementById(selectId);
  if (!originalSelect) return;
  
  // Clear any existing containers
  if (originalSelect.parentElement.classList.contains('custom-dropdown-container')) {
    originalSelect.parentElement.parentElement.replaceChild(originalSelect, originalSelect.parentElement);
  }
  
  // Create container
  const container = document.createElement('div');
  container.className = 'custom-dropdown-container';
  originalSelect.parentNode.insertBefore(container, originalSelect);
  container.appendChild(originalSelect);
  
  // Hide original select
  originalSelect.style.display = 'none';
  
  // Create custom dropdown elements
  const dropdownDisplay = document.createElement('div');
  dropdownDisplay.className = 'dropdown-display';
  dropdownDisplay.textContent = placeholder;
  
  const dropdownList = document.createElement('div');
  dropdownList.className = 'dropdown-list';
  dropdownList.style.display = 'none';
  
  // Add placeholder option
  const placeholderItem = document.createElement('div');
  placeholderItem.className = 'dropdown-item';
  placeholderItem.dataset.value = '';
  placeholderItem.textContent = placeholder;
  dropdownList.appendChild(placeholderItem);
  
  // Add options with colored dots
  options.forEach(opt => {
    const item = document.createElement('div');
    item.className = 'dropdown-item';
    item.dataset.value = opt.id;
    
    // Store holokai data
    if (opt.holokai) {
      item.dataset.holokai = opt.holokai;
    }
    
    // Check if incompatible
    const isIncompatible = isIncompatibleFn ? isIncompatibleFn(opt) : false;
    if (isIncompatible) {
      item.classList.add('incompatible');
    }
    
    // Create colored dot
    const holokaiClass = getHolokaiClass(opt.holokai);
    
    const dot = document.createElement('span');
    dot.className = `holokai-indicator ${holokaiClass}`;
    
    // Append dot and text
    item.appendChild(dot);
    item.appendChild(document.createTextNode(' ' + opt.course_name));
    
    dropdownList.appendChild(item);
  });
  
  // Add elements to DOM
  container.appendChild(dropdownDisplay);
  container.appendChild(dropdownList);
  
  // Add event listeners
  dropdownDisplay.addEventListener('click', (e) => {
    e.stopPropagation();
    
    // Check if dropdown is disabled
    if (dropdownDisplay.dataset.disabled === "true") {
      return; // Don't open if disabled
    }
    
    const isOpen = dropdownList.style.display === 'block';
    
    // Close all other dropdowns
    document.querySelectorAll('.dropdown-list').forEach(list => {
      list.style.display = 'none';
    });
    
    // Toggle this dropdown
    dropdownList.style.display = isOpen ? 'none' : 'block';
  });
  
  // Close dropdown when clicking outside
  document.addEventListener('click', () => {
    dropdownList.style.display = 'none';
  });
  
  dropdownList.addEventListener('click', (e) => {
    e.stopPropagation();
    // Skip if dropdown is disabled
    if (dropdownDisplay.dataset.disabled === "true") {
      return;
    }
    
    if (e.target.classList.contains('dropdown-item')) {
      const value = e.target.dataset.value;
      const text = e.target.textContent.trim();
      
      // Update display
      if (value) {
        const dot = e.target.querySelector('.holokai-indicator');
        if (dot) {
          const clonedDot = dot.cloneNode(true);
          dropdownDisplay.innerHTML = '';
          dropdownDisplay.appendChild(clonedDot);
          dropdownDisplay.appendChild(document.createTextNode(' ' + text));
        } else {
          dropdownDisplay.textContent = text;
        }
      } else {
        dropdownDisplay.textContent = placeholder;
      }
      
      // Update hidden input
      document.getElementById(hiddenInputId).value = value;
      
      // Call selection handler
      onSelect(e.target);
      
      // Enable minor dropdowns when major is selected
      if (selectId === "majorSelect" && value) {
        enableCustomDropdown("minor1Select");
        enableCustomDropdown("minor2Select");
      }
      
      // Update Generate button state
      updateGenerateButtonState();
      
      // Close dropdown
      dropdownList.style.display = 'none';
    }
  });
}

// Reset a custom dropdown to its initial state
function resetCustomDropdown(selectId, hiddenInputId, holokaiDisplayId) {
  const container = document.getElementById(selectId).parentElement;
  const display = container.querySelector('.dropdown-display');
  const placeholder = display.textContent.includes('Select') ? 
                      display.textContent : `Select Your ${selectId.replace('Select', '')}`;
  
  // Reset display text
  display.textContent = placeholder;
  
  // Reset hidden input
  document.getElementById(hiddenInputId).value = '';
  
  // Reset holokai display
  document.getElementById(holokaiDisplayId).textContent = '';
}

// Update custom dropdowns with incompatible options
function updateCustomDropdownsWithIncompatible(minor1Id, minor2Id, originalMinors, holokaiSource = null) {
  updateCustomDropdownWithIncompatible(minor1Id, originalMinors, holokaiSource);
  updateCustomDropdownWithIncompatible(minor2Id, originalMinors, holokaiSource);
}

// Update a single custom dropdown with incompatible options
function updateCustomDropdownWithIncompatible(selectId, originalMinors, holokaiSource = null) {
  const select = document.getElementById(selectId);
  if (!select) return;
  
  const container = select.parentElement;
  const list = container.querySelector('.dropdown-list');
  
  // Determine which holokai object to use
  const holokai = holokaiSource || 
                 (selectId.includes('-sem') ? selectedHolokaiSemester : selectedHolokai);
  
  // Clear existing items (except placeholder)
  while (list.children.length > 1) {
    list.removeChild(list.lastChild);
  }
  
  // Add options with proper incompatible styling
  originalMinors.forEach(minor => {
    const item = document.createElement('div');
    item.className = 'dropdown-item';
    item.dataset.value = minor.id;
    
    // Store holokai data
    if (minor.holokai) {
      item.dataset.holokai = minor.holokai;
    }
    
    // Check if incompatible
    let isIncompatible = false;
    
    if (selectId.includes("minor1")) {
      isIncompatible = holokai.major && minor.holokai === holokai.major;
    } else if (selectId.includes("minor2")) {
      isIncompatible = (holokai.major && minor.holokai === holokai.major) ||
                      (holokai.minor1 && minor.holokai === holokai.minor1);
    }
    
    if (isIncompatible) {
      item.classList.add('incompatible');
    }
    
    // Create colored dot
    const holokaiClass = getHolokaiClass(minor.holokai);
    
    const dot = document.createElement('span');
    dot.className = `holokai-indicator ${holokaiClass}`;
    
    // Append dot and text
    item.appendChild(dot);
    item.appendChild(document.createTextNode(' ' + minor.course_name));
    
    list.appendChild(item);
  });
}

// Main function to send user preferences to the AI scheduler
async function generateScheduleFromSelections(event) {
  event.preventDefault();
  console.log("Starting schedule generation with AI...");

  // Show loading indicator
  const generateButton = document.getElementById("calculate-schedule");
  generateButton.textContent = "Generating...";
  generateButton.disabled = true;

  try {
    // Get selected course IDs
    const selectedMajor = Number(document.getElementById("selectedMajor").value);
    const selectedMinor1 = Number(document.getElementById("selectedMinor1").value);
    const selectedMinor2 = Number(document.getElementById("selectedMinor2").value);
    const selectedCourseIds = [selectedMajor, selectedMinor1, selectedMinor2].filter(id => !isNaN(id));
    
    // Get other settings
    const englishLevel = document.getElementById("english-level").value;
    const startSemester = document.getElementById("start-semester").value;
    const majorClassLimit = parseInt(document.getElementById("major-class-limit").value, 10);
    const fallWinterCredits = parseInt(document.getElementById("fall-winter-credits").value, 10);
    const springCredits = parseInt(document.getElementById("spring-credits").value, 10);
    
    console.log("Sending user preferences to AI scheduler:", { 
      selectedCourseIds, 
      englishLevel, 
      startSemester,
      majorClassLimit,
      fallWinterCredits,
      springCredits
    });

    // Send preferences to new AI scheduler endpoint
    const response = await fetch('/api/generate-schedule', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        selectedCourses: selectedCourseIds,
        englishLevel: englishLevel,
        startSemester: startSemester,
        majorClassLimit: majorClassLimit,
        fallWinterCredits: fallWinterCredits,
        springCredits: springCredits
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("API error response:", errorText);
      throw new Error(`API returned status: ${response.status}`);
    }
    
    const result = await response.json();
    console.log("AI-generated schedule received:", result);
    
    // Render the returned schedule
    renderSchedule(result.schedule);

    // Add improvements explanation if available
    if (result.improvements && result.improvements.length > 0) {
      const improvementsContainer = document.createElement('div');
      improvementsContainer.className = 'improvements-container';
      improvementsContainer.innerHTML = '<h3>Schedule Insights</h3><ul>' +
        result.improvements.map(improvement => `<li>${improvement}</li>`).join('') +
        '</ul>';
        
      // Add to page after the schedule is rendered
      document.getElementById('schedule-container').appendChild(improvementsContainer);
    }

    // Add export button
    const scheduleJson = JSON.stringify(result.schedule, null, 2);
    const exportButton = document.createElement('button');
    exportButton.textContent = 'Export Schedule JSON';
    exportButton.className = 'export-button';
    exportButton.addEventListener('click', () => {
      const blob = new Blob([scheduleJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'schedule.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });

    // Add button after the schedule
    document.getElementById('schedule-container').appendChild(exportButton);

  } catch (error) {
    console.error("Error generating schedule:", error);
    alert("There was an error generating your schedule. Please try again.");
  } finally {
    // Reset button
    generateButton.textContent = "Generate Schedule";
    generateButton.disabled = false;
  }
}

// Render the schedule to the UI
function renderSchedule(schedule) {
    const scheduleContainer = document.getElementById('schedule-container');
    if (!scheduleContainer) return;
    
    // Remove the 'hidden' class and clear previous content
    scheduleContainer.classList.remove('hidden');
    scheduleContainer.innerHTML = '';

    // Create and add summary box
    const summaryBox = createSummaryBox(schedule);
    scheduleContainer.appendChild(summaryBox);

    // Create schedule display
    const scheduleTable = document.createElement('div');
    scheduleTable.className = 'schedule-table';

    // Add each semester
    schedule.forEach((semester) => {
        const semesterDiv = document.createElement('div');
        semesterDiv.className = 'semester-card';
        
        // Semester header
        const semesterHeader = document.createElement('div');
        semesterHeader.className = 'semester-header';
        // Use type and year from semester object
        semesterHeader.textContent = `${semester.type} ${semester.year}`;
        semesterDiv.appendChild(semesterHeader);
        
        // Semester classes
        const classesList = document.createElement('ul');
        classesList.className = 'classes-list';
        
        // Track displayed class numbers
        const displayedClassNumbers = new Set();
        
        semester.classes.forEach(cls => {
            // Skip duplicates
            if (displayedClassNumbers.has(cls.class_number)) {
                return;
            }
            displayedClassNumbers.add(cls.class_number);
            
            const classItem = document.createElement('li');
            classItem.className = 'class-item';
            
            // Add click handler for showing class details
            classItem.addEventListener('click', () => {
                showClassDetails(cls);
            });

            // Parse course type to handle combined types
            let courseType = cls.course_type || 'unknown';
            if (courseType.includes('/')) {
                // If course type contains a slash, use either part for styling
                courseType = courseType.split('/')[0]; // Use 'eil' from 'eil/holokai'
            }
            
            classItem.innerHTML = `
                <span class="class-tag ${courseType}">${courseType}</span>
                <span class="class-number">${cls.class_number}</span>
                <span class="class-name">${cls.class_name}</span>
                <span class="class-credits">${cls.credits || 3} cr</span>
            `;
            
            classesList.appendChild(classItem);
        });
        
        semesterDiv.appendChild(classesList);
        
        // Add semester credits
        const semesterCredits = semester.totalCredits || 
            semester.classes.reduce((sum, cls) => sum + (cls.credits || 3), 0);
        const creditsDiv = document.createElement('div');
        creditsDiv.className = 'semester-credits';
        creditsDiv.textContent = `Total: ${semesterCredits} credits`;
        semesterDiv.appendChild(creditsDiv);
        
        scheduleTable.appendChild(semesterDiv);
    });
    
    scheduleContainer.appendChild(scheduleTable);
}

// Helper function to create summary box
function createSummaryBox(schedule) {
    const summaryBox = document.createElement('div');
    summaryBox.className = 'summary-box';
    summaryBox.id = 'summary';
    
    // Calculate totals
    const totalCredits = schedule.reduce((sum, sem) => sum + (sem.totalCredits || 0), 0);
    const requiredCredits = 120;
    const electiveCreditsNeeded = Math.max(0, requiredCredits - totalCredits);
    const totalSemesters = schedule.length;
    const lastSemester = schedule[schedule.length - 1];
    const graduationDate = `${lastSemester.type} ${lastSemester.year}`;
    
    summaryBox.innerHTML = `
        <div class="summary-item animated-box" id="total-credits-box">
            <p>Total Credits Taken</p>
            <h2 id="total-credits">${totalCredits}</h2>
        </div>
        <div class="summary-item animated-box" id="electives-needed-box">
            <p>Elective Credits Needed</p>
            <h2 id="electives-needed">${electiveCreditsNeeded}</h2>
        </div>
        <div class="summary-item animated-box" id="total-semesters-box">
            <p>Total Semesters</p>
            <h2 id="total-semesters">${totalSemesters}</h2>
        </div>
        <div class="summary-item animated-box" id="graduation-date-box">
            <p>Graduation Date</p>
            <h2 id="graduation-date">${graduationDate}</h2>
        </div>
    `;
    
    return summaryBox;
}

// Add these functions for enabling/disabling custom dropdowns
function disableCustomDropdown(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;
  
  const container = select.parentElement;
  if (!container.classList.contains('custom-dropdown-container')) return;
  
  const display = container.querySelector('.dropdown-display');
  if (display) {
    display.classList.add('disabled');
    display.dataset.disabled = "true";
  }
}

function enableCustomDropdown(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;
  
  const container = select.parentElement;
  if (!container.classList.contains('custom-dropdown-container')) return;
  
  const display = container.querySelector('.dropdown-display');
  if (display) {
    display.classList.remove('disabled');
    display.dataset.disabled = "false";
  }
}

// Function to check if all Holokai sections are different and enable/disable Generate button
function updateGenerateButtonState(suffix = '') {
  const generateButton = document.getElementById(`calculate-schedule${suffix ? '-' + suffix : ''}`);
  if (!generateButton) return;
  
  // Use the appropriate object based on which menu we're in
  const holokai = suffix === 'sem' ? selectedHolokaiSemester : selectedHolokai;
  
  // Get selected holokai values
  const majorHolokai = holokai.major;
  const minor1Holokai = holokai.minor1;
  const minor2Holokai = holokai.minor2;
  
  // Check if all three sections are selected
  const majorSelected = !!document.getElementById(`selectedMajor${suffix ? '-' + suffix : ''}`).value;
  const minor1Selected = !!document.getElementById(`selectedMinor1${suffix ? '-' + suffix : ''}`).value;
  const minor2Selected = !!document.getElementById(`selectedMinor2${suffix ? '-' + suffix : ''}`).value;
  
  console.log(`Button check (${suffix}): Major: ${majorSelected}, Minor1: ${minor1Selected}, Minor2: ${minor2Selected}`);
  console.log(`Holokai values (${suffix}):`, majorHolokai, minor1Holokai, minor2Holokai);
  
  const allSelected = majorSelected && minor1Selected && minor2Selected;
  
  // If any are not selected, disable the button
  if (!allSelected) {
    console.log(`Not all selections made in menu ${suffix || 'credits'}`);
    generateButton.disabled = true;
    generateButton.classList.add("disabled");
    return;
  }
  
  // Check if we have three unique Holokai sections
  const uniqueHolokai = new Set([majorHolokai, minor1Holokai, minor2Holokai]);
  const hasThreeSections = uniqueHolokai.size === 3;
  
  console.log(`Unique Holokai sections (${suffix}): ${uniqueHolokai.size}`);
  
  // Enable/disable button based on whether we have three unique sections
  if (hasThreeSections) {
    console.log(`Enabling button for menu ${suffix || 'credits'}`);
    generateButton.disabled = false;
    generateButton.classList.remove("disabled");
  } else {
    console.log(`Not all unique Holokai sections in menu ${suffix || 'credits'}`);
    generateButton.disabled = true;
    generateButton.classList.add("disabled");
  }
}

// Modify the populateDropdowns function to handle both menus
function populateAllDropdowns(majors, minors, courses) {
  // Original credits-based dropdowns
  populateDropdowns(majors, minors, courses);
  
  // Populate semester-based dropdowns
  createCustomDropdown("majorSelect-sem", "selectedMajor-sem", majors, "Select a Major", option => {
    const newMajorHolokai = option.dataset.holokai || null;
    let resetMinor1 = false;
    let resetMinor2 = false;
    
    // Check conflicts with existing minors
    if (selectedHolokaiSemester.minor1 && selectedHolokaiSemester.minor1 === newMajorHolokai) {
        console.log("Minor1 has same Holokai as newly selected Major (semester)");
        resetMinor1 = true;
    }
    
    if (selectedHolokaiSemester.minor2 && selectedHolokaiSemester.minor2 === newMajorHolokai) {
        console.log("Minor2 has same Holokai as newly selected Major (semester)");
        resetMinor2 = true;
    }
    
    // Update major Holokai
    document.getElementById("majorHolokai-sem").textContent = newMajorHolokai || '';
    selectedHolokaiSemester.major = newMajorHolokai;
    
    if (option.dataset.value) {
        enableCustomDropdown("minor1Select-sem");
        enableCustomDropdown("minor2Select-sem");
        
        // Only reset conflicting minors
        if (resetMinor1) {
            resetCustomDropdown("minor1Select-sem", "selectedMinor1-sem", "minor1Holokai-sem");
            selectedHolokaiSemester.minor1 = null;
        }
        if (resetMinor2) {
            resetCustomDropdown("minor2Select-sem", "selectedMinor2-sem", "minor2Holokai-sem");
            selectedHolokaiSemester.minor2 = null;
        }
    } else {
        // If major is deselected, disable and reset minor dropdowns
        disableCustomDropdown("minor1Select-sem");
        disableCustomDropdown("minor2Select-sem");
        resetCustomDropdown("minor1Select-sem", "selectedMinor1-sem", "minor1Holokai-sem");
        resetCustomDropdown("minor2Select-sem", "selectedMinor2-sem", "minor2Holokai-sem");
        selectedHolokaiSemester.minor1 = null;
        selectedHolokaiSemester.minor2 = null;
    }
    
    // Pass selectedHolokaiSemester explicitly
    updateCustomDropdownsWithIncompatible("minor1Select-sem", "minor2Select-sem", minors, selectedHolokaiSemester);
    updateGenerateButtonState('sem');
}, option => false);
  
  // Add minor1 dropdown for semester-based menu
  createCustomDropdown("minor1Select-sem", "selectedMinor1-sem", minors, "Select Your First Minor", option => {
    if (option.classList.contains('incompatible')) {
        alert("This minor is from the same Holokai section as your major. Please choose a different Holokai section.");
        resetCustomDropdown("minor1Select-sem", "selectedMinor1-sem", "minor1Holokai-sem");
        return;
    }
    
    const newMinor1Holokai = option.dataset.holokai || null;
    
    // Check if minor2 exists and has the same Holokai type as the new minor1
    if (selectedHolokaiSemester.minor2 && selectedHolokaiSemester.minor2 === newMinor1Holokai) {
        console.log("Minor2 has same Holokai as newly selected Minor1, resetting Minor2");
        resetCustomDropdown("minor2Select-sem", "selectedMinor2-sem", "minor2Holokai-sem");
        selectedHolokaiSemester.minor2 = null;
    } else {
        console.log("Minor2 has different Holokai, keeping selection");
    }
    
    // Update UI and state for minor1
    document.getElementById("minor1Holokai-sem").textContent = newMinor1Holokai || '';
    selectedHolokaiSemester.minor1 = newMinor1Holokai;
    
    // Always update minor2 dropdown to reflect the new incompatible options
    updateCustomDropdownWithIncompatible("minor2Select-sem", minors, selectedHolokaiSemester);
    updateGenerateButtonState('sem');
  }, option => {
    // Use the semester-based Holokai object for incompatibility check
    return selectedHolokaiSemester.major && option.holokai === selectedHolokaiSemester.major;
  });
  
  // Add minor2 dropdown for semester-based menu
  createCustomDropdown("minor2Select-sem", "selectedMinor2-sem", minors, "Select Your Second Minor", option => {
    if (option.classList.contains('incompatible')) {
        alert("This minor is from the same Holokai section as your major or first minor. Please choose a different Holokai section.");
        resetCustomDropdown("minor2Select-sem", "selectedMinor2-sem", "minor2Holokai-sem");
        return;
    }
    
    const newMinor2Holokai = option.dataset.holokai || null;
    
    // Check if minor1 exists and has the same Holokai type as the new minor2
    if (selectedHolokaiSemester.minor1 && selectedHolokaiSemester.minor1 === newMinor2Holokai) {
        console.log("Minor1 has same Holokai as newly selected Minor2, resetting Minor1");
        resetCustomDropdown("minor1Select-sem", "selectedMinor1-sem", "minor1Holokai-sem");
        selectedHolokaiSemester.minor1 = null;
        // Pass selectedHolokaiSemester explicitly
        updateCustomDropdownWithIncompatible("minor1Select-sem", minors, selectedHolokaiSemester);
    } else {
        console.log("Minor1 has different Holokai, keeping selection");
    }
    
    // Update UI and state for minor2
    document.getElementById("minor2Holokai-sem").textContent = newMinor2Holokai || '';
    selectedHolokaiSemester.minor2 = newMinor2Holokai;
    
    // Update Generate button state
    updateGenerateButtonState('sem');
  }, option => {
    // Use the semester-based Holokai object for incompatibility check
    return (selectedHolokaiSemester.major && option.holokai === selectedHolokaiSemester.major) ||
           (selectedHolokaiSemester.minor1 && option.holokai === selectedHolokaiSemester.minor1);
  });
  
  // Populate English Level Dropdown for semester-based menu
  const englishLevelSelectSem = document.getElementById("english-level-sem");
  if (englishLevelSelectSem) {
    englishLevelSelectSem.innerHTML = "";
    
    // Add the fluent option
    const fluentOption = document.createElement("option");
    fluentOption.value = "Fluent";
    fluentOption.textContent = "Fluent (No EIL Required)";
    englishLevelSelectSem.appendChild(fluentOption);
    
    // Add EIL course options
    englishCourses.forEach(course => {
      const option = document.createElement("option");
      option.value = course.course_name;
      option.textContent = course.course_name;
      englishLevelSelectSem.appendChild(option);
    });
  }
}

// Function to generate schedule based on semester count
async function generateScheduleFromSemesters(event) {
  event.preventDefault();
  console.log("Generating schedule by number of semesters...");
  
  // Show loading indicator
  showLoadingIndicator();
  const generateButton = document.getElementById("calculate-schedule-sem");
  generateButton.textContent = "Generating...";
  generateButton.disabled = true;
  
  try {
    // Get selected values from the semesters-based form
    const selectedMajor = Number(document.getElementById("selectedMajor-sem").value);
    const selectedMinor1 = Number(document.getElementById("selectedMinor1-sem").value);
    const selectedMinor2 = Number(document.getElementById("selectedMinor2-sem").value);
    const englishLevel = document.getElementById("english-level-sem").value;
    
    // Fetch detailed course data
    const courseData = await fetchRequiredCourseData(
      selectedMajor, 
      selectedMinor1, 
      selectedMinor2, 
      englishLevel
    );
    
    // Get other settings
    const startSemester = document.getElementById("start-semester-sem").value;
    const targetSemesters = parseInt(document.getElementById("total-semesters").value);
    const majorClassLimit = parseInt(document.getElementById("major-class-limit-sem").value, 10); // ADD THIS LINE
    
    // Prepare preferences object
    const preferences = {
      startSemester,
      targetSemesters,
      majorClassLimit, // ADD THIS LINE
      approach: "semesters-based"
    };
    
    // Check if first year credits are limited
    const limitFirstYear = document.getElementById("limit-first-year-sem").checked;
    
    // Add first year limits if that option is checked
    if (limitFirstYear) {
      preferences.limitFirstYear = true;
      preferences.firstYearLimits = {
        fallWinterCredits: parseInt(sessionStorage.getItem('firstYearFallWinterCredits') || 15),
        springCredits: parseInt(sessionStorage.getItem('firstYearSpringCredits') || 10)
      };
    }
    
    // Prepare the complete data package for the AI scheduler
    const schedulerData = {
      courseData: courseData,
      preferences: preferences
    };
    
    console.log("Sending data to AI scheduler:", schedulerData);
  
    // Send request to generate schedule
    const response = await fetch('/api/generate-schedule', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(schedulerData)
    });
    
    // Debug: Log the raw response
    console.log("Response status:", response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("API error response:", errorText);
      throw new Error(`API returned status: ${response.status}`);
    }
    
    // Get the JSON data
    const result = await response.json();
    console.log("Schedule data received:", result);
    
    // Check if we have the expected data structure
    if (!result.schedule || !Array.isArray(result.schedule)) {
      console.error("Invalid schedule format:", result);
      alert("Received invalid schedule data. Check console for details.");
      hideLoadingIndicator();
      return;
    }
    
    // Make sure schedule container exists
    const scheduleContainer = document.getElementById('schedule-container');
    if (!scheduleContainer) {
      console.error("Schedule container not found in DOM!");
      alert("Cannot display schedule: container element not found.");
      hideLoadingIndicator();
      return;
    }
    
    console.log("About to render semester-based schedule with", result.schedule.length, "semesters");
    
    // Render the schedule
    renderSchedule(result.schedule);
    
    // Add metadata if available
    if (result.metadata) {
      const metadataContainer = document.createElement('div');
      metadataContainer.className = 'schedule-metadata';
      metadataContainer.innerHTML = `
        <h3>Schedule Quality: ${Math.round(result.metadata.score * 100)}%</h3>
        <div class="improvements">
          ${result.metadata.improvements.map(imp => `<p>• ${imp}</p>`).join('')}
        </div>
      `;
      scheduleContainer.appendChild(metadataContainer);
    }
    
  } catch (error) {
    console.error("Error generating schedule:", error);
    alert("There was an error generating your schedule. Please try again.");
  } finally {
    // Reset button and hide loading indicator
    generateButton.textContent = "Generate Schedule";
    generateButton.disabled = false;
    hideLoadingIndicator();
  }
}

// Function to generate schedule based on credits per semester
async function generateScheduleFromCredits() {
  try {
    showLoadingIndicator();
    
    const payload = await buildSchedulePayload();
    console.log("Sending payload:", payload);
    
    // Add timeout configuration
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    const response = await fetch('/api/generate-schedule', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("API error response:", errorText);
      
      // Handle specific error cases
      if (errorText.includes('timeout')) {
        throw new Error("Schedule generation is taking longer than expected. Please try again with fewer courses or simpler requirements.");
      } else if (response.status === 500) {
        throw new Error("The schedule generator is currently unavailable. Please try again in a few minutes.");
      }
      throw new Error(`Server error: ${response.status}`);
    }
    
    const result = await response.json();
    console.log("Schedule data received:", result);
    
    if (!result.schedule || !Array.isArray(result.schedule)) {
      console.error("Invalid schedule format:", result);
      alert("Received invalid schedule data. Check console for details.");
      return;
    }
    
    const scheduleContainer = document.getElementById('schedule-container');
    if (!scheduleContainer) {
      console.error("Schedule container not found in DOM!");
      alert("Cannot display schedule: container element not found.");
      return;
    }
    
    console.log("About to render schedule with", result.schedule.length, "semesters");
    
    // Render the schedule
    renderSchedule(result.schedule);
    
    // Add metadata if available
    if (result.metadata) {
      const metadataContainer = document.createElement('div');
      metadataContainer.className = 'schedule-metadata';
      metadataContainer.innerHTML = `
        <h3>Schedule Quality: ${Math.round(result.metadata.score * 100)}%</h3>
        <div class="improvements">
          ${result.metadata.improvements ? result.metadata.improvements.map(imp => `<p>• ${imp}</p>`).join('') : ''}
        </div>
      `;
      scheduleContainer.appendChild(metadataContainer);
    }
    
  } catch (error) {
    console.error("Error generating schedule:", error);
    alert("Failed to generate schedule: " + error.message);
  } finally {
    hideLoadingIndicator();
  }
}

/**
 * Fetches required course data for the AI scheduler, ensuring all prerequisites
 * and corequisites are included while excluding unnecessary fields like descriptions
 * @param {number} majorId - ID of selected major
 * @param {number} minor1Id - ID of first selected minor
 * @param {number} minor2Id - ID of second selected minor
 * @param {string} eilLevel - Selected EIL level
 * @returns {Promise<Array>} - Optimized course data array
 */
async function fetchRequiredCourseData(majorId, minor1Id, minor2Id, eilLevel) {
  try {
    const courseData = [];
    const includedClassIds = new Set();
    const requiredClassIds = new Set();
    // NEW: Track classes that belong to main courses vs. additional prereqs
    const mainCourseClassIds = new Set();

    // Helper function to fetch course data with better error handling
    const fetchCourse = async (id) => {
      try {
        const response = await fetch(`/api/courses/${id}?fields=essential`);
        if (!response.ok) {
          console.error(`API error for course ${id}: ${response.status}`);
          throw new Error(`Failed to fetch course ${id}`);
        }
        
        const courseData = await response.json();
        
        // Process each class to identify missing prerequisites/corequisites
        courseData.sections.forEach(section => {
          section.classes.forEach(classItem => {
            // Add this class ID to our included set
            includedClassIds.add(classItem.id);
            // NEW: Mark this class as part of a main course
            mainCourseClassIds.add(classItem.id);
            
            // Check prerequisites for classes we need to fetch later
            if (Array.isArray(classItem.prerequisites)) {
              classItem.prerequisites.forEach(prereq => {
                const prereqId = typeof prereq === 'object' ? prereq.id : prereq;
                if (prereqId && !includedClassIds.has(prereqId)) {
                  requiredClassIds.add(prereqId);
                }
              });
            }
            
            // Check corequisites for classes we need to fetch later
            if (Array.isArray(classItem.corequisites)) {
              classItem.corequisites.forEach(coreq => {
                const coreqId = typeof coreq === 'object' ? coreq.id : coreq;
                if (coreqId && !includedClassIds.has(coreqId)) {
                  requiredClassIds.add(coreqId);
                }
              });
            }
          });
        });
        
        return courseData;
      } catch (error) {
        console.error(`Error fetching course ${id}:`, error);
        throw error;
      }
    };

    // Fetch class by ID (for prerequisites/corequisites)
    const fetchClass = async (id) => {
      try {
        const response = await fetch(`/api/classes/${id}?fields=essential`);
        if (!response.ok) {
          console.error(`API error for class ${id}: ${response.status}`);
          throw new Error(`Failed to fetch class ${id}`);
        }
        return await response.json();
      } catch (error) {
        console.error(`Error fetching class ${id}:`, error);
        throw error;
      }
    };

    // Fetch major data if selected
    if (majorId) {
      const majorData = await fetchCourse(majorId);
      courseData.push(majorData);
    }
    
    // Fetch minor1 data if selected
    if (minor1Id) {
      const minor1Data = await fetchCourse(minor1Id);
      courseData.push(minor1Data);
    }
    
    // Fetch minor2 data if selected
    if (minor2Id) {
      const minor2Data = await fetchCourse(minor2Id);
      courseData.push(minor2Data);
    }
    
    // Always fetch religion data (ID 2)
    const religionData = await fetchCourse(2);
    courseData.push(religionData);
    
    // Handle EIL level options
    if (eilLevel) {
      if (eilLevel === "Fluent") {
        // Even for fluent students, fetch course with ID 7
        const fluentCourseData = await fetchCourse(7);
        courseData.push(fluentCourseData);
      } else {
        // Determine EIL ID based on the level
        const eilId = eilLevel.includes("Level 1") ? 5 : 6;
        const eilData = await fetchCourse(eilId);
        courseData.push(eilData);
      }
    }
    
    // Now fetch any missing prerequisite/corequisite classes
    // and add them to an additionalClasses array
    const additionalClasses = [];
    const processedIds = new Set([...includedClassIds]);
    
    // We'll process in waves to capture nested prerequisites
    while (requiredClassIds.size > 0) {
      const currentBatch = [...requiredClassIds];
      requiredClassIds.clear(); // Reset for next wave
      
      for (const classId of currentBatch) {
        // NEW: Skip if this class is already part of a main course
        if (!processedIds.has(classId) && !mainCourseClassIds.has(classId)) {
          processedIds.add(classId);
          
          try {
            const classData = await fetchClass(classId);
            additionalClasses.push(classData);
            
            // Check for nested prerequisites/corequisites
            if (Array.isArray(classData.prerequisites)) {
              classData.prerequisites.forEach(prereq => {
                const prereqId = typeof prereq === 'object' ? prereq.id : prereq;
                if (prereqId && !processedIds.has(prereqId) && !mainCourseClassIds.has(prereqId)) {
                  requiredClassIds.add(prereqId);
                }
              });
            }
            
            if (Array.isArray(classData.corequisites)) {
              classData.corequisites.forEach(coreq => {
                const coreqId = typeof coreq === 'object' ? coreq.id : coreq;
                if (coreqId && !processedIds.has(coreqId) && !mainCourseClassIds.has(coreqId)) {
                  requiredClassIds.add(coreqId);
                }
              });
            }
          } catch (error) {
            console.warn(`Could not fetch additional class ${classId}:`, error);
          }
        }
      }
    }
    
    // Add the additional classes to the payload only if there are any
    if (additionalClasses.length > 0) {
      courseData.push({
        id: 'additional',
        course_name: 'Additional Prerequisites/Corequisites',
        course_type: 'system',
        sections: [{
          id: 'additional-section',
          section_name: 'Required External Classes',
          classes: additionalClasses
        }]
      });
    }
    
    return courseData;
  } catch (error) {
    console.error("Critical error fetching course data:", error);
    throw error;
  }
}

/**
 * Development helper: Shows the JSON payload structure in the console
 */
function previewSchedulerPayload(type = 'credits') {
  const isCredits = type === 'credits';
  
  // Get values from the appropriate form
  const selectedMajor = Number(document.getElementById(isCredits ? "selectedMajor" : "selectedMajor-sem").value);
  const selectedMinor1 = Number(document.getElementById(isCredits ? "selectedMinor1" : "selectedMinor1-sem").value);
  const selectedMinor2 = Number(document.getElementById(isCredits ? "selectedMinor2" : "selectedMinor2-sem").value);
  const englishLevel = document.getElementById(isCredits ? "english-level" : "english-level-sem").value;
  
  // Get preferences
  let preferences = {};
  
  if (isCredits) {
    preferences = {
      startSemester: document.getElementById("start-semester").value,
      majorClassLimit: parseInt(document.getElementById("major-class-limit").value, 10),
      fallWinterCredits: parseInt(document.getElementById("fall-winter-credits").value, 10),
      springCredits: parseInt(document.getElementById("spring-credits").value, 10),
      limitFirstYear: document.getElementById("limit-first-year-credits").checked,
      approach: "credits-based"
    };
  } else {
    preferences = {
      startSemester: document.getElementById("start-semester-sem").value,
      targetSemesters: parseInt(document.getElementById("total-semesters").value),
      fallWinterCredits: document.getElementById("limit-first-year-sem").checked ? 15 : 18,
      springCredits: document.getElementById("limit-first-year-sem").checked ? 10 : 12,
      limitFirstYear: document.getElementById("limit-first-year-sem").checked,
      approach: "semesters-based"
    };
  }
  
  console.log(`Preview of ${type} payload:`, {
    majorId: selectedMajor,
    minor1Id: selectedMinor1, 
    minor2Id: selectedMinor2,
    eilLevel: englishLevel,
    preferences: preferences
  });
  
  console.log("The actual API call will include the full course data from the database");
}

// Add this code where you handle the response from the generate-schedule endpoint

async function generateScheduleFromCredits() {
  try {
    showLoadingIndicator();
    
    const payload = await buildSchedulePayload();
    console.log("Sending payload:", payload);
    
    // Add timeout configuration
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    const response = await fetch('/api/generate-schedule', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("API error response:", errorText);
      
      // Handle specific error cases
      if (errorText.includes('timeout')) {
        throw new Error("Schedule generation is taking longer than expected. Please try again with fewer courses or simpler requirements.");
      } else if (response.status === 500) {
        throw new Error("The schedule generator is currently unavailable. Please try again in a few minutes.");
      }
      throw new Error(`Server error: ${response.status}`);
    }
    
    const result = await response.json();
    console.log("Schedule data received:", result);
    
    if (!result.schedule || !Array.isArray(result.schedule)) {
      console.error("Invalid schedule format:", result);
      alert("Received invalid schedule data. Check console for details.");
      return;
    }
    
    const scheduleContainer = document.getElementById('schedule-container');
    if (!scheduleContainer) {
      console.error("Schedule container not found in DOM!");
      alert("Cannot display schedule: container element not found.");
      return;
    }
    
    console.log("About to render schedule with", result.schedule.length, "semesters");
    
    // Render the schedule
    renderSchedule(result.schedule);
    
    // Add metadata if available
    if (result.metadata) {
      const metadataContainer = document.createElement('div');
      metadataContainer.className = 'schedule-metadata';
      metadataContainer.innerHTML = `
        <h3>Schedule Quality: ${Math.round(result.metadata.score * 100)}%</h3>
        <div class="improvements">
          ${result.metadata.improvements ? result.metadata.improvements.map(imp => `<p>• ${imp}</p>`).join('') : ''}
        </div>
      `;
      scheduleContainer.appendChild(metadataContainer);
    }
    
  } catch (error) {
    console.error("Error generating schedule:", error);
    alert("Failed to generate schedule: " + error.message);
  } finally {
    hideLoadingIndicator();
  }
}

/**
 * Shows a loading indicator while the schedule is being generated
 */
function showLoadingIndicator() {
  // Check if we already have a loading indicator
  let loadingIndicator = document.getElementById('loading-indicator');
  
  if (!loadingIndicator) {
    // Create a new loading indicator
    loadingIndicator = document.createElement('div');
    loadingIndicator.id = 'loading-indicator';
    loadingIndicator.className = 'loading-indicator';
    loadingIndicator.innerHTML = `
      <div class="spinner"></div>
      <p>Generating your schedule...</p>
    `;
    document.body.appendChild(loadingIndicator);
  } else {
    // Show existing indicator
    loadingIndicator.classList.remove('hidden');
  }
}

/**
 * Hides the loading indicator when schedule generation is complete
 */
function hideLoadingIndicator() {
  const loadingIndicator = document.getElementById('loading-indicator');
  if (loadingIndicator) {
    loadingIndicator.classList.add('hidden');
  }
}

/**
 * Builds the schedule payload data for the API
 */
async function buildSchedulePayload() {
  // Get selected course IDs
  const selectedMajor = Number(document.getElementById("selectedMajor").value);
  const selectedMinor1 = Number(document.getElementById("selectedMinor1").value);
  const selectedMinor2 = Number(document.getElementById("selectedMinor2").value);
  const englishLevel = document.getElementById("english-level").value;
  
  // Fetch detailed course data
  const courseData = await fetchRequiredCourseData(
    selectedMajor, 
    selectedMinor1, 
    selectedMinor2, 
    englishLevel
  );
  
  // Get other settings
  const startSemester = document.getElementById("start-semester").value;
  const majorClassLimit = parseInt(document.getElementById("major-class-limit").value, 10);
  
  // Get regular semester credit limits
  const fallWinterCredits = parseInt(document.getElementById("fall-winter-credits").value, 10);
  const springCredits = parseInt(document.getElementById("spring-credits").value, 10);
  
  // Check if first year credits are limited
  const limitFirstYear = document.getElementById("limit-first-year-credits").checked;
  
  // Prepare preferences object
  const preferences = {
    startSemester,
    majorClassLimit,
    fallWinterCredits,
    springCredits,
    approach: "credits-based"
  };
  
  // Add first year limits if that option is checked
  if (limitFirstYear) {
    preferences.limitFirstYear = true;
    preferences.firstYearLimits = {
      fallWinterCredits: parseInt(sessionStorage.getItem('firstYearFallWinterCredits') || 15),
      springCredits: parseInt(sessionStorage.getItem('firstYearSpringCredits') || 10)
    };
  }
  
  // Prepare the complete data package for the AI scheduler
  return {
    courseData: courseData,
    preferences: preferences
  };
}

// Add this new function for showing class details
function showClassDetails(classData) {
    // Remove any existing popups
    const existingPopup = document.querySelector('.class-details-popup');
    const existingOverlay = document.querySelector('.popup-overlay');
    if (existingPopup) existingPopup.remove();
    if (existingOverlay) existingOverlay.remove();

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'popup-overlay';
    document.body.appendChild(overlay);

    // Create popup
    const popup = document.createElement('div');
    popup.className = 'class-details-popup';

    // Helper function to get class name from ID or object
    const getClassName = (item) => {
        if (typeof item === 'object') {
            return item.class_number || 'Unknown';
        }
        // If it's an ID, look it up in the classesById map
        return classesById[item]?.class_number || 'Unknown';
    };

    // Format prerequisites and corequisites with names
    const prerequisites = Array.isArray(classData.prerequisites) && classData.prerequisites.length > 0
        ? classData.prerequisites.map(p => getClassName(p)).join(', ')
        : 'None';
    
    const corequisites = Array.isArray(classData.corequisites) && classData.corequisites.length > 0
        ? classData.corequisites.map(c => getClassName(c)).join(', ')
        : 'None';

    popup.innerHTML = `
        <button class="close-button">&times;</button>
        <h2>${classData.class_number} - ${classData.class_name}</h2>
        
        <div class="details-section">
            <h3>Description</h3>
            <p>${classData.description || 'No description available.'}</p>
        </div>
        
        <div class="details-section">
            <h3>Credit Hours</h3>
            <p>${classData.credits || 3} credits</p>
        </div>
        
        <div class="details-section">
            <h3>Prerequisites</h3>
            <p>${prerequisites}</p>
        </div>
        
        <div class="details-section">
            <h3>Corequisites</h3>
            <p>${corequisites}</p>
        </div>
    `;

    // Add to document
    document.body.appendChild(popup);

    // Add close handlers
    const closePopup = () => {
        popup.remove();
        overlay.remove();
    };

    popup.querySelector('.close-button').addEventListener('click', closePopup);
    overlay.addEventListener('click', closePopup);

    // Stop click event from bubbling to overlay when clicking popup
    popup.addEventListener('click', (e) => {
        e.stopPropagation();
    });
}