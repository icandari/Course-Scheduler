import json
import logging
from dataclasses import dataclass, field
from typing import Dict, List, Set, Tuple, Optional
from datetime import datetime

from data_processor import ScheduleDataProcessor

logging.basicConfig(level=logging.INFO, format='%(message)s')
logger = logging.getLogger(__name__)

# ----------------------------- Data models -----------------------------

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

# ----------------------------- Helpers -----------------------------

EIL_SET = {"STDEV 100R", "EIL 201", "EIL 313", "EIL 317", "EIL 320"}


def is_religion_course(course: Course, src: Dict[int, Dict]) -> bool:
    # Prefer from_course label when present; fallback to class_number prefix
    from_course = src.get(course.id, {}).get("from_course")
    if isinstance(from_course, str) and from_course.lower() == "religion":
        return True
    return course.class_number.startswith("REL ")


def is_eil_course(course: Course) -> bool:
    return course.class_number in EIL_SET


def is_major_course(course: Course, src: Dict[int, Dict]) -> bool:
    # Heuristic: CS classes are treated as major; extend as needed
    from_course = src.get(course.id, {}).get("from_course")
    if isinstance(from_course, str) and from_course.lower() in {"computer science", "cs"}:
        return True
    return course.class_number.startswith("CS ")


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


def build_semesters(start_semester: str,
                    fall_winter: int,
                    spring: int,
                    first_year_fw: int,
                    first_year_sp: int,
                    limit_first_year: bool,
                    count: int = 12) -> List[Semester]:
    sem_type, year_s = start_semester.split()
    year = int(year_s)

    semesters: List[Semester] = []
    for i in range(count):
        is_first_year = i < 3 and limit_first_year
        if sem_type == "Spring":
            cap = first_year_sp if is_first_year else spring
        else:
            cap = first_year_fw if is_first_year else fall_winter
        semesters.append(Semester(sem_type, year, cap))
        # advance
        if sem_type == "Fall":
            sem_type = "Winter"
            year += 1
        elif sem_type == "Winter":
            sem_type = "Spring"
        else:  # Spring
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


def total_credits_with_coreqs(course: Course, all_courses: List[Course]) -> int:
    return sum(c.credits for c in get_course_and_coreqs(course, all_courses))


def count_major_with_bundle(course: Course, all_courses: List[Course], src: Dict[int, Dict]) -> int:
    return sum(1 for c in get_course_and_coreqs(course, all_courses) if is_major_course(c, src))


def count_religion_in_bundle(course: Course, all_courses: List[Course], src: Dict[int, Dict]) -> int:
    return sum(1 for c in get_course_and_coreqs(course, all_courses) if is_religion_course(c, src))


def priority(course: Course, all_courses: List[Course]) -> Tuple[int, int, int, int, int]:
    # Higher tuple sorts earlier (we'll reverse sort)
    # 1) religion first, 2) chain depth (approx by number of prereqs),
    # 3) dependent count, 4) fewer offerings, 5) stable id
    dependents = sum(1 for c in all_courses if (course.id in (c.prerequisites or [])))
    flexibility = len(course.semesters_offered or [])
    # Negative flexibility to sort fewer offerings first when reversed
    return (
        1 if course.class_number.startswith("REL ") or course.class_number in EIL_SET else 0,
        len(course.prerequisites or []),
        dependents,
        -flexibility,
        -course.id,
    )

# ----------------------------- Scheduler -----------------------------


