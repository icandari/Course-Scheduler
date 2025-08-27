import json
from dataclasses import dataclass, field
from typing import Dict, List, Set, Tuple, Optional
from datetime import datetime
from data_processor import ScheduleDataProcessor

@dataclass
class Course:
    id: int
    class_name: str
    class_number: str
    credits: int
    semesters_offered: List[str]
    prerequisites: List[int]
    corequisites: List[int]
    from_course: Optional[str] = None

@dataclass
class Semester:
    type: str  # Fall, Winter, Spring
    year: int
    credit_limit: int
    classes: List[Course] = field(default_factory=list)

    @property
    def total_credits(self) -> int:
        return sum(c.credits for c in self.classes)

EIL_SET = {"STDEV 100R", "EIL 201", "EIL 313", "EIL 317", "EIL 320"}


def is_religion_course(course: Course, src: Dict[int, Dict]) -> bool:
    if isinstance(course.from_course, str) and course.from_course.lower() == "religion":
        return True
    from_course = src.get(course.id, {}).get("from_course")
    if isinstance(from_course, str) and str(from_course).lower() == "religion":
        return True
    return str(course.class_number or "").startswith("REL ")


def is_eil_course(course: Course) -> bool:
    if isinstance(course.from_course, str) and course.from_course.lower() == "eil":
        return True
    return course.class_number in EIL_SET


def convert_to_courses(raw: Dict[int, Dict]) -> List[Course]:
    result: List[Course] = []
    for cid, data in raw.items():
        result.append(
            Course(
                id=int(cid),
                class_name=data.get("class_name", ""),
                class_number=str(data.get("class_number", "")),
                credits=int(data.get("credits", 0)),
                semesters_offered=list(data.get("semesters_offered", [])),
                prerequisites=list(data.get("prerequisites", [])),
                corequisites=list(data.get("corequisites", [])),
                from_course=data.get("from_course"),
            )
        )
    return result

def next_semester_type(sem_type: str) -> str:
    if sem_type == "Fall":
        return "Winter"
    if sem_type == "Winter":
        return "Spring"
    return "Fall"

def build_semesters(start_semester: str, limit_first_year: bool) -> List[Semester]:
    sem_type, year_s = start_semester.split()
    year = int(year_s)
    semesters: List[Semester] = []
    for i in range(10):
        # Determine per-term cap (lower caps for first 3 if limited)
        if i < 3 and limit_first_year:
            cap = 15 if sem_type in ("Fall", "Winter") else 10
        else:
            cap = 18 if sem_type in ("Fall", "Winter") else 12
        semesters.append(Semester(sem_type, year, cap))
        # Advance to next term with correct year rollover
        if sem_type == "Fall":
            sem_type = "Winter"
            year += 1  # Winter is in the next calendar year
        elif sem_type == "Winter":
            sem_type = "Spring"  # Same calendar year
        else:  # Spring -> Fall (same calendar year)
            sem_type = "Fall"
    return semesters

def can_offer(course: Course, sem_type: str) -> bool:
    return sem_type in (course.semesters_offered or [])

def all_prereqs_done(course: Course, scheduled_ids: Set[int]) -> bool:
    return all(pid in scheduled_ids for pid in (course.prerequisites or []))

def get_course_and_coreqs(course: Course, all_courses: List[Course]) -> List[Course]:
    bundle = [course]
    to_visit = [course]
    seen = {course.id}
    while to_visit:
        cur = to_visit.pop()
        for coreq_id in cur.corequisites or []:
            if coreq_id in seen:
                continue
            found = next((c for c in all_courses if c.id == coreq_id), None)
            if found:
                seen.add(found.id)
                bundle.append(found)
                to_visit.append(found)
    return bundle

