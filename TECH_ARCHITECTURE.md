# Stablerisk System Architecture

## 1. Overview

The Stablerisk platform is an advanced risk management system designed for high performance, scalability, and reliability. Its architecture is built on a distributed, event-driven microservices pattern. At its core, the system utilizes an **Intelligent Universal Orchestrator** to manage complex workflows and a tiered data storage strategy to ensure data freshness and low latency. This design allows for independent development, deployment, and scaling of each component, creating a highly resilient and adaptable system.

## 2. Advanced Technology Stack

The Stablerisk architecture leverages a modern, robust, and scalable technology stack:

* **Full-Stack:** Next.js with React and a Node.js backend for high-performance, containerized with Docker. Tailwind CSS is used for styling.
* **Database:** PostgreSQL as the single source of truth for all persistent data, including user profiles, risk models, and historical analysis.
* **Caching:** Redis for the **Smart Cache Service** to provide in-memory, high-speed data access.
* **API Gateway:** NGINX serves as the centralized API gateway, responsible for routing, load balancing, SSL termination, and rate limiting.
* **AI Services:** Gemini Flash 2.5 LLM with timeout management, confidence scoring, and cost control
* **MCP Integrations:** CoinGecko MCP, Firecrawl MCP for enhanced data extraction capabilities

## 3. Advanced Performance Architecture

Performance is a critical pillar of the Stablerisk system. The architecture is designed to handle high transaction volumes with sub-millisecond latency.

* **Asynchronous Communication:** The system predominantly uses asynchronous, event-driven communication. This prevents services from blocking while waiting for a response, ensuring maximum throughput.
* **Smart Caching:** The **Intelligent Universal Orchestrator** employs a strategic caching policy using Redis. Frequently accessed data and recent reports are stored in the cache, significantly reducing database load and response times.
* **Resource Isolation:** Each microservice operates within its own container, providing resource isolation. This prevents a performance issue in one service from impacting the entire system.

## 4. System Architecture

The system is organized into distinct, loosely-coupled layers that communicate via well-defined APIs and events.

* **Client Layer:** The user interface (React.js) that interacts with the system via the API Gateway.
* **Gateway Layer:** The NGINX API Gateway, which acts as the single entry point for all external requests, routing traffic to the appropriate microservices.
* **Orchestration Layer:** The **Intelligent Universal Orchestrator** microservice. It is the central coordinator for all synchronous and asynchronous workflows.
* **Service Layer:** A collection of specialized microservices that handle specific business logic, such as:
    * `Risk-Assessment-Service`
    * `User-Management-Service`
    * `Notification-Service`
* **Data Layer:** The **Smart Cache Service (Redis)** and the **Primary Database (PostgreSQL)**.

## 5. Enhanced Directory Structure

The codebase is structured to promote modularity, clarity, and independent development.