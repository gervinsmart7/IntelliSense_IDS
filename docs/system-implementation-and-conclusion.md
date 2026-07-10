# IntelliSense IDS: System Implementation and Conclusion

## 1. Introduction
IntelliSense IDS is a full-stack intrusion detection and security monitoring platform designed to detect suspicious network activity, analyse flow-based traffic data, and provide administrators with a centralised environment for monitoring, investigation, and response. The system integrates a web-based management interface, a backend API, and an IDS agent that collects and transmits monitoring data to the platform.

The platform is intended to support multiple administrative roles, including super administrators, platform administrators, and organisation administrators. Each role is assigned a specific level of access and responsibility, enabling secure and structured control over the system.

## 2. Project Objectives
The main objectives of IntelliSense IDS are to:

- Detect and classify suspicious traffic behaviour using intrusion detection techniques.
- Provide real-time visibility into system activity through dashboards and alert views.
- Support organisation-level monitoring and management.
- Enable administrators to inspect logs, alerts, analytics, and agent status.
- Provide an extensible architecture that can incorporate machine learning and future threat intelligence enhancements.
- Ensure secure access through authentication, role-based permissions, and audit tracking.

## 3. System Architecture
The implementation follows a modular three-layer architecture:

### 3.1 Presentation Layer
The frontend is a React application built with Vite and styled using a custom component-based UI. It provides the user-facing experience for authentication, navigation, dashboards, alert review, logs, notifications, and administrative actions.

This layer includes:

- Login, registration, verification, and password recovery flows
- Role-based dashboards for super admin, platform admin, and organisation admin
- Organisation and admin management interfaces
- Alerts and log viewers
- Analytics dashboards for traffic and attack distribution
- Notification and activity history pages
- Configuration and system health pages

### 3.2 Application Layer
The backend is implemented using FastAPI, a modern Python web framework that provides fast request handling and clean API design. It serves as the core application layer that processes requests, manages business logic, stores data, and communicates with external services.

The application layer includes modules for:

- Authentication and authorisation
- Organisation and admin management
- Agent authentication and heartbeat handling
- Alert and notification processing
- Audit logging
- Analytics and reporting
- Model management and retraining operations

### 3.3 Data Layer
The system stores and retrieves data using Firebase Firestore and cloud storage mechanisms. Firestore is used to maintain structured records for organisations, admins, alerts, telemetry, audit logs, and notifications. Cloud storage is used for uploaded agent logs and model assets where required.

This layered design ensures that the system remains scalable, maintainable, and easier to extend as new features are added.

## 3.4 Cloud Services and Infrastructure
The system leverages several cloud services to provide scalability, real-time capabilities, and reliable data storage:

**Firebase Firestore:**
- Primary database for real-time data storage and synchronisation
- Stores organisation records, admin accounts, alert logs, audit trails, and notifications
- Enables real-time updates across connected clients
- Provides structured queries for analytics and reporting
- Supports Firestore security rules for data-level access control

**Firebase Authentication:**
- Manages user authentication and session management
- Provides secure login, registration, and password reset flows
- Integrates with the frontend to maintain user sessions
- Supports email verification and account recovery

**Amazon Web Services (AWS) S3:**
- Cloud object storage for uploaded agent logs and model files
- Stores CSV-formatted flow data and detection logs
- Provides durable and scalable storage with versioning support
- Enables presigned URLs for secure file access
- Reduces backend storage burden by offloading large files

**Email Services:**
- SendGrid/Brevo integration for transactional emails
- Sends verification emails during user registration
- Delivers password reset emails
- Sends alert notifications to administrators
- Ensures reliable email delivery for critical system notifications

This cloud-first approach provides the system with enterprise-grade infrastructure, reliability, and scalability without requiring on-premise hardware maintenance.

## 4. Frontend Implementation
The frontend provides a responsive and role-aware interface for system users.

### 4.1 Routing and Access Control
The application uses React Router to manage navigation between pages. Protected routes ensure that users can only access pages relevant to their role. For example:

- Super admins can manage all organisations and platform-wide settings.
- Platform admins can oversee organisations and platform-level monitoring.
- Organisation admins can manage their own organisation and view its alerts, logs, and agent information.

### 4.2 Dashboard and Monitoring Views
The frontend includes a set of dashboards tailored to each role, such as:

