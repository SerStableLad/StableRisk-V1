"""
AI Web Scraper Service
Intelligent web scraping to find missing GitHub repositories and transparency dashboards
"""

import asyncio
import logging
import re
import aiohttp
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime
from dataclasses import dataclass
from urllib.parse import urljoin, urlparse
import sys
import os

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from backend.services.coingecko_service import CoinGeckoService

logger = logging.getLogger(__name__)


@dataclass
class GitHubRepository:
    """GitHub repository information found via scraping"""
    url: str
    owner: str
    repo_name: str
    found_on_page: str
    context: str  # Text around the link
    confidence: float  # 0-1 confidence this is the main repo


@dataclass
class TransparencyResource:
    """Transparency resource found via scraping"""
    url: str
    resource_type: str  # 'reserves', 'audit', 'collateral', 'governance'
    title: str
    description: str
    found_on_page: str
    last_updated: Optional[str]
    confidence: float


@dataclass
class WebScrapingResult:
    """Complete web scraping analysis result"""
    coin_id: str
    coin_name: str
    symbol: str
    homepage_url: str
    
    # Found repositories
    github_repositories: List[GitHubRepository]
    primary_repository: Optional[GitHubRepository]
    
    # Transparency resources
    transparency_resources: List[TransparencyResource]
    reserve_proofs: List[TransparencyResource]
    audit_reports: List[TransparencyResource]
    
    # Analysis metadata
    pages_scraped: List[str]
    scraping_date: datetime
    success_rate: float  # Percentage of pages successfully scraped
    warnings: List[str]


