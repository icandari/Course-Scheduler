// Global variables to store data
let allClassesData = []; // Will store ALL classes from the API
let basicCourses = []; // Lightweight course data for dropdowns

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
    populateDropdowns(majors, minors, basicCourses);
    
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
    
  } catch (error) {
    console.error("Error during initialization:", error);
  }

  // Set up the schedule generation button
  const generateButton = document.getElementById("calculate-schedule");
  if (generateButton) {
    generateButton.addEventListener('click', generateScheduleFromSelections);
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

// Populate dropdowns with majors, minors and English levels
function populateDropdowns(majors, minors, courses) {
  // Populate Major Dropdown
  const majorSelect = document.getElementById("majorSelect");
  if (majorSelect) {
    majorSelect.innerHTML = "<option value=''>Select a Major</option>";
    majors.forEach(major => {
      const option = document.createElement("option");
      option.value = major.id;
      option.textContent = major.course_name;
      majorSelect.appendChild(option);
      
      majorSelect.addEventListener('change', () => {
        document.getElementById("selectedMajor").value = majorSelect.value;
      });
    });
  }
  
  // Populate Minor 1 Dropdown
  const minor1Select = document.getElementById("minor1Select");
  if (minor1Select) {
    minor1Select.innerHTML = "<option value=''>Select Your First Minor</option>";
    minors.forEach(minor => {
      const option = document.createElement("option");
      option.value = minor.id;
      option.textContent = minor.course_name;
      minor1Select.appendChild(option);
      
      minor1Select.addEventListener('change', () => {
        document.getElementById("selectedMinor1").value = minor1Select.value;
      });
    });
  }
  
  // Populate Minor 2 Dropdown
  const minor2Select = document.getElementById("minor2Select");
  if (minor2Select) {
    minor2Select.innerHTML = "<option value=''>Select Your Second Minor</option>";
    minors.forEach(minor => {
      const option = document.createElement("option");
      option.value = minor.id;
      option.textContent = minor.course_name;
      minor2Select.appendChild(option);
      
      minor2Select.addEventListener('change', () => {
        document.getElementById("selectedMinor2").value = minor2Select.value;
      });
    });
  }
  
  // Populate English Level Dropdown
  const englishCourses = courses.filter(course =>
    course.course_type && course.course_type.toLowerCase() === "eil/holokai"
  );
  const englishLevelSelect = document.getElementById("english-level");
  if (englishLevelSelect) {
    englishLevelSelect.innerHTML = "";
    englishCourses.forEach(course => {
      const option = document.createElement("option");
      option.value = course.course_name;
      option.textContent = course.course_name;
      englishLevelSelect.appendChild(option);
    });
  }
}

// Main function to generate schedule from user selections - update to handle elective sections
async function generateScheduleFromSelections(event) {
  event.preventDefault();
  console.log("Starting schedule generation...");

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
    
    console.log("User selections:", { 
      selectedCourseIds, 
      englishLevel, 
      startSemester,
      majorClassLimit,
      fallWinterCredits,
      springCredits
    });

    // If we didn't load classes initially, fetch them now for selected courses
    if (allClassesData.length === 0) {
      console.log("Fetching classes for selected courses...");
      await fetchClassesForCourses(selectedCourseIds);
      
      // Add English course
      const englishCourse = basicCourses.find(course => course.course_name === englishLevel);
      if (englishCourse) {
        await fetchClassesForCourses([englishCourse.id]);
      }
      
      // Add religion courses
      const religionCourses = basicCourses.filter(course => 
        course.course_type && course.course_type.toLowerCase() === "religion"
      );
      const religionCourseIds = religionCourses.map(course => course.id);
      await fetchClassesForCourses(religionCourseIds);
      
      // Create lookup maps now that we have classes
      createClassLookupMaps();
    }

    // 1. Fetch course details for selected courses
    const courseDetails = await fetchCourseDetails(selectedCourseIds);
    
    // 2. Add English course to the selected courses
    const englishCourse = basicCourses.find(course => course.course_name === englishLevel);
    if (englishCourse) {
      const englishCourseDetails = await fetchCourseDetails([englishCourse.id]);
      courseDetails.push(...englishCourseDetails);
    }
    
    // 3. Add religion courses
    const religionCourses = basicCourses.filter(course => 
      course.course_type && course.course_type.toLowerCase() === "religion"
    );
    const religionCourseIds = religionCourses.map(course => course.id);
    const religionCourseDetails = await fetchCourseDetails(religionCourseIds);
    courseDetails.push(...religionCourseDetails);
    
    // 4. Filter classes for the selected courses (updated to return more info)
    const { allClasses, electiveSections } = getClassesForCourses(courseDetails);
    
    // 5. Process elective sections to select optimal classes
    const selectedElectives = selectOptimalElectives(electiveSections);
    
    // 6. Combine required classes with selected electives
    const requiredClasses = allClasses.filter(cls => cls.is_required);
    const classesToSchedule = [...requiredClasses, ...selectedElectives];
    
    // 7. Add required prerequisites and corequisites
    const allRequiredClasses = includePrerequisitesAndCorequisites(classesToSchedule);
    
    // 8. Generate the schedule (with religion prioritized earlier)
    const schedule = createSchedule(
      allRequiredClasses,
      startSemester,
      majorClassLimit,
      fallWinterCredits,
      springCredits
    );
    
    // 9. Display the schedule
    renderSchedule(schedule);
    
  } catch (error) {
    console.error("Error generating schedule:", error);
    alert("There was an error generating your schedule. Please try again.");
  } finally {
    // Reset button
    generateButton.textContent = "Generate Schedule";
    generateButton.disabled = false;
  }
}

