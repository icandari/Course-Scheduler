const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

// PostgreSQL Connection Pool Setup
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://username:password@localhost:5432/isaaccandari',
});

// Test database connection
pool.connect((err, client, release) => {
    if (err) {
        return console.error('Error acquiring client', err.stack);
    }
    client.query('SELECT NOW()', (err, result) => {
        release();
        if (err) {
            return console.error('Error executing query', err.stack);
        }
        console.log('Database connected:', result.rows);
    });
});

/**
 * @route   GET /courses/search
 * @desc    Search for courses by name or type
 * @access  Public
 */
router.get('/courses/search', async (req, res) => {
    try {
      const { query, limit = 5, course_type } = req.query;
      
      if (!query) {
        return res.status(400).json({ error: 'Query parameter is required.' });
      }
      
      // Build the base SQL query and parameters array.
      let sqlQuery = `
        SELECT 
          c.id,
          c.course_name,
          c.course_type
        FROM courses c
        WHERE c.course_name ILIKE $1
      `;
      const params = [`%${query}%`];
      
      // If a course_type is provided, add an additional filter.
      if (course_type) {
        sqlQuery += ` AND LOWER(c.course_type) = LOWER($2)`;
        params.push(course_type);
      }
      
      // Append ORDER BY and LIMIT clauses.
      sqlQuery += ` ORDER BY c.course_name LIMIT $${params.length + 1}`;
      params.push(parseInt(limit, 10) || 5);
      
      const { rows } = await pool.query(sqlQuery, params);
      res.json({ 
        count: rows.length,
        courses: rows 
      });
    } catch (error) {
      console.error('❌ Error searching courses:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });
  

// Move this route BEFORE any route with pattern /courses/:course_id/sections/:section_id
router.put('/courses/:course_id/sections/reorder', async (req, res) => {
    try {
        // Manually parse course_id as an integer
        const courseId = parseInt(req.params.course_id, 10);
        
        if (isNaN(courseId) || courseId <= 0) {
            return res.status(400).json({ error: 'Invalid course_id provided' });
        }
        
        // Validate sections data
        const { sections } = req.body;
        
        if (!Array.isArray(sections) || sections.length === 0) {
            return res.status(400).json({ error: 'Invalid sections data provided' });
        }
        
        // Begin transaction
        await pool.query('BEGIN');
        
        try {
            // Update each section's display order
            for (const section of sections) {
                const sectionId = parseInt(section.section_id, 10);
                const displayOrder = parseInt(section.display_order, 10);
                
                if (isNaN(sectionId) || isNaN(displayOrder)) {
                    throw new Error('Invalid section_id or display_order value');
                }
                
                await pool.query(
                    'UPDATE course_sections SET display_order = $1 WHERE id = $2 AND course_id = $3',
                    [displayOrder, sectionId, courseId]
                );
            }
            
            await pool.query('COMMIT');
            res.json({ message: 'Section order updated successfully' });
        } catch (error) {
            await pool.query('ROLLBACK');
            throw error;
        }
    } catch (error) {
        console.error('Error reordering sections:', error);
        res.status(500).json({ error: error.message || 'Failed to update section order' });
    }
});

router.get('/courses', async (req, res) => {
    try {
        const { course_name, course_id } = req.query;
        let query = `
            SELECT 
                c.id,
                c.course_name,
                c.course_type,
                json_agg(DISTINCT jsonb_build_object(
                    'id', cs.id,
                    'section_name', cs.section_name,
                    'credits_required', cs.credits_required,
                    'is_required', cs.is_required,
                    'credits_needed_to_take', cs.credits_needed_to_take,
                    'classes', (
                        SELECT json_agg(json_build_object(
                            'id', cl.id,
                            'class_name', cl.class_name,
                            'class_number', cl.class_number,
                            'semesters_offered', cl.semesters_offered,
                            'prerequisites', cl.prerequisites,
                            'corequisites', cl.corequisites,
                            'credits', cl.credits,
                            'days_offered', cl.days_offered,
                            'times_offered', cl.times_offered,
                            'is_senior_class', cl.is_senior_class,
                            'restrictions', cl.restrictions,
                            'description', cl.description,
                            'is_elective', cic2.is_elective,
                            'elective_group', CASE 
                                WHEN cic2.elective_group_id IS NOT NULL THEN json_build_object(
                                    'id', eg.id,
                                    'name', eg.group_name,
                                    'required_count', eg.required_count
                                )
                                ELSE NULL
                            END
                        ))
                        FROM classes_in_course cic2
                        JOIN classes cl ON cl.id = cic2.class_id
                        LEFT JOIN elective_groups eg ON eg.id = cic2.elective_group_id
                        WHERE cic2.course_id = c.id AND cic2.section_id = cs.id
                    )
                )) as sections
            FROM courses c
            LEFT JOIN course_sections cs ON cs.course_id = c.id
            LEFT JOIN classes_in_course cic ON cic.course_id = c.id
        `;

        const values = [];
        const conditions = [];
        let count = 1;

        if (course_id) {
            conditions.push(`c.id = $${count}`);
            values.push(course_id);
            count++;
        }

        if (course_name) {
            conditions.push(`c.course_name ILIKE $${count}`);
            values.push(`%${course_name}%`);
            count++;
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' GROUP BY c.id';

        const { rows } = await pool.query(query, values);

        // Format response
        const formattedRows = rows.map(row => ({
            id: row.id,
            course_name: row.course_name,
            course_type: row.course_type,
            sections: row.sections.filter(section => section !== null).map(section => ({
                id: section.id,
                section_name: section.section_name,
                credits_required: section.credits_required,
                is_required: section.is_required,
                credits_needed_to_take: section.credits_needed_to_take,
                classes: section.classes || []
            }))
        }));

        if (course_id) {
            const course = formattedRows.find(c => c.id == course_id);
            if (course) {
                res.json(course);
            } else {
                res.status(404).json({ error: 'Course not found.' });
            }
        } else {
            res.json(formattedRows);
        }
    } catch (error) {
        console.error('❌ Error fetching courses:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Update the query in the GET /courses/:course_id route:

router.get('/courses/:course_id', async (req, res) => {
    try {
        const { course_id } = req.params;
        const query = `
            SELECT 
                c.id,
                c.course_name,
                c.course_type,
                (SELECT json_agg(section_data)
                 FROM (
                     SELECT
                         cs.id,
                         cs.section_name,
                         cs.credits_required,
                         cs.is_required,
                         cs.credits_needed_to_take,
                         cs.display_order,
                         (SELECT json_agg(json_build_object(
                             'id', cl.id,
                             'class_name', cl.class_name,
                             'class_number', cl.class_number,
                             'semesters_offered', cl.semesters_offered,
                             'prerequisites', cl.prerequisites,
                             'corequisites', cl.corequisites,
                             'days_offered', cl.days_offered,
                             'times_offered', cl.times_offered,
                             'is_senior_class', cl.is_senior_class,
                             'restrictions', cl.restrictions,
                             'description', cl.description,
                             'credits', cl.credits,
                             'is_elective', cic2.is_elective,
                             'elective_group', CASE 
                                 WHEN cic2.elective_group_id IS NOT NULL THEN json_build_object(
                                     'id', eg.id,
                                     'name', eg.group_name,
                                     'required_count', eg.required_count
                                 )
                                 ELSE NULL
                             END
                         ))
                         FROM classes_in_course cic2
                         JOIN classes cl ON cl.id = cic2.class_id
                         LEFT JOIN elective_groups eg ON eg.id = cic2.elective_group_id
                         WHERE cic2.course_id = c.id AND cic2.section_id = cs.id
                         ) as classes
                     FROM course_sections cs
                     WHERE cs.course_id = c.id
                     ORDER BY COALESCE(cs.display_order, 999999), cs.id
                 ) as section_data
                ) as sections
            FROM courses c
            WHERE c.id = $1
        `;

        const { rows } = await pool.query(query, [course_id]);

        if (rows.length > 0) {
            // Format the response
            const course = {
                id: rows[0].id,
                course_name: rows[0].course_name,
                course_type: rows[0].course_type,
                sections: rows[0].sections || []
            };
            res.json(course);
        } else {
            res.status(404).json({ error: 'Course not found.' });
        }
    } catch (error) {
        console.error('❌ Error fetching specific course:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


/**
 * @route   DELETE /courses/:course_id/sections/:section_id/classes/:class_id
 * @desc    Delete a class from a specific section
 * @access  Public
 */
router.delete('/courses/:course_id/sections/:section_id/classes/:class_id', async (req, res) => {
    try {
        const courseId = parseInt(req.params.course_id, 10);
        const sectionId = parseInt(req.params.section_id, 10);
        const classId = parseInt(req.params.class_id, 10);

        // Add course validation
        const courseCheck = await pool.query('SELECT id FROM courses WHERE id = $1', [courseId]);
        if (courseCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Course not found' });
        }

        // Add section validation
        const sectionCheck = await pool.query(
            'SELECT id FROM course_sections WHERE id = $1 AND course_id = $2',
            [sectionId, courseId]
        );
        if (sectionCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Section not found in this course' });
        }

        // Existing validation
        const checkQuery = `
            SELECT * FROM classes_in_course
            WHERE course_id = $1 AND section_id = $2 AND class_id = $3
        `;
        const { rows: assocRows } = await pool.query(checkQuery, [courseId, sectionId, classId]);

        if (assocRows.length === 0) {
            return res.status(404).json({ error: 'Class not found in this section' });
        }

        if (isNaN(courseId) || isNaN(sectionId) || isNaN(classId)) {
            return res.status(400).json({ 
                error: 'course_id, section_id, and class_id must be valid integers.' 
            });
        }

        // Begin transaction
        await pool.query('BEGIN');

        try {
            // Verify the association exists
            const checkQuery = `
                SELECT * FROM classes_in_course
                WHERE course_id = $1 AND section_id = $2 AND class_id = $3
            `;
            const { rows: assocRows } = await pool.query(checkQuery, [courseId, sectionId, classId]);

            if (assocRows.length === 0) {
                throw new Error('Class not found in this section.');
            }

            // Only delete the association, not the class itself
            const deleteQuery = `
                DELETE FROM classes_in_course
                WHERE course_id = $1 AND section_id = $2 AND class_id = $3
                RETURNING *
            `;
            const { rows: deleted } = await pool.query(deleteQuery, [courseId, sectionId, classId]);

            await pool.query('COMMIT');

            res.json({
                message: 'Class successfully removed from section.',
                data: deleted[0]
            });

        } catch (err) {
            await pool.query('ROLLBACK');
            throw err;
        }

    } catch (error) {
        console.error('❌ Error removing class from section:', error);
        res.status(400).json({ error: error.message || 'Internal Server Error' });
    }
});

/**
 * @route   GET /classes/search
 * @desc    Search for classes by class_number or class_name, including section information
 * @access  Public
 */
router.get('/classes/search', async (req, res) => {
    const { query, limit } = req.query;

    if (!query) {
        return res.status(400).json({ error: 'Query parameter is required.' });
    }

    const searchLimit = parseInt(limit, 10) || 10;

    try {
        const searchQuery = `
            SELECT DISTINCT ON (c.id)
                c.id,
                c.class_number,
                c.class_name,
                c.credits,
                c.semesters_offered,
                c.is_senior_class,  -- <-- Added this field
                c.restrictions,
                c.description,
                json_agg(DISTINCT jsonb_build_object(
                    'course_id', co.id,
                    'course_name', co.course_name,
                    'section_id', cs.id,
                    'section_name', cs.section_name,
                    'is_required', cs.is_required,
                    'credits_needed_to_take', cs.credits_needed_to_take,
                    'is_elective', cic.is_elective,
                    'elective_group', CASE 
                        WHEN cic.elective_group_id IS NOT NULL THEN jsonb_build_object(
                            'id', eg.id,
                            'name', eg.group_name,
                            'required_count', eg.required_count
                        )
                        ELSE NULL
                    END
                )) FILTER (WHERE co.id IS NOT NULL) as course_sections
            FROM classes c
            LEFT JOIN classes_in_course cic ON c.id = cic.class_id
            LEFT JOIN courses co ON cic.course_id = co.id
            LEFT JOIN course_sections cs ON cic.section_id = cs.id
            LEFT JOIN elective_groups eg ON cic.elective_group_id = eg.id
            WHERE 
                c.class_number ILIKE $1 
                OR c.class_name ILIKE $1
            GROUP BY c.id
            ORDER BY c.id, c.class_number ASC
            LIMIT $2
        `;
        
        const searchValue = [`%${query}%`, searchLimit];
        const { rows } = await pool.query(searchQuery, searchValue);

        // Format the response
        const formattedRows = rows.map(row => ({
            id: row.id,
            class_number: row.class_number,
            class_name: row.class_name,
            credits: row.credits,
            semesters_offered: row.semesters_offered,
            is_senior_class: row.is_senior_class,  // <-- Include the senior flag here
            restrictions: row.restrictions,
            description: row.description,
            course_sections: row.course_sections || []
        }));

        res.json({ 
            count: formattedRows.length,
            classes: formattedRows 
        });
    } catch (error) {
        console.error('❌ Error searching classes:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.get('/classes/:class_id', async (req, res) => {
    const { class_id } = req.params;

    try {
        const classIdNum = parseInt(class_id, 10);
        if (isNaN(classIdNum)) {
            return res.status(400).json({ error: 'class_id must be an integer.' });
        }

        // Updated query with proper type casting
        const classQuery = `
            SELECT 
                c.*,
                json_agg(DISTINCT prereq.*) FILTER (WHERE prereq.id IS NOT NULL) as prerequisites,
                json_agg(DISTINCT coreq.*) FILTER (WHERE coreq.id IS NOT NULL) as corequisites
            FROM classes c
            LEFT JOIN LATERAL (
                SELECT p.id, p.class_number, p.class_name
                FROM classes p
                WHERE p.id = ANY(c.prerequisites::int[])
            ) prereq ON true
            LEFT JOIN LATERAL (
                SELECT co.id, co.class_number, co.class_name
                FROM classes co
                WHERE co.id = ANY(c.corequisites::int[])
            ) coreq ON true
            WHERE c.id = $1::int
            GROUP BY c.id
        `;

        const { rows: [classData] } = await pool.query(classQuery, [classIdNum]);

        if (!classData) {
            return res.status(404).json({ error: 'Class not found.' });
        }

        // Format prerequisites and corequisites arrays
        const prerequisites = Array.isArray(classData.prerequisites) && classData.prerequisites[0] !== null
            ? classData.prerequisites 
            : [];
        const corequisites = Array.isArray(classData.corequisites) && classData.corequisites[0] !== null
            ? classData.corequisites 
            : [];

        const response = {
            id: classData.id,
            class_number: classData.class_number,
            class_name: classData.class_name,
            semesters_offered: classData.semesters_offered,
            credits: classData.credits,
            is_senior_class: classData.is_senior_class,  // <-- Include the senior flag here
            restrictions: classData.restrictions,
            description: classData.description,
            prerequisites: prerequisites,
            corequisites: corequisites,
            days_offered: classData.days_offered,
            times_offered: classData.times_offered || [],
            created_at: classData.created_at,
            updated_at: classData.updated_at
        };

        res.json(response);

    } catch (error) {
        console.error('❌ Error fetching class details:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.put('/classes/:class_id', async (req, res) => {
    try {
        const { class_id } = req.params;
        const classIdNum = parseInt(class_id, 10);

        if (isNaN(classIdNum)) {
            return res.status(400).json({ error: 'class_id must be a valid integer.' });
        }

        const {
            class_number,
            class_name,
            semesters_offered = [],
            prerequisites = [],
            corequisites = [],
            credits = 0,
            days_offered = [],
            times_offered = null,
            is_senior_class = false,
            restrictions = null,
            description = null
        } = req.body;

        if (!class_number || !class_name) {
            return res.status(400).json({ 
                error: 'class_number and class_name are required.' 
            });
        }

        await pool.query('BEGIN');

        try {
            // Validate prerequisites and corequisites exist
            if (prerequisites.length > 0 || corequisites.length > 0) {
                const allIds = [...new Set([...prerequisites, ...corequisites])];
                const checkQuery = `
                    SELECT id FROM classes 
                    WHERE id = ANY($1::int[])
                `;
                const { rows: existingClasses } = await pool.query(checkQuery, [allIds]);
                
                if (existingClasses.length !== allIds.length) {
                    throw new Error('One or more prerequisites or corequisites do not exist');
                }
            }

            const updateQuery = `
                UPDATE classes
                SET
                    class_number = $1,
                    class_name = $2,
                    semesters_offered = $3,
                    prerequisites = $4,
                    corequisites = $5,
                    credits = $6,
                    days_offered = $7,
                    times_offered = $8,
                    is_senior_class = $9,
                    restrictions = $10,
                    description = $11,
                    updated_at = NOW()
                WHERE id = $12
                RETURNING id, class_number, class_name, semesters_offered,
                    prerequisites, corequisites, credits, days_offered, times_offered, is_senior_class, restrictions, description
            `;

            const { rows: [updatedClass] } = await pool.query(updateQuery, [
                class_number,
                class_name,
                semesters_offered,
                prerequisites,
                corequisites,
                credits,
                days_offered,
                times_offered,
                is_senior_class,
                restrictions,
                description,
                classIdNum
            ]);

            if (!updatedClass) {
                throw new Error('Class not found');
            }

            // Fetch full prerequisite details
            const prereqQuery = `
                SELECT id, class_number, class_name
                FROM classes
                WHERE id = ANY($1::int[])
            `;
            const { rows: prerequisites_details } = prerequisites.length > 0 ?
                await pool.query(prereqQuery, [prerequisites]) :
                { rows: [] };

            // Fetch full corequisite details
            const { rows: corequisites_details } = corequisites.length > 0 ?
                await pool.query(prereqQuery, [corequisites]) :
                { rows: [] };

            await pool.query('COMMIT');

            res.json({
                ...updatedClass,
                prerequisites: prerequisites_details,
                corequisites: corequisites_details,
                message: 'Class updated successfully'
            });

        } catch (error) {
            await pool.query('ROLLBACK');
            throw error;
        }
    } catch (error) {
        console.error('Error updating class:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST route for creating new classes
router.post('/classes', async (req, res) => {
    try {
        const {
            class_number,
            class_name,
            semesters_offered = [],
            prerequisites = [],
            corequisites = [],
            credits = 0,
            days_offered = [],
            times_offered = [],
            is_senior_class = false,
            restrictions = null,
            description = null
        } = req.body;

        if (!class_number || !class_name) {
            return res.status(400).json({ 
                error: 'class_number and class_name are required.' 
            });
        }

        await pool.query('BEGIN');

        try {
            // Convert the prerequisites and corequisites to integer arrays
            const prereqIds = prerequisites.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
            const coreqIds = corequisites.map(id => parseInt(id, 10)).filter(id => !isNaN(id));

            // Validate prerequisites and corequisites exist
            if (prereqIds.length > 0 || coreqIds.length > 0) {
                const allIds = [...new Set([...prereqIds, ...coreqIds])];
                const checkQuery = `
                    SELECT id FROM classes 
                    WHERE id = ANY($1::int[])
                `;
                const { rows: existingClasses } = await pool.query(checkQuery, [allIds]);
                
                if (existingClasses.length !== allIds.length) {
                    throw new Error('One or more prerequisites or corequisites do not exist');
                }
            }

            // Check for duplicate class_number
            const duplicateCheck = await pool.query(
                'SELECT id FROM classes WHERE class_number = $1',
                [class_number]
            );

            if (duplicateCheck.rows.length > 0) {
                throw new Error('A class with this number already exists');
            }

            const insertQuery = `
                INSERT INTO classes 
                (class_number, class_name, semesters_offered, prerequisites, 
                 corequisites, credits, days_offered, times_offered, is_senior_class, restrictions, description)
                VALUES ($1, $2, $3, $4::int[], $5::int[], $6, $7, $8, $9, $10, $11)
                RETURNING id, class_number, class_name, semesters_offered,
                    prerequisites, corequisites, credits, days_offered, times_offered,
                    is_senior_class, restrictions, description
            `;

            const { rows: [newClass] } = await pool.query(insertQuery, [
                class_number,
                class_name,
                semesters_offered,
                prereqIds,
                coreqIds,
                credits,
                days_offered,
                times_offered,
                is_senior_class,
                restrictions,
                description
            ]);

            // Fetch full prerequisite details
            const prereqQuery = `
                SELECT id, class_number, class_name
                FROM classes
                WHERE id = ANY($1::int[])
            `;
            const { rows: prerequisites_details } = prereqIds.length > 0 ?
                await pool.query(prereqQuery, [prereqIds]) :
                { rows: [] };

            // Fetch full corequisite details
            const { rows: corequisites_details } = coreqIds.length > 0 ?
                await pool.query(prereqQuery, [coreqIds]) :
                { rows: [] };

            await pool.query('COMMIT');

            res.status(201).json({
                ...newClass,
                prerequisites: prerequisites_details,
                corequisites: corequisites_details,
                message: 'Class created successfully'
            });

        } catch (error) {
            await pool.query('ROLLBACK');
            throw error;
        }
    } catch (error) {
        console.error('Error creating class:', error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/courses/:course_id/classes', async (req, res) => {
    try {
        const courseId = parseInt(req.params.course_id, 10);
        if (isNaN(courseId)) {
            return res.status(400).json({ error: 'course_id must be an integer.' });
        }

        // Begin transaction
        await pool.query('BEGIN');

        try {
            if (req.body.class_id) {
                // **Associating an Existing Class**
                const {
                    class_id,
                    section_id,
                    is_elective = false,
                    elective_group_id = null
                } = req.body;

                const classId = parseInt(class_id, 10);
                if (isNaN(classId)) {
                    throw new Error('class_id must be an integer.');
                }

                // Validate section exists in course
                if (section_id) {
                    const sectionCheckQuery = `
                        SELECT * FROM course_sections 
                        WHERE id = $1 AND course_id = $2
                    `;
                    const { rows: sectionRows } = await pool.query(sectionCheckQuery, [section_id, courseId]);
                    if (sectionRows.length === 0) {
                        throw new Error('Section not found in the current course.');
                    }
                }

                // Check if the class exists
                const classCheckQuery = `SELECT * FROM classes WHERE id = $1`;
                const { rows: classRows } = await pool.query(classCheckQuery, [classId]);
                if (classRows.length === 0) {
                    throw new Error('Class not found.');
                }

                // Check if association already exists
                const assocCheckQuery = `
                    SELECT * FROM classes_in_course
                    WHERE course_id = $1 AND class_id = $2
                `;
                const { rows: assocRows } = await pool.query(assocCheckQuery, [courseId, classId]);
                if (assocRows.length > 0) {
                    throw new Error('Class is already associated with this course.');
                }

                // Insert association with section and elective information
                const insertAssocQuery = `
                    INSERT INTO classes_in_course 
                    (course_id, class_id, section_id, is_elective, elective_group_id)
                    VALUES ($1, $2, $3, $4, $5)
                    RETURNING *
                `;
                const { rows: newAssoc } = await pool.query(insertAssocQuery, [
                    courseId,
                    classId,
                    section_id,
                    is_elective,
                    elective_group_id
                ]);

                await pool.query('COMMIT');
                res.json({ 
                    message: 'Class associated successfully with the course.',
                    data: newAssoc[0]
                });

            } else {
                // **Creating and Associating a New Class**
                const { 
                    class_number,
                    class_name,
                    semesters_offered = [],
                    prerequisites = [],
                    corequisites = [],
                    credits = 0,
                    days_offered = [],
                    times_offered = [],
                    section_id,
                    is_elective = false,
                    elective_group_id = null,
                    is_senior_class = false,  // <-- New field included here
                    restrictions = null,
                    description = null
                } = req.body;

                if (!class_number || !class_name) {
                    throw new Error('class_number and class_name are required for creating a new class.');
                }

                // Insert new class — note the addition of is_senior_class
                const insertClassQuery = `
                    INSERT INTO classes 
                    (class_number, class_name, semesters_offered, prerequisites, 
                     corequisites, credits, days_offered, times_offered, is_senior_class, restrictions, description)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                    RETURNING *
                `;
                const insertClassValues = [
                    class_number,
                    class_name,
                    semesters_offered,
                    prerequisites,
                    corequisites,
                    credits,
                    days_offered,
                    times_offered,
                    is_senior_class,  // <-- Passed as the 9th value
                    restrictions,
                    description
                ];

                const { rows: newClass } = await pool.query(insertClassQuery, insertClassValues);
                const newClassId = newClass[0].id;

                // Create association with section and elective information
                const insertAssocQuery = `
                    INSERT INTO classes_in_course 
                    (course_id, class_id, section_id, is_elective, elective_group_id)
                    VALUES ($1, $2, $3, $4, $5)
                    RETURNING *
                `;
                const { rows: newAssoc } = await pool.query(insertAssocQuery, [
                    courseId,
                    newClassId,
                    section_id,
                    is_elective,
                    elective_group_id
                ]);

                await pool.query('COMMIT');
                res.json({ 
                    message: 'New class created and associated successfully!',
                    data: {
                        class: newClass[0],
                        association: newAssoc[0]
                    }
                });
            }
        } catch (err) {
            await pool.query('ROLLBACK');
            throw err;
        }
    } catch (error) {
        console.error('❌ Error in POST /courses/:course_id/classes:', error);
        res.status(400).json({ error: error.message || 'Internal Server Error' });
    }
});

// *****************
// NEW ENDPOINT: GET ALL CLASSES
// This endpoint returns all classes regardless of course.
router.get('/classes', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM classes');
        res.json(rows);
    } catch (error) {
        console.error('Error fetching all classes:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


router.post('/courses', async (req, res) => {
    const { course_name, course_type, sections } = req.body;

    // Basic validation
    if (!course_name || !course_type) {
        return res.status(400).json({ error: 'Course name and type are required.' });
    }

    // Begin transaction
    await pool.query('BEGIN');

    try {
        // Insert the new course
        const insertCourseQuery = `
            INSERT INTO courses (course_name, course_type)
            VALUES ($1, $2)
            RETURNING id, course_name, course_type
        `;
        const courseValues = [course_name, course_type];
        const { rows: courseRows } = await pool.query(insertCourseQuery, courseValues);
        const newCourse = courseRows[0];

        // If sections are provided, create them
        if (sections && Array.isArray(sections)) {
            for (const section of sections) {
                // Create section
                const insertSectionQuery = `
                    INSERT INTO course_sections 
                    (course_id, section_name, credits_required, is_required, credits_needed_to_take)
                    VALUES ($1, $2, $3, $4, $5)
                    RETURNING id
                `;
                const sectionValues = [
                    newCourse.id,
                    section.section_name,
                    section.credits_required,
                    section.is_required || true,
                    section.credits_needed_to_take
                ];
                const { rows: sectionRows } = await pool.query(insertSectionQuery, sectionValues);
                const sectionId = sectionRows[0].id;

                // If section has an elective group, create it
                if (section.elective_group) {
                    const insertGroupQuery = `
                        INSERT INTO elective_groups 
                        (section_id, group_name, required_count)
                        VALUES ($1, $2, $3)
                        RETURNING id
                    `;
                    const groupValues = [
                        sectionId,
                        section.elective_group.name,
                        section.elective_group.required_count
                    ];
                    await pool.query(insertGroupQuery, groupValues);
                }
            }
        }

        await pool.query('COMMIT');

        // Fetch the complete course data with sections
        const getCourseQuery = `
            SELECT 
                c.id,
                c.course_name,
                c.course_type,
                json_agg(DISTINCT jsonb_build_object(
                    'id', cs.id,
                    'section_name', cs.section_name,
                    'credits_required', cs.credits_required,
                    'is_required', cs.is_required,
                    'credits_needed_to_take', cs.credits_needed_to_take,
                    'elective_group', CASE 
                        WHEN eg.id IS NOT NULL THEN jsonb_build_object(
                            'id', eg.id,
                            'name', eg.group_name,
                            'required_count', eg.required_count
                        )
                        ELSE NULL
                    END
                )) FILTER (WHERE cs.id IS NOT NULL) as sections
            FROM courses c
            LEFT JOIN course_sections cs ON cs.course_id = c.id
            LEFT JOIN elective_groups eg ON eg.section_id = cs.id
            WHERE c.id = $1
            GROUP BY c.id
        `;
        const { rows: finalCourse } = await pool.query(getCourseQuery, [newCourse.id]);

        res.status(201).json({
            message: 'Course created successfully.',
            course: {
                ...finalCourse[0],
                sections: finalCourse[0].sections || []
            }
        });

    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('❌ Error creating course:', error);

        if (error.code === '23505') {
            return res.status(409).json({ error: 'Course with this name already exists.' });
        }

        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.get('/courses/:course_id/classes/:class_id', async (req, res) => {
    const { course_id, class_id } = req.params;

    try {
        // Validate course_id and class_id
        const courseIdNum = parseInt(course_id, 10);
        const classIdNum = parseInt(class_id, 10);
        if (isNaN(courseIdNum) || isNaN(classIdNum)) {
            return res.status(400).json({ error: 'course_id and class_id must be integers.' });
        }

        // First get the basic class details with section info
        const classQuery = `
            SELECT 
                c.*,
                cs.id as section_id,
                cs.section_name,
                cs.credits_required,
                cs.is_required,
                cs.credits_needed_to_take,
                cic.is_elective,
                eg.id as elective_group_id,
                eg.group_name,
                eg.required_count
            FROM classes c
            JOIN classes_in_course cic ON c.id = cic.class_id
            LEFT JOIN course_sections cs ON cs.id = cic.section_id
            LEFT JOIN elective_groups eg ON eg.id = cic.elective_group_id
            WHERE cic.course_id = $1 AND c.id = $2
        `;
        
        const { rows: [classDetails] } = await pool.query(classQuery, [courseIdNum, classIdNum]);
        
        if (!classDetails) {
            return res.status(404).json({ 
                error: 'Class not found or not associated with this course.' 
            });
        }

        // Fetch prerequisites details
        const prereqQuery = `
            SELECT id, class_number, class_name
            FROM classes
            WHERE id = ANY($1::int[])
        `;
        
        const { rows: prerequisites } = classDetails.prerequisites?.length > 0 
            ? await pool.query(prereqQuery, [classDetails.prerequisites])
            : { rows: [] };

        // Fetch corequisites details
        const { rows: corequisites } = classDetails.corequisites?.length > 0
            ? await pool.query(prereqQuery, [classDetails.corequisites])
            : { rows: [] };

        // Prepare the response
        const response = {
            id: classDetails.id,
            class_number: classDetails.class_number,
            class_name: classDetails.class_name,
            semesters_offered: classDetails.semesters_offered,
            credits: classDetails.credits,
            is_senior_class: classDetails.is_senior_class, // <-- Include is_senior_class
            restrictions: classDetails.restrictions,
            description: classDetails.description,
            prerequisites: prerequisites,
            corequisites: corequisites,
            days_offered: classDetails.days_offered,
            times_offered: classDetails.times_offered || [],
            section: {
                id: classDetails.section_id,
                name: classDetails.section_name,
                credits_required: classDetails.credits_required,
                is_required: classDetails.is_required,
                credits_needed_to_take: classDetails.credits_needed_to_take,
                is_elective: classDetails.is_elective,
                elective_group: classDetails.elective_group_id ? {
                    id: classDetails.elective_group_id,
                    name: classDetails.group_name,
                    required_count: classDetails.required_count
                } : null
            },
            created_at: classDetails.created_at,
            updated_at: classDetails.updated_at
        };

        res.json(response);

    } catch (error) {
        console.error('❌ Error fetching class details:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

/**
 * @route   POST /courses/:course_id/sections
 * @desc    Create a new section for a course
 * @access  Public
 */
router.post('/courses/:course_id/sections', async (req, res) => {
    try {
        const courseId = parseInt(req.params.course_id, 10);
        if (isNaN(courseId)) {
            return res.status(400).json({ error: 'course_id must be an integer.' });
        }

        const {
            section_name,
            credits_required = 0,
            is_required = true,
            credits_needed_to_take = null,
            elective_group = null
        } = req.body;

        // Begin transaction
        await pool.query('BEGIN');

        try {
            // Find the highest existing display_order
            const orderQuery = `
                SELECT COALESCE(MAX(display_order), 0) as max_order 
                FROM course_sections 
                WHERE course_id = $1
            `;
            const { rows: orderRows } = await pool.query(orderQuery, [courseId]);
            const newDisplayOrder = parseInt(orderRows[0].max_order, 10) + 1;

            // Create section with display_order
            const insertSectionQuery = `
                INSERT INTO course_sections 
                (course_id, section_name, credits_required, is_required, credits_needed_to_take, display_order)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *
            `;
            const sectionValues = [courseId, section_name, credits_required, is_required, credits_needed_to_take, newDisplayOrder];
            const { rows: newSection } = await pool.query(insertSectionQuery, sectionValues);

            // If elective group is provided, create it
            let electiveGroupData = null;
            if (elective_group && !is_required) {
                const insertGroupQuery = `
                    INSERT INTO elective_groups 
                    (section_id, group_name, required_count)
                    VALUES ($1, $2, $3)
                    RETURNING *
                `;
                const groupValues = [
                    newSection[0].id,
                    elective_group.name,
                    elective_group.required_count
                ];
                const { rows: newGroup } = await pool.query(insertGroupQuery, groupValues);
                electiveGroupData = newGroup[0];
            }

            await pool.query('COMMIT');

            res.status(201).json({
                message: 'Section created successfully.',
                data: {
                    ...newSection[0],
                    elective_group: electiveGroupData
                }
            });

        } catch (err) {
            await pool.query('ROLLBACK');
            throw err;
        }

    } catch (error) {
        console.error('❌ Error creating section:', error);
        res.status(400).json({ error: error.message || 'Internal Server Error' });
    }
});



/**
 * @route   DELETE /courses/:course_id/sections/:section_id
 * @desc    Delete a section and remove all class associations
 * @access  Public
 */
router.delete('/courses/:course_id/sections/:section_id', async (req, res) => {
    try {
        const courseId = parseInt(req.params.course_id, 10);
        const sectionId = parseInt(req.params.section_id, 10);

        if (isNaN(courseId) || isNaN(sectionId)) {
            return res.status(400).json({ 
                error: 'course_id and section_id must be valid integers.' 
            });
        }

        // Begin transaction
        await pool.query('BEGIN');

        try {
            // Verify section belongs to course
            const sectionCheckQuery = `
                SELECT * FROM course_sections 
                WHERE id = $1 AND course_id = $2
            `;
            const { rows: sectionRows } = await pool.query(sectionCheckQuery, [sectionId, courseId]);
            
            if (sectionRows.length === 0) {
                throw new Error('Section not found in this course.');
            }

            // Delete associated elective groups first (if any)
            await pool.query(
                'DELETE FROM elective_groups WHERE section_id = $1',
                [sectionId]
            );

            // Remove class associations
            await pool.query(
                'DELETE FROM classes_in_course WHERE section_id = $1',
                [sectionId]
            );

            // Delete the section
            const deleteQuery = `
                DELETE FROM course_sections 
                WHERE id = $1 AND course_id = $2
                RETURNING *
            `;
            const { rows: deleted } = await pool.query(deleteQuery, [sectionId, courseId]);

            if (deleted.length === 0) {
                throw new Error('Failed to delete section.');
            }

            await pool.query('COMMIT');

            res.json({
                message: 'Section deleted successfully',
                data: deleted[0]
            });

        } catch (err) {
            await pool.query('ROLLBACK');
            throw err;
        }

    } catch (error) {
        console.error('❌ Error deleting section:', error);
        res.status(400).json({ error: error.message || 'Internal Server Error' });
    }
});

/**
 * @route   POST /api/classes
 * @desc    Create a new class without course association
 * @access  Public
 */
// POST route for creating new classes
router.post('/classes', async (req, res) => {
    try {
        const {
            class_number,
            class_name,
            semesters_offered = [],
            prerequisites = [],
            corequisites = [],
            credits = 0,
            days_offered = [],
            times_offered = []
        } = req.body;

        if (!class_number || !class_name) {
            return res.status(400).json({ 
                error: 'class_number and class_name are required.' 
            });
        }

        await pool.query('BEGIN');

        try {
            // Validate prerequisites and corequisites exist
            if (prerequisites.length > 0 || corequisites.length > 0) {
                const allIds = [...new Set([...prerequisites, ...corequisites])];
                const checkQuery = `
                    SELECT id FROM classes 
                    WHERE id = ANY($1::int[])
                `;
                const { rows: existingClasses } = await pool.query(checkQuery, [allIds]);
                
                if (existingClasses.length !== allIds.length) {
                    throw new Error('One or more prerequisites or corequisites do not exist');
                }
            }

            // Check for duplicate class_number
            const duplicateCheck = await pool.query(
                'SELECT id FROM classes WHERE class_number = $1',
                [class_number]
            );

            if (duplicateCheck.rows.length > 0) {
                throw new Error('A class with this number already exists');
            }

            const insertQuery = `
                INSERT INTO classes 
                (class_number, class_name, semesters_offered, prerequisites, 
                 corequisites, credits, days_offered, times_offered)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING id, class_number, class_name, semesters_offered,
                    prerequisites, corequisites, credits, days_offered, times_offered
            `;

            const { rows: [newClass] } = await pool.query(insertQuery, [
                class_number,
                class_name,
                semesters_offered,
                prerequisites,
                corequisites,
                credits,
                days_offered,
                times_offered
            ]);

            // Fetch full prerequisite details
            const prereqQuery = `
                SELECT id, class_number, class_name
                FROM classes
                WHERE id = ANY($1::int[])
            `;
            const { rows: prerequisites_details } = prerequisites.length > 0 ?
                await pool.query(prereqQuery, [prerequisites]) :
                { rows: [] };

            // Fetch full corequisite details
            const { rows: corequisites_details } = corequisites.length > 0 ?
                await pool.query(prereqQuery, [corequisites]) :
                { rows: [] };

            await pool.query('COMMIT');

            res.status(201).json({
                ...newClass,
                prerequisites: prerequisites_details,
                corequisites: corequisites_details,
                message: 'Class created successfully'
            });

        } catch (error) {
            await pool.query('ROLLBACK');
            throw error;
        }
    } catch (error) {
        console.error('Error creating class:', error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/courses/:course_id/sections/:section_id/classes', async (req, res) => {
    try {
        const courseId = parseInt(req.params.course_id, 10);
        const sectionId = parseInt(req.params.section_id, 10);
        const {
            class_number,
            class_name,
            semesters_offered = [],
            prerequisites = [],
            corequisites = [],
            credits = 0,
            days_offered = [],
            times_offered = [],
            class_id, // undefined for new classes
            is_senior_class = false,  // default false
            restrictions = null,
            description = null
        } = req.body;

        if (isNaN(courseId) || isNaN(sectionId)) {
            return res.status(400).json({ 
                error: 'course_id and section_id must be valid integers.' 
            });
        }

        // Begin transaction
        await pool.query('BEGIN');

        try {
            // First, retrieve section info to determine elective status.
            const sectionQuery = 'SELECT is_required FROM course_sections WHERE id = $1';
            const { rows: sectionRows } = await pool.query(sectionQuery, [sectionId]);
            if (sectionRows.length === 0) {
                throw new Error('Section not found.');
            }
            // If the section is not required, then classes added here should be elective.
            const is_elective = (sectionRows[0].is_required === false);

            if (class_id) {
                // Associate an existing class

                // Check if the class exists
                const classCheckQuery = 'SELECT * FROM classes WHERE id = $1';
                const { rows: classRows } = await pool.query(classCheckQuery, [class_id]);
                if (classRows.length === 0) {
                    throw new Error('Class not found.');
                }

                // Check if this association already exists
                const assocCheckQuery = `
                    SELECT * FROM classes_in_course
                    WHERE course_id = $1 AND class_id = $2 AND section_id = $3
                `;
                const { rows: assocRows } = await pool.query(assocCheckQuery, [courseId, class_id, sectionId]);
                if (assocRows.length > 0) {
                    throw new Error('Class is already in this section.');
                }

                // Insert association, using the computed is_elective value
                const insertAssocQuery = `
                    INSERT INTO classes_in_course (course_id, class_id, section_id, is_elective)
                    VALUES ($1, $2, $3, $4)
                    RETURNING *
                `;
                await pool.query(insertAssocQuery, [courseId, class_id, sectionId, is_elective]);

            } else {
                // Create and associate a new class

                if (!class_number || !class_name) {
                    throw new Error('class_number and class_name are required for new classes.');
                }

                // Insert new class (with is_senior_class as provided)
                const insertClassQuery = `
                    INSERT INTO classes 
                    (class_number, class_name, semesters_offered, prerequisites, 
                     corequisites, credits, days_offered, times_offered, is_senior_class, restrictions, description)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                    RETURNING *
                `;
                const classValues = [
                    class_number,
                    class_name,
                    semesters_offered,
                    prerequisites,
                    corequisites,
                    credits,
                    days_offered,
                    times_offered,
                    is_senior_class,
                    restrictions,
                    description
                ];

                const { rows: newClass } = await pool.query(insertClassQuery, classValues);

                // Create association with the new class and computed elective status
                const insertAssocQuery = `
                    INSERT INTO classes_in_course (course_id, class_id, section_id, is_elective)
                    VALUES ($1, $2, $3, $4)
                    RETURNING *
                `;
                await pool.query(insertAssocQuery, [courseId, newClass[0].id, sectionId, is_elective]);
            }

            await pool.query('COMMIT');
            res.status(201).json({
                message: 'Class successfully added to section!'
            });

        } catch (err) {
            await pool.query('ROLLBACK');
            throw err;
        }

    } catch (error) {
        console.error('❌ Error adding class to section:', error);
        res.status(400).json({ error: error.message || 'Internal Server Error' });
    }
});
/**
 * @route   PUT /courses/:course_id/classes/:class_id
 * @desc    Update a class that's associated with a course
 * @access  Public
 */
router.put('/courses/:course_id/classes/:class_id', async (req, res) => {
    try {
        const { course_id, class_id } = req.params;
        const courseIdNum = parseInt(course_id, 10);
        const classIdNum = parseInt(class_id, 10);

        if (isNaN(courseIdNum) || isNaN(classIdNum)) {
            return res.status(400).json({ 
                error: 'course_id and class_id must be valid integers.' 
            });
        }

        const {
            class_number,
            class_name,
            semesters_offered = [],
            prerequisites = [],
            corequisites = [],
            credits = 0,
            days_offered = [],
            times_offered = null,
            is_senior_class = false,
            restrictions = null,
            description = null
        } = req.body;

        if (!class_number || !class_name) {
            return res.status(400).json({ 
                error: 'class_number and class_name are required.' 
            });
        }

        await pool.query('BEGIN');

        try {
            // Validate prerequisites and corequisites exist
            if (prerequisites.length > 0 || corequisites.length > 0) {
                const allIds = [...new Set([...prerequisites, ...corequisites])];
                const checkQuery = `
                    SELECT id FROM classes 
                    WHERE id = ANY($1::int[])
                `;
                const { rows: existingClasses } = await pool.query(checkQuery, [allIds]);
                
                if (existingClasses.length !== allIds.length) {
                    throw new Error('One or more prerequisites or corequisites do not exist');
                }
            }

            // Verify class belongs to course
            const verifyQuery = `
                SELECT 1 FROM classes_in_course 
                WHERE course_id = $1 AND class_id = $2
            `;
            const { rows: verifyRows } = await pool.query(verifyQuery, [courseIdNum, classIdNum]);
            if (verifyRows.length === 0) {
                throw new Error('Class not found in this course');
            }

            const updateQuery = `
                UPDATE classes
                SET
                    class_number = $1,
                    class_name = $2,
                    semesters_offered = $3,
                    prerequisites = $4,
                    corequisites = $5,
                    credits = $6,
                    days_offered = $7,
                    times_offered = $8,
                    is_senior_class = $9,
                    restrictions = $10,
                    description = $11,
                    updated_at = NOW()
                WHERE id = $12
                RETURNING id, class_number, class_name, semesters_offered,
                    prerequisites, corequisites, credits, days_offered, times_offered, is_senior_class, restrictions, description
            `;

            const { rows: [updatedClass] } = await pool.query(updateQuery, [
                class_number,
                class_name,
                semesters_offered,
                prerequisites,
                corequisites,
                credits,
                days_offered,
                times_offered,
                is_senior_class,
                restrictions,
                description,
                classIdNum
            ]);

            if (!updatedClass) {
                throw new Error('Class not found');
            }

            // Fetch full prerequisite details
            const prereqQuery = `
                SELECT id, class_number, class_name
                FROM classes
                WHERE id = ANY($1::int[])
            `;
            const { rows: prerequisites_details } = prerequisites.length > 0 ?
                await pool.query(prereqQuery, [prerequisites]) :
                { rows: [] };

            // Fetch full corequisite details
            const { rows: corequisites_details } = corequisites.length > 0 ?
                await pool.query(prereqQuery, [corequisites]) :
                { rows: [] };

            await pool.query('COMMIT');

            res.json({
                ...updatedClass,
                prerequisites: prerequisites_details,
                corequisites: corequisites_details,
                message: 'Class updated successfully'
            });

        } catch (error) {
            await pool.query('ROLLBACK');
            throw error;
        }
    } catch (error) {
        console.error('Error updating class:', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/stats', async (req, res) => {
    try {
        const majorsQuery = 'SELECT COUNT(*) AS count FROM courses WHERE LOWER(course_type) = LOWER($1)';
        const minorsQuery = 'SELECT COUNT(*) AS count FROM courses WHERE LOWER(course_type) = LOWER($1)';
        const classesQuery = 'SELECT COUNT(*) AS count FROM classes';

        const majorsResult = await pool.query(majorsQuery, ['Major']);
        const minorsResult = await pool.query(minorsQuery, ['Minor']);
        const classesResult = await pool.query(classesQuery);

        const majors = parseInt(majorsResult.rows[0].count, 10);
        const minors = parseInt(minorsResult.rows[0].count, 10);
        const classes = parseInt(classesResult.rows[0].count, 10);

        res.json({ majors, minors, classes });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.delete('/courses/:course_id', async (req, res) => {
    try {
      const courseId = parseInt(req.params.course_id, 10);
      if (isNaN(courseId)) {
        return res.status(400).json({ error: 'Invalid course_id' });
      }
      // Delete the course. (Assumes ON DELETE CASCADE is defined on related tables.)
      const deleteQuery = 'DELETE FROM courses WHERE id = $1 RETURNING *';
      const { rows } = await pool.query(deleteQuery, [courseId]);
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Course not found' });
      }
      res.json({ message: 'Course deleted successfully', course: rows[0] });
    } catch (error) {
      console.error('Error deleting course:', error);
      res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
});

// Remove one of these duplicate routes
// Keep only ONE of these DELETE routes
router.delete('/classes/:class_id', async (req, res) => {
    try {
        const classId = parseInt(req.params.class_id, 10);
        
        if (isNaN(classId)) {
            return res.status(400).json({ 
                error: 'class_id must be a valid integer.' 
            });
        }

        // Begin transaction
        await pool.query('BEGIN');

        try {
            // First check if class exists
            const checkQuery = 'SELECT * FROM classes WHERE id = $1';
            const { rows: classRows } = await pool.query(checkQuery, [classId]);
            
            if (classRows.length === 0) {
                throw new Error('Class not found.');
            }

            // Remove all associations in classes_in_course first
            const removeAssociationsQuery = `
                DELETE FROM classes_in_course 
                WHERE class_id = $1
                RETURNING *
            `;
            const { rows: removedAssociations } = await pool.query(removeAssociationsQuery, [classId]);

            // Delete the class itself
            const deleteQuery = `
                DELETE FROM classes 
                WHERE id = $1
                RETURNING *
            `;
            const { rows: deletedClass } = await pool.query(deleteQuery, [classId]);

            await pool.query('COMMIT');

            res.json({
                message: 'Class successfully deleted',
                data: {
                    deletedClass: deletedClass[0],
                    removedAssociations: removedAssociations
                }
            });

        } catch (err) {
            await pool.query('ROLLBACK');
            throw err;
        }

    } catch (error) {
        console.error('❌ Error deleting class:', error);
        res.status(400).json({ error: error.message || 'Internal Server Error' });
    }
});

router.put('/courses/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { course_name, course_type } = req.body;

        const query = `
            UPDATE courses 
            SET course_name = $1, 
                course_type = $2,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $3
            RETURNING *
        `;

        const result = await pool.query(query, [course_name, course_type, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Course not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating course:', error);
        res.status(500).json({ error: 'Failed to update course' });
    }
});

/**
 * @route   PUT /courses/:course_id/sections/:section_id
 * @desc    Update a section's details
 * @access  Public
 */
router.put('/courses/:course_id/sections/:section_id', async (req, res) => {
    try {
        const courseId = parseInt(req.params.course_id, 10);
        const sectionId = parseInt(req.params.section_id, 10);
        
        if (isNaN(courseId) || isNaN(sectionId)) {
            return res.status(400).json({ 
                error: 'course_id and section_id must be valid integers.' 
            });
        }

        const {
            section_name,
            credits_required = 0,
            is_required = true,
            credits_needed_to_take = null
        } = req.body;

        // Begin transaction
        await pool.query('BEGIN');

        try {
            // Verify the section belongs to the course
            const checkQuery = `
                SELECT id FROM course_sections 
                WHERE id = $1 AND course_id = $2
            `;
            const { rows: sectionRows } = await pool.query(checkQuery, [sectionId, courseId]);
            
            if (sectionRows.length === 0) {
                throw new Error('Section not found in this course.');
            }

            // Update the section
            const updateQuery = `
                UPDATE course_sections
                SET 
                    section_name = $1,
                    credits_required = $2,
                    is_required = $3,
                    credits_needed_to_take = $4,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $5 AND course_id = $6
                RETURNING *
            `;
            
            const { rows: updatedSection } = await pool.query(updateQuery, [
                section_name,
                credits_required,
                is_required,
                credits_needed_to_take,
                sectionId,
                courseId
            ]);

            if (updatedSection.length === 0) {
                throw new Error('Failed to update section.');
            }

            await pool.query('COMMIT');

            res.json({
                message: 'Section updated successfully',
                data: updatedSection[0]
            });

        } catch (err) {
            await pool.query('ROLLBACK');
            throw err;
        }

    } catch (error) {
        console.error('❌ Error updating section:', error);
        res.status(400).json({ error: error.message || 'Internal Server Error' });
    }
});

/**
 * @route   GET /courses/:course_id/sections/:section_id
 * @desc    Get details for a specific section
 * @access  Public
 */
router.get('/courses/:course_id/sections/:section_id', async (req, res) => {
    try {
        const courseId = parseInt(req.params.course_id, 10);
        const sectionId = parseInt(req.params.section_id, 10);
        
        if (isNaN(courseId) || isNaN(sectionId)) {
            return res.status(400).json({ 
                error: 'course_id and section_id must be valid integers.' 
            });
        }

        // Query the database to get section details
        const query = `
            SELECT * FROM course_sections 
            WHERE id = $1 AND course_id = $2
        `;
        
        const result = await pool.query(query, [sectionId, courseId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Section not found' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching section details:', error);
        res.status(500).json({ error: 'Failed to fetch section details' });
    }
});

// Replace your current '/courses/:course_id/sections/reorder' PUT endpoint with this one:


// Make sure this is at the end of your file
module.exports = router;
