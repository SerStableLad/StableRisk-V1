#!/bin/bash

# Development startup script for Background Jobs Service
# This script provides easy commands for local development

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker first."
        exit 1
    fi
    print_status "Docker is running"
}

# Function to check if required files exist
check_files() {
    if [ ! -f "docker-compose.yml" ]; then
        print_error "docker-compose.yml not found in current directory"
        exit 1
    fi
    
    if [ ! -f "package.json" ]; then
        print_error "package.json not found in current directory"
        exit 1
    fi
    
    print_status "Required files found"
}

# Function to install dependencies
install_deps() {
    print_status "Installing Node.js dependencies..."
    npm install
    print_success "Dependencies installed"
}

# Function to start services
start_services() {
    print_status "Starting background services (Redis, PostgreSQL)..."
    docker-compose up -d redis postgres
    
    # Wait for services to be healthy
    print_status "Waiting for services to be ready..."
    sleep 10
    
    # Check Redis
    if docker-compose exec -T redis redis-cli ping | grep -q "PONG"; then
        print_success "Redis is ready"
    else
        print_warning "Redis might not be fully ready yet"
    fi
    
    # Check PostgreSQL
    if docker-compose exec -T postgres pg_isready -U bg_jobs_user -d background_jobs | grep -q "accepting connections"; then
        print_success "PostgreSQL is ready"
    else
        print_warning "PostgreSQL might not be fully ready yet"
    fi
}

# Function to stop services
stop_services() {
    print_status "Stopping all services..."
    docker-compose down
    print_success "Services stopped"
}

# Function to start development server
start_dev() {
    print_status "Starting development server..."
    npm run dev
}

# Function to run tests
run_tests() {
    print_status "Running tests..."
    npm test
}

# Function to run linting
run_lint() {
    print_status "Running ESLint..."
    npm run lint
}

# Function to build the project
build_project() {
    print_status "Building TypeScript project..."
    npm run build
    print_success "Build completed"
}

# Function to view logs
view_logs() {
    local service=${1:-""}
    if [ -n "$service" ]; then
        print_status "Viewing logs for $service..."
        docker-compose logs -f "$service"
    else
        print_status "Viewing logs for all services..."
        docker-compose logs -f
    fi
}

# Function to show service status
show_status() {
    print_status "Service Status:"
    docker-compose ps
    
    print_status "Container Health:"
    docker-compose exec -T redis redis-cli ping 2>/dev/null && print_success "Redis: Connected" || print_warning "Redis: Not connected"
    docker-compose exec -T postgres pg_isready -U bg_jobs_user -d background_jobs 2>/dev/null && print_success "PostgreSQL: Ready" || print_warning "PostgreSQL: Not ready"
    
    # Check if app is running locally
    if curl -s http://localhost:3001/health > /dev/null 2>&1; then
        print_success "Background Jobs Service: Running"
    else
        print_warning "Background Jobs Service: Not running"
    fi
}

# Function to clean up everything
cleanup() {
    print_status "Cleaning up development environment..."
    docker-compose down -v --remove-orphans
    docker system prune -f
    rm -rf node_modules dist logs/*.log 2>/dev/null || true
    print_success "Cleanup completed"
}

# Function to setup development environment
setup() {
    print_status "Setting up development environment..."
    check_docker
    check_files
    install_deps
    start_services
    print_success "Development environment ready!"
    print_status "You can now run: $0 dev"
}

# Function to show help
show_help() {
    echo "Background Jobs Service Development Script"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  setup         - Initial setup of development environment"
    echo "  dev           - Start development server (requires services to be running)"
    echo "  services      - Start background services (Redis, PostgreSQL)"
    echo "  stop          - Stop all services"
    echo "  status        - Show status of all services"
    echo "  logs [svc]    - View logs (optionally for specific service)"
    echo "  test          - Run test suite"
    echo "  lint          - Run ESLint"
    echo "  build         - Build TypeScript project"
    echo "  cleanup       - Clean up everything (removes volumes and containers)"
    echo "  help          - Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 setup      # Initial setup"
    echo "  $0 services   # Start Redis and PostgreSQL"
    echo "  $0 dev        # Start the development server"
    echo "  $0 logs redis # View Redis logs"
    echo "  $0 status     # Check service status"
}

# Parse command line arguments
case "${1:-help}" in
    "setup")
        setup
        ;;
    "dev")
        start_dev
        ;;
    "services")
        start_services
        ;;
    "stop")
        stop_services
        ;;
    "status")
        show_status
        ;;
    "logs")
        view_logs "$2"
        ;;
    "test")
        run_tests
        ;;
    "lint")
        run_lint
        ;;
    "build")
        build_project
        ;;
    "cleanup")
        cleanup
        ;;
    "help"|*)
        show_help
        ;;
esac