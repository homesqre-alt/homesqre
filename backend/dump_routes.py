from fastapi.routing import APIRoute
from server import app

with open(r"p:\HOMESQRE CLONE\homesqre\backend_api_calls.txt", "w") as f:
    for route in app.routes:
        if isinstance(route, APIRoute):
            for method in route.methods:
                f.write(f"{method} {route.path}\n")
