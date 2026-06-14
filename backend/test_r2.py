import os
from dotenv import load_dotenv

# Load env variables from .env
load_dotenv()

from storage import get_storage

def test():
    try:
        storage = get_storage()
        print("Storage adapter loaded:", type(storage).__name__)
        
        if type(storage).__name__ != "CloudflareR2Storage":
            print("ERROR: STORAGE_BACKEND is not set to 'r2'")
            return

        test_path = "test/hello.txt"
        test_data = b"Hello from Homesqre R2 Test!"
        
        print(f"Uploading to R2 bucket '{os.environ.get('R2_BUCKET_NAME')}'...")
        storage.put(test_path, test_data, "text/plain")
        
        print("Retrieving from R2...")
        data, content_type = storage.get(test_path)
        
        if data == test_data:
            print("SUCCESS! Cloudflare R2 is configured and working perfectly.")
        else:
            print("FAILED: Data mismatch.")
            
    except Exception as e:
        print(f"FAILED with error: {e}")

if __name__ == "__main__":
    test()
