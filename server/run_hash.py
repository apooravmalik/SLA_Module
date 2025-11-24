# run_hash.py
from security.security import get_password_hash

# Use a strong, shared password for initial setup
SHARED_PASSWORD = "M00se_1234" 

hashed = get_password_hash(SHARED_PASSWORD)
print(f"Password: {SHARED_PASSWORD}")
print(f"Hashed Password: {hashed}")