// Fetch course details for the selected course IDs
async function fetchCourseDetails(courseIds) {
  if (!courseIds || courseIds.length === 0) return [];
  
  const courseDetailsPromises = courseIds.map(id => 
    fetch(`/api/courses/${id}`).then(res => {
      if (!res.ok) throw new Error(`Error fetching course ${id}: ${res.statusText}`);
      return res.json();
    })
  );
  
  return await Promise.all(courseDetailsPromises);
}

// New function to fetch classes for specific courses
async function fetchClassesForCourses(courseIds) {
  if (!courseIds || courseIds.length === 0) return;
  
  try {
    // Try course ID parameter approach
    for (const courseId of courseIds) {
      const response = await fetch(`/api/classes?course_id=${courseId}`);
      if (!response.ok) {
        console.warn(`Error fetching classes for course ${courseId}: ${response.statusText}`);
        continue;
      }
      
      const classes = await response.json();
      allClassesData.push(...classes);
      console.log(`Added ${classes.length} classes for course ID ${courseId}`);
    }
  } catch (error) {
    console.error("Error fetching classes by course ID:", error);
  }
}

// Extract classes from course details - updated to properly handle elective requirements
function getClassesForCourses(courseDetails) {
  const classes = [];
  const electiveSections = [];
  
  courseDetails.forEach(course => {
    const isMajor = course.course_type && course.course_type.toLowerCase() === "major";
    const category = getCourseCategory(course.course_type);
    
    // Handle direct classes array
    if (Array.isArray(course.classes)) {
      classes.push(...course.classes.map(cls => ({
        ...cls,
        isMajor,
        category,
        course_name: course.course_name,
        course_id: course.id,
        is_required: true,
        is_elective: false
      })));
    }
    // Handle sections containing classes
    else if (Array.isArray(course.sections)) {
      course.sections.forEach(section => {
        if (Array.isArray(section.classes)) {
          const isRequired = section.is_required === true;
          
          // Handle required sections - add all classes as required
          if (isRequired) {
            const sectionClasses = section.classes.map(cls => ({
              ...cls,
              isMajor,
              category,
              course_name: course.course_name,
              course_id: course.id,
              is_required_section: true,
              is_required: true,
              sectionId: section.id,
              sectionName: section.section_name || section.name || "Unnamed Section",
              credits_needed: section.credits_needed_to_take || 0,
              is_elective: false
            }));
            
            classes.push(...sectionClasses);
          } 
          // Handle elective sections - track but don't add all classes yet
          else if (section.credits_needed_to_take) {
            const sectionElectives = section.classes.map(cls => ({
              ...cls,
              isMajor,
              category,
              course_name: course.course_name,
              course_id: course.id,
              is_required_section: false,
              is_required: false,
              sectionId: section.id,
              sectionName: section.section_name || section.name || "Unnamed Section",
              credits_needed: section.credits_needed_to_take || 0,
              is_elective: true,
              elective_section: section.section_name || section.name || "Unnamed Section"
            }));
            
            // Store this section's info and classes
            electiveSections.push({
              sectionId: section.id,
              sectionName: section.section_name || section.name || "Unnamed Section",
              creditsNeeded: section.credits_needed_to_take || 0,
              courseId: course.id,
              courseName: course.course_name,
              category,
              isMajor,
              classes: sectionElectives
            });
            
            // Add all elective options to the classes array, but marked as electives
            classes.push(...sectionElectives);
          }
        }
      });
    }
  });
  
  // Return all classes with elective section data
  return {
    allClasses: classes,
    electiveSections: electiveSections
  };
}

