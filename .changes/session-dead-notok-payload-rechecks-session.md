---
bump: patch
section: Fixed
---
- When a request is refused because the login session is no longer recognised ("User not found" in the response), the dashboard now re-checks the session and asks you to sign in again if it has ended, instead of staying signed in while every save fails
