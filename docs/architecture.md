# Architecture

## Data Plane
The Gateway Core handles incoming requests, applies policies (auth, rate limiting), and forwards them to the backend services.

## Control Plane
The Management API manages configuration (proxies, products, apps, etc.) via a CRUD API.