- Overview dashboards with statistics on organisations, alerts, agents, and model versions
- Attack and traffic analytics charts
- Risk score visualisation
- Logs viewer for alert and activity records
- Flow activity cards showing captured and uploaded counts
- Notification and audit history views

### 4.3 User Experience Design
The interface is designed to be intuitive and visually consistent, with reusable UI components for cards, tables, charts, navigation, and form elements. The design also supports responsive behaviour, making it usable across varying screen sizes.

## 5. Backend Implementation
The backend is the central processing engine of the system.

### 5.1 API Structure
The backend exposes multiple API routes grouped by functionality. These include:

- Authentication endpoints for login, registration, verification, and password reset
- Organisation endpoints for creating, updating, and retrieving organisation records
- Admin endpoints for managing super, platform, and organisation admins
- Agent endpoints for authentication, heartbeat updates, and log upload
- Alert endpoints for storing and retrieving alerts
- Analytics endpoints for traffic, attack breakdown, and risk summaries
- Notification endpoints for internal and platform alerts
- Audit endpoints for reviewing system actions
- Model endpoints for training, deployment, and version management

### 5.1.1 Cloud Service Integration
The backend integrates with multiple cloud providers to handle specific workloads:

**Firebase Integration:**
- Uses Firebase Admin SDK to authenticate requests and manage Firestore collections
- Maintains real-time listeners for organisations, alerts, and notifications
- Implements Firestore queries with filtering and ordering for efficient data retrieval
- Leverages Firebase's serverless capabilities for automatic scaling

**AWS S3 Integration:**
- Uses boto3 library for S3 client operations
- Manages file uploads from agents to designated S3 buckets
- Generates presigned URLs for secure, time-limited access to uploaded files
- Implements key-based organisation of logs with timestamp prefixes
- Handles S3 bucket configuration for durability and versioning

**Email Service Integration:**
- Integrates with SendGrid/Brevo APIs via dedicated client libraries
- Sends verification emails during user registration
- Delivers password reset links securely
- Supports templated notifications for alert delivery
- Maintains email service credentials through environment configuration

### 5.1.2 Task Scheduling
The backend includes APScheduler (Advanced Python Scheduler) for background job management:

- Scheduled model retraining jobs at configured intervals
- Periodic cleanup of expired alerts and logs
- Automated report generation and delivery
- Health checks and system monitoring tasks
- Starts automatically on backend startup and shuts down gracefully on termination

### 5.2 Authentication and Authorisation
The backend uses a multi-layered authentication and authorisation strategy:

**Token-Based Authentication:**
- Users authenticate through the frontend using Firebase Authentication
- Upon successful login, Firebase provides a secure JWT token
- The frontend includes this token in subsequent API requests via Authorization headers
- The backend validates the token using Firebase Admin SDK to verify user identity and retrieve user claims

**Role-Based Access Control (RBAC):**
- Each user is assigned a role: super_admin, platform_admin, or org_admin
- Backend endpoints check the user's role before processing requests
- Permission decorators prevent unauthorised access to sensitive functions
- Organisation-scoped queries ensure users only see data relevant to their role

**Agent Authentication:**
- Agents authenticate using API keys provisioned during setup
- API keys are hashed and stored in the organisations collection
- Each heartbeat and upload request includes the API key in the X-API-Key header
- The backend verifies the key hash and checks organisation status before processing

**Session Management:**
- User sessions are managed through Firebase Authentication
- Tokens have configurable expiration times for security
- Refresh tokens enable seamless session extension without re-login
- Logout clears local authentication state on both frontend and backend

### 5.3 Organisation and Admin Management
The backend maintains records for organisations and their assigned admins. It supports:

- Organisation creation and status management
- Admin invitation and creation flows
- Role assignment and access regulation
- Organisation-level reporting and monitoring

### 5.4 Alert and Logging System
Alerts are generated and stored as structured records that contain information like severity, attack type, source IP, destination IP, protocol, and timestamp. These records are presented to admins through the logs and alerts interfaces for investigation and review.

### 5.5 Analytics and Reporting
The analytics services compute and expose data for:

- Traffic trends over time
- Attack type distribution
- Organisation-level comparisons
- Risk scoring
- Current system and agent health状況

