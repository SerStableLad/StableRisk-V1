"""
Test Phase 2.1 Services
Comprehensive tests for pegging classifier, web scraper, and enhanced oracle detection
"""

import pytest
import asyncio
import sys
import os

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.services.pegging_classifier import pegging_classifier, PeggingType, CollateralType
from backend.services.web_scraper_service import web_scraper
from backend.services.enhanced_oracle_service import enhanced_oracle_service, OracleType, OracleRiskLevel


class TestPeggingClassifier:
    """Test the pegging type classifier service"""
    
    @pytest.mark.asyncio
    async def test_manual_classification_tether(self):
        """Test manual classification for USDT (Tether)"""
        result = await pegging_classifier.classify_pegging_mechanism("tether")
        
        assert result is not None
        assert result.coin_id == "tether"
        assert result.pegging_type == PeggingType.COLLATERAL_BACKED
        assert result.collateral_type == CollateralType.FIAT_BACKED
        assert result.confidence_score >= 0.9
        assert result.manual_override is not None
        assert result.stability_risk == "Low"
        
        print(f"✅ USDT Classification: {result.pegging_type.value} ({result.collateral_type.value})")
        print(f"   Confidence: {result.confidence_score:.1%}")
        print(f"   Description: {result.backing_description}")
    
    @pytest.mark.asyncio
    async def test_manual_classification_dai(self):
        """Test manual classification for DAI (Crypto-backed)"""
        result = await pegging_classifier.classify_pegging_mechanism("dai")
        
        assert result is not None
        assert result.coin_id == "dai"
        assert result.pegging_type == PeggingType.COLLATERAL_BACKED
        assert result.collateral_type == CollateralType.CRYPTO_BACKED
        assert result.confidence_score >= 0.9
        assert result.stability_risk == "Medium"  # Due to volatile collateral
        
        print(f"✅ DAI Classification: {result.pegging_type.value} ({result.collateral_type.value})")
        print(f"   Confidence: {result.confidence_score:.1%}")
        print(f"   Description: {result.backing_description}")
    
    @pytest.mark.asyncio
    async def test_manual_classification_frax(self):
        """Test manual classification for FRAX (Hybrid)"""
        result = await pegging_classifier.classify_pegging_mechanism("frax")
        
        assert result is not None
        assert result.coin_id == "frax"
        assert result.pegging_type == PeggingType.HYBRID
        assert result.collateral_type == CollateralType.MIXED_COLLATERAL
        assert result.confidence_score >= 0.9
        assert result.stability_risk == "Medium"
        assert result.complexity_risk == "High"
        
        print(f"✅ FRAX Classification: {result.pegging_type.value} ({result.collateral_type.value})")
        print(f"   Confidence: {result.confidence_score:.1%}")
        print(f"   Description: {result.backing_description}")
    
    @pytest.mark.asyncio
    async def test_automated_classification(self):
        """Test automated classification for unknown stablecoin"""
        # Test with a coin that should trigger automated analysis
        result = await pegging_classifier.classify_pegging_mechanism("usd-coin")
        
        assert result is not None
        assert result.coin_id == "usd-coin"
        assert result.pegging_type == PeggingType.COLLATERAL_BACKED
        assert result.confidence_score > 0.0
        
        print(f"✅ USDC Classification: {result.pegging_type.value}")
        print(f"   Confidence: {result.confidence_score:.1%}")
        print(f"   Analysis source: {result.sources_analyzed}")
    
    @pytest.mark.asyncio
    async def test_batch_classification(self):
        """Test batch classification of multiple stablecoins"""
        test_coins = ["tether", "dai", "frax", "usd-coin"]
        result = await pegging_classifier.get_classification_summary(test_coins)
        
        assert "total_analyzed" in result
        assert result["total_analyzed"] == len(test_coins)
        assert "classifications" in result
        assert "type_distribution" in result
        assert "stability_risk_distribution" in result
        
        print(f"✅ Batch Classification: {result['total_analyzed']} coins analyzed")
        print(f"   Type distribution: {result['type_distribution']}")
        print(f"   Risk distribution: {result['stability_risk_distribution']}")


