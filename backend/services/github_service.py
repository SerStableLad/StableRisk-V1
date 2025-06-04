"""
GitHub Repository Crawler Service
Scans repositories for audit files, oracle patterns, and security information
"""

import aiohttp
import asyncio
import logging
import re
import base64
from typing import List, Dict, Optional, Any, Set
from datetime import datetime, timedelta
from dataclasses import dataclass
import json
import sys
import os

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from config.api_keys import api_settings, get_github_headers

logger = logging.getLogger(__name__)


@dataclass
class AuditInfo:
    """Information about a security audit"""
    file_path: str
    audit_date: Optional[datetime]
    auditor: Optional[str]
    audit_type: str  # 'security', 'oracle', 'smart_contract', 'other'
    content_preview: str
    file_size: int
    last_modified: Optional[datetime]


@dataclass
class OracleInfo:
    """Information about oracle infrastructure"""
    oracle_type: str  # 'chainlink', 'band', 'uniswap', 'custom', 'unknown'
    price_feeds: List[str]
    oracle_contracts: List[str]
    decentralization_score: float  # 0-10 scale
    oracle_patterns: List[str]


@dataclass
class RepositoryAnalysis:
    """Complete analysis of a GitHub repository"""
    repo_url: str
    repo_name: str
    last_updated: datetime
    total_files: int
    audit_files: List[AuditInfo]
    oracle_info: Optional[OracleInfo]
    security_score: float  # 0-10 scale
    has_recent_audits: bool
    audit_count: int
    oracle_decentralization: float