These features allow operators to understand not only what happened but also how severe and widespread the activity was.

### 5.6 Notifications and Audit Trail
The backend includes notification services that alert relevant users to system events, such as agent online/offline status or important security changes. Audit tracking records actions taken by administrators so that the platform remains accountable and reviewable.

### 5.7 Backend Service Modules
The backend is organised into dedicated service modules that encapsulate logic for specific cloud and business functions:

**database.py (Firebase Service):**
- Manages Firestore client and connection lifecycle
- Provides centralised database access for all routes
- Handles collection references for organisations, alerts, admins, and audit logs
- Implements transaction management for data consistency

**firebase.py (Firebase Admin SDK):**
- Initialises Firebase Admin SDK with service account credentials
- Manages authentication token verification
- Handles user claims extraction and validation
- Provides access to Firebase services (Auth, Firestore, Storage)

**s3.py (AWS S3 Service):**
- Initialises boto3 S3 client with AWS credentials
- Implements file upload logic with error handling
- Generates presigned URLs for temporary access to stored files
- Manages S3 key generation with organisation and timestamp prefixes
- Handles file cleanup and versioning policies

**email.py (Email Service):**
- Integrates with SendGrid/Brevo APIs for transactional email
- Sends templated emails for verification, password reset, and notifications
- Manages email delivery status and retry logic
- Provides centralised email configuration management

**notifications.py (Notification Service):**
- Manages system and security event notifications
- Determines recipient lists based on roles and organisation scope
- Coordinates with email service for alert delivery
- Creates in-app notification records for audit and history purposes

**audit.py (Audit Service):**
- Logs administrative actions with timestamps and user context
- Records organisation-level events and state changes
- Stores audit trails in Firestore for compliance and review
- Provides query interfaces for audit history retrieval

## 6. Agent Component and Data Collection
The IDS agent is a critical component of the system because it provides the telemetry required for intrusion analysis.

### 6.1 Agent Responsibilities
The agent is responsible for:

- Collecting flow data from the network environment
- Capturing traffic-related metrics
- Reporting operational status to the backend
- Updating flow counters for captured and uploaded traffic
- Uploading collected logs for storage and analysis

### 6.2 Heartbeat and Sync Process
The agent sends periodic heartbeat signals to the backend. These heartbeat messages include:

- Current agent status (online/offline/error)
- Last sync timestamp and flow update count
- Installed model version and capabilities
- Flow counters (captured and uploaded counts)
- API key authentication

The backend processes these heartbeats to:
- Update organisation's last_sync timestamp
- Verify agent authentication and status
- Track flow counter progress
- Detect agent downtime or failures
- Trigger alerts if issues are detected

This enables the platform to maintain real-time visibility into agent health and operational status.

### 6.3 Log Upload Process
The agent uploads collected log files periodically or upon reaching batch thresholds. The upload process follows these steps:

1. **Log Collection**: Agent gathers network traffic or flow records into temporary CSV files
2. **Compression**: Logs are compressed to reduce transmission overhead
3. **Upload Request**: Agent sends authenticated upload request to backend with API key
4. **Backend Processing**: Backend validates the request, checks organisation status, and extracts key metrics
5. **S3 Transfer**: Backend uploads the log file to AWS S3 with organisation and timestamp prefixes
6. **Counter Update**: Backend increments the flows_uploaded counter for the organisation
7. **Confirmation**: Agent receives confirmation and clears local log buffers
8. **Presigned URLs**: Backend can generate presigned URLs for admins to download logs directly from S3

These uploaded logs serve as:
- Historical records for compliance and audit
- Training data for model refinement
- Evidence for forensic analysis
- Backup of flow information beyond Firestore retention

### 6.4 Flow Counters
One important part of the implementation is the measurement of flow activity. The system tracks:

- **Flows Captured**: The number of flow records or network events collected by the agent at the network interface level
- **Flows Uploaded**: The number of those flows or log batches successfully transmitted and stored in backend systems (S3 + processed alerts)

The difference between these counters indicates:
- Data loss or transmission failures (if uploaded < captured)
- Agent inactivity or misconfiguration (if both are zero)
- System operating normally (if uploaded ≈ captured with small lag)

Administrators monitor these counters to understand data collection and transmission pipeline health.

