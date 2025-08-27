from flask import Flask, request, jsonify
from flask_cors import CORS
from constraint_optimizer import ScheduleOptimizer
from semester_based_optimizer import SemesterBasedOptimizer  # Add this import
from run_credits_simple import create_schedule as simple_credits_create_schedule
from data_processor import ScheduleDataProcessor
import os
from datetime import datetime
import logging
import json

app = Flask(__name__)
# Update CORS configuration
CORS(app, resources={
    r"/*": {
        "origins": [
            "https://course-scheduler-web.onrender.com",
            "http://localhost:3000",
            "http://web:3000",
            "*"  # Temporarily allow all origins for testing
        ],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization", "Origin"],
        "expose_headers": ["Content-Type", "Authorization"]
    }
})

data_processor = ScheduleDataProcessor()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Add health check endpoint
@app.route('/', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "service": "course-scheduler-ml",
        "timestamp": str(datetime.now())
    })

@app.route('/ping', methods=['GET'])
def ping():
    """Health check endpoint with more details"""
    return jsonify({
        "status": "healthy",
        "service": "course-scheduler-ml",
        "timestamp": str(datetime.now()),
        "env": os.environ.get('FLASK_ENV', 'unknown'),
        "port": os.environ.get('PORT', 'unknown')
    })

@app.route('/generate-schedule', methods=['POST', 'OPTIONS'])
def generate_schedule():
    """Generate and return a complete course schedule"""
    if request.method == 'OPTIONS':
        return '', 204
        
    try:
        logger.info("=== Schedule Generation Request ===")
        data = request.json
        logger.info(f"Incoming payload: {json.dumps(data, indent=2)}")

        # Process raw data into scheduler-friendly format
        processor = ScheduleDataProcessor()
        processed_data = processor.process_payload(data)
        # Check if processing was successful before accessing classes
        if "error" in processed_data:
            logger.error(f"Data processing failed: {processed_data['error']}")
            return jsonify(processed_data), 400
        logger.info(f"Processed data complete with {len(processed_data['classes'])} courses")

        # Determine which optimizer to use based on approach
        approach = (processed_data.get("parameters") or {}).get("approach", "credits-based")
        logger.info(f"Using scheduling approach: {approach}")

        # Support both spellings: 'semester-based' (preferred) and 'semesters-based' (legacy)
        if approach in ("semester-based", "semesters-based"):
            logger.info("Using SemesterBasedOptimizer")
            optimizer = SemesterBasedOptimizer()
            schedule_result = optimizer.create_schedule(processed_data)
        else:
            # Use the simplified credits-based scheduler we built
            logger.info("Using simple credits-based scheduler")
            schedule_result = simple_credits_create_schedule(processed_data)

        # Log the result
        logger.info(f"Schedule generation complete with {len(schedule_result.get('schedule', []))} semesters")
        logger.info(f"Schedule metadata: {schedule_result.get('metadata', {})}")

        # Check if schedule generation was successful
        if "error" in schedule_result:
            logger.error(f"Schedule generation failed: {schedule_result['error']}")
            return jsonify(schedule_result), 500

        return jsonify({
            "metadata": schedule_result.get('metadata', {}),
            "schedule": schedule_result.get('schedule', []),
            "timestamp": str(datetime.now())
        })
        
    except Exception as e:
        logger.exception("Error generating schedule:")
        return jsonify({
            "error": str(e),
            "metadata": {
                "success": False,
                "timestamp": str(datetime.now())
            }
        }), 500

@app.route('/test-connection', methods=['POST'])
def test_connection():
    """Test endpoint to verify connection and payload handling"""
    try:
        logger.info("=== Test Connection Request ===")
        logger.info(f"Headers: {dict(request.headers)}")
        data = request.json
        
        return jsonify({
            "status": "success",
            "received_data": data,
            "timestamp": str(datetime.now()),
            "headers_received": dict(request.headers)
        })
    except Exception as e:
        logger.exception("Error in test connection:")
        return jsonify({"error": str(e)}), 500

@app.route('/test-payload', methods=['POST'])
def test_payload():
    """Test endpoint for payload validation"""
    try:
        data = request.json
        logger.info("=== Test Payload Request ===")
        logger.info(f"Received payload with {len(data.get('courseData', []))} courses")
        logger.info(f"Preferences: {data.get('preferences', {})}")
        
        # Validate key components
        course_data = data.get('courseData', [])
        preferences = data.get('preferences', {})
        
        return jsonify({
            "status": "success",
            "payload_size": len(str(data)),
            "courses_count": len(course_data),
            "preferences": preferences,
            "timestamp": str(datetime.now())
        })
    except Exception as e:
        logger.exception("Error in test payload:")
        return jsonify({"error": str(e)}), 500

@app.route('/test-course-data', methods=['POST'])
def test_course_data():
    """Test endpoint to verify course data processing"""
    try:
        data = request.json
        logger.info("=== Course Data Test ===")
        
        # Verify course data structure
        course_data = data.get('courseData', [])
        logger.info(f"Number of courses: {len(course_data)}")
        for course in course_data:
            logger.info(f"Course: {course.get('course_name')}")
            logger.info(f"Sections: {len(course.get('sections', []))}")
            
        # Process with data processor
        processor = ScheduleDataProcessor()
        processed = processor.process_payload(data)
        
        return jsonify({
            "status": "success",
            "course_count": len(course_data),
            "processed_data": processed,
            "timestamp": str(datetime.now())
        })
    except Exception as e:
        logger.exception("Error processing course data:")
        return jsonify({"error": str(e)}), 500

@app.route('/test-optimizer', methods=['POST'])
def test_optimizer():
    """Test endpoint for the optimizer functionality"""
    try:
        data = request.json
        logger.info("=== Testing Optimizer ===")
        
        # Process the data
        processor = ScheduleDataProcessor()
        processed_data = processor.process_payload(data)
        
        # Determine approach and test appropriate optimizer
        approach = processed_data["parameters"].get("approach", "credits-based")
        
        if approach == "semesters-based":
            optimizer = SemesterBasedOptimizer()
        else:
            optimizer = ScheduleOptimizer()
        
        logger.info(f"Testing {approach} optimizer...")
        
        return jsonify({
            "status": "success",
            "approach": approach,
            "processed_data": processed_data,
            "course_count": len(processed_data.get('classes', {})),
            "timestamp": str(datetime.now())
        })
    except Exception as e:
        logger.exception("Error in optimizer test:")
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_ENV') == 'development'
    app.run(host='0.0.0.0', port=port, debug=debug)