class WebScraperService:
    """AI-powered web scraping service for blockchain project analysis"""
    
    def __init__(self):
        self.coingecko_service = CoinGeckoService()
        
        # GitHub URL patterns
        self.github_patterns = [
            r'https?://github\.com/([^/]+)/([^/\s\'"?#]+)',
            r'github\.com/([^/]+)/([^/\s\'"?#]+)',
            r'git@github\.com:([^/]+)/([^/\s\'"?#]+)\.git'
        ]
        
        # Transparency resource patterns
        self.transparency_patterns = {
            'reserves': [
                r'proof.*of.*reserves?', r'por\b', r'reserve.*audit',
                r'transparency.*report', r'attestation', r'reserve.*proof',
                r'backing.*audit', r'collateral.*verification'
            ],
            'audit': [
                r'security.*audit', r'audit.*report', r'security.*review',
                r'smart.*contract.*audit', r'code.*audit', r'penetration.*test'
            ],
            'collateral': [
                r'collateral.*dashboard', r'backing.*assets', r'reserve.*composition',
                r'asset.*breakdown', r'treasury.*dashboard', r'vault.*status'
            ],
            'governance': [
                r'governance.*portal', r'dao\b', r'voting.*platform',
                r'proposal.*system', r'governance.*forum'
            ]
        }
        
        # Priority pages to check (relative to homepage)
        self.priority_pages = [
            '',  # Homepage
            '/about', '/about-us', '/team',
            '/transparency', '/security', '/audits',
            '/reserves', '/backing', '/collateral',
            '/governance', '/dao', '/community',
            '/developers', '/github', '/code',
            '/documentation', '/docs', '/whitepaper'
        ]
        
        # Request headers to avoid blocking
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
        }
    
    async def scrape_project_resources(self, coin_id: str) -> Optional[WebScrapingResult]:
        """
        Scrape project website to find GitHub repositories and transparency resources
        """
        try:
            logger.info(f"Starting web scraping for {coin_id}")
            
            # Get basic metadata
            metadata = await self.coingecko_service.get_coin_metadata(coin_id)
            if not metadata or not metadata.homepage_url:
                logger.warning(f"No homepage URL found for {coin_id}")
                return None
            
            homepage_url = metadata.homepage_url
            
            # Generate URLs to scrape
            urls_to_scrape = self._generate_urls_to_scrape(homepage_url)
            
            # Scrape pages
            scraped_content = await self._scrape_multiple_pages(urls_to_scrape)
            
            # Analyze content for GitHub repositories
            github_repos = self._extract_github_repositories(scraped_content)
            primary_repo = self._identify_primary_repository(github_repos)
            
            # Analyze content for transparency resources
            transparency_resources = self._extract_transparency_resources(scraped_content)
            
            # Categorize transparency resources
            reserve_proofs = [r for r in transparency_resources if r.resource_type == 'reserves']
            audit_reports = [r for r in transparency_resources if r.resource_type == 'audit']
            
            # Calculate success rate
            successful_pages = len([content for content in scraped_content.values() if content])
            success_rate = successful_pages / len(urls_to_scrape) if urls_to_scrape else 0
            
            # Generate warnings
            warnings = self._generate_warnings(github_repos, transparency_resources, success_rate)
            
            return WebScrapingResult(
                coin_id=coin_id,
                coin_name=metadata.name,
                symbol=metadata.symbol,
                homepage_url=homepage_url,
                github_repositories=github_repos,
                primary_repository=primary_repo,
                transparency_resources=transparency_resources,
                reserve_proofs=reserve_proofs,
                audit_reports=audit_reports,
                pages_scraped=list(scraped_content.keys()),
                scraping_date=datetime.utcnow(),
                success_rate=success_rate,
                warnings=warnings
            )
            
        except Exception as e:
            logger.error(f"Web scraping failed for {coin_id}: {e}")
            return None
    
    def _generate_urls_to_scrape(self, homepage_url: str) -> List[str]:
        """Generate list of URLs to scrape based on homepage"""
        base_url = homepage_url.rstrip('/')
        urls = []
        
        for path in self.priority_pages:
            full_url = f"{base_url}{path}"
            urls.append(full_url)
        
        return urls
    
    async def _scrape_multiple_pages(self, urls: List[str]) -> Dict[str, Optional[str]]:
        """Scrape multiple pages concurrently"""
        results = {}
        
        async with aiohttp.ClientSession(
            headers=self.headers,
            timeout=aiohttp.ClientTimeout(total=30),
            connector=aiohttp.TCPConnector(limit_per_host=2)
        ) as session:
            
            tasks = []
            for url in urls:
                task = self._scrape_single_page(session, url)
                tasks.append(task)
            
            # Execute with rate limiting
            scrape_results = await asyncio.gather(*tasks, return_exceptions=True)
            
            for url, result in zip(urls, scrape_results):
                if isinstance(result, Exception):
                    logger.warning(f"Failed to scrape {url}: {result}")
                    results[url] = None
                else:
                    results[url] = result
        
        return results
    
    async def _scrape_single_page(self, session: aiohttp.ClientSession, url: str) -> Optional[str]:
        """Scrape a single page with error handling"""
        try:
            async with session.get(url) as response:
                if response.status == 200:
                    content = await response.text()
                    return content
                else:
                    logger.warning(f"HTTP {response.status} for {url}")
                    return None
        except Exception as e:
            logger.debug(f"Failed to scrape {url}: {e}")
            return None
    
    def _extract_github_repositories(self, scraped_content: Dict[str, Optional[str]]) -> List[GitHubRepository]:
        """Extract GitHub repository URLs from scraped content"""
        repositories = []
        seen_repos = set()
        
        for page_url, content in scraped_content.items():
            if not content:
                continue
            
            # Find all GitHub URLs
            for pattern in self.github_patterns:
                matches = re.finditer(pattern, content, re.IGNORECASE)
                
                for match in matches:
                    if len(match.groups()) >= 2:
                        owner, repo_name = match.groups()[:2]
                        repo_url = f"https://github.com/{owner}/{repo_name}"
                        
                        # Avoid duplicates
                        if repo_url in seen_repos:
                            continue
                        seen_repos.add(repo_url)
                        
                        # Extract context around the link
                        start = max(0, match.start() - 100)
                        end = min(len(content), match.end() + 100)
                        context = content[start:end].strip()
                        
                        # Calculate confidence based on context and position
                        confidence = self._calculate_repo_confidence(repo_url, context, page_url)
                        
                        repositories.append(GitHubRepository(
                            url=repo_url,
                            owner=owner,
                            repo_name=repo_name,
                            found_on_page=page_url,
                            context=context,
                            confidence=confidence
                        ))
        
        return sorted(repositories, key=lambda r: r.confidence, reverse=True)
    
    def _calculate_repo_confidence(self, repo_url: str, context: str, page_url: str) -> float:
        """Calculate confidence that this is the main project repository"""
        confidence = 0.5  # Base confidence
        
        context_lower = context.lower()
        repo_lower = repo_url.lower()
        
        # Boost confidence for certain contexts
        positive_indicators = [
            'source code', 'github repository', 'main repository',
            'official repository', 'code repository', 'smart contract',
            'protocol', 'whitepaper', 'documentation'
        ]
        
        for indicator in positive_indicators:
            if indicator in context_lower:
                confidence += 0.1
        
        # Boost confidence for main/about pages
        if '/about' in page_url or page_url.endswith('/') or '/team' in page_url:
            confidence += 0.2
        
        # Reduce confidence for certain patterns
        if any(word in repo_lower for word in ['fork', 'mirror', 'example', 'tutorial']):
            confidence -= 0.3
        
        # Boost confidence for organization repos (less likely to be forks)
        common_org_names = ['makerdao', 'compound-finance', 'aave', 'uniswap', 'chainlink']
        if any(org in repo_lower for org in common_org_names):
            confidence += 0.2
        
        return max(0.1, min(1.0, confidence))
    
    def _identify_primary_repository(self, repositories: List[GitHubRepository]) -> Optional[GitHubRepository]:
        """Identify the most likely primary repository"""
        if not repositories:
            return None
        
        # Return the highest confidence repository
        return repositories[0]
    
    def _extract_transparency_resources(self, scraped_content: Dict[str, Optional[str]]) -> List[TransparencyResource]:
        """Extract transparency and audit resources from scraped content"""
        resources = []
        
        for page_url, content in scraped_content.items():
            if not content:
                continue
            
            # Look for links and sections related to transparency
            for resource_type, patterns in self.transparency_patterns.items():
                for pattern in patterns:
                    matches = re.finditer(pattern, content, re.IGNORECASE)
                    
                    for match in matches:
                        # Extract context around the match
                        start = max(0, match.start() - 200)
                        end = min(len(content), match.end() + 200)
                        context = content[start:end].strip()
                        
                        # Look for URLs in the context
                        url_matches = re.finditer(r'https?://[^\s<>"\']+', context)
                        
                        for url_match in url_matches:
                            resource_url = url_match.group()
                            
                            # Extract title/description
                            title, description = self._extract_resource_info(context, match.group())
                            
                            # Calculate confidence
                            confidence = self._calculate_resource_confidence(
                                resource_url, context, resource_type
                            )
                            
                            if confidence > 0.3:  # Only include high-confidence resources
                                resources.append(TransparencyResource(
                                    url=resource_url,
                                    resource_type=resource_type,
                                    title=title,
                                    description=description,
                                    found_on_page=page_url,
                                    last_updated=None,  # Could be extracted with more analysis
                                    confidence=confidence
                                ))
        
        # Remove duplicates and sort by confidence
        unique_resources = {}
        for resource in resources:
            key = (resource.url, resource.resource_type)
            if key not in unique_resources or resource.confidence > unique_resources[key].confidence:
                unique_resources[key] = resource
        
        return sorted(unique_resources.values(), key=lambda r: r.confidence, reverse=True)
    
    def _extract_resource_info(self, context: str, matched_text: str) -> Tuple[str, str]:
        """Extract title and description for a transparency resource"""
        # Simple extraction - could be enhanced with NLP
        lines = context.split('\n')
        
        title = matched_text.strip()
        description = context[:100].strip()
        
        # Clean up HTML tags if present
        title = re.sub(r'<[^>]+>', '', title)
        description = re.sub(r'<[^>]+>', '', description)
        
        return title, description
    
    def _calculate_resource_confidence(self, url: str, context: str, resource_type: str) -> float:
        """Calculate confidence for a transparency resource"""
        confidence = 0.4  # Base confidence
        
        context_lower = context.lower()
        url_lower = url.lower()
        
        # Boost confidence for relevant URL patterns
        type_indicators = {
            'reserves': ['reserves', 'proof', 'attestation', 'backing'],
            'audit': ['audit', 'security', 'review', 'report'],
            'collateral': ['collateral', 'dashboard', 'treasury', 'vault'],
            'governance': ['governance', 'dao', 'voting', 'proposal']
        }
        
        for indicator in type_indicators.get(resource_type, []):
            if indicator in url_lower or indicator in context_lower:
                confidence += 0.15
        
        # Boost confidence for certain domains
        trusted_domains = [
            'github.com', 'docs.google.com', 'drive.google.com',
            'medium.com', 'blog.', '.org', 'transparency.'
        ]
        
        for domain in trusted_domains:
            if domain in url_lower:
                confidence += 0.1
        
        # Reduce confidence for generic pages
        if any(generic in url_lower for generic in ['home', 'index', 'main']):
            confidence -= 0.2
        
        return max(0.1, min(1.0, confidence))
    
    def _generate_warnings(self, github_repos: List[GitHubRepository], 
                          transparency_resources: List[TransparencyResource],
                          success_rate: float) -> List[str]:
        """Generate warnings based on scraping results"""
        warnings = []
        
        if not github_repos:
            warnings.append("No GitHub repositories found on website")
        elif len(github_repos) > 5:
            warnings.append(f"Many GitHub repositories found ({len(github_repos)}) - may include forks/examples")
        
        if not transparency_resources:
            warnings.append("No transparency resources (audits, reserves, etc.) found")
        
        if success_rate < 0.5:
            warnings.append(f"Low scraping success rate ({success_rate:.1%}) - some pages inaccessible")
        
        # Check for specific resource types
        resource_types_found = set(r.resource_type for r in transparency_resources)
        
        if 'reserves' not in resource_types_found:
            warnings.append("No proof of reserves or reserve audit information found")
        
        if 'audit' not in resource_types_found:
            warnings.append("No security audit reports found")
        
        return warnings
    
    async def get_scraping_summary(self, coin_ids: List[str]) -> Dict[str, Any]:
        """Get scraping summary for multiple projects"""
        try:
            results = []
            
            for coin_id in coin_ids:
                scraping_result = await self.scrape_project_resources(coin_id)
                if scraping_result:
                    results.append({
                        'coin_id': scraping_result.coin_id,
                        'symbol': scraping_result.symbol,
                        'github_repos_found': len(scraping_result.github_repositories),
                        'primary_repo': scraping_result.primary_repository.url if scraping_result.primary_repository else None,
                        'transparency_resources': len(scraping_result.transparency_resources),
                        'reserve_proofs': len(scraping_result.reserve_proofs),
                        'audit_reports': len(scraping_result.audit_reports),
                        'success_rate': scraping_result.success_rate,
                        'warnings': len(scraping_result.warnings)
                    })
            
            # Calculate aggregate statistics
            if results:
                avg_repos = sum(r['github_repos_found'] for r in results) / len(results)
                avg_transparency = sum(r['transparency_resources'] for r in results) / len(results)
                avg_success = sum(r['success_rate'] for r in results) / len(results)
            else:
                avg_repos = avg_transparency = avg_success = 0
            
            return {
                'total_projects_analyzed': len(results),
                'results': results,
                'summary_statistics': {
                    'average_github_repos_found': round(avg_repos, 1),
                    'average_transparency_resources': round(avg_transparency, 1),
                    'average_success_rate': round(avg_success, 2),
                    'projects_with_github': len([r for r in results if r['github_repos_found'] > 0]),
                    'projects_with_transparency': len([r for r in results if r['transparency_resources'] > 0])
                }
            }
            
        except Exception as e:
            logger.error(f"Scraping summary failed: {e}")
            return {'error': str(e)}


# Global web scraper service instance
web_scraper = WebScraperService() 