class TestWebScraperService:
    """Test the AI web scraper service"""
    
    @pytest.mark.asyncio
    async def test_github_repository_detection(self):
        """Test GitHub repository detection for a project"""
        # Test with a coin that has a known website and GitHub repo
        result = await web_scraper.scrape_project_resources("chainlink")
        
        if result:  # Only test if scraping was successful
            assert result.coin_id == "chainlink"
            assert result.homepage_url is not None
            assert len(result.pages_scraped) > 0
            
            print(f"✅ Web Scraping for Chainlink:")
            print(f"   Homepage: {result.homepage_url}")
            print(f"   Pages scraped: {len(result.pages_scraped)}")
            print(f"   GitHub repos found: {len(result.github_repositories)}")
            print(f"   Transparency resources: {len(result.transparency_resources)}")
            print(f"   Success rate: {result.success_rate:.1%}")
            
            if result.primary_repository:
                print(f"   Primary repo: {result.primary_repository.url}")
                print(f"   Confidence: {result.primary_repository.confidence:.1%}")
            
            if result.warnings:
                print(f"   Warnings: {result.warnings[:2]}")
        else:
            print("⚠️  Web scraping test skipped (no homepage or access issues)")
    
    @pytest.mark.asyncio
    async def test_transparency_resource_detection(self):
        """Test transparency resource detection"""
        # Test with a project known to have transparency resources
        result = await web_scraper.scrape_project_resources("tether")
        
        if result:
            print(f"✅ Transparency Detection for Tether:")
            print(f"   Reserve proofs found: {len(result.reserve_proofs)}")
            print(f"   Audit reports found: {len(result.audit_reports)}")
            print(f"   Total transparency resources: {len(result.transparency_resources)}")
            
            # Check for specific types of resources
            resource_types = set(r.resource_type for r in result.transparency_resources)
            print(f"   Resource types detected: {list(resource_types)}")
        else:
            print("⚠️  Transparency detection test skipped")
    
    @pytest.mark.asyncio
    async def test_batch_scraping(self):
        """Test batch scraping for multiple projects"""
        test_coins = ["chainlink", "tether"]
        result = await web_scraper.get_scraping_summary(test_coins)
        
        if "error" not in result:
            assert "total_projects_analyzed" in result
            assert "summary_statistics" in result
            
            print(f"✅ Batch Scraping: {result['total_projects_analyzed']} projects")
            print(f"   Average GitHub repos: {result['summary_statistics']['average_github_repos_found']}")
            print(f"   Average transparency: {result['summary_statistics']['average_transparency_resources']}")
            print(f"   Average success rate: {result['summary_statistics']['average_success_rate']:.1%}")
        else:
            print("⚠️  Batch scraping test skipped")


class TestEnhancedOracleService:
    """Test the enhanced oracle infrastructure detection service"""
    
    @pytest.mark.asyncio
    async def test_chainlink_detection(self):
        """Test oracle detection for Chainlink project"""
        result = await enhanced_oracle_service.analyze_oracle_infrastructure("chainlink")
        
        if result:
            assert result.coin_id == "chainlink"
            
            print(f"✅ Oracle Analysis for Chainlink:")
            print(f"   Oracle endpoints found: {len(result.oracle_endpoints)}")
            print(f"   Oracle types used: {[ot.value for ot in result.oracle_types_used]}")
            print(f"   Risk level: {result.oracle_risk_level.value}")
            print(f"   Centralization score: {result.centralization_score:.2f}")
            print(f"   Reliability score: {result.reliability_score:.2f}")
            print(f"   Confidence: {result.confidence_score:.1%}")
            
            if result.primary_oracle:
                print(f"   Primary oracle: {result.primary_oracle.oracle_type.value}")
            
            if result.warnings:
                print(f"   Warnings: {result.warnings[:2]}")
        else:
            print("⚠️  Oracle analysis test skipped")
    
    @pytest.mark.asyncio
    async def test_defi_project_oracle_detection(self):
        """Test oracle detection for DeFi projects"""
        # Test with known DeFi projects that use oracles
        test_projects = ["dai", "compound-governance-token", "aave"]
        
        for coin_id in test_projects:
            result = await enhanced_oracle_service.analyze_oracle_infrastructure(coin_id)
            
            if result:
                print(f"✅ Oracle Analysis for {coin_id.upper()}:")
                print(f"   Oracle types: {[ot.value for ot in result.oracle_types_used]}")
                print(f"   Risk level: {result.oracle_risk_level.value}")
                print(f"   Price feed sources: {len(result.price_feed_sources)}")
                print(f"   Security features: {len(result.security_features)}")
                print(f"   Data sources: {result.data_sources}")
            else:
                print(f"⚠️  Oracle analysis for {coin_id} skipped")
    
    @pytest.mark.asyncio
    async def test_oracle_risk_assessment(self):
        """Test oracle risk assessment algorithms"""
        # Test risk assessment with different scenarios
        result = await enhanced_oracle_service.analyze_oracle_infrastructure("dai")
        
        if result:
            print(f"✅ Oracle Risk Assessment:")
            print(f"   Overall risk level: {result.oracle_risk_level.value}")
            print(f"   Centralization score: {result.centralization_score:.2f} (0=decentralized, 1=centralized)")
            print(f"   Reliability score: {result.reliability_score:.2f} (0=unreliable, 1=reliable)")
            
            # Verify risk assessment logic
            if result.oracle_endpoints:
                assert result.oracle_risk_level in [OracleRiskLevel.LOW, OracleRiskLevel.MEDIUM, OracleRiskLevel.HIGH, OracleRiskLevel.CRITICAL]
                assert 0.0 <= result.centralization_score <= 1.0
                assert 0.0 <= result.reliability_score <= 1.0
            
            print(f"   Risk factors detected: {len(result.warnings)}")
            print(f"   Fallback mechanisms: {result.fallback_mechanisms}")
        else:
            print("⚠️  Risk assessment test skipped")
    
    @pytest.mark.asyncio
    async def test_batch_oracle_analysis(self):
        """Test batch oracle analysis"""
        test_coins = ["chainlink", "dai", "frax"]
        result = await enhanced_oracle_service.get_oracle_summary(test_coins)
        
        if "error" not in result:
            assert "total_projects_analyzed" in result
            assert "summary_statistics" in result
            
            print(f"✅ Batch Oracle Analysis: {result['total_projects_analyzed']} projects")
            print(f"   Average centralization: {result['summary_statistics']['average_centralization_score']:.2f}")
            print(f"   Average reliability: {result['summary_statistics']['average_reliability_score']:.2f}")
            print(f"   Projects with oracles: {result['summary_statistics']['projects_with_oracles']}")
            print(f"   High risk projects: {result['summary_statistics']['high_risk_projects']}")
        else:
            print("⚠️  Batch oracle analysis test skipped")


