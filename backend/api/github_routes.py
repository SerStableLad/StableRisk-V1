"""
GitHub Repository Analysis API Routes
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, HttpUrl
from typing import List, Optional, Dict, Any
import logging
import sys
import os

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from backend.services.github_service import GitHubCrawlerService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/github", tags=["GitHub Analysis"])

# Initialize service
github_service = GitHubCrawlerService()


class RepositoryRequest(BaseModel):
    """Request model for repository analysis"""
    repo_url: HttpUrl
    

class MultiRepositoryRequest(BaseModel):
    """Request model for multiple repository analysis"""
    repo_urls: List[HttpUrl]


class AuditInfoResponse(BaseModel):
    """Response model for audit information"""
    file_path: str
    audit_date: Optional[str]
    auditor: Optional[str]
    audit_type: str
    content_preview: str
    file_size: int
    last_modified: Optional[str]


class OracleInfoResponse(BaseModel):
    """Response model for oracle information"""
    oracle_type: str
    price_feeds: List[str]
    oracle_contracts: List[str]
    decentralization_score: float
    oracle_patterns: List[str]


class RepositoryAnalysisResponse(BaseModel):
    """Response model for repository analysis"""
    repo_url: str
    repo_name: str
    last_updated: str
    total_files: int
    audit_files: List[AuditInfoResponse]
    oracle_info: Optional[OracleInfoResponse]
    security_score: float
    has_recent_audits: bool
    audit_count: int
    oracle_decentralization: float


class RepositorySummaryResponse(BaseModel):
    """Response model for repository summary"""
    total_repos: int
    avg_security_score: float
    total_audits: int
    repos_with_recent_audits: int
    oracle_coverage: float
    analyses: List[Dict[str, Any]]


@router.post("/analyze-repository", response_model=RepositoryAnalysisResponse)
async def analyze_repository(request: RepositoryRequest):
    """
    Analyze a single GitHub repository for audits and oracle infrastructure
    
    **Features:**
    - Scans for audit files (PDF, MD, TXT formats)
    - Detects oracle patterns (Chainlink, Band, Uniswap, custom)
    - Calculates security and oracle decentralization scores
    - Extracts audit dates and auditor information
    
    **Parameters:**
    - repo_url: GitHub repository URL
    
    **Returns:**
    - Complete repository analysis including security metrics
    """
    try:
        logger.info(f"Analyzing repository: {request.repo_url}")
        
        analysis = await github_service.analyze_repository(str(request.repo_url))
        
        if not analysis:
            raise HTTPException(
                status_code=404, 
                detail=f"Repository not found or analysis failed: {request.repo_url}"
            )
        
        # Convert dataclasses to response models
        audit_files_response = [
            AuditInfoResponse(
                file_path=audit.file_path,
                audit_date=audit.audit_date.isoformat() if audit.audit_date else None,
                auditor=audit.auditor,
                audit_type=audit.audit_type,
                content_preview=audit.content_preview,
                file_size=audit.file_size,
                last_modified=audit.last_modified.isoformat() if audit.last_modified else None
            )
            for audit in analysis.audit_files
        ]
        
        oracle_info_response = None
        if analysis.oracle_info:
            oracle_info_response = OracleInfoResponse(
                oracle_type=analysis.oracle_info.oracle_type,
                price_feeds=analysis.oracle_info.price_feeds,
                oracle_contracts=analysis.oracle_info.oracle_contracts,
                decentralization_score=analysis.oracle_info.decentralization_score,
                oracle_patterns=analysis.oracle_info.oracle_patterns
            )
        
        return RepositoryAnalysisResponse(
            repo_url=analysis.repo_url,
            repo_name=analysis.repo_name,
            last_updated=analysis.last_updated.isoformat(),
            total_files=analysis.total_files,
            audit_files=audit_files_response,
            oracle_info=oracle_info_response,
            security_score=analysis.security_score,
            has_recent_audits=analysis.has_recent_audits,
            audit_count=analysis.audit_count,
            oracle_decentralization=analysis.oracle_decentralization
        )
        
    except Exception as e:
        logger.error(f"Error analyzing repository {request.repo_url}: {e}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.post("/analyze-repositories", response_model=RepositorySummaryResponse)
async def analyze_multiple_repositories(request: MultiRepositoryRequest):
    """
    Analyze multiple GitHub repositories and provide summary statistics
    
    **Features:**
    - Batch analysis of multiple repositories
    - Aggregate security scoring and audit statistics
    - Oracle infrastructure coverage analysis
    - Summary metrics across all analyzed repositories
    
    **Parameters:**
    - repo_urls: List of GitHub repository URLs
    
    **Returns:**
    - Summary analysis with aggregate metrics and individual repository scores
    """
    try:
        logger.info(f"Analyzing {len(request.repo_urls)} repositories")
        
        repo_urls_str = [str(url) for url in request.repo_urls]
        summary = await github_service.get_repository_summary(repo_urls_str)
        
        return RepositorySummaryResponse(**summary)
        
    except Exception as e:
        logger.error(f"Error analyzing multiple repositories: {e}")
        raise HTTPException(status_code=500, detail=f"Batch analysis failed: {str(e)}")


@router.get("/search-audits/{owner}/{repo}")
async def search_audit_files(owner: str, repo: str):
    """
    Search for audit files in a specific repository
    
    **Parameters:**
    - owner: Repository owner (GitHub username or organization)
    - repo: Repository name
    
    **Returns:**
    - List of audit files found in the repository
    """
    try:
        repo_full_name = f"{owner}/{repo}"
        logger.info(f"Searching audit files in {repo_full_name}")
        
        audit_files = await github_service.search_audit_files(repo_full_name)
        
        audit_files_response = [
            AuditInfoResponse(
                file_path=audit.file_path,
                audit_date=audit.audit_date.isoformat() if audit.audit_date else None,
                auditor=audit.auditor,
                audit_type=audit.audit_type,
                content_preview=audit.content_preview,
                file_size=audit.file_size,
                last_modified=audit.last_modified.isoformat() if audit.last_modified else None
            )
            for audit in audit_files
        ]
        
        return {
            "repository": repo_full_name,
            "audit_count": len(audit_files_response),
            "audit_files": audit_files_response
        }
        
    except Exception as e:
        logger.error(f"Error searching audit files for {owner}/{repo}: {e}")
        raise HTTPException(status_code=500, detail=f"Audit search failed: {str(e)}")


@router.get("/analyze-oracle/{owner}/{repo}")
async def analyze_oracle_infrastructure(owner: str, repo: str):
    """
    Analyze oracle infrastructure in a specific repository
    
    **Parameters:**
    - owner: Repository owner (GitHub username or organization)
    - repo: Repository name
    
    **Returns:**
    - Oracle infrastructure analysis including decentralization score
    """
    try:
        repo_full_name = f"{owner}/{repo}"
        logger.info(f"Analyzing oracle infrastructure in {repo_full_name}")
        
        oracle_info = await github_service.analyze_oracle_infrastructure(repo_full_name)
        
        if not oracle_info:
            return {
                "repository": repo_full_name,
                "oracle_detected": False,
                "message": "No oracle infrastructure detected"
            }
        
        oracle_info_response = OracleInfoResponse(
            oracle_type=oracle_info.oracle_type,
            price_feeds=oracle_info.price_feeds,
            oracle_contracts=oracle_info.oracle_contracts,
            decentralization_score=oracle_info.decentralization_score,
            oracle_patterns=oracle_info.oracle_patterns
        )
        
        return {
            "repository": repo_full_name,
            "oracle_detected": True,
            "oracle_info": oracle_info_response
        }
        
    except Exception as e:
        logger.error(f"Error analyzing oracle infrastructure for {owner}/{repo}: {e}")
        raise HTTPException(status_code=500, detail=f"Oracle analysis failed: {str(e)}")


@router.get("/health")
async def github_service_health():
    """
    Check GitHub service health and rate limit status
    
    **Returns:**
    - Service health status and GitHub API rate limit information
    """
    try:
        return {
            "status": "healthy",
            "service": "GitHub Crawler Service",
            "rate_limit_remaining": github_service._rate_limit_remaining,
            "rate_limit_reset": github_service._rate_limit_reset.isoformat(),
            "patterns": {
                "audit_patterns": len(github_service.audit_patterns),
                "oracle_types": len(github_service.oracle_patterns),
                "known_auditors": len(github_service.known_auditors)
            }
        }
    except Exception as e:
        logger.error(f"GitHub service health check failed: {e}")
        raise HTTPException(status_code=500, detail=f"Health check failed: {str(e)}") 