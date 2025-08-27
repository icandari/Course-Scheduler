import json
from typing import Dict, List, Any, Set, Tuple
import logging
from datetime import datetime

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ScheduleDataProcessor:
    """Process raw schedule data from JSON payloads into a format suitable for optimization"""
    
    def __init__(self):
        self.class_dependencies = {}
        self.class_info = {}
        
    def process_payload(self, payload: Dict) -> Dict:
        logger.info("Starting payload processing")
        
        # Validate presence of at least one data section (new or legacy)
        has_classes = isinstance(payload.get("classes"), list)
        has_course_data = isinstance(payload.get("courseData"), list)
        if not (has_classes or has_course_data):
            logger.error("Missing classes/courseData in payload")
            return {"error": "Invalid payload structure: expected 'classes' or 'courseData'"}

        if not payload.get("preferences"):
            logger.error("Missing preferences in payload")
            return {"error": "Invalid payload structure"}
        
        # Add detailed logging for dependencies
        processed_data = self._process_payload_internal(payload)
        
        logger.info(f"Processed {len(processed_data['classes'])} classes")
        logger.info(f"First 3 processed classes: {list(processed_data['classes'].items())[:3]}")
        
        return processed_data

    def _process_payload_internal(self, payload: Dict) -> Dict:
        # Original process_payload logic here
        logger.info("Starting payload processing")
        
        # Log preferences
        preferences = payload.get("preferences", {})
        logger.info(f"Raw preferences: {json.dumps(preferences, indent=2)}")

        # Build classes mapping from either new 'classes' or legacy 'courseData'
        all_classes: Dict[Any, Dict] = {}

        if isinstance(payload.get("classes"), list):
            # New compact format: flat list of classes with from_course label
            for cls in payload["classes"]:
                cls_id = cls.get("id")
                if cls_id is None:
                    continue
                # Normalize deps to plain int IDs
                def norm_ids(arr):
                    out = []
                    for v in arr or []:
                        if isinstance(v, dict):
                            vid = v.get("id")
                        else:
                            vid = v
                        if isinstance(vid, int):
                            out.append(vid)
                    return out
                all_classes[cls_id] = {
                    "id": cls_id,
                    "class_name": cls.get("class_name"),
                    "class_number": cls.get("class_number"),
                    "semesters_offered": cls.get("semesters_offered", []),
                    "credits": cls.get("credits", 0),
                    "is_senior_class": bool(cls.get("is_senior_class", False)),
                    "restrictions": cls.get("restrictions"),
                    "prerequisites": norm_ids(cls.get("prerequisites")),
                    "corequisites": norm_ids(cls.get("corequisites")),
                    "days_offered": cls.get("days_offered", []),
                    "times_offered": cls.get("times_offered", []),
                    "from_course": cls.get("from_course"),
                    # Legacy fields not available in new payload
                    "course_id": None,
                    "course_type": None,
                    "section_id": None,
                    "is_elective_section": None,
                    "credits_needed": None,
                }
        else:
            # Legacy nested format under 'courseData'
            course_data = payload.get("courseData", [])
            for course in course_data:
                course_id = course.get("id")
                course_type = course.get("course_type")
                if course_id == "additional":
                    self._process_additional_classes(course, all_classes)
                    continue
                for section in course.get("sections", []):
                    is_elective_section = not section.get("is_required", True)
                    credits_needed = section.get("credits_needed_to_take")
                    for cls in section.get("classes", []):
                        cls_id = cls.get("id")
                        if cls_id is None:
                            continue
                        all_classes[cls_id] = {
                            **cls,
                            "course_id": course_id,
                            "course_type": course_type,
                            "section_id": section.get("id"),
                            "is_elective_section": is_elective_section,
                            "credits_needed": credits_needed
                        }
        
        # Map prerequisites and corequisites using IDs
        self._map_class_dependencies(all_classes)
        
        # Extract scheduling approach and parameters (support both styles)
        approach = preferences.get("approach")
        start_semester = preferences.get("startSemester")
        limit_first_year = preferences.get("limitFirstYear", False)
        # Only present for credits-based
        fall_winter_credits = preferences.get("fallWinterCredits")
        spring_credits = preferences.get("springCredits")
        major_class_limit = preferences.get("majorClassLimit")
        first_year_limits = preferences.get("firstYearLimits", {}) if limit_first_year else {}

        scheduling_params = {
            "approach": approach,
            "startSemester": start_semester,
            "limitFirstYear": limit_first_year,
            # Credits-based knobs (may be None for semester-based)
            "fallWinterCredits": fall_winter_credits,
            "springCredits": spring_credits,
            "majorClassLimit": major_class_limit,
            "firstYearLimits": first_year_limits,
        }
        
        logger.info(f"Processed scheduling parameters: {json.dumps(scheduling_params, indent=2)}")
        
        # Validate class data before returning
        for cls_id, cls_info in all_classes.items():
            required_fields = ["class_name", "credits", "semesters_offered"]
            for field in required_fields:
                if field not in cls_info:
                    logger.error(f"Missing required field {field} in class {cls_id}")
                    return {"error": f"Invalid class data: missing {field}"}
        
        # Add metadata to processed data
        processed_data = {
            "classes": all_classes,
            "parameters": scheduling_params,
            "metadata": {
                "total_classes": len(all_classes),
                "processing_timestamp": datetime.now().isoformat()
            }
        }
        
        return processed_data
    
    def _process_additional_classes(self, course: Dict, all_classes: Dict):
        """Process classes from the additional section"""
        for section in course.get("sections", []):
            for cls in section.get("classes", []):
                cls_id = cls.get("id")
                # Get corequisite's course type if it exists
                course_type = "system"
                if cls.get("corequisites"):
                    for coreq in cls["corequisites"]:
                        coreq_id = coreq.get("id") if isinstance(coreq, dict) else coreq
                        # Look up corequisite's course in all_classes
                        if coreq_id in all_classes:
                            course_type = all_classes[coreq_id].get("course_type", "system")
                            break
            
                all_classes[cls_id] = {
                    **cls,
                    "course_id": "additional",
                    "course_type": course_type,
                    "section_id": section.get("id"),
                    "is_elective_section": False,
                    "credits_needed": None
                }
    
    def _map_class_dependencies(self, all_classes: Dict):
        """Map prerequisites and corequisites using class IDs"""
        for cls_id, cls_info in all_classes.items():
            # Map prerequisites
            prerequisites = cls_info.get("prerequisites", [])
            mapped_prereqs = []
            for prereq_id in prerequisites:
                if isinstance(prereq_id, int) and prereq_id in all_classes:
                    mapped_prereqs.append(prereq_id)
            cls_info["prerequisites"] = mapped_prereqs
            
            # Map corequisites
            corequisites = cls_info.get("corequisites", [])
            mapped_coreqs = []
            for coreq in corequisites:
                coreq_id = coreq.get("id") if isinstance(coreq, dict) else coreq
                if coreq_id in all_classes:
                    mapped_coreqs.append(coreq_id)
            cls_info["corequisites"] = mapped_coreqs