// Helper function to determine course category
function getCourseCategory(courseType) {
  if (!courseType) return '';
  const type = courseType.toLowerCase();
  if (type === "major") return "major";
  if (type === "minor") return "minor";
  if (type === "religion") return "religion";
  if (type === "eil/holokai") return "english";
  return type;
}

// Include all prerequisites and corequisites
function includePrerequisitesAndCorequisites(classes) {
  // Create a map of selected classes by ID
  const selectedClassesById = classes.reduce((map, cls) => {
    if (cls.id) map[cls.id] = cls;
    return map;
  }, {});
  
  // Add prerequisites and their prerequisites recursively
  const allRequiredClassesById = {...selectedClassesById};
  let newClassesFound = true;
  
  while (newClassesFound) {
    newClassesFound = false;
    
    // Check each class for prerequisites
    Object.values(allRequiredClassesById).forEach(cls => {
      if (cls.prerequisites && Array.isArray(cls.prerequisites)) {
        cls.prerequisites.forEach(prereq => {
          // Extract ID and ensure it's an integer
          let id;
          if (typeof prereq === 'object') {
            id = prereq.id || prereq.class_id;
          } else if (prereq !== null && prereq !== undefined) {
            id = parseInt(prereq, 10);
          }
          
          // Only proceed if ID is a valid number
          if (!isNaN(id) && id > 0 && !allRequiredClassesById[id] && classesById[id]) {
            // Add the prerequisite class with inherited properties
            allRequiredClassesById[id] = {
              ...classesById[id],
              isMajor: cls.isMajor || false,
              category: cls.category || 'prerequisite',
              is_required: true,
              is_prerequisite_for: cls.id
            };
            newClassesFound = true;
          }
        });
      }
      
      // Check for corequisites
      if (cls.corequisites && Array.isArray(cls.corequisites)) {
        cls.corequisites.forEach(coreq => {
          // Extract ID and ensure it's an integer
          let id;
          if (typeof coreq === 'object') {
            id = coreq.id || coreq.class_id;
          } else if (coreq !== null && coreq !== undefined) {
            id = parseInt(coreq, 10);
          }
          
          // Only proceed if ID is a valid number
          if (!isNaN(id) && id > 0 && !allRequiredClassesById[id] && classesById[id]) {
            // Add the corequisite class with inherited properties
            allRequiredClassesById[id] = {
              ...classesById[id],
              isMajor: cls.isMajor || false,
              category: cls.category || 'corequisite',
              is_required: true,
              is_corequisite_for: cls.id
            };
            newClassesFound = true;
          }
        });
      }
    });
  }
  
  return Object.values(allRequiredClassesById);
}