def create_schedule(processed: Dict) -> Dict:
    raw = processed["classes"]
    params = processed["parameters"]
    start_semester = params.get("startSemester") or "Fall 2025"
    limit_first_year = bool(params.get("limitFirstYear", False))
    # Convert to courses and make lookups
    courses = convert_to_courses(raw)
    courses_by_id = {c.id: c for c in courses}
    semesters = build_semesters(start_semester, limit_first_year)
    scheduled_ids: Set[int] = set()
    remaining = [c for c in courses]
    scheduled_semesters: List[Dict] = []
    min_semesters = 10
    sem_index = 0
    no_progress_rounds = 0

    def add_next_semester(prev_type: str, prev_year: int) -> Semester:
        # Determine the next term and year with caps (post-first-year caps)
        if prev_type == "Fall":
            nxt_type, nxt_year = "Winter", prev_year + 1
        elif prev_type == "Winter":
            nxt_type, nxt_year = "Spring", prev_year
        else:
            nxt_type, nxt_year = "Fall", prev_year
        cap = 18 if nxt_type in ("Fall", "Winter") else 12
        sem = Semester(nxt_type, nxt_year, cap)
        semesters.append(sem)
        return sem

    while sem_index < len(semesters) or (len(scheduled_semesters) < min_semesters):
        # Ensure we have a semester to process
        if sem_index >= len(semesters):
            last = semesters[-1]
            add_next_semester(last.type, last.year)
        sem = semesters[sem_index]

        bucket: List[Course] = []
        current = 0
        picked_any = False

        for course in list(remaining):
            if course.id in scheduled_ids:
                if course in remaining:
                    remaining.remove(course)
                continue
            if not can_offer(course, sem.type):
                continue
            if not all_prereqs_done(course, scheduled_ids):
                continue
            bundle = get_course_and_coreqs(course, courses)
            bundle_credits = sum(c.credits for c in bundle)
            if current + bundle_credits > sem.credit_limit:
                continue
            # Religion rule: at most one religion per semester
            bundle_religion = any(is_religion_course(c, raw) for c in bundle)
            if bundle_religion:
                has_religion = any(is_religion_course(c, raw) for c in bucket)
                if has_religion:
                    continue
            # Passed all checks, add bundle
            for c in bundle:
                if c in remaining:
                    remaining.remove(c)
            bucket.extend(bundle)
            current += bundle_credits
            scheduled_ids.update(c.id for c in bundle)
            picked_any = True
            if current >= sem.credit_limit:
                break

        scheduled_semesters.append({
            "type": sem.type,
            "year": sem.year,
            "classes": [course_to_dict(c, raw) for c in bucket],
            "totalCredits": current
        })

        if picked_any:
            no_progress_rounds = 0
        else:
            no_progress_rounds += 1

        sem_index += 1

        # Stop when all courses scheduled and we've reached at least the minimum semesters
        if not remaining and len(scheduled_semesters) >= min_semesters:
            break
        # Safety: if we made no progress over 3 consecutive semesters, stop extending further
        if no_progress_rounds >= 3 and sem_index >= min_semesters:
            break
    return {
        "metadata": {
            "approach": "semester-based",
            "startSemester": start_semester,
            "eilLevel": params.get("eilLevel"),
            "generatedAt": datetime.now().isoformat()
        },
        "schedule": scheduled_semesters
    }

def course_to_dict(c: Course, src: Dict[int, Dict]) -> Dict:
    return {
        "id": c.id,
        "class_name": c.class_name,
        "class_number": c.class_number,
        "credits": c.credits,
        "prerequisites": c.prerequisites,
        "corequisites": c.corequisites,
        "semesters_offered": c.semesters_offered,
        "from_course": src.get(c.id, {}).get("from_course")
    }

def run_scheduler(input_path: str, output_path: Optional[str] = None) -> Dict:
    with open(input_path, "r") as f:
        payload = json.load(f)
    processor = ScheduleDataProcessor()
    processed = processor.process_payload(payload)
    result = create_schedule(processed)
    output = {"schedule": result["schedule"], "metadata": result["metadata"]}
    if output_path:
        with open(output_path, "w") as f:
            json.dump(output, f, indent=4)
        print(f"Saved schedule to {output_path}")
    return output

if __name__ == "__main__":
    import sys
    from pathlib import Path
    here = Path(__file__).resolve().parent
    default_in = str(here / "sempayload.json")
    default_out = str(here / "SemesterResponse.json")
    inp = sys.argv[1] if len(sys.argv) > 1 else default_in
    out = sys.argv[2] if len(sys.argv) > 2 else default_out
    try:
        run_scheduler(inp, out)
        print("Schedule generation completed")
    except Exception as e:
        print(f"Error: {e}")
        raise
