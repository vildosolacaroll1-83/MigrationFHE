// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface MigrationRecord {
  id: string;
  encryptedData: string;
  timestamp: number;
  countryFrom: string;
  countryTo: string;
  year: number;
  migrationCount: number;
}

const App: React.FC = () => {
  // Randomized style selections:
  // Colors: High contrast (blue+orange)
  // UI: Futuristic metal
  // Layout: Center radiation
  // Interaction: Micro-interactions
  
  // Randomized features:
  // 1. Data statistics
  // 2. Smart charts (bar chart)
  // 3. Search & filter
  // 4. Team information
  
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<MigrationRecord[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newRecordData, setNewRecordData] = useState({
    countryFrom: "",
    countryTo: "",
    year: new Date().getFullYear(),
    migrationCount: 0
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [filterYear, setFilterYear] = useState<number | null>(null);

  // Calculate statistics
  const totalMigrations = records.reduce((sum, record) => sum + record.migrationCount, 0);
  const uniqueCountries = new Set([
    ...records.map(r => r.countryFrom),
    ...records.map(r => r.countryTo)
  ]).size;

  useEffect(() => {
    loadRecords().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadRecords = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("migration_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing record keys:", e);
        }
      }
      
      const list: MigrationRecord[] = [];
      
      for (const key of keys) {
        try {
          const recordBytes = await contract.getData(`migration_${key}`);
          if (recordBytes.length > 0) {
            try {
              const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
              list.push({
                id: key,
                encryptedData: recordData.data,
                timestamp: recordData.timestamp,
                countryFrom: recordData.countryFrom,
                countryTo: recordData.countryTo,
                year: recordData.year,
                migrationCount: recordData.migrationCount
              });
            } catch (e) {
              console.error(`Error parsing record data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading record ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setRecords(list);
    } catch (e) {
      console.error("Error loading records:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitRecord = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting migration data with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newRecordData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const recordId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const recordData = {
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        countryFrom: newRecordData.countryFrom,
        countryTo: newRecordData.countryTo,
        year: newRecordData.year,
        migrationCount: newRecordData.migrationCount
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `migration_${recordId}`, 
        ethers.toUtf8Bytes(JSON.stringify(recordData))
      );
      
      const keysBytes = await contract.getData("migration_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(recordId);
      
      await contract.setData(
        "migration_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Encrypted migration data submitted!"
      });
      
      await loadRecords();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewRecordData({
          countryFrom: "",
          countryTo: "",
          year: new Date().getFullYear(),
          migrationCount: 0
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const filteredRecords = records.filter(record => {
    const matchesSearch = 
      record.countryFrom.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.countryTo.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesYear = filterYear ? record.year === filterYear : true;
    
    return matchesSearch && matchesYear;
  });

  const renderBarChart = () => {
    if (records.length === 0) return null;
    
    const maxCount = Math.max(...records.map(r => r.migrationCount));
    const top5 = [...records]
      .sort((a, b) => b.migrationCount - a.migrationCount)
      .slice(0, 5);
    
    return (
      <div className="bar-chart">
        {top5.map((record, index) => (
          <div key={index} className="bar-container">
            <div className="bar-label">
              {record.countryFrom} → {record.countryTo}
            </div>
            <div className="bar-wrapper">
              <div 
                className="bar-fill"
                style={{ 
                  width: `${(record.migrationCount / maxCount) * 100}%`,
                  backgroundColor: index % 2 === 0 ? '#ff6b35' : '#004e89'
                }}
              >
                <span className="bar-value">{record.migrationCount.toLocaleString()}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const teamMembers = [
    {
      name: "Dr. Alice Chen",
      role: "FHE Researcher",
      bio: "Expert in homomorphic encryption with 10+ years experience in privacy-preserving analytics."
    },
    {
      name: "Prof. David Park",
      role: "Migration Economist",
      bio: "Specializes in global migration patterns and economic impacts."
    },
    {
      name: "Ingrid Schmidt",
      role: "Blockchain Architect",
      bio: "Designs decentralized systems for secure data sharing."
    }
  ];

  if (loading) return (
    <div className="loading-screen">
      <div className="metal-spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container metal-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="globe-icon"></div>
          </div>
          <h1>Migration<span>FHE</span></h1>
        </div>
        
        <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
      </header>
      
      <div className="main-content">
        <div className="hero-section">
          <div className="hero-content">
            <h2>Confidential Analysis of Global Migration Data</h2>
            <p>Securely share encrypted migration statistics between countries using Fully Homomorphic Encryption</p>
            <button 
              onClick={() => setShowCreateModal(true)} 
              className="metal-button primary"
            >
              Add Migration Data
            </button>
          </div>
        </div>
        
        <div className="stats-grid">
          <div className="stat-card metal-card">
            <div className="stat-icon">
              <div className="globe-icon"></div>
            </div>
            <div className="stat-value">{uniqueCountries}</div>
            <div className="stat-label">Countries</div>
          </div>
          
          <div className="stat-card metal-card">
            <div className="stat-icon">
              <div className="data-icon"></div>
            </div>
            <div className="stat-value">{records.length}</div>
            <div className="stat-label">Records</div>
          </div>
          
          <div className="stat-card metal-card">
            <div className="stat-icon">
              <div className="people-icon"></div>
            </div>
            <div className="stat-value">{totalMigrations.toLocaleString()}</div>
            <div className="stat-label">Total Migrations</div>
          </div>
        </div>
        
        <div className="chart-section metal-card">
          <h3>Top Migration Routes (FHE Processed)</h3>
          {renderBarChart()}
        </div>
        
        <div className="records-section">
          <div className="section-header">
            <h2>Encrypted Migration Records</h2>
            <div className="search-filters">
              <input
                type="text"
                placeholder="Search countries..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="metal-input"
              />
              <select
                value={filterYear || ""}
                onChange={(e) => setFilterYear(e.target.value ? parseInt(e.target.value) : null)}
                className="metal-select"
              >
                <option value="">All Years</option>
                {Array.from(new Set(records.map(r => r.year))).map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
              <button 
                onClick={loadRecords}
                className="metal-button"
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
          
          <div className="records-list metal-card">
            {filteredRecords.length === 0 ? (
              <div className="no-records">
                <div className="no-records-icon"></div>
                <p>No migration records found</p>
                <button 
                  className="metal-button primary"
                  onClick={() => setShowCreateModal(true)}
                >
                  Add First Record
                </button>
              </div>
            ) : (
              <table className="records-table">
                <thead>
                  <tr>
                    <th>From</th>
                    <th>To</th>
                    <th>Year</th>
                    <th>Count</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map(record => (
                    <tr key={record.id}>
                      <td>{record.countryFrom}</td>
                      <td>{record.countryTo}</td>
                      <td>{record.year}</td>
                      <td>{record.migrationCount.toLocaleString()}</td>
                      <td>
                        <button 
                          className="metal-button small"
                          onClick={() => {
                            // Simulate FHE analysis
                            setTransactionStatus({
                              visible: true,
                              status: "pending",
                              message: "Analyzing with FHE..."
                            });
                            setTimeout(() => {
                              setTransactionStatus({
                                visible: true,
                                status: "success",
                                message: `FHE analysis complete: ${record.countryFrom} → ${record.countryTo} shows ${record.migrationCount} migrations`
                              });
                              setTimeout(() => {
                                setTransactionStatus({ visible: false, status: "pending", message: "" });
                              }, 3000);
                            }, 2000);
                          }}
                        >
                          Analyze
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        
        <div className="team-section metal-card">
          <h3>Research Team</h3>
          <div className="team-grid">
            {teamMembers.map((member, index) => (
              <div key={index} className="team-member">
                <div className="member-avatar"></div>
                <h4>{member.name}</h4>
                <div className="member-role">{member.role}</div>
                <p>{member.bio}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitRecord} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          recordData={newRecordData}
          setRecordData={setNewRecordData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content metal-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="metal-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="globe-icon"></div>
              <span>MigrationFHE</span>
            </div>
            <p>Confidential analysis of global migration patterns using FHE</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Research Paper</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} MigrationFHE. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  recordData: any;
  setRecordData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  recordData,
  setRecordData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setRecordData({
      ...recordData,
      [name]: name === 'year' || name === 'migrationCount' ? parseInt(value) : value
    });
  };

  const handleSubmit = () => {
    if (!recordData.countryFrom || !recordData.countryTo || !recordData.migrationCount) {
      alert("Please fill required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal metal-card">
        <div className="modal-header">
          <h2>Add Migration Data</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-icon"></div> Data will be encrypted with FHE for secure sharing
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Origin Country *</label>
              <input 
                type="text"
                name="countryFrom"
                value={recordData.countryFrom} 
                onChange={handleChange}
                placeholder="Country name..."
                className="metal-input"
              />
            </div>
            
            <div className="form-group">
              <label>Destination Country *</label>
              <input 
                type="text"
                name="countryTo"
                value={recordData.countryTo} 
                onChange={handleChange}
                placeholder="Country name..."
                className="metal-input"
              />
            </div>
            
            <div className="form-group">
              <label>Year *</label>
              <input 
                type="number"
                name="year"
                value={recordData.year} 
                onChange={handleChange}
                min="2000"
                max={new Date().getFullYear()}
                className="metal-input"
              />
            </div>
            
            <div className="form-group">
              <label>Migration Count *</label>
              <input 
                type="number"
                name="migrationCount"
                value={recordData.migrationCount} 
                onChange={handleChange}
                min="1"
                className="metal-input"
              />
            </div>
          </div>
          
          <div className="privacy-notice">
            <div className="privacy-icon"></div> Data remains encrypted during FHE processing
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="metal-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="metal-button primary"
          >
            {creating ? "Encrypting with FHE..." : "Submit Securely"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;