// Improved createSchedule function to prioritize religion classes and finish faster
function createSchedule(classes, startSemester, majorClassLimit, fallWinterCredits, springCredits) {
  // Sort classes by prerequisites
  const sortedClasses = sortClassesByPrerequisites(classes);
  
  const semesters = [];
  let currentSemester = startSemester;
  let remainingClasses = [...sortedClasses];
  
  // Maximum semesters to prevent infinite loops
  const MAX_SEMESTERS = 15;
  
  // Identify special classes for scheduling rules
  const religionClasses = remainingClasses.filter(cls => cls.category === 'religion');
  const eilClasses = remainingClasses.filter(cls => 
    cls.category === 'english' || 
    (cls.course_type && cls.course_type.toLowerCase().includes('eil'))
  );
  
  // Check for EIL 320 specifically
  const eil320Class = eilClasses.find(cls => 
    cls.class_number === "EIL 320" || 
    (cls.class_name && cls.class_name.includes("Academic English II"))
  );
  
  const otherEILClasses = eilClasses.filter(cls => 
    cls.class_number !== "EIL 320" && 
    (!cls.class_name || !cls.class_name.includes("Academic English II"))
  );
  
  // Keep track of semester counts
  let currentSemesterIndex = 0;
  
  while (remainingClasses.length > 0 && currentSemesterIndex < MAX_SEMESTERS) {
    // Check if we can finish the program early
    if (remainingClasses.length === 0) break;
    
    const semesterType = getSemesterType(currentSemester);
    const creditLimit = semesterType === 'Spring' ? springCredits : fallWinterCredits;
    
    // Track completed classes for prerequisite verification
    const completedClasses = semesters.flatMap(sem => sem.classes);
    
    // Determine priority classes for this semester
    const priorityClasses = [];
    
    // UPDATED: Prioritize only ONE religion class per semester
    const availableReligionClasses = religionClasses.filter(cls => 
      remainingClasses.includes(cls) &&
      // Check if prerequisites are met
      (!cls.prerequisites || !Array.isArray(cls.prerequisites) || cls.prerequisites.length === 0 ||
        cls.prerequisites.every(prereq => {
          const prereqId = typeof prereq === 'object' ? prereq.id || prereq.class_id : prereq;
          return !prereqId || completedClasses.some(c => c.id === prereqId);
        })
      )
    );
    
    // Add only one religion class as priority
    if (availableReligionClasses.length > 0) {
      priorityClasses.push(availableReligionClasses[0]);
    }
    
    // EIL class scheduling logic
    if (currentSemesterIndex === 0) {
      // Prioritize first EIL class in first semester
      otherEILClasses.forEach(cls => {
        if (remainingClasses.includes(cls)) {
          priorityClasses.push(cls);
        }
      });
    } else if (currentSemesterIndex === 1) {
      // Add next EIL class in second semester
      const remaining = otherEILClasses.filter(cls => remainingClasses.includes(cls));
      if (remaining.length > 0) {
        priorityClasses.push(remaining[0]);
      }
    } else if (currentSemesterIndex === 2) {
      // Prioritize EIL 320 in third semester
      if (eil320Class && remainingClasses.includes(eil320Class)) {
        priorityClasses.push(eil320Class);
      }
    }
    
    // Select classes for this semester
    const classesForSemester = selectClassesForSemester(
      remainingClasses,
      semesters,
      creditLimit,
      majorClassLimit,
      priorityClasses
    );
    
    // No classes could be scheduled this semester - avoid infinite loop
    if (classesForSemester.length === 0) {
      console.warn(`No classes could be scheduled for ${currentSemester}. Exiting scheduling loop.`);
      break;
    }
    
    // Add semester to schedule
    semesters.push({
      name: currentSemester,
      type: semesterType,
      classes: classesForSemester,
      hasReligion: classesForSemester.some(cls => cls.category === 'religion')
    });
    
    // Remove scheduled classes from remaining
    remainingClasses = remainingClasses.filter(cls => !classesForSemester.includes(cls));
    
    // Advance to next semester
    currentSemester = getNextSemester(currentSemester);
    currentSemesterIndex++;
  }
  
  return semesters;
}

