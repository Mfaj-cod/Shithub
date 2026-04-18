import os

# Set dummy environment variables required by testing before app initializes
os.environ["GROQ_API_KEY"] = "dummy_groq_api_key"
os.environ["BUG_API_KEY"] = "dummy_bug_api_key"
