"""
Web Scraper API Routes
Endpoints for AI-powered web scraping to find GitHub repos and transparency resources
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import logging
import sys
import os

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from backend.services.web_scraper_service import web_scraper

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/web-scraper", tags=["Web Scraping"])


class WebScrapingRequest(BaseModel):
    """Request model for batch web scraping"""
    coin_ids: List[str]


class GitHubRepositoryResponse(BaseModel):
    """Response model for GitHub repository"""
    url: str
    owner: str
    repo_name: str
    found_on_page: str
    context: str
    confidence: float


class TransparencyResourceResponse(BaseModel):
    """Response model for transparency resource"""
    url: str
    resource_type: str
    title: str
    description: str
    found_on_page: str
    last_updated: Optional[str]
    confidence: float


class WebScrapingResultResponse(BaseModel):
    """Response model for complete web scraping result"""
    coin_id: str
    coin_name: str
    symbol: str
    homepage_url: str
    github_repositories: List[GitHubRepositoryResponse]
    primary_repository: Optional[GitHubRepositoryResponse]
    transparency_resources: List[TransparencyResourceResponse]
    reserve_proofs: List[TransparencyResourceResponse]
    audit_reports: List[TransparencyResourceResponse]
    pages_scraped: List[str]
    scraping_date: str
    success_rate: float
    warnings: List[str]


@router.get("/scrape/{coin_id}", response_model=WebScrapingResultResponse)
async def scrape_project_resources(coin_id: str):
    """
    Scrape project website to find GitHub repositories and transparency resources
    
    **Searches for:**
    - GitHub repositories (identifies primary repo)
    - Proof of reserves documentation
    - Security audit reports
    - Transparency dashboards
    - Collateral information
    - Governance resources
    
    **Features:**
    - AI-powered pattern recognition
    - Multiple page analysis (homepage, about, transparency, etc.)
    - Confidence scoring for found resources
    - Duplicate detection and filtering
    
    **Parameters:**
    - coin_id: CoinGecko coin identifier
    
    **Returns:**
    - Complete analysis of found GitHub repos and transparency resources
    """
    try:
        logger.info(f"Starting web scraping for {coin_id}")
        
        result = await web_scraper.scrape_project_resources(coin_id)
        
        if not result:
            raise HTTPException(
                status_code=404,
                detail=f"Could not scrape resources for {coin_id}. Check if the coin exists and has a homepage."
            )
        
        # Convert to response format
        github_repos = [
            GitHubRepositoryResponse(
                url=repo.url,
                owner=repo.owner,
                repo_name=repo.repo_name,
                found_on_page=repo.found_on_page,
                context=repo.context,
                confidence=repo.confidence
            ) for repo in result.github_repositories
        ]
        
        transparency_resources = [
            TransparencyResourceResponse(
                url=resource.url,
                resource_type=resource.resource_type,
                title=resource.title,
                description=resource.description,
                found_on_page=resource.found_on_page,
                last_updated=resource.last_updated,
                confidence=resource.confidence
            ) for resource in result.transparency_resources
        ]
        
        reserve_proofs = [
            TransparencyResourceResponse(
                url=resource.url,
                resource_type=resource.resource_type,
                title=resource.title,
                description=resource.description,
                found_on_page=resource.found_on_page,
                last_updated=resource.last_updated,
                confidence=resource.confidence
            ) for resource in result.reserve_proofs
        ]
        
        audit_reports = [
            TransparencyResourceResponse(
                url=resource.url,
                resource_type=resource.resource_type,
                title=resource.title,
                description=resource.description,
                found_on_page=resource.found_on_page,
                last_updated=resource.last_updated,
                confidence=resource.confidence
            ) for resource in result.audit_reports
        ]
        
        primary_repo = None
        if result.primary_repository:
            primary_repo = GitHubRepositoryResponse(
                url=result.primary_repository.url,
                owner=result.primary_repository.owner,
                repo_name=result.primary_repository.repo_name,
                found_on_page=result.primary_repository.found_on_page,
                context=result.primary_repository.context,
                confidence=result.primary_repository.confidence
            )
        
        return WebScrapingResultResponse(
            coin_id=result.coin_id,
            coin_name=result.coin_name,
            symbol=result.symbol,
            homepage_url=result.homepage_url,
            github_repositories=github_repos,
            primary_repository=primary_repo,
            transparency_resources=transparency_resources,
            reserve_proofs=reserve_proofs,
            audit_reports=audit_reports,
            pages_scraped=result.pages_scraped,
            scraping_date=result.scraping_date.isoformat(),
            success_rate=result.success_rate,
            warnings=result.warnings
        )
        
    except Exception as e:
        logger.error(f"Web scraping failed for {coin_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Web scraping failed: {str(e)}")


@router.get("/github/{coin_id}")
async def find_github_repositories(coin_id: str):
    """
    Find GitHub repositories for a project (focused search)
    
    **Features:**
    - Specialized GitHub repository detection
    - Primary repository identification
    - Confidence scoring based on context
    - Filtering of forks and examples
    
    **Parameters:**
    - coin_id: CoinGecko coin identifier
    
    **Returns:**
    - List of GitHub repositories found, ranked by confidence
    """
    try:
        result = await web_scraper.scrape_project_resources(coin_id)
        
        if not result:
            raise HTTPException(
                status_code=404,
                detail=f"Could not find GitHub repositories for {coin_id}"
            )
        
        github_repos = [
            {
                'url': repo.url,
                'owner': repo.owner,
                'repo_name': repo.repo_name,
                'confidence': repo.confidence,
                'context': repo.context[:100] + '...' if len(repo.context) > 100 else repo.context,
                'found_on_page': repo.found_on_page,
                'is_primary': repo == result.primary_repository
            } for repo in result.github_repositories
        ]
        
        return {
            'coin_id': result.coin_id,
            'symbol': result.symbol,
            'total_repositories_found': len(github_repos),
            'primary_repository': result.primary_repository.url if result.primary_repository else None,
            'repositories': github_repos,
            'analysis_summary': {
                'high_confidence_repos': len([r for r in github_repos if r['confidence'] > 0.7]),
                'potential_main_repos': len([r for r in github_repos if r['confidence'] > 0.6]),
                'total_unique_owners': len(set(repo.owner for repo in result.github_repositories))
            },
            'scraping_date': result.scraping_date.isoformat()
        }
        
    except Exception as e:
        logger.error(f"GitHub repository search failed for {coin_id}: {e}")
        raise HTTPException(status_code=500, detail=f"GitHub search failed: {str(e)}")


@router.get("/transparency/{coin_id}")
async def find_transparency_resources(coin_id: str):
    """
    Find transparency and audit resources for a project
    
    **Searches for:**
    - Proof of reserves documentation
    - Security audit reports
    - Reserve composition dashboards
    - Attestation reports
    - Governance information
    
    **Parameters:**
    - coin_id: CoinGecko coin identifier
    
    **Returns:**
    - Categorized transparency resources with confidence scores
    """
    try:
        result = await web_scraper.scrape_project_resources(coin_id)
        
        if not result:
            raise HTTPException(
                status_code=404,
                detail=f"Could not find transparency resources for {coin_id}"
            )
        
        # Group resources by type
        resources_by_type = {}
        for resource in result.transparency_resources:
            resource_type = resource.resource_type
            if resource_type not in resources_by_type:
                resources_by_type[resource_type] = []
            
            resources_by_type[resource_type].append({
                'url': resource.url,
                'title': resource.title,
                'description': resource.description[:150] + '...' if len(resource.description) > 150 else resource.description,
                'confidence': resource.confidence,
                'found_on_page': resource.found_on_page
            })
        
        # Calculate transparency score
        transparency_score = min(1.0, len(result.transparency_resources) * 0.2)
        has_reserves = len(result.reserve_proofs) > 0
        has_audits = len(result.audit_reports) > 0
        
        return {
            'coin_id': result.coin_id,
            'symbol': result.symbol,
            'transparency_summary': {
                'total_resources_found': len(result.transparency_resources),
                'transparency_score': round(transparency_score, 2),
                'has_reserve_proofs': has_reserves,
                'has_audit_reports': has_audits,
                'resource_types_found': list(resources_by_type.keys())
            },
            'resources_by_type': resources_by_type,
            'high_confidence_resources': [
                {
                    'url': r.url,
                    'type': r.resource_type,
                    'title': r.title,
                    'confidence': r.confidence
                } for r in result.transparency_resources if r.confidence > 0.6
            ],
            'reserve_proofs': len(result.reserve_proofs),
            'audit_reports': len(result.audit_reports),
            'scraping_date': result.scraping_date.isoformat(),
            'warnings': result.warnings
        }
        
    except Exception as e:
        logger.error(f"Transparency resource search failed for {coin_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Transparency search failed: {str(e)}")


@router.post("/batch-scrape")
async def batch_scrape_projects(request: WebScrapingRequest):
    """
    Scrape multiple projects for GitHub repos and transparency resources
    
    **Features:**
    - Batch processing for up to 10 projects
    - Summary statistics across all projects
    - Aggregated findings and insights
    
    **Parameters:**
    - coin_ids: List of CoinGecko coin identifiers (max 10)
    
    **Returns:**
    - Summary analysis across all scraped projects
    """
    try:
        if len(request.coin_ids) > 10:
            raise HTTPException(
                status_code=400,
                detail="Maximum 10 coins allowed for batch scraping"
            )
        
        logger.info(f"Batch scraping {len(request.coin_ids)} projects")
        
        summary = await web_scraper.get_scraping_summary(request.coin_ids)
        
        if "error" in summary:
            raise HTTPException(
                status_code=400,
                detail=summary["error"]
            )
        
        return summary
        
    except Exception as e:
        logger.error(f"Batch scraping failed: {e}")
        raise HTTPException(status_code=500, detail=f"Batch scraping failed: {str(e)}")


@router.get("/summary/{coin_id}")
async def get_scraping_summary(coin_id: str):
    """
    Get quick summary of scraping results
    
    **Features:**
    - High-level overview of findings
    - Key metrics and confidence scores
    - Primary insights for dashboard display
    
    **Parameters:**
    - coin_id: CoinGecko coin identifier
    
    **Returns:**
    - Simplified summary suitable for quick analysis
    """
    try:
        result = await web_scraper.scrape_project_resources(coin_id)
        
        if not result:
            raise HTTPException(
                status_code=404,
                detail=f"Could not generate scraping summary for {coin_id}"
            )
        
        # Calculate key metrics
        high_confidence_repos = len([r for r in result.github_repositories if r.confidence > 0.7])
        high_confidence_transparency = len([r for r in result.transparency_resources if r.confidence > 0.6])
        
        # Determine data completeness
        data_completeness = "Low"
        if result.primary_repository and len(result.transparency_resources) >= 2:
            data_completeness = "High"
        elif result.primary_repository or len(result.transparency_resources) >= 1:
            data_completeness = "Medium"
        
        return {
            'coin_id': result.coin_id,
            'symbol': result.symbol,
            'scraping_summary': {
                'github_repositories_found': len(result.github_repositories),
                'primary_repo_identified': result.primary_repository is not None,
                'transparency_resources_found': len(result.transparency_resources),
                'reserve_proofs_found': len(result.reserve_proofs),
                'audit_reports_found': len(result.audit_reports),
                'data_completeness': data_completeness
            },
            'key_findings': {
                'primary_repository': result.primary_repository.url if result.primary_repository else None,
                'high_confidence_repos': high_confidence_repos,
                'high_confidence_transparency': high_confidence_transparency,
                'success_rate': result.success_rate
            },
            'warnings': result.warnings[:3],  # Top 3 warnings
            'last_updated': result.scraping_date.isoformat()
        }
        
    except Exception as e:
        logger.error(f"Scraping summary failed for {coin_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Scraping summary failed: {str(e)}")


@router.get("/capabilities")
async def get_scraping_capabilities():
    """
    Get web scraping service capabilities and configuration
    
    **Returns:**
    - Available scraping features
    - Supported resource types
    - Configuration parameters
    """
    return {
        "service": "AI Web Scraper",
        "capabilities": {
            "github_detection": {
                "patterns_supported": 3,
                "confidence_scoring": True,
                "primary_repo_identification": True,
                "fork_filtering": True
            },
            "transparency_resources": {
                "resource_types": ["reserves", "audit", "collateral", "governance"],
                "pattern_recognition": True,
                "confidence_scoring": True,
                "duplicate_filtering": True
            },
            "scraping_features": {
                "concurrent_page_scraping": True,
                "rate_limiting": True,
                "error_handling": True,
                "timeout_protection": True
            }
        },
        "supported_pages": [
            "Homepage", "About", "Team", "Transparency", 
            "Security", "Audits", "Reserves", "Governance",
            "Developers", "Documentation"
        ],
        "resource_patterns": {
            "reserves": ["proof of reserves", "POR", "reserve audit", "attestation"],
            "audit": ["security audit", "audit report", "code audit"],
            "collateral": ["collateral dashboard", "backing assets", "treasury"],
            "governance": ["governance portal", "DAO", "voting platform"]
        },
        "limitations": {
            "max_pages_per_site": 14,
            "max_batch_size": 10,
            "timeout_per_page": "30 seconds",
            "rate_limit": "2 requests per host"
        }
    }


@router.get("/health")
async def web_scraper_health():
    """
    Check web scraper service health
    
    **Returns:**
    - Service health status
    - Configuration validation
    - Available capabilities
    """
    try:
        return {
            "status": "healthy",
            "service": "Web Scraper Service",
            "configuration": {
                "github_patterns": len(web_scraper.github_patterns),
                "transparency_patterns": len(web_scraper.transparency_patterns),
                "priority_pages": len(web_scraper.priority_pages)
            },
            "features": [
                "GitHub repository detection",
                "Transparency resource finding",
                "AI pattern recognition",
                "Batch processing",
                "Confidence scoring"
            ],
            "last_check": "2024-01-01T00:00:00Z"
        }
    except Exception as e:
        logger.error(f"Web scraper health check failed: {e}")
        raise HTTPException(status_code=500, detail=f"Health check failed: {str(e)}") 