## 7. Data Flow in the System
The end-to-end data flow of the system can be described in detail as follows:

1. **Network Collection**: The IDS agent collects network traffic data, flow records, or connection metadata from the monitored network interface(s).

2. **Local Processing**: The agent performs initial classification using the installed ML model, generating alerts for suspicious activity and incrementing the flows_captured counter.

3. **Log Batching**: Collected logs are batched into CSV files and timestamped. The agent waits for configured batch size thresholds or time intervals before initiating upload.

4. **Heartbeat Transmission**: The agent sends periodic heartbeat signals to the backend API with authentication. The heartbeat includes flow counters, agent status, and last sync timestamp.

5. **Backend Validation**: The backend validates the heartbeat request using the provided API key, verifies organisation status, and updates Firestore organisation records with new telemetry (last_sync, updated_at).

6. **Log Upload to S3**: The agent uploads batched log files to the backend, which stores them in AWS S3 with organisation-scoped key prefixes (org_id/timestamp/filename). The backend generates presigned URLs for later retrieval if needed.

7. **Alert Processing**: The backend parses uploaded logs, extracts alert indicators, and stores individual alert records in Firestore's alerts collection with metadata (org_id, timestamp, attack_type, src_ip, dst_ip, severity).

8. **Counter Updates**: Upon successful log processing and S3 storage, the backend increments the flows_uploaded counter for the organisation and records the action in the audit trail.

9. **Frontend Sync**: The frontend subscriptions (via Firestore listeners) automatically receive updates to organisation records (flow counters, last_sync, agent_status) and new alerts in real-time.

10. **Dashboard Display**: The platform dashboards and logs viewer refresh with the latest telemetry. Administrators see:
    - Flow Activity metrics (Flows Captured, Flows Uploaded, Agent Status, Last Sync)
    - Alert logs filtered by organisation, attack type, and classification
    - Audit trails showing administrative actions and system events

11. **Admin Interaction**: Administrators review alerts, investigate suspicious activity, take remediation actions, and generate reports from the collected data. All actions are logged in the audit trail with user identity and timestamp.

12. **Long-term Retention**: Logs and processed data are retained in S3 for compliance and forensic analysis. Firestore alerts may be archived after a configurable retention period to manage costs.

This flow ensures real-time visibility, durable storage, multi-tenant isolation, and accountability across the entire intrusion detection system.

## 8. Security Considerations
Security is a core requirement of the system and is implemented in several ways:

- Role-based access control ensures that users only see relevant data.
- Authentication protects the backend and admin interfaces.
- API keys and secure agent communication are used for agent integration.
- Audit logs provide accountability for administrative actions.
- Sensitive data and system actions are separated according to role and scope.

These controls make the platform suitable for multi-tenant administration and reduce the risk of unauthorised access.

## 9. Deployment and Environment Setup
The project is structured to support local development and deployment through modular services and cloud provider integration.

### 9.1 Frontend Environment
The frontend is run using Vite and can be started locally from the frontend directory. It consumes the backend API and communicates with Firebase services used by the application.