// Improved selectClassesForSemester to keep corequisites together
function selectClassesForSemester(
  availableClasses, 
  completedSemesters, 
  creditLimit, 
  majorClassLimit,
  priorityClasses = []
) {
  // Get already completed classes
  const completedClasses = completedSemesters.flatMap(sem => sem.classes);
  const completedClassIds = completedClasses.map(cls => cls.id);
  
  // Filter eligible classes (prerequisites satisfied)
  const eligibleClasses = availableClasses.filter(cls => {
    // Check if prerequisites are met
    if (cls.prerequisites && Array.isArray(cls.prerequisites) && cls.prerequisites.length > 0) {
      return cls.prerequisites.every(prereq => {
        // Extract ID and ensure it's an integer
        let prereqId;
        if (typeof prereq === 'object') {
          prereqId = prereq.id || prereq.class_id;
        } else if (prereq !== null && prereq !== undefined) {
          prereqId = parseInt(prereq, 10);
        }
        
        // Check if prerequisite is completed
        return isNaN(prereqId) || completedClassIds.includes(prereqId);
      });
    }
    return true;
  });
  
  // Build a corequisite lookup map for quick access
  const coreqLookup = new Map();
  
  // Identify all corequisite relationships
  eligibleClasses.forEach(cls => {
    if (cls.corequisites && Array.isArray(cls.corequisites) && cls.corequisites.length > 0) {
      const coreqIds = cls.corequisites
        .map(coreq => typeof coreq === 'object' ? coreq.id || coreq.class_id : parseInt(coreq, 10))
        .filter(id => !isNaN(id) && id > 0);
      
      if (coreqIds.length > 0) {
        coreqLookup.set(cls.id, coreqIds);
      }
    }
    
    // Also check is_corequisite_for relationship
    if (cls.is_corequisite_for) {
      const parentId = parseInt(cls.is_corequisite_for, 10);
      if (!isNaN(parentId) && parentId > 0) {
        if (!coreqLookup.has(parentId)) {
          coreqLookup.set(parentId, []);
        }
        coreqLookup.get(parentId).push(cls.id);
      }
    }
  });
  
  const selectedClasses = [];
  let currentCredits = 0;
  let majorClassesCount = 0;
  let religionClassesCount = 0;
  
  // Helper function to check if all corequisites for a class are eligible
  function areCorequisitesEligible(classId) {
    if (!coreqLookup.has(classId)) return true;
    
    const coreqIds = coreqLookup.get(classId);
    return coreqIds.every(coreqId => 
      eligibleClasses.some(c => c.id === coreqId) && 
      !selectedClasses.some(c => c.id === coreqId)
    );
  }
  
  // Helper function to add a class with all its corequisites
  function addClass(cls) {
    // First check if we have room for this class and all its corequisites
    const coreqsToAdd = getRequiredCorequisites(cls, eligibleClasses, selectedClasses);
    const totalCredits = (cls.credits || 3) + coreqsToAdd.reduce((sum, c) => sum + (c.credits || 3), 0);
    
    if (currentCredits + totalCredits <= creditLimit) {
      // Add the main class
      selectedClasses.push(cls);
      
      // Add all its corequisites
      selectedClasses.push(...coreqsToAdd);
      
      // Update credits
      currentCredits += totalCredits;
      
      // Update counters
      if (cls.isMajor) majorClassesCount++;
      if (cls.category === 'religion') religionClassesCount++;
      
      // Update counters for corequisites
      coreqsToAdd.forEach(coreq => {
        if (coreq.isMajor) majorClassesCount++;
        if (coreq.category === 'religion') religionClassesCount++;
      });
      
      return true;
    }
    
    return false;
  }
  
  // Process priority classes first
  // First religion priority classes
  const religionPriorityClasses = priorityClasses.filter(cls => 
    cls.category === 'religion' && 
    eligibleClasses.includes(cls) && 
    !selectedClasses.includes(cls) &&
    areCorequisitesEligible(cls.id)
  );
  
  // Take only one religion class
  if (religionPriorityClasses.length > 0 && religionClassesCount < 1) {
    addClass(religionPriorityClasses[0]);
  }
  
  // Then other priority classes
  const otherPriorityClasses = priorityClasses.filter(cls => 
    cls.category !== 'religion' && 
    eligibleClasses.includes(cls) && 
    !selectedClasses.includes(cls) &&
    areCorequisitesEligible(cls.id)
  );
  
  for (const cls of otherPriorityClasses) {
    // Skip if we've hit limits
    if (cls.category === 'religion' && religionClassesCount >= 1) continue;
    if (cls.isMajor && majorClassesCount >= majorClassLimit) continue;
    
    addClass(cls);
    
    // Stop if we've hit credit limit
    if (currentCredits >= creditLimit) break;
  }
  
  // Next, select regular classes - prioritizing those with corequisites
  const remainingEligibleClasses = eligibleClasses.filter(cls => 
    !selectedClasses.includes(cls)
  );
  
  // Sort classes - prioritizing classes with corequisites to keep them together
  remainingEligibleClasses.sort((a, b) => {
    // First prioritize classes with corequisites
    const aHasCoreqs = coreqLookup.has(a.id) && coreqLookup.get(a.id).length > 0;
    const bHasCoreqs = coreqLookup.has(b.id) && coreqLookup.get(b.id).length > 0;
    
    if (aHasCoreqs !== bHasCoreqs) {
      return aHasCoreqs ? -1 : 1; // Classes with corequisites first
    }
    
    // Then prioritize classes marked as is_elective and is_required (explicitly selected electives)
    if (a.is_elective && a.is_required && !(b.is_elective && b.is_required)) return -1;
    if (b.is_elective && b.is_required && !(a.is_elective && a.is_required)) return 1;
    
    // Then religion classes
    if ((a.category === 'religion') !== (b.category === 'religion')) {
      return a.category === 'religion' ? -1 : 1;
    }
    
    // Then by required flag
    if (a.is_required !== b.is_required) {
      return a.is_required ? -1 : 1;
    }
    
    // Then by major vs minor
    if (a.isMajor !== b.isMajor) {
      return a.isMajor ? -1 : 1;
    }
    
    // Rest of sorting remains the same...
    const prereqsA = (a.prerequisites && Array.isArray(a.prerequisites)) ? a.prerequisites.length : 0;
    const prereqsB = (b.prerequisites && Array.isArray(b.prerequisites)) ? b.prerequisites.length : 0;
    if (prereqsA !== prereqsB) {
      return prereqsB - prereqsA; // More prerequisites first
    }
    
    // Then by class level
    const levelA = a.class_number ? parseInt(a.class_number.match(/\d+/)?.[0] || '0', 10) : 0;
    const levelB = b.class_number ? parseInt(b.class_number.match(/\d+/)?.[0] || '0', 10) : 0;
    
    return levelA - levelB; // Lower levels first
  });
  
  // Process remaining classes
  for (const cls of remainingEligibleClasses) {
    // Skip if we can't schedule all corequisites together
    if (!areCorequisitesEligible(cls.id)) continue;
    
    // Skip if we've hit limits (except for corequisites)
    if (cls.category === 'religion' && religionClassesCount >= 1) continue;
    if (cls.isMajor && majorClassesCount >= majorClassLimit) continue;
    
    // Try to add the class with its corequisites
    addClass(cls);
    
    // Stop if we've hit the credit limit
    if (currentCredits >= creditLimit) break;
  }
  
  return selectedClasses;
}

