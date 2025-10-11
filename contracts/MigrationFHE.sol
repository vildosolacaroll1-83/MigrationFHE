// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract MigrationFHE is SepoliaConfig {
    struct EncryptedMigrationData {
        uint256 countryId;
        euint32 encryptedInflow;      // Encrypted immigration numbers
        euint32 encryptedOutflow;      // Encrypted emigration numbers
        euint32 encryptedDemographics; // Encrypted demographic breakdown
        uint256 timestamp;
    }
    
    struct MigrationAnalysis {
        string flowPattern;
        string trendPrediction;
        string networkAnalysis;
        bool isRevealed;
    }

    uint256 public countryCount;
    mapping(uint256 => EncryptedMigrationData) public migrationData;
    mapping(uint256 => MigrationAnalysis) public analyses;
    
    mapping(string => euint32) private encryptedPatternCount;
    string[] private patternList;
    
    mapping(uint256 => uint256) private requestToCountryId;
    mapping(address => bool) private authorizedAgencies;
    
    event DataSubmitted(uint256 indexed countryId, uint256 timestamp);
    event AnalysisRequested(uint256 indexed countryId);
    event AnalysisCompleted(uint256 indexed countryId);
    
    modifier onlyAuthorized() {
        require(authorizedAgencies[msg.sender], "Unauthorized agency");
        _;
    }
    
    constructor() {
        authorizedAgencies[msg.sender] = true;
    }
    
    function authorizeAgency(address agency) public onlyAuthorized {
        authorizedAgencies[agency] = true;
    }
    
    function submitEncryptedData(
        euint32 encryptedInflow,
        euint32 encryptedOutflow,
        euint32 encryptedDemographics
    ) public onlyAuthorized {
        countryCount += 1;
        uint256 newId = countryCount;
        
        migrationData[newId] = EncryptedMigrationData({
            countryId: newId,
            encryptedInflow: encryptedInflow,
            encryptedOutflow: encryptedOutflow,
            encryptedDemographics: encryptedDemographics,
            timestamp: block.timestamp
        });
        
        analyses[newId] = MigrationAnalysis({
            flowPattern: "",
            trendPrediction: "",
            networkAnalysis: "",
            isRevealed: false
        });
        
        emit DataSubmitted(newId, block.timestamp);
    }
    
    function requestMigrationAnalysis(uint256 countryId) public onlyAuthorized {
        EncryptedMigrationData storage data = migrationData[countryId];
        require(!analyses[countryId].isRevealed, "Analysis already completed");
        
        bytes32[] memory ciphertexts = new bytes32[](3);
        ciphertexts[0] = FHE.toBytes32(data.encryptedInflow);
        ciphertexts[1] = FHE.toBytes32(data.encryptedOutflow);
        ciphertexts[2] = FHE.toBytes32(data.encryptedDemographics);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.performAnalysis.selector);
        requestToCountryId[reqId] = countryId;
        
        emit AnalysisRequested(countryId);
    }
    
    function performAnalysis(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 countryId = requestToCountryId[requestId];
        require(countryId != 0, "Invalid request");
        
        MigrationAnalysis storage analysis = analyses[countryId];
        require(!analysis.isRevealed, "Analysis already completed");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        uint32[] memory results = abi.decode(cleartexts, (uint32[]));
        uint32 inflow = results[0];
        uint32 outflow = results[1];
        uint32 demographics = results[2];
        
        analysis.flowPattern = determineFlowPattern(inflow, outflow);
        analysis.trendPrediction = predictMigrationTrend(inflow, outflow, demographics);
        analysis.networkAnalysis = analyzeNetworkPatterns(inflow, outflow);
        analysis.isRevealed = true;
        
        if (FHE.isInitialized(encryptedPatternCount[analysis.flowPattern]) == false) {
            encryptedPatternCount[analysis.flowPattern] = FHE.asEuint32(0);
            patternList.push(analysis.flowPattern);
        }
        encryptedPatternCount[analysis.flowPattern] = FHE.add(
            encryptedPatternCount[analysis.flowPattern], 
            FHE.asEuint32(1)
        );
        
        emit AnalysisCompleted(countryId);
    }
    
    function getMigrationAnalysis(uint256 countryId) public view returns (
        string memory flowPattern,
        string memory trendPrediction,
        string memory networkAnalysis,
        bool isRevealed
    ) {
        MigrationAnalysis storage ma = analyses[countryId];
        return (ma.flowPattern, ma.trendPrediction, ma.networkAnalysis, ma.isRevealed);
    }
    
    function getEncryptedPatternCount(string memory pattern) public view returns (euint32) {
        return encryptedPatternCount[pattern];
    }
    
    function requestPatternCountDecryption(string memory pattern) public onlyAuthorized {
        euint32 count = encryptedPatternCount[pattern];
        require(FHE.isInitialized(count), "Pattern not found");
        
        bytes32[] memory ciphertexts = new bytes32[](1);
        ciphertexts[0] = FHE.toBytes32(count);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptPatternCount.selector);
        requestToCountryId[reqId] = bytes32ToUint(keccak256(abi.encodePacked(pattern)));
    }
    
    function decryptPatternCount(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public onlyAuthorized {
        uint256 patternHash = requestToCountryId[requestId];
        string memory pattern = getPatternFromHash(patternHash);
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        uint32 count = abi.decode(cleartexts, (uint32));
    }
    
    // Migration analysis helper functions
    function determineFlowPattern(uint32 inflow, uint32 outflow) private pure returns (string memory) {
        if (inflow > outflow * 2) return "NetImmigrationHub";
        if (outflow > inflow * 2) return "NetEmigrationSource";
        if (inflow > outflow) return "BalancedImmigration";
        if (outflow > inflow) return "BalancedEmigration";
        return "NeutralFlow";
    }
    
    function predictMigrationTrend(uint32 inflow, uint32 outflow, uint32 demographics) private pure returns (string memory) {
        uint32 netFlow = inflow > outflow ? inflow - outflow : outflow - inflow;
        uint32 ratio = (demographics & 0xFFFF) * 100 / ((demographics >> 16) & 0xFFFF);
        
        if (netFlow > 10000 && ratio > 70) return "StrongGrowth";
        if (netFlow > 5000 && ratio > 50) return "ModerateGrowth";
        if (netFlow < 1000 && ratio < 30) return "DecliningTrend";
        return "StablePattern";
    }
    
    function analyzeNetworkPatterns(uint32 inflow, uint32 outflow) private pure returns (string memory) {
        uint32 total = inflow + outflow;
        if (total > 50000) return "GlobalHub";
        if (total > 20000) return "RegionalNode";
        if (total > 5000) return "LocalConnector";
        return "LimitedMobility";
    }
    
    function bytes32ToUint(bytes32 b) private pure returns (uint256) {
        return uint256(b);
    }
    
    function getPatternFromHash(uint256 hash) private view returns (string memory) {
        for (uint i = 0; i < patternList.length; i++) {
            if (bytes32ToUint(keccak256(abi.encodePacked(patternList[i]))) == hash) {
                return patternList[i];
            }
        }
        revert("Pattern not found");
    }
}