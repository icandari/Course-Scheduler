CREATE TABLE IF NOT EXISTS courses (
    id SERIAL PRIMARY KEY,
    course_name VARCHAR(255) NOT NULL,
    course_type VARCHAR(255),
    holokai VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS course_sections (
    id SERIAL PRIMARY KEY,
    course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
    section_name VARCHAR(255) NOT NULL,
    credits_required INTEGER DEFAULT 0,
    is_required BOOLEAN DEFAULT true,
    credits_needed_to_take INTEGER,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS classes (
    id SERIAL PRIMARY KEY,
    class_number VARCHAR(50) NOT NULL UNIQUE,
    class_name VARCHAR(255) NOT NULL,
    semesters_offered VARCHAR(50)[] DEFAULT '{}',
    prerequisites INTEGER[] DEFAULT '{}',
    corequisites INTEGER[] DEFAULT '{}',
    credits INTEGER DEFAULT 0,
    days_offered VARCHAR(50)[] DEFAULT '{}',
    times_offered VARCHAR(50)[] DEFAULT '{}',
    is_senior_class BOOLEAN DEFAULT false,
    description TEXT,
    restrictions TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS elective_groups (
    id SERIAL PRIMARY KEY,
    section_id INTEGER REFERENCES course_sections(id) ON DELETE CASCADE,
    group_name VARCHAR(255) NOT NULL,
    required_count INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS classes_in_course (
    id SERIAL PRIMARY KEY,
    course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
    class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
    section_id INTEGER REFERENCES course_sections(id) ON DELETE CASCADE,
    is_elective BOOLEAN DEFAULT false,
    elective_group_id INTEGER REFERENCES elective_groups(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(course_id, class_id)
);