// Updated getRequiredCorequisites function

function getRequiredCorequisites(cls, eligibleClasses, alreadySelectedClasses) {
  const coreqsToAdd = [];
  
  if (cls.corequisites && Array.isArray(cls.corequisites) && cls.corequisites.length > 0) {
    cls.corequisites.forEach(coreq => {
      // Extract ID and ensure it's an integer
      let id;
      if (typeof coreq === 'object') {
        id = coreq.id || coreq.class_id;
      } else if (coreq !== null && coreq !== undefined) {
        id = parseInt(coreq, 10);
      }
      
      // Only proceed if ID is a valid number
      if (!isNaN(id) && id > 0) {
        // Find the corequisite in eligible classes
        const coreqClass = eligibleClasses.find(c => c.id === id);
        
        // Add if eligible and not already selected
        if (coreqClass && !alreadySelectedClasses.includes(coreqClass) && !coreqsToAdd.includes(coreqClass)) {
          coreqsToAdd.push(coreqClass);
        }
      }
    });
  }
  
  return coreqsToAdd;
}

// Sort classes based on prerequisites depth
function sortClassesByPrerequisites(classes) {
  // Create prerequisite hierarchy map
  const depthMap = {};
  const classesById = {};
  
  // Build class lookup table
  classes.forEach(cls => {
    if (cls.id) classesById[cls.id] = cls;
  });
  
  // Calculate depth recursively
  function calculateDepth(classId, visited = new Set()) {
    // If already calculated, return cached value
    if (depthMap[classId] !== undefined) return depthMap[classId];
    
    // Detect cycles
    if (visited.has(classId)) {
      console.warn(`Circular prerequisite dependency for class ${classId}`);
      return 0;
    }
    
    const cls = classesById[classId];
    if (!cls) return 0;
    
    // No prerequisites = base case
    if (!cls.prerequisites || !Array.isArray(cls.prerequisites) || cls.prerequisites.length === 0) {
      depthMap[classId] = 0;
      return 0;
    }
    
    // Mark as visited to detect cycles
    visited.add(classId);
    
    // Calculate max depth of prerequisites
    let maxDepth = -1;
    cls.prerequisites.forEach(prereqId => {
      const id = typeof prereqId === 'object' ? prereqId.id || prereqId.class_id : prereqId;
      if (id) {
        const depth = calculateDepth(id, new Set(visited));
        maxDepth = Math.max(maxDepth, depth);
      }
    });
    
    // Cache and return result
    depthMap[classId] = maxDepth + 1;
    return depthMap[classId];
  }
  
  // Calculate depth for all classes
  classes.forEach(cls => {
    if (cls.id && depthMap[cls.id] === undefined) {
      calculateDepth(cls.id);
    }
  });
  
  // Sort based on depth
  return [...classes].sort((a, b) => {
    const depthA = depthMap[a.id] || 0;
    const depthB = depthMap[b.id] || 0;
    return depthA - depthB;
  });
}