def create_schedule(processed: Dict) -> Dict:
    raw = processed["classes"]
    params = processed["parameters"]

    fall_winter = int(params.get("fallWinterCredits") or 16)
    spring = int(params.get("springCredits") or 10)
    limit_first_year = bool(params.get("limitFirstYear", False))
    first_year_limits = params.get("firstYearLimits") or {}
    first_year_fw = int(first_year_limits.get("fallWinterCredits") or fall_winter)
    first_year_sp = int(first_year_limits.get("springCredits") or spring)

    start_semester = params.get("startSemester") or "Fall 2025"

    # Convert to courses and make lookups
    courses = convert_to_courses(raw)
    courses_by_id = {c.id: c for c in courses}

    # Pre-group EIL courses
    eil_first_required: List[Course] = []
    eil_first_flexible: List[Course] = []
    eil_second_required: List[Course] = []

    for c in courses:
        if not is_eil_course(c):
            continue
        if c.class_number == "EIL 320":
            eil_second_required.append(c)
        elif c.class_number == "EIL 201":
            eil_first_flexible.append(c)
        else:  # STDEV 100R, EIL 313, EIL 317
            eil_first_required.append(c)

    semesters = build_semesters(start_semester, fall_winter, spring, first_year_fw, first_year_sp, limit_first_year, count=15)

    scheduled_ids: Set[int] = set()
    remaining = [c for c in courses if not is_eil_course(c)]  # schedule EIL explicitly
    scheduled_semesters: List[Dict] = []

    # 1) First semester: place required EIL, then flexible
    if semesters:
        sem0 = semesters[0]
        taken: List[Course] = []
        current = 0
        # Required first
        for c in eil_first_required:
            if can_offer(c, sem0.type) and current + c.credits <= sem0.credit_limit:
                taken.append(c); current += c.credits; scheduled_ids.add(c.id)
        # Flexible next
        for c in eil_first_flexible:
            if can_offer(c, sem0.type) and current + c.credits <= sem0.credit_limit:
                taken.append(c); current += c.credits; scheduled_ids.add(c.id)
        if taken:
            scheduled_semesters.append({
                "type": sem0.type,
                "year": sem0.year,
                "classes": [course_to_dict(c, raw) for c in taken],
                "totalCredits": current
            })

    # 2) Second semester: EIL 320 + any leftover EIL 201 if not placed
    if len(semesters) > 1 and (eil_second_required or eil_first_flexible):
        sem1 = semesters[1]
        taken: List[Course] = []
        current = 0
        for c in eil_second_required + [c for c in eil_first_flexible if c.id not in scheduled_ids]:
            if can_offer(c, sem1.type) and current + c.credits <= sem1.credit_limit:
                taken.append(c); current += c.credits; scheduled_ids.add(c.id)
        if taken:
            scheduled_semesters.append({
                "type": sem1.type,
                "year": sem1.year,
                "classes": [course_to_dict(c, raw) for c in taken],
                "totalCredits": current
            })

    # 3) Main greedy loop across semesters
    major_limit = int(params.get("majorClassLimit") or 3)

    # Sort remaining with priority (religion first, deep chains, many dependents, less flexibility)
    remaining.sort(key=lambda c: priority(c, remaining), reverse=True)

    sem_idx = len(scheduled_semesters)
    while remaining:
        if sem_idx >= len(semesters):
            # Extend semesters if needed
            last = semesters[-1]
            next_type = next_semester_type(last.type)
            next_year = last.year + 1 if last.type == "Fall" else last.year if last.type == "Winter" else last.year
            # credit limits follow regular caps after first 3; use regular caps
            cap = spring if next_type == "Spring" else fall_winter
            semesters.append(Semester(next_type, next_year, cap))
        sem = semesters[sem_idx]

        bucket: List[Course] = []
        current = 0
        semester_has_religion = any(
            is_religion_course(courses_by_id.get(cc["id"], Course(0, "", "", 0, [], [], [])), raw)
            for s in scheduled_semesters[-1:] for cc in s.get("classes", [])
        ) if scheduled_semesters and sem_idx < len(scheduled_semesters) else False

        # Greedy pick
        picked_any = False
        for course in list(remaining):
            # Skip if already scheduled due to EIL steps
            if course.id in scheduled_ids:
                remaining.remove(course)
                continue

            if not can_offer(course, sem.type):
                continue
            if not all_prereqs_done(course, scheduled_ids):
                continue

            bundle = get_course_and_coreqs(course, courses)
            # Check credit fit
            bundle_credits = sum(c.credits for c in bundle)
            if current + bundle_credits > sem.credit_limit:
                continue

            # Religion rule: at most one religion per semester
            bundle_religion = any(is_religion_course(c, raw) for c in bundle)
            if bundle_religion:
                # Count current religion in this bucket
                has_religion = any(is_religion_course(c, raw) for c in bucket)
                if has_religion:
                    continue

            # Major class limit (credits-based)
            majors_to_add = sum(1 for c in bundle if is_major_course(c, raw))
            current_major_count = sum(1 for c in bucket if is_major_course(c, raw))
            if current_major_count + majors_to_add > major_limit:
                continue

            # Passed all checks, add bundle
            for c in bundle:
                if c in remaining:
                    remaining.remove(c)
            bucket.extend(bundle)
            current += bundle_credits
            scheduled_ids.update(c.id for c in bundle)
            picked_any = True

            # If we hit the cap, stop adding
            if current >= sem.credit_limit:
                break

        if bucket:
            scheduled_semesters.append({
                "type": sem.type,
                "year": sem.year,
                "classes": [course_to_dict(c, raw) for c in bucket],
                "totalCredits": current
            })
        elif not picked_any:
            # No course could be scheduled in this semester; advance
            pass

        sem_idx += 1
        # Safety break
        if sem_idx > len(semesters) + 10:
            break

    # Simple post-optimization: try to move a lone religion course from the last semester earlier if space
    scheduled_semesters = optimize_final_religion(scheduled_semesters, fall_winter, spring)

    return {
        "metadata": {
            "approach": "credits-based",
            "startSemester": start_semester,
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


def optimize_final_religion(scheduled: List[Dict], fw_cap: int, sp_cap: int) -> List[Dict]:
    if not scheduled:
        return scheduled
    last = scheduled[-1]
    if len(last.get("classes", [])) != 1:
        return scheduled
    only = last["classes"][0]
    if not str(only.get("class_number", "")).startswith("REL "):
        return scheduled

    # Try to place earlier
    for i in range(len(scheduled) - 1):
        sem = scheduled[i]
        cap = sp_cap if sem["type"] == "Spring" else fw_cap
        has_religion = any(str(cc.get("class_number", "")).startswith("REL ") for cc in sem.get("classes", []))
        if has_religion:
            continue
        if sem["totalCredits"] + only.get("credits", 0) <= cap:
            sem["classes"].append(only)
            sem["totalCredits"] += only.get("credits", 0)
            scheduled.pop()
            break
    return scheduled


# ----------------------------- CLI -----------------------------


def run_scheduler(input_path: str, output_path: Optional[str] = None) -> Dict:
    with open(input_path, "r") as f:
        payload = json.load(f)

    processor = ScheduleDataProcessor()
    processed = processor.process_payload(payload)

    result = create_schedule(processed)

    updated_payload = payload.copy()
    updated_payload["schedule"] = result["schedule"]
    updated_payload["metadata"] = result["metadata"]

    if output_path:
        with open(output_path, "w") as f:
            json.dump(updated_payload, f, indent=4)
        logger.info(f"Saved schedule to {output_path}")

    return updated_payload


if __name__ == "__main__":
    import sys
    inp = sys.argv[1] if len(sys.argv) > 1 else "ml_trainer/creditspayload.json"
    out = sys.argv[2] if len(sys.argv) > 2 else "ml_trainer/Response.simple.json"
    try:
        run_scheduler(inp, out)
        logger.info("Schedule generation completed")
    except Exception as e:
        logger.error(f"Error: {e}")
        raise