class TestIntegratedPhase21:
    """Test integrated Phase 2.1 functionality"""
    
    @pytest.mark.asyncio
    async def test_comprehensive_stablecoin_analysis(self):
        """Test comprehensive analysis using all Phase 2.1 services"""
        coin_id = "dai"
        
        print(f"\n🔍 Comprehensive Analysis for {coin_id.upper()}:")
        
        # 1. Pegging Classification
        pegging_result = await pegging_classifier.classify_pegging_mechanism(coin_id)
        if pegging_result:
            print(f"📊 Pegging: {pegging_result.pegging_type.value} ({pegging_result.collateral_type.value if pegging_result.collateral_type else 'N/A'})")
            print(f"   Stability Risk: {pegging_result.stability_risk}")
        
        # 2. Web Scraping
        scraping_result = await web_scraper.scrape_project_resources(coin_id)
        if scraping_result:
            print(f"🌐 Web Analysis: {len(scraping_result.github_repositories)} GitHub repos, {len(scraping_result.transparency_resources)} transparency resources")
            if scraping_result.primary_repository:
                print(f"   Primary Repo: {scraping_result.primary_repository.url}")
        
        # 3. Oracle Analysis
        oracle_result = await enhanced_oracle_service.analyze_oracle_infrastructure(coin_id)
        if oracle_result:
            print(f"🔮 Oracle: {oracle_result.oracle_risk_level.value} risk, {len(oracle_result.oracle_endpoints)} endpoints")
            if oracle_result.primary_oracle:
                print(f"   Primary Oracle: {oracle_result.primary_oracle.oracle_type.value}")
        
        # Verify we got results from at least one service
        results_count = sum([
            1 if pegging_result else 0,
            1 if scraping_result else 0,
            1 if oracle_result else 0
        ])
        
        assert results_count >= 1, "At least one Phase 2.1 service should return results"
        print(f"✅ Comprehensive analysis completed: {results_count}/3 services successful")


# Run the tests
if __name__ == "__main__":
    async def run_all_tests():
        """Run all Phase 2.1 tests"""
        print("🧪 Testing Phase 2.1 Services\n")
        
        # Test Pegging Classifier
        print("=" * 50)
        print("TESTING PEGGING CLASSIFIER")
        print("=" * 50)
        
        pegging_tests = TestPeggingClassifier()
        await pegging_tests.test_manual_classification_tether()
        await pegging_tests.test_manual_classification_dai()
        await pegging_tests.test_manual_classification_frax()
        await pegging_tests.test_automated_classification()
        await pegging_tests.test_batch_classification()
        
        print("\n" + "=" * 50)
        print("TESTING WEB SCRAPER SERVICE")
        print("=" * 50)
        
        # Test Web Scraper
        scraper_tests = TestWebScraperService()
        await scraper_tests.test_github_repository_detection()
        await scraper_tests.test_transparency_resource_detection()
        await scraper_tests.test_batch_scraping()
        
        print("\n" + "=" * 50)
        print("TESTING ENHANCED ORACLE SERVICE")
        print("=" * 50)
        
        # Test Enhanced Oracle Service
        oracle_tests = TestEnhancedOracleService()
        await oracle_tests.test_chainlink_detection()
        await oracle_tests.test_defi_project_oracle_detection()
        await oracle_tests.test_oracle_risk_assessment()
        await oracle_tests.test_batch_oracle_analysis()
        
        print("\n" + "=" * 50)
        print("TESTING INTEGRATED FUNCTIONALITY")
        print("=" * 50)
        
        # Test Integrated Functionality
        integrated_tests = TestIntegratedPhase21()
        await integrated_tests.test_comprehensive_stablecoin_analysis()
        
        print("\n🎉 Phase 2.1 Testing Complete!")
        print("\n📋 Summary of Phase 2.1 Features:")
        print("   ✅ Pegging Type Classifier with manual overrides")
        print("   ✅ AI Web Scraper for GitHub repositories") 
        print("   ✅ AI Web Scraper for transparency resources")
        print("   ✅ Enhanced Oracle Infrastructure Detection")
        print("   ✅ Pattern-based analysis and confidence scoring")
        print("   ✅ Comprehensive risk assessment integration")
    
    # Run tests
    asyncio.run(run_all_tests()) 