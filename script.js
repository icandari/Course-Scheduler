document.getElementById("calculate-schedule").addEventListener("click", async () => {
    try {
        const major = document.getElementById("major").value;
        const minor1 = document.getElementById("minor1").value;
        const minor2 = document.getElementById("minor2").value;

        // Fetch JSON data for the programs
        const fetchJson = async (url) => {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.json();
        };

        const majorData = await fetchJson(major);
        const minor1Data = await fetchJson(minor1);
        const minor2Data = await fetchJson(minor2);

        // Combine all courses
        const allCourses = [
            ...majorData.courses,
            ...minor1Data.courses,
            ...minor2Data.courses,
        ];

        console.log("All courses combined in order:", allCourses);

        const semesters = ["Fall", "Winter", "Spring"];
        const maxCredits = { Fall: 16, Winter: 16, Spring: 10 };

        let schedule = []; // Final schedule
        let completedCourses = new Set();
        let semesterIndex = 0;

        while (allCourses.some(course => !course.scheduled)) {
            const semesterType = semesters[semesterIndex % 3];
            const currentSemester = {
                name: `Semester ${semesterIndex + 1} (${semesterType})`,
                credits: 0,
                courses: [],
            };

            for (const course of allCourses) {
                if (course.scheduled) continue;

                // Check prerequisites
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
                    course.scheduled = true; // Mark the course as scheduled
                    completedCourses.add(course.course_number);
                }

                // Stop adding courses if the semester is full
                if (currentSemester.credits >= maxCredits[semesterType]) break;
            }

            // Add the semester if it has courses
            if (currentSemester.courses.length > 0) {
                schedule.push(currentSemester);
            }

            semesterIndex++;
            if (semesterIndex > 100) {
                console.error("Exceeded maximum iterations. Check prerequisites or data integrity.");
                break;
            }
        }

        // Display the schedule
        const scheduleDiv = document.getElementById("schedule");
        scheduleDiv.innerHTML = schedule.map(sem => `
            <h3>${sem.name} - Total Credits: ${sem.credits}</h3>
            <ul>${sem.courses.map(c => `<li>${c}</li>`).join('')}</ul>
        `).join('');

    } catch (error) {
        console.error("Error during scheduling process:", error);
        document.getElementById("schedule").innerHTML = "<p>An error occurred while generating the schedule. Check the console for details.</p>";
    }
});
