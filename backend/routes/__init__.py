"""Route modules. Importing this package wires every endpoint onto the shared
`api` router defined in `core`. Order doesn't matter because each module
registers handlers via FastAPI decorators."""
from . import auth, me, files, crm, leads, verifications, design, admin, content  # noqa: F401
