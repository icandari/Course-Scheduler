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

    // Check for and log any duplicates
    checkForDuplicateClasses(allRequiredClasses);

    // After detecting duplicates but before generating schedule
    const classesWithoutDuplicates = removeDuplicateClasses(allRequiredClasses);

    // Generate the schedule with de-duplicated classes
    const schedule = createSchedule(
      classesWithoutDuplicates,
      startSemester,
      majorClassLimit,
      fallWinterCredits,
      springCredits
    );
    
    // 9. Display the schedule
    renderSchedule(schedule);

    // Export schedule as JSON for debugging
    const scheduleJson = getScheduleAsJson(schedule);
    console.log("Schedule JSON for debugging:", scheduleJson);

    // Create a download button for the JSON
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
  
  // Track processed corequisite relationships to prevent circular references
  const processedCoreqPairs = new Set();
  
  // Add prerequisites and their prerequisites recursively
  const allRequiredClassesById = {...selectedClassesById};
  let newClassesFound = true;
  
  while (newClassesFound) {
    newClassesFound = false;
    
    // Check each class for prerequisites and corequisites
    Object.values(allRequiredClassesById).forEach(cls => {
      // Handle prerequisites
      if (cls.prerequisites && Array.isArray(cls.prerequisites)) {
        cls.prerequisites.forEach(prereq => {
          // Extract ID and ensure it's an integer
          let id;
          if (typeof prereq === 'object') {
            id = prereq.id || prereq.class_id;
          } else if (prereq !== null && prereq !== undefined) {
            id = parseInt(prereq, 10);
          }
          
          // Only proceed if ID is a valid number and not already added
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
      
      // Handle corequisites
      if (cls.corequisites && Array.isArray(cls.corequisites)) {
        cls.corequisites.forEach(coreq => {
          // Extract ID and ensure it's an integer
          let id;
          if (typeof coreq === 'object') {
            id = coreq.id || coreq.class_id;
          } else if (coreq !== null && coreq !== undefined) {
            id = parseInt(coreq, 10);
          }
          
          // Skip invalid IDs
          if (isNaN(id) || id <= 0 || !classesById[id]) return;
          
          // Check for and handle bidirectional corequisites
          // Create a unique key for this corequisite pair (sorted to be consistent regardless of order)
          const pairKey = [cls.id, id].sort().join('-');
          
          // Skip if we've already processed this corequisite relationship
          if (processedCoreqPairs.has(pairKey)) return;
          
          // Mark this relationship as processed
          processedCoreqPairs.add(pairKey);
          
          // Only add if not already in the required classes
          if (!allRequiredClassesById[id]) {
            // Add the corequisite class with inherited properties
            allRequiredClassesById[id] = {
              ...classesById[id],
              isMajor: cls.isMajor || false,
              category: cls.category || 'corequisite',
              is_required: true,
              is_corequisite_for: cls.id,
              is_corequisite: true  // Add flag to mark as corequisite
            };
            newClassesFound = true;
          }
        });
      }
    });
  }
  
  return Object.values(allRequiredClassesById);
}

// Complete rewrite of the createSchedule function with proper loop structure
function createSchedule(classes, startSemester, majorClassLimit, fallWinterCredits, springCredits) {
  // Sort classes strategically to handle prerequisite chains
  const sortedClasses = sortClassesByPriority(classes);
  
  const semesters = [];
  let currentSemester = startSemester;
  let remainingClasses = [...sortedClasses];
  
  // Keep track of current semester index and academic year
  let currentSemesterIndex = 0;
  let currentAcademicYear = 1;
  
  // Special classes tracking
  const religionClasses = remainingClasses.filter(cls => cls.category === 'religion');
  
  // EIL class tracking
  const regularEILClasses = remainingClasses.filter(cls => 
    (cls.category === 'english' || 
     (cls.course_type && cls.course_type.toLowerCase().includes('eil'))) && 
    !(cls.class_number === "EIL 320" || (cls.class_name && cls.class_name.includes("Academic English II")))
  );
  
  const eil320Class = remainingClasses.find(cls => 
    cls.class_number === "EIL 320" || 
    (cls.class_name && cls.class_name.includes("Academic English II"))
  );

  // First-year credit limits (different from regular limits)
  const firstYearFallWinterLimit = 14;
  const firstYearSpringLimit = 11;
  
  // Track EIL scheduling status
  let regularEILScheduled = false;
  let eil320Scheduled = false;
  
  // Continue scheduling until all classes are scheduled
  while (remainingClasses.length > 0) {
    console.log(`Scheduling semester ${currentSemester}, ${remainingClasses.length} classes remaining`);
    
    const semesterType = getSemesterType(currentSemester);
    
    // Determine credit limit based on academic year and semester type
    let creditLimit;
    if (currentAcademicYear === 1) {
      creditLimit = semesterType === 'Spring' ? firstYearSpringLimit : firstYearFallWinterLimit;
    } else {
      creditLimit = semesterType === 'Spring' ? springCredits : fallWinterCredits;
    }
    
    // Get all classes completed so far
    const completedClasses = semesters.flatMap(sem => sem.classes);
    
    // SCHEDULING PRIORITY ALGORITHM
    const priorityClasses = [];
    
    // 1. HIGHEST PRIORITY: Schedule all regular EIL classes in first semester if not yet scheduled
    if (currentSemesterIndex === 0 && !regularEILScheduled && regularEILClasses.length > 0) {
      // Flag all regular EIL classes as highest priority and must-schedule
      regularEILClasses.forEach(cls => {
        if (remainingClasses.includes(cls)) {
          priorityClasses.push(cls);
          cls.mustScheduleThisSemester = true;
        }
      });
      console.log(`Prioritizing ${priorityClasses.length} EIL classes in first semester`);
    }
    
    // 2. Schedule EIL 320 in second semester if not yet scheduled
    if (currentSemesterIndex === 1 && !eil320Scheduled && eil320Class && remainingClasses.includes(eil320Class)) {
      // Check prerequisites
      const canSchedule320 = !eil320Class.prerequisites || 
        !Array.isArray(eil320Class.prerequisites) || 
        eil320Class.prerequisites.length === 0 ||
        eil320Class.prerequisites.every(prereq => {
          const prereqId = typeof prereq === 'object' ? prereq.id || prereq.class_id : prereq;
          return !prereqId || completedClasses.some(c => c.id === prereqId);
        });
      
      if (canSchedule320) {
        priorityClasses.push(eil320Class);
        eil320Class.mustScheduleThisSemester = true;
        console.log("Prioritizing EIL 320 in second semester");
      }
    }
    
    // 3. Try to fit one religion class each semester if possible
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
    
    if (availableReligionClasses.length > 0) {
      priorityClasses.push(availableReligionClasses[0]);
    }
    
    // 4. Identify classes with longest prerequisite chains
    const classesWithPrereqs = remainingClasses.filter(cls => 
      (cls.category === 'major' || cls.category === 'minor') &&
      hasLongPrerequisiteChain(cls, classes)
    );
    
    // Add these to priority (but don't override EIL or religion priorities)
    priorityClasses.push(...classesWithPrereqs);
    
    // Select classes for this semester
    const classesForSemester = selectClassesForSemester(
      remainingClasses,
      semesters,
      creditLimit,
      majorClassLimit,
      priorityClasses,
      semesterType
    );
    
    // Error checking - if we can't schedule anything, diagnose the problem
    if (classesForSemester.length === 0) {
      // Diagnostic information
      const eligibleClasses = getEligibleClasses(remainingClasses, completedClasses, semesterType);
      console.error(`Failed to schedule any classes for ${currentSemester}.`);
      console.error(`Eligible classes: ${eligibleClasses.length}`);
      console.error(`Classes with prerequisite issues: ${remainingClasses.length - eligibleClasses.length}`);
      
      // Try relaxing semester constraints to see if that helps
      const relaxedClasses = getEligibleClassesWithRelaxedConstraints(remainingClasses, completedClasses);
      
      // If relaxing constraints helps, we know it's a semester availability issue
      if (relaxedClasses.length > eligibleClasses.length) {
        console.error("Semester availability constraints are blocking scheduling");
        
        // Override semester constraints for one critical class to prevent deadlock
        if (relaxedClasses.length > 0) {
          console.warn("Emergency override: Scheduling one class despite semester constraints");
          const overrideClass = relaxedClasses[0];
          classesForSemester.push(overrideClass);
        }
      }
      
      // If we still can't schedule anything, check for circular prerequisites
      if (classesForSemester.length === 0) {
        console.error("Checking for circular prerequisites...");
        const circularDeps = detectCircularPrerequisites(remainingClasses);
        if (circularDeps) {
          console.error("Circular prerequisite dependency detected - overriding one dependency");
          
          // Force schedule one class to break the cycle
          if (remainingClasses.length > 0) {
            classesForSemester.push(remainingClasses[0]);
          }
        }
        
        // Last resort - just take the first remaining class to avoid infinite loop
        if (classesForSemester.length === 0 && remainingClasses.length > 0) {
          console.error("EMERGENCY: Forcing class to be scheduled to avoid infinite loop");
          classesForSemester.push(remainingClasses[0]);
        }
      }
    }
    
    // Track EIL scheduling status
    if (currentSemesterIndex === 0) {
      // Check if we scheduled all regular EIL classes
      const scheduledEILCount = classesForSemester.filter(cls => 
        regularEILClasses.includes(cls)
      ).length;
      
      if (scheduledEILCount === regularEILClasses.length) {
        regularEILScheduled = true;
        console.log("All regular EIL classes scheduled in first semester");
      }
    }
    
    // Check if we scheduled EIL 320
    if (!eil320Scheduled && classesForSemester.some(cls => 
      cls.class_number === "EIL 320" || 
      (cls.class_name && cls.class_name.includes("Academic English II"))
    )) {
      eil320Scheduled = true;
      console.log("EIL 320 has been scheduled");
    }
    
    // Add semester to schedule
    semesters.push({
      name: currentSemester,
      type: semesterType,
      classes: classesForSemester,
      hasReligion: classesForSemester.some(cls => cls.category === 'religion'),
      isFirstYear: currentAcademicYear === 1
    });
    
    // Remove scheduled classes from remaining
    remainingClasses = remainingClasses.filter(cls => !classesForSemester.includes(cls));
    
    // Advance to next semester
    currentSemester = getNextSemester(currentSemester);
    currentSemesterIndex++;
    
    // Update academic year tracking (Fall semester starts a new academic year)
    if (semesterType === 'Spring') {
      currentAcademicYear = Math.floor(currentSemesterIndex / 3) + 1;
    }
    
    // Safeguard against potential infinite loop
    if (currentSemesterIndex > 50) {
      console.error("Emergency stop: Too many semesters scheduled");
      break;
    }
  }
  
  return semesters;
}

// Improved selectClassesForSemester to enforce first-year scheduling rules
function selectClassesForSemester(
  availableClasses, 
  completedSemesters, 
  creditLimit, 
  majorClassLimit,
  priorityClasses = [],
  currentSemesterType
) {
  const completedClasses = completedSemesters.flatMap(sem => sem.classes);
  const completedClassIds = completedClasses.map(cls => cls.id);
  
  // Calculate total credits completed so far
  const totalCreditsCompleted = completedClasses.reduce((sum, cls) => sum + (cls.credits || 3), 0);
  const isSeniorEligible = totalCreditsCompleted >= 90;
  
  // Filter eligible classes that can be scheduled this semester
  const eligibleClasses = availableClasses.filter(cls => {
    // Check if it's a senior class and if student has enough credits
    if (cls.is_senior_class && !isSeniorEligible) {
      return false;
    }
    
    // Check semester availability
    if (cls.semesters_offered && Array.isArray(cls.semesters_offered) && 
        cls.semesters_offered.length > 0) {
      if (!cls.semesters_offered.includes(currentSemesterType)) {
        return false;
      }
    }
    
    // Check prerequisites
    if (cls.prerequisites && Array.isArray(cls.prerequisites) && cls.prerequisites.length > 0) {
      return cls.prerequisites.every(prereq => {
        const prereqId = typeof prereq === 'object' ? prereq.id || prereq.class_id : prereq;
        return isNaN(prereqId) || completedClassIds.includes(prereqId);
      });
    }
    return true;
  });
  
  // Track selected classes for this semester
  const selectedClasses = [];
  let currentCredits = 0;
  let majorClassesCount = 0;
  let religionClassesCount = 0;
  
  // Build corequisite map for quick lookups
  const coreqMap = new Map();
  eligibleClasses.forEach(cls => {
    if (cls.corequisites && Array.isArray(cls.corequisites) && cls.corequisites.length > 0) {
      const coreqIds = cls.corequisites.map(coreq => 
        typeof coreq === 'object' ? coreq.id || coreq.class_id : coreq
      ).filter(id => !isNaN(id) && id > 0);
      
      if (coreqIds.length > 0) {
        coreqMap.set(cls.id, coreqIds);
      }
    }
  });
  
  // Helper function to add a class and its corequisites
  function addClassWithCorequisites(cls) {
    // Get all required corequisites directly from the class definition
    const coreqsToAdd = [];
    
    if (cls.corequisites && Array.isArray(cls.corequisites) && cls.corequisites.length > 0) {
      cls.corequisites.forEach(coreqRef => {
        const coreqId = typeof coreqRef === 'object' ? coreqRef.id || coreqRef.class_id : coreqRef;
        if (isNaN(coreqId)) return;
        
        // Find the corequisite in all available classes, not just eligible ones
        // This ensures we don't miss corequisites that might have their own prerequisites
        const coreqClass = availableClasses.find(c => c.id === coreqId);
        if (coreqClass && !selectedClasses.includes(coreqClass)) {
          coreqsToAdd.push(coreqClass);
        }
      });
    }
    
    // Calculate total credits needed
    const totalCredits = (cls.credits || 3) + coreqsToAdd.reduce((sum, c) => sum + (c.credits || 3), 0);
    
    // Check if we can fit within credit limit (except for must-schedule classes)
    if (currentCredits + totalCredits > creditLimit && !cls.mustScheduleThisSemester) {
      return false;
    }
    
    // Add the main class
    selectedClasses.push(cls);
    currentCredits += (cls.credits || 3);
    
    // Update counters
    if (cls.isMajor || cls.category === 'major') majorClassesCount++;
    if (cls.category === 'religion') religionClassesCount++;
    
    // Add all corequisites together
    coreqsToAdd.forEach(coreq => {
      selectedClasses.push({
        ...coreq,
        isMajor: cls.isMajor || coreq.isMajor, // Inherit major status if needed
        category: coreq.category || cls.category, // Keep original category or inherit
        is_required: true,
        is_corequisite_for: cls.id,
        is_corequisite: true // Mark explicitly as corequisite
      });
      currentCredits += (coreq.credits || 3);
      
      if (coreq.isMajor || coreq.category === 'major') majorClassesCount++;
      if (coreq.category === 'religion') religionClassesCount++;
    });
    
    return true;
  }
  
  // 1. First process "must schedule" classes (like EIL in first semester)
  const mustScheduleClasses = priorityClasses.filter(cls => 
    cls.mustScheduleThisSemester && 
    eligibleClasses.includes(cls) &&
    !selectedClasses.includes(cls)
  );
  
  mustScheduleClasses.forEach(cls => {
    addClassWithCorequisites(cls);
  });
  
  // 2. Next, process religion priority classes (limit to 1 per semester)
  if (religionClassesCount < 1) {
    const religionClasses = priorityClasses.filter(cls => 
      cls.category === 'religion' && 
      eligibleClasses.includes(cls) && 
      !selectedClasses.includes(cls)
    );
    
    if (religionClasses.length > 0) {
      addClassWithCorequisites(religionClasses[0]);
    }
  }
  
  // 3. Next, process remaining priority classes
  const remainingPriorityClasses = priorityClasses.filter(cls => 
    !cls.mustScheduleThisSemester && 
    cls.category !== 'religion' &&
    eligibleClasses.includes(cls) && 
    !selectedClasses.includes(cls)
  );
  
  for (const cls of remainingPriorityClasses) {
    // Skip if we've hit limits
    if (cls.category === 'religion' && religionClassesCount >= 1) continue;
    if ((cls.isMajor || cls.category === 'major') && majorClassesCount >= majorClassLimit) continue;
    
    // Try to add this class
    addClassWithCorequisites(cls);
    
    // Stop if we've hit credit limit
    if (currentCredits >= creditLimit) break;
  }
  
  // 4. Finally, add any eligible classes until we hit limits
  const remainingEligibleClasses = eligibleClasses.filter(cls => 
    !selectedClasses.includes(cls)
  );
  
  // Improved sorting of remaining classes
  remainingEligibleClasses.sort((a, b) => {
    // First prioritize classes with corequisites
    const aHasCoreqs = coreqMap.has(a.id);
    const bHasCoreqs = coreqMap.has(b.id);
    if (aHasCoreqs !== bHasCoreqs) return aHasCoreqs ? -1 : 1;
    
    // Then religion classes
    if (a.category === 'religion' && b.category !== 'religion') return -1;
    if (a.category !== 'religion' && b.category === 'religion') return 1;
    
    // Then by required status
    if (a.is_required !== b.is_required) return a.is_required ? -1 : 1;
    
    // Then by major vs minor
    if ((a.isMajor || a.category === 'major') !== (b.isMajor || b.category === 'major')) {
      return (a.isMajor || a.category === 'major') ? -1 : 1;
    }
    
    // Then by class level (lower levels first)
    const levelA = a.class_number ? parseInt(a.class_number.match(/\d+/)?.[0] || '999', 10) : 999;
    const levelB = b.class_number ? parseInt(b.class_number.match(/\d+/)?.[0] || '999', 10) : 999;
    return levelA - levelB;
  });
  
  // Add remaining classes
  for (const cls of remainingEligibleClasses) {
    // Skip if we've hit limits
    if (cls.category === 'religion' && religionClassesCount >= 1) continue;
    if ((cls.isMajor || cls.category === 'major') && majorClassesCount >= majorClassLimit) continue;
    
    // Try to add this class
    if (!addClassWithCorequisites(cls)) break; // Break if we hit credit limit
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
function sortClassesByPriority(classes) {
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
    cls.prerequisites.forEach(prereq => {
      const id = typeof prereq === 'object' ? prereq.id || prereq.class_id : prereq;
      if (id) {
        const depth = calculateDepth(id, new Set(visited));
        maxDepth = Math.max(maxDepth, depth);
      }
    });
    
    // Cache and return result
    depthMap[classId] = maxDepth + 1;
    return depthMap;
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
  
  // Create summary items (unchanged)
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
    
    // NEW: Create a set to track displayed class numbers to avoid duplicates
    const displayedClassNumbers = new Set();
    
    semester.classes.forEach(cls => {
      // NEW: Skip classes with duplicate class numbers in the same semester
      const classNumber = cls.class_number || '';
      if (classNumber && displayedClassNumbers.has(classNumber)) {
        console.log(`Preventing duplicate display of ${classNumber} in ${semester.name}`);
        return;
      }
      
      // If we have a class number, mark it as displayed
      if (classNumber) {
        displayedClassNumbers.add(classNumber);
      }
      
      const classItem = document.createElement('li');
      classItem.className = 'class-item';
      
      // Class type indicator (major, minor, etc)
      const categoryTag = cls.isMajor ? 'major' : 
                          (cls.category === 'english' ? 'english' :
                          (cls.category === 'religion' ? 'religion' : 'minor'));
      
      classItem.innerHTML = `
        <span class="class-tag ${categoryTag}">${categoryTag.charAt(0).toUpperCase() + categoryTag.slice(1)}</span>
        <span class="class-number">${classNumber}</span>
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

// Identify classes with long prerequisite chains
function hasLongPrerequisiteChain(cls, allClasses) {
  if (!cls.prerequisites || !Array.isArray(cls.prerequisites) || cls.prerequisites.length === 0) {
    return false;
  }
  
  // Build class lookup
  const classesById = allClasses.reduce((map, c) => {
    if (c.id) map[c.id] = c;
    return map;
  }, {});
  
  // Recursively check prerequisite depth
  function getPrerequisiteDepth(classId, visited = new Set()) {
    if (visited.has(classId)) return 0; // Prevent cycles
    
    visited.add(classId);
    const cls = classesById[classId];
    if (!cls || !cls.prerequisites || !Array.isArray(cls.prerequisites) || cls.prerequisites.length === 0) {
      return 0;
    }
    
    let maxDepth = 0;
    cls.prerequisites.forEach(prereq => {
      const prereqId = typeof prereq === 'object' ? prereq.id || prereq.class_id : prereq;
      if (!prereqId) return;
      const depth = getPrerequisiteDepth(prereqId, new Set(visited));
      maxDepth = Math.max(maxDepth, depth);
    });
    
    return maxDepth + 1;
  }
  
  const depth = getPrerequisiteDepth(cls.id);
  return depth >= 2; // Classes with prerequisite chains of depth 2 or more
}

// Get eligible classes with semester constraints
function getEligibleClasses(availableClasses, completedClasses, currentSemesterType) {
  const completedClassIds = completedClasses.map(cls => cls.id);
  
  return availableClasses.filter(cls => {
    // Check semester constraints
    if (cls.semesters_offered && Array.isArray(cls.semesters_offered) && 
        cls.semesters_offered.length > 0) {
      if (!cls.semesters_offered.includes(currentSemesterType)) {
        return false;
      }
    }
    
    // Check prerequisites
    if (cls.prerequisites && Array.isArray(cls.prerequisites) && cls.prerequisites.length > 0) {
      return cls.prerequisites.every(prereq => {
        const prereqId = typeof prereq === 'object' ? prereq.id || prereq.class_id : prereq;
        return isNaN(prereqId) || completedClassIds.includes(prereqId);
      });
    }
    
    return true;
  });
}

// Get eligible classes without semester constraints (for diagnostic purposes)
function getEligibleClassesWithRelaxedConstraints(availableClasses, completedClasses) {
  const completedClassIds = completedClasses.map(cls => cls.id);
  
  return availableClasses.filter(cls => {
    // Only check prerequisites, ignore semester constraints
    if (cls.prerequisites && Array.isArray(cls.prerequisites) && cls.prerequisites.length > 0) {
      return cls.prerequisites.every(prereq => {
        const prereqId = typeof prereq === 'object' ? prereq.id || prereq.class_id : prereq;
        return isNaN(prereqId) || completedClassIds.includes(prereqId);
      });
    }
    return true;
  });
}

// Detect circular prerequisites
function detectCircularPrerequisites(classes) {
  const classesById = classes.reduce((map, cls) => {
    if (cls.id) map[cls.id] = cls;
    return map;
  }, {});
  
  function checkCircular(classId, chain = new Set()) {
    if (chain.has(classId)) {
      console.error(`CIRCULAR DEPENDENCY: ${Array.from(chain).join(' -> ')} -> ${classId}`);
      return true;
    }
    
    const cls = classesById[classId];
    if (!cls || !cls.prerequisites || !Array.isArray(cls.prerequisites) || cls.prerequisites.length === 0) {
      return false;
    }
    
    const newChain = new Set(chain);
    newChain.add(classId);
    
    return cls.prerequisites.some(prereq => {
      const prereqId = typeof prereq === 'object' ? prereq.id || prereq.class_id : prereq;
      if (!prereqId) return false;
      return checkCircular(prereqId, newChain);
    });
  }
  
  for (const cls of classes) {
    if (checkCircular(cls.id)) {
      return true; // Found a circular dependency
    }
  }
  
  return false;
}

// Improved sorting function for classes
function sortClassesByPriority(classes) {
  // Create prerequisite depth map
  const depthMap = {};
  const classesById = {};
  
  // Build class lookup table
  classes.forEach(cls => {
    if (cls.id) classesById[cls.id] = cls;
  });
  
  // Calculate prerequisite depth for each class
  function calculateDepth(classId, visited = new Set()) {
    if (depthMap[classId] !== undefined) return depthMap[classId];
    
    if (visited.has(classId)) {
      console.warn(`Circular prerequisite dependency for class ${classId}`);
      return 0;
    }
    
    visited.add(classId);
    const cls = classesById[classId];
    if (!cls) return 0;
    
    if (!cls.prerequisites || !Array.isArray(cls.prerequisites) || cls.prerequisites.length === 0) {
      depthMap[classId] = 0;
      return 0;
    }
    
    let maxDepth = -1;
    cls.prerequisites.forEach(prereq => {
      const id = typeof prereq === 'object' ? prereq.id || prereq.class_id : prereq;
      if (id) {
        const depth = calculateDepth(id, new Set(visited));
        maxDepth = Math.max(maxDepth, depth);
      }
    });
    
    depthMap[classId] = maxDepth + 1;
    return depthMap[classId];
  }
  
  // Calculate depth for all classes
  classes.forEach(cls => {
    if (cls.id && depthMap[cls.id] === undefined) {
      calculateDepth(cls.id);
    }
  });
  
  // Sort classes based on multiple criteria
  return [...classes].sort((a, b) => {
    // 1. First prioritize EIL classes
    const aIsRegularEIL = (a.category === 'english' && 
                          a.class_number !== "EIL 320" && 
                          !(a.class_name && a.class_name.includes("Academic English II")));
    const bIsRegularEIL = (b.category === 'english' && 
                          b.class_number !== "EIL 320" && 
                          !(b.class_name && b.class_name.includes("Academic English II")));
                          
    if (aIsRegularEIL && !bIsRegularEIL) return -1;
    if (!aIsRegularEIL && bIsRegularEIL) return 1;
    
    // 2. Then EIL 320
    const aIsEIL320 = (a.class_number === "EIL 320" || 
                      (a.class_name && a.class_name.includes("Academic English II")));
    const bIsEIL320 = (b.class_number === "EIL 320" || 
                      (b.class_name && b.class_name.includes("Academic English II")));
                      
    if (aIsEIL320 && !bIsEIL320) return -1;
    if (!aIsEIL320 && bIsEIL320) return 1;
    
    // 3. Then by prerequisite depth (more dependencies first)
    const depthA = depthMap[a.id] || 0;
    const depthB = depthMap[b.id] || 0;
    if (depthA !== depthB) return depthB - depthA;
    
    // 4. Then religion classes
    if (a.category === 'religion' && b.category !== 'religion') return -1;
    if (a.category !== 'religion' && b.category === 'religion') return 1;
    
    // 5. Then major before minor classes
    if (a.category === 'major' && b.category === 'minor') return -1;
    if (a.category === 'minor' && b.category === 'major') return 1;
    
    // 6. Then by class level (lower level first)
    const levelA = a.class_number ? parseInt(a.class_number.match(/\d+/)?.[0] || '0', 10) : 0;
    const levelB = b.class_number ? parseInt(b.class_number.match(/\d+/)?.[0] || '0', 10) : 0;
    
    return levelA - levelB;
  });
}

// Add this function to check for duplicates before generating the schedule
function checkForDuplicateClasses(classes) {
  const classesById = {};
  const duplicates = [];
  
  classes.forEach(cls => {
    if (classesById[cls.id]) {
      // Record full details about the duplicate for debugging
      duplicates.push({
        id: cls.id,
        class_name: cls.class_name || "Unknown",
        class_number: cls.class_number || "Unknown",
        firstOrigin: classesById[cls.id].origin,
        firstInstance: {
          is_corequisite: classesById[cls.id].is_corequisite || false,
          is_corequisite_for: classesById[cls.id].is_corequisite_for || null,
          is_prerequisite_for: classesById[cls.id].is_prerequisite_for || null
        },
        secondOrigin: cls.is_corequisite_for ? 
                      `Corequisite for ${cls.is_corequisite_for}` : 
                      cls.is_prerequisite_for ? 
                      `Prerequisite for ${cls.is_prerequisite_for}` : 
                      'Direct requirement',
        secondInstance: {
          is_corequisite: cls.is_corequisite || false,
          is_corequisite_for: cls.is_corequisite_for || null,
          is_prerequisite_for: cls.is_prerequisite_for || null
        }
      });
    } else {
      classesById[cls.id] = {
        ...cls,
        origin: cls.is_corequisite_for ? 
                `Corequisite for ${cls.is_corequisite_for}` : 
                cls.is_prerequisite_for ? 
                `Prerequisite for ${cls.is_prerequisite_for}` : 
                'Direct requirement'
      };
    }
  });
  
  if (duplicates.length > 0) {
    console.warn('Duplicate classes found:', duplicates);
    
    // Log a more readable summary
    duplicates.forEach(dup => {
      console.warn(`Duplicate class: ${dup.class_number} - ${dup.class_name}`);
      console.warn(`  First instance: ${dup.firstOrigin}`);
      console.warn(`  Second instance: ${dup.secondOrigin}`);
    });
  }
  
  return duplicates.length > 0;
}

// Update the removeDuplicateClasses function with better debugging

function removeDuplicateClasses(classes) {
  console.log(`===== DUPLICATE CHECK: Starting with ${classes.length} classes =====`);
  
  // First, check if we even have any IDs to work with
  const classesWithoutIds = classes.filter(cls => !cls.id);
  if (classesWithoutIds.length > 0) {
    console.warn(`WARNING: Found ${classesWithoutIds.length} classes without IDs!`, classesWithoutIds);
  }
  
  // Create a map to track class counts by ID for debug purposes
  const classCounts = {};
  classes.forEach(cls => {
    if (cls.id) {
      classCounts[cls.id] = (classCounts[cls.id] || 0) + 1;
    }
  });
  
  // Find IDs that appear more than once
  const duplicateIds = Object.entries(classCounts)
    .filter(([_, count]) => count > 1)
    .map(([id]) => parseInt(id));
  
  console.log(`Found ${duplicateIds.length} class IDs with duplicates`, duplicateIds);
  
  // Log details about duplicated classes
  duplicateIds.forEach(id => {
    const instances = classes.filter(cls => cls.id === id);
    console.log(`Class ID ${id} appears ${instances.length} times:`);
    instances.forEach((cls, idx) => {
      console.log(`  Instance ${idx+1}: ${cls.class_number} - ${cls.class_name}`);
      console.log(`    Is corequisite: ${cls.is_corequisite}`);
      console.log(`    Is corequisite for: ${cls.is_corequisite_for || 'none'}`);
      console.log(`    Is prerequisite for: ${cls.is_prerequisite_for || 'none'}`);
    });
  });
  
  // Now do the actual deduplication
  const uniqueClasses = [];
  const addedIds = new Set();
  
  for (const cls of classes) {
    if (!cls.id || !addedIds.has(cls.id)) {
      if (cls.id) {
        addedIds.add(cls.id);
      }
      uniqueClasses.push(cls);
    } else {
      console.log(`Removed duplicate class: ${cls.class_number || 'Unknown'} (ID: ${cls.id})`);
    }
  }
  
  console.log(`===== DUPLICATE CHECK: Removed ${classes.length - uniqueClasses.length} duplicates, returning ${uniqueClasses.length} classes =====`);
  return uniqueClasses;
}

// Add after renderSchedule function

// Function to export schedule as JSON for debugging
function getScheduleAsJson(schedule) {
  // Before creating the clean schedule, deduplicate classes in each semester
  const deduplicatedSchedule = schedule.map(semester => {
    const uniqueClasses = [];
    const addedIds = new Set();
    
    for (const cls of semester.classes) {
      if (!addedIds.has(cls.id)) {
        uniqueClasses.push(cls);
        addedIds.add(cls.id);
      }
    }
    
    return {
      ...semester,
      classes: uniqueClasses
    };
  });
  
  // Then proceed with creating the clean version
  const cleanSchedule = deduplicatedSchedule.map(semester => ({
    name: semester.name,
    type: semester.type,
    isFirstYear: semester.isFirstYear,
    classes: semester.classes.map(cls => ({
      id: cls.id,
      class_number: cls.class_number || 'Unknown',
      class_name: cls.class_name || 'Unknown',
      credits: cls.credits || 3,
      category: cls.category || '',
      isMajor: cls.isMajor || false,
      is_required: cls.is_required || false,
      is_elective: cls.is_elective || false,
      is_corequisite: cls.is_corequisite || false,
      is_corequisite_for: cls.is_corequisite_for || null,
      is_prerequisite_for: cls.is_prerequisite_for || null,
      prerequisites: cls.prerequisites || [],
      corequisites: cls.corequisites || []
    })),
    totalCredits: semester.classes.reduce((sum, cls) => sum + (cls.credits || 3), 0)
  }));

  return JSON.stringify(cleanSchedule, null, 2); // Pretty-print with 2-space indentation
}