**Configuration:**
- `VITE_API_BASE_URL`: URL of the backend API (e.g., http://localhost:8000)
- `VITE_FIREBASE_CONFIG`: Firebase project configuration (API key, project ID, auth domain)
- `VITE_FIREBASE_APP_ID`: Firebase app identifier

**Build and Deployment:**
- Development: `npm run dev` starts Vite dev server with hot reload
- Production: `npm run build` generates optimised static assets for deployment
- Can be deployed to Firebase Hosting, Vercel, or any static hosting service

### 9.2 Backend Environment
The backend is run with FastAPI and Uvicorn. It depends on Python packages listed in the backend requirements file and uses environment variables to configure runtime behaviour.

**Firebase Configuration:**
- `FIREBASE_SERVICE_ACCOUNT_JSON`: Path to Firebase service account credentials file
- The service account enables authentication, Firestore access, and user management

**AWS S3 Configuration:**
- `AWS_ACCESS_KEY_ID`: AWS access key for S3 operations
- `AWS_SECRET_ACCESS_KEY`: AWS secret key for S3 operations
- `AWS_S3_BUCKET_NAME`: Name of the S3 bucket for log storage
- `AWS_REGION`: AWS region for S3 bucket (e.g., us-east-1)

**Email Service Configuration:**
- `SENDGRID_API_KEY` or `BREVO_API_KEY`: API key for email service provider
- `EMAIL_FROM_ADDRESS`: Sender email address for transactional emails
- `EMAIL_TEMPLATE_IDS`: Identifiers for email templates (verification, reset, alert)

**Backend Server Configuration:**
- `BACKEND_HOST`: Host address for the backend server (default: 0.0.0.0)
- `BACKEND_PORT`: Port for the backend server (default: 8000)
- `BACKEND_DEBUG`: Debug mode for development (default: False)

**Agent Configuration:**
- `AGENT_HEARTBEAT_INTERVAL`: Time in seconds between agent heartbeats (default: 60)
- `MAX_LOG_BATCH_SIZE`: Maximum log records per batch upload
- `LOG_RETENTION_DAYS`: Days to retain logs in Firestore before archival

### 9.3 Scheduler Configuration
The backend includes APScheduler for background jobs:

- `SCHEDULER_ENABLED`: Enable/disable scheduled tasks (default: True)
- `MODEL_RETRAIN_SCHEDULE`: Cron expression for model retraining jobs
- `CLEANUP_SCHEDULE`: Cron expression for log cleanup jobs
- `REPORT_GENERATION_SCHEDULE`: Cron expression for automated report generation

### 9.4 Containerisation Support
The repository includes Docker configuration (Dockerfile, docker-compose.yml) which helps simplify deployment and supports a consistent environment across systems:

- **Frontend Container**: Runs Vite dev server or serves pre-built static assets
- **Backend Container**: Runs FastAPI/Uvicorn with all dependencies installed
- **docker-compose.yml**: Orchestrates multi-container deployment with networking and environment variable management

Docker deployment enables:
- Reproducible environments across development and production
- Easy scaling and load balancing
- Simple CI/CD pipeline integration
- Cloud platform deployment (AWS ECS, Google Cloud Run, Azure Container Instances)

## 10. Testing and Validation
The implementation was validated through build verification, integration testing, and inspection of major application flows.

**Build and Compilation Testing:**
- Frontend builds successfully without TypeScript or ESLint errors
- Dependencies resolve correctly and no version conflicts exist
- Vite transformation of ~2400 modules completes successfully

**Route and Access Control Testing:**
- Protected routes correctly redirect unauthenticated users
- Org_admin users can only access their assigned organisation
- Platform_admin users have access to all organisations
- Super_admin users have full system access
- Sidebar and navigation elements render correctly per role

**Flow Metrics Display:**
- Flow counters (Flows Captured, Flows Uploaded) retrieve values from Firestore organisations collection
- Flow Activity card displays when viewing logs for a specific organisation
- Real-time updates occur when organisation data changes
- Agent Status and Last Sync timestamp display correctly

**Cloud Service Integration Testing:**
- Firestore connection and authentication verified
- Firebase Authentication token validation working
- S3 connectivity confirmed (tested via test_s3.py)
- Email service integration validated (tested via test_smtp.py)
- API key authentication for agents functioning correctly

**Backend API Testing:**
- Authentication endpoints (login, registration) functional
- Admin management endpoints handling role assignment
- Alert creation and retrieval working with proper filtering
- Organisation records updating correctly with telemetry
- Heartbeat processing storing agent status and flow counters
- Log upload requests handling S3 transfers and counter updates

**Database Testing:**
- Firestore queries returning correct data subsets
- Real-time listeners updating UI when data changes
- Transaction consistency maintained for counter updates
- Multi-tenant isolation working correctly (organisations see only their data)

**Agent Communication Testing:**
- Heartbeat requests received and processed
- API key validation working for agent authentication
- Flow counter increments occurring correctly
- Log file uploads to S3 completing successfully

These tests help ensure the platform operates as intended and that the main workflows are functioning correctly.

## 11. Challenges and Limitations
Although the current system provides a strong foundation, several challenges and limitations should be considered:

**Configuration and Deployment:**
- Multiple environment variables and configuration files must be set correctly for cloud service integration
- Firebase and AWS credentials must be securely managed and rotated
- Docker Compose configuration requires host-level network access configuration for agent communication
- Initial setup requires coordination between frontend, backend, and cloud service provisioning

**Data Quality and Detection:**
- Detection quality depends on the completeness and accuracy of captured network traffic
- Machine learning models require periodic retraining with representative data
- False positives and false negatives may occur depending on model version and threshold tuning
- Encrypted traffic cannot be inspected, limiting detection capabilities

**Scalability Considerations:**
- Firestore pricing scales with number of reads/writes; high-volume systems may incur significant costs
- S3 storage costs grow with log retention periods and volume
- Real-time subscription limitations in Firestore may affect dashboards with many concurrent users
- Agent-to-backend latency may impact responsiveness during high-traffic periods

**Operational Challenges:**
- Agent deployment and management across diverse network environments requires careful planning
- Log retention policies must be balanced against storage costs and compliance requirements
- Monitoring and alerting for system health requires additional infrastructure
- Multi-region deployments require coordination of cloud resources across regions

**Security and Compliance:**
- Sensitive data (API keys, credentials) must be stored securely using secrets management solutions
- GDPR and data residency regulations may require additional data handling procedures
- Audit logging overhead increases with scale; long-term retention may require archival solutions
- Regular security assessments and penetration testing needed to identify vulnerabilities

**Future Enhancement Opportunities:**
- Implementation of temporal correlation analysis for detecting sophisticated multi-stage attacks
- Integration with threat intelligence feeds for contextual alerting
- Machine learning-based anomaly detection for zero-day attack detection
- Kubernetes orchestration for managed scaling and high availability
- GraphQL API layer for more flexible querying
- Advanced visualisation dashboards for attack pattern analysis
- Integration with SIEM systems for enterprise log correlation
- Advanced threat correlation and automated incident response can be expanded in future iterations.

## 12. Conclusion
IntelliSense IDS provides a practical and scalable foundation for intelligent intrusion detection and organisational security monitoring. Its modular architecture integrates multiple components into a cohesive security platform:

**Core Strengths:**
- **Three-Tier Architecture**: Clean separation between frontend (React/Vite), backend (FastAPI), and agent components enables independent scaling and maintenance
- **Cloud-Native Design**: Leverages Firebase for real-time data sync and authentication, AWS S3 for durable log storage, and managed email services for communications
- **Multi-Tenant Isolation**: Role-based access control (super_admin, platform_admin, org_admin) ensures organisations see only their data
- **Real-Time Visibility**: Firestore subscriptions provide live updates of flow metrics, alerts, and system status to administrators
- **Comprehensive Data Pipeline**: End-to-end flow from agent collection → backend processing → S3 storage → frontend display with full audit trail

**Architectural Advantages:**
- **Security by Design**: Authentication via Firebase, authorisation via role checks, API key-based agent authentication, and comprehensive audit logging
- **Scalability**: Serverless components (Firebase, S3) scale automatically; containerised backend can be load-balanced
- **Durability**: Multi-layered data storage (Firestore for hot data, S3 for archival) ensures no loss of security events
- **Operational Transparency**: Flow counters (captured vs. uploaded) provide visibility into agent health and data pipeline status

**Implementation Status:**
- Frontend fully functional with protected routes, role-based dashboards, and real-time alert display
- Backend APIs operational with authentication, alert ingestion, log upload, and reporting capabilities
- Cloud service integrations configured and tested (Firebase, S3, email services)
- Agent component capable of heartbeat transmission, log upload, and counter tracking
- Comprehensive documentation for setup, deployment, and operational procedures

**Path Forward:**
The platform successfully meets the core objectives of intrusion detection, organisational oversight, and administrative control. Future enhancements could include:
- Advanced machine learning models for zero-day detection and anomaly analysis
- Temporal correlation engine for detecting multi-stage attacks
- Integration with threat intelligence feeds for contextual alerting
- Kubernetes-based orchestration for managed scaling and high availability
- Advanced visualisation and reporting dashboards for executive briefings
- SIEM integration for enterprise log correlation and compliance reporting
- Automated incident response workflows for rapid threat mitigation

With its strong architectural foundation, cloud-native design, and comprehensive feature set, IntelliSense IDS is well-positioned to evolve into a production-ready cybersecurity platform suitable for enterprises requiring intelligent, scalable intrusion detection and security monitoring across multiple organisations.
