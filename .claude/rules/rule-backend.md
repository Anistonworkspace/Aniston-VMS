---
# Backend Coding Rules

Controllers — keep them thin:
  Only parse the request, call the service, and send the response
  Always wrap in try/catch and pass errors to next(err)
  Never put business logic in a controller

Services — all business logic lives here:
  Throw AppError subclasses for known failures (not raw Error)
  Always include organizationId in every Prisma query on org-scoped models
  Use prisma.$transaction for any write that touches more than one table
  Call auditLogger.log() on every create, update, and delete

Route middleware order (MANDATORY — never change this order):
  authenticate → requirePermission → validateRequest → controller

Security requirements:
  bcrypt with a minimum of 12 rounds for all passwords
  AES-256-GCM for sensitive data fields (field name must end in Encrypted)
  Never expose raw Prisma errors or stack traces to API consumers
  Validate file uploads by both MIME type AND file extension
  Sanitize all user input before using in queries or responses
