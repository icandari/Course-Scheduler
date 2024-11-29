document.getElementById("calculate-schedule").addEventListener("click", async () => {
    try {
        const major = document.getElementById("major").value;
        const minor1 = document.getElementById("minor1").value;
        const minor2 = document.getElementById("minor2").value;
        const englishLevel = document.getElementById("english-level").value; // Get English level
        const startSemester = document.getElementById("start-semester").value;
        const majorClassLimit = parseInt(document.getElementById("major-class-limit").value);
        const fallWinterCredits = parseInt(document.getElementById("fall-winter-credits").value);
        const springCredits = parseInt(document.getElementById("spring-credits").value);

        // Fetch JSON data for the programs
        const fetchJson = async (url) => {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.json();
        };

        const majorData = await fetchJson(major);
        const minor1Data = await fetchJson(minor1);
        const minor2Data = await fetchJson(minor2);
        const religionData = await fetchJson("religion/religion.json");
        const coreData = await fetchJson("core/core.json");

        // Fetch EIL courses based on English level
        let eilCourses = [];
        if (englishLevel === "academic-english-1") {
            const eilLevel1Data = await fetchJson("EIL/level1.json");
            const eilLevel2Data = await fetchJson("EIL/level2.json");

            // Add Level 1 EIL courses
            const level1Courses = eilLevel1Data.courses.map(course => ({ ...course, type: ["eil"] }));

            // Add Level 2 EIL courses
            const level2Courses = eilLevel2Data.courses.map(course => ({ ...course, type: ["eil"] }));

            // Modify Level 2 EIL courses to have Level 1 EIL courses as prerequisites
            const level1CourseNumbers = level1Courses.map(course => course.course_number);

            for (let course of level2Courses) {
                // Add Level 1 courses as prerequisites
                course.prerequisites = Array.from(new Set([...course.prerequisites, ...level1CourseNumbers]));
            }

            eilCourses = [...level1Courses, ...level2Courses];

        } else if (englishLevel === "academic-english-2") {
            const eilLevel2Data = await fetchJson("EIL/level2.json");
            eilCourses = eilLevel2Data.courses.map(course => ({ ...course, type: ["eil"] }));
            // No modification to prerequisites needed
        }
        // If 'fluent', no EIL courses are added

        // Combine courses from all sources into a single array
        const combinedCourses = [
            ...religionData.courses.map(course => ({ ...course, type: ["religion"] })),
            ...majorData.courses.map(course => ({ ...course, type: ["major"] })),
            ...minor1Data.courses.map(course => ({ ...course, type: ["minor1"] })),
            ...minor2Data.courses.map(course => ({ ...course, type: ["minor2"] })),
            ...coreData.courses.map(course => ({ ...course, type: ["core"] })),
            ...eilCourses, // Add EIL courses
        ];

        // Deduplicate courses by course_number
        const courseMap = {};
        for (const course of combinedCourses) {
            const courseNumber = course.course_number;
            if (courseMap[courseNumber]) {
                // Merge types
                courseMap[courseNumber].type = Array.from(new Set([...courseMap[courseNumber].type, ...course.type]));
                // Merge prerequisites
                courseMap[courseNumber].prerequisites = Array.from(new Set([...courseMap[courseNumber].prerequisites, ...course.prerequisites]));
                // Merge semesters_offered
                courseMap[courseNumber].semesters_offered = Array.from(new Set([...courseMap[courseNumber].semesters_offered, ...course.semesters_offered]));
            } else {
                courseMap[courseNumber] = course;
            }
        }

        // Convert the courseMap back to an array
        const allCourses = Object.values(courseMap);

        // Remove randomness: Do not shuffle the courses

        // Calculate the number of times each course is a prerequisite
        const prereqCounts = {};
        for (const course of allCourses) {
            for (const prereq of course.prerequisites) {
                prereqCounts[prereq] = (prereqCounts[prereq] || 0) + 1;
            }
        }

        // Sort courses based on priority
        allCourses.sort((a, b) => {
            // Prioritize courses that are prerequisites for many others
            const aPrereqCount = prereqCounts[a.course_number] || 0;
            const bPrereqCount = prereqCounts[b.course_number] || 0;

            if (bPrereqCount !== aPrereqCount) {
                return bPrereqCount - aPrereqCount;
            }

            // Prioritize by type: EIL > major > minor1 > minor2 > core > religion
            const typePriority = { "eil": 1, "major": 2, "minor1": 3, "minor2": 4, "core": 5, "religion": 6 };

            const aTypePriority = Math.min(...a.type.map(t => typePriority[t] || 7));
            const bTypePriority = Math.min(...b.type.map(t => typePriority[t] || 7));

            if (aTypePriority !== bTypePriority) {
                return aTypePriority - bTypePriority;
            }

            // Prioritize courses with earlier semesters offered
            const semesterOrder = { "Fall": 1, "Winter": 2, "Spring": 3 };
            const aEarliestSemester = Math.min(...a.semesters_offered.map(s => semesterOrder[s]));
            const bEarliestSemester = Math.min(...b.semesters_offered.map(s => semesterOrder[s]));

            return aEarliestSemester - bEarliestSemester;
        });

        const semesterOrder = ["Fall", "Winter", "Spring"];
        let startYear = parseInt(startSemester.split(" ")[1]);
        let currentSemesterIndex = semesterOrder.indexOf(startSemester.split(" ")[0]);
        const maxCredits = { Fall: fallWinterCredits, Winter: fallWinterCredits, Spring: springCredits };

        let schedule = []; // Final schedule
        let completedCourses = new Set();

        // Calculate total number of religion courses
        const totalReligionCourses = allCourses.filter(course => course.type.includes("religion")).length;

        // EIL courses constraints
        const eilCoursesList = allCourses.filter(course => course.type.includes("eil"));
        const eilCourseNumbers = eilCoursesList.map(course => course.course_number);

        // Initialize a counter to track semesters for EIL courses
        let eilSemestersUsed = 0;

        while (allCourses.some(course => !course.scheduled)) {
            const semesterType = semesterOrder[currentSemesterIndex % 3];
            const currentYear = startYear + Math.floor(currentSemesterIndex / 3);
            const semesterLabel = `${semesterType} ${currentYear}`;
            const currentSemester = {
                name: `Semester ${schedule.length + 1} (${semesterLabel})`,
                credits: 0,
                courses: [],
                majorCount: 0,
                relCount: 0,
                eilCount: 0,
            };

            let coursesScheduledThisSemester = false;

            // Schedule religion class if available and not already scheduled
            const availableRelCourses = allCourses.filter(course =>
                course.type.includes("religion") &&
                !course.scheduled &&
                course.semesters_offered.includes(semesterType)
            );

            if (currentSemester.relCount < 1 && availableRelCourses.length > 0) {
                for (const relCourse of availableRelCourses) {
                    const prereqsMet = relCourse.prerequisites.every(prereq =>
                        completedCourses.has(prereq)
                    );

                    if (
                        prereqsMet &&
                        currentSemester.credits + relCourse.credits <= maxCredits[semesterType]
                    ) {
                        currentSemester.courses.push(`${relCourse.course_number}: ${relCourse.course_name}`);
                        currentSemester.credits += relCourse.credits;
                        relCourse.scheduled = true;
                        coursesScheduledThisSemester = true;
                        currentSemester.relCount++;
                        break; // Only schedule one religion class per semester
                    }
                }
            }

            // Schedule EIL courses within first 4 semesters, prioritize first 2 semesters
            if (eilSemestersUsed < 4 && currentSemester.eilCount < eilCoursesList.length) {
                for (const course of eilCoursesList) {
                    if (course.scheduled) continue;

                    const prereqsMet = course.prerequisites.every(prereq =>
                        completedCourses.has(prereq)
                    );

                    if (
                        prereqsMet &&
                        course.semesters_offered.includes(semesterType) &&
                        currentSemester.credits + course.credits <= maxCredits[semesterType]
                    ) {
                        currentSemester.courses.push(`${course.course_number}: ${course.course_name}`);
                        currentSemester.credits += course.credits;
                        course.scheduled = true;
                        coursesScheduledThisSemester = true;
                        currentSemester.eilCount++;
                    }

                    if (currentSemester.credits >= maxCredits[semesterType]) break;
                }

                eilSemestersUsed++;
            }

            // Schedule other courses
            for (const course of allCourses) {
                if (course.scheduled || course.type.includes("religion") || course.type.includes("eil")) continue;

                const prereqsMet = course.prerequisites.every(prereq =>
                    completedCourses.has(prereq)
                );

                const isMajorLimitExceeded =
                    course.type.includes("major") &&
                    currentSemester.majorCount >= majorClassLimit;

                if (
                    prereqsMet &&
                    course.semesters_offered.includes(semesterType) &&
                    currentSemester.credits + course.credits <= maxCredits[semesterType] &&
                    !isMajorLimitExceeded
                ) {
                    currentSemester.courses.push(`${course.course_number}: ${course.course_name}`);
                    currentSemester.credits += course.credits;
                    course.scheduled = true;
                    coursesScheduledThisSemester = true;

                    if (course.type.includes("major")) currentSemester.majorCount++;
                }

                if (currentSemester.credits >= maxCredits[semesterType]) break;
            }

            // If there's still room, attempt to schedule core courses
            if (currentSemester.credits < maxCredits[semesterType]) {
                for (const course of allCourses) {
                    if (course.scheduled || !course.type.includes("core")) continue;

                    const prereqsMet = course.prerequisites.every(prereq =>
                        completedCourses.has(prereq)
                    );

                    if (
                        prereqsMet &&
                        course.semesters_offered.includes(semesterType) &&
                        currentSemester.credits + course.credits <= maxCredits[semesterType]
                    ) {
                        currentSemester.courses.push(`${course.course_number}: ${course.course_name}`);
                        currentSemester.credits += course.credits;
                        course.scheduled = true;
                        coursesScheduledThisSemester = true;
                    }

                    if (currentSemester.credits >= maxCredits[semesterType]) break;
                }
            }

            if (coursesScheduledThisSemester) {
                schedule.push(currentSemester);

                // At the end of the semester, add scheduled courses to completedCourses
                for (const course of allCourses) {
                    if (course.scheduled && !completedCourses.has(course.course_number)) {
                        completedCourses.add(course.course_number);
                    }
                }
            } else {
                // No courses could be scheduled; possible issue with prerequisites or course availability
                console.error(`No courses could be scheduled in ${semesterLabel}.`);
                break;
            }

            currentSemesterIndex++;
            if (schedule.length > 100) {
                console.error("Exceeded maximum semesters. Check prerequisites or course data.");
                break;
            }
        }

        // Display the schedule
        const scheduleDiv = document.getElementById("schedule");
        scheduleDiv.innerHTML = schedule.map(sem => `
            <div class="semester">
                <h3>${sem.name} - Total Credits: ${sem.credits}</h3>
                <ul>
                    ${sem.courses.map(c => `<li>${c}</li>`).join('')}
                </ul>
            </div>
        `).join('');

    } catch (error) {
        console.error("Error during scheduling process:", error);
        document.getElementById("schedule").innerHTML = "<p>An error occurred while generating the schedule. Check the console for details.</p>";
    }
});
