// Global variable to hold all courses for later filtering (e.g. religion courses)
let allCourses = [];
// Global lookup map for classes by their ID (populated from /api/classes)
let allClassesMap = {};

document.addEventListener('DOMContentLoaded', async () => {
  // --- Fetch All Classes and Build Lookup Map ---
  try {
    // First, fetch all classes from the API and build the lookup map.
    const classesResponse = await fetch('/api/classes');
    if (!classesResponse.ok) {
      throw new Error(`Error fetching all classes: ${classesResponse.statusText}`);
    }
    const allClasses = await classesResponse.json();
    allClasses.forEach(cls => {
      if (cls.id !== undefined) {
        allClassesMap[cls.id] = cls;
      }
    });
    console.log("Built allClassesMap with", Object.keys(allClassesMap).length, "classes.");

    // Then, fetch courses and populate English Level dropdown.
    const response = await fetch('/api/courses');
    if (!response.ok) {
      throw new Error(`Error fetching courses: ${response.statusText}`);
    }
    const courses = await response.json();
    console.log("Fetched courses:", courses);
    allCourses = courses;

    // Populate English Level Dropdown
    const englishCourses = courses.filter(course =>
      course.course_type && course.course_type.toLowerCase() === "eil/holokai"
    );
    const englishLevelSelect = document.getElementById("english-level");
    if (englishLevelSelect) {
      englishLevelSelect.innerHTML = "";
      englishCourses.forEach(course => {
        const option = document.createElement("option");
        // For English, we use the course name directly (e.g., "EIL Level 1")
        option.value = course.course_name;
        option.textContent = course.course_name;
        englishLevelSelect.appendChild(option);
      });
    } else {
      console.warn("English level select element not found.");
    }
    console.log("English level dropdown populated successfully.");
  } catch (error) {
    console.error("Error populating courses:", error);
  }

  // --- Setup Search for Major, Minor1, Minor2 ---
  // For Major search, we filter by course_type "major"
  setupCourseSearch("majorSearchInput", "majorSearchResults", "selectedMajor", "major");
  // For Minor search, we filter by course_type "minor"
  setupCourseSearch("minor1SearchInput", "minor1SearchResults", "selectedMinor1", "minor");
  setupCourseSearch("minor2SearchInput", "minor2SearchResults", "selectedMinor2", "minor");

  // Helper function to set up search input for a given category.
  function setupCourseSearch(inputId, resultsId, hiddenInputId, courseType) {
    const searchInput = document.getElementById(inputId);
    const searchResults = document.getElementById(resultsId);
    const hiddenInput = document.getElementById(hiddenInputId);

    if (searchInput) {
      let debounceTimeout;
      searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => {
          performSearch();
        }, 300);
      });
    }

    async function performSearch() {
      const query = searchInput.value.trim().toLowerCase();
      if (!searchResults) return;
      searchResults.innerHTML = "";
      if (query === "") return;
      try {
        // Append courseType if provided.
        let url = `/api/courses/search?query=${encodeURIComponent(query)}&limit=5`;
        if (courseType) {
          url += `&course_type=${encodeURIComponent(courseType)}`;
        }
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`Error searching courses: ${res.statusText}`);
        }
        const data = await res.json();
        const coursesFound = data.courses || [];
        coursesFound.forEach(course => {
          const li = document.createElement("li");
          li.textContent = `${course.course_type}: ${course.course_name}`;
          li.addEventListener('click', () => {
            // On selection, update the hidden input with the course ID
            hiddenInput.value = course.id;
            // Also update the search input to show the selected course
            searchInput.value = course.course_name;
            // Clear results list
            searchResults.innerHTML = "";
          });
          searchResults.appendChild(li);
        });
      } catch (error) {
        console.error("Error during course search:", error);
      }
    }
  }

  // --- Helper Functions for Scheduling (unchanged) ---
  function isReligionClass(cls) {
    if (cls.course_type) {
      return cls.course_type.toLowerCase() === "religion";
    } else if (cls.class_number) {
      return cls.class_number.toUpperCase().startsWith("REL");
    }
    return false;
  }

  function extractClasses(programDetails, isMajor = false, category = '') {
    let classes = [];
    if (programDetails.classes) {
      classes = programDetails.classes;
    } else if (Array.isArray(programDetails.sections)) {
      let allClassesArr = [];
      programDetails.sections.forEach(section => {
        if (Array.isArray(section.classes)) {
          const classesWithSection = section.classes.map(cls => ({ ...cls, sectionId: section.id }));
          allClassesArr = allClassesArr.concat(classesWithSection);
        }
      });
      classes = allClassesArr;
    }
    classes = classes.map(cls => ({ ...cls, category: category }));
    if (programDetails.course_type) {
      classes = classes.map(cls => ({ ...cls, course_type: programDetails.course_type }));
    }
    if (isMajor) {
      classes = classes.map(cls => ({ ...cls, isMajor: true }));
    }
    return classes;
  }

  function getPriority(cls) {
    if (cls.category === "english") return 1;
    if (cls.category === "major") return 3;
    if (cls.category === "minor") return 4;
    return 10;
  }

  // Updated Allowed Electives using credits_needed_to_take
  function getAllowedElectives(allCourses, selectedCourseIds) {
    let allowedElectives = [];
    allCourses.forEach(course => {
      if (selectedCourseIds.includes(course.id)) {
        if (course.sections && Array.isArray(course.sections)) {
          course.sections.forEach(section => {
            if (!section.is_required) {
              let candidates = (section.classes || []).filter(cls => cls.is_elective === true)
                .map(cls => ({
                  ...cls,
                  category: "elective",
                  sectionId: section.id,
                  course_id: course.id
                }));
              candidates.sort((a, b) => {
                const numA = parseInt(a.class_number.match(/\d+/)?.[0] || "0", 10);
                const numB = parseInt(b.class_number.match(/\d+/)?.[0] || "0", 10);
                return numA - numB;
              });
              // Use credits_needed_to_take instead of classes_to_choose
              let allowedCredits = section.credits_needed_to_take || 0;
              let accumulatedCredits = 0;
              for (let i = 0; i < candidates.length; i++) {
                if (accumulatedCredits + candidates[i].credits <= allowedCredits) {
                  candidates[i].allowed = true;
                  allowedElectives.push(candidates[i]);
                  accumulatedCredits += candidates[i].credits;
                } else {
                  candidates[i].allowed = false;
                }
              }
            }
          });
        }
      }
    });
    return allowedElectives;
  }

  function computeDepthMap(classes) {
    let classMap = {};
    classes.forEach(cls => {
      classMap[cls.id] = cls;
    });
    let memo = {};
    function getDepth(cls) {
      if (!cls.prerequisites || cls.prerequisites.length === 0) return 0;
      if (memo[cls.id] !== undefined) return memo[cls.id];
      let depths = cls.prerequisites.map(reqId => {
        let req = classMap[reqId];
        return req ? 1 + getDepth(req) : 0;
      });
      let d = Math.max(...depths);
      memo[cls.id] = d;
      return d;
    }
    return getDepth;
  }

  let depthFunction; // will be computed later

  // Updated Priority Function (Order: English, Major, Religion, Minor; Senior classes get very low priority)
  function computePriority(cls) {
    let basePriority;
    if (cls.is_senior_class === true) {
      basePriority = 100;
    } else if (cls.category === "english") {
      basePriority = 1;
    } else if (cls.category === "major") {
      basePriority = 2;
    } else if (isReligionClass(cls)) {
      basePriority = 3;
    } else if (cls.category === "minor") {
      basePriority = 4;
    } else {
      basePriority = 10;
    }
    let availabilityBonus = 0;
    if (cls.semesters_offered && cls.semesters_offered.length > 0) {
      availabilityBonus = cls.semesters_offered.length - 1;
    }
    let depth = depthFunction(cls);
    return basePriority - availabilityBonus - depth;
  }

  // --- Recursively Add Missing Prerequisites Using the Lookup Map ---
  async function addMissingPrerequisites(classes) {
    let foundIds = new Set(classes.map(c => c.id));
    async function addFromMap(prereqIdInput, dependentCategory) {
      const prereqId = (typeof prereqIdInput === 'object' && prereqIdInput !== null)
        ? (prereqIdInput.id || prereqIdInput.class_id) : prereqIdInput;
      if (!prereqId) {
        console.error("Invalid prerequisite identifier:", prereqIdInput);
        return;
      }
      if (foundIds.has(prereqId)) return;
      if (allClassesMap[prereqId]) {
        let prereqClass = allClassesMap[prereqId];
        if (!prereqClass.category && dependentCategory) {
          prereqClass.category = dependentCategory;
        }
        classes.push(prereqClass);
        foundIds.add(prereqClass.id);
        if (prereqClass.prerequisites && prereqClass.prerequisites.length > 0) {
          for (let pre of prereqClass.prerequisites) {
            const preId = (typeof pre === 'object' && pre !== null)
              ? (pre.id || pre.class_id) : pre;
            await addFromMap(preId, dependentCategory);
          }
        }
      } else {
        console.error(`Prerequisite class with id ${prereqId} not found in allClassesMap.`);
      }
    }
    for (let cls of classes) {
      if (cls.prerequisites && cls.prerequisites.length > 0) {
        for (let idEntry of cls.prerequisites) {
          const id = (typeof idEntry === 'object' && idEntry !== null)
            ? (idEntry.id || idEntry.class_id) : idEntry;
          if (!foundIds.has(id)) {
            await addFromMap(id, cls.category);
          }
        }
      }
    }
  }

  // --- Main Scheduling Process ---
  const generateButton = document.getElementById("calculate-schedule");
  if (generateButton) {
    generateButton.addEventListener('click', async (event) => {
      event.preventDefault();
      console.log("User selections starting schedule generation...");

      // Get selected course IDs from the hidden inputs.
      const selectedMajor = Number(document.getElementById("selectedMajor").value);
      const selectedMinor1 = Number(document.getElementById("selectedMinor1").value);
      const selectedMinor2 = Number(document.getElementById("selectedMinor2").value);
      const selectedCourseIds = [selectedMajor, selectedMinor1, selectedMinor2].filter(id => !isNaN(id));
      console.log("Selected Course IDs:", selectedCourseIds);

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

      // Build allowed electives based on selectedCourseIds.
      const allowedElectives = getAllowedElectives(allCourses, selectedCourseIds);
      console.log("Allowed elective classes count:", allowedElectives.length);

      // Build required classes.
      // For English, extract classes from the selected English course.
      const selectedEnglishCourse = allCourses.find(course =>
        course.course_name === englishLevel
      );
      if (!selectedEnglishCourse) {
        throw new Error("Selected English Level course not found in allCourses.");
      }
      const englishRes = await fetch(`/api/courses/${selectedEnglishCourse.id}`);
      if (!englishRes.ok) {
        throw new Error("Error fetching English Level course details.");
      }
      const englishDetails = await englishRes.json();
      const englishClasses = extractClasses(englishDetails, false, "english");

      // For Religion, Major, and Minor, use all courses from allCourses that are of these types.
      let requiredClasses = [];
      allCourses.forEach(course => {
        if (
          course.course_type &&
          (course.course_type.toLowerCase() === "major" ||
           course.course_type.toLowerCase() === "minor" ||
           course.course_type.toLowerCase() === "religion")
        ) {
          const isMajor = course.course_type.toLowerCase() === "major";
          const category = isMajor ? "major" : (course.course_type.toLowerCase() === "minor" ? "minor" : "religion");
          const courseClasses = extractClasses(course, isMajor, category);
          requiredClasses = requiredClasses.concat(courseClasses);
        }
      });
      // Combine English classes with required classes, filtering out electives.
      requiredClasses = englishClasses.concat(requiredClasses).filter(cls => !cls.is_elective);
      // Also filter out any classes that do not clearly belong to one of our four categories.
      requiredClasses = requiredClasses.filter(cls =>
        cls.category === "english" ||
        cls.category === "major" ||
        cls.category === "minor" ||
        isReligionClass(cls)
      );
      console.log("Required classes count:", requiredClasses.length);

      // Combine required classes with allowed electives.
      let combinedClasses = requiredClasses.concat(allowedElectives);
      combinedClasses = combinedClasses.filter(cls =>
        cls.category === "english" ||
        cls.category === "major" ||
        cls.category === "minor" ||
        isReligionClass(cls) ||
        (cls.category === "elective" && selectedCourseIds.includes(cls.course_id))
      );
      console.log("Combined classes count after filtering:", combinedClasses.length);

      // Sort combined classes numerically by class_number.
      combinedClasses.sort((a, b) => {
        const numA = parseInt(a.class_number.match(/\d+/)?.[0] || "0", 10);
        const numB = parseInt(b.class_number.match(/\d+/)?.[0] || "0", 10);
        return numA - numB;
      });

      // Mark prerequisite classes.
      const prereqSet = new Set();
      combinedClasses.forEach(cls => {
        if (cls.prerequisites && cls.prerequisites.length > 0) {
          cls.prerequisites.forEach(id => prereqSet.add(id));
        }
      });
      combinedClasses.forEach(cls => {
        cls.isPrereq = prereqSet.has(cls.id);
      });

      // Deduplicate combined classes.
      const uniqueClassesMap = new Map();
      combinedClasses.forEach(cls => {
        uniqueClassesMap.set(cls.id, cls);
      });
      combinedClasses = Array.from(uniqueClassesMap.values());
      console.log("Unique combined classes count:", combinedClasses.length);

      // Recursively add missing prerequisites using the lookup map.
      await addMissingPrerequisites(combinedClasses);
      // Re-deduplicate after adding missing prerequisites.
      const updatedMap = new Map();
      combinedClasses.forEach(cls => {
        updatedMap.set(cls.id, cls);
      });
      combinedClasses = Array.from(updatedMap.values());
      console.log("Combined classes count after adding prerequisites:", combinedClasses.length);

      // Compute critical path depth.
      depthFunction = computeDepthMap(combinedClasses);

      function computePriority(cls) {
        let basePriority;
        if (cls.is_senior_class === true) {
          basePriority = 100;
        } else if (cls.category === "english") {
          basePriority = 1;
        } else if (cls.category === "major") {
          basePriority = 2;
        } else if (isReligionClass(cls)) {
          basePriority = 3;
        } else if (cls.category === "minor") {
          basePriority = 4;
        } else {
          basePriority = 10;
        }
        let availabilityBonus = 0;
        if (cls.semesters_offered && cls.semesters_offered.length > 0) {
          availabilityBonus = cls.semesters_offered.length - 1;
        }
        let depth = depthFunction(cls);
        return basePriority - availabilityBonus - depth;
      }

      // --- Schedule Non-Senior Classes (and only schedule senior classes when cumulative credits >= 90) ---
      const maxCreditsPerSemester = {
        Fall: fallWinterCredits,
        Winter: fallWinterCredits,
        Spring: springCredits
      };
      const semesterOrder = ["Winter", "Spring", "Fall"];
      const startParts = startSemester.split(" ");
      let currentSemesterType = startParts[0];
      let currentYear = parseInt(startParts[1], 10) || 2025;
      let semesterCounter = 0;
      const semesterSchedule = [];
      const scheduledClassIDs = [];
      let unscheduledClasses = combinedClasses.map(cls => ({ ...cls, scheduled: false }));
      console.log("Starting scheduling loop with", unscheduledClasses.length, "unscheduled classes.");

      // Safeguard counter to prevent infinite loops (max 15 full cycles)
      let fullCycleCount = 0;
      const maxCycleCount = 15;

      while (unscheduledClasses.length > 0 && fullCycleCount < maxCycleCount) {
        console.log(`Cycle ${fullCycleCount}: Semester ${currentSemesterType} ${currentYear}, unscheduled: ${unscheduledClasses.length}`);
        const maxCreditsAllowed = maxCreditsPerSemester[currentSemesterType];
        const semesterObj = {
          semester: currentSemesterType,
          year: currentYear,
          classes: [],
          totalCredits: 0,
          majorCount: 0,
          religionCount: 0
        };

        // Calculate cumulative scheduled credits so far.
        const cumulativeScheduledCredits = semesterSchedule.reduce((sum, sem) => sum + sem.totalCredits, 0);
        const prevScheduledIDs = new Set();
        semesterSchedule.forEach(sem => {
          sem.classes.forEach(cls => prevScheduledIDs.add(cls.id));
        });

        let addedSomething;
        let beforeLength = unscheduledClasses.length;
        do {
          addedSomething = false;
          let availableIndexes = [];
          for (let i = 0; i < unscheduledClasses.length; i++) {
            const cls = unscheduledClasses[i];
            if (cls.semesters_offered && cls.semesters_offered.includes(currentSemesterType)) {
              availableIndexes.push(i);
            }
          }
          availableIndexes.sort((i, j) => computePriority(unscheduledClasses[i]) - computePriority(unscheduledClasses[j]));

          for (let index of availableIndexes) {
            let cls = unscheduledClasses[index];
            // Check if prerequisites are met.
            if (cls.prerequisites && cls.prerequisites.length > 0) {
              const prerequisitesMet = cls.prerequisites.every(reqId => prevScheduledIDs.has(reqId));
              if (!prerequisitesMet) {
                console.log(`Skipping ${cls.class_number} due to unmet prerequisites.`);
                continue;
              }
            }
            // For EIL Level 1 or EIL Level 2, if the class is EIL 320, skip it in the first semester.
            if ((englishLevel === "EIL Level 1" || englishLevel === "EIL Level 2") &&
                cls.class_number === "EIL 320" && semesterCounter === 0) {
              console.log(`Skipping ${cls.class_number} in first semester for English level restriction.`);
              continue;
            }
            // For ENGL 101, ensure that EIL 320 is scheduled.
            if ((englishLevel === "EIL Level 1" || englishLevel === "EIL Level 2") &&
                cls.class_number === "ENGL 101") {
              let hasEIL320 = false;
              semesterSchedule.forEach(sem => {
                sem.classes.forEach(scls => {
                  if (scls.class_number === "EIL 320") {
                    hasEIL320 = true;
                  }
                });
              });
              if (!hasEIL320) {
                console.log(`Skipping ${cls.class_number} because EIL 320 is not yet scheduled.`);
                continue;
              }
            }
            // If this is a senior class and cumulative credits are less than 90, skip it.
            if (cls.is_senior_class === true && cumulativeScheduledCredits < 90) {
              console.log(`Skipping senior class ${cls.class_number} (credits ${cls.credits}) until 90 credits are reached.`);
              continue;
            }
            if (isReligionClass(cls)) {
              if (semesterObj.religionCount >= 1) {
                console.log(`Skipping ${cls.class_number} because a religion class is already scheduled in this semester.`);
                continue;
              }
            }
            if (semesterObj.totalCredits + cls.credits > maxCreditsAllowed) {
              console.log(`Skipping ${cls.class_number} due to exceeding max credits.`);
              continue;
            }

            if (cls.corequisites && cls.corequisites.length > 0) {
              let group = [cls];
              let canGroup = true;
              for (let coreqId of cls.corequisites) {
                let coreqIndex = unscheduledClasses.findIndex(x =>
                  x.id === coreqId &&
                  x.semesters_offered &&
                  x.semesters_offered.includes(currentSemesterType)
                );
                if (coreqIndex === -1) {
                  canGroup = false;
                  console.log(`Corequisite with id ${coreqId} not available for ${cls.class_number}.`);
                  break;
                }
                let coreqClass = unscheduledClasses[coreqIndex];
                if (coreqClass.prerequisites && coreqClass.prerequisites.length > 0) {
                  const coreqPrereqMet = coreqClass.prerequisites.every(reqId => prevScheduledIDs.has(reqId));
                  if (!coreqPrereqMet) {
                    canGroup = false;
                    console.log(`Corequisite ${coreqClass.class_number} prerequisites not met for group with ${cls.class_number}.`);
                    break;
                  }
                }
                if (!group.find(x => x.id === coreqClass.id)) {
                  group.push(coreqClass);
                }
              }
              // If any class in the group is senior and cumulative credits are less than 90, skip the group.
              if (group.some(item => item.is_senior_class === true) && cumulativeScheduledCredits < 90) {
                console.log(`Skipping corequisite group including ${cls.class_number} because senior class restrictions apply.`);
                continue;
              }
              if (group.some(item => isReligionClass(item)) && semesterObj.religionCount >= 1) {
                console.log(`Skipping corequisite group including ${cls.class_number} due to religion class limit.`);
                continue;
              }
              if (!canGroup) continue;
              let groupTotalCredits = group.reduce((sum, item) => sum + item.credits, 0);
              let groupMajorCount = group.filter(item => item.isMajor).length;
              if (semesterObj.totalCredits + groupTotalCredits <= maxCreditsAllowed &&
                  semesterObj.majorCount + groupMajorCount <= majorClassLimit) {
                group.forEach(item => {
                  semesterObj.classes.push(item);
                  semesterObj.totalCredits += item.credits;
                  if (item.isMajor) semesterObj.majorCount++;
                  if (isReligionClass(item)) {
                    semesterObj.religionCount++;
                  }
                  scheduledClassIDs.push(item.id);
                });
                unscheduledClasses = unscheduledClasses.filter(item => !group.some(g => g.id === item.id));
                addedSomething = true;
                break;
              }
            } else {
              semesterObj.classes.push(cls);
              semesterObj.totalCredits += cls.credits;
              if (cls.isMajor) semesterObj.majorCount++;
              if (isReligionClass(cls)) {
                semesterObj.religionCount++;
              }
              scheduledClassIDs.push(cls.id);
              unscheduledClasses.splice(index, 1);
              addedSomething = true;
              break;
            }
          }
        } while (addedSomething);

        // --- Fill Remaining Capacity (Greedy Fill) ---
        let remainingCapacity = maxCreditsAllowed - semesterObj.totalCredits;
        let fillFound;
        do {
          fillFound = false;
          for (let i = 0; i < unscheduledClasses.length; i++) {
            let cls = unscheduledClasses[i];
            if (cls.semesters_offered && cls.semesters_offered.includes(currentSemesterType) && cls.credits <= remainingCapacity) {
              if (cls.prerequisites && cls.prerequisites.length > 0) {
                const prerequisitesMet = cls.prerequisites.every(reqId => prevScheduledIDs.has(reqId));
                if (!prerequisitesMet) continue;
              }
              if (cls.is_senior_class === true && cumulativeScheduledCredits < 90) continue;
              if ((englishLevel === "EIL Level 1" || englishLevel === "EIL Level 2") && cls.class_number === "ENGL 101") {
                let hasEIL320 = false;
                semesterSchedule.forEach(sem => {
                  sem.classes.forEach(scls => {
                    if (scls.class_number === "EIL 320") {
                      hasEIL320 = true;
                    }
                  });
                });
                if (!hasEIL320) continue;
              }
              if (isReligionClass(cls)) {
                if (semesterObj.religionCount >= 1) continue;
              }
              semesterObj.classes.push(cls);
              semesterObj.totalCredits += cls.credits;
              if (cls.isMajor) semesterObj.majorCount++;
              if (isReligionClass(cls)) semesterObj.religionCount++;
              scheduledClassIDs.push(cls.id);
              unscheduledClasses.splice(i, 1);
              fillFound = true;
              break;
            }
          }
          remainingCapacity = maxCreditsAllowed - semesterObj.totalCredits;
        } while (fillFound && remainingCapacity > 0);

        if (unscheduledClasses.length === beforeLength) {
          console.warn("No classes scheduled for semester", currentSemesterType, currentYear, "– moving to next semester.");
          semesterSchedule.push(semesterObj);
          const currentIndex = semesterOrder.indexOf(currentSemesterType);
          if (currentIndex === semesterOrder.length - 1) {
            currentSemesterType = semesterOrder[0];
            currentYear++;
          } else {
            currentSemesterType = semesterOrder[currentIndex + 1];
          }
          semesterCounter++;
          fullCycleCount++;
          continue;
        }

        semesterObj.classes.sort((a, b) => {
          const numA = parseInt(a.class_number.match(/\d+/)?.[0] || "0", 10);
          const numB = parseInt(b.class_number.match(/\d+/)?.[0] || "0", 10);
          return numA - numB;
        });

        semesterSchedule.push(semesterObj);
        const currentIndex = semesterOrder.indexOf(currentSemesterType);
        if (currentIndex === semesterOrder.length - 1) {
          currentSemesterType = semesterOrder[0];
          currentYear++;
        } else {
          currentSemesterType = semesterOrder[currentIndex + 1];
        }
        semesterCounter++;
        fullCycleCount++;
      }
      if (fullCycleCount >= maxCycleCount) {
        console.error("Scheduling halted after reaching maximum cycle count. Some classes could not be scheduled.");
      }

      console.log("Semester Grouped Schedule:", semesterSchedule);

      let totalCredits = semesterSchedule.reduce((sum, sem) => sum + sem.totalCredits, 0);
      document.getElementById("total-credits").textContent = totalCredits;
      if (semesterSchedule.length > 0) {
        const lastSem = semesterSchedule[semesterSchedule.length - 1];
        document.getElementById("graduation-date").textContent = `${lastSem.semester} ${lastSem.year}`;
      } else {
        document.getElementById("graduation-date").textContent = "TBD";
      }
      document.getElementById("electives-needed").textContent = Math.max(120 - totalCredits, 0);

      renderSchedule(semesterSchedule);
    });
  } else {
    console.warn("Generate Schedule button not found.");
  }

  function renderSchedule(semesterSchedule) {
    const scheduleDiv = document.getElementById("schedule");
    scheduleDiv.innerHTML = semesterSchedule.map(sem => `
      <div class="semester animated-box">
        <h3>${sem.semester} ${sem.year} - Credits: ${sem.totalCredits}</h3>
        <ul>
          ${sem.classes.map(cls => `<li>${cls.class_number}: ${cls.class_name}</li>`).join('')}
        </ul>
      </div>
    `).join('');
    document.getElementById('schedule-container').classList.remove('hidden');
    console.log("Schedule rendered on the page.");
  }
});