// Get the type of semester (Fall, Winter, Spring)
function getSemesterType(semesterName) {
  if (semesterName.includes('Fall')) return 'Fall';
  if (semesterName.includes('Winter')) return 'Winter';
  if (semesterName.includes('Spring')) return 'Spring';
  return 'Unknown';
}

// Get the next semester in sequence
function getNextSemester(currentSemester) {
  const parts = currentSemester.split(' ');
  const currentType = parts[0];
  let year = parseInt(parts[1], 10);
  
  switch(currentType) {
    case 'Fall':
      return `Winter ${year + 1}`;
    case 'Winter':
      return `Spring ${year}`;
    case 'Spring':
      return `Fall ${year}`;
    default:
      return `Fall ${year}`;
  }
}

// Render the schedule to the UI
function renderSchedule(schedule) {
  const scheduleContainer = document.getElementById('schedule-container');
  if (!scheduleContainer) return;
  
  // Remove the 'hidden' class to make the schedule visible
  scheduleContainer.classList.remove('hidden');
  
  // Clear previous schedule
  scheduleContainer.innerHTML = '';
  
  if (schedule.length === 0) {
    scheduleContainer.innerHTML = '<div class="empty-schedule">No classes to schedule. Please select a major or minor.</div>';
    return;
  }
  
  // Create the summary boxes
  const summaryBox = document.createElement('div');
  summaryBox.className = 'summary-box';
  summaryBox.id = 'summary';
  
  // Calculate total credits
  const totalCredits = schedule.reduce((sum, semester) => {
    return sum + semester.classes.reduce((semSum, cls) => semSum + (cls.credits || 3), 0);
  }, 0);
  
  // Get graduation date (last semester)
  const graduationSemester = schedule[schedule.length - 1].name;
  
  // Calculate elective credits (assuming 120 credits are needed to graduate)
  const requiredCredits = 120;
  const electiveCreditsNeeded = Math.max(0, requiredCredits - totalCredits);
  
  // Calculate total semesters
  const totalSemesters = schedule.length;
  
  // Create summary items
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
      <h2 id="graduation-date">${graduationSemester}</h2>
    </div>
  `;
  
  // Add summary box to the container
  scheduleContainer.appendChild(summaryBox);
  
  // Create schedule display
  const scheduleTable = document.createElement('div');
  scheduleTable.className = 'schedule-table';
  
  // Add each semester
  schedule.forEach(semester => {
    const semesterDiv = document.createElement('div');
    semesterDiv.className = 'semester-card';
    
    // Semester header
    const semesterHeader = document.createElement('div');
    semesterHeader.className = 'semester-header';
    semesterHeader.textContent = semester.name;
    semesterDiv.appendChild(semesterHeader);
    
    // Semester classes
    const classesList = document.createElement('ul');
    classesList.className = 'classes-list';
    
    semester.classes.forEach(cls => {
      const classItem = document.createElement('li');
      classItem.className = 'class-item';
      
      // Class type indicator (major, minor, etc)
      const categoryTag = cls.isMajor ? 'major' : 
                          (cls.category === 'english' ? 'english' :
                          (cls.category === 'religion' ? 'religion' : 'minor'));
      
      classItem.innerHTML = `
        <span class="class-tag ${categoryTag}">${categoryTag.charAt(0).toUpperCase() + categoryTag.slice(1)}</span>
        <span class="class-number">${cls.class_number || ''}</span>
        <span class="class-name">${cls.class_name}</span>
        <span class="class-credits">${cls.credits || 3} cr</span>
      `;
      
      classesList.appendChild(classItem);
    });
    
    semesterDiv.appendChild(classesList);
    
    // Add semester credits
    const semesterCredits = semester.classes.reduce((sum, cls) => sum + (cls.credits || 3), 0);
    const creditsDiv = document.createElement('div');
    creditsDiv.className = 'semester-credits';
    creditsDiv.textContent = `Total: ${semesterCredits} credits`;
    semesterDiv.appendChild(creditsDiv);
    
    scheduleTable.appendChild(semesterDiv);
  });
  
  scheduleContainer.appendChild(scheduleTable);
}

// New function to select the optimal electives from each section
function selectOptimalElectives(electiveSections) {
  const selectedElectives = [];
  
  // For each elective section, select classes until we meet the credit requirement
  electiveSections.forEach(section => {
    const { classes, creditsNeeded } = section;
    if (!classes || classes.length === 0 || creditsNeeded <= 0) return;
    
    // Sort classes by criteria to find optimal ones:
    // 1. Prefer classes with fewer prerequisites
    // 2. Prefer lower-level classes first
    const sortedClasses = [...classes].sort((a, b) => {
      // Sort by prerequisite count
      const prereqsA = (a.prerequisites && Array.isArray(a.prerequisites)) ? a.prerequisites.length : 0;
      const prereqsB = (b.prerequisites && Array.isArray(b.prerequisites)) ? b.prerequisites.length : 0;
      
      if (prereqsA !== prereqsB) {
        return prereqsA - prereqsB; // Fewer prerequisites first
      }
      
      // Then by class level
      const levelA = a.class_number ? parseInt(a.class_number.match(/\d+/)?.[0] || '999', 10) : 999;
      const levelB = b.class_number ? parseInt(b.class_number.match(/\d+/)?.[0] || '999', 10) : 999;
      return levelA - levelB; // Lower levels first
    });
    
    // Select classes until we meet the credit requirement
    let creditsSelected = 0;
    for (const cls of sortedClasses) {
      if (creditsSelected >= creditsNeeded) break;
      
      // For each class, calculate total credits including corequisites
      const classCredits = cls.credits || 3;
      
      // Find all corequisite classes and their credits
      const corequisiteClasses = [];
      const corequisiteCredits = (cls.corequisites || []).reduce((sum, coreqId) => {
        // Find the corequisite in allClassesData
        const coreqIdValue = typeof coreqId === 'object' ? coreqId.id || coreqId.class_id : coreqId;
        const coreq = allClassesData.find(c => c.id === coreqIdValue);
        
        if (coreq) {
          corequisiteClasses.push(coreq);
          return sum + (coreq.credits || 3);
        }
        return sum;
      }, 0);
      
      const totalCredits = classCredits + corequisiteCredits;
      
      // If adding this class doesn't exceed the required credits (or exceeds by a reasonable amount),
      // or if we haven't selected any classes yet, select it
      if (creditsSelected === 0 || creditsSelected + totalCredits <= creditsNeeded + 3) {
        // Add the main class
        selectedElectives.push({
          ...cls,
          is_required: true // Mark as required now that it's selected
        });
        
        // Add all corequisites as well - FIXED: Inherit isMajor and category from parent class
        corequisiteClasses.forEach(coreq => {
          selectedElectives.push({
            ...coreq,
            isMajor: cls.isMajor, // FIXED: Inherit major/minor status from parent class
            category: cls.category, // FIXED: Inherit category from parent class
            is_required: true, // Mark corequisites as required too
            is_corequisite_for: cls.id
          });
        });
        
        // Add the TOTAL credits (class + corequisites)
        creditsSelected += totalCredits;
        
        // If we've selected enough credits, break
        if (creditsSelected >= creditsNeeded) break;
      }
    }
    
    console.log(`Selected ${creditsSelected} credits for section "${section.sectionName}" (needed ${creditsNeeded})`);
  });
  
  return selectedElectives;
}

//offical algorithim