class GitHubCrawlerService:
    """Service for crawling GitHub repositories and analyzing security/oracle patterns"""
    
    def __init__(self):
        self.base_url = api_settings.github_base_url
        self.headers = get_github_headers()
        self._rate_limit_remaining = 5000
        self._rate_limit_reset = datetime.utcnow()
        
        # Audit file patterns
        self.audit_patterns = [
            r'audit.*\.(pdf|md|txt|docx)',
            r'security.*report.*\.(pdf|md|txt)',
            r'.*audit.*report.*\.(pdf|md|txt)',
            r'pentest.*\.(pdf|md|txt)',
            r'security.*analysis.*\.(pdf|md|txt)',
            r'vulnerability.*assessment.*\.(pdf|md|txt)',
            r'code.*review.*\.(pdf|md|txt)',
            r'smart.*contract.*audit.*\.(pdf|md|txt)'
        ]
        
        # Oracle patterns in code
        self.oracle_patterns = {
            'chainlink': [
                r'AggregatorV3Interface',
                r'chainlink.*oracle',
                r'priceFeed\s*=.*AggregatorV3Interface',
                r'latestRoundData\(\)',
                r'@chainlink',
                r'chainlink.*price.*feed'
            ],
            'band': [
                r'band.*protocol',
                r'BandStdReference',
                r'getReferenceData',
                r'band.*oracle'
            ],
            'uniswap': [
                r'UniswapV[23].*Oracle',
                r'observe\(',
                r'uniswap.*twap',
                r'IUniswapV[23]Pool.*observe'
            ],
            'custom': [
                r'oracle.*contract',
                r'price.*oracle',
                r'external.*price.*feed',
                r'oracle.*interface'
            ]
        }
        
        # Auditor patterns
        self.known_auditors = [
            'consensys', 'trail.*bits', 'openzeppelin', 'certik', 'quantstamp',
            'chainsecurity', 'peckshield', 'slowmist', 'halborn', 'sigmaprime',
            'spearbit', 'code4rena', 'sherlock', 'immunefi', 'hacken'
        ]
    
    async def _make_github_request(self, endpoint: str, params: Dict[str, Any] = None) -> Dict[str, Any]:
        """Make an authenticated request to GitHub API with rate limit handling"""
        url = f"{self.base_url}{endpoint}"
        
        # Check rate limit
        if self._rate_limit_remaining < 10 and datetime.utcnow() < self._rate_limit_reset:
            wait_time = (self._rate_limit_reset - datetime.utcnow()).total_seconds()
            if wait_time > 0:
                logger.warning(f"GitHub rate limit low, waiting {wait_time:.0f} seconds")
                await asyncio.sleep(wait_time)
        
        async with aiohttp.ClientSession() as session:
            try:
                async with session.get(url, headers=self.headers, params=params) as response:
                    # Update rate limit info
                    self._rate_limit_remaining = int(response.headers.get('X-RateLimit-Remaining', 0))
                    reset_timestamp = int(response.headers.get('X-RateLimit-Reset', 0))
                    self._rate_limit_reset = datetime.fromtimestamp(reset_timestamp)
                    
                    if response.status == 200:
                        return await response.json()
                    elif response.status == 403:
                        logger.warning("GitHub rate limit exceeded or access denied")
                        raise Exception("GitHub rate limit exceeded")
                    elif response.status == 404:
                        logger.info(f"GitHub resource not found: {endpoint}")
                        return None
                    else:
                        error_text = await response.text()
                        logger.error(f"GitHub API error {response.status}: {error_text}")
                        raise Exception(f"GitHub API request failed: {response.status}")
            except aiohttp.ClientError as e:
                logger.error(f"GitHub request error: {e}")
                raise Exception(f"Network error: {e}")
    
    async def search_audit_files(self, repo_full_name: str) -> List[AuditInfo]:
        """Search for audit files in a repository"""
        audit_files = []
        
        try:
            # Search for audit files using GitHub search API
            for pattern in self.audit_patterns:
                search_query = f"repo:{repo_full_name} filename:{pattern}"
                params = {
                    'q': search_query,
                    'type': 'code',
                    'per_page': 20
                }
                
                try:
                    result = await self._make_github_request("/search/code", params)
                    
                    if result and 'items' in result:
                        for item in result['items']:
                            audit_info = await self._analyze_audit_file(repo_full_name, item)
                            if audit_info:
                                audit_files.append(audit_info)
                    
                    # Small delay to avoid hitting rate limits
                    await asyncio.sleep(0.1)
                    
                except Exception as e:
                    logger.warning(f"Error searching audit pattern {pattern}: {e}")
                    continue
            
            # Remove duplicates based on file path
            unique_audits = {}
            for audit in audit_files:
                if audit.file_path not in unique_audits:
                    unique_audits[audit.file_path] = audit
            
            return list(unique_audits.values())
            
        except Exception as e:
            logger.error(f"Error searching audit files for {repo_full_name}: {e}")
            return []
    
    async def _analyze_audit_file(self, repo_full_name: str, file_item: Dict) -> Optional[AuditInfo]:
        """Analyze a potential audit file and extract information"""
        try:
            file_path = file_item.get('path', '')
            file_name = file_item.get('name', '').lower()
            
            # Get file details
            file_url = f"/repos/{repo_full_name}/contents/{file_path}"
            file_details = await self._make_github_request(file_url)
            
            if not file_details:
                return None
            
            # Extract file content preview
            content_preview = ""
            if file_details.get('content') and file_details.get('encoding') == 'base64':
                try:
                    content_bytes = base64.b64decode(file_details['content'])
                    content_preview = content_bytes.decode('utf-8', errors='ignore')[:500]
                except Exception:
                    content_preview = "Binary file or encoding error"
            
            # Determine audit type
            audit_type = self._classify_audit_type(file_name, content_preview)
            
            # Extract audit date
            audit_date = self._extract_audit_date(content_preview, file_name)
            
            # Extract auditor
            auditor = self._extract_auditor(content_preview, file_name)
            
            # Parse last modified date
            last_modified = None
            try:
                if 'commit' in file_item and 'committer' in file_item['commit']:
                    last_modified = datetime.fromisoformat(
                        file_item['commit']['committer']['date'].replace('Z', '+00:00')
                    )
            except Exception:
                pass
            
            return AuditInfo(
                file_path=file_path,
                audit_date=audit_date,
                auditor=auditor,
                audit_type=audit_type,
                content_preview=content_preview,
                file_size=file_details.get('size', 0),
                last_modified=last_modified
            )
            
        except Exception as e:
            logger.warning(f"Error analyzing audit file {file_item.get('path', 'unknown')}: {e}")
            return None
    
    def _classify_audit_type(self, file_name: str, content: str) -> str:
        """Classify the type of audit based on filename and content"""
        file_name = file_name.lower()
        content = content.lower()
        
        if any(term in file_name or term in content for term in ['oracle', 'price feed', 'chainlink']):
            return 'oracle'
        elif any(term in file_name or term in content for term in ['smart contract', 'solidity', 'contract audit']):
            return 'smart_contract'
        elif any(term in file_name or term in content for term in ['security', 'vulnerability', 'pentest']):
            return 'security'
        else:
            return 'other'
    
    def _extract_audit_date(self, content: str, file_name: str) -> Optional[datetime]:
        """Extract audit date from content or filename"""
        # Date patterns in various formats
        date_patterns = [
            r'(\d{1,2}[-/]\d{1,2}[-/]\d{4})',  # MM/DD/YYYY or MM-DD-YYYY
            r'(\d{4}[-/]\d{1,2}[-/]\d{1,2})',  # YYYY/MM/DD or YYYY-MM-DD
            r'(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4}',
            r'(\d{1,2}\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4})'
        ]
        
        text_to_search = f"{content} {file_name}".lower()
        
        for pattern in date_patterns:
            matches = re.findall(pattern, text_to_search, re.IGNORECASE)
            if matches:
                try:
                    date_str = matches[0] if isinstance(matches[0], str) else matches[0][0]
                    # Try to parse various date formats
                    for fmt in ['%m/%d/%Y', '%Y/%m/%d', '%m-%d-%Y', '%Y-%m-%d']:
                        try:
                            return datetime.strptime(date_str, fmt)
                        except ValueError:
                            continue
                except Exception:
                    continue
        
        return None
    
    def _extract_auditor(self, content: str, file_name: str) -> Optional[str]:
        """Extract auditor name from content or filename"""
        text_to_search = f"{content} {file_name}".lower()
        
        for auditor in self.known_auditors:
            if re.search(auditor, text_to_search, re.IGNORECASE):
                return auditor.replace('.*', '').title()
        
        # Look for "audited by" patterns
        auditor_patterns = [
            r'audited by ([a-zA-Z\s]+)',
            r'audit by ([a-zA-Z\s]+)',
            r'conducted by ([a-zA-Z\s]+)',
            r'performed by ([a-zA-Z\s]+)'
        ]
        
        for pattern in auditor_patterns:
            matches = re.findall(pattern, text_to_search, re.IGNORECASE)
            if matches:
                auditor = matches[0].strip()
                if len(auditor) < 50:  # Reasonable auditor name length
                    return auditor.title()
        
        return None
    
    async def analyze_oracle_infrastructure(self, repo_full_name: str) -> Optional[OracleInfo]:
        """Analyze oracle infrastructure in a repository"""
        try:
            oracle_patterns_found = []
            oracle_contracts = []
            price_feeds = []
            oracle_type = 'unknown'
            
            # Search for oracle-related code patterns
            for oracle_provider, patterns in self.oracle_patterns.items():
                for pattern in patterns:
                    search_query = f"repo:{repo_full_name} {pattern}"
                    params = {
                        'q': search_query,
                        'type': 'code',
                        'per_page': 10
                    }
                    
                    try:
                        result = await self._make_github_request("/search/code", params)
                        
                        if result and 'items' in result and len(result['items']) > 0:
                            oracle_patterns_found.append(f"{oracle_provider}: {pattern}")
                            
                            if oracle_type == 'unknown':
                                oracle_type = oracle_provider
                            
                            # Extract contract addresses and feed info from code
                            for item in result['items'][:3]:  # Limit to avoid rate limits
                                oracle_contracts.append(item.get('path', ''))
                        
                        await asyncio.sleep(0.1)  # Rate limit protection
                        
                    except Exception as e:
                        logger.warning(f"Error searching oracle pattern {pattern}: {e}")
                        continue
            
            if not oracle_patterns_found:
                return None
            
            # Calculate decentralization score based on oracle types and patterns
            decentralization_score = self._calculate_oracle_decentralization(
                oracle_type, oracle_patterns_found
            )
            
            return OracleInfo(
                oracle_type=oracle_type,
                price_feeds=price_feeds,
                oracle_contracts=oracle_contracts,
                decentralization_score=decentralization_score,
                oracle_patterns=oracle_patterns_found
            )
            
        except Exception as e:
            logger.error(f"Error analyzing oracle infrastructure for {repo_full_name}: {e}")
            return None
    
    def _calculate_oracle_decentralization(self, oracle_type: str, patterns: List[str]) -> float:
        """Calculate oracle decentralization score (0-10)"""
        base_scores = {
            'chainlink': 8.0,  # Generally well decentralized
            'band': 7.0,       # Good decentralization
            'uniswap': 6.0,    # TWAP based, reasonably secure
            'custom': 3.0,     # Custom oracles are riskier
            'unknown': 2.0     # Unknown implementation
        }
        
        base_score = base_scores.get(oracle_type, 2.0)
        
        # Bonus points for multiple oracle types (diversification)
        unique_types = set(pattern.split(':')[0] for pattern in patterns)
        if len(unique_types) > 1:
            base_score += 1.0
        
        # Bonus for multiple price feeds
        if len(patterns) > 3:
            base_score += 0.5
        
        return min(base_score, 10.0)
    
    async def analyze_repository(self, repo_url: str) -> Optional[RepositoryAnalysis]:
        """Perform complete analysis of a GitHub repository"""
        try:
            # Extract repo name from URL
            repo_name = self._extract_repo_name(repo_url)
            if not repo_name:
                logger.error(f"Could not extract repo name from URL: {repo_url}")
                return None
            
            # Get repository metadata
            repo_info = await self._make_github_request(f"/repos/{repo_name}")
            if not repo_info:
                logger.error(f"Could not fetch repository info for {repo_name}")
                return None
            
            # Analyze audit files
            logger.info(f"Searching for audit files in {repo_name}")
            audit_files = await self.search_audit_files(repo_name)
            
            # Analyze oracle infrastructure
            logger.info(f"Analyzing oracle infrastructure in {repo_name}")
            oracle_info = await self.analyze_oracle_infrastructure(repo_name)
            
            # Calculate metrics
            has_recent_audits = any(
                audit.audit_date and 
                (datetime.utcnow() - audit.audit_date).days < 365
                for audit in audit_files
            )
            
            security_score = self._calculate_security_score(
                audit_files, oracle_info, repo_info
            )
            
            last_updated = datetime.fromisoformat(
                repo_info['updated_at'].replace('Z', '+00:00')
            )
            
            return RepositoryAnalysis(
                repo_url=repo_url,
                repo_name=repo_name,
                last_updated=last_updated,
                total_files=repo_info.get('size', 0),
                audit_files=audit_files,
                oracle_info=oracle_info,
                security_score=security_score,
                has_recent_audits=has_recent_audits,
                audit_count=len(audit_files),
                oracle_decentralization=oracle_info.decentralization_score if oracle_info else 0.0
            )
            
        except Exception as e:
            logger.error(f"Error analyzing repository {repo_url}: {e}")
            return None
    
    def _extract_repo_name(self, repo_url: str) -> Optional[str]:
        """Extract owner/repo from GitHub URL"""
        patterns = [
            r'github\.com/([^/]+/[^/]+)',
            r'github\.com/([^/]+/[^/]+)\.git',
            r'github\.com/([^/]+/[^/]+)/.*'
        ]
        
        for pattern in patterns:
            match = re.search(pattern, repo_url)
            if match:
                return match.group(1).rstrip('.git')
        
        return None
    
    def _calculate_security_score(self, audit_files: List[AuditInfo], 
                                oracle_info: Optional[OracleInfo], 
                                repo_info: Dict) -> float:
        """Calculate overall security score (0-10)"""
        score = 5.0  # Base score
        
        # Audit file scoring
        if audit_files:
            score += min(len(audit_files) * 1.0, 3.0)  # Up to +3 for audits
            
            # Bonus for recent audits
            recent_audits = [
                audit for audit in audit_files
                if audit.audit_date and (datetime.utcnow() - audit.audit_date).days < 365
            ]
            if recent_audits:
                score += 1.0
            
            # Bonus for known auditors
            known_auditor_audits = [
                audit for audit in audit_files
                if audit.auditor and any(
                    known in audit.auditor.lower() 
                    for known in self.known_auditors
                )
            ]
            if known_auditor_audits:
                score += 1.0
        else:
            score -= 2.0  # Penalty for no audits
        
        # Oracle infrastructure scoring
        if oracle_info:
            oracle_bonus = oracle_info.decentralization_score / 10.0 * 2.0  # Up to +2
            score += oracle_bonus
        
        # Repository activity scoring
        days_since_update = (datetime.utcnow() - datetime.fromisoformat(
            repo_info['updated_at'].replace('Z', '+00:00')
        )).days
        
        if days_since_update < 30:
            score += 0.5  # Recently updated
        elif days_since_update > 365:
            score -= 1.0  # Stale repository
        
        return max(0.0, min(score, 10.0))
    
    async def get_repository_summary(self, repo_urls: List[str]) -> Dict[str, Any]:
        """Get summary analysis for multiple repositories"""
        analyses = []
        
        for repo_url in repo_urls:
            analysis = await self.analyze_repository(repo_url)
            if analysis:
                analyses.append(analysis)
        
        if not analyses:
            return {
                "total_repos": 0,
                "avg_security_score": 0.0,
                "total_audits": 0,
                "repos_with_recent_audits": 0,
                "oracle_coverage": 0.0
            }
        
        return {
            "total_repos": len(analyses),
            "avg_security_score": sum(a.security_score for a in analyses) / len(analyses),
            "total_audits": sum(a.audit_count for a in analyses),
            "repos_with_recent_audits": sum(1 for a in analyses if a.has_recent_audits),
            "oracle_coverage": sum(1 for a in analyses if a.oracle_info) / len(analyses),
            "analyses": [
                {
                    "repo_name": a.repo_name,
                    "security_score": a.security_score,
                    "audit_count": a.audit_count,
                    "has_recent_audits": a.has_recent_audits,
                    "oracle_type": a.oracle_info.oracle_type if a.oracle_info else None,
                    "oracle_score": a.oracle_decentralization
                }
                for a in analyses